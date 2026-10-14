import { describe, it, expect } from 'vitest'
import { SymbolKind, isSymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'

describe('SymbolKind', () => {
  it('defines all expected members', () => {
    expect(SymbolKind.Function).toBe('function')
    expect(SymbolKind.Class).toBe('class')
    expect(SymbolKind.Method).toBe('method')
    expect(SymbolKind.Variable).toBe('variable')
    expect(SymbolKind.Type).toBe('type')
    expect(SymbolKind.Interface).toBe('interface')
    expect(SymbolKind.Enum).toBe('enum')
    expect(SymbolKind.Property).toBe('property')
  })

  it('isSymbolKind returns true for valid kinds', () => {
    expect(isSymbolKind('function')).toBe(true)
    expect(isSymbolKind('class')).toBe(true)
    expect(isSymbolKind('method')).toBe(true)
    expect(isSymbolKind('variable')).toBe(true)
    expect(isSymbolKind('type')).toBe(true)
    expect(isSymbolKind('interface')).toBe(true)
    expect(isSymbolKind('enum')).toBe(true)
    expect(isSymbolKind('property')).toBe(true)
  })

  it('isSymbolKind returns false for invalid kinds', () => {
    expect(isSymbolKind('trait')).toBe(false)
    expect(isSymbolKind('')).toBe(false)
    expect(isSymbolKind('FUNCTION')).toBe(false)
  })

  it('createSymbolNode successfully creates a node with kind property', () => {
    const node = createSymbolNode({
      name: 'title',
      kind: SymbolKind.Property,
      filePath: 'src/model.ts',
      line: 10,
      column: 2,
      endLine: 10,
      endColumn: 15,
      parentId: 'src/model.ts:class:Model:1:0',
    })
    expect(node.kind).toBe('property')
    expect(node.name).toBe('title')
    expect(node.parentId).toBe('src/model.ts:class:Model:1:0')
  })
})
