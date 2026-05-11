import { type VcsAdapter } from '../application/ports/vcs-adapter.js'

/**
 * Named VCS detection provider.
 */
export interface VcsProvider {
  /** Human-readable provider name for debugging and tests. */
  readonly name: string

  /**
   * Attempts to detect and create a concrete VCS adapter for `cwd`.
   *
   * @param cwd - Directory to inspect
   * @returns A concrete adapter when the provider applies, otherwise `null`
   */
  detect(cwd: string): Promise<VcsAdapter | null>
}
