/**
 * Expands one search token into normalized lexical variants useful for
 * specd/code-shaped search ranking without inferring the intended entity type.
 *
 * Variants preserve the normalized original token, then add separator-aware and
 * CamelCase/PascalCase-aware pieces in stable order.
 *
 * @param raw - Raw token text, typically one whitespace-delimited query token.
 * @returns Normalized token variants in stable order with duplicates removed.
 */
export function expandSearchToken(raw: string): string[] {
  const normalized = raw.trim().toLowerCase()
  if (normalized.length === 0) {
    return []
  }

  const parts = splitCodeLikeToken(raw)
  return dedupeStable([normalized, ...parts])
}

/**
 * Expands a raw search query into normalized full-query and token-level variants.
 *
 * `rawTokens` preserve the normalized whitespace-delimited tokens. `expandedTokens`
 * augments them with separator-aware and CamelCase-aware pieces for downstream
 * identity ranking.
 *
 * @param rawQuery - Raw user query text.
 * @returns The normalized full query, normalized raw tokens, and expanded tokens.
 */
export function expandSearchQuery(rawQuery: string): {
  normalizedQuery: string
  rawTokens: string[]
  expandedTokens: string[]
} {
  const rawTokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)

  return {
    normalizedQuery: rawTokens.join(' '),
    rawTokens,
    expandedTokens: dedupeStable(rawTokens.flatMap((token) => expandSearchToken(token))),
  }
}

/**
 * Splits one specd/code-shaped token into lowercase component tokens.
 *
 * @param raw - Raw token text.
 * @returns Lowercase token parts in source order.
 */
function splitCodeLikeToken(raw: string): string[] {
  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/[:/_.-]+/g, ' ')
    .toLowerCase()
    .trim()

  if (normalized.length === 0) {
    return []
  }

  return normalized.split(/\s+/).filter((part) => part.length > 0)
}

/**
 * Removes duplicates while preserving the original order.
 *
 * @param values - Values to deduplicate.
 * @returns A stable de-duplicated array.
 */
function dedupeStable(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }

  return result
}
