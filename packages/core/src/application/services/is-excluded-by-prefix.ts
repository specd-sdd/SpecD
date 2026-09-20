/**
 * Returns whether a portable relative path matches any exclusion prefix.
 *
 * A path matches when it equals a prefix or lives under `prefix/`.
 *
 * @param candidate - Portable relative path (`/` separators)
 * @param excludePaths - Exclusion prefixes (trailing slashes ignored)
 * @returns `true` when the candidate should be skipped
 */
export function isExcludedByPrefix(candidate: string, excludePaths: readonly string[]): boolean {
  const normalized = candidate.replaceAll('\\', '/')
  for (const raw of excludePaths) {
    const prefix = raw.replaceAll('\\', '/').replace(/\/+$/, '')
    if (prefix === '') continue
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true
    }
  }
  return false
}
