import chalk from 'chalk'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the visual character length of a string after NFC normalisation.
 *
 * @param s - The string to measure
 * @returns The NFC-normalised character count
 */
export const vlen = (s: string): number => s.normalize('NFC').length
/**
 * Right-pads a string to `w` characters using spaces.
 *
 * @param s - The string to pad
 * @param w - Target width in characters
 * @returns The padded string
 */
export const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - vlen(s)))

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
 * Options for table layout and rendering.
 */
export type RenderTableOptions = {
  /**
   * Explicit terminal width override. If omitted, defaults to `process.stdout.columns`.
   */
  readonly terminalWidth?: number | undefined
  /**
   * Minimum width in characters to maintain per column during right-to-left reduction.
   * Defaults to 10.
   */
  readonly minColumnWidth?: number | undefined
}

/**
 * Adjusts column widths from right to left so the table fits within `terminalWidth`.
 * Each column is reduced down to `minColumnWidth` (default 10) starting from the rightmost
 * column before reducing the preceding column.
 *
 * @param columns - Array of column definitions
 * @param options - Options including terminal width and minimum column width
 * @returns A new array of ColumnDef with adjusted widths
 */
export function fitColumnsToTerminal(
  columns: readonly ColumnDef[],
  options?: RenderTableOptions,
): ColumnDef[] {
  const terminalWidth = options?.terminalWidth ?? process.stdout.columns
  if (!terminalWidth || terminalWidth <= 0 || columns.length === 0) {
    return columns.map((c) => ({ ...c }))
  }

  const minColWidth = Math.max(1, options?.minColumnWidth ?? 10)
  const totalSpacing = 2 * (columns.length + 1)
  const availableWidth = terminalWidth - totalSpacing

  const adjusted: ColumnDef[] = columns.map((c) => ({ ...c }))
  const totalWidth = adjusted.reduce((acc, c) => acc + c.width, 0)
  let excess = totalWidth - availableWidth

  if (excess <= 0) {
    return adjusted
  }

  // Pass 1: Reduce from right to left down to minColWidth (or original width if already smaller)
  for (let i = adjusted.length - 1; i >= 0 && excess > 0; i--) {
    const col = adjusted[i]!
    const floor = Math.min(col.width, minColWidth)
    const canReduce = col.width - floor
    if (canReduce > 0) {
      const reduceBy = Math.min(excess, canReduce)
      col.width -= reduceBy
      excess -= reduceBy
    }
  }

  // Pass 2: If still overflowing, reduce further from right to left down to 1
  if (excess > 0) {
    for (let i = adjusted.length - 1; i >= 0 && excess > 0; i--) {
      const col = adjusted[i]!
      const canReduce = col.width - 1
      if (canReduce > 0) {
        const reduceBy = Math.min(excess, canReduce)
        col.width -= reduceBy
        excess -= reduceBy
      }
    }
  }

  return adjusted
}

/**
 * Renders a table with a styled inverse-video header row and aligned data
 * rows.
 *
 * Column widths are **fixed** — pass the desired width per column (use
 * {@link colWidth} for auto-fit). Cells that exceed their column width are
 * either truncated (with `…`) or word-wrapped to additional physical lines
 * depending on the column's `overflow` setting.
 *
 * Column widths are automatically adjusted right-to-left to fit within the
 * terminal width (`process.stdout.columns` or `options.terminalWidth`).
 *
 * @param title - Bold label printed above the header, or `null` for no title.
 * @param columns - Column definitions (header, width, overflow strategy).
 * @param rows - Data rows; each entry is an array of cell strings, one per column.
 * @param options - Optional rendering and layout options (e.g. terminal width).
 * @returns A multi-line string ready to pass to {@link output}.
 */
export function renderTable(
  title: string | null,
  columns: ColumnDef[],
  rows: Array<string[]>,
  options?: RenderTableOptions,
): string {
  const adjustedColumns = fitColumnsToTerminal(columns, options)

  const headerRow = chalk.inverse.bold(
    '  ' + adjustedColumns.map((c) => pad(c.header, c.width)).join('  ') + '  ',
  )

  const dataRows: string[] = []
  for (const row of rows) {
    const cellLines: string[][] = adjustedColumns.map((col, i) => {
      const cell = row[i] ?? ''
      return col.overflow === 'wrap' ? wordWrap(cell, col.width) : [truncate(cell, col.width)]
    })

    const maxLines = Math.max(...cellLines.map((l) => l.length))
    for (let li = 0; li < maxLines; li++) {
      const cells = adjustedColumns.map((col, i) => pad(cellLines[i]?.[li] ?? '', col.width))
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
