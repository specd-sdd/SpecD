import { describe, it, expect } from 'vitest'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import {
  createLocalBinding,
  createLogicalSymbol,
  createPublicBinding,
  MemberForm,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

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

  it('groups only declaration occurrences with the same adapter-provided logical id', () => {
    const session = new InMemoryIndexSession()
    const first = createSymbolNode({
      name: 'overload',
      kind: SymbolKind.Function,
      filePath: 'ws:first.ts',
      line: 1,
      column: 0,
    })
    const second = createSymbolNode({
      name: 'overload',
      kind: SymbolKind.Function,
      filePath: 'ws:second.ts',
      line: 1,
      column: 0,
    })
    const shared = createLogicalSymbol({
      workspace: 'ws',
      surface: 'pkg',
      name: 'overload',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    const competing = createLogicalSymbol({
      workspace: 'ws',
      surface: 'other',
      name: 'overload',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })

    for (const [symbol, logicalId] of [
      [first, shared.id],
      [second, competing.id],
    ] as const) {
      session.registerFile({
        filePath: symbol.filePath,
        configRelativePath: symbol.filePath.slice(3),
        language: 'typescript',
        contentHash: symbol.id,
        workspace: 'ws',
      })
      session.registerAnalysis({
        filePath: symbol.filePath,
        analysis: {
          language: 'typescript',
          symbols: [symbol],
          imports: [],
          bindingFacts: [],
          callFacts: [],
          referenceFacts: {
            declarations: [
              {
                logicalId,
                symbolId: symbol.id,
                location: {
                  filePath: symbol.filePath,
                  line: symbol.line,
                  column: symbol.column,
                  endLine: undefined,
                  endColumn: undefined,
                },
                kind: symbol.kind,
              },
            ],
            publicBindings: [],
            localBindings: [],
            hierarchy: [],
            steps: [],
            capabilities: {
              declarations: true,
              members: false,
              publicBindings: false,
              localBindings: false,
              hierarchy: false,
              buildContext: false,
            },
          },
        },
      })
    }

    expect(session.getDeclarationsByLogicalId().size).toBe(2)
    expect(session.getLogicalSymbols().map((symbol) => symbol.id)).toEqual(
      [shared.id, competing.id].sort(),
    )
  })

  it('deduplicates bindings and retains ordered hierarchy provenance', () => {
    const session = new InMemoryIndexSession()
    const owner = createLogicalSymbol({
      workspace: 'ws',
      surface: 'pkg',
      name: 'Base',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberForm: undefined,
    })
    const member = createLogicalSymbol({
      workspace: 'ws',
      surface: 'pkg',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberForm: MemberForm.Instance,
    })
    const publicBinding = createPublicBinding({
      surface: 'pkg',
      exportedName: 'run',
      space: SymbolSpace.Value,
      targetId: member.id,
    })
    const localBinding = createLocalBinding({
      filePath: 'ws:file.ts',
      scopeId: 'module',
      localName: 'runAlias',
      space: SymbolSpace.Value,
      targetId: member.id,
    })
    const declaration = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Method,
      filePath: 'ws:file.ts',
      line: 1,
      column: 0,
    })

    session.registerFile({
      filePath: 'ws:file.ts',
      configRelativePath: 'file.ts',
      language: 'typescript',
      contentHash: 'hash',
      workspace: 'ws',
    })
    session.registerAnalysis({
      filePath: 'ws:file.ts',
      analysis: {
        language: 'typescript',
        symbols: [declaration],
        imports: [],
        bindingFacts: [],
        callFacts: [],
        referenceFacts: {
          declarations: [
            {
              logicalId: member.id,
              symbolId: declaration.id,
              location: {
                filePath: declaration.filePath,
                line: 1,
                column: 0,
                endLine: undefined,
                endColumn: undefined,
              },
              kind: declaration.kind,
            },
          ],
          publicBindings: [publicBinding, publicBinding],
          localBindings: [localBinding, localBinding],
          hierarchy: [{ childId: member.id, parentId: owner.id, kind: 'extends', precedence: 0 }],
          steps: [
            { fromId: localBinding.id, toId: member.id, kind: 'alias' },
            { fromId: localBinding.id, toId: member.id, kind: 'alias' },
          ],
          capabilities: {
            declarations: true,
            members: true,
            publicBindings: true,
            localBindings: true,
            hierarchy: true,
            buildContext: true,
          },
        },
      },
    })

    expect(session.getPublicBindings()).toEqual([publicBinding])
    expect(session.getLocalBindings()).toEqual([localBinding])
    expect(session.getHierarchyFacts()).toHaveLength(1)
    expect(session.getResolutionSteps()).toEqual([
      { fromId: localBinding.id, toId: member.id, kind: 'alias' },
      { fromId: member.id, toId: owner.id, kind: 'extends:0' },
    ])
  })

  it('translates hierarchy relations to logical owners after persisted fact hydration', () => {
    const session = new InMemoryIndexSession()
    const childDeclaration = createSymbolNode({
      name: 'Child',
      kind: SymbolKind.Class,
      filePath: 'ws:child.ts',
      line: 1,
      column: 0,
    })
    const parentDeclaration = createSymbolNode({
      name: 'Parent',
      kind: SymbolKind.Class,
      filePath: 'ws:parent.ts',
      line: 1,
      column: 0,
    })
    const child = createLogicalSymbol({
      workspace: 'ws',
      surface: childDeclaration.filePath,
      name: childDeclaration.name,
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberForm: undefined,
    })
    const parent = createLogicalSymbol({
      workspace: 'ws',
      surface: parentDeclaration.filePath,
      name: parentDeclaration.name,
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberForm: undefined,
    })
    session.hydrateReferenceFacts({
      logicalSymbols: [child, parent],
      declarations: [
        { logicalSymbolId: child.id, declaration: occurrence(child.id, childDeclaration) },
        { logicalSymbolId: parent.id, declaration: occurrence(parent.id, parentDeclaration) },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    session.addRelations([
      createRelation({
        source: childDeclaration.id,
        target: parentDeclaration.id,
        type: RelationType.Extends,
        metadata: { precedence: 2 },
      }),
    ])

    expect(session.getHierarchyFacts()).toEqual([
      { childId: child.id, parentId: parent.id, kind: 'extends', precedence: 2 },
    ])
    expect(session.getResolutionSteps()).toContainEqual({
      fromId: child.id,
      toId: parent.id,
      kind: 'extends:2',
    })
  })
})

/**
 * Creates one declaration occurrence for session hydration.
 * @param logicalId - Logical identity realized by the declaration.
 * @param symbol - Location-backed declaration symbol.
 * @returns Hydratable declaration occurrence.
 */
function occurrence(logicalId: string, symbol: ReturnType<typeof createSymbolNode>) {
  return {
    logicalId,
    symbolId: symbol.id,
    location: {
      filePath: symbol.filePath,
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
    },
    kind: symbol.kind,
  }
}
