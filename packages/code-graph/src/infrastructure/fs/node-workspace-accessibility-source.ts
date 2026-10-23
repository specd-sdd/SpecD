import { stat } from 'node:fs/promises'
import { WorkspaceAccessibilitySource } from '../../application/ports/workspace-accessibility-source.js'

/**
 * Node.js filesystem implementation of WorkspaceAccessibilitySource.
 */
export class NodeWorkspaceAccessibilitySource extends WorkspaceAccessibilitySource {
  /**
   * Checks whether the directory exists and is accessible.
   *
   * @param directory - Absolute directory path.
   * @returns True only when directory exists and stat reports it is a directory.
   */
  async isAccessibleDirectory(directory: string): Promise<boolean> {
    try {
      return (await stat(directory)).isDirectory()
    } catch {
      return false
    }
  }
}
