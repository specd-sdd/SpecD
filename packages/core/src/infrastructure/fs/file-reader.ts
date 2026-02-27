import fs from 'node:fs/promises'
import { type FileReader } from '../../application/ports/file-reader.js'

/**
 * Filesystem implementation of the {@link FileReader} port.
 *
 * Reads UTF-8 text files by absolute path. Returns `null` when the file does
 * not exist rather than throwing, matching the port contract.
 */
export class FsFileReader implements FileReader {
  /**
   * Reads the UTF-8 text content of the file at `absolutePath`.
   *
   * @param absolutePath - The absolute filesystem path to read
   * @returns The file contents as a string, or `null` if the file does not exist
   */
  async read(absolutePath: string): Promise<string | null> {
    try {
      return await fs.readFile(absolutePath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
}
