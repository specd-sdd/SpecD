import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Safely merges configuration updates into a JSON file, preserving existing properties.
 * Creates the file and parent directories if they do not exist.
 *
 * @param filePath - Path to JSON file.
 * @param updater - Transformation callback receiving existing data and returning updated shape.
 */
export async function mergeJsonConfig<T extends Record<string, unknown>>(
  filePath: string,
  updater: (existing: T) => T,
): Promise<void> {
  let existingData = {} as T
  try {
    const raw = await readFile(filePath, 'utf8')
    existingData = JSON.parse(raw) as T
  } catch {
    existingData = {} as T
  }

  const updatedData = updater(existingData)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(updatedData, null, 2)}\n`, 'utf8')
}

/**
 * Safely removes configuration entries from a JSON file using an updater callback.
 * Acts as a graceful no-op if the file does not exist or contains invalid JSON.
 *
 * @param filePath - Path to JSON file.
 * @param updater - Transformation callback receiving existing data and returning cleaned shape.
 */
export async function unmergeJsonConfig<T extends Record<string, unknown>>(
  filePath: string,
  updater: (existing: T) => T,
): Promise<void> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const existingData = JSON.parse(raw) as T
    const updatedData = updater(existingData)
    await writeFile(filePath, `${JSON.stringify(updatedData, null, 2)}\n`, 'utf8')
  } catch {
    // If file does not exist or is invalid JSON, unmerge is gracefully a no-op
    return
  }
}
