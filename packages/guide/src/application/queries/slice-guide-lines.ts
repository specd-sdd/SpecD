/**
 * Slices content lines using 1-indexed line numbers.
 *
 * @param content - The raw string content to slice.
 * @param startLine - 1-indexed line to start slicing from (defaults to 1 if <= 0).
 * @param lineCount - Maximum number of lines to return. If omitted, returns all remaining lines.
 * @returns The sliced string.
 */
export function sliceGuideLines(content: string, startLine?: number, lineCount?: number): string {
  if (!content) {
    return ''
  }

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const total = lines.length

  const safeStart = startLine === undefined || startLine < 1 ? 1 : Math.floor(startLine)

  if (safeStart > total) {
    return ''
  }

  if (lineCount !== undefined && lineCount <= 0) {
    return ''
  }

  const startIndex = safeStart - 1
  const endIndex = lineCount !== undefined ? startIndex + Math.floor(lineCount) : total

  return lines.slice(startIndex, endIndex).join('\n')
}

/**
 * Prefixes each line with a right-aligned 1-indexed line number.
 *
 * @param content - The string content to number.
 * @param startLine - The line number of the first line (defaults to 1).
 * @returns The numbered string.
 */
export function formatWithLineNumbers(content: string, startLine?: number): string {
  if (!content) {
    return ''
  }

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const baseLine = startLine === undefined || startLine < 1 ? 1 : Math.floor(startLine)
  const maxLine = baseLine + lines.length - 1
  const padWidth = String(maxLine).length

  return lines
    .map((line, idx) => {
      const lineNum = String(baseLine + idx).padStart(padWidth, ' ')
      return `${lineNum} | ${line}`
    })
    .join('\n')
}
