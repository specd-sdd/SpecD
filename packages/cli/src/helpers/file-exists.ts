import * as fs from 'node:fs/promises'

/**
 * Returns `true` if a file or directory exists at `filePath`.
 *
 * @param filePath - Absolute path to check
 * @returns Whether the path exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
