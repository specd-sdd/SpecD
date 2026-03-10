import { type VcsAdapter } from '../../application/ports/vcs-adapter.js'
import { hg } from './exec.js'

/**
 * Mercurial CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `hg` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
 */
export class HgVcsAdapter implements VcsAdapter {
  private readonly _cwd: string

  /**
   * Creates a new `HgVcsAdapter`.
   *
   * @param cwd - Working directory for hg commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /** @inheritdoc */
  async rootDir(): Promise<string> {
    return hg(this._cwd, 'root')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    return hg(this._cwd, 'branch')
  }

  /** @inheritdoc */
  async isClean(): Promise<boolean> {
    const output = await hg(this._cwd, 'status')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      return await hg(this._cwd, 'id', '-i')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await hg(this._cwd, 'cat', '-r', ref, filePath)
    } catch {
      return null
    }
  }
}
