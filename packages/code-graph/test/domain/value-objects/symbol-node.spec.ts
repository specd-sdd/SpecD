import { describe, it, expect } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { InvalidSymbolKindError } from '../../../src/domain/errors/invalid-symbol-kind-error.js'

function rangeAt(line: number, column: number, length = 2) {
  return {
    endLine: line,
    endColumn: column + length,
    selectionRange: {
      startLine: line,
      startColumn: column,
      endLine: line,
      endColumn: column + length,
    },
  }
}

describe('SymbolNode', () => {
  it('creates a symbol node with deterministic id', () => {
    const node = createSymbolNode({
      name: 'createUser',
      kind: SymbolKind.Function,
      filePath: 'src/domain/user.ts',
      line: 42,
      column: 0,
      ...rangeAt(42, 0, 10),
    })
    expect(node.id).toBe('src/domain/user.ts:function:createUser:42:0')
    expect(node.name).toBe('createUser')
    expect(node.kind).toBe('function')
    expect(node.filePath).toBe('src/domain/user.ts')
    expect(node.line).toBe(42)
    expect(node.column).toBe(0)
    expect(node.endLine).toBe(42)
    expect(node.endColumn).toBe(10)
    expect(node.selectionRange).toEqual({
      startLine: 42,
      startColumn: 0,
      endLine: 42,
      endColumn: 10,
    })
  })

  it('normalizes backslash paths', () => {
    const node = createSymbolNode({
      name: 'fn',
      kind: SymbolKind.Function,
      filePath: 'src\\domain\\file.ts',
      line: 1,
      column: 0,
      ...rangeAt(1, 0),
    })
    expect(node.filePath).toBe('src/domain/file.ts')
    expect(node.id).toContain('src/domain/file.ts')
  })

  it('keeps root-namespaced file paths inside the symbol id', () => {
    const node = createSymbolNode({
      name: 'sync',
      kind: SymbolKind.Function,
      filePath: 'root:dev/scripts/sync.ts',
      line: 1,
      column: 0,
      ...rangeAt(1, 0, 4),
    })
    expect(node.id).toBe('root:dev/scripts/sync.ts:function:sync:1:0')
    expect(node.filePath).toBe('root:dev/scripts/sync.ts')
  })

  it('same inputs produce same id', () => {
    const a = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
      ...rangeAt(1, 0),
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
      ...rangeAt(1, 0),
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
      ...rangeAt(1, 0),
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 2,
      column: 0,
      ...rangeAt(2, 0),
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
      ...rangeAt(2, 0, 5),
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
      ...rangeAt(1, 0, 5),
    })
    expect(node.comment).toBeUndefined()
  })

  it('same name/kind/file/line with different column produces different id', () => {
    const a = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 0,
      ...rangeAt(1, 0),
    })
    const b = createSymbolNode({
      name: 'fn',
      kind: 'function',
      filePath: 'a.ts',
      line: 1,
      column: 10,
      ...rangeAt(1, 10),
    })
    expect(a.id).not.toBe(b.id)
  })

  it('throws InvalidSymbolKindError for invalid kind', () => {
    expect(() =>
      createSymbolNode({
        name: 'fn',
        kind: 'bogus',
        filePath: 'a.ts',
        line: 1,
        column: 0,
        ...rangeAt(1, 0),
      }),
    ).toThrow(InvalidSymbolKindError)
  })

  it('accepts a contained selection in a multi-line construct without changing its id', () => {
    const node = createSymbolNode({
      name: 'createUser',
      kind: SymbolKind.Function,
      filePath: 'src/domain/user.ts',
      line: 3,
      column: 2,
      endLine: 7,
      endColumn: 3,
      selectionRange: {
        startLine: 3,
        startColumn: 11,
        endLine: 3,
        endColumn: 21,
      },
    })

    expect(node.id).toBe('src/domain/user.ts:function:createUser:3:2')
    expect(node.selectionRange).toEqual({
      startLine: 3,
      startColumn: 11,
      endLine: 3,
      endColumn: 21,
    })
  })

  it.each([
    {
      name: 'empty construct',
      endLine: 1,
      endColumn: 0,
      selectionRange: {
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 1,
      },
    },
    {
      name: 'empty selection',
      endLine: 1,
      endColumn: 2,
      selectionRange: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    },
    {
      name: 'selection outside construct',
      endLine: 1,
      endColumn: 2,
      selectionRange: {
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 3,
      },
    },
  ])('rejects $name ranges', ({ endLine, endColumn, selectionRange }) => {
    expect(() =>
      createSymbolNode({
        name: 'fn',
        kind: SymbolKind.Function,
        filePath: 'a.ts',
        line: 1,
        column: 0,
        endLine,
        endColumn,
        selectionRange,
      }),
    ).toThrow(RangeError)
  })
})
