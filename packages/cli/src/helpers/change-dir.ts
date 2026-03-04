import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Locates the timestamped directory for a named change under `changesPath`.
 *
 * Change directories are named `YYYYMMDD-HHmmss-<name>`. This helper
 * scans the directory for any entry matching `*-<name>` and returns the
 * absolute path to the first match.
 *
 * @param changesPath - Absolute path to the changes storage directory
 * @param name - The change slug name
 * @returns Absolute path to the change directory, or `null` if not found
 */
export async function findChangeDir(changesPath: string, name: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await fs.readdir(changesPath)
  } catch {
    return null
  }
  const match = entries.find((e) => e.endsWith(`-${name}`))
  return match !== undefined ? path.join(changesPath, match) : null
}
