/**
 * Reads resolution-manifest existence and text for fingerprint discovery.
 *
 * Application code depends on this port. Filesystem access stays in infrastructure.
 */
export interface ResolutionManifestSource {
  /**
   * Reports whether a directory exists.
   * @param path - Absolute directory path.
   * @returns True when the path is an existing directory.
   */
  directoryExists(path: string): boolean

  /**
   * Reports whether a path is a regular file.
   * @param path - Absolute file path.
   * @returns True when the path is a regular file.
   */
  isRegularFile(path: string): boolean

  /**
   * Reads a manifest as UTF-8 text.
   * @param path - Absolute file path.
   * @returns File text, or undefined when the file cannot be read.
   */
  readText(path: string): string | undefined
}

/**
 * Manifest source that reports no directories and no files.
 */
export const emptyResolutionManifestSource: ResolutionManifestSource = {
  directoryExists(): boolean {
    return false
  },
  isRegularFile(): boolean {
    return false
  },
  readText(): string | undefined {
    return undefined
  },
}
