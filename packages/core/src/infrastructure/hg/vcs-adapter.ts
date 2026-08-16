import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { hg, hgSync } from './exec.js'

/**
 * Mercurial CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `hg` binary for all queries. Repository-wide operations
 * execute from the resolved root; detection still starts from `cwd`, which
 * defaults to `process.cwd()` when not specified.
 */
export class HgVcsAdapter extends VcsAdapter {
  private readonly _rootDir: string | null

  /**
   * Creates a new `HgVcsAdapter`.
   *
   * @param cwd - Working directory for hg commands; defaults to `process.cwd()`
   * @param rootDir - Optional cached repository root
   */
  constructor(cwd: string = process.cwd(), rootDir?: string) {
    super(cwd)
    this._rootDir = rootDir ?? null
  }

  /**
   * Detects whether the provided working directory is inside a Mercurial repository.
   *
   * @param cwd - Working directory to probe
   * @returns A configured `HgVcsAdapter`, or `null` when Mercurial is not active
   */
  static override async detect(cwd: string): Promise<VcsAdapter | null> {
    try {
      const rootDir = await hg(cwd, 'root')
      return new HgVcsAdapter(cwd, rootDir)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  rootDir(): string {
    return this._rootDir ?? hgSync(this.cwd, 'root')
  }

  /** @inheritdoc */
  async branch(): Promise<string> {
    return hg(this.cwd, 'branch')
  }

  /** @inheritdoc */
  async isClean(): Promise<boolean> {
    const output = await hg(this.cwd, 'status')
    return output.length === 0
  }

  /** @inheritdoc */
  async ref(): Promise<string | null> {
    try {
      const revision = await hg(this.rootDir(), 'log', '-r', '.', '--template', '{node|short}')
      return revision.length > 0 ? revision : null
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await hg(
        this.rootDir(),
        'log',
        '-d',
        `<${at}`,
        '-l',
        '1',
        '--template',
        '{node|short}',
      )
      return revision.length > 0 ? revision : null
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async modifiedFiles(baseRef: string): Promise<readonly string[]> {
    const output = await hg(this.rootDir(), 'status', '--rev', baseRef, '--print0')
    const files = new Set<string>()
    for (const entry of output.split('\0')) {
      const status = entry[0]
      if (status !== 'M' && status !== 'A' && status !== 'R' && status !== '!' && status !== '?') {
        continue
      }
      const filePath = entry.slice(2).replaceAll('\\', '/')
      if (filePath.length > 0) {
        files.add(filePath)
      }
    }
    return [...files]
  }

  /** @inheritdoc */
  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await hg(this.cwd, 'cat', '-r', ref, filePath)
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async identity(): Promise<VcsIdentity> {
    const rawIdentity = await hg(this.cwd, 'config', 'ui.username')
    const match = rawIdentity.match(/^(?<name>.+?)\s*<(?<email>[^>]+)>$/)
    if (match?.groups?.name !== undefined) {
      return {
        name: match.groups.name.trim(),
        email: (match.groups.email ?? '').trim(),
        provider: 'hg',
      }
    }
    return {
      name: rawIdentity.trim(),
      email: '',
      provider: 'hg',
    }
  }
}
