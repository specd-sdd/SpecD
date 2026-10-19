import { describe, expect, it, vi } from 'vitest'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type FileNode } from '../../../src/domain/value-objects/file-node.js'
import {
  DeclarationOccurrenceForm,
  MemberAccessor,
  MemberDispatch,
  MemberKind,
  SymbolSpace,
  createLocalBinding,
  createLogicalSymbol,
  createPublicBinding,
  type LogicalSymbol,
  type ResolutionStep,
  type ResolutionHealth,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { IndexCoverageStatus } from '../../../src/domain/value-objects/index-session.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import {
  FreshnessState,
  IndexedResourceKind,
  type IndexedResourceKey,
} from '../../../src/domain/value-objects/indexed-input-freshness.js'

const freshHealth: ResolutionHealth = { fresh: true, complete: true, reasonCodes: [] }

async function makeStore(options: {
  symbols: readonly LogicalSymbol[]
  declarations?: readonly {
    logicalSymbolId: string
    filePath: string
    symbolId?: string
    line?: number
    column?: number
    form?: (typeof DeclarationOccurrenceForm)[keyof typeof DeclarationOccurrenceForm]
  }[]
  physicalSymbols?: readonly SymbolNode[]
  publicBindings?: ReturnType<typeof createPublicBinding>[]
  localBindings?: ReturnType<typeof createLocalBinding>[]
  steps?: readonly ResolutionStep[]
  coverage?: readonly {
    filePath: string
    status: (typeof IndexCoverageStatus)[keyof typeof IndexCoverageStatus]
    capabilities?: readonly string[]
  }[]
}): Promise<InMemoryGraphStore> {
  const store = new InMemoryGraphStore()
  await store.open()
  const declarations = (options.declarations ?? []).map((item, index) => {
    const symbolId = item.symbolId ?? `symbol-${String(index)}`
    const line = item.line ?? index + 1
    const column = item.column ?? 0
    return {
      logicalSymbolId: item.logicalSymbolId,
      declaration: {
        logicalId: item.logicalSymbolId,
        symbolId,
        kind: SymbolKind.Function,
        form: item.form ?? DeclarationOccurrenceForm.Declaration,
        location: {
          filePath: item.filePath,
          line,
          column,
          endLine: line,
          endColumn: column + 1,
        },
      },
    }
  })

  await store.replaceReferenceFacts({
    logicalSymbols: options.symbols,
    declarations,
    publicBindings: options.publicBindings ?? [],
    localBindings: options.localBindings ?? [],
    steps: options.steps ?? [],
    coverage: (options.coverage ?? []).map((entry) => ({
      ...entry,
      contentHash: 'hash',
      reason: entry.status === IndexCoverageStatus.Indexed ? undefined : 'COVERAGE_PARTIAL',
      capabilities: entry.capabilities ?? ['declarations'],
    })),
  })

  if (options.physicalSymbols !== undefined) {
    const symbolsByFile = new Map<string, SymbolNode[]>()
    for (const sym of options.physicalSymbols) {
      const list = symbolsByFile.get(sym.filePath) ?? []
      list.push(sym)
      symbolsByFile.set(sym.filePath, list)
    }
    for (const [filePath, syms] of symbolsByFile) {
      await store.upsertFile(
        {
          path: filePath,
          workspace: 'core',
          category: 'source',
          extension: '.ts',
          contentHash: 'hash',
        } as unknown as FileNode,
        syms,
        [],
      )
    }
  } else {
    const declarationsByFile = new Map<string, typeof declarations>()
    for (const d of declarations) {
      const list = declarationsByFile.get(d.declaration.location.filePath) ?? []
      list.push(d)
      declarationsByFile.set(d.declaration.location.filePath, list)
    }
    for (const [filePath, decls] of declarationsByFile) {
      await store.upsertFile(
        {
          path: filePath,
          workspace: 'core',
          category: 'source',
          extension: '.ts',
          contentHash: 'hash',
        } as unknown as FileNode,
        decls.map((d) => ({
          id: d.declaration.symbolId,
          name: 'fn',
          kind: d.declaration.kind,
          filePath: d.declaration.location.filePath,
          projectRelativePath: d.declaration.location.filePath,
          line: d.declaration.location.line,
          column: d.declaration.location.column,
          endLine: d.declaration.location.endLine,
          endColumn: d.declaration.location.endColumn,
          selectionRange: {
            startLine: d.declaration.location.line,
            startColumn: d.declaration.location.column,
            endLine: d.declaration.location.endLine,
            endColumn: d.declaration.location.endColumn,
          },
          parentId: undefined,
          comment: undefined,
        })),
        [],
      )
    }
  }

  return store
}

function symbol(name: string, surface = 'src/api.ts'): LogicalSymbol {
  return createLogicalSymbol({
    workspace: 'core',
    surface,
    name,
    space: SymbolSpace.Value,
    ownerId: undefined,
    memberSemantics: undefined,
  })
}

