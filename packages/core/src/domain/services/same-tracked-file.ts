/**
 * Tells whether two logical file names denote the same tracked file on the host platform.
 *
 * On Windows and macOS (case-insensitive file systems) two names that differ only in letter case
 * denote the same file; on every other host names are compared exactly. The comparison never
 * alters either name: callers keep the spelling that was recorded first.
 *
 * @param a - First logical (forward-slash) file name
 * @param b - Second logical (forward-slash) file name
 * @param platform - Host platform (default: `process.platform`)
 * @returns `true` when both names denote the same file
 */
export function sameTrackedFile(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (a === b) return true
  if (platform === 'win32' || platform === 'darwin') return a.toLowerCase() === b.toLowerCase()
  return false
}
