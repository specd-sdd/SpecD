import { type SpecRepository } from '@specd/core'
import { type CodeGraphProvider } from '@specd/code-graph'
import {
  type ImplementationSuggestionEntry,
  type ImplementationSuggestionLockData,
  type ImplementationSuggestionSpecEntry,
} from '../../domain/value-objects/implementation-suggestion-cache.js'

/** Dependencies injected into {@link ImplementationSuggestionCachePort}. */
export interface ImplementationSuggestionCachePortDeps {
  readonly specRepositories?: ReadonlyMap<string, SpecRepository> | undefined
  readonly codeGraphProvider?: CodeGraphProvider | undefined
}

/** Input payload when setting an implementation suggestion in the cache. */
export interface SetImplementationSuggestionInput {
  readonly title?: string | undefined
  readonly existing?: ImplementationSuggestionLockData | undefined
  readonly suggestions: readonly ImplementationSuggestionEntry[]
  /** Real content hash (SHA-256) of the analyzed spec.md, when already computed by the caller. */
  readonly specContentHash?: string | undefined
}

/**
 * Application port for a self-validating implementation suggestion cache.
 *
 * Encapsulates graph freshness, spec stamp verification, and reverse lookup
 * (`code -> spec` and `spec -> code`) without leaking I/O or hashing details to use cases.
 */
export abstract class ImplementationSuggestionCachePort {
  /**
   * Creates an implementation suggestion cache bound to repository and graph providers.
   *
   * @param deps - Injected spec repositories and code graph provider for self-validation
   */
  constructor(protected readonly deps: ImplementationSuggestionCachePortDeps = {}) {}

  /**
   * Retrieves the cached implementation suggestion for a specific spec.
   * Automatically validates graph and spec file stamps against backing repositories.
   *
   * @param specId - Target canonical spec identifier
   * @returns Cached entry if fresh and valid, or null on cache miss or staleness
   */
  abstract get(specId: string): Promise<ImplementationSuggestionSpecEntry | null>

  /**
   * Updates or inserts a spec's implementation suggestion entry in the cache,
   * automatically capturing current spec stamp and graph revision.
   *
   * @param specId - Target canonical spec identifier
   * @param input - Suggestion data and optional metadata
   */
  abstract set(specId: string, input: SetImplementationSuggestionInput): Promise<void>

  /**
   * Persists multiple implementation suggestion entries in batch.
   *
   * @param entries - Collection of implementation suggestion entries
   */
  abstract setMany(entries: readonly ImplementationSuggestionSpecEntry[]): Promise<void>

  /**
   * Retrieves all currently loaded implementation suggestions as an immutable map.
   *
   * @returns Map of specId -> ImplementationSuggestionSpecEntry
   */
  abstract getAll(): Promise<ReadonlyMap<string, ImplementationSuggestionSpecEntry>>

  /**
   * Reverse-lookup: finds the owner spec for a given code file path and optional symbol name.
   * Resolves paths relative to workspaces, ranking candidates by semantic ownership tuple.
   *
   * @param filePath - File path (workspace-prefixed or repo-relative)
   * @param symbolName - Optional imported symbol name for disambiguation
   * @returns Canonical specId or null if unassigned or ambiguous
   */
  abstract findSpecByFile(filePath: string, symbolName?: string): Promise<string | null>

  /**
   * Returns the complete inverted lookup map from file path to canonical specId.
   *
   * @returns Map of filePath -> specId
   */
  abstract getFileToSpecMap(): Promise<ReadonlyMap<string, string>>

  /**
   * Flushes any in-memory dirty state to the backing store atomically.
   */
  abstract flush(): Promise<void>

  /**
   * Invalidates and clears the suggestion cache.
   */
  abstract invalidate(): Promise<void>
}
