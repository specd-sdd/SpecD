import { describe, expect, it } from 'vitest'
import {
  formatWithLineNumbers,
  sliceGuideLines,
} from '../../../src/application/queries/slice-guide-lines.js'

describe('Line Slicing and Formatting Utilities', () => {
  const content = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`

  describe('sliceGuideLines', () => {
    it('slices standard bounded range', () => {
      const sliced = sliceGuideLines(content, 3, 4)
      expect(sliced).toBe('Line 3\nLine 4\nLine 5\nLine 6')
    })

    it('defaults startLine to 1 when omitted, 0, or negative', () => {
      expect(sliceGuideLines(content, undefined, 2)).toBe('Line 1\nLine 2')
      expect(sliceGuideLines(content, 0, 2)).toBe('Line 1\nLine 2')
      expect(sliceGuideLines(content, -5, 2)).toBe('Line 1\nLine 2')
    })

    it('slices to end of content when lineCount is omitted', () => {
      const sliced = sliceGuideLines(content, 8)
      expect(sliced).toBe('Line 8\nLine 9\nLine 10')
    })

    it('returns empty string when startLine exceeds total lines', () => {
      expect(sliceGuideLines(content, 50, 10)).toBe('')
    })

    it('returns empty string when lineCount is 0 or negative', () => {
      expect(sliceGuideLines(content, 1, 0)).toBe('')
      expect(sliceGuideLines(content, 1, -3)).toBe('')
    })

    it('returns remaining lines when lineCount exceeds total available', () => {
      const sliced = sliceGuideLines(content, 9, 20)
      expect(sliced).toBe('Line 9\nLine 10')
    })

    it('handles CRLF windows line endings correctly', () => {
      const crlfContent = 'A\r\nB\r\nC\r\nD'
      const sliced = sliceGuideLines(crlfContent, 2, 2)
      expect(sliced).toBe('B\nC')
    })
  })

  describe('formatWithLineNumbers', () => {
    it('prefixes lines with 1-indexed numbers and right-aligned padding', () => {
      const sample = 'First\nSecond'
      const formatted = formatWithLineNumbers(sample, 99)
      expect(formatted).toBe(' 99 | First\n100 | Second')
    })

    it('pads single digit numbers cleanly', () => {
      const sample = 'Hello\nWorld'
      const formatted = formatWithLineNumbers(sample, 1)
      expect(formatted).toBe('1 | Hello\n2 | World')
    })

    it('defaults startLine to 1 when omitted or invalid', () => {
      const sample = 'Line A\nLine B'
      expect(formatWithLineNumbers(sample)).toBe('1 | Line A\n2 | Line B')
      expect(formatWithLineNumbers(sample, 0)).toBe('1 | Line A\n2 | Line B')
      expect(formatWithLineNumbers(sample, -10)).toBe('1 | Line A\n2 | Line B')
    })

    it('returns empty string when content is empty', () => {
      expect(formatWithLineNumbers('', 1)).toBe('')
    })
  })
})
