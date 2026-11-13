import { WorkspaceAccessibilitySource } from '../../src/application/ports/workspace-accessibility-source.js'

/**
 * Test fake for WorkspaceAccessibilitySource.
 */
export class FakeWorkspaceAccessibilitySource extends WorkspaceAccessibilitySource {
  constructor(
    private readonly accessible:
      | boolean
      | ((directory: string) => boolean | Promise<boolean>) = true,
  ) {
    super()
  }

  async isAccessibleDirectory(directory: string): Promise<boolean> {
    if (typeof this.accessible === 'function') {
      return this.accessible(directory)
    }
    return this.accessible
  }
}

export const alwaysAccessibleSource: WorkspaceAccessibilitySource =
  new FakeWorkspaceAccessibilitySource(true)
