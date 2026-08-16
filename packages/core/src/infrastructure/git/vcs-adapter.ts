import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { git, gitSync } from './exec.js'

/**
 * Git CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `git` binary for all queries. Repository-wide operations
 * execute from the resolved root; detection still starts from `cwd`, which
 * defaults to `process.cwd()` when not specified.
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
      return await git(this.rootDir(), 'rev-parse', '--short', 'HEAD')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const rootDir = this.rootDir()
      const revision = await git(rootDir, 'rev-list', '-1', `--before=${at}`, 'HEAD')
      if (revision.length === 0) return null
      return await git(rootDir, 'rev-parse', '--short', revision)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const rootDir = this.rootDir()
    const diffOutput = await git(
      rootDir,
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      baseRef,
      '--',
    )
    const untrackedOutput = await git(rootDir, 'ls-files', '-z', '--others', '--exclude-standard')
    return normalizeGitPaths(diffOutput, untrackedOutput)
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
 * Parses null-delimited Git diff and untracked-file output into unique paths.
 *
 * @param diffOutput - Output from `git diff --name-status -z`
 * @param untrackedOutput - Output from `git ls-files -z --others`
 * @returns Unique, non-empty repository-relative file paths
 */
function normalizeGitPaths(diffOutput: string, untrackedOutput: string): readonly string[] {
  const files = new Set<string>()

  const fields = diffOutput.split('\0')
  for (let index = 0; index < fields.length; ) {
    const status = fields[index]
    if (status === undefined || status.length === 0) {
      index += 1
      continue
    }

    const firstPath = fields[index + 1]
    index += 2

    if (status.startsWith('R')) {
      if (firstPath !== undefined) {
        addPortablePath(files, firstPath)
      }
      const secondPath = fields[index]
      if (secondPath !== undefined) {
        addPortablePath(files, secondPath)
      }
      index += 1
    } else if (status.startsWith('C')) {
      const secondPath = fields[index]
      if (secondPath !== undefined) {
        addPortablePath(files, secondPath)
      }
      index += 1
    } else if (firstPath !== undefined) {
      addPortablePath(files, firstPath)
    }
  }

  for (const untrackedPath of untrackedOutput.split('\0')) {
    addPortablePath(files, untrackedPath)
  }

  return [...files]
}

/**
 * Adds one non-empty path using the port's portable separator convention.
 *
 * @param files - Accumulated unique paths
 * @param filePath - Repository-relative path emitted by Git
 */
function addPortablePath(files: Set<string>, filePath: string): void {
  const normalized = filePath.replaceAll('\\', '/')
  if (normalized.length > 0) {
    files.add(normalized)
  }
}
