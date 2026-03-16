import { describe, it, expect } from 'vitest'
import { SymbolKind, isSymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'

describe('SymbolKind', () => {
  it('defines all expected members', () => {
    expect(SymbolKind.Function).toBe('function')
    expect(SymbolKind.Class).toBe('class')
    expect(SymbolKind.Method).toBe('method')
    expect(SymbolKind.Variable).toBe('variable')
    expect(SymbolKind.Type).toBe('type')
    expect(SymbolKind.Interface).toBe('interface')
    expect(SymbolKind.Enum).toBe('enum')
  })

  it('isSymbolKind returns true for valid kinds', () => {
    expect(isSymbolKind('function')).toBe(true)
    expect(isSymbolKind('class')).toBe(true)
    expect(isSymbolKind('method')).toBe(true)
    expect(isSymbolKind('variable')).toBe(true)
    expect(isSymbolKind('type')).toBe(true)
    expect(isSymbolKind('interface')).toBe(true)
    expect(isSymbolKind('enum')).toBe(true)
  })

  it('isSymbolKind returns false for invalid kinds', () => {
    expect(isSymbolKind('trait')).toBe(false)
    expect(isSymbolKind('')).toBe(false)
    expect(isSymbolKind('FUNCTION')).toBe(false)
  })
})
