import { describe, it, expect } from 'vitest'
import { parseCommaSeparatedValues } from '../../src/helpers/parse-comma-values.js'

const VALID = new Set(['stale', 'missing', 'invalid', 'fresh'] as const)

describe('parseCommaSeparatedValues', () => {
  it('parses a single value', () => {
    const result = parseCommaSeparatedValues('stale', VALID, '--status')
    expect(result).toEqual(new Set(['stale']))
  })

  it('parses comma-separated values', () => {
    const result = parseCommaSeparatedValues('stale,missing', VALID, '--status')
    expect(result).toEqual(new Set(['stale', 'missing']))
  })

  it('trims whitespace around tokens', () => {
    const result = parseCommaSeparatedValues(' stale , missing ', VALID, '--status')
    expect(result).toEqual(new Set(['stale', 'missing']))
  })

  it('lowercases tokens', () => {
    const result = parseCommaSeparatedValues('STALE,Missing', VALID, '--status')
    expect(result).toEqual(new Set(['stale', 'missing']))
  })

  it('ignores empty tokens from trailing commas', () => {
    const result = parseCommaSeparatedValues('stale,,missing,', VALID, '--status')
    expect(result).toEqual(new Set(['stale', 'missing']))
  })

  it('deduplicates repeated values', () => {
    const result = parseCommaSeparatedValues('stale,stale', VALID, '--status')
    expect(result).toEqual(new Set(['stale']))
    expect(result.size).toBe(1)
  })

  it('throws on invalid value with descriptive message', () => {
    expect(() => parseCommaSeparatedValues('bogus', VALID, '--status')).toThrow(
      "invalid --status value 'bogus'",
    )
  })

  it('throws on first invalid value in a mixed list', () => {
    expect(() => parseCommaSeparatedValues('stale,nope,missing', VALID, '--status')).toThrow(
      "invalid --status value 'nope'",
    )
  })

  it('includes valid values in the error message', () => {
    expect(() => parseCommaSeparatedValues('bad', VALID, '--flag')).toThrow(
      'valid: stale, missing, invalid, fresh',
    )
  })
})
