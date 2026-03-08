import { describe, it, expect } from 'vitest'
import { safeRegex } from '../../../src/domain/services/safe-regex.js'

describe('safeRegex', () => {
  it('returns a RegExp for a valid pattern', () => {
    const re = safeRegex('foo.*bar')
    expect(re).toBeInstanceOf(RegExp)
    expect(re!.source).toBe('foo.*bar')
  })

  it('passes through flags', () => {
    const re = safeRegex('abc', 'i')
    expect(re).toBeInstanceOf(RegExp)
    expect(re!.flags).toBe('i')
  })

  it('returns null for an invalid pattern', () => {
    expect(safeRegex('[unclosed')).toBeNull()
  })

  it('returns null for nested quantifiers (a+)+', () => {
    expect(safeRegex('(a+)+')).toBeNull()
  })

  it('returns null for nested quantifiers (a+)*', () => {
    expect(safeRegex('(a+)*')).toBeNull()
  })

  it('returns null for nested quantifiers (a*)+', () => {
    expect(safeRegex('(a*)+')).toBeNull()
  })

  it('returns null for nested quantifiers (a*)*', () => {
    expect(safeRegex('(a*)*')).toBeNull()
  })

  it('returns null for nested quantifiers with non-capturing group', () => {
    expect(safeRegex('(?:a+)+')).toBeNull()
  })

  it('returns null for nested quantifiers with {n,} variant', () => {
    expect(safeRegex('(a{2,})+')).toBeNull()
  })

  it('allows a single quantifier inside a group without outer quantifier', () => {
    const re = safeRegex('(a+)b')
    expect(re).toBeInstanceOf(RegExp)
  })

  it('allows common safe patterns', () => {
    expect(safeRegex('^[a-z]+$')).toBeInstanceOf(RegExp)
    expect(safeRegex('\\d{1,3}\\.\\d{1,3}')).toBeInstanceOf(RegExp)
    expect(safeRegex('(foo|bar)+')).toBeInstanceOf(RegExp)
  })
})
