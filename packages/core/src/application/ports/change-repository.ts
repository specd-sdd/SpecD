import { type Change } from '../../domain/entities/change.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { type ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as ChangeRepositoryConfig }

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
   * @returns The change with current artifact state, or `null` if not found
   */
  abstract get(name: string): Promise<Change | null>

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
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  abstract mutate<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T>

  /**
   * Lists all active (non-drafted, non-discarded) changes, sorted by creation order.
   *
   * Returns {@link Change} objects with artifact state but without content.
   *
   * @returns All active changes in this workspace, oldest first
   */
  abstract list(): Promise<Change[]>

  /**
   * Lists all drafted (shelved) changes in this workspace, sorted by creation order.
   *
   * Returns {@link Change} objects with artifact state but without content.
   *
   * @returns All drafted changes in this workspace, oldest first
   */
  abstract listDrafts(): Promise<Change[]>

  /**
   * Lists all discarded changes in this workspace, sorted by creation order.
   *
   * Returns {@link Change} objects with artifact state but without content.
   *
   * @returns All discarded changes in this workspace, oldest first
   */
  abstract listDiscarded(): Promise<Change[]>

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
}

export type { ArtifactConflictError }
