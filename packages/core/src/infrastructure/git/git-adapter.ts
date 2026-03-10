import { type GitAdapter } from '../../application/ports/git-adapter.js'
import { git } from './exec.js'

/**
 * Git CLI implementation of the {@link GitAdapter} port.
 *
 * Shells out to the `git` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
 */
export class GitCLIAdapter implements GitAdapter {
  private readonly _cwd: string

  /**
   * Creates a new `GitCLIAdapter`.
   *
   * @param cwd - Working directory for git commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /**
   * Returns the absolute path to the root of the current git repository.
   *
   * @returns Absolute path to the repository root
   * @throws When the current working directory is not inside a git repository
   */
  async rootDir(): Promise<string> {
    return git(this._cwd, 'rev-parse', '--show-toplevel')
  }

  /**
   * Returns the name of the currently checked-out branch.
   *
   * Returns `"HEAD"` when the repository is in detached HEAD state.
   *
   * @returns Current branch name, or `"HEAD"` in detached HEAD state
   * @throws When the current working directory is not inside a git repository
   */
  async branch(): Promise<string> {
    try {
      return await git(this._cwd, 'symbolic-ref', '--short', 'HEAD')
    } catch {
      return 'HEAD'
    }
  }

  /**
   * Returns `true` when the working tree and index have no uncommitted changes.
   *
   * @returns `true` if working tree is clean, `false` if there are uncommitted changes
   * @throws When the current working directory is not inside a git repository
   */
  async isClean(): Promise<boolean> {
    const output = await git(this._cwd, 'status', '--porcelain')
    return output.length === 0
  }
}
