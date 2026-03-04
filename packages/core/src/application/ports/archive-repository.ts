import { type Change, type GitIdentity } from '../../domain/entities/change.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type InvalidStateTransitionError } from '../../domain/errors/invalid-state-transition-error.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as ArchiveRepositoryConfig }
export type { InvalidStateTransitionError }

/**
 * Port for archiving and querying archived changes within a single workspace.
 *
 * Extends {@link Repository} — `workspace()`, `ownership()`, and `isExternal()`
 * are set at construction time. The archive is append-only: once a change is
 * archived it is never mutated. An `index.jsonl` file at the archive root
 * provides O(1) appends and fast lookup without scanning the filesystem.
 *
 * Implementations receive both the changes path and the archive path in their
 * configuration so they can physically move the change directory during `archive()`.
 */
export abstract class ArchiveRepository extends Repository {
  /**
   * Creates a new `ArchiveRepository` instance.
   *
   * @param config - Workspace, ownership, and locality configuration
   */
  constructor(config: RepositoryConfig) {
    super(config)
  }

  /**
   * Moves the change directory to the archive, creates the `ArchivedChange`
   * record, persists its manifest, and appends an entry to `index.jsonl`.
   *
   * As a safety guard, the repository verifies that the change is in
   * `archivable` state before proceeding. This check is intentionally
   * redundant — the `ArchiveChange` use case performs the same validation
   * first. The guard exists to prevent accidental archival if the repository
   * is called directly without going through the use case.
   *
   * Pass `{ force: true }` to bypass the state check (e.g. for recovery
   * or administrative operations).
   *
   * The destination path is computed from the archive pattern configured at
   * construction time (e.g. `{{year}}/{{change.archivedName}}`). The source
   * path is resolved from the change name using the changes path configuration.
   *
   * @param change - The change to archive
   * @param options - Archive options
   * @param options.force - When `true`, skip the state check and archive unconditionally
   * @param options.actor - Git identity of the actor performing the archive, recorded in the manifest
   * @returns The created `ArchivedChange` record
   * @throws {InvalidStateTransitionError} When the change is not in `archivable` state and `force` is not set
   */
  abstract archive(
    change: Change,
    options?: { force?: boolean; actor?: GitIdentity },
  ): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }>

  /**
   * Lists all archived changes in this workspace in chronological order (oldest first).
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
