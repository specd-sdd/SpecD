import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'
import { hg, hgSync } from './exec.js'

/**
 * Mercurial CLI implementation of the {@link VcsAdapter} port.
 *
 * Shells out to the `hg` binary for all queries. All methods operate relative
 * to `cwd`, which defaults to `process.cwd()` when not specified.
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
      return await hg(this.cwd, 'id', '-i')
    } catch {
      return null
    }
  }

  /** @inheritdoc */
  async refAt(at: string): Promise<string | null> {
    try {
      const revision = await hg(
        this.cwd,
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
    const output = await hg(this.cwd, 'status', '--rev', baseRef)
    return output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => {
        const status = line[0]
        return status === 'M' || status === 'A' || status === 'R' || status === '?'
      })
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0)
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
