import { describe, expect, it, vi } from 'vitest'
import { ResolveSymbolReference } from '../../../src/application/use-cases/resolve-symbol-reference.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import {
  MemberForm,
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
  }[]
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
  await store.replaceReferenceFacts({
    logicalSymbols: options.symbols,
    declarations: (options.declarations ?? []).map((item, index) => ({
      logicalSymbolId: item.logicalSymbolId,
      declaration: {
        logicalId: item.logicalSymbolId,
        symbolId: `symbol-${String(index)}`,
        kind: SymbolKind.Function,
        location: {
          filePath: item.filePath,
          line: index + 1,
          column: 0,
          endLine: index + 1,
          endColumn: 1,
        },
      },
    })),
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
  return store
}

function symbol(name: string, surface = 'src/api.ts'): LogicalSymbol {
  return createLogicalSymbol({
    workspace: 'core',
    surface,
    name,
    space: SymbolSpace.Value,
    ownerId: undefined,
    memberForm: undefined,
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
      memberForm: MemberForm.Instance,
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
      memberForm: MemberForm.Instance,
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
      memberForm: MemberForm.Instance,
    })
    const competing = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/competing.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'competing',
      memberForm: MemberForm.Instance,
    })
    const far = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/far.ts',
      name: 'run',
      space: SymbolSpace.Value,
      ownerId: 'far',
      memberForm: MemberForm.Instance,
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
      memberForm: MemberForm.Instance,
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
        memberForm: MemberForm.Instance,
      },
    )

    expect(nearest.status).toBe('resolved')
    expect(nearest.target?.id).toBe(near.id)
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
      memberForm: MemberForm.Getter,
    })
    const setter = createLogicalSymbol({
      workspace: 'core',
      surface: 'src/model.ts',
      name: 'value',
      space: SymbolSpace.Property,
      ownerId: 'owner',
      memberForm: MemberForm.Setter,
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
      memberForm: MemberForm.Getter,
    })

    expect(result.target?.memberForm).toBe(MemberForm.Getter)
  })
})
