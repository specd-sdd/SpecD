import { describe, it, expect } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { InvalidSymbolKindError } from '../../../src/domain/errors/invalid-symbol-kind-error.js'

describe('SymbolNode', () => {
  it('creates a symbol node with deterministic id', () => {
    const node = createSymbolNode({
      name: 'createUser',
      kind: SymbolKind.Function,
      filePath: 'src/domain/user.ts',
      line: 42,
      column: 0,
    })
    expect(node.id).toBe('src/domain/user.ts:function:createUser:42')
    expect(node.name).toBe('createUser')
    expect(node.kind).toBe('function')
    expect(node.filePath).toBe('src/domain/user.ts')
    expect(node.line).toBe(42)
    expect(node.column).toBe(0)
  })

  it('normalizes backslash paths', () => {
    const node = createSymbolNode({
      name: 'fn',
      kind: SymbolKind.Function,
      filePath: 'src\\domain\\file.ts',
      line: 1,
      column: 0,
    })
    expect(node.filePath).toBe('src/domain/file.ts')
    expect(node.id).toContain('src/domain/file.ts')
  })

  it('same inputs produce same id', () => {
    const a = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
    })
    expect(a.id).toBe(b.id)
  })

  it('different line produces different id', () => {
    const a = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 2,
      column: 0,
    })
    expect(a.id).not.toBe(b.id)
  })

  it('preserves comment when provided', () => {
    const node = createSymbolNode({
      name: 'greet',
      kind: SymbolKind.Function,
      filePath: 'a.ts',
      line: 2,
      column: 0,
      comment: '/** Greets. */',
    })
    expect(node.comment).toBe('/** Greets. */')
  })

  it('defaults comment to undefined when not provided', () => {
    const node = createSymbolNode({
      name: 'greet',
      kind: SymbolKind.Function,
      filePath: 'a.ts',
      line: 1,
      column: 0,
    })
    expect(node.comment).toBeUndefined()
  })

  it('same name/kind/file/line with different column produces same id', () => {
    const a = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 10,
    })
    // Current id scheme does not include column — document the collision
    expect(a.id).toBe(b.id)
  })

  it('throws InvalidSymbolKindError for invalid kind', () => {
    expect(() =>
      createSymbolNode({ name: 'fn', kind: 'bogus', filePath: 'a.ts', line: 1, column: 0 }),
    ).toThrow(InvalidSymbolKindError)
  })
})
