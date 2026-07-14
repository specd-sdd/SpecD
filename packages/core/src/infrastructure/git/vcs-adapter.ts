import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { git, gitSync } from './exec.js'

/**
 * Git CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `git` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
 */
export class GitVcsAdapter extends VcsAdapter {
  private readonly _rootDir: string | null

  /**
   * Creates a new `GitVcsAdapter`.
   *
   * @param cwd - Working directory for git commands; defaults to `process.cwd()`
   * @param rootDir - Optional cached repository root
   */
  constructor(cwd: string = process.cwd(), rootDir?: string) {
    super(cwd)
    this._rootDir = rootDir ?? null
  }

  /**
   * Detects whether the provided working directory is inside a git repository.
   *
   * @param cwd - Working directory to probe
   * @returns A configured `GitVcsAdapter`, or `null` when git is not active
   */
  static override async detect(cwd: string): Promise<VcsAdapter | null> {
    try {
      const rootDir = await git(cwd, 'rev-parse', '--show-toplevel')
      return new GitVcsAdapter(cwd, rootDir)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  rootDir(): string {
    return this._rootDir ?? gitSync(this.cwd, 'rev-parse', '--show-toplevel')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    try {
      return await git(this.cwd, 'symbolic-ref', '--short', 'HEAD')
    } catch {
      return 'HEAD'
    }
  }

  /** @inheritdoc */
  async isClean(): Promise<boolean> {
    const output = await git(this.cwd, 'status', '--porcelain')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      return await git(this.cwd, 'rev-parse', '--short', 'HEAD')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await git(this.cwd, 'rev-list', '-1', `--before=${at}`, 'HEAD')
      if (revision.length === 0) return null
      return await git(this.cwd, 'rev-parse', '--short', revision)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const diffOutput = await git(
      this.cwd,
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      baseRef,
      '--',
    )
    const untrackedOutput = await git(this.cwd, 'ls-files', '--others', '--exclude-standard')
    return normalizePaths(diffOutput, untrackedOutput)
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await git(this.cwd, 'show', `${ref}:${filePath}`)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async identity(): Promise<VcsIdentity> {
    const [name, email] = await Promise.all([
      git(this.cwd, 'config', 'user.name'),
      git(this.cwd, 'config', 'user.email'),
    ])
    return { name, email, provider: 'git' }
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