describe('ResolveSymbolReference', () => {
  it('resolves an exact declaration in the explicitly addressed file', async () => {
    const target = symbol('run')
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/api.ts' }],
    })
    const health = vi.fn().mockResolvedValue(freshHealth)

    const result = await new ResolveSymbolReference(store, health).execute({
      workspace: 'core',
      requested: 'run',
      filePath: 'core:src/api.ts',
      symbolSpace: SymbolSpace.Value,
    })

    expect(result.status).toBe('resolved')
    expect(result.target?.id).toBe(target.id)
    expect(health).toHaveBeenCalledTimes(1)
  })

  it('resolves a public alias to its canonical target', async () => {
    const target = symbol('internalRun', 'src/internal.ts')
    const binding = createPublicBinding({
      surface: 'core:src/index.ts',
      exportedName: 'run',
      space: SymbolSpace.Value,
      targetId: target.id,
    })
    const store = await makeStore({ symbols: [target], publicBindings: [binding] })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
      publicSurface: 'core:src/index.ts',
      symbolSpace: SymbolSpace.Value,
    })

    expect(result.status).toBe('resolved')
    expect(result.target?.id).toBe(target.id)
  })

  it('reports competing targets in one public export slot as ambiguous', async () => {
    const first = symbol('first', 'src/first.ts')
    const second = symbol('second', 'src/second.ts')
    const publicBindings = [first, second].map((target) =>
      createPublicBinding({
        surface: 'core:src/index.ts',
        exportedName: 'shared',
        space: SymbolSpace.Value,
        targetId: target.id,
      }),
    )
    const store = await makeStore({ symbols: [first, second], publicBindings })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'shared',
      publicSurface: 'core:src/index.ts',
      symbolSpace: SymbolSpace.Value,
    })

    expect(result.status).toBe('ambiguous')
    expect(result.target).toBeNull()
    expect(result.candidates.map(({ target }) => target.id)).toEqual([first.id, second.id].sort())
  })

  it('batches and gates freshness for declaration files contributing to candidates', async () => {
    const target = symbol('internalRun', 'src/internal.ts')
    const binding = createPublicBinding({
      surface: 'core:src/index.ts',
      exportedName: 'run',
      space: SymbolSpace.Value,
      targetId: target.id,
    })
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/internal.ts' }],
      publicBindings: [binding],
      coverage: [{ filePath: 'core:src/internal.ts', status: IndexCoverageStatus.Indexed }],
    })
    const assess = vi.fn(async (resources: readonly IndexedResourceKey[]) =>
      resources.map((resource) => ({
        ...resource,
        state: FreshnessState.Stale,
        reasons: ['CONTENT_HASH_CHANGED'],
      })),
    )

    const results = await new ResolveSymbolReference(
      store,
      async () => freshHealth,
      assess,
    ).executeBatch([
      {
        workspace: 'core',
        requested: 'run',
        publicSurface: 'core:src/index.ts',
        symbolSpace: SymbolSpace.Value,
      },
      {
        workspace: 'core',
        requested: 'run',
        publicSurface: 'core:src/index.ts',
        symbolSpace: SymbolSpace.Value,
      },
    ])

    expect(results.map((result) => result.status)).toEqual(['unresolved', 'unresolved'])
    expect(results[0]?.reasonCode).toBe('CONTENT_HASH_CHANGED')
    expect(assess).toHaveBeenCalledTimes(1)
    expect(assess).toHaveBeenCalledWith([
      {
        workspace: 'core',
        resourceKind: IndexedResourceKind.File,
        resourceId: 'core:src/index.ts',
      },
      {
        workspace: 'core',
        resourceKind: IndexedResourceKind.File,
        resourceId: 'core:src/internal.ts',
      },
    ])
  })

  it('rejects a proven candidate when requested build context was not indexed', async () => {
    const target = symbol('run')
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/api.ts' }],
      coverage: [
        {
          filePath: 'core:src/api.ts',
          status: IndexCoverageStatus.Indexed,
          capabilities: ['declarations'],
        },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
      filePath: 'core:src/api.ts',
      symbolSpace: SymbolSpace.Value,
      buildContext: { platform: 'node' },
    })

    expect(result.status).toBe('unresolved')
    expect(result.reasonCode).toBe('BUILD_CONTEXT_UNSUPPORTED')
  })

  it('does not accept a unique same-name workspace candidate without proof', async () => {
    const target = symbol('run')
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/api.ts' }],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
    })

    expect(result.status).toBe('unresolved')
    expect(result.reasonCode).toBe('REFERENCE_UNPROVEN')
  })

  it('marks complete fresh file absence missing', async () => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Indexed }],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'removed',
      filePath: 'core:src/api.ts',
    })

    expect(result.status).toBe('missing')
    expect(result.reasonCode).toBe('REFERENCE_ABSENT')
  })

  it('uses exact current file evidence despite unrelated aggregate staleness', async () => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(
      store,
      async () => ({ fresh: false, complete: true, reasonCodes: ['CONTENT_DIRTY'] }),
      async (resources) =>
        resources.map((resource) => ({
          ...resource,
          state: FreshnessState.Current,
          reasons: [],
        })),
    ).execute({ workspace: 'core', requested: 'removed', filePath: 'core:src/api.ts' })

    expect(result.status).toBe('missing')
    expect(result.reasonCode).toBe('REFERENCE_ABSENT')
  })

  it('proves a missing public export from current surface evidence', async () => {
    const publicSurface = 'core:src/index.ts'
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: publicSurface, status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(
      store,
      async () => ({ fresh: false, complete: true, reasonCodes: ['CONTENT_DIRTY'] }),
      async (resources) =>
        resources.map((resource) => ({
          ...resource,
          state: FreshnessState.Current,
          reasons: [],
        })),
    ).execute({ workspace: 'core', requested: 'removed', publicSurface })

    expect(result).toMatchObject({ status: 'missing', reasonCode: 'REFERENCE_ABSENT' })
  })

  it('does not prove a missing public export from stale surface evidence', async () => {
    const publicSurface = 'core:src/index.ts'
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: publicSurface, status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(
      store,
      async () => freshHealth,
      async (resources) =>
        resources.map((resource) => ({
          ...resource,
          state: FreshnessState.Stale,
          reasons: ['CONTENT_HASH_CHANGED'],
        })),
    ).execute({ workspace: 'core', requested: 'removed', publicSurface })

    expect(result).toMatchObject({ status: 'unresolved', reasonCode: 'CONTENT_HASH_CHANGED' })
  })

  it('does not prove a missing public export from unknown surface evidence', async () => {
    const publicSurface = 'core:src/index.ts'
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: publicSurface, status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(
      store,
      async () => freshHealth,
      async (resources) =>
        resources.map((resource) => ({
          ...resource,
          state: FreshnessState.Unknown,
          reasons: ['RESOURCE_INSPECTION_FAILED'],
        })),
    ).execute({ workspace: 'core', requested: 'removed', publicSurface })

    expect(result).toMatchObject({ status: 'unresolved', reasonCode: 'RESOURCE_INSPECTION_FAILED' })
  })

  it('does not claim absence when exact file evidence is stale', async () => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(
      store,
      async () => freshHealth,
      async () => [
        {
          workspace: 'core',
          resourceKind: IndexedResourceKind.File,
          resourceId: 'core:src/api.ts',
          state: FreshnessState.Stale,
          reasons: ['CONTENT_HASH_CHANGED'],
        },
      ],
    ).execute({ workspace: 'core', requested: 'removed', filePath: 'core:src/api.ts' })

    expect(result.status).toBe('unresolved')
    expect(result.reasonCode).toBe('CONTENT_HASH_CHANGED')
  })

  it('keeps partial coverage unresolved', async () => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Partial }],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'missing',
      filePath: 'core:src/api.ts',
    })

    expect(result.status).toBe('unresolved')
    expect(result.reasonCode).toBe('COVERAGE_PARTIAL')
  })

  it.each([
    IndexCoverageStatus.Excluded,
    IndexCoverageStatus.Unsupported,
    IndexCoverageStatus.ParseFailed,
    IndexCoverageStatus.Partial,
  ])('never classifies %s coverage absence as stale', async (status) => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status }],
    })
    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'missing',
      filePath: 'core:src/api.ts',
    })
    expect(result.status).toBe('unresolved')
  })

  it('keeps parallel public routes to competing targets ambiguous', async () => {
    const first = symbol('first', 'src/first.ts')
    const second = symbol('second', 'src/second.ts')
    const bindings = [first, second].map((target) =>
      createPublicBinding({
        surface: 'core:src/index.ts',
        exportedName: 'run',
        space: SymbolSpace.Value,
        targetId: target.id,
      }),
    )
    // Distinct routes retain identity even when their exported spelling is equal.
    const store = await makeStore({
      symbols: [first, second],
      publicBindings: [bindings[0]!, { ...bindings[1]!, id: `${bindings[1]!.id}|route:2` }],
    })
    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
      publicSurface: 'core:src/index.ts',
    })
    expect(result.status).toBe('ambiguous')
    expect(result.target).toBeNull()
  })

  it('returns the graph health reason before considering absence stale', async () => {
    const store = await makeStore({
      symbols: [],
      coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Indexed }],
    })
    const result = await new ResolveSymbolReference(store, async () => ({
      fresh: false,
      complete: true,
      reasonCodes: ['GRAPH_DIRTY_CONTENT'],
    })).execute({
      workspace: 'core',
      requested: 'missing',
      filePath: 'core:src/api.ts',
    })
    expect(result).toMatchObject({ status: 'unresolved', reasonCode: 'GRAPH_DIRTY_CONTENT' })
  })

  it('reports competing exact declarations as ambiguous without choosing a target', async () => {
    const first = symbol('run', 'src/first.ts')
    const second = symbol('run', 'src/second.ts')
    const store = await makeStore({
      symbols: [second, first],
      declarations: [
        { logicalSymbolId: first.id, filePath: 'core:src/api.ts' },
        { logicalSymbolId: second.id, filePath: 'core:src/api.ts' },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
      filePath: 'core:src/api.ts',
    })

    expect(result.status).toBe('ambiguous')
    expect(result.target).toBeNull()
    expect(result.candidates.map((candidate) => candidate.target.id)).toEqual(
      [...result.candidates.map((candidate) => candidate.target.id)].sort(),
    )
  })

  it('resolves a scoped local alias without classifying it as a public binding', async () => {
    const target = symbol('Internal', 'src/internal.ts')
    const local = createLocalBinding({
      filePath: 'core:src/use.ts',
      scopeId: 'scope:inner',
      localName: 'Alias',
      space: SymbolSpace.Type,
      targetId: target.id,
      range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 8 },
    })
    const store = await makeStore({ symbols: [target], localBindings: [local] })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'Alias',
      filePath: 'core:src/use.ts',
      scopeId: 'scope:inner',
      symbolSpace: SymbolSpace.Type,
    })

    expect(result.status).toBe('resolved')
    expect(result.target?.id).toBe(target.id)
  })

  it('resolves a requested member declared under a reached ancestor owner', async () => {
    const inherited = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/base.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'base',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const store = await makeStore({
      symbols: [inherited],
      steps: [
        { fromId: 'derived', toId: 'base', kind: 'extends' },
        { fromId: 'base', toId: 'derived', kind: 'cycle' },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'run',
      ownerId: 'derived',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })

    expect(result.status).toBe('resolved')
    expect(result.target?.id).toBe(inherited.id)
    expect(result.path).toEqual([{ fromId: 'derived', toId: 'base', kind: 'extends' }])
  })

  it('uses the nearest ancestor depth and preserves equal-depth ambiguity', async () => {
    const near = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/near.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'near',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const competing = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/competing.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'competing',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const far = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/far.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'far',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const steps: ResolutionStep[] = [
      { fromId: 'derived', toId: 'near', kind: 'extends' },
      { fromId: 'derived', toId: 'competing', kind: 'mixin' },
      { fromId: 'near', toId: 'far', kind: 'extends' },
    ]
    const ambiguousStore = await makeStore({ symbols: [near, competing, far], steps })

    const ambiguous = await new ResolveSymbolReference(
      ambiguousStore,
      async () => freshHealth,
    ).execute({
      workspace: 'core',
      requested: 'run',
      ownerId: 'derived',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })

    expect(ambiguous.status).toBe('ambiguous')
    expect(ambiguous.candidates.map(({ target }) => target.id)).toEqual(
      expect.arrayContaining([near.id, competing.id]),
    )
    expect(ambiguous.candidates).toHaveLength(2)
    expect(ambiguous.candidates.some(({ target }) => target.id === far.id)).toBe(false)

    const nearestStore = await makeStore({ symbols: [near, far], steps })
    const nearest = await new ResolveSymbolReference(nearestStore, async () => freshHealth).execute(
      {
        workspace: 'core',
        requested: 'run',
        ownerId: 'derived',
        memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
      },
    )

    expect(nearest.status).toBe('resolved')
    expect(nearest.target?.id).toBe(near.id)
  })

  describe('hierarchy precedence, coverage gating and qualified spellings', () => {
    const method = { kind: MemberKind.Method, dispatch: MemberDispatch.Instance } as const
    const member = (surface: string, owner: string): LogicalSymbol =>
      createLogicalSymbol({
        workspace: 'core',
        surface,
        name: 'run',
        space: SymbolSpace.Value,
        ownerId: owner,
        memberSemantics: method,
      })

    it('resolves an MRO tie to the base with the earlier extends precedence', async () => {
      const first = member('src/a.py', 'A')
      const second = member('src/b.py', 'B')
      const store = await makeStore({
        symbols: [first, second],
        steps: [
          { fromId: 'C', toId: 'A', kind: 'extends:0' },
          { fromId: 'C', toId: 'B', kind: 'extends:1' },
        ],
      })

      const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
        workspace: 'core',
        requested: 'run',
        ownerId: 'C',
        memberSemantics: method,
      })

      expect(result.status).toBe('resolved')
      expect(result.target?.id).toBe(first.id)
    })

    it('keeps equal-precedence bases ambiguous', async () => {
      const first = member('src/a.py', 'A')
      const second = member('src/b.py', 'B')
      const store = await makeStore({
        symbols: [first, second],
        steps: [
          { fromId: 'C', toId: 'A', kind: 'extends:0' },
          { fromId: 'C', toId: 'B', kind: 'extends:0' },
        ],
      })

      const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
        workspace: 'core',
        requested: 'run',
        ownerId: 'C',
        memberSemantics: method,
      })

      expect(result.status).toBe('ambiguous')
    })

    it('claims absence in an indexed file despite unrelated incomplete coverage', async () => {
      const store = await makeStore({
        symbols: [],
        coverage: [{ filePath: 'core:src/api.ts', status: IndexCoverageStatus.Indexed }],
      })

      const result = await new ResolveSymbolReference(store, async () => ({
        fresh: true,
        complete: false,
        reasonCodes: ['COVERAGE_PARTIAL'],
      })).execute({ workspace: 'core', requested: 'gone', filePath: 'core:src/api.ts' })

      expect(result.status).toBe('missing')
      expect(result.reasonCode).toBe('REFERENCE_ABSENT')
    })

    it('does not claim absence for a logical id while the graph coverage is incomplete', async () => {
      const store = await makeStore({ symbols: [] })

      const result = await new ResolveSymbolReference(store, async () => ({
        fresh: true,
        complete: false,
        reasonCodes: ['COVERAGE_PARTIAL'],
      })).execute({ workspace: 'core', requested: 'x', logicalId: symbol('x').id })

      expect(result.status).toBe('unresolved')
    })

    it('does not answer an unanchored qualified name from a stale graph', async () => {
      const owner = createLogicalSymbol({
        workspace: 'core',
        surface: 'src/a.ts',
        name: 'Owner',
        space: SymbolSpace.Type,
        ownerId: undefined,
        memberSemantics: undefined,
      })
      const run = { ...member('src/a.ts', owner.id), qualifiedName: 'Owner.run' }
      const store = await makeStore({
        symbols: [owner, run],
        declarations: [{ logicalSymbolId: run.id, filePath: 'core:src/a.ts' }],
      })
      const stale = async (): Promise<ResolutionHealth> => ({
        fresh: false,
        complete: true,
        reasonCodes: ['CONTENT_DIRTY'],
      })

      const result = await new ResolveSymbolReference(store, stale).execute({
        workspace: 'core',
        requested: 'Owner.run',
      })

      expect(result.status).toBe('unresolved')
      expect(result.reasonCode).toBe('CONTENT_DIRTY')
    })

    it('resolves a qualified spelling with several owner segments', async () => {
      const outer = createLogicalSymbol({
        workspace: 'core',
        surface: 'src/a.ts',
        name: 'Outer',
        space: SymbolSpace.Type,
        ownerId: undefined,
        memberSemantics: undefined,
      })
      const inner = createLogicalSymbol({
        workspace: 'core',
        surface: 'src/a.ts',
        name: 'Inner',
        space: SymbolSpace.Type,
        ownerId: outer.id,
        memberSemantics: undefined,
      })
      const run = member('src/a.ts', inner.id)
      const store = await makeStore({
        symbols: [outer, inner, run],
        declarations: [{ logicalSymbolId: run.id, filePath: 'core:src/a.ts' }],
      })

      const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
        workspace: 'core',
        requested: 'Outer.Inner.run',
      })

      expect(result.status).toBe('resolved')
      expect(result.target?.id).toBe(run.id)
    })
  })

  it('shares one health snapshot across a batch', async () => {
    const store = await makeStore({ symbols: [] })
    const health = vi.fn().mockResolvedValue({
      fresh: false,
      complete: false,
      reasonCodes: ['GRAPH_DIRTY_CONTENT'],
    } satisfies ResolutionHealth)
    const resolver = new ResolveSymbolReference(store, health)

    const results = await resolver.executeBatch([
      { workspace: 'core', requested: 'one' },
      { workspace: 'core', requested: 'two' },
    ])

    expect(health).toHaveBeenCalledTimes(1)
    expect(results.map((result) => result.reasonCode)).toEqual([
      'GRAPH_DIRTY_CONTENT',
      'GRAPH_DIRTY_CONTENT',
    ])
  })

  it('keeps member forms distinct', async () => {
    const getter = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/model.ts',
      name: 'value',
      space: SymbolSpace.Property,
      ownerId: 'owner',
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Instance,
        accessor: MemberAccessor.Get,
      },
    })
    const setter = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/model.ts',
      name: 'value',
      space: SymbolSpace.Property,
      ownerId: 'owner',
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Instance,
        accessor: MemberAccessor.Set,
      },
    })
    const store = await makeStore({
      symbols: [getter, setter],
      declarations: [
        { logicalSymbolId: getter.id, filePath: 'core:src/model.ts' },
        { logicalSymbolId: setter.id, filePath: 'core:src/model.ts' },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'value',
      filePath: 'core:src/model.ts',
      ownerId: 'owner',
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Instance,
        accessor: MemberAccessor.Get,
      },
    })

    expect(result.target?.memberSemantics).toEqual({
      kind: MemberKind.Property,
      dispatch: MemberDispatch.Instance,
      accessor: MemberAccessor.Get,
    })
  })

  it('resolves unanchored EditChange.execute and ArchiveChange::execute by qualified name', async () => {
    const owner = symbol('EditChange', 'src/edit.ts')
    const member = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/edit.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const store = await makeStore({
      symbols: [owner, member],
      declarations: [
        { logicalSymbolId: owner.id, filePath: 'core:src/edit.ts' },
        { logicalSymbolId: member.id, filePath: 'core:src/edit.ts' },
      ],
    })
    const php = new PhpLanguageAdapter()
    const phpParse = vi.spyOn(php, 'parseSymbolReference')
    const registry = new AdapterRegistry()
    registry.register(php)
    const resolver = new ResolveSymbolReference(store, async () => freshHealth, undefined, registry)

    const dotted = await resolver.execute({
      workspace: 'core',
      requested: 'EditChange.execute',
    })
    const native = await resolver.execute({
      workspace: 'core',
      requested: 'EditChange::execute',
    })
    const elsewhere = await resolver.execute({
      workspace: 'core',
      requested: 'EditChange.execute',
      filePath: 'core:src/other.ts',
      publicSurface: 'core:src/other.ts',
    })

    expect(dotted.status).toBe('resolved')
    expect(dotted.target?.id).toBe(member.id)
    expect(native.status).toBe('resolved')
    expect(native.target?.id).toBe(member.id)
    expect(elsewhere.status).toBe('unresolved')
    expect(phpParse).not.toHaveBeenCalled()
  })

  it('returns every equal qualified name and does not borrow a missing member', async () => {
    const first = symbol('GetStatus', 'core:src/a.ts')
    const second = symbol('GetStatus', 'core:src/b.ts')
    const firstMember = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/a.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: first.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const secondMember = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/b.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: second.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const store = await makeStore({
      symbols: [first, second, firstMember, secondMember],
      declarations: [
        { logicalSymbolId: firstMember.id, filePath: 'core:src/a.ts' },
        { logicalSymbolId: secondMember.id, filePath: 'core:src/b.ts' },
      ],
    })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const matches = await resolver.execute({ workspace: 'core', requested: 'GetStatus.execute' })
    const missing = await resolver.execute({ workspace: 'core', requested: 'GetStatus.missing' })

    expect(matches.status).toBe('ambiguous')
    expect(matches.candidates.map((candidate) => candidate.target.id).sort()).toEqual(
      [firstMember.id, secondMember.id].sort(),
    )
    expect(missing.status).toBe('unresolved')
  })

  it('uses the PHP adapter for syntax that is not a single qualified spelling', async () => {
    const php = new PhpLanguageAdapter()
    const typescript = new TypeScriptLanguageAdapter()
    const phpParse = vi.spyOn(php, 'parseSymbolReference')
    const tsParse = vi.spyOn(typescript, 'parseSymbolReference')
    const registry = new AdapterRegistry()
    registry.register(typescript)
    registry.register(php)
    const store = await makeStore({ symbols: [] })

    const result = await new ResolveSymbolReference(
      store,
      async () => freshHealth,
      undefined,
      registry,
    ).execute({
      workspace: 'core',
      requested: 'ArchiveChange::execute()',
      language: 'php',
    })

    expect(result.status).toBe('unresolved')
    expect(phpParse).toHaveBeenCalledWith('ArchiveChange::execute()')
    expect(tsParse).not.toHaveBeenCalled()
  })

  it('resolves the owner before the member and does not borrow a member from another owner', async () => {
    const edit = symbol('EditChange', 'core:src/edit.ts')
    const other = symbol('Other', 'core:src/other.ts')
    const execute = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: edit.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const missing = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/other.ts',
      name: 'missing',
      space: SymbolSpace.Value,
      ownerId: other.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const store = await makeStore({
      symbols: [edit, other, execute, missing],
      declarations: [
        { logicalSymbolId: edit.id, filePath: 'core:src/edit.ts' },
        { logicalSymbolId: execute.id, filePath: 'core:src/edit.ts' },
        { logicalSymbolId: other.id, filePath: 'core:src/other.ts' },
        { logicalSymbolId: missing.id, filePath: 'core:src/other.ts' },
      ],
    })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const found = await resolver.execute({
      workspace: 'core',
      requested: 'EditChange.execute',
      filePath: 'core:src/edit.ts',
      publicSurface: 'core:src/edit.ts',
    })
    const absent = await resolver.execute({
      workspace: 'core',
      requested: 'EditChange.missing',
      filePath: 'core:src/edit.ts',
      publicSurface: 'core:src/edit.ts',
    })

    expect(found.status).toBe('resolved')
    expect(found.target?.id).toBe(execute.id)
    expect(absent.status).toBe('unresolved')
  })

  it('matches a public binding by surface and exported name, not by file path alone', async () => {
    const target = symbol('run', 'src/internal.ts')
    const binding = createPublicBinding({
      surface: 'core:src/index.ts',
      exportedName: 'run',
      space: SymbolSpace.Value,
      targetId: target.id,
    })
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/internal.ts' }],
      publicBindings: [binding],
    })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const matched = await resolver.execute({
      workspace: 'core',
      requested: 'run',
      publicSurface: 'core:src/index.ts',
    })
    const byFile = await resolver.execute({
      workspace: 'core',
      requested: 'run',
      filePath: 'core:src/other.ts',
    })

    expect(matched.status).toBe('resolved')
    expect(matched.target?.id).toBe(target.id)
    expect(byFile.status).not.toBe('resolved')
  })

  it('reports value and type MemberForm as ambiguous when space is omitted', async () => {
    const value = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/symbol-reference.ts',
      name: 'MemberForm',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const type = createLogicalSymbol({
      ...value,
      space: SymbolSpace.Type,
    })
    const store = await makeStore({
      symbols: [value, type],
      declarations: [
        { logicalSymbolId: value.id, filePath: 'code-graph:src/symbol-reference.ts' },
        { logicalSymbolId: type.id, filePath: 'code-graph:src/symbol-reference.ts' },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'code-graph',
      requested: 'MemberForm',
      filePath: 'code-graph:src/symbol-reference.ts',
    })

    expect(result.status).toBe('ambiguous')
  })

  it('resolves a logical|2| id and a location-backed symbol id without human parsing', async () => {
    const target = symbol('execute', 'src/edit.ts')
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/edit.ts' }],
    })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const byLogical = await resolver.execute({
      workspace: 'other',
      requested: target.id,
    })
    const byLocation = await resolver.execute({
      workspace: 'core',
      requested: 'core:src/edit.ts:method:execute:12:0',
      filePath: 'core:src/edit.ts',
    })

    expect(byLogical.status).toBe('resolved')
    expect(byLogical.target?.id).toBe(target.id)
    expect(byLogical.resolvedTarget?.kind).toBe('logical-target')
    expect(byLocation.status).not.toBe('resolved')
    expect(byLocation.target?.id).not.toBe(target.id)
  })

  it('discriminates logical target with all contributing declarations', async () => {
    const target = symbol('overloaded')
    const store = await makeStore({
      symbols: [target],
      declarations: [
        {
          logicalSymbolId: target.id,
          filePath: 'core:src/api.ts',
          symbolId: 'sym-sig-1',
          line: 10,
          column: 0,
          form: DeclarationOccurrenceForm.Signature,
        },
        {
          logicalSymbolId: target.id,
          filePath: 'core:src/api.ts',
          symbolId: 'sym-sig-2',
          line: 15,
          column: 0,
          form: DeclarationOccurrenceForm.Signature,
        },
        {
          logicalSymbolId: target.id,
          filePath: 'core:src/api.ts',
          symbolId: 'sym-impl',
          line: 20,
          column: 0,
          form: DeclarationOccurrenceForm.Implementation,
        },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'overloaded',
      filePath: 'core:src/api.ts',
    })

    expect(result.status).toBe('resolved')
    expect(result.resolvedTarget?.kind).toBe('logical-target')
    if (result.resolvedTarget?.kind === 'logical-target') {
      expect(result.resolvedTarget.logicalSymbol.id).toBe(target.id)
      expect(result.resolvedTarget.declarations).toHaveLength(3)
      expect(result.resolvedTarget.declarations.map((d) => d.symbolId)).toEqual([
        'sym-sig-1',
        'sym-sig-2',
        'sym-impl',
      ])
      expect(result.resolvedTarget.declarations[0]!.form).toBe(DeclarationOccurrenceForm.Signature)
      expect(result.resolvedTarget.declarations[2]!.form).toBe(
        DeclarationOccurrenceForm.Implementation,
      )
    }
  })

  it('discriminates public-binding target with export binding and logical declarations', async () => {
    const target = symbol('internalExport', 'src/internal.ts')
    const binding = createPublicBinding({
      surface: 'core:src/index.ts',
      exportedName: 'exportedFunc',
      space: SymbolSpace.Value,
      targetId: target.id,
    })
    const store = await makeStore({
      symbols: [target],
      declarations: [{ logicalSymbolId: target.id, filePath: 'core:src/internal.ts' }],
      publicBindings: [binding],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'exportedFunc',
      publicSurface: 'core:src/index.ts',
      symbolSpace: SymbolSpace.Value,
    })

    expect(result.status).toBe('resolved')
    expect(result.resolvedTarget?.kind).toBe('public-binding')
    if (result.resolvedTarget?.kind === 'public-binding') {
      expect(result.resolvedTarget.binding.id).toBe(binding.id)
      expect(result.resolvedTarget.logicalSymbol.id).toBe(target.id)
      expect(result.resolvedTarget.declarations).toHaveLength(1)
    }
  })

  it('resolves exact declaration by declarationSymbolId', async () => {
    const target = symbol('exactTarget')
    const store = await makeStore({
      symbols: [target],
      declarations: [
        {
          logicalSymbolId: target.id,
          filePath: 'core:src/api.ts',
          symbolId: 'exact-sym-id',
          line: 42,
          column: 4,
        },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'exactTarget',
      declarationSymbolId: 'exact-sym-id',
    })

    expect(result.status).toBe('resolved')
    expect(result.resolvedTarget?.kind).toBe('declaration')
    if (result.resolvedTarget?.kind === 'declaration') {
      expect(result.resolvedTarget.declaration.symbolId).toBe('exact-sym-id')
      expect(result.resolvedTarget.declaration.location.line).toBe(42)
      expect(result.resolvedTarget.logicalSymbol?.id).toBe(target.id)
    }
    expect(result.target?.id).toBe(target.id)
  })

  it('resolves exact declaration by file and position', async () => {
    const target = symbol('posTarget')
    const store = await makeStore({
      symbols: [target],
      declarations: [
        {
          logicalSymbolId: target.id,
          filePath: 'core:src/foo.ts',
          symbolId: 'pos-sym-id',
          line: 25,
          column: 6,
        },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'posTarget',
      filePath: 'core:src/foo.ts',
      position: { line: 25, column: 6 },
    })

    expect(result.status).toBe('resolved')
    expect(result.resolvedTarget?.kind).toBe('declaration')
    if (result.resolvedTarget?.kind === 'declaration') {
      expect(result.resolvedTarget.declaration.symbolId).toBe('pos-sym-id')
      expect(result.resolvedTarget.logicalSymbol?.id).toBe(target.id)
    }
  })

  it('resolves physical-only declaration without logical target mapping', async () => {
    const physicalSym: SymbolNode = {
      id: 'physical-only-id',
      name: '<anonymous>',
      kind: SymbolKind.Function,
      filePath: 'core:src/anon.ts',
      projectRelativePath: 'src/anon.ts',
      line: 30,
      column: 12,
      endLine: 35,
      endColumn: 1,
      selectionRange: { startLine: 30, startColumn: 12, endLine: 35, endColumn: 1 },
      parentId: undefined,
      comment: undefined,
    }
    const store = await makeStore({
      symbols: [],
      declarations: [],
      physicalSymbols: [physicalSym],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: '<anonymous>',
      declarationSymbolId: 'physical-only-id',
    })

    expect(result.status).toBe('resolved')
    expect(result.resolvedTarget?.kind).toBe('declaration')
    if (result.resolvedTarget?.kind === 'declaration') {
      expect(result.resolvedTarget.declaration.symbolId).toBe('physical-only-id')
      expect(result.resolvedTarget.logicalSymbol).toBeUndefined()
    }
    expect(result.target).toBeNull()
  })

  it('validates selector exclusivity and coordinate ranges', async () => {
    const store = await makeStore({ symbols: [] })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    // combining declarationSymbolId and position
    const combo1 = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      filePath: 'core:src/api.ts',
      declarationSymbolId: 'sym-1',
      position: { line: 1, column: 0 },
    })
    expect(combo1.status).toBe('unresolved')
    expect(combo1.reasonCode).toBe('INVALID_SELECTOR')

    // combining declarationSymbolId and logicalId
    const combo2 = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      declarationSymbolId: 'sym-1',
      logicalId: 'logical|2|core|src/api.ts|test|val',
    })
    expect(combo2.status).toBe('unresolved')
    expect(combo2.reasonCode).toBe('INVALID_SELECTOR')

    // position with line < 1
    const badLine = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      filePath: 'core:src/api.ts',
      position: { line: 0, column: 0 },
    })
    expect(badLine.status).toBe('unresolved')
    expect(badLine.reasonCode).toBe('INVALID_SELECTOR')

    // position with column < 0
    const badCol = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      filePath: 'core:src/api.ts',
      position: { line: 1, column: -1 },
    })
    expect(badCol.status).toBe('unresolved')
    expect(badCol.reasonCode).toBe('INVALID_SELECTOR')

    // position without filePath
    const noFile = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      position: { line: 1, column: 0 },
    })
    expect(noFile.status).toBe('unresolved')
    expect(noFile.reasonCode).toBe('INVALID_SELECTOR')
  })

  it('reports DECLARATION_NOT_FOUND when exact declaration does not exist', async () => {
    const store = await makeStore({ symbols: [] })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const result = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      declarationSymbolId: 'missing-sym-id',
    })
    expect(result.status).toBe('missing')
    expect(result.reasonCode).toBe('DECLARATION_NOT_FOUND')

    const posResult = await resolver.execute({
      workspace: 'core',
      requested: 'test',
      filePath: 'core:src/api.ts',
      position: { line: 99, column: 0 },
    })
    expect(posResult.status).toBe('missing')
    expect(posResult.reasonCode).toBe('DECLARATION_NOT_FOUND')
  })

  it('reports AMBIGUOUS_DECLARATION when multiple physical declarations match position', async () => {
    const sym1: SymbolNode = {
      id: 'sym-1',
      name: 'dup1',
      kind: SymbolKind.Variable,
      filePath: 'core:src/api.ts',
      projectRelativePath: 'src/api.ts',
      line: 5,
      column: 10,
      endLine: 5,
      endColumn: 15,
      selectionRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 15 },
      parentId: undefined,
      comment: undefined,
    }
    const sym2: SymbolNode = {
      id: 'sym-2',
      name: 'dup2',
      kind: SymbolKind.Variable,
      filePath: 'core:src/api.ts',
      projectRelativePath: 'src/api.ts',
      line: 5,
      column: 10,
      endLine: 5,
      endColumn: 20,
      selectionRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 20 },
      parentId: undefined,
      comment: undefined,
    }
    const store = await makeStore({
      symbols: [],
      declarations: [],
      physicalSymbols: [sym1, sym2],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'dup',
      filePath: 'core:src/api.ts',
      position: { line: 5, column: 10 },
    })

    expect(result.status).toBe('ambiguous')
    expect(result.reasonCode).toBe('AMBIGUOUS_DECLARATION')
  })

  it('reports LOGICAL_TARGET_NOT_FOUND when requested logicalId does not exist', async () => {
    const store = await makeStore({ symbols: [] })
    const resolver = new ResolveSymbolReference(store, async () => freshHealth)

    const result = await resolver.execute({
      workspace: 'core',
      requested: 'missingFunc',
      logicalId: 'logical|2|core|src/api.ts|missingFunc|val',
    })

    expect(result.status).toBe('missing')
    expect(result.reasonCode).toBe('LOGICAL_TARGET_NOT_FOUND')
  })

  it('reports AMBIGUOUS_LOGICAL_TARGET with competing semantic targets', async () => {
    const first = symbol('competing')
    const second = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/other.ts',
      name: 'competing',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const store = await makeStore({
      symbols: [first, second],
      declarations: [
        { logicalSymbolId: first.id, filePath: 'core:src/api.ts' },
        { logicalSymbolId: second.id, filePath: 'core:src/api.ts' },
      ],
    })

    const result = await new ResolveSymbolReference(store, async () => freshHealth).execute({
      workspace: 'core',
      requested: 'competing',
      filePath: 'core:src/api.ts',
      symbolSpace: SymbolSpace.Value,
    })

    expect(result.status).toBe('ambiguous')
    expect(result.reasonCode).toBe('AMBIGUOUS_LOGICAL_TARGET')
    expect(result.candidates).toHaveLength(2)
  })
})
