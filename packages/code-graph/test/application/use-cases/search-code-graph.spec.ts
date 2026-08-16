import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchCodeGraph } from '../../../src/application/use-cases/search-code-graph.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  createPublicBinding,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

describe('SearchCodeGraph', () => {
  let store: InMemoryGraphStore

  beforeEach(async () => {
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
  })

  it('groups declaration hits by logical target and retains public aliases', async () => {
    const first = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Function,
      filePath: 'code-graph:src/api.ts',
      line: 1,
      column: 0,
    })
    const second = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Function,
      filePath: 'code-graph:src/api.ts',
      line: 4,
      column: 0,
    })
    await store.upsertFile(
      createFileNode({
        path: 'code-graph:src/api.ts',
        configRelativePath: 'src/api.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'code-graph',
      }),
      [first, second],
      [],
    )

    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'code-graph:src/api.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    const binding = createPublicBinding({
      surface: logical.surface,
      exportedName: 'run',
      space: SymbolSpace.Value,
      targetId: logical.id,
    })
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [first, second].map((symbol) => ({
        logicalSymbolId: logical.id,
        declaration: {
          logicalId: logical.id,
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
      })),
      publicBindings: [binding],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const results = await new SearchCodeGraph(store).executeSymbols({ query: 'run' })

    expect(results).toHaveLength(1)
    expect(results[0]?.logicalTarget).toEqual(logical)
    expect(results[0]?.declarations).toHaveLength(2)
    expect(results[0]?.publicBindings).toEqual([binding])
    expect(results[0]?.matchedPublicBindings).toEqual([binding])
    expect(results[0]?.matchTier).toBe('exact-public-binding')
    expect(results[0]?.hits).toHaveLength(2)

    const canonicalResults = await new SearchCodeGraph(store).executeSymbols({
      query: logical.id,
    })
    expect(canonicalResults[0]?.matchTier).toBe('exact-logical-identity')
  })

  it('returns an exact non-exported logical identity without text hits', async () => {
    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'code-graph:src/private.ts',
      name: 'hiddenImplementation',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const results = await new SearchCodeGraph(store).executeSymbols({ query: logical.id })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      logicalTarget: logical,
      matchTier: 'exact-logical-identity',
    })
  })

  it('preserves broad kind filtering', async () => {
    const functionSymbol = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: 'code-graph:a.ts',
      line: 1,
      column: 0,
    })
    const classSymbol = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Class,
      filePath: 'code-graph:a.ts',
      line: 2,
      column: 0,
    })
    await store.upsertFile(
      createFileNode({
        path: 'code-graph:a.ts',
        configRelativePath: 'a.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'code-graph',
      }),
      [functionSymbol, classSymbol],
      [],
    )

    const results = await new SearchCodeGraph(store).executeSymbols({
      query: 'target',
      kinds: [SymbolKind.Class],
    })

    expect(results.flatMap((result) => result.hits).map((hit) => hit.symbol.kind)).toEqual([
      SymbolKind.Class,
    ])
  })

  it('ranks an exact Change declaration ahead of generic CLI helpers and variables', async () => {
    const exact = createSymbolNode({
      name: 'Change',
      kind: SymbolKind.Class,
      filePath: 'core:src/change.ts',
      line: 1,
      column: 0,
    })
    const helper = createSymbolNode({
      name: 'renderChangeCommand',
      kind: SymbolKind.Function,
      filePath: 'cli:src/change.ts',
      line: 1,
      column: 0,
    })
    const variable = createSymbolNode({
      name: 'changeLabel',
      kind: SymbolKind.Variable,
      filePath: 'cli:src/change.ts',
      line: 2,
      column: 0,
    })
    await store.upsertFile(fileNode('core:src/change.ts', 'core'), [exact], [])
    await store.upsertFile(fileNode('cli:src/change.ts', 'cli'), [helper, variable], [])
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: exact.filePath,
      name: exact.name,
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [
        {
          logicalSymbolId: logical.id,
          declaration: {
            logicalId: logical.id,
            symbolId: exact.id,
            location: {
              filePath: exact.filePath,
              line: exact.line,
              column: exact.column,
              endLine: exact.endLine,
              endColumn: exact.endColumn,
            },
            kind: exact.kind,
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const results = await new SearchCodeGraph(store).executeSymbols({ query: 'Change' })

    expect(results[0]?.hits[0]?.symbol.id).toBe(exact.id)
    expect(results[0]?.matchTier).toBe('exact-declaration')
    expect(
      results
        .slice(1)
        .flatMap((result) => result.hits)
        .map((hit) => hit.symbol.id),
    ).toEqual(expect.arrayContaining([helper.id, variable.id]))
  })

  it('keeps exact local classification reachable after logical components', async () => {
    const local = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Variable,
      filePath: 'cli:src/local.ts',
      line: 1,
      column: 0,
    })
    const component = createSymbolNode({
      name: 'runner',
      kind: SymbolKind.Function,
      filePath: 'core:src/runner.ts',
      line: 1,
      column: 0,
    })
    await store.upsertFile(fileNode(local.filePath, 'cli'), [local], [])
    await store.upsertFile(fileNode(component.filePath, 'core'), [component], [])
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: component.filePath,
      name: component.name,
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [
        {
          logicalSymbolId: logical.id,
          declaration: {
            logicalId: logical.id,
            symbolId: component.id,
            location: {
              filePath: component.filePath,
              line: component.line,
              column: component.column,
              endLine: component.endLine,
              endColumn: component.endColumn,
            },
            kind: component.kind,
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const results = await new SearchCodeGraph(store).executeSymbols({ query: 'run' })

    expect(results.map(({ matchTier }) => matchTier)).toEqual([
      'logical-component',
      'exact-local-symbol',
    ])
    expect(results[1]?.logicalTarget).toBeNull()
  })

  it('orchestrates all selected categories and suppresses only declaration-name occurrences', async () => {
    const content = 'function analyzeFileImpact() {\n  return "analyzeFileImpact"\n}'
    const symbol = createSymbolNode({
      name: 'analyzeFileImpact',
      kind: SymbolKind.Function,
      filePath: 'code-graph:src/impact.ts',
      line: 1,
      column: 0,
      endLine: 3,
      endColumn: 1,
      selectionRange: {
        startLine: 1,
        startColumn: 9,
        endLine: 1,
        endColumn: 26,
      },
    })
    await store.upsertFile(
      createFileNode({
        path: 'code-graph:src/impact.ts',
        configRelativePath: 'src/impact.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'code-graph',
        content,
      }),
      [symbol],
      [],
    )

    const result = await new SearchCodeGraph(store).execute({
      query: 'analyzeFileImpact',
      categories: ['symbols', 'files', 'specs', 'documents'],
      limit: 10,
      includeSnippet: true,
    })

    expect(result.symbols).toHaveLength(1)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          range: { startLine: 2, startColumn: 10, endLine: 2, endColumn: 27 },
          matchedText: 'analyzeFileImpact',
        }),
      ]),
    )
    expect(result.files[0]?.matches).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          range: { startLine: 1, startColumn: 9, endLine: 1, endColumn: 26 },
        }),
      ]),
    )
    expect(result.files[0]?.matches.every((match) => match.range.startLine === 2)).toBe(true)
    expect(result.files[0]).toMatchObject({ totalMatches: 4, omittedMatches: 0 })
  })

  it('expands multi-word and CamelCase queries inside Code Graph', async () => {
    await store.upsertFile(
      createFileNode({
        path: 'code-graph:src/messages.ts',
        configRelativePath: 'src/messages.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'code-graph',
        content: 'const message = "analyze file impact"',
      }),
      [],
      [],
    )

    const result = await new SearchCodeGraph(store).execute({
      query: 'analyzeFileImpact result',
      categories: ['files'],
      limit: 10,
      includeSnippet: false,
    })

    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.matches.map((match) => match.sourceToken)).toEqual(
      expect.arrayContaining(['analyze', 'file', 'impact']),
    )
  })

  it('requests subsequent candidate pages until the post-suppression limit is filled', async () => {
    const declarationFile = createFileNode({
      path: 'code-graph:a.ts',
      configRelativePath: 'a.ts',
      language: 'typescript',
      contentHash: 'a',
      workspace: 'code-graph',
      content: 'function target() {}',
    })
    const retainedFile = createFileNode({
      path: 'code-graph:b.ts',
      configRelativePath: 'b.ts',
      language: 'typescript',
      contentHash: 'b',
      workspace: 'code-graph',
      content: 'const message = "target"',
    })
    const symbol = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: declarationFile.path,
      line: 1,
      column: 0,
      endLine: 1,
      endColumn: 20,
      selectionRange: { startLine: 1, startColumn: 9, endLine: 1, endColumn: 15 },
    })
    await store.upsertFile(declarationFile, [symbol], [])
    await store.upsertFile(retainedFile, [], [])
    const candidateSearch = vi.spyOn(store, 'searchSourceContentCandidates')
    const unboundedRead = vi.spyOn(store, 'getAllFiles')
    candidateSearch
      .mockResolvedValueOnce({
        candidates: [{ file: declarationFile, backendScore: 10 }],
        nextCursor: 'second',
      })
      .mockResolvedValueOnce({ candidates: [{ file: retainedFile, backendScore: 5 }] })

    const result = await new SearchCodeGraph(store).execute({
      query: 'target',
      categories: ['symbols', 'files'],
      limit: 1,
      includeSnippet: false,
    })

    expect(candidateSearch).toHaveBeenCalledTimes(2)
    expect(unboundedRead).not.toHaveBeenCalled()
    expect(result.files.map(({ file }) => file.path)).toEqual(['code-graph:b.ts'])
  })

  it('labels prefix discovery below exact names', async () => {
    const exact = createSymbolNode({
      name: 'ValidateArtifacts',
      kind: SymbolKind.Class,
      filePath: 'core:src/validate.ts',
      line: 1,
      column: 0,
    })
    await store.upsertFile(fileNode('core:src/validate.ts', 'core'), [exact], [])
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: exact.filePath,
      name: exact.name,
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [
        {
          logicalSymbolId: logical.id,
          declaration: {
            logicalId: logical.id,
            symbolId: exact.id,
            location: {
              filePath: exact.filePath,
              line: exact.line,
              column: exact.column,
              endLine: exact.endLine,
              endColumn: exact.endColumn,
            },
            kind: exact.kind,
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const partial = await new SearchCodeGraph(store).executeSymbols({
      query: 'ValidateArtifact',
    })
    const complete = await new SearchCodeGraph(store).executeSymbols({
      query: 'ValidateArtifacts',
    })

    expect(partial[0]?.matchTier).not.toMatch(/^exact-/)
    expect(complete[0]?.matchTier).toBe('exact-declaration')
  })

  it('caps general file matches and keeps exact single-file searches exhaustive', async () => {
    const content = Array.from(
      { length: 15 },
      (_, index) => `const value${String(index)} = "needle"`,
    ).join('\n')
    const file = createFileNode({
      path: 'code-graph:src/matches.ts',
      configRelativePath: 'packages/code-graph/src/matches.ts',
      language: 'typescript',
      contentHash: 'matches',
      workspace: 'code-graph',
      content,
    })
    await store.upsertFile(file, [], [])
    const search = new SearchCodeGraph(store)

    const general = await search.execute({
      query: 'needle',
      categories: ['files'],
      limit: 10,
      includeSnippet: false,
    })
    const exact = await search.execute({
      query: 'needle',
      categories: ['files'],
      limit: 10,
      includeSnippet: false,
      filePattern: file.path,
      exactFile: true,
    })

    expect(general.files[0]).toMatchObject({ totalMatches: 15, omittedMatches: 5 })
    expect(general.files[0]?.matches).toHaveLength(10)
    expect(exact.files[0]).toMatchObject({ totalMatches: 15, omittedMatches: 0 })
    expect(exact.files[0]?.matches).toHaveLength(15)
  })

  it('ranks complete-query occurrences before the cap but keeps exact-file source order', async () => {
    const content = [...Array.from({ length: 12 }, () => '// Spec'), '// SpecRepository'].join('\n')
    const file = createFileNode({
      path: 'code-graph:src/spec-repository.ts',
      configRelativePath: 'packages/code-graph/src/spec-repository.ts',
      language: 'typescript',
      contentHash: 'spec-repository',
      workspace: 'code-graph',
      content,
    })
    await store.upsertFile(file, [], [])
    const search = new SearchCodeGraph(store)
    const request = {
      query: 'SpecRepository',
      categories: ['files'] as const,
      limit: 10,
      includeSnippet: false,
    }

    const general = await search.execute(request)
    const wildcard = await search.execute({ ...request, filePattern: 'code-graph:src/*.ts' })
    const exact = await search.execute({
      ...request,
      filePattern: file.path,
      exactFile: true,
    })

    for (const result of [general, wildcard]) {
      expect(result.files[0]).toMatchObject({ totalMatches: 15, omittedMatches: 5 })
      expect(result.files[0]?.matches).toHaveLength(10)
      expect(result.files[0]?.matches[0]).toMatchObject({
        matchKind: 'full-query',
        matchedText: 'SpecRepository',
        range: { startLine: 13 },
      })
      expect(result.files[0]?.matches.slice(1).map(({ range }) => range.startLine)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
      ])
    }

    expect(exact.files[0]).toMatchObject({ totalMatches: 15, omittedMatches: 0 })
    expect(exact.files[0]?.matches).toHaveLength(15)
    expect(exact.files[0]?.matches.slice(0, 12).map(({ range }) => range.startLine)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )
    expect(exact.files[0]?.matches.findIndex(({ matchKind }) => matchKind === 'full-query')).toBe(
      13,
    )
  })

  it('ranks later source candidate pages before applying the file limit', async () => {
    const early = createFileNode({
      path: 'code-graph:src/early.ts',
      configRelativePath: 'packages/code-graph/src/early.ts',
      language: 'typescript',
      contentHash: 'early',
      workspace: 'code-graph',
      content: '// Spec',
    })
    const later = createFileNode({
      path: 'code-graph:src/later.ts',
      configRelativePath: 'packages/code-graph/src/later.ts',
      language: 'typescript',
      contentHash: 'later',
      workspace: 'code-graph',
      content: '// SpecRepository',
    })
    vi.spyOn(store, 'searchSourceContentCandidates')
      .mockResolvedValueOnce({
        candidates: [{ file: early, backendScore: 100 }],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        candidates: [{ file: later, backendScore: 0 }],
      })

    const result = await new SearchCodeGraph(store).execute({
      query: 'SpecRepository',
      categories: ['files'],
      limit: 1,
      includeSnippet: false,
    })

    expect(result.files.map(({ file }) => file.path)).toEqual([later.path])
  })

  it('consumes a repeated backend cursor at most once', async () => {
    const file = createFileNode({
      path: 'code-graph:src/repeated.ts',
      configRelativePath: 'packages/code-graph/src/repeated.ts',
      language: 'typescript',
      contentHash: 'repeated',
      workspace: 'code-graph',
      content: '// needle',
    })
    const searchCandidates = vi
      .spyOn(store, 'searchSourceContentCandidates')
      .mockResolvedValue({ candidates: [{ file, backendScore: 1 }], nextCursor: 'same' })

    const result = await new SearchCodeGraph(store).execute({
      query: 'needle',
      categories: ['files'],
      limit: 2,
      includeSnippet: false,
    })

    expect(result.files).toHaveLength(1)
    expect(searchCandidates).toHaveBeenCalledTimes(2)
  })

  it('does not suppress declaration occurrences for symbols hidden by the display limit', async () => {
    const content = Array.from({ length: 11 }, () => 'function target() {}').join('\n')
    const file = createFileNode({
      path: 'code-graph:src/overloads.ts',
      configRelativePath: 'packages/code-graph/src/overloads.ts',
      language: 'typescript',
      contentHash: 'overloads',
      workspace: 'code-graph',
      content,
    })
    const symbols = Array.from({ length: 11 }, (_, index) =>
      createSymbolNode({
        name: 'target',
        kind: SymbolKind.Function,
        filePath: file.path,
        line: index + 1,
        column: 0,
        endLine: index + 1,
        endColumn: 20,
        selectionRange: {
          startLine: index + 1,
          startColumn: 9,
          endLine: index + 1,
          endColumn: 15,
        },
      }),
    )
    await store.upsertFile(file, symbols, [])

    const result = await new SearchCodeGraph(store).execute({
      query: 'target',
      categories: ['symbols', 'files'],
      limit: 10,
      includeSnippet: false,
    })

    expect(result.symbols).toHaveLength(10)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchObject({ totalMatches: 1, omittedMatches: 0 })
    const visibleDeclarationLines = new Set(
      result.symbols.flatMap(({ hits }) => hits.map(({ symbol }) => symbol.line)),
    )
    expect(result.files[0]?.matches).toHaveLength(1)
    expect(visibleDeclarationLines.has(result.files[0]!.matches[0]!.range.startLine)).toBe(false)
  })
})

function fileNode(path: string, workspace: string) {
  return createFileNode({
    path,
    configRelativePath: path.slice(path.indexOf(':') + 1),
    language: 'typescript',
    contentHash: `hash:${path}`,
    workspace,
  })
}
