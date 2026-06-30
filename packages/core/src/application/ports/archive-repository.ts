import { type Change, type ActorIdentity } from '../../domain/entities/change.js'
import { type ArchivedChange } from '../../domain/entities/archived-change.js'
import { type ArchivedChangeIndexEntry } from '../../domain/archived-change-index-entry.js'
import { type SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { Repository, type RepositoryConfig } from './repository.js'

export { type RepositoryConfig as ArchiveRepositoryConfig }

/** Minimum shape accepted by {@link ArchiveRepository.archivePath}. */
export type ArchivePathEntry = Pick<
  ArchivedChangeIndexEntry,
  'name' | 'archivedName' | 'archivedAt' | 'workspaces'
>

/** Options for listing archived changes. */
export interface ArchiveListOptions {
  /** Maximum number of entries to return. Defaults to 100. */
  readonly limit?: number | undefined
  /** 1-based page index. Mutually exclusive with `startAt`. */
  readonly page?: number | undefined
  /** Name of the change to start after (exclusive). Mutually exclusive with `page`. */
  readonly startAt?: string | undefined
}

/** Result of listing archived changes. */
export interface ArchiveListResult {
  /** The list of archived change index entries. */
  readonly items: readonly ArchivedChangeIndexEntry[]
  /** Metadata about the listing. */
  readonly meta: {
    /** Total number of archived changes in the repository. */
    readonly total: number
    /** Number of entries returned in this result. */
    readonly count: number
    /** The limit applied to the query. */
    readonly limit: number
    /** The page index if page-based pagination was used. */
    readonly page?: number
    /** The startAt cursor if keyset pagination was used. */
    readonly startAt?: string
  }
}

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
   * @returns The created `ArchivedChange` read model and archive directory path
   * @throws {InvalidStateTransitionError} When the change is not in `archivable` state and `force` is not set
   */
  abstract archive(
    change: Change,
    options?: { force?: boolean; actor?: ActorIdentity },
  ): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }>

  /**
   * Lists archived changes in this workspace in chronological order (oldest first).
   *
   * Streams `index.jsonl` from the start, deduplicating by name so that the
   * last entry wins in case of duplicates introduced by manual recovery.
   *
   * @param options - Pagination and filtering options
   * @returns Paginated index-backed archive result, oldest first
   */
  abstract list(options?: ArchiveListOptions): Promise<ArchiveListResult>

  /**
   * Returns the archived change with the given name, or `null` if not found.
   *
   * Searches `index.jsonl` from the end (most recent entries first). If not
   * found in the index, falls back to a glob scan of the archive directory and
   * appends the recovered entry to `index.jsonl` for future lookups.
   *
   * @param name - The change name to look up (e.g. `"add-oauth-login"`)
   * @returns Full manifest-backed archived detail, or `null` if not found
   */
  abstract get(name: string): Promise<ArchivedChange | null>

  /**
   * Loads the content of a single artifact file within an archived change.
   *
   * @param change - The archived change containing the artifact
   * @param filename - The artifact filename to load
   * @returns The artifact with content and originalHash, or `null` if missing
   */
  abstract artifact(change: ArchivedChange, filename: string): Promise<SpecArtifact | null>

  /**
   * Rebuilds `index.jsonl` by scanning the archive directory for all
   * `manifest.json` files, sorting by `archivedAt`, and writing a clean
   * index in chronological order.
   *
   * Use this to recover from a corrupted or missing index. The resulting
   * git diff shows only missing or spurious lines — no reorderings.
   */
  abstract reindex(): Promise<void>

  /**
   * Returns the absolute filesystem path for an archived change's directory.
   *
   * Mirrors {@link ChangeRepository.changePath} for active changes.
   *
   * @param entry - Full archived detail or index row with path resolution fields
   * @returns The absolute path to the archived change's directory
   */
  abstract archivePath(entry: ArchivePathEntry): string

  /**
   * Returns the absolute filesystem paths to specd-managed internal directories
   * (e.g. the archive root).
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
