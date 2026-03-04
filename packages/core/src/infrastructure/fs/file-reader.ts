import fs from 'node:fs/promises'
import * as path from 'node:path'
import { type FileReader } from '../../application/ports/file-reader.js'

/**
 * Filesystem implementation of the {@link FileReader} port.
 *
 * Reads UTF-8 text files by absolute path. Returns `null` when the file does
 * not exist rather than throwing, matching the port contract.
 *
 * When constructed with a `basePath`, every resolved path is checked against
 * that directory to prevent path-traversal attacks (e.g. `../../etc/passwd`).
 */
export class FsFileReader implements FileReader {
  private readonly _basePath: string | undefined

  /**
   * Creates a new `FsFileReader`, optionally constrained to a base directory.
   *
   * @param basePath - Optional root directory constraint. When set, any read
   *   whose resolved path escapes this directory throws an error.
   */
  constructor(basePath?: string) {
    this._basePath = basePath !== undefined ? path.resolve(basePath) : undefined
  }

  /**
   * Reads the UTF-8 text content of the file at `absolutePath`.
   *
   * @param absolutePath - The absolute filesystem path to read
   * @returns The file contents as a string, or `null` if the file does not exist
   * @throws {Error} If the resolved path escapes the configured `basePath`
   */
  async read(absolutePath: string): Promise<string | null> {
    const resolved = path.resolve(absolutePath)
    if (this._basePath !== undefined) {
      if (!resolved.startsWith(this._basePath + path.sep) && resolved !== this._basePath) {
        throw new Error(
          `Path traversal detected: "${absolutePath}" resolves outside the allowed base directory`,
        )
      }
    }

    try {
      return await fs.readFile(resolved, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
}
