import { describe, expect, it } from 'vitest'
import {
  type ColumnDef,
  colWidth,
  fitColumnsToTerminal,
  renderTable,
} from '../../src/helpers/table.js'

describe('table helper', () => {
  describe('colWidth', () => {
    it('computes maximum width between header and cell values', () => {
      expect(colWidth('NAME', ['alice', 'bob', 'charlotte'])).toBe(9)
      expect(colWidth('STATUS', ['ok', 'err'])).toBe(6)
    })
  })

  describe('fitColumnsToTerminal', () => {
    const columns: ColumnDef[] = [
      { header: 'TOPIC', width: 20 },
      { header: 'TITLE', width: 30 },
      { header: 'DESCRIPTION', width: 50 },
    ]
    // Total width = 20 + 30 + 50 = 100
    // Spacing = 2 * (3 + 1) = 8
    // Total table line = 108

    it('returns unchanged columns if terminal width is undefined or 0', () => {
      const adjusted = fitColumnsToTerminal(columns, { terminalWidth: undefined })
      expect(adjusted.map((c) => c.width)).toEqual([20, 30, 50])

      const adjustedZero = fitColumnsToTerminal(columns, { terminalWidth: 0 })
      expect(adjustedZero.map((c) => c.width)).toEqual([20, 30, 50])
    })

    it('returns unchanged columns if table already fits within terminal width', () => {
      const adjusted = fitColumnsToTerminal(columns, { terminalWidth: 120 })
      expect(adjusted.map((c) => c.width)).toEqual([20, 30, 50])
    })

    it('reduces the rightmost column first down to minimum width', () => {
      // Terminal width 98: available for columns is 98 - 8 = 90. Excess = 10.
      // Rightmost column is DESCRIPTION (width 50). It should be reduced by 10 to 40.
      const adjusted = fitColumnsToTerminal(columns, { terminalWidth: 98, minColumnWidth: 10 })
      expect(adjusted.map((c) => c.width)).toEqual([20, 30, 40])
    })

    it('reduces preceding columns once the rightmost column hits the minimum width', () => {
      // Terminal width 68: available for columns is 68 - 8 = 60. Excess = 40.
      // DESCRIPTION (50 -> 10, reduced by 40).
      // Excess is 0 now.
      const adjusted1 = fitColumnsToTerminal(columns, { terminalWidth: 68, minColumnWidth: 10 })
      expect(adjusted1.map((c) => c.width)).toEqual([20, 30, 10])

      // Terminal width 58: available for columns is 58 - 8 = 50. Excess = 50.
      // DESCRIPTION (50 -> 10, reduced by 40). Excess remaining: 10.
      // TITLE (30 -> 20, reduced by 10).
      const adjusted2 = fitColumnsToTerminal(columns, { terminalWidth: 58, minColumnWidth: 10 })
      expect(adjusted2.map((c) => c.width)).toEqual([20, 20, 10])
    })

    it('cascades all the way to the first column if needed', () => {
      // Terminal width 43: available for columns is 43 - 8 = 35. Excess = 65.
      // DESCRIPTION (50 -> 10, reduced by 40). Excess left: 25.
      // TITLE (30 -> 10, reduced by 20). Excess left: 5.
      // TOPIC (20 -> 15, reduced by 5). Excess left: 0.
      const adjusted = fitColumnsToTerminal(columns, { terminalWidth: 43, minColumnWidth: 10 })
      expect(adjusted.map((c) => c.width)).toEqual([15, 10, 10])
    })

    it('does not artificially expand columns that are originally smaller than minColumnWidth', () => {
      const mixedCols: ColumnDef[] = [
        { header: 'ID', width: 4 },
        { header: 'TITLE', width: 25 },
        { header: 'DESC', width: 30 },
      ]
      // Spacing = 8. If terminal width is 48: available = 40. Total = 59. Excess = 19.
      // DESC (30 -> 11, reduced by 19).
      const adjusted = fitColumnsToTerminal(mixedCols, { terminalWidth: 48, minColumnWidth: 10 })
      expect(adjusted.map((c) => c.width)).toEqual([4, 25, 11])
    })
  })

  describe('renderTable', () => {
    it('renders aligned headers and rows', () => {
      const columns: ColumnDef[] = [
        { header: 'ID', width: 4 },
        { header: 'NAME', width: 10 },
      ]
      const rows = [
        ['1', 'Alpha'],
        ['2', 'Beta'],
      ]
      const output = renderTable(null, columns, rows, { terminalWidth: 80 })
      expect(output).toContain('ID')
      expect(output).toContain('NAME')
      expect(output).toContain('Alpha')
      expect(output).toContain('Beta')
    })
  })
})
