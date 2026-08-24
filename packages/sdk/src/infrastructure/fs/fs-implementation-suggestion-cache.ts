import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { SpecPath } from '@specd/core'
import {
  ImplementationSuggestionCachePort,
  type ImplementationSuggestionCachePortDeps,
  type SetImplementationSuggestionInput,
} from '../../application/ports/implementation-suggestion-cache-port.js'
import {
  type ImplementationSuggestionCacheHeader,
  type ImplementationSuggestionSpecEntry,
  type ImplementationSuggestionSpecStamp,
  type ImplementationSuggestionsCacheFile,
  IMPLEMENTATION_SUGGESTION_CACHE_VERSION,
} from '../../domain/value-objects/implementation-suggestion-cache.js'

/** Maximum spec fan-in threshold before a file is considered an ambiguous shared hub. */
const SHARED_HUB_SPEC_THRESHOLD = 3

/** Options for configuring {@link FsImplementationSuggestionCache}. */
export interface FsImplementationSuggestionCacheOptions extends ImplementationSuggestionCachePortDeps {
  readonly projectDir: string
  readonly configPath?: string | undefined
}

/**
 * Filesystem adapter for {@link ImplementationSuggestionCachePort}.
 *
 * Encapsulates self-validation (checking graph health & spec stamps), lazy single-pass loading,
 * bidirectionally indexed reverse lookups (`code -> spec` and `spec -> code`), dirty tracking,
 * and atomic persistence.
 */
export class FsImplementationSuggestionCache extends ImplementationSuggestionCachePort {
  private readonly cachePath: string
  private readonly projectDir: string
  private _data: Map<string, ImplementationSuggestionSpecEntry> | null = null
  private _loadPromise: Promise<void> | null = null
  private _header: ImplementationSuggestionCacheHeader | null = null
  private _fileToSpecMap: Map<string, string> | null = null
  private _isDirty = false
  private _cachedGraphFingerprint: string | null = null
  private _cachedGraphLastIndexedAt: string | null = null

  /**
   * Creates a filesystem-backed implementation suggestion cache.
   *
   * @param optionsOrProjectDir - Options object or project root directory path
   * @param configPath - Project configuration directory path (default: '.specd')
   */
  constructor(
    optionsOrProjectDir: FsImplementationSuggestionCacheOptions | string,
    configPath: string = '.specd',
  ) {
    if (typeof optionsOrProjectDir === 'string') {
      super({})
      this.projectDir = optionsOrProjectDir
      const baseDir = isAbsolute(configPath) ? configPath : join(optionsOrProjectDir, configPath)
      this.cachePath = join(
        baseDir,
        'tmp',
        'fs-cache',
        'implementation-suggestions',
        'suggestions.json',
      )
    } else {
      super(optionsOrProjectDir)
      this.projectDir = optionsOrProjectDir.projectDir
      const effectiveConfig = optionsOrProjectDir.configPath ?? '.specd'
      const baseDir = isAbsolute(effectiveConfig)
        ? effectiveConfig
        : join(optionsOrProjectDir.projectDir, effectiveConfig)
      this.cachePath = join(
        baseDir,
        'tmp',
        'fs-cache',
        'implementation-suggestions',
        'suggestions.json',
      )
    }
  }

  /**
   * Lazily loads and parses the cache file from disk into memory once.
   *
   * Concurrent callers share a single in-flight load so none of them can
   * observe or overwrite state while initialization is still running.
   */
  private async ensureLoaded(): Promise<void> {
    if (this._data !== null) {
      return
    }
    this._loadPromise ??= this.loadFromDisk()
    await this._loadPromise
  }

