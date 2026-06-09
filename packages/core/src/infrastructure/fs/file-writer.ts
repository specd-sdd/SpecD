import { type FileWriter } from '../../application/ports/file-writer.js'
import { writeFileAtomic } from './write-atomic.js'

/**
 * Filesystem implementation of the {@link FileWriter} port.
 */
export class FsFileWriter implements FileWriter {
  /**
   * Writes a file atomically.
   *
   * @param path - Absolute path to the file.
   * @param content - Content to write.
   */
  async write(path: string, content: string): Promise<void> {
    await writeFileAtomic(path, content)
  }
}
