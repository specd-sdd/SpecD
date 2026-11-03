import path from 'node:path'

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
 * Reports whether a path is a UNC share (`\\server\share` or portable `//server/share`).
 *
 * @param value - Candidate filesystem path
 * @returns True when the path is UNC-shaped
 */
export function isUncPath(value: string): boolean {
  return value.startsWith('\\\\') || value.startsWith('//')
}

/**
 * Reports whether a path is an absolute filesystem path (POSIX, drive-letter, UNC, or `\foo`).
 *
 * Workspace identities such as `core:src/a.ts` are not absolute filesystem paths.
 *
 * @param value - Candidate path (may still carry a workspace prefix — callers should strip first)
 * @returns True when the path names an absolute filesystem location
 */
export function isAbsoluteGraphFilesystemPath(value: string): boolean {
  if (isUncPath(value) || isDriveLetterPath(value) || value.startsWith('\\')) return true
  if (path.posix.isAbsolute(value)) return true
  if (value.includes('\\') && path.win32.isAbsolute(value)) return true
  return false
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

/**
 * Chooses path semantics for resolving an absolute or Windows-shaped filesystem path.
 *
 * UNC, drive-letter, and backslash paths use win32 rules so `//server/...` is not collapsed
 * by posix `resolve`; plain POSIX `/...` paths keep posix rules on every host.
 *
 * @param value - Absolute filesystem path or path fragment that may contain `\`
 * @returns The platform path API to use for dirname/resolve
 */
function graphFsPath(value: string): path.PlatformPath {
  return isUncPath(value) || isDriveLetterPath(value) || value.includes('\\')
    ? path.win32
    : path.posix
}

/**
 * Normalizes an absolute Windows-shaped path to portable `/` form.
 *
 * @param value - UNC, drive-letter, or backslash absolute path
 * @returns Portable absolute path
 */
function portableWindowsAbsolute(value: string): string {
  return toPortableGraphPath(path.win32.normalize(value.replaceAll('/', '\\')))
}

/**
 * Resolves `target` relative to `fromFile` into a portable graph path.
 *
 * Preserves a `workspace:` prefix when `fromFile` is a workspace identity. Absolute
 * filesystem bases (POSIX `/...`, Windows drive letters, UNC) are resolved with the matching
 * path API and then normalized to `/` so relation targets match `createSymbolNode` keys.
 *
 * An empty `target` resolves to the directory of `fromFile` (portable).
 *
 * @param fromFile - Workspace identity (`ws:rel`) or absolute filesystem path of the importing file
 * @param target - Relative specifier, POSIX absolute path, Windows drive path, or UNC path
 * @returns Portable path (`/` separators) suitable as a graph file identity or absolute FS key
 */
export function resolveGraphPath(fromFile: string, target: string): string {
  if (isUncPath(target) || isDriveLetterPath(target) || target.startsWith('\\')) {
    return portableWindowsAbsolute(target)
  }
  if (target.includes('\\') && path.win32.isAbsolute(target)) {
    return portableWindowsAbsolute(target)
  }
  if (target.startsWith('/')) {
    return toPortableGraphPath(target)
  }

  const identity = splitWorkspaceIdentity(fromFile)
  const prefix = identity === null ? '' : `${identity.workspace}:`
  const rawPath = identity === null ? fromFile : identity.relativePath

  if (isAbsoluteGraphFilesystemPath(rawPath)) {
    const api = graphFsPath(rawPath)
    if (target === '') {
      return toPortableGraphPath(api.dirname(rawPath))
    }
    return toPortableGraphPath(api.resolve(api.dirname(rawPath), toPortableGraphPath(target)))
  }

  const fromPortable = toPortableGraphPath(rawPath)
  if (target === '') {
    const dir = path.posix.dirname(fromPortable)
    return `${prefix}${dir === '.' ? '' : dir}`
  }
  const targetPortable = toPortableGraphPath(target)
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPortable), targetPortable),
  )
  return `${prefix}${resolved}`
}
