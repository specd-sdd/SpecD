import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  type Spec,
  type SpecArtifactEntry,
  type SpecSidecarStamp,
} from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import {
  ValidationResultCache,
  type SpecValidationEntry,
  type ValidationCacheLookupResult,
} from '../../application/ports/validation-result-cache.js'
import { computeCacheFingerprint } from '../../application/use-cases/_shared/validate-specs-cache-fingerprints.js'
import { isEnoent } from './is-enoent.js'
import { ensureTmpGitignore } from './ensure-tmp-gitignore.js'
import { writeFileAtomic } from './write-atomic.js'
import { sha256 } from './hash.js'
import { type IndexMeta } from './fs-index-cache-base.js'

const INDEX_FILE = '.specd-index.jsonl'
const META_FILE = '.specd-index-meta.json'

/** Validate-specs bucket meta extending shared list-index fields. */
export interface ValidationIndexMeta extends IndexMeta {
  readonly schemaFingerprint: string
  readonly engineVersion: number
}

/** Stored stamp bundle derived from {@link Spec}. */
export interface ValidationStoredStamps {
  readonly artifacts: readonly SpecArtifactEntry[]
  readonly persistedStateStamp: SpecSidecarStamp
  readonly generatedMetadataStamp: SpecSidecarStamp
}

/** One JSONL wire line for a validate-specs cache row. */
export interface ValidationWireLine {
  readonly entry: SpecValidationEntry
  readonly stamps: ValidationStoredStamps
  readonly cacheFingerprint: string
}

/** Options for {@link FsValidationResultCache}. */
export interface FsValidationResultCacheOptions {
  readonly specRepository: SpecRepository
  readonly configPath: string
  readonly metadataPath: string
}

/**
 * Filesystem adapter for {@link ValidationResultCache}.
 *
 * Persists rows under `{configPath}/tmp/fs-cache/validate-specs/<workspace>/`.
 */
export class FsValidationResultCache extends ValidationResultCache {
  private readonly _bucketDir: string
  private readonly _configPath: string
  private readonly _metadataPath: string
  private _mutexTail: Promise<void> = Promise.resolve()
  private _tmpGitignoreEnsured = false

  /**
   * Creates a validate-specs result cache for one workspace bucket.
   *
   * @param options - Injected repository, config path, and metadata root
   */
  constructor(options: FsValidationResultCacheOptions) {
    super(options.specRepository)
    this._configPath = options.configPath
    this._metadataPath = options.metadataPath
    this._bucketDir = path.join(
      options.configPath,
      'tmp',
      'fs-cache',
      'validate-specs',
      options.specRepository.workspace(),
    )
  }

  /** @inheritdoc */
  workspace(): string {
    return this.specRepository.workspace()
  }

