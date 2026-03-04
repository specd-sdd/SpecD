import chalk from 'chalk'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const vlen = (s: string): number => s.normalize('NFC').length
const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - vlen(s)))

/**
 * Truncates `text` to `width` characters, appending `…` if it was cut.
 * Handles multi-byte codepoints correctly.
 *
 * @param text - The string to truncate.
 * @param width - Maximum display width in characters.
 * @returns The original string or a truncated version ending with `…`.
 */
function truncate(text: string, width: number): string {
  if (vlen(text) <= width) return text
  let i = 0
  let len = 0
  while (i < text.length) {
    const cp = text.codePointAt(i)!
    const step = cp > 0xffff ? 2 : 1
    if (len + step > width - 1) break
    len += step
    i += step
  }
  return text.slice(0, i) + '…'
}

/**
 * Word-wraps `text` into lines of at most `width` characters.
 * Breaks at spaces where possible; hard-breaks words that are longer than
 * `width`.
 *
 * @param text - The string to wrap.
 * @param width - Maximum line width in characters.
 * @returns Array of wrapped lines.
 */
function wordWrap(text: string, width: number): string[] {
  if (vlen(text) <= width) return [text]

  const lines: string[] = []
  let current = ''

  for (const word of text.split(' ')) {
    if (current === '') {
      current = fitWord(word, width, lines)
    } else {
      const candidate = current + ' ' + word
      if (vlen(candidate) <= width) {
        current = candidate
      } else {
        lines.push(current)
        current = fitWord(word, width, lines)
      }
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

/**
 * Hard-breaks a word that is longer than `width`, pushing all-but-last chunks into `acc`.
 *
 * @param word - The word to fit.
 * @param width - Maximum segment width in characters.
 * @param acc - Accumulator array to push overflow chunks into.
 * @returns The remaining tail that fits within `width`.
 */
function fitWord(word: string, width: number, acc: string[]): string {
  let rem = word
  while (vlen(rem) > width) {
    acc.push(rem.slice(0, width))
    rem = rem.slice(width)
  }
  return rem
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Definition of a single table column.
 *
 * The caller is responsible for computing `width` — typically via
 * {@link colWidth} for auto-fit, or by capping at a design limit.
 */
export type ColumnDef = {
  /** Column header label. */
  header: string
  /**
   * Fixed display width in characters.  The header and every data cell are
   * padded (or overflowed) to this width.
   */
  width: number
  /**
   * Overflow strategy when a cell value exceeds `width`:
   * - `'truncate'` (default) — cut and append `…`
   * - `'wrap'` — word-wrap across multiple physical lines, each re-aligned to
   *   the column's starting position
   */
  overflow?: 'truncate' | 'wrap'
}

/**
 * Convenience helper: computes the minimum column width that fits the header
 * and all provided cell values.
 *
 * @param header - Column header label.
 * @param cells - All data values for this column across all rows.
 * @returns Minimum display width (NFC-normalised character count).
 */
export function colWidth(header: string, cells: string[]): number {
  return Math.max(vlen(header), ...cells.map(vlen))
}

/**
 * Renders a table with a styled inverse-video header row and aligned data
 * rows.
 *
 * Column widths are **fixed** — pass the desired width per column (use
 * {@link colWidth} for auto-fit).  Cells that exceed their column width are
 * either truncated (with `…`) or word-wrapped to additional physical lines
 * depending on the column's `overflow` setting.
 *
 * @param title - Bold label printed above the header, or `null` for no title.
 * @param columns - Column definitions (header, width, overflow strategy).
 * @param rows - Data rows; each entry is an array of cell strings, one per column.
 * @returns A multi-line string ready to pass to {@link output}.
 */
export function renderTable(
  title: string | null,
  columns: ColumnDef[],
  rows: Array<string[]>,
): string {
  const headerRow = chalk.inverse.bold(
    '  ' + columns.map((c) => pad(c.header, c.width)).join('  ') + '  ',
  )

  const dataRows: string[] = []
  for (const row of rows) {
    const cellLines: string[][] = columns.map((col, i) => {
      const cell = row[i] ?? ''
      return col.overflow === 'wrap' ? wordWrap(cell, col.width) : [truncate(cell, col.width)]
    })

    const maxLines = Math.max(...cellLines.map((l) => l.length))
    for (let li = 0; li < maxLines; li++) {
      const cells = columns.map((col, i) => pad(cellLines[i]?.[li] ?? '', col.width))
      dataRows.push('  ' + cells.join('  '))
    }
  }

  const parts: string[] = []
  if (title !== null) parts.push(chalk.bold(title), '')
  parts.push(headerRow, ...dataRows)
  return parts.join('\n')
}

/**
 * Prepends a bold title line to a content block.
 *
 * @param title - The section label (e.g. `'Change:'`).
 * @param content - The pre-formatted content to display below the title.
 * @returns A multi-line string with the title followed by the content.
 */
export function renderSection(title: string, content: string): string {
  return chalk.bold(title) + '\n\n' + content
}
