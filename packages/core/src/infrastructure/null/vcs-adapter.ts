import { VcsAdapter, type VcsIdentity } from '../../application/ports/vcs-adapter.js'

/**
 * Null implementation of the {@link VcsAdapter} port.
 *
 * Used when no VCS is detected. `rootDir()` throws because there is no
 * repository root to return. Other methods return safe defaults.
 */
export class NullVcsAdapter extends VcsAdapter {
  /**
   * Creates a new `NullVcsAdapter`.
   */
  constructor() {
    super(process.cwd())
  }

  /** @inheritdoc */
  rootDir(): string {
    throw new Error('no VCS detected')
  }

  /** @inheritdoc */
  branch(): Promise<string> {
    return Promise.resolve('none')
  }

  /** @inheritdoc */
  isClean(): Promise<boolean> {
    return Promise.resolve(true)
  }

  /** @inheritdoc */
  ref(): Promise<string | null> {
    return Promise.resolve(null)
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  refAt(at: string): Promise<string | null> {
    return Promise.resolve(null)
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  modifiedFiles(baseRef: string): Promise<readonly string[]> {
    return Promise.resolve([])
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  show(ref: string, filePath: string): Promise<string | null> {
    return Promise.resolve(null)
  }

  /** @inheritdoc */
  identity(): Promise<VcsIdentity> {
    return Promise.resolve({ name: 'unknown', email: '', provider: 'null' })
  }
}
