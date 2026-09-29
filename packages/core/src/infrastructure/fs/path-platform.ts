import path from 'node:path'

const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [50, 100, 150, 200] as const

/**
 * Resolves VCS CLI stdout to an absolute path and uppercases a Windows drive letter.
 *
 * @param raw - Repository root printed by git, hg, or svn
 * @returns Absolute path safe to use as a later CLI working directory
 */
export function normalizeVcsRoot(raw: string): string {
  return resolvePlatformPath(raw.trim())
}

/**
 * Reports whether a resolved candidate is the root or a descendant of it.
 *
 * @param root - Directory that must contain the candidate
 * @param candidate - Path to test
 * @returns True when the candidate is the root or inside it, ignoring drive-letter case
 */
export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolvePlatformPath(root)
  const resolvedCandidate = resolvePlatformPath(candidate)
  const relative = usesWin32(resolvedRoot)
    ? path.win32.relative(resolvedRoot, resolvedCandidate)
    : path.relative(resolvedRoot, resolvedCandidate)
  if (relative === '') return true
  if (relative.startsWith('..') || path.win32.isAbsolute(relative) || path.isAbsolute(relative)) {
    return false
  }
  return true
}

/**
 * Replaces backslashes with forward slashes without collapsing `.` or `..`.
 *
 * @param value - Path text that may use Windows separators
 * @returns The same path with `/` separators
 */
export function toPortablePath(value: string): string {
  return value.replaceAll('\\', '/')
}

export { normalizeNewlines } from '../../domain/services/normalize-newlines.js'

/**
 * Retries a filesystem operation that fails because the destination is locked.
 *
 * @param operation - Work to attempt up to five times
 * @returns The operation result
 */
export async function retryOnLock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await operation()
    } catch (error: unknown) {
      if (!isLockError(error) || attempt === RETRY_DELAYS_MS.length) throw error
      await delay(RETRY_DELAYS_MS[attempt] ?? 0)
    }
  }
  throw new Error('retryOnLock exhausted attempts without a result')
}

/**
 * Reports whether a path should be resolved with Windows path rules.
 *
 * @param value - Candidate filesystem path
 * @returns True when the path has a drive letter or a backslash
 */
function usesWin32(value: string): boolean {
  return /^[A-Za-z]:/.test(value) || value.includes('\\')
}

/**
 * Resolves a path and uppercases a Windows drive letter.
 *
 * @param value - Absolute or relative filesystem path
 * @returns The resolved path
 */
function resolvePlatformPath(value: string): string {
  const resolved = usesWin32(value) ? path.win32.resolve(value) : path.resolve(value)
  return resolved.replace(/^([A-Za-z]):/, (_match, letter: string) => `${letter.toUpperCase()}:`)
}

/**
 * Reports whether an error is a Windows or POSIX file lock.
 *
 * @param error - Caught filesystem error
 * @returns True for `EPERM`, `EBUSY`, or `EACCES`
 */
function isLockError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    LOCK_CODES.has(error.code)
  )
}

/**
 * Waits before the next lock retry.
 *
 * @param ms - Delay in milliseconds
 * @returns A promise that resolves after `ms`
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
