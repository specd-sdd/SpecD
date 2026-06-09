import { describe, it, expect } from 'vitest'
import { normalizeSnippet } from '../../../src/commands/graph/normalize-snippet.js'

describe('normalizeSnippet', () => {
  it('expands tabs to spaces', () => {
    const raw = '\tconst x = 1'
    const result = normalizeSnippet(raw, { tabWidth: 2 })
    expect(result).toBe('const x = 1') // Tab was leading, removed by indent stripping
  })

  it('removes common leading indentation', () => {
    const raw = `
      function test() {
        return true
      }
    `
    const result = normalizeSnippet(raw)
    const lines = result.split('\n')
    expect(lines[0]).toBe('') // Trim external leading blank
    expect(lines[1]).toBe('function test() {')
    expect(lines[2]).toBe('  return true')
    expect(lines[3]).toBe('}')
  })

  it('applies an optional margin', () => {
    const raw = '  line 1\n  line 2'
    const result = normalizeSnippet(raw, { margin: 4 })
    expect(result).toBe('    line 1\n    line 2')
  })

  it('handles empty and blank lines correctly', () => {
    const raw = '  line 1\n\n  line 2'
    const result = normalizeSnippet(raw, { margin: 2 })
    expect(result).toBe('  line 1\n\n  line 2')
  })

  it('identifies min indentation from non-empty lines only', () => {
    const raw = '    line 1\n \n      line 2'
    const result = normalizeSnippet(raw)
    expect(result).toBe('line 1\n\n  line 2')
  })

  it('trims trailing whitespace', () => {
    const raw = 'line 1  \nline 2\t'
    const result = normalizeSnippet(raw)
    expect(result).toBe('line 1\nline 2')
  })
})
