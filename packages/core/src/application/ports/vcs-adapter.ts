/**
 * Port for querying version-control system state.
 *
 * Provides technology-neutral VCS operations that use cases and CLI commands
 * need — repository root for path resolution, current branch for context,
 * working-tree cleanliness as a safety guard, current revision reference,
 * and file content retrieval at a given revision.
 *
 * Implementations exist for git, hg, svn, and a null fallback for
 * environments with no VCS.
 *
 * Unlike the repository ports, `VcsAdapter` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface VcsAdapter {
  /**
   * Returns the absolute path to the root of the current repository.
   *
   * Useful for resolving all other project-relative paths (specs, changes,
   * archive, schemas).
   *
   * @returns Absolute path to the repository root
   * @throws When the current working directory is not inside a VCS repository
   */
  rootDir(): Promise<string>

  /**
   * Returns the name of the currently checked-out branch.
   *
   * Returns `"HEAD"` (git) or an equivalent in detached/unknown state.
   *
   * @returns Current branch name
   * @throws When the current working directory is not inside a VCS repository
   */
  branch(): Promise<string>

  /**
   * Returns `true` when the working tree has no uncommitted changes.
   *
   * @returns `true` if working tree is clean, `false` if there are uncommitted changes
   * @throws When the current working directory is not inside a VCS repository
   */
  isClean(): Promise<boolean>

  /**
   * Returns the short revision identifier for the current commit/changeset.
   *
   * Returns `null` when VCS is unavailable or the repository has no commits.
   *
   * @returns Short revision hash/id, or `null`
   */
  ref(): Promise<string | null>

  /**
   * Returns the revision that was active at or before a given timestamp.
   *
   * Returns `null` when VCS is unavailable or no historical revision matches.
   *
   * @param at - ISO-8601 timestamp string
   * @returns Revision identifier active at that time, or `null`
   */
  refAt(at: string): Promise<string | null>

  /**
   * Returns repository-relative file paths modified since a baseline revision.
   *
   * Missing or empty results are represented as an empty array.
   *
   * @param baseRef - Baseline revision identifier
   * @returns Repository-relative changed file paths
   */
  modifiedFiles(baseRef: string): Promise<readonly string[]>

  /**
   * Returns the content of a file at a given revision.
   *
   * Returns `null` when the revision or file path does not exist.
   *
   * @param ref - Revision identifier (e.g. commit hash, branch name)
   * @param filePath - Repository-relative path to the file
   * @returns File content as a string, or `null`
   */
  show(ref: string, filePath: string): Promise<string | null>
}
