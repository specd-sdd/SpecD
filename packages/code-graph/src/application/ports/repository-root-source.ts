/**
 * Resolves the root of the version-control repository that contains a directory.
 */
export abstract class RepositoryRootSource {
  /**
   * @param directory - Absolute directory, typically a workspace code root.
   * @returns The absolute repository root, or `undefined` when no repository is detected or detection fails. Never rejects.
   */
  abstract resolve(directory: string): Promise<string | undefined>
}

/**
 * Default repository root source that reports no repository root.
 */
export class EmptyRepositoryRootSource extends RepositoryRootSource {
  /**
   * Resolves no repository root.
   * @returns Undefined always.
   */
  resolve(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }
}

export const emptyRepositoryRootSource: RepositoryRootSource = new EmptyRepositoryRootSource()
