/** Version identifier for the implementation suggestions cache schema. */
export const IMPLEMENTATION_SUGGESTION_CACHE_VERSION = '1.1.0'

/** Artifact metadata within spec stamp. */
export interface ImplementationSuggestionArtifactStamp {
  readonly filename: string
  readonly lastModified: string
  readonly hash: string
}

/** Freshness stamp for a spec used in caching decision. */
export interface ImplementationSuggestionSpecStamp {
  readonly lastModified: string
  readonly hash: string
  readonly artifacts: readonly ImplementationSuggestionArtifactStamp[]
}

/** Implementation lock state of a spec. */
export interface ImplementationSuggestionLockData {
  readonly files: readonly string[]
  readonly symbols: readonly string[]
  readonly dependsOn: readonly string[]
}

/** Individual implementation suggestion item. */
export interface ImplementationSuggestionEntry {
  readonly file: string
  readonly symbols: readonly string[]
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  readonly reasons: readonly string[]
  readonly score: number
  readonly alreadyIncluded?: boolean
}

/** Cached entry for a single spec. */
export interface ImplementationSuggestionSpecEntry {
  readonly specId: string
  readonly title: string
  readonly specStamp: ImplementationSuggestionSpecStamp
  readonly existing: ImplementationSuggestionLockData
  readonly suggestions: readonly ImplementationSuggestionEntry[]
}

/** Cache header metadata. */
export interface ImplementationSuggestionCacheHeader {
  readonly updatedAt: string
  readonly projectDir: string
  readonly cacheVersion: string
  readonly graphLastIndexedAt: string
  readonly graphFingerprint: string
}

/** Structure of the cache JSON file on disk. */
export interface ImplementationSuggestionsCacheFile {
  readonly header: ImplementationSuggestionCacheHeader
  readonly specs: Record<string, ImplementationSuggestionSpecEntry>
}
