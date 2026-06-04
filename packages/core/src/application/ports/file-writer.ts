/**
 * Port for writing strings to the filesystem.
 */
export interface FileWriter {
  /**
   * Writes the given content to a file.
   *
   * @param path - Absolute path to the target file.
   * @param content - String content to write.
   */
  write(path: string, content: string): Promise<void>
}
