import { beforeEach, describe, expect, it } from 'vitest'
import { computeHotspots } from '../../../src/domain/services/compute-hotspots.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { DEFAULT_HOTSPOT_KINDS } from '../../../src/domain/value-objects/hotspot-result.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

function sym(name: string, filePath: string, line: number, kind: SymbolKind = SymbolKind.Function) {
  return createSymbolNode({ name, kind, filePath, line, column: 0 })
}

function file(
  path: string,
  workspace = 'ws-a',
  category: 'source' | 'test' | 'ignored' = 'source',
) {
  return createFileNode({
    path,
    configRelativePath: '',
    language: 'typescript',
    contentHash: 'sha256:x',
    workspace,
    category,
  })
}

describe('computeHotspots', () => {
  let store: InMemoryGraphStore

  beforeEach(async () => {
    store = new InMemoryGraphStore()
    await store.open()
  })

  it('returns empty for an empty graph', async () => {
    const result = await computeHotspots(store)
    expect(result.entries).toHaveLength(0)
    expect(result.totalSymbols).toBe(0)
  })

  it('applies the capped importer reinforcement formula', async () => {
    const target = sym('target', 'ws-a:target.ts', 1)
    const sameA = sym('sameA', 'ws-a:callers.ts', 1)
    const sameB = sym('sameB', 'ws-a:callers.ts', 2)
    const cross = sym('cross', 'ws-b:cross.ts', 1)

    await store.upsertFile(file('ws-a:target.ts'), [target], [])
    await store.upsertFile(
      file('ws-a:callers.ts'),
      [sameA, sameB],
      [
        createRelation({ source: sameA.id, target: target.id, type: RelationType.Calls }),
        createRelation({ source: sameB.id, target: target.id, type: RelationType.Calls }),
      ],
    )
    await store.upsertFile(
      file('ws-b:cross.ts', 'ws-b'),
      [cross],
      [createRelation({ source: cross.id, target: target.id, type: RelationType.Calls })],
    )
    await store.upsertFile(file('ws-a:importer-a.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-b.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-c.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer-a.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-b.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-c.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store, { minRisk: 'LOW' })
    const entry = result.entries.find((candidate) => candidate.symbol.name === 'target')

    expect(entry).toBeDefined()
    expect(entry?.score).toBe(11)
    expect(entry?.directCallers).toBe(2)
    expect(entry?.crossWorkspaceCallers).toBe(1)
    expect(entry?.fileImporters).toBe(3)
  })

  it('keeps cross-workspace evidence stronger than same-workspace evidence', async () => {
    const sameTarget = sym('sameTarget', 'ws-a:same-target.ts', 1)
    const crossTarget = sym('crossTarget', 'ws-a:cross-target.ts', 1)
    const sameCaller = sym('sameCaller', 'ws-a:caller.ts', 1)
    const crossCaller = sym('crossCaller', 'ws-b:caller.ts', 1)

    await store.upsertFile(file('ws-a:same-target.ts'), [sameTarget], [])
    await store.upsertFile(file('ws-a:cross-target.ts'), [crossTarget], [])
    await store.upsertFile(
      file('ws-a:caller.ts'),
      [sameCaller],
      [createRelation({ source: sameCaller.id, target: sameTarget.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('ws-b:caller.ts', 'ws-b'),
      [crossCaller],
      [
        createRelation({
          source: crossCaller.id,
          target: crossTarget.id,
          type: RelationType.Calls,
        }),
      ],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW' })

    expect(result.entries.map((entry) => entry.symbol.name).slice(0, 2)).toEqual([
      'crossTarget',
      'sameTarget',
    ])
  })

  it('scores CONSTRUCTS and USES_TYPE as caller evidence', async () => {
    const target = sym('TemplateExpander', 'ws-a:template.ts', 1)
    const constructorCaller = sym('create', 'ws-a:composition.ts', 1)
    const typeUser = sym('NodeHookRunner', 'ws-b:runner.ts', 1)

    await store.upsertFile(file('ws-a:template.ts'), [target], [])
    await store.upsertFile(
      file('ws-a:composition.ts'),
      [constructorCaller],
      [
        createRelation({
          source: constructorCaller.id,
          target: target.id,
          type: RelationType.Constructs,
        }),
      ],
    )
    await store.upsertFile(
      file('ws-b:runner.ts', 'ws-b'),
      [typeUser],
      [
        createRelation({
          source: typeUser.id,
          target: target.id,
          type: RelationType.UsesType,
        }),
      ],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW' })
    const entry = result.entries.find((candidate) => candidate.symbol.name === 'TemplateExpander')
    expect(entry?.directCallers).toBe(1)
    expect(entry?.crossWorkspaceCallers).toBe(1)
  })

  it('excludes importer-only symbols from the default view', async () => {
    const importerOnly = sym('importerOnly', 'ws-a:target.ts', 1)

    await store.upsertFile(file('ws-a:target.ts'), [importerOnly], [])
    await store.upsertFile(file('ws-a:importer-a.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-b.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer-a.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-b.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store)

    expect(result.entries).toHaveLength(0)
    expect(result.totalSymbols).toBe(1)
  })

  it('includes importer-only symbols only when explicitly requested', async () => {
    const importerOnly = sym('importerOnly', 'ws-a:target.ts', 1)

    await store.upsertFile(file('ws-a:target.ts'), [importerOnly], [])
    await store.upsertFile(file('ws-a:importer-a.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-b.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer-a.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-b.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store, {
      minScore: 0,
      minRisk: 'LOW',
      includeImporterOnly: true,
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.symbol.name).toBe('importerOnly')
    expect(result.entries[0]?.score).toBe(2)
  })

  it('uses class, method, and function as the default hotspot kinds', async () => {
    const fn = sym('fn', 'ws-a:targets.ts', 1, SymbolKind.Function)
    const cls = sym('Cls', 'ws-a:targets.ts', 5, SymbolKind.Class)
    const method = sym('method', 'ws-a:targets.ts', 9, SymbolKind.Method)
    const variable = sym('state', 'ws-a:targets.ts', 13, SymbolKind.Variable)
    const contract = sym('Contract', 'ws-a:targets.ts', 17, SymbolKind.Interface)
    const callers = [
      sym('callerA', 'ws-a:callers.ts', 1),
      sym('callerB', 'ws-a:callers.ts', 2),
      sym('callerC', 'ws-a:callers.ts', 3),
    ]

    await store.upsertFile(file('ws-a:targets.ts'), [fn, cls, method, variable, contract], [])
    await store.upsertFile(
      file('ws-a:callers.ts'),
      callers,
      callers.flatMap((caller) => [
        createRelation({ source: caller.id, target: fn.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: cls.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: method.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: variable.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: contract.id, type: RelationType.Calls }),
      ]),
    )

    const result = await computeHotspots(store)

    expect(DEFAULT_HOTSPOT_KINDS).toEqual(['class', 'method', 'function'])
    expect(result.entries.map((entry) => entry.symbol.kind).sort()).toEqual([
      SymbolKind.Class,
      SymbolKind.Function,
      SymbolKind.Method,
    ])
  })

  it('lets an explicit kind filter replace the default kind set', async () => {
    const contract = sym('Contract', 'ws-a:types.ts', 1, SymbolKind.Interface)
    const callers = [
      sym('callerA', 'ws-a:caller.ts', 1),
      sym('callerB', 'ws-a:caller.ts', 2),
      sym('callerC', 'ws-a:caller.ts', 3),
    ]

    await store.upsertFile(file('ws-a:types.ts'), [contract], [])
    await store.upsertFile(
      file('ws-a:caller.ts'),
      callers,
      callers.map((caller) =>
        createRelation({ source: caller.id, target: contract.id, type: RelationType.Calls }),
      ),
    )

    const result = await computeHotspots(store, { kinds: [SymbolKind.Interface] })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.symbol.kind).toBe(SymbolKind.Interface)
  })

  it('keeps default kinds and importer-only exclusion when only minRisk is overridden', async () => {
    const fn = sym('fn', 'ws-a:targets.ts', 1, SymbolKind.Function)
    const variable = sym('state', 'ws-a:targets.ts', 5, SymbolKind.Variable)
    const importerOnly = sym('importerOnly', 'ws-a:imported.ts', 1, SymbolKind.Function)
    const callers = [
      sym('callerA', 'ws-a:callers.ts', 1),
      sym('callerB', 'ws-a:callers.ts', 2),
      sym('callerC', 'ws-a:callers.ts', 3),
    ]

    await store.upsertFile(file('ws-a:targets.ts'), [fn, variable], [])
    await store.upsertFile(file('ws-a:imported.ts'), [importerOnly], [])
    await store.upsertFile(
      file('ws-a:callers.ts'),
      callers,
      callers.flatMap((caller) => [
        createRelation({ source: caller.id, target: fn.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: variable.id, type: RelationType.Calls }),
      ]),
    )
    await store.upsertFile(file('ws-a:importer-a.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-b.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer-a.ts',
        target: 'ws-a:imported.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-b.ts',
        target: 'ws-a:imported.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store, { minRisk: 'LOW' })

    expect(result.entries.map((entry) => entry.symbol.name)).toContain('fn')
    expect(result.entries.map((entry) => entry.symbol.name)).not.toContain('state')
    expect(result.entries.map((entry) => entry.symbol.name)).not.toContain('importerOnly')
  })

  it('does not re-enable importer-only symbols when only minScore is lowered', async () => {
    const importerOnly = sym('importerOnly', 'ws-a:target.ts', 1)

    await store.upsertFile(file('ws-a:target.ts'), [importerOnly], [])
    await store.upsertFile(file('ws-a:importer-a.ts'), [], [])
    await store.upsertFile(file('ws-a:importer-b.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer-a.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer-b.ts',
        target: 'ws-a:target.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store, { minScore: 0, minRisk: 'LOW' })

    expect(result.entries).toHaveLength(0)
  })

  it('filters by workspace and keeps totalSymbols over the whole graph', async () => {
    const inA = sym('inA', 'ws-a:a.ts', 1)
    const inB = sym('inB', 'ws-b:b.ts', 1)
    const callers = [
      sym('callerA', 'ws-a:callers.ts', 1),
      sym('callerB', 'ws-a:callers.ts', 2),
      sym('callerC', 'ws-a:callers.ts', 3),
    ]

    await store.upsertFile(file('ws-a:a.ts'), [inA], [])
    await store.upsertFile(file('ws-b:b.ts', 'ws-b'), [inB], [])
    await store.upsertFile(
      file('ws-a:callers.ts'),
      callers,
      callers.flatMap((caller) => [
        createRelation({ source: caller.id, target: inA.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: inB.id, type: RelationType.Calls }),
      ]),
    )

    const result = await computeHotspots(store, { workspace: 'ws-a' })

    expect(result.totalSymbols).toBe(5)
    expect(result.entries.every((entry) => entry.symbol.filePath.startsWith('ws-a:'))).toBe(true)
    expect(result.entries.some((entry) => entry.symbol.name === 'inA')).toBe(true)
  })

  it('promotes interfaces with implementors even without direct callers', async () => {
    const contract = sym('Persistable', 'ws-a:types.ts', 1, SymbolKind.Interface)
    const impl = sym('UserService', 'ws-a:user.ts', 1, SymbolKind.Class)

    await store.upsertFile(file('ws-a:types.ts'), [contract], [])
    await store.upsertFile(
      file('ws-a:user.ts'),
      [impl],
      [createRelation({ source: impl.id, target: contract.id, type: RelationType.Implements })],
    )

    const result = await computeHotspots(store, {
      minRisk: 'LOW',
      minScore: 0,
      kinds: [SymbolKind.Interface],
    })
    const entry = result.entries.find((candidate) => candidate.symbol.id === contract.id)

    expect(entry).toBeDefined()
    expect(entry!.score).toBeGreaterThan(0)
  })

  it('promotes base methods with overriders even without callers', async () => {
    const baseMethod = sym('save', 'ws-a:base.ts', 1, SymbolKind.Method)
    const childMethod = sym('save', 'ws-a:user.ts', 1, SymbolKind.Method)

    await store.upsertFile(file('ws-a:base.ts'), [baseMethod], [])
    await store.upsertFile(
      file('ws-a:user.ts'),
      [childMethod],
      [
        createRelation({
          source: childMethod.id,
          target: baseMethod.id,
          type: RelationType.Overrides,
        }),
      ],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW', minScore: 0 })
    const entry = result.entries.find((candidate) => candidate.symbol.id === baseMethod.id)

    expect(entry).toBeDefined()
    expect(entry!.score).toBeGreaterThan(0)
  })

  it('collects all hierarchy signals through one batched relation lookup', async () => {
    const baseClass = sym('Base', 'ws-a:base.ts', 1, SymbolKind.Class)
    const contract = sym('Persistable', 'ws-a:contract.ts', 1, SymbolKind.Interface)
    const parentMethod = sym('save', 'ws-a:parent.ts', 1, SymbolKind.Method)
    const extenderA = sym('ExtenderA', 'ws-a:ext-a.ts', 1, SymbolKind.Class)
    const extenderB = sym('ExtenderB', 'ws-a:ext-b.ts', 1, SymbolKind.Class)
    const implementor = sym('Store', 'ws-a:store.ts', 1, SymbolKind.Class)
    const overrider = sym('save', 'ws-a:child.ts', 1, SymbolKind.Method)

    await store.upsertFile(file('ws-a:base.ts'), [baseClass], [])
    await store.upsertFile(file('ws-a:contract.ts'), [contract], [])
    await store.upsertFile(file('ws-a:parent.ts'), [parentMethod], [])
    await store.upsertFile(
      file('ws-a:hierarchy.ts'),
      [extenderA, extenderB, implementor, overrider],
      [
        createRelation({ source: extenderA.id, target: baseClass.id, type: RelationType.Extends }),
        createRelation({ source: extenderB.id, target: baseClass.id, type: RelationType.Extends }),
        createRelation({
          source: implementor.id,
          target: contract.id,
          type: RelationType.Implements,
        }),
        createRelation({
          source: overrider.id,
          target: parentMethod.id,
          type: RelationType.Overrides,
        }),
      ],
    )

    const hierarchyCalls: Array<{
      symbolIds: readonly string[]
      relationTypes: readonly RelationType[]
    }> = []
    const originalGetIncoming = store.getIncomingSymbolRelations.bind(store)
    store.getIncomingSymbolRelations = async (symbolIds, relationTypes) => {
      hierarchyCalls.push({ symbolIds, relationTypes })
      return originalGetIncoming(symbolIds, relationTypes)
    }

    const result = await computeHotspots(store, {
      minRisk: 'LOW',
      minScore: 0,
      kinds: [SymbolKind.Class, SymbolKind.Interface, SymbolKind.Method],
    })

    expect(hierarchyCalls).toHaveLength(1)
    expect(hierarchyCalls[0]!.relationTypes).toEqual([
      RelationType.Extends,
      RelationType.Implements,
      RelationType.Overrides,
    ])
    for (const candidate of [baseClass, contract, parentMethod]) {
      expect(hierarchyCalls[0]!.symbolIds).toContain(candidate.id)
    }

    const baseEntry = result.entries.find((candidate) => candidate.symbol.id === baseClass.id)
    const contractEntry = result.entries.find((candidate) => candidate.symbol.id === contract.id)
    const methodEntry = result.entries.find((candidate) => candidate.symbol.id === parentMethod.id)
    expect(baseEntry).toBeDefined()
    expect(contractEntry).toBeDefined()
    expect(methodEntry).toBeDefined()

    const rankOf = (id: string): number =>
      result.entries.findIndex((candidate) => candidate.symbol.id === id)
    expect(rankOf(baseClass.id)).toBeLessThan(rankOf(contract.id))
    expect(rankOf(contract.id)).toBeLessThan(rankOf(parentMethod.id))
  })

  it('does not treat a drive letter as workspace C', async () => {
    const target = sym('target', 'C:/repo/src/a.ts', 1)
    const caller = sym('caller', 'C:/repo/src/b.ts', 1)
    await store.upsertFile(file('C:/repo/src/a.ts', ''), [target], [])
    await store.upsertFile(
      file('C:/repo/src/b.ts', ''),
      [caller],
      [createRelation({ source: caller.id, target: target.id, type: RelationType.Calls })],
    )

    const included = await computeHotspots(store, { workspace: 'C', minScore: 0, minRisk: 'LOW' })
    expect(included.entries).toHaveLength(0)
  })

  it('callers in test files do not count toward hotspot scores by default', async () => {
    const symA = sym('symA', 'ws-a:src/a.ts', 1)
    const symB = sym('symB', 'ws-a:src/b.ts', 1)
    const testCaller = sym('testCaller', 'ws-a:test/a.spec.ts', 1)
    const prodCaller = sym('prodCaller', 'ws-a:src/c.ts', 1)

    await store.upsertFile(file('ws-a:src/a.ts', 'ws-a', 'source'), [symA], [])
    await store.upsertFile(file('ws-a:src/b.ts', 'ws-a', 'source'), [symB], [])
    await store.upsertFile(
      file('ws-a:test/a.spec.ts', 'ws-a', 'test'),
      [testCaller],
      [createRelation({ source: testCaller.id, target: symA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('ws-a:src/c.ts', 'ws-a', 'source'),
      [prodCaller],
      [createRelation({ source: prodCaller.id, target: symB.id, type: RelationType.Calls })],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW', minScore: 1 })
    const entryA = result.entries.find((e) => e.symbol.id === symA.id)
    const entryB = result.entries.find((e) => e.symbol.id === symB.id)

    expect(entryA).toBeUndefined()
    expect(entryB).toBeDefined()
    expect(entryB?.directCallers).toBe(1)
  })

  it('counts test callers when includeTests is true', async () => {
    const symA = sym('symA', 'ws-a:src/a.ts', 1)
    const testCaller = sym('testCaller', 'ws-a:test/a.spec.ts', 1)

    await store.upsertFile(file('ws-a:src/a.ts', 'ws-a', 'source'), [symA], [])
    await store.upsertFile(
      file('ws-a:test/a.spec.ts', 'ws-a', 'test'),
      [testCaller],
      [createRelation({ source: testCaller.id, target: symA.id, type: RelationType.Calls })],
    )

    const result = await computeHotspots(store, { includeTests: true, minRisk: 'LOW', minScore: 1 })
    const entryA = result.entries.find((e) => e.symbol.id === symA.id)

    expect(entryA).toBeDefined()
    expect(entryA?.directCallers).toBe(1)
  })

  it('excludes candidate symbols defined in test files by default', async () => {
    const testHelper = sym('testHelper', 'ws-a:test/helper.ts', 1)
    const testCaller = sym('testCaller', 'ws-a:test/caller.spec.ts', 1)

    await store.upsertFile(file('ws-a:test/helper.ts', 'ws-a', 'test'), [testHelper], [])
    await store.upsertFile(
      file('ws-a:test/caller.spec.ts', 'ws-a', 'test'),
      [testCaller],
      [createRelation({ source: testCaller.id, target: testHelper.id, type: RelationType.Calls })],
    )

    const defaultResult = await computeHotspots(store, { minRisk: 'LOW', minScore: 1 })
    expect(defaultResult.entries.find((e) => e.symbol.id === testHelper.id)).toBeUndefined()

    const withTestsResult = await computeHotspots(store, {
      includeTests: true,
      minRisk: 'LOW',
      minScore: 1,
    })
    expect(withTestsResult.entries.find((e) => e.symbol.id === testHelper.id)).toBeDefined()
  })

  it('tracks omitted test and ignored files in HotspotResult', async () => {
    await store.upsertFile(file('ws-a:src/a.ts', 'ws-a', 'source'), [], [])
    await store.upsertFile(file('ws-a:test/a.spec.ts', 'ws-a', 'test'), [], [])
    await store.upsertFile(file('ws-a:test/b.spec.ts', 'ws-a', 'test'), [], [])
    await store.upsertFile(file('ws-a:generated/c.ts', 'ws-a', 'ignored'), [], [])

    const defaultResult = await computeHotspots(store)
    expect(defaultResult.omittedCounts).toEqual({ tests: 2, ignored: 1 })

    const withTestsResult = await computeHotspots(store, { includeTests: true })
    expect(withTestsResult.omittedCounts).toEqual({ tests: 0, ignored: 1 })

    const withAll = await computeHotspots(store, { includeTests: true, includeIgnored: true })
    expect(withAll.omittedCounts).toEqual({ tests: 0, ignored: 0 })
  })
})
