/**
 * Parses a comma-separated string and validates each token against a set of allowed values.
 *
 * Tokens are trimmed and lowercased before validation. Throws if any token is not
 * in the `validValues` set.
 *
 * @param value - Comma-separated string (e.g. `"stale,missing"`)
 * @param validValues - Set of allowed token values
 * @param optionName - CLI option name for error messages (e.g. `"--status"`)
 * @returns Set of validated tokens
 * @throws {Error} When a token is not in `validValues`
 */
export function parseCommaSeparatedValues<T extends string>(
  value: string,
  validValues: ReadonlySet<T>,
  optionName: string,
): Set<T> {
  const tokens = value
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  const result = new Set<T>()
  for (const token of tokens) {
    if (!validValues.has(token as T)) {
      const allowed = [...validValues].join(', ')
      throw new Error(`invalid ${optionName} value '${token}' (valid: ${allowed})`)
    }
    result.add(token as T)
  }

  return result
}
