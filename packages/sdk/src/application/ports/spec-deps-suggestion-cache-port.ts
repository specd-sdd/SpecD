import { type SpecRepository } from '@specd/core'
import { type CodeGraphProvider } from '@specd/code-graph'
import {
  type SpecDepsSuggestionSpecEntry,
  type SpecDepsSuggestedItem,
} from '../../domain/value-objects/spec-deps-suggestion-cache.js'

/** Dependencies injected into {@link SpecDepsSuggestionCachePort}. */
export interface SpecDepsSuggestionCachePortDeps {
  readonly specRepositories?: ReadonlyMap<string, SpecRepository> | undefined
  readonly codeGraphProvider?: CodeGraphProvider | undefined
}

/** Input payload when setting a spec dependency suggestion in the cache. */
export interface SetSpecDepsSuggestionInput {
  readonly title?: string | undefined
  readonly existingDependsOn?: readonly string[] | undefined
  readonly suggestedDependsOn: readonly SpecDepsSuggestedItem[]
  /** Fingerprint of the implementation file-to-spec map at computation time. */
  readonly fileToSpecFingerprint?: string | undefined
}

/**
 * Application port for a self-validating spec dependencies suggestion cache.
 *
 * Encapsulates graph freshness and spec stamp verification without leaking
 * hashing or comparison logic to orchestration use cases.
 */
export abstract class SpecDepsSuggestionCachePort {
  /**
   * Creates a spec dependencies suggestion cache bound to repository and graph providers.
   *
   * @param deps - Injected spec repositories and code graph provider for self-validation
   */
  constructor(protected readonly deps: SpecDepsSuggestionCachePortDeps = {}) {}

  /**
   * Retrieves the cached dependencies suggestion for a specific spec.
   * Automatically validates graph and spec file stamps against backing repositories.
   *
   * @param specId - Target canonical spec identifier
   * @returns Cached entry if fresh, or null on cache miss or staleness
   */
  abstract get(specId: string): Promise<SpecDepsSuggestionSpecEntry | null>

  /**
   * Updates or inserts a spec's dependency suggestion entry in the cache,
   * automatically capturing current spec stamp and graph revision.
   *
   * @param specId - Target canonical spec identifier
   * @param input - Dependency suggestion data and metadata
   */
  abstract set(specId: string, input: SetSpecDepsSuggestionInput): Promise<void>

  /**
   * Persists multiple spec dependency suggestion entries in batch.
   *
   * @param entries - Collection of spec dependency suggestion entries
   */
  abstract setMany(entries: readonly SpecDepsSuggestionSpecEntry[]): Promise<void>

  /**
   * Retrieves all currently loaded spec dependency suggestions as an immutable map.
   *
   * @returns Map of specId -> SpecDepsSuggestionSpecEntry
   */
  abstract getAll(): Promise<ReadonlyMap<string, SpecDepsSuggestionSpecEntry>>

  /**
   * Flushes any in-memory dirty state to the backing store atomically.
   */
  abstract flush(): Promise<void>

  /**
   * Invalidates and clears the spec dependencies suggestion cache.
   */
  abstract invalidate(): Promise<void>

  /**
   * Executes an asynchronous operation while holding an exclusive lock on the cache.
   *
   * Default implementation in base class executes the callback directly.
   * Filesystem adapters override this to hold an exclusive kernel-level file lock.
   *
   * @param fn - The async operation to execute while the lock is held
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return await fn()
  }
}
