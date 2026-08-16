import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { svn, svnSync } from './exec.js'

/**
 * Subversion CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `svn` binary for all queries. Working-copy-wide operations
 * execute from the resolved root; detection still starts from `cwd`, which
 * defaults to `process.cwd()` when not specified.
 */
export class SvnVcsAdapter extends VcsAdapter {
  private readonly _rootDir: string | null

  /**
   * Creates a new `SvnVcsAdapter`.
   *
   * @param cwd - Working directory for svn commands; defaults to `process.cwd()`
   * @param rootDir - Optional cached working-copy root
   */
  constructor(cwd: string = process.cwd(), rootDir?: string) {
    super(cwd)
    this._rootDir = rootDir ?? null
  }

  /**
   * Detects whether the provided working directory is inside a Subversion working copy.
   *
   * @param cwd - Working directory to probe
   * @returns A configured `SvnVcsAdapter`, or `null` when Subversion is not active
   */
  static override async detect(cwd: string): Promise<VcsAdapter | null> {
    try {
      const rootDir = await svn(cwd, 'info', '--show-item', 'wc-root')
      return new SvnVcsAdapter(cwd, rootDir)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  rootDir(): string {
    return this._rootDir ?? svnSync(this.cwd, 'info', '--show-item', 'wc-root')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    const relativeUrl = await svn(this.cwd, 'info', '--show-item', 'relative-url')
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
    const output = await svn(this.cwd, 'status')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      return await svn(this.rootDir(), 'info', '--show-item', 'revision')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await svn(this.rootDir(), 'info', '--show-item', 'revision', '-r', `{${at}}`)
      return revision.length > 0 ? revision : null
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const rootDir = this.rootDir()
    const diffOutput = await svn(rootDir, 'diff', '--summarize', '-r', `${baseRef}:WORKING`)
    const statusOutput = await svn(rootDir, 'status')
    return normalizeSvnPaths(diffOutput, statusOutput)
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await svn(this.cwd, 'cat', '-r', ref, filePath)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async identity(): Promise<VcsIdentity> {
    const name = await svn(this.cwd, 'info', '--show-item', 'last-changed-author')
    return { name, email: '', provider: 'svn' }
  }
}

/**
 * Normalizes `svn diff --summarize` and `svn status` outputs into unique paths.
 *
 * @param diffOutput - Output from `svn diff --summarize`
 * @param statusOutput - Output from `svn status`
 * @returns Unique, non-empty repository-relative file paths
 */
function normalizeSvnPaths(diffOutput: string, statusOutput: string): readonly string[] {
  const files = new Set<string>()

  for (const line of diffOutput.split('\n')) {
    addSvnStatusPath(files, line)
  }

  for (const line of statusOutput.split('\n')) {
    const status = line[0]
    if (
      status === 'M' ||
      status === 'A' ||
      status === 'D' ||
      status === 'R' ||
      status === '!' ||
      status === '?' ||
      status === '~'
    ) {
      addSvnStatusPath(files, line)
    }
  }

  return [...files]
}

/**
 * Adds the path column from one SVN status-shaped output line.
 *
 * Both `svn status` and `svn diff --summarize` reserve seven status columns
 * followed by a separator before the path.
 *
 * @param files - Accumulated unique paths
 * @param line - Native SVN output line
 */
function addSvnStatusPath(files: Set<string>, line: string): void {
  if (line.length <= 8) return
  const filePath = line.slice(8).trimEnd().replaceAll('\\', '/')
  if (filePath.length > 0) {
    files.add(filePath)
  }
}
