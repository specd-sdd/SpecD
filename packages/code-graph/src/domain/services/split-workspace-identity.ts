const DRIVE_LETTER_PATH = /^[A-Za-z]:(?:[/\\]|$)/

/**
 * Reports whether a path starts with a Windows drive letter.
 *
 * @param value - Candidate graph identity or filesystem path
 * @returns True when the string is `C:`, `C:/...`, or `C:\...`
 */
export function isDriveLetterPath(value: string): boolean {
  return DRIVE_LETTER_PATH.test(value)
}

/**
 * Splits a `workspace:relative` graph identity.
 *
 * @param value - Canonical graph path
 * @returns The workspace and relative path, or null when `value` is a drive-letter path or has no workspace prefix
 */
export function splitWorkspaceIdentity(
  value: string,
): { workspace: string; relativePath: string } | null {
  if (isDriveLetterPath(value)) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  return { workspace: value.slice(0, index), relativePath: value.slice(index + 1) }
}

/**
 * Converts filesystem separators to `/` without collapsing `.` or `..`.
 *
 * @param value - Relative path that may use Windows separators
 * @returns The same segments joined with `/`
 */
export function toPortableGraphPath(value: string): string {
  return value.replaceAll('\\', '/')
}
