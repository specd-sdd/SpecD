import { describe, expect, it } from 'vitest'
import { parseGraphKinds } from '../../../src/commands/graph/parse-graph-kinds.js'

describe('parseGraphKinds', () => {
  it('returns undefined when no value is provided', () => {
    expect(parseGraphKinds(undefined)).toBeUndefined()
  })

  it('parses and normalizes comma-separated kinds', () => {
    expect(parseGraphKinds(' Class,method,FUNCTION ')).toEqual(['class', 'method', 'function'])
  })

  it('deduplicates repeated kinds', () => {
    expect(parseGraphKinds('method,method,class')).toEqual(['method', 'class'])
  })

  it('throws on invalid kinds', () => {
    expect(() => parseGraphKinds('class,bogus')).toThrow("invalid --kind value 'bogus'")
  })
})
