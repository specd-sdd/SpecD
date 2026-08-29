import { describe, it, expect } from 'vitest'
import { applyPreHashCleanup } from '../../../src/domain/services/pre-hash-cleanup.js'

describe('applyPreHashCleanup', () => {
  it('returns content unchanged when no cleanups are provided', () => {
    expect(applyPreHashCleanup('hello world', [])).toBe('hello world')
  })

  it('applies a single substitution globally', () => {
    const cleanups = [{ pattern: '\\d{4}-\\d{2}-\\d{2}', replacement: 'DATE' }]
    expect(applyPreHashCleanup('Created: 2026-03-09.', cleanups)).toBe('Created: DATE.')
  })

  it('applies multiple substitutions in order', () => {
    const cleanups = [
      { pattern: '\\s+', replacement: ' ' },
      { pattern: '^ | $', replacement: '' },
    ]
    expect(applyPreHashCleanup('  hello   world  ', cleanups)).toBe('hello world')
  })

  it('replaces all occurrences (global flag)', () => {
    const cleanups = [{ pattern: 'foo', replacement: 'bar' }]
    expect(applyPreHashCleanup('foo foo foo', cleanups)).toBe('bar bar bar')
  })

  it('skips patterns rejected by safeRegex', () => {
    // A catastrophic backtracking pattern should be rejected by safeRegex
    const cleanups = [{ pattern: '(a+)+$', replacement: '' }]
    // safeRegex returns null for ReDoS patterns, so original content is preserved
    expect(applyPreHashCleanup('aaa', cleanups)).toBe('aaa')
  })

  it('applies ^ anchored patterns to every line (multiline) and normalizes whitespace', () => {
    const cleanups = [{ pattern: '^\\s*-\\s+\\[x\\]', replacement: '- [ ]' }]
    const input = '- [x] task one\n- [ ] task two\n- [x] task three'
    const expected = '- [ ] task one - [ ] task two - [ ] task three'
    expect(applyPreHashCleanup(input, cleanups)).toBe(expected)
  })

  it('supports capture group references in replacement', () => {
    const cleanups = [{ pattern: '(\\w+)@(\\w+)', replacement: '$1 at $2' }]
    expect(applyPreHashCleanup('user@host', cleanups)).toBe('user at host')
  })

  it('normalizes spaces, tabs, and newlines to a single space even without cleanups', () => {
    const input1 = '# Title\n\nSome paragraph with   multiple   spaces.\n\n- item 1\n- item 2\n'
    const input2 = '# Title \n Some paragraph with multiple spaces. \n - item 1 \n - item 2'
    expect(applyPreHashCleanup(input1, [])).toBe(
      '# Title Some paragraph with multiple spaces. - item 1 - item 2',
    )
    expect(applyPreHashCleanup(input1, [])).toBe(applyPreHashCleanup(input2, []))
  })

  it('trims leading and trailing whitespace', () => {
    expect(applyPreHashCleanup('\n\n  hello world  \n\t', [])).toBe('hello world')
  })

  it('normalizes \\r\\n, \\r, tabs, and multiple mixed whitespace characters to single spaces', () => {
    const unix = 'Line 1\nLine 2\n\nLine 3'
    const windows = 'Line 1\r\nLine 2\r\n\r\nLine 3'
    const macClassic = 'Line 1\rLine 2\r\rLine 3'
    const mixedTabsAndSpaces = '\tLine 1\t \r\n \t Line 2\r\n\t\tLine 3 \t'

    const expected = 'Line 1 Line 2 Line 3'
    expect(applyPreHashCleanup(unix, [])).toBe(expected)
    expect(applyPreHashCleanup(windows, [])).toBe(expected)
    expect(applyPreHashCleanup(macClassic, [])).toBe(expected)
    expect(applyPreHashCleanup(mixedTabsAndSpaces, [])).toBe(expected)
  })
})
