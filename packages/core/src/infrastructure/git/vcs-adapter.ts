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
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await git(this._cwd, 'rev-list', '-1', `--before=${at}`, 'HEAD')
      if (revision.length === 0) return null
      return await git(this._cwd, 'rev-parse', '--short', revision)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const diffOutput = await git(
      this._cwd,
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      baseRef,
      '--',
    )
    const untrackedOutput = await git(this._cwd, 'ls-files', '--others', '--exclude-standard')
    return normalizePaths(diffOutput, untrackedOutput)
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

/**
 * Normalizes one or more newline-delimited path lists into a unique path array.
 *
 * @param outputs - Raw command outputs containing newline-delimited file paths
 * @returns Unique, non-empty repository-relative file paths
 */
function normalizePaths(...outputs: readonly string[]): readonly string[] {
  const files = new Set<string>()
  for (const output of outputs) {
    for (const line of output.split('\n')) {
      const normalized = line.trim()
      if (normalized.length > 0) {
        files.add(normalized)
      }
    }
  }
  return [...files]
}
