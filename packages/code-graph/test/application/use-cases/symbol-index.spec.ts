import { describe, it, expect } from 'vitest'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'

describe('InMemoryIndexSession', () => {
  it('stores and retrieves symbols by file path', () => {
    const session = new InMemoryIndexSession()
    const sym1 = createSymbolNode({
      name: 'A',
      kind: SymbolKind.Class,
      filePath: 'ws:file1.ts',
      line: 1,
      column: 0,
    })

    session.registerFile({
      filePath: 'ws:file1.ts',
      configRelativePath: 'file1.ts',
      language: 'typescript',
      contentHash: 'abc',
      workspace: 'ws',
    })
    session.registerAnalysis({
      filePath: 'ws:file1.ts',
      analysis: {
        language: 'typescript',
        symbols: [sym1],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      },
    })

    expect(session.findSymbolsByFile('ws:file1.ts')).toEqual([sym1])
    expect(session.findSymbolsByFile('ws:file2.ts')).toEqual([])
  })

  it('stores and retrieves symbols by name', () => {
    const session = new InMemoryIndexSession()
    const sym1 = createSymbolNode({
      name: 'A',
      kind: SymbolKind.Class,
      filePath: 'ws:file1.ts',
      line: 1,
      column: 0,
    })

    session.registerFile({
      filePath: 'ws:file1.ts',
      configRelativePath: 'file1.ts',
      language: 'typescript',
      contentHash: 'abc',
      workspace: 'ws',
    })
    session.registerAnalysis({
      filePath: 'ws:file1.ts',
      analysis: {
        language: 'typescript',
        symbols: [sym1],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      },
    })

    expect(session.findSymbolsByName('A')).toEqual([sym1])
    expect(session.findSymbolsByName('B')).toEqual([])
  })

  it('filters by name and file prefix', () => {
    const session = new InMemoryIndexSession()
    const sym1 = createSymbolNode({
      name: 'A',
      kind: SymbolKind.Class,
      filePath: 'ws1:file.ts',
      line: 1,
      column: 0,
    })
    const sym2 = createSymbolNode({
      name: 'A',
      kind: SymbolKind.Class,
      filePath: 'ws2:file.ts',
      line: 1,
      column: 0,
    })

    session.registerFile({
      filePath: 'ws1:file.ts',
      configRelativePath: 'file.ts',
      language: 'typescript',
      contentHash: 'abc',
      workspace: 'ws1',
    })
    session.registerAnalysis({
      filePath: 'ws1:file.ts',
      analysis: {
        language: 'typescript',
        symbols: [sym1],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      },
    })

    session.registerFile({
      filePath: 'ws2:file.ts',
      configRelativePath: 'file.ts',
      language: 'typescript',
      contentHash: 'def',
      workspace: 'ws2',
    })
    session.registerAnalysis({
      filePath: 'ws2:file.ts',
      analysis: {
        language: 'typescript',
        symbols: [sym2],
        imports: [],
        bindingFacts: [],
        callFacts: [],
      },
    })

    expect(session.findSymbolsByName('A', 'ws1:')).toEqual([sym1])
    expect(session.findSymbolsByName('A', 'ws2:')).toEqual([sym2])
  })
})
