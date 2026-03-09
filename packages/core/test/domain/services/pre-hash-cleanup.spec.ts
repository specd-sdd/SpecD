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

  it('supports capture group references in replacement', () => {
    const cleanups = [{ pattern: '(\\w+)@(\\w+)', replacement: '$1 at $2' }]
    expect(applyPreHashCleanup('user@host', cleanups)).toBe('user at host')
  })
})
