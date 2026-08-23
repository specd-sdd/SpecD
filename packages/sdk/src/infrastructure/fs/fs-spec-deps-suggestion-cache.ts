import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { SpecPath } from '@specd/core'
import {
  SpecDepsSuggestionCachePort,
  type SpecDepsSuggestionCachePortDeps,
  type SetSpecDepsSuggestionInput,
} from '../../application/ports/spec-deps-suggestion-cache-port.js'
import {
  type SpecDepsSuggestionCacheHeader,
  type SpecDepsSuggestionSpecEntry,
  type SpecDepsSuggestionsCacheFile,
  SPEC_DEPS_CACHE_VERSION,
} from '../../domain/value-objects/spec-deps-suggestion-cache.js'
import { type ImplementationSuggestionSpecStamp } from '../../domain/value-objects/implementation-suggestion-cache.js'

/** Options for configuring {@link FsSpecDepsSuggestionCache}. */
export interface FsSpecDepsSuggestionCacheOptions extends SpecDepsSuggestionCachePortDeps {
  readonly projectDir: string
  readonly configPath?: string | undefined
}

/**
 * Filesystem adapter for {@link SpecDepsSuggestionCachePort}.
 *
 * Encapsulates self-validation (checking graph health & spec stamps), lazy single-pass loading,
 * dirty tracking, and atomic persistence.
 */
export class FsSpecDepsSuggestionCache extends SpecDepsSuggestionCachePort {
  private readonly cachePath: string
  private readonly projectDir: string
  private _data: Map<string, SpecDepsSuggestionSpecEntry> | null = null
  private _header: SpecDepsSuggestionCacheHeader | null = null
  private _isDirty = false
  private _cachedGraphFingerprint: string | null = null
  private _cachedGraphLastIndexedAt: string | null = null

  /**
   * Creates a filesystem-backed spec dependencies suggestion cache.
   *
   * @param optionsOrProjectDir - Options object or project root directory path
   * @param configPath - Project configuration directory path (default: '.specd')
   */
  constructor(
    optionsOrProjectDir: FsSpecDepsSuggestionCacheOptions | string,
    configPath: string = '.specd',
  ) {
    if (typeof optionsOrProjectDir === 'string') {
      super({})
      this.projectDir = optionsOrProjectDir
      const baseDir = isAbsolute(configPath) ? configPath : join(optionsOrProjectDir, configPath)
      this.cachePath = join(baseDir, 'tmp', 'fs-cache', 'spec-deps-suggestions', 'suggestions.json')
    } else {
      super(optionsOrProjectDir)
      this.projectDir = optionsOrProjectDir.projectDir
      const effectiveConfig = optionsOrProjectDir.configPath ?? '.specd'
      const baseDir = isAbsolute(effectiveConfig)
        ? effectiveConfig
        : join(optionsOrProjectDir.projectDir, effectiveConfig)
      this.cachePath = join(baseDir, 'tmp', 'fs-cache', 'spec-deps-suggestions', 'suggestions.json')
    }
  }

  /**
   * Lazily loads and parses the cache file from disk into memory once.
   */
  private async ensureLoaded(): Promise<void> {
    if (this._data !== null) {
      return
    }

    this._data = new Map()
    this._header = null
    this._isDirty = false

    try {
      const content = await readFile(this.cachePath, 'utf-8')
      const parsed = JSON.parse(content) as SpecDepsSuggestionsCacheFile
      if (
        parsed &&
        parsed.header &&
        parsed.header.cacheVersion === SPEC_DEPS_CACHE_VERSION &&
        typeof parsed.specs === 'object'
      ) {
        this._header = parsed.header
        for (const [specId, entry] of Object.entries(parsed.specs)) {
          if (entry && typeof entry === 'object') {
            this._data.set(specId, entry)
          }
        }
      }
    } catch {
      // Missing or invalid: start fresh
    }
  }

  /**
   * Lazily computes and caches graph fingerprint and last indexed date for the session.
   *
   * @returns Computed fingerprint and timestamp
   */
  private async getGraphFingerprint(): Promise<{ fingerprint: string; lastIndexedAt: string }> {
    if (this._cachedGraphFingerprint !== null) {
      return {
        fingerprint: this._cachedGraphFingerprint,
        lastIndexedAt: this._cachedGraphLastIndexedAt ?? '',
      }
    }

    if (this.deps.codeGraphProvider) {
      try {
        const health = await this.deps.codeGraphProvider.getGraphHealth()
        this._cachedGraphFingerprint = health?.currentRef ?? 'default'
        this._cachedGraphLastIndexedAt =
          typeof (health as unknown as Record<string, unknown>)?.freshness === 'string'
            ? String((health as unknown as Record<string, unknown>).freshness)
            : new Date().toISOString()
      } catch {
        this._cachedGraphFingerprint = 'default'
        this._cachedGraphLastIndexedAt = new Date().toISOString()
      }
    } else {
      this._cachedGraphFingerprint = 'default'
      this._cachedGraphLastIndexedAt = new Date().toISOString()
    }

    return {
      fingerprint: this._cachedGraphFingerprint,
      lastIndexedAt: this._cachedGraphLastIndexedAt,
    }
  }

