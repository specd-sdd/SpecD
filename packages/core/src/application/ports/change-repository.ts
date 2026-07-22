import { type Change } from '../../domain/entities/change.js'
import {
  type DiscardedChangeView,
  type DraftedChangeView,
} from '../../domain/read-only-change-view.js'
import {
  type ActiveChangeListEntry,
  type DiscardedChangeListEntry,
  type DraftedChangeListEntry,
} from '../../domain/change-list-entry.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import {
  Repository,
  type RepositoryConfig,
  type ListOptions,
  type ListResult,
} from './repository.js'

export { type RepositoryConfig as ChangeRepositoryConfig }
export type { ListOptions, ListResult }

/** Options for listing active changes. */
export interface ActiveChangeListOptions extends ListOptions {
  readonly includeDescription?: boolean
}

/** Options for listing drafted changes. */
export interface DraftedChangeListOptions extends ListOptions {
  readonly includeDescription?: boolean
  readonly includeReason?: boolean
}

/** Options for listing discarded changes. */
export interface DiscardedChangeListOptions extends ListOptions {
  readonly includeDescription?: boolean
  readonly includeReason?: boolean
  readonly includeSupersededBy?: boolean
}

/**
 * Port for reading and writing changes.
 *
 * Extends {@link Repository} for interface consistency with {@link SpecRepository}
 * and {@link ArchiveRepository}, but changes are stored globally (one `changes/`
 * directory), not per-workspace. The inherited `workspace()`, `ownership()`, and
 * `isExternal()` fields carry the default workspace values and are not used by
 * any use case. They exist solely to satisfy the shared `Repository` base
 * contract.
 *
 * `list` and `get` return {@link Change} objects with artifact state
 * (status, validatedHash) but without artifact content. Content is loaded
 * on demand via `artifact()`. The manifest (state, hashes, approvals) is
 * persisted separately from artifact file content via `save()` and
 * `saveArtifact()`.
 */
export abstract class ChangeRepository extends Repository {
  /**
   * Creates a new `ChangeRepository` instance.
   *
   * @param config - Workspace, ownership, and locality configuration
   */
  constructor(config: RepositoryConfig) {
    super(config)
  }

  /**
   * Returns the change with the given name, or `null` if not found.
   *
   * Loads the manifest and derives each artifact's status by comparing
   * the current file hash against the `validatedHash` stored at last
   * validation. A hash mismatch indicates drift and resets the artifact
   * status to `in-progress`.
   *
   * This is a snapshot read only. Callers that need a concurrency-safe
   * read-modify-write section for an existing persisted change must use
   * {@link mutate} instead of pairing `get()` with a later `save()`.
   *
   * @param name - The change name (e.g. `"add-oauth-login"`)
   * @returns The change with current artifact state, or `null` if not found in `changes/`
   */
  abstract get(name: string): Promise<Change | null>

  /**
   * Returns a drafted change as a read-only view, or `null` if not found in `drafts/`.
   *
   * @param name - The change name to look up
   * @returns A `DraftedChangeView` without artifact file bodies, or `null`
   */
  abstract getDraft(name: string): Promise<DraftedChangeView | null>

  /**
   * Returns a discarded change as a read-only view, or `null` if not found in `discarded/`.
   *
   * @param name - The change name to look up
   * @returns A `DiscardedChangeView` with discard metadata, or `null`
   */
  abstract getDiscarded(name: string): Promise<DiscardedChangeView | null>

  /**
   * Runs a serialized persisted mutation for one existing change.
   *
   * The repository acquires exclusive mutation access for `name`, reloads the
   * freshest persisted `Change`, invokes `fn(change)`, persists the updated
   * manifest if `fn` succeeds, and then releases the exclusive access.
   *
   * This is the only concurrency-safe read-modify-write API for an existing
   * change. Exclusive access is scoped per change name; unrelated change names
   * may mutate concurrently.
   *
   * @param name - The change name to mutate
   * @param fn - Callback that applies the mutation on the fresh persisted change
   * @returns The callback result after the manifest has been persisted
   * @throws {ChangeNotFoundError} If no active change with the given name exists
   */
  abstract mutate<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T>

  /**
   * Runs a serialized persisted mutation for one existing drafted change.
   *
   * @param name - The drafted change name to mutate
   * @param fn - Callback that applies the mutation on the fresh persisted drafted `Change`
   * @returns The callback result after the manifest has been persisted
   * @throws {ChangeNotFoundError} If no drafted change with the given name exists
   */
  abstract mutateDraft<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T>

  /**
   * Lists active (non-drafted, non-discarded) changes in canonical order (`createdAt` asc).
   *
   * Returns lightweight {@link ActiveChangeListEntry} rows — no artifact content,
   * history, or derived artifact state maps.
   *
   * @param options - Pagination and include projection options
   * @returns Paginated active change list entries, oldest first
   */
  abstract list(options?: ActiveChangeListOptions): Promise<ListResult<ActiveChangeListEntry>>

  /**
   * Lists drafted changes in canonical order (`draftedAt` desc).
   *
   * @param options - Pagination and include projection options
   * @returns Paginated drafted change list entries, newest first
   */
  abstract listDrafts(
    options?: DraftedChangeListOptions,
  ): Promise<ListResult<DraftedChangeListEntry>>

  /**
   * Lists discarded changes in canonical order (`discardedAt` desc).
   *
   * @param options - Pagination and include projection options
   * @returns Paginated discarded change list entries, newest first
   */
  abstract listDiscarded(
    options?: DiscardedChangeListOptions,
  ): Promise<ListResult<DiscardedChangeListEntry>>

  /**
   * Returns the total number of active changes.
   *
   * @returns Total active change count (same source as `list().meta.total`)
   */
  abstract count(): Promise<number>