  /**
   * Reads and parses the cache file into memory.
   */
  private async loadFromDisk(): Promise<void> {
    this._data = new Map()
    this._header = null
    this._fileToSpecMap = null
    this._isDirty = false

    try {
      const content = await readFile(this.cachePath, 'utf-8')
      const parsed = JSON.parse(content) as ImplementationSuggestionsCacheFile
      if (
        parsed &&
        parsed.header &&
        parsed.header.cacheVersion === IMPLEMENTATION_SUGGESTION_CACHE_VERSION &&
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
      // File missing or corrupted: start fresh
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
      let hash = typeof mainArtifact?.hash === 'string' ? mainArtifact.hash : ''
      if (specData && typeof repo.artifactMeta === 'function') {
        // `repo.get()` never includes artifact hashes; fetch the real SHA-256 explicitly.
        const meta = await repo.artifactMeta(specData, 'spec.md', { includeHash: true })
        if (typeof meta?.hash === 'string' && meta.hash.length > 0) {
          hash = meta.hash
        }
      }

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
  async get(specId: string): Promise<ImplementationSuggestionSpecEntry | null> {
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
  async set(specId: string, input: SetImplementationSuggestionInput): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()
    const currentStamp = await this.getSpecStamp(specId)
    const specStamp: ImplementationSuggestionSpecStamp =
      input.specContentHash && input.specContentHash.length > 0
        ? { ...currentStamp, hash: input.specContentHash }
        : currentStamp

    this._header = {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: IMPLEMENTATION_SUGGESTION_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    const entry: ImplementationSuggestionSpecEntry = {
      specId,
      title: input.title ?? this._data?.get(specId)?.title ?? specId,
      specStamp,
      existing: input.existing ??
        this._data?.get(specId)?.existing ?? { files: [], symbols: [], dependsOn: [] },
      suggestions: input.suggestions,
    }

    this._data?.set(specId, entry)
    this._fileToSpecMap = null
    this._isDirty = true
  }

  /** @inheritdoc */
  async setMany(entries: readonly ImplementationSuggestionSpecEntry[]): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()

    this._header = {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: IMPLEMENTATION_SUGGESTION_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    for (const entry of entries) {
      this._data?.set(entry.specId, entry)
    }
    this._fileToSpecMap = null
    this._isDirty = true
  }

  /** @inheritdoc */
  async getAll(): Promise<ReadonlyMap<string, ImplementationSuggestionSpecEntry>> {
    await this.ensureLoaded()
    return this._data ?? new Map()
  }

  /** @inheritdoc */
  async getFileToSpecMap(): Promise<ReadonlyMap<string, string>> {
    await this.ensureLoaded()
    if (this._fileToSpecMap !== null) {
      return this._fileToSpecMap
    }

    /**
     * Candidate spec match for a file key, with ownership and score.
     */
    interface CandidateSpecMatch {
      specId: string
      isExisting: boolean
      score: number
    }

    const fileToCandidates = new Map<string, Map<string, CandidateSpecMatch>>()

    const registerCandidate = (
      fileKey: string,
      specId: string,
      isExisting: boolean,
      score: number,
    ): void => {
      if (!fileKey) return
      const keysToRegister = new Set<string>()
      keysToRegister.add(fileKey)

      const rawPath = fileKey.replace(/^[^:]+:/, '')
      keysToRegister.add(rawPath)

      const shortRelPath = rawPath.replace(/^(?:packages|apps)\/[^/]+\//, '')
      keysToRegister.add(shortRelPath)

      for (const k of keysToRegister) {
        let candidateMap = fileToCandidates.get(k)
        if (!candidateMap) {
          candidateMap = new Map()
          fileToCandidates.set(k, candidateMap)
        }
        const existingCandidate = candidateMap.get(specId)
        if (!existingCandidate || isExisting || score > existingCandidate.score) {
          candidateMap.set(specId, {
            specId,
            isExisting: isExisting || (existingCandidate?.isExisting ?? false),
            score: isExisting ? 9999 : Math.max(score, existingCandidate?.score ?? 0),
          })
        }
      }
    }

    for (const [specId, entry] of this._data?.entries() ?? []) {
      for (const f of entry.existing?.files ?? []) {
        registerCandidate(f, specId, true, 9999)
      }
      for (const s of entry.suggestions ?? []) {
        if (s.confidence === 'HIGH') {
          registerCandidate(s.file, specId, false, s.score ?? 150)
        }
      }
    }

    const result = new Map<string, string>()
    for (const [fileKey, candidateMap] of fileToCandidates.entries()) {
      if (candidateMap.size === 1) {
        result.set(fileKey, Array.from(candidateMap.keys())[0]!)
      } else if (candidateMap.size > 1) {
        const existingCandidates = Array.from(candidateMap.values()).filter((c) => c.isExisting)
        if (existingCandidates.length === 1) {
          // A unique spec-lock owner is authoritative even when extra high-confidence
          // suggestions push shared-hub files past SHARED_HUB_SPEC_THRESHOLD.
          result.set(fileKey, existingCandidates[0]!.specId)
        } else if (
          candidateMap.size < SHARED_HUB_SPEC_THRESHOLD &&
          existingCandidates.length === 0
        ) {
          const sorted = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score)
          const top = sorted[0]!
          const runnerUp = sorted[1]!
          if (top.score > runnerUp.score) {
            result.set(fileKey, top.specId)
          }
        }
      }
    }

    this._fileToSpecMap = result
    return result
  }

  /** @inheritdoc */
  async findSpecByFile(filePath: string): Promise<string | null> {
    const map = await this.getFileToSpecMap()
    if (map.has(filePath)) {
      return map.get(filePath) ?? null
    }
    const rawPath = filePath.replace(/^[^:]+:/, '')
    if (map.has(rawPath)) {
      return map.get(rawPath) ?? null
    }
    const shortRelPath = rawPath.replace(/^(?:packages|apps)\/[^/]+\//, '')
    if (map.has(shortRelPath)) {
      return map.get(shortRelPath) ?? null
    }
    return null
  }

  /** @inheritdoc */
  async flush(): Promise<void> {
    if (!this._isDirty || !this._data) {
      return
    }

    const specsRecord: Record<string, ImplementationSuggestionSpecEntry> = {}
    for (const [specId, entry] of this._data.entries()) {
      specsRecord[specId] = entry
    }

    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()

    const header: ImplementationSuggestionCacheHeader = this._header ?? {
      updatedAt: new Date().toISOString(),
      projectDir: this.projectDir,
      cacheVersion: IMPLEMENTATION_SUGGESTION_CACHE_VERSION,
      graphLastIndexedAt: lastIndexedAt,
      graphFingerprint: fingerprint,
    }

    const filePayload: ImplementationSuggestionsCacheFile = {
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
    this._fileToSpecMap = null
    this._isDirty = false
    try {
      await unlink(this.cachePath)
    } catch {
      // Ignore if not present
    }
  }
}
