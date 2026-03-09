import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'

/**
 * Writes a file atomically by first writing to a temporary file in the same
 * directory and then renaming it into place.
 *
 * This prevents readers from observing a partially-written file.
 *
 * @param filePath - Absolute path to the target file
 * @param content - The string content to write
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp-${process.pid.toString()}-${randomUUID()}`
  await fs.writeFile(tmpPath, content, 'utf8')
  try {
    await fs.rename(tmpPath, filePath)
  } catch (err: unknown) {
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}
