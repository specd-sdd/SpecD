import type { ImplementationSuggestionSpecStamp } from './implementation-suggestion-cache.js'

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
  readonly specStamp: ImplementationSuggestionSpecStamp
  readonly existingDependsOn: readonly string[]
  readonly suggestedDependsOn: readonly SpecDepsSuggestedItem[]
  /**
   * Fingerprint of the global implementation file-to-spec map used when this
   * entry was computed. A mismatch on read means ownership of imported files
   * changed and suggestions must be recomputed.
   */
  readonly fileToSpecFingerprint?: string
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
