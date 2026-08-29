import { readFile, unlink } from 'node:fs/promises'
import { withCacheFileLock, writeJsonAtomic } from './write-json-atomic.js'
import {
  decideFreshness,
  enrichSpecHash,
  readSpecStamp,
  timestampFallback,
} from './spec-stamp-source.js'
import { dirname, isAbsolute, join } from 'node:path'
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
  private _loadPromise: Promise<void> | null = null
  private _header: SpecDepsSuggestionCacheHeader | null = null
  private _isDirty = false
  private _generation = 0
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
      const raw = isAbsolute(configPath) ? configPath : join(optionsOrProjectDir, configPath)
      const baseDir = raw.endsWith('.yaml') || raw.endsWith('.yml') || raw.endsWith('.json') ? dirname(raw) : raw
      this.cachePath = join(baseDir, 'tmp', 'fs-cache', 'spec-deps-suggestions', 'suggestions.json')
    } else {
      super(optionsOrProjectDir)
      this.projectDir = optionsOrProjectDir.projectDir
      const effectiveConfig = optionsOrProjectDir.configPath ?? '.specd'
      const raw = isAbsolute(effectiveConfig)
        ? effectiveConfig
        : join(optionsOrProjectDir.projectDir, effectiveConfig)
      const baseDir = raw.endsWith('.yaml') || raw.endsWith('.yml') || raw.endsWith('.json') ? dirname(raw) : raw
      this.cachePath = join(baseDir, 'tmp', 'fs-cache', 'spec-deps-suggestions', 'suggestions.json')
    }
  }

  /**
   * Lazily loads and parses the cache file from disk into memory once.
   *
   * Concurrent callers share a single in-flight load. The in-flight promise is
   * checked and awaited BEFORE the `_data` guard because `loadFromDisk`
   * initializes `_data` synchronously; callers arriving mid-load must not
   * observe the empty map.
   */
  private async ensureLoaded(): Promise<void> {
    if (this._loadPromise) {
      await this._loadPromise
      return
    }
    if (this._data !== null) {
      return
    }
    this._loadPromise = this.loadFromDisk().finally(() => {
      this._loadPromise = null
    })
    await this._loadPromise
  }

  /**
   * Reads and parses the cache file into memory.
   */
  private async loadFromDisk(): Promise<void> {
    // Generation token: invalidate() bumps it so a load that completes after
    // invalidation discards its results instead of repopulating stale entries.
    const generation = this._generation
    this._data = new Map()
    this._header = null
    this._isDirty = false

    try {
      const content = await readFile(this.cachePath, 'utf-8')
      const parsed = JSON.parse(content) as SpecDepsSuggestionsCacheFile
      if (generation !== this._generation) {
        return
      }
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
      const currentStamp: ImplementationSuggestionSpecStamp = {
        ...(await readSpecStamp(this.deps, specId)),
      }
      const cachedStamp = cached.specStamp
      if (cachedStamp) {
        let decision = decideFreshness(cachedStamp, currentStamp)
        if (decision === 'needs-hash') {
          await enrichSpecHash(this.deps, specId, currentStamp)
          decision = decideFreshness(cachedStamp, currentStamp)
        }
        if (decision === 'needs-hash') {
          decision = timestampFallback(cachedStamp, currentStamp)
        }
        if (decision === 'stale') {
          return null
        }
      }
    }

    return cached
  }

  /** @inheritdoc */
  async set(specId: string, input: SetSpecDepsSuggestionInput): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()
    const currentStamp: ImplementationSuggestionSpecStamp = {
      ...(await readSpecStamp(this.deps, specId)),
    }
    // Persist the authoritative identity so future reads can run stage-2 hash
    // comparisons without re-fetching: real SHA-256 + stat-backed size.
    await enrichSpecHash(this.deps, specId, currentStamp)

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

    await withCacheFileLock(`${this.cachePath}.lock`, async () => {
      let specsRecord: Record<string, SpecDepsSuggestionSpecEntry> = {}
      try {
        const diskContent = await readFile(this.cachePath, 'utf-8')
        const diskParsed = JSON.parse(diskContent) as SpecDepsSuggestionsCacheFile
        if (
          diskParsed &&
          diskParsed.header &&
          diskParsed.header.cacheVersion === SPEC_DEPS_CACHE_VERSION &&
          typeof diskParsed.specs === 'object'
        ) {
          specsRecord = { ...diskParsed.specs }
        }
      } catch {
        // Disk file missing or unparseable - start fresh
      }

      for (const [specId, entry] of this._data!.entries()) {
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

      await writeJsonAtomic(this.cachePath, JSON.stringify(filePayload, null, 2))
    })
    this._isDirty = false
  }

  /** @inheritdoc */
  override async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return await withCacheFileLock(`${this.cachePath}.lock`, async () => {
      this._generation += 1
      this._data = null
      this._header = null
      this._isDirty = false
      await this.ensureLoaded()
      return await fn()
    })
  }

  /** @inheritdoc */
  async invalidate(): Promise<void> {
    this._generation += 1
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
