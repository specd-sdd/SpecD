/**
 * Application port for checking whether package discovery may inspect a code root.
 */
export abstract class WorkspaceAccessibilitySource {
  /**
   * Checks whether the directory exists and is a readable directory.
   *
   * @param directory - Absolute directory, typically a workspace code root.
   * @returns True only when directory exists and is a readable directory. Implementations may reject.
   */
  abstract isAccessibleDirectory(directory: string): Promise<boolean>
}
