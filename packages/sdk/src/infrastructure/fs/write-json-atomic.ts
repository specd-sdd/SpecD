import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Writes a JSON file atomically: creates the parent directory, writes to a
 * temporary sibling file (PID + UUID suffix) and renames it into place.
 * The temporary file is removed when the rename fails, so readers never
 * observe a partially-written target.
 *
 * Mirrors core's internal `writeFileAtomic` semantics; kept sdk-local because
 * core cannot depend on sdk and the public core barrel stays free of
 * infrastructure utilities.
 *
 * @param filePath - Absolute path to the target JSON file
 * @param content - Serialized JSON content to write
 */
export async function writeJsonAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid.toString()}-${randomUUID()}`
  await writeFile(tempPath, content, 'utf-8')
  try {
    await rename(tempPath, filePath)
  } catch (err: unknown) {
    await unlink(tempPath).catch(() => {})
    throw err
  }
}