  /**
   * Returns the total number of drafted changes.
   *
   * @returns Total drafted change count (same source as `listDrafts().meta.total`)
   */
  abstract countDrafts(): Promise<number>

  /**
   * Returns the total number of discarded changes.
   *
   * @returns Total discarded change count (same source as `listDiscarded().meta.total`)
   */
  abstract countDiscarded(): Promise<number>

  /**
   * Rebuilds active, drafted, and discarded list indexes.
   */
  abstract reindex(): Promise<void>

  /**
   * Rebuilds the active-changes list index only.
   */
  abstract reindexActive(): Promise<void>

  /**
   * Rebuilds the drafts list index only.
   */
  abstract reindexDrafts(): Promise<void>

  /**
   * Rebuilds the discarded list index only.
   */
  abstract reindexDiscarded(): Promise<void>

  /**
   * Persists the change manifest — state, artifact statuses, validated
   * hashes, and approvals.
   *
   * Does not write artifact file content. Use `saveArtifact()` for that.
   *
   * This is a low-level manifest persistence primitive. Atomic writing prevents
   * partial-file corruption, but `save()` alone does not serialize a caller's
   * earlier snapshot read.
   *
   * @param change - The change whose manifest should be persisted
   */
  abstract save(change: Change): Promise<void>

  /**
   * Deletes the entire change directory and all its contents.
   *
   * @param change - The change to delete
   */
  abstract delete(change: Change): Promise<void>

  /**
   * Loads the content of a single artifact file within a change.
   *
   * The returned `SpecArtifact` has `originalHash` set to the `sha256` of
   * the content read from disk, enabling conflict detection if the artifact
   * is later saved back via `saveArtifact()`.
   *
   * @param change - The change containing the artifact
   * @param filename - The artifact filename to load (e.g. `"proposal.md"`)
   * @returns The artifact with content and originalHash, or `null` if the file does not exist
   */
  abstract artifact(change: Change, filename: string): Promise<SpecArtifact | null>

  /**
   * Writes an artifact file within a change directory.
   *
   * If `artifact.originalHash` is set and does not match the current file on
   * disk, the save is rejected with {@link ArtifactConflictError} to prevent
   * silently overwriting concurrent changes (e.g. those made by an LLM agent).
   * Pass `{ force: true }` to overwrite regardless.
   *
   * After a successful write the corresponding `ChangeArtifact` status in the
   * change manifest is reset to `in-progress` — call `save(change)` to persist
   * that state change.
   *
   * @param change - The change to write the artifact into
   * @param artifact - The artifact to save (filename + content)
   * @param options - Save options
   * @param options.force - When `true`, skip conflict detection and overwrite unconditionally
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  abstract saveArtifact(
    change: Change,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void>

  /**
   * Checks whether an artifact file exists for a change, without loading content.
   *
   * @param change - The change containing the artifact
   * @param filename - The artifact filename to check (e.g. `"proposal.md"`)
   * @returns `true` if the file exists, `false` otherwise
   */
  /**
   * Returns the absolute filesystem path to the active change directory.
   *
   * Used by use cases to build the `change.path` template variable.
   *
   * @param change - The change whose path is needed
   * @returns Absolute path to the change directory
   */
  abstract changePath(change: Change): string

  /**
   * Returns the absolute filesystem path to a drafted change directory.
   *
   * @param view - A `DraftedChangeView` from {@link getDraft} or {@link listDrafts}
   * @returns Absolute path under `drafts/`
   */
  abstract draftChangePath(view: DraftedChangeView): string

  abstract artifactExists(change: Change, filename: string): Promise<boolean>

  /**
   * Checks whether a delta file exists for a change + specId pair.
   *
   * @param change - The change containing the delta
   * @param specId - The spec identifier (e.g. `"auth/login"`)
   * @param filename - The delta filename to check (e.g. `"spec.delta.yaml"`)
   * @returns `true` if the file exists, `false` otherwise
   */
  abstract deltaExists(change: Change, specId: string, filename: string): Promise<boolean>

  /**
   * Ensures artifact directories exist for all files tracked by the change.
   *
   * For `scope: spec` artifacts, creates `specs/<ws>/<capPath>/` or
   * `deltas/<ws>/<capPath>/` directories under the change directory.
   * For `scope: change` artifacts, the root directory already exists.
   *
   * @param change - The change whose artifact directories to scaffold
   * @param specExists - A function that returns whether a spec already exists in the repository
   */
  abstract scaffold(change: Change, specExists: (specId: string) => Promise<boolean>): Promise<void>

  /**
   * Removes the scaffolded directories for the given spec IDs from the change directory.
   *
   * For each spec ID, removes both `specs/<workspace>/<capability-path>/` and
   * `deltas/<workspace>/<capability-path>/` directories. The operation is idempotent —
   * if a directory does not exist, it is silently skipped.
   *
   * @param change - The change whose spec directories to remove
   * @param specIds - The spec IDs whose directories to remove
   */
  abstract unscaffold(change: Change, specIds: readonly string[]): Promise<void>

  /**
   * Returns the absolute filesystem paths to specd-managed internal directories
   * (e.g. `changes/`, `drafts/`, `discarded/`).
   *
   * Used by implementation discovery to exclude internal specd directories
   * from detection results. Returns absolute paths in stable order.
   *
   * Implementations that do not manage local filesystem directories
   * (e.g. remote backends) MUST return `undefined` instead of an empty array
   * to signal that internal-path exclusion does not apply.
   *
   * @returns Absolute filesystem paths to internal storage roots, or `undefined`
   */
  abstract internalPaths(): readonly string[] | undefined
}

export type { ArtifactConflictError }
