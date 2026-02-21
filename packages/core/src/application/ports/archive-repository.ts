import { type Change } from '../../domain/entities/change.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type ApprovalRequiredError } from '../../domain/errors/approval-required-error.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as ArchiveRepositoryConfig }
export type { ApprovalRequiredError }

/**
 * Port for archiving and querying archived changes within a single scope.
 *
 * Extends {@link Repository} — `scope()`, `ownership()`, and `isExternal()`
 * are set at construction time. The archive is append-only: once a change is
 * archived it is never mutated. An `index.jsonl` file at the archive root
 * provides O(1) appends and fast lookup without scanning the filesystem.
 *
 * Implementations receive both the changes path and the archive path in their
 * configuration so they can physically move the change directory during `archive()`.
 */
export abstract class ArchiveRepository extends Repository {
  /**
   * @param config - Scope, ownership, and locality configuration
   */
  constructor(config: RepositoryConfig) {
    super(config)
  }

  /**
   * Moves the change directory to the archive, creates the `ArchivedChange`
   * record, persists its manifest, and appends an entry to `index.jsonl`.
   *
   * As a safety guard, the repository verifies that all required specs in the
   * change have been approved before proceeding. This check is intentionally
   * redundant — the `ArchiveChange` use case performs the same validation
   * first. The guard exists to prevent accidental archival if the repository
   * is called directly without going through the use case.
   *
   * Pass `{ force: true }` to bypass the approval check (e.g. for recovery
   * or administrative operations).
   *
   * The destination path is computed from the archive pattern configured at
   * construction time (e.g. `{{year}}/{{change.archivedName}}`). The source
   * path is resolved from the change name using the changes path configuration.
   *
   * @param change - The change to archive
   * @param options - Archive options
   * @param options.force - When `true`, skip the approval check and archive unconditionally
   * @returns The created `ArchivedChange` record
   * @throws {ApprovalRequiredError} When the change has unapproved specs and `force` is not set
   */
  abstract archive(change: Change, options?: { force?: boolean }): Promise<ArchivedChange>

  /**
   * Lists all archived changes in this scope in chronological order (oldest first).
   *
   * Streams `index.jsonl` from the start, deduplicating by name so that the
   * last entry wins in case of duplicates introduced by manual recovery.
   *
   * @returns All archived changes, oldest first
   */
  abstract list(): Promise<ArchivedChange[]>

  /**
   * Returns the archived change with the given name, or `null` if not found.
   *
   * Searches `index.jsonl` from the end (most recent entries first). If not
   * found in the index, falls back to a glob scan of the archive directory and
   * appends the recovered entry to `index.jsonl` for future lookups.
   *
   * @param name - The change name to look up (e.g. `"add-oauth-login"`)
   * @returns The archived change, or `null` if not found
   */
  abstract get(name: string): Promise<ArchivedChange | null>

  /**
   * Rebuilds `index.jsonl` by scanning the archive directory for all
   * `manifest.json` files, sorting by `archivedAt`, and writing a clean
   * index in chronological order.
   *
   * Use this to recover from a corrupted or missing index. The resulting
   * git diff shows only missing or spurious lines — no reorderings.
   */
  abstract reindex(): Promise<void>
}
