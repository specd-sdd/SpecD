/**
 * Normalizes a code snippet for CLI display.
 * Expands tabs, removes common leading indentation, and applies an optional margin.
 *
 * @param text - The raw snippet text.
 * @param options - Normalization options.
 * @param options.tabWidth - Number of spaces per tab (default 2).
 * @param options.margin - Number of spaces to prefix every line (optional).
 * @returns The normalized snippet.
 */
export function normalizeSnippet(
  text: string,
  options: { tabWidth?: number; margin?: number } = {},
): string {
  const tabWidth = options.tabWidth ?? 2
  const margin = ' '.repeat(options.margin ?? 0)

  // 1. Expand tabs and split into lines
  const lines = text
    .replaceAll('\t', ' '.repeat(tabWidth))
    .split(/\r?\n/)
    .map((line) => line.trimEnd())

  // 2. Identify minimum leading indentation across non-empty lines
  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim().length === 0) continue
    const indent = line.length - line.trimStart().length
    if (indent < minIndent) minIndent = indent
  }

  if (minIndent === Infinity) minIndent = 0

  // 3. Strip min indentation and apply margin
  return lines
    .map((line) => {
      if (line.trim().length === 0) return ''
      return margin + line.slice(minIndent)
    })
    .join('\n')
}
