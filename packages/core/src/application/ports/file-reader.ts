/**
 * Port for reading arbitrary files from the filesystem.
 *
 * Used by `CompileContext` (and similar use cases) to load file content by
 * absolute path without coupling application logic to a concrete `fs` import.
 * Returns `null` when the file does not exist, rather than throwing.
 *
 * Unlike the repository ports, `FileReader` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface FileReader {
  /**
   * Reads the UTF-8 text content of the file at `absolutePath`.
   *
   * @param absolutePath - The absolute filesystem path to read
   * @returns The file contents as a string, or `null` if the file does not exist
   */
  read(absolutePath: string): Promise<string | null>
}