  /**
   * Reads current spec file stamp from injected repository.
   *
   * @param specId - Target canonical spec identifier
   * @returns Current spec stamp or empty stamp if not found
   */
  private async getSpecStamp(specId: string): Promise<ImplementationSuggestionSpecStamp> {
    const colonIdx = specId.indexOf(':')
    const workspace = colonIdx >= 0 ? specId.substring(0, colonIdx) : ''
    const rawPath = colonIdx >= 0 ? specId.substring(colonIdx + 1) : specId

    const repo = this.deps.specRepositories?.get(workspace)
    if (!repo) {
      return { lastModified: '', hash: '', artifacts: [] }
    }

    try {
      const specData = await repo.get(SpecPath.parse(rawPath))
      const artifactsMeta =
        (specData as unknown as { artifacts?: Array<Record<string, unknown>> })?.artifacts ?? []
      const mainArtifact = artifactsMeta.find((a) => a.filename === 'spec.md')
      const specRecord = specData as unknown as Record<string, unknown>
      const lastModified =
        typeof mainArtifact?.lastModified === 'string'
          ? mainArtifact.lastModified
          : typeof specRecord?.lastModified === 'string'
            ? specRecord.lastModified
            : ''
      const hash = typeof mainArtifact?.hash === 'string' ? mainArtifact.hash : ''

      return {
        lastModified,
        hash,
        artifacts: artifactsMeta.map((a) => ({
          filename: typeof a.filename === 'string' ? a.filename : '',
          lastModified: typeof a.lastModified === 'string' ? a.lastModified : '',
          hash: typeof a.hash === 'string' ? a.hash : '',
        })),
      }
    } catch {
      return { lastModified: '', hash: '', artifacts: [] }
    }
  }

  /** @inheritdoc */
  async get(specId: string): Promise<SpecDepsSuggestionSpecEntry | null> {
    await this.ensureLoaded()
    const cached = this._data?.get(specId)
    if (!cached) {
      return null
    }

    // 1. Validate graph freshness if codeGraphProvider is available
    if (this.deps.codeGraphProvider && this._header?.graphFingerprint) {
      const { fingerprint } = await this.getGraphFingerprint()
      if (this._header.graphFingerprint !== fingerprint) {
        return null // Graph changed -> cache stale
      }
    }

    // 2. Validate spec freshness if specRepositories are available
    if (this.deps.specRepositories) {
      const currentStamp = await this.getSpecStamp(specId)
      const cachedStamp = cached.specStamp
      if (cachedStamp) {
        if (
          cachedStamp.lastModified &&
          currentStamp.lastModified &&
          cachedStamp.lastModified === currentStamp.lastModified
        ) {
          return cached
        }
        if (
          cachedStamp.hash &&
          currentStamp.hash &&
          cachedStamp.hash.length > 0 &&
          cachedStamp.hash === currentStamp.hash
        ) {
          return cached
        }
        if (currentStamp.lastModified || currentStamp.hash) {
          return null // Spec exists and stamp differs -> stale
        }
      }
    }

    return cached
  }

  /** @inheritdoc */
  async set(specId: string, input: SetSpecDepsSuggestionInput): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()
    const currentStamp = await this.getSpecStamp(specId)

    this._header = {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: SPEC_DEPS_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    const entry: SpecDepsSuggestionSpecEntry = {
      specId,
      title: input.title ?? this._data?.get(specId)?.title ?? specId,
      specStamp: currentStamp,
      existingDependsOn:
        input.existingDependsOn ?? this._data?.get(specId)?.existingDependsOn ?? [],
      suggestedDependsOn: input.suggestedDependsOn,
    }

    this._data?.set(specId, entry)
    this._isDirty = true
  }

  /** @inheritdoc */
  async setMany(entries: readonly SpecDepsSuggestionSpecEntry[]): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()

    this._header = {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: SPEC_DEPS_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    for (const entry of entries) {
      this._data?.set(entry.specId, entry)
    }
    this._isDirty = true
  }

  /** @inheritdoc */
  async getAll(): Promise<ReadonlyMap<string, SpecDepsSuggestionSpecEntry>> {
    await this.ensureLoaded()
    return this._data ?? new Map()
  }

  /** @inheritdoc */
  async flush(): Promise<void> {
    if (!this._isDirty || !this._data) {
      return
    }

    const specsRecord: Record<string, SpecDepsSuggestionSpecEntry> = {}
    for (const [specId, entry] of this._data.entries()) {
      specsRecord[specId] = entry
    }

    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()

    const header: SpecDepsSuggestionCacheHeader = this._header ?? {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: SPEC_DEPS_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    const filePayload: SpecDepsSuggestionsCacheFile = {
      header: {
        ...header,
        updatedAt: new Date().toISOString(),
      },
      specs: specsRecord,
    }

    await mkdir(dirname(this.cachePath), { recursive: true })
    const tempPath = `${this.cachePath}.${process.pid}.tmp`
    await writeFile(tempPath, JSON.stringify(filePayload, null, 2), 'utf-8')
    await rename(tempPath, this.cachePath)
    this._isDirty = false
  }

  /** @inheritdoc */
  async invalidate(): Promise<void> {
    this._data = new Map()
    this._header = null
    this._isDirty = false
    try {
      await unlink(this.cachePath)
    } catch {
      // Ignore if missing
    }
  }
}
