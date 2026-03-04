/**
 * Shifts all Markdown ATX heading levels in a text block by a given delta.
 * Lines inside fenced code blocks are left untouched. Levels are clamped to 1–6.
 *
 * @param markdown - The Markdown text to transform
 * @param delta - Amount to shift heading levels (positive = deeper)
 * @returns Transformed Markdown with adjusted heading levels
 */
export function shiftHeadings(markdown: string, delta: number): string {
  if (delta === 0) return markdown
  const lines = markdown.split('\n')
  let inFence = false
  const result: string[] = []
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence) {
      result.push(line)
      continue
    }
    const m = /^(#{1,6})(\s.*)$/.exec(line)
    if (m) {
      const level = Math.max(1, Math.min(6, m[1]!.length + delta))
      result.push(`${'#'.repeat(level)}${m[2]}`)
    } else {
      result.push(line)
    }
  }
  return result.join('\n')
}
