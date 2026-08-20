/** Version identifier for the spec deps suggestions cache schema. */
export const SPEC_DEPS_CACHE_VERSION = '1.1.0'

/** Suggested spec dependency item within cache. */
export interface SpecDepsSuggestedItem {
  readonly specId: string
  readonly title: string
  readonly reason: string
}

/** Cached entry for a single spec's dependencies. */
export interface SpecDepsSuggestionSpecEntry {
  readonly specId: string
  readonly title: string
  readonly specStamp: {
    readonly lastModified: string
    readonly hash: string
    readonly artifacts: readonly {
      readonly filename: string
      readonly lastModified: string
      readonly hash: string
    }[]
  }
  readonly existingDependsOn: readonly string[]
  readonly suggestedDependsOn: readonly SpecDepsSuggestedItem[]
}

/** Cache header metadata. */
export interface SpecDepsSuggestionCacheHeader {
  readonly updatedAt: string
  readonly projectDir: string
  readonly cacheVersion: string
  readonly graphLastIndexedAt: string
  readonly graphFingerprint: string
}

/** Structure of the cache JSON file on disk for spec deps. */
export interface SpecDepsSuggestionsCacheFile {
  readonly header: SpecDepsSuggestionCacheHeader
  readonly specs: Record<string, SpecDepsSuggestionSpecEntry>
}

/** Relative path to spec deps suggestion cache file. */
export const SPEC_DEPS_RELATIVE_CACHE_PATH = '.specd/tmp/fs-cache/spec-deps-suggestions/suggestions.json'
