/**
 * Port for querying git repository state.
 *
 * Provides the read-only git information that use cases need — repository
 * root for path resolution, current branch for context, and working-tree
 * cleanliness as a safety guard before archiving.
 *
 * Actor identity resolution has been extracted to the {@link ActorResolver}
 * port, decoupling identity from git.
 *
 * Write operations (staging, committing, pushing) are intentionally excluded
 * from v1. They are handled by `run:` hooks declared in `workflow[]`, keeping
 * git automation opt-in and schema-configurable rather than hardcoded.
 *
 * Unlike the repository ports, `GitAdapter` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface GitAdapter {
  /**
   * Returns the absolute path to the root of the current git repository.
   *
   * This is the directory containing `.git/` — useful for resolving all other
   * project-relative paths (specs, changes, archive, schemas).
   *
   * @returns Absolute path to the repository root
   * @throws When the current working directory is not inside a git repository
   */
  rootDir(): Promise<string>

  /**
   * Returns the name of the currently checked-out branch.
   *
   * Useful for context compilation and for surfacing the active branch in
   * CLI output. Returns `"HEAD"` when the repository is in detached HEAD state.
   *
   * @returns Current branch name, or `"HEAD"` in detached HEAD state
   * @throws When the current working directory is not inside a git repository
   */
  branch(): Promise<string>

  /**
   * Returns `true` when the working tree and index have no uncommitted changes.
   *
   * Used as a safety guard before archiving: the `ArchiveChange` use case can
   * warn the user if there are uncommitted changes that would not be captured
   * in the archived snapshot.
   *
   * @returns `true` if working tree is clean, `false` if there are uncommitted changes
   * @throws When the current working directory is not inside a git repository
   */
  isClean(): Promise<boolean>
}
