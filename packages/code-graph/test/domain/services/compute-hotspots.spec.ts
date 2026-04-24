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

function file(path: string, workspace = 'ws-a') {
  return createFileNode({ path, language: 'typescript', contentHash: 'sha256:x', workspace })
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

    expect(DEFAULT_HOTSPOT_KINDS).toEqual(['class', 'interface', 'method', 'function'])
    expect(result.entries.map((entry) => entry.symbol.kind).sort()).toEqual([
      SymbolKind.Class,
      SymbolKind.Function,
      SymbolKind.Interface,
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

    const result = await computeHotspots(store, { minRisk: 'LOW', minScore: 0 })
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
})