  /** @inheritdoc */
  async lookup(input: {
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<ValidationCacheLookupResult> {
    const meta = await this._readMeta()
    if (
      meta.isInvalidated ||
      meta.schemaFingerprint !== input.schemaFingerprint ||
      meta.engineVersion !== input.engineVersion
    ) {
      return { kind: 'miss' }
    }

    const specId = `${input.spec.workspace}:${input.spec.name.toFsPath('/')}`
    const lines = await this._readLines()
    const row = lines.find((line) => line.entry.spec === specId)
    if (row === undefined) {
      return { kind: 'miss' }
    }

    const currentStamps = stampsFromSpec(input.spec)
    if (stampsDeepEqual(row.stamps, currentStamps)) {
      return { kind: 'hit', entry: row.entry }
    }

    const cacheFingerprint = await this._computeCacheFingerprint(input.spec)
    if (row.cacheFingerprint === cacheFingerprint) {
      await this._refreshStamps(row.entry, currentStamps, cacheFingerprint, input)
      return { kind: 'hit', entry: row.entry }
    }

    return { kind: 'miss' }
  }

  /** @inheritdoc */
  async upsert(input: {
    readonly entry: SpecValidationEntry
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<void> {
    await this._ensureTmpGitignore()
    const cacheFingerprint = await this._computeCacheFingerprint(input.spec)
    const stamps = stampsFromSpec(input.spec)

    await this.mutate(async () => {
      const lines = await this._readLines()
      const idx = lines.findIndex((line) => line.entry.spec === input.entry.spec)
      const newLine: ValidationWireLine = {
        entry: input.entry,
        stamps,
        cacheFingerprint,
      }
      let nextLines: ValidationWireLine[]
      let totalCount: number
      const meta = await this._readMeta()
      if (idx >= 0) {
        nextLines = [...lines]
        nextLines[idx] = newLine
        totalCount = meta.totalCount
      } else {
        nextLines = [...lines, newLine]
        totalCount = meta.totalCount + 1
      }

      await this._publishBoth(nextLines, {
        totalCount,
        generatedAt: new Date().toISOString(),
        isInvalidated: false,
        schemaFingerprint: input.schemaFingerprint,
        engineVersion: input.engineVersion,
      })
    })
  }

  /**
   * Serializes mutating operations for this bucket.
   *
   * @param fn - Mutation callback
   * @returns The callback result
   */
  async mutate<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._mutexTail.then(fn)
    this._mutexTail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Refreshes stored stamps on a soft hit without changing entry or fingerprint.
   *
   * @param entry - Cached validation entry
   * @param stamps - Current stamps from the spec
   * @param cacheFingerprint - Unchanged cache fingerprint
   * @param input - Lookup validity inputs
   * @param input.schemaFingerprint - Active schema validation surface fingerprint
   * @param input.engineVersion - Active validate-specs engine version
   */
  private async _refreshStamps(
    entry: SpecValidationEntry,
    stamps: ValidationStoredStamps,
    cacheFingerprint: string,
    input: { readonly schemaFingerprint: string; readonly engineVersion: number },
  ): Promise<void> {
    await this.mutate(async () => {
      const lines = await this._readLines()
      const idx = lines.findIndex((line) => line.entry.spec === entry.spec)
      if (idx < 0) return
      const nextLines = [...lines]
      nextLines[idx] = { entry, stamps, cacheFingerprint }
      const meta = await this._readMeta()
      await this._publishBoth(nextLines, {
        ...meta,
        schemaFingerprint: input.schemaFingerprint,
        engineVersion: input.engineVersion,
        isInvalidated: false,
      })
    })
  }

  /**
   * Computes the two-layer cache fingerprint for one spec.
   *
   * @param spec - Spec under validation
   * @returns Cache fingerprint digest
   */
  private async _computeCacheFingerprint(spec: Spec): Promise<string> {
    const specFingerprint = await this.specRepository.specFingerprint(spec)
    const metadataBytes = await this._readRawMetadataBytes(spec.name)
    const metadataContentHash = metadataBytes === null ? null : sha256(metadataBytes)
    return computeCacheFingerprint({ specFingerprint, metadataContentHash }, (content) =>
      sha256(content),
    )
  }

  /**
   * Reads raw generated metadata bytes for one spec.
   *
   * @param name - Spec path within the workspace
   * @returns Raw UTF-8 file content, or `null` when absent
   */
  private async _readRawMetadataBytes(name: SpecPath): Promise<string | null> {
    const metadataFile = this._metadataFilePath(name)
    try {
      return await fs.readFile(metadataFile, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Returns the absolute metadata sidecar path for one spec.
   *
   * @param name - Spec path within the workspace
   * @returns Absolute metadata file path
   */
  private _metadataFilePath(name: SpecPath): string {
    return path.join(
      this._metadataPath,
      this.specRepository.workspace(),
      name.toFsPath(path.sep),
      'metadata.json',
    )
  }

  /** Ensures tmp gitignore hygiene before first cache write. */
  private async _ensureTmpGitignore(): Promise<void> {
    if (this._tmpGitignoreEnsured) return
    await ensureTmpGitignore(this._configPath)
    this._tmpGitignoreEnsured = true
  }

  /**
   * Reads and parses all JSONL rows from the bucket index file.
   *
   * @returns Parsed wire lines, or an empty array when the index file is absent
   */
  private async _readLines(): Promise<ValidationWireLine[]> {
    let content: string
    try {
      content = await fs.readFile(this._indexPath(), 'utf8')
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const lines: ValidationWireLine[] = []
    for (const raw of content.split('\n')) {
      if (raw.trim().length === 0) continue
      try {
        const parsed = JSON.parse(raw) as Partial<ValidationWireLine>
        if (
          parsed.entry === undefined ||
          parsed.stamps === undefined ||
          typeof parsed.cacheFingerprint !== 'string' ||
          !Array.isArray(parsed.stamps.artifacts) ||
          parsed.stamps.persistedStateStamp === undefined ||
          parsed.stamps.generatedMetadataStamp === undefined
        ) {
          continue
        }
        lines.push({
          entry: parsed.entry,
          stamps: parsed.stamps,
          cacheFingerprint: parsed.cacheFingerprint,
        })
      } catch {
        continue
      }
    }
    return lines
  }

  /**
   * Reads validate-bucket meta, falling back to an invalidated default.
   *
   * @returns Parsed bucket metadata
   */
  private async _readMeta(): Promise<ValidationIndexMeta> {
    try {
      const content = await fs.readFile(this._metaPath(), 'utf8')
      const parsed = JSON.parse(content) as Partial<ValidationIndexMeta>
      return {
        totalCount: typeof parsed.totalCount === 'number' ? parsed.totalCount : 0,
        generatedAt:
          typeof parsed.generatedAt === 'string' ? parsed.generatedAt : new Date(0).toISOString(),
        isInvalidated: parsed.isInvalidated !== false,
        schemaFingerprint:
          typeof parsed.schemaFingerprint === 'string' ? parsed.schemaFingerprint : '',
        engineVersion: typeof parsed.engineVersion === 'number' ? parsed.engineVersion : -1,
      }
    } catch {
      return {
        totalCount: 0,
        generatedAt: new Date(0).toISOString(),
        isInvalidated: true,
        schemaFingerprint: '',
        engineVersion: -1,
      }
    }
  }

  /**
   * Atomically publishes JSONL rows and extended meta for this bucket.
   *
   * @param lines - Wire lines to persist
   * @param meta - Extended bucket metadata
   */
  private async _publishBoth(
    lines: ValidationWireLine[],
    meta: ValidationIndexMeta,
  ): Promise<void> {
    await fs.mkdir(this._bucketDir, { recursive: true })
    const content =
      lines.length > 0
        ? lines
            .map((line) =>
              JSON.stringify({
                entry: line.entry,
                stamps: line.stamps,
                cacheFingerprint: line.cacheFingerprint,
              }),
            )
            .join('\n') + '\n'
        : ''
    await writeFileAtomic(this._indexPath(), content)
    await writeFileAtomic(this._metaPath(), JSON.stringify(meta, null, 2) + '\n')
  }

  /**
   * Returns the absolute path to `.specd-index.jsonl`.
   *
   * @returns Absolute index file path
   */
  private _indexPath(): string {
    return path.join(this._bucketDir, INDEX_FILE)
  }

  /**
   * Returns the absolute path to `.specd-index-meta.json`.
   *
   * @returns Absolute meta file path
   */
  private _metaPath(): string {
    return path.join(this._bucketDir, META_FILE)
  }
}

/**
 * Extracts the stamp bundle stored on cache rows from a {@link Spec}.
 *
 * @param spec - Spec entity returned by {@link SpecRepository.get}
 * @returns Stamp bundle for wire storage
 */
export function stampsFromSpec(spec: Spec): ValidationStoredStamps {
  return {
    artifacts: [...spec.artifacts],
    persistedStateStamp: spec.persistedStateStamp,
    generatedMetadataStamp: spec.generatedMetadataStamp,
  }
}

/**
 * Compares two stored stamp bundles for deep equality.
 *
 * @param a - First stamp bundle
 * @param b - Second stamp bundle
 * @returns Whether both bundles are equivalent
 */
function stampsDeepEqual(a: ValidationStoredStamps, b: ValidationStoredStamps): boolean {
  if (a.persistedStateStamp.present !== b.persistedStateStamp.present) return false
  if (a.persistedStateStamp.lastModified !== b.persistedStateStamp.lastModified) return false
  if (a.generatedMetadataStamp.present !== b.generatedMetadataStamp.present) return false
  if (a.generatedMetadataStamp.lastModified !== b.generatedMetadataStamp.lastModified) return false
  if (a.artifacts.length !== b.artifacts.length) return false

  const sortedA = [...a.artifacts].sort((x, y) => x.filename.localeCompare(y.filename))
  const sortedB = [...b.artifacts].sort((x, y) => x.filename.localeCompare(y.filename))
  return sortedA.every(
    (entry, index) =>
      entry.filename === sortedB[index]?.filename &&
      entry.lastModified === sortedB[index]?.lastModified,
  )
}
