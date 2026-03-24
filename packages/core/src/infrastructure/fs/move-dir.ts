import * as fs from 'node:fs/promises'

/**
 * Moves a directory from `source` to `target`, creating parent directories
 * as needed.
 *
 * Attempts an atomic `fs.rename` first. If the target already exists
 * (`ENOTEMPTY` or `EEXIST`), falls back to a recursive copy followed by
 * removal of the source. The fallback is not atomic but avoids data loss —
 * the source is only removed after the copy succeeds.
 *
 * @param source - Absolute path to the source directory
 * @param target - Absolute path to the target directory
 */
export async function moveDir(source: string, target: string): Promise<void> {
  try {
    await fs.rename(source, target)
  } catch (err) {
    if (!isRenameConflict(err)) throw err
    await fs.cp(source, target, { recursive: true })
    await fs.rm(source, { recursive: true })
  }
}

/**
 * Returns `true` if the error is a rename conflict caused by the target
 * directory already existing.
 *
 * @param err - The caught error value to inspect
 * @returns Whether the error is ENOTEMPTY or EEXIST
 */
function isRenameConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as NodeJS.ErrnoException).code
  return code === 'ENOTEMPTY' || code === 'EEXIST'
}
