/**
 * Detects patterns that are likely to cause catastrophic backtracking (ReDoS).
 *
 * Uses a simple heuristic: rejects patterns containing nested quantifiers
 * such as `(a+)+`, `(a*)*`, `(a+)*`, or `(a*)+` where an inner quantifier
 * is followed by an outer quantifier on the same group.
 *
 * @param pattern - The regular expression source string to check
 * @returns `true` if the pattern contains nested quantifiers
 */
function hasNestedQuantifiers(pattern: string): boolean {
  // Match a group (capturing or non-capturing) whose body ends with a
  // quantifier, immediately followed by another quantifier.
  // This catches the most common ReDoS shapes: (x+)+, (x+)*, (x*)+, (x*)*,
  // and their {n,} variants.
  return /\([^)]*[+*}]\)\s*[+*{?]/.test(pattern)
}

/**
 * Attempts to compile a user-supplied pattern string into a `RegExp`.
 *
 * Returns `null` when the pattern is syntactically invalid or when the
 * pattern contains nested quantifiers that could cause catastrophic
 * backtracking (ReDoS).
 *
 * @param pattern - The regular expression source string
 * @param flags - Optional `RegExp` flags (e.g. `'i'`, `'m'`, `'g'`)
 * @returns The compiled `RegExp`, or `null` if the pattern is invalid or unsafe
 */
export function safeRegex(pattern: string, flags?: string): RegExp | null {
  if (hasNestedQuantifiers(pattern)) return null
  try {
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}
