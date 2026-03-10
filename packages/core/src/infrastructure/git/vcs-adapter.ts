import { type VcsAdapter } from '../../application/ports/vcs-adapter.js'
import { git } from './exec.js'

/**
 * Git CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `git` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
 */
export class GitVcsAdapter implements VcsAdapter {
  private readonly _cwd: string

  /**
   * Creates a new `GitVcsAdapter`.
   *
   * @param cwd - Working directory for git commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /** @inheritdoc */
  async rootDir(): Promise<string> {
    return git(this._cwd, 'rev-parse', '--show-toplevel')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    try {
      return await git(this._cwd, 'symbolic-ref', '--short', 'HEAD')
    } catch {
      return 'HEAD'
    }
  }

  /** @inheritdoc */
  async isClean(): Promise<boolean> {
    const output = await git(this._cwd, 'status', '--porcelain')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      return await git(this._cwd, 'rev-parse', '--short', 'HEAD')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await git(this._cwd, 'show', `${ref}:${filePath}`)
    } catch {
      return null
    }
  }
}
