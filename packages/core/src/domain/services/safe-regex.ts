/**
 * Attempts to compile a user-supplied pattern string into a `RegExp`.
 *
 * Returns `null` when the pattern is syntactically invalid, preventing
 * unhandled `SyntaxError` exceptions from `new RegExp()`.
 *
 * @param pattern - The regular expression source string
 * @param flags - Optional `RegExp` flags (e.g. `'i'`, `'m'`, `'g'`)
 * @returns The compiled `RegExp`, or `null` if the pattern is invalid
 */
export function safeRegex(pattern: string, flags?: string): RegExp | null {
  try {
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}
