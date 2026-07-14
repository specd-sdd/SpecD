import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { svn, svnSync } from './exec.js'

/**
 * Subversion CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `svn` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
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
      return await svn(this.cwd, 'info', '--show-item', 'revision')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await svn(this.cwd, 'info', '--show-item', 'revision', '-r', `{${at}}`)
      return revision.length > 0 ? revision : null
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const diffOutput = await svn(this.cwd, 'diff', '--summarize', '-r', `${baseRef}:WORKING`)
    const statusOutput = await svn(this.cwd, 'status')
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
    const normalized = line.trim()
    if (normalized.length === 0) continue
    const parts = normalized.split(/\s+/)
    const file = parts[parts.length - 1]
    if (file !== undefined && file.length > 0) {
      files.add(file)
    }
  }

  for (const line of statusOutput.split('\n')) {
    if (!line.startsWith('?')) continue
    const file = line.slice(1).trim()
    if (file.length > 0) {
      files.add(file)
    }
  }

  return [...files]
}
