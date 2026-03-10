import { type VcsAdapter } from '../../application/ports/vcs-adapter.js'
import { svn } from './exec.js'

/**
 * Subversion CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `svn` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
 */
export class SvnVcsAdapter implements VcsAdapter {
  private readonly _cwd: string

  /**
   * Creates a new `SvnVcsAdapter`.
   *
   * @param cwd - Working directory for svn commands; defaults to `process.cwd()`
   */
  constructor(cwd: string = process.cwd()) {
    this._cwd = cwd
  }

  /** @inheritdoc */
  async rootDir(): Promise<string> {
    return svn(this._cwd, 'info', '--show-item', 'wc-root')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    const relativeUrl = await svn(this._cwd, 'info', '--show-item', 'relative-url')
    // ^/trunk → trunk, ^/branches/foo → foo, ^/tags/v1 → v1
    const url = relativeUrl.replace(/^\^\//, '')
    if (url === 'trunk') return 'trunk'
    const branchMatch = url.match(/^branches\/(.+)$/)
    if (branchMatch) return branchMatch[1]!
    const tagMatch = url.match(/^tags\/(.+)$/)
    if (tagMatch) return tagMatch[1]!
    return url
  }

  /** @inheritdoc */
  async isClean(): Promise<boolean> {
    const output = await svn(this._cwd, 'status')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      return await svn(this._cwd, 'info', '--show-item', 'revision')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await svn(this._cwd, 'cat', '-r', ref, filePath)
    } catch {
      return null
    }
  }
}
