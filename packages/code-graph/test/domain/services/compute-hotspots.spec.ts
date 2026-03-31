import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { computeHotspots } from '../../../src/domain/services/compute-hotspots.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

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

  it('ranks symbols by score descending', async () => {
    const a = sym('a', 'ws-a:a.ts', 1)
    const b = sym('b', 'ws-a:b.ts', 1)
    const c1 = sym('c1', 'ws-a:c.ts', 1)
    const c2 = sym('c2', 'ws-a:c.ts', 2)
    const c3 = sym('c3', 'ws-a:c.ts', 3)

    await store.upsertFile(file('ws-a:a.ts'), [a], [])
    await store.upsertFile(file('ws-a:b.ts'), [b], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [c1, c2, c3],
      [
        // a has 3 same-ws callers → score = 9
        createRelation({ source: c1.id, target: a.id, type: RelationType.Calls }),
        createRelation({ source: c2.id, target: a.id, type: RelationType.Calls }),
        createRelation({ source: c3.id, target: a.id, type: RelationType.Calls }),
        // b has 1 same-ws caller → score = 3
        createRelation({ source: c1.id, target: b.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW' })
    expect(result.entries.length).toBeGreaterThanOrEqual(2)
    expect(result.entries[0]!.symbol.name).toBe('a')
    expect(result.entries[0]!.score).toBe(9)
    expect(result.entries[1]!.symbol.name).toBe('b')
    expect(result.entries[1]!.score).toBe(3)
  })

  it('excludes zero-score symbols by default', async () => {
    const lonely = sym('lonely', 'ws-a:lonely.ts', 1)
    await store.upsertFile(file('ws-a:lonely.ts'), [lonely], [])

    const result = await computeHotspots(store)
    expect(result.entries).toHaveLength(0)
    expect(result.totalSymbols).toBe(1)
  })

  it('includes zero-score symbols with minScore 0', async () => {
    const lonely = sym('lonely', 'ws-a:lonely.ts', 1)
    await store.upsertFile(file('ws-a:lonely.ts'), [lonely], [])

    const result = await computeHotspots(store, { minScore: 0, minRisk: 'LOW' })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.score).toBe(0)
  })

  it('filters by minRisk MEDIUM by default', async () => {
    // 1 caller → score = 3, risk = LOW (1 direct, 1 total → LOW)
    const target = sym('target', 'ws-a:t.ts', 1)
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:t.ts'), [target], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      [createRelation({ source: caller.id, target: target.id, type: RelationType.Calls })],
    )

    // Default: minRisk MEDIUM should exclude LOW-risk symbols
    const defaultResult = await computeHotspots(store)
    expect(defaultResult.entries).toHaveLength(0)

    // Explicit LOW should include the target (any filter drops all defaults)
    const lowResult = await computeHotspots(store, { minRisk: 'LOW' })
    expect(lowResult.entries.some((e) => e.symbol.name === 'target')).toBe(true)
  })

  it('scores cross-workspace callers higher', async () => {
    const target = sym('target', 'ws-a:t.ts', 1)
    const sameWsCaller = sym('sameWs', 'ws-a:c.ts', 1)
    const crossWsCaller = sym('crossWs', 'ws-b:c.ts', 1)

    await store.upsertFile(file('ws-a:t.ts'), [target], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [sameWsCaller],
      [createRelation({ source: sameWsCaller.id, target: target.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('ws-b:c.ts', 'ws-b'),
      [crossWsCaller],
      [createRelation({ source: crossWsCaller.id, target: target.id, type: RelationType.Calls })],
    )

    const result = await computeHotspots(store, { minRisk: 'LOW' })
    const entry = result.entries.find((e) => e.symbol.name === 'target')!
    expect(entry).toBeDefined()
    // score = (1 * 3) + (1 * 5) + 0 = 8
    expect(entry.score).toBe(8)
    expect(entry.directCallers).toBe(1)
    expect(entry.crossWorkspaceCallers).toBe(1)
  })

  it('includes file importers in score', async () => {
    const target = sym('target', 'ws-a:t.ts', 1)

    await store.upsertFile(file('ws-a:t.ts'), [target], [])
    await store.upsertFile(file('ws-a:importer1.ts'), [], [])
    await store.upsertFile(file('ws-a:importer2.ts'), [], [])
    await store.addRelations([
      createRelation({
        source: 'ws-a:importer1.ts',
        target: 'ws-a:t.ts',
        type: RelationType.Imports,
      }),
      createRelation({
        source: 'ws-a:importer2.ts',
        target: 'ws-a:t.ts',
        type: RelationType.Imports,
      }),
    ])

    const result = await computeHotspots(store, { minRisk: 'LOW' })
    const entry = result.entries.find((e) => e.symbol.name === 'target')!
    expect(entry).toBeDefined()
    // No callers, 2 importers → score = 2
    expect(entry.score).toBe(2)
    expect(entry.fileImporters).toBe(2)
  })

  it('filters by workspace', async () => {
    const a = sym('inA', 'ws-a:a.ts', 1)
    const b = sym('inB', 'ws-b:b.ts', 1)
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:a.ts'), [a], [])
    await store.upsertFile(file('ws-b:b.ts', 'ws-b'), [b], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: a.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: b.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, { workspace: 'ws-a', minRisk: 'LOW' })
    expect(result.entries.every((e) => e.symbol.filePath.startsWith('ws-a:'))).toBe(true)
  })

  it('filters by kind', async () => {
    const fn = sym('myFn', 'ws-a:a.ts', 1, SymbolKind.Function)
    const cls = sym('MyClass', 'ws-a:a.ts', 5, SymbolKind.Class)
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:a.ts'), [fn, cls], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: fn.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: cls.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, { kinds: [SymbolKind.Class], minRisk: 'LOW' })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.symbol.kind).toBe('class')
  })

  it('filters by multiple kinds', async () => {
    const fn = sym('myFn', 'ws-a:a.ts', 1, SymbolKind.Function)
    const cls = sym('MyClass', 'ws-a:a.ts', 5, SymbolKind.Class)
    const variable = sym('state', 'ws-a:a.ts', 9, SymbolKind.Variable)
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:a.ts'), [fn, cls, variable], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: fn.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: cls.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: variable.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, {
      kinds: [SymbolKind.Class, SymbolKind.Function],
      minRisk: 'LOW',
    })
    expect(result).toHaveProperty('entries')
    expect(result.entries.every((entry) => entry.symbol.kind !== SymbolKind.Variable)).toBe(true)
    expect(result.entries.map((entry) => entry.symbol.kind)).toEqual([
      'function',
      'class',
      'function',
    ])
  })

  it('respects limit', async () => {
    const symbols = Array.from({ length: 10 }, (_, i) => sym(`s${i}`, 'ws-a:a.ts', i + 1))
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:a.ts'), symbols, [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      symbols.map((s) =>
        createRelation({ source: caller.id, target: s.id, type: RelationType.Calls }),
      ),
    )

    const result = await computeHotspots(store, { limit: 3, minRisk: 'LOW' })
    expect(result.entries).toHaveLength(3)
  })

  it('excludes symbols by workspace', async () => {
    const a = sym('inA', 'ws-a:a.ts', 1)
    const b = sym('inB', 'ws-b:b.ts', 1)
    const caller = sym('caller', 'ws-a:c.ts', 1)

    await store.upsertFile(file('ws-a:a.ts'), [a], [])
    await store.upsertFile(file('ws-b:b.ts', 'ws-b'), [b], [])
    await store.upsertFile(
      file('ws-a:c.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: a.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: b.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, { excludeWorkspaces: ['ws-b'], minRisk: 'LOW' })
    expect(result.entries.every((e) => !e.symbol.filePath.startsWith('ws-b:'))).toBe(true)
  })

  it('excludes symbols by path pattern', async () => {
    const src = sym('srcFn', 'ws-a:src/main.ts', 1)
    const test = sym('testFn', 'ws-a:test/main.spec.ts', 1)
    const caller = sym('caller', 'ws-a:src/caller.ts', 1)

    await store.upsertFile(file('ws-a:src/main.ts'), [src], [])
    await store.upsertFile(file('ws-a:test/main.spec.ts'), [test], [])
    await store.upsertFile(
      file('ws-a:src/caller.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: src.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: test.id, type: RelationType.Calls }),
      ],
    )

    const result = await computeHotspots(store, { excludePaths: ['*:test/*'], minRisk: 'LOW' })
    expect(result.entries.every((e) => !e.symbol.filePath.includes(':test/'))).toBe(true)
    expect(result.entries.some((e) => e.symbol.name === 'srcFn')).toBe(true)
  })

  it('totalSymbols reflects the full graph regardless of filters', async () => {
    const symbols = Array.from({ length: 5 }, (_, i) => sym(`s${i}`, 'ws-a:a.ts', i + 1))
    await store.upsertFile(file('ws-a:a.ts'), symbols, [])

    const result = await computeHotspots(store, { minScore: 0, minRisk: 'LOW', limit: 2 })
    expect(result.totalSymbols).toBe(5)
    expect(result.entries).toHaveLength(2)
  })
})
