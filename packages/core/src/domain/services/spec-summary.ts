/**
 * Extracts a short summary from the content of a `spec.md` file.
 *
 * Resolution order (first match wins):
 * 1. First non-empty paragraph immediately after the `# H1` heading.
 * 2. First paragraph of the first `## Overview`, `## Summary`, or
 *    `## Purpose` section.
 *
 * Returns `null` when no summary can be extracted.
 *
 * @param content - Raw markdown content of a spec file
 * @returns A single-line summary string, or `null` if none found
 */
export function extractSpecSummary(content: string): string | null {
  const lines = content.split('\n')

  // Locate the H1 heading
  let h1Index = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^# .+/.test(lines[i] ?? '')) {
      h1Index = i
      break
    }
  }

  if (h1Index >= 0) {
    // Strategy 1: first non-empty paragraph right after H1
    let i = h1Index + 1
    while (i < lines.length && (lines[i] ?? '').trim() === '') i++

    if (i < lines.length && !(lines[i] ?? '').startsWith('#')) {
      const para: string[] = []
      while (
        i < lines.length &&
        (lines[i] ?? '').trim() !== '' &&
        !(lines[i] ?? '').startsWith('#')
      ) {
        para.push((lines[i] ?? '').trim())
        i++
      }
      if (para.length > 0) return para.join(' ')
    }
  }

  // Strategy 2: first paragraph of Overview / Summary / Purpose section
  for (let j = 0; j < lines.length; j++) {
    if (/^## (Overview|Summary|Purpose)\s*$/.test(lines[j] ?? '')) {
      let k = j + 1
      while (k < lines.length && (lines[k] ?? '').trim() === '') k++
      const para: string[] = []
      while (
        k < lines.length &&
        (lines[k] ?? '').trim() !== '' &&
        !(lines[k] ?? '').startsWith('#')
      ) {
        para.push((lines[k] ?? '').trim())
        k++
      }
      if (para.length > 0) return para.join(' ')
    }
  }

  return null
}
