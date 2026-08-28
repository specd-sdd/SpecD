import { readFile, unlink } from 'node:fs/promises'
import { writeJsonAtomic } from './write-json-atomic.js'
import {
  decideFreshness,
  enrichSpecHash,
  readSpecStamp,
  timestampFallback,
} from './spec-stamp-source.js'
import { isAbsolute, join } from 'node:path'
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

/**
 * Candidate spec match for a file key, with ownership, evidence, and score.
 */
interface CandidateSpecMatch {
  readonly specId: string
  readonly isConfirmed: boolean
  readonly symbols: readonly string[]
  readonly evidenceStrength: number
  readonly score: number
}

/**
 * Compares two candidate spec matches lexicographically by semantic ownership tuple:
 * (confirmed, evidenceStrength, workspaceAffinity, capabilitySymbolAffinity, score).
 *
 * @param a - First candidate
 * @param b - Second candidate
 * @param targetPath - Target file path
 * @param targetSymbol - Optional target symbol name
 * @returns Positive if a > b, negative if a < b, 0 if equal
 */
function compareCandidateTuples(
  a: CandidateSpecMatch,
  b: CandidateSpecMatch,
  targetPath: string,
  targetSymbol?: string,
): number {
  const getFileWorkspace = (p: string): string => {
    if (p.includes(':')) return p.split(':')[0]!
    const clean = p.replace(/^\.\//, '')
    if (clean.startsWith('packages/') || clean.startsWith('apps/')) {
      return clean.split('/')[1] ?? ''
    }
    return ''
  }

  const fileWs = getFileWorkspace(targetPath)
  const getSpecWs = (id: string): string => (id.includes(':') ? id.split(':')[0]! : 'default')

  const aConfirmed = a.isConfirmed ? 1 : 0
  const bConfirmed = b.isConfirmed ? 1 : 0
  if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed

  if (a.evidenceStrength !== b.evidenceStrength) {
    return a.evidenceStrength - b.evidenceStrength
  }

  const aWsAff = fileWs && getSpecWs(a.specId) === fileWs ? 1 : 0
  const bWsAff = fileWs && getSpecWs(b.specId) === fileWs ? 1 : 0
  if (aWsAff !== bWsAff) return aWsAff - bWsAff

  if (targetSymbol) {
    const symbolKebab = targetSymbol
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/_/g, '-')
    const getCapBase = (id: string) => id.split(':').pop()?.split('/').pop()?.toLowerCase() ?? ''
    const aCapAff = getCapBase(a.specId) === symbolKebab ? 1 : 0
    const bCapAff = getCapBase(b.specId) === symbolKebab ? 1 : 0
    if (aCapAff !== bCapAff) return aCapAff - bCapAff
  }

  if (a.score !== b.score) {
    return a.score - b.score
  }

  return 0
}

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
  private _generation = 0
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
    this._fileToSpecMap = null
    this._isDirty = false

    try {
      const content = await readFile(this.cachePath, 'utf-8')
      const parsed = JSON.parse(content) as ImplementationSuggestionsCacheFile
      if (generation !== this._generation) {
        return
      }
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
  async set(specId: string, input: SetImplementationSuggestionInput): Promise<void> {
    await this.ensureLoaded()
    const { fingerprint, lastIndexedAt } = await this.getGraphFingerprint()
    const currentStamp: ImplementationSuggestionSpecStamp = {
      ...(await readSpecStamp(this.deps, specId)),
    }
    // Persist the authoritative identity so future reads can run stage-2 hash
    // comparisons without re-fetching: real SHA-256 + stat-backed size.
    await enrichSpecHash(this.deps, specId, currentStamp)
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

    const allFileKeys = new Set<string>()
    for (const entry of this._data?.values() ?? []) {
      for (const f of entry.existing?.files ?? []) {
        if (f) {
          allFileKeys.add(f)
          const raw = f.replace(/^[^:]+:/, '')
          allFileKeys.add(raw)
          allFileKeys.add(raw.replace(/^(?:packages|apps)\/[^/]+\//, ''))
        }
      }
      for (const s of entry.suggestions ?? []) {
        if (s.file) {
          allFileKeys.add(s.file)
          const raw = s.file.replace(/^[^:]+:/, '')
          allFileKeys.add(raw)
          allFileKeys.add(raw.replace(/^(?:packages|apps)\/[^/]+\//, ''))
        }
      }
    }

    const result = new Map<string, string>()
    for (const fileKey of allFileKeys) {
      if (!fileKey) continue
      const winner = await this.findSpecByFile(fileKey)
      if (winner) {
        result.set(fileKey, winner)
      }
    }

    this._fileToSpecMap = result
    return result
  }

  /** @inheritdoc */
  async findSpecByFile(filePath: string, symbolName?: string): Promise<string | null> {
    await this.ensureLoaded()
    if (!this._data || this._data.size === 0) {
      return null
    }

    const matchesFile = (specFile: string, target: string): boolean => {
      if (specFile === target) return true
      const rawSpec = specFile.replace(/^[^:]+:/, '')
      const rawTarget = target.replace(/^[^:]+:/, '')
      if (rawSpec === rawTarget) return true
      const shortSpec = rawSpec.replace(/^(?:packages|apps)\/[^/]+\//, '')
      const shortTarget = rawTarget.replace(/^(?:packages|apps)\/[^/]+\//, '')
      return shortSpec === shortTarget
    }

    const candidateMap = new Map<string, CandidateSpecMatch>()

    for (const [specId, entry] of this._data.entries()) {
      let isConfirmed = false
      for (const f of entry.existing?.files ?? []) {
        if (matchesFile(f, filePath)) {
          isConfirmed = true
          break
        }
      }
      if (isConfirmed) {
        candidateMap.set(specId, {
          specId,
          isConfirmed: true,
          symbols: entry.existing?.symbols ?? [],
          evidenceStrength: 0,
          score: 9999,
        })
        continue
      }

      for (const s of entry.suggestions ?? []) {
        if (matchesFile(s.file, filePath)) {
          let evidenceStrength = 0
          if (s.reasons.includes('fenced-code-evidence')) evidenceStrength = 3
          else if (s.reasons.includes('inline-code-evidence')) evidenceStrength = 2
          else if (s.reasons.includes('prose-symbol-evidence')) evidenceStrength = 1

          const existing = candidateMap.get(specId)
          if (!existing || (s.score ?? 0) > existing.score) {
            candidateMap.set(specId, {
              specId,
              isConfirmed: false,
              symbols: s.symbols ?? [],
              evidenceStrength: Math.max(evidenceStrength, existing?.evidenceStrength ?? 0),
              score: Math.max(s.score ?? 0, existing?.score ?? 0),
            })
          }
        }
      }
    }

    let candidates = Array.from(candidateMap.values())
    if (candidates.length === 0) {
      return null
    }

    if (symbolName) {
      const symLower = symbolName.toLowerCase()
      const symbolMatched = candidates.filter((c) =>
        c.symbols.some((s) => s.toLowerCase() === symLower),
      )
      if (symbolMatched.length > 0) {
        candidates = symbolMatched
      }
    }

    if (candidates.length === 1) {
      return candidates[0]!.specId
    }

    candidates.sort((a, b) => compareCandidateTuples(b, a, filePath, symbolName))

    const top = candidates[0]!
    const runnerUp = candidates[1]!
    const diff = compareCandidateTuples(top, runnerUp, filePath, symbolName)
    if (diff > 0) {
      return top.specId
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

    await writeJsonAtomic(this.cachePath, JSON.stringify(filePayload, null, 2))
    this._isDirty = false
  }

  /** @inheritdoc */
  async invalidate(): Promise<void> {
    this._generation += 1
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
