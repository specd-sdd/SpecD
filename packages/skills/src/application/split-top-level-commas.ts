/**
 * Splits a comma-separated list on top-level commas only.
 *
 * Commas nested inside parentheses (for example `Bash(a, b)`) do not split.
 * Entries are trimmed and empty entries are dropped.
 *
 * @param value - Comma-separated list
 * @returns Trimmed non-empty entries
 */
export function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth++
    else if (char === ')' && depth > 0) depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((t) => t.trim()).filter((t) => t.length > 0)
}
