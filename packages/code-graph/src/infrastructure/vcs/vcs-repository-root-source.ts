import { type VcsAdapter } from '@specd/core'
import { RepositoryRootSource } from '../../application/ports/repository-root-source.js'

/**
 * Resolves repository roots using @specd/core's VCS detection.
 */
export class VcsRepositoryRootSource extends RepositoryRootSource {
  /**
   * Constructs a VcsRepositoryRootSource.
   * @param createAdapter - Factory that creates a VCS adapter for a directory.
   */
  constructor(private readonly createAdapter: (directory: string) => Promise<VcsAdapter>) {
    super()
  }

  /**
   * Resolves repository root for a directory.
   * @param directory - Directory path.
   * @returns Repository root directory or undefined.
   */
  async resolve(directory: string): Promise<string | undefined> {
    try {
      const adapter = await this.createAdapter(directory)
      return adapter.rootDir()
    } catch {
      return undefined
    }
  }
}
