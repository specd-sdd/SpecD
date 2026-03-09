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
   * @param name - The change name (e.g. `"add-oauth-login"`)
   * @returns The change with current artifact state, or `null` if not found
   */
  abstract get(name: string): Promise<Change | null>

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
}

export type { ArtifactConflictError }
