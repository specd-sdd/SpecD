import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { getUpstream } from '../../../src/domain/services/get-upstream.js'
import { getDownstream } from '../../../src/domain/services/get-downstream.js'
import { analyzeImpact } from '../../../src/domain/services/analyze-impact.js'
import { analyzeFileImpact } from '../../../src/domain/services/analyze-file-impact.js'
import { detectChanges } from '../../../src/domain/services/detect-changes.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

function sym(name: string, filePath: string, line: number) {
  return createSymbolNode({ name, kind: SymbolKind.Function, filePath, line, column: 0 })
}

function file(path: string) {
  return createFileNode({ path, language: 'typescript', contentHash: 'sha256:x', workspace: '/p' })
}

describe('Traversal services', () => {
  let store: InMemoryGraphStore

  beforeEach(async () => {
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
  })

  describe('getUpstream', () => {
    it('returns empty for no callers', async () => {
      const s = sym('target', 'a.ts', 1)
      await store.upsertFile(
        file('a.ts'),
        [s],
        [createRelation({ source: 'a.ts', target: s.id, type: RelationType.Defines })],
      )

      const result = await getUpstream(store, s.id)
      expect(result.totalCount).toBe(0)
      expect(result.truncated).toBe(false)
    })

    it('returns direct callers at depth 1', async () => {
      const target = sym('target', 'a.ts', 1)
      const caller = sym('caller', 'b.ts', 1)

      await store.upsertFile(file('a.ts'), [target], [])
      await store.upsertFile(
        file('b.ts'),
        [caller],
        [createRelation({ source: caller.id, target: target.id, type: RelationType.Calls })],
      )

      const result = await getUpstream(store, target.id)
      expect(result.totalCount).toBe(1)
      expect(result.levels.get(1)).toHaveLength(1)
      expect(result.levels.get(1)![0]!.name).toBe('caller')
    })

    it('groups callers by depth', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
        ],
      )

      const result = await getUpstream(store, a.id)
      expect(result.levels.get(1)).toHaveLength(1)
      expect(result.levels.get(2)).toHaveLength(1)
      expect(result.totalCount).toBe(2)
    })

    it('breaks cycles', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)

      await store.upsertFile(
        file('x.ts'),
        [a, b],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: a.id, target: b.id, type: RelationType.Calls }),
        ],
      )

      const result = await getUpstream(store, a.id)
      expect(result.totalCount).toBe(1)
    })

    it('respects maxDepth', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
        ],
      )

      const result = await getUpstream(store, a.id, { maxDepth: 1 })
      expect(result.totalCount).toBe(1)
      expect(result.truncated).toBe(true)
    })

    it('includes extenders, implementors, and overriders as upstream dependents', async () => {
      const baseClass = createSymbolNode({
        name: 'BaseService',
        kind: SymbolKind.Class,
        filePath: 'types.ts',
        line: 1,
        column: 0,
      })
      const contract = createSymbolNode({
        name: 'Persistable',
        kind: SymbolKind.Interface,
        filePath: 'types.ts',
        line: 5,
        column: 0,
      })
      const baseMethod = createSymbolNode({
        name: 'save',
        kind: SymbolKind.Method,
        filePath: 'types.ts',
        line: 2,
        column: 2,
      })
      const childClass = createSymbolNode({
        name: 'UserService',
        kind: SymbolKind.Class,
        filePath: 'user.ts',
        line: 1,
        column: 0,
      })
      const childMethod = createSymbolNode({
        name: 'save',
        kind: SymbolKind.Method,
        filePath: 'user.ts',
        line: 2,
        column: 2,
      })

      await store.upsertFile(
        file('types.ts'),
        [baseClass, contract, baseMethod],
        [createRelation({ source: 'types.ts', target: baseClass.id, type: RelationType.Defines })],
      )
      await store.upsertFile(
        file('user.ts'),
        [childClass, childMethod],
        [
          createRelation({
            source: childClass.id,
            target: baseClass.id,
            type: RelationType.Extends,
          }),
          createRelation({
            source: childClass.id,
            target: contract.id,
            type: RelationType.Implements,
          }),
          createRelation({
            source: childMethod.id,
            target: baseMethod.id,
            type: RelationType.Overrides,
          }),
        ],
      )

      const classUpstream = await getUpstream(store, baseClass.id)
      const interfaceUpstream = await getUpstream(store, contract.id)
      const methodUpstream = await getUpstream(store, baseMethod.id)

      expect(classUpstream.levels.get(1)?.map((symbol) => symbol.name)).toContain('UserService')
      expect(interfaceUpstream.levels.get(1)?.map((symbol) => symbol.name)).toContain('UserService')
      expect(methodUpstream.levels.get(1)?.map((symbol) => symbol.name)).toContain('save')
    })
  })

  describe('getDownstream', () => {
    it('returns callees at depth 1', async () => {
      const caller = sym('caller', 'a.ts', 1)
      const callee = sym('callee', 'b.ts', 1)

      await store.upsertFile(file('a.ts'), [caller], [])
      await store.upsertFile(
        file('b.ts'),
        [callee],
        [createRelation({ source: caller.id, target: callee.id, type: RelationType.Calls })],
      )

      const result = await getDownstream(store, caller.id)
      expect(result.totalCount).toBe(1)
    })

    it('includes hierarchy targets as downstream dependencies', async () => {
      const childClass = createSymbolNode({
        name: 'UserService',
        kind: SymbolKind.Class,
        filePath: 'user.ts',
        line: 1,
        column: 0,
      })
      const baseClass = createSymbolNode({
        name: 'BaseService',
        kind: SymbolKind.Class,
        filePath: 'types.ts',
        line: 1,
        column: 0,
      })

      await store.upsertFile(
        file('types.ts'),
        [baseClass],
        [createRelation({ source: 'types.ts', target: baseClass.id, type: RelationType.Defines })],
      )
      await store.upsertFile(
        file('user.ts'),
        [childClass],
        [
          createRelation({
            source: childClass.id,
            target: baseClass.id,
            type: RelationType.Extends,
          }),
        ],
      )

      const result = await getDownstream(store, childClass.id)
      expect(result.levels.get(1)?.map((symbol) => symbol.name)).toContain('BaseService')
    })
  })

  describe('analyzeImpact', () => {
    it('computes risk level from dependents', async () => {
      const target = sym('target', 'a.ts', 1)
      const callers = Array.from({ length: 7 }, (_, i) => sym(`c${i}`, 'b.ts', i + 1))

      await store.upsertFile(file('a.ts'), [target], [])
      await store.upsertFile(
        file('b.ts'),
        callers,
        callers.map((c) =>
          createRelation({ source: c.id, target: target.id, type: RelationType.Calls }),
        ),
      )

      const result = await analyzeImpact(store, target.id, 'upstream')
      expect(result.directDependents).toBe(7)
      expect(result.riskLevel).toBe('HIGH')
    })

    it('populates depth on affectedSymbols', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)
      const d = sym('d', 'x.ts', 4)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c, d],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
          createRelation({ source: d.id, target: c.id, type: RelationType.Calls }),
        ],
      )

      const result = await analyzeImpact(store, a.id, 'upstream')
      const byName = new Map(result.affectedSymbols.map((s) => [s.name, s]))
      expect(byName.get('b')!.depth).toBe(1)
      expect(byName.get('c')!.depth).toBe(2)
      expect(byName.get('d')!.depth).toBe(3)
    })

    it('respects custom maxDepth', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)
      const d = sym('d', 'x.ts', 4)
      const e = sym('e', 'x.ts', 5)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c, d, e],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
          createRelation({ source: d.id, target: c.id, type: RelationType.Calls }),
          createRelation({ source: e.id, target: d.id, type: RelationType.Calls }),
        ],
      )

      const result = await analyzeImpact(store, a.id, 'upstream', 5)
      expect(result.affectedSymbols).toHaveLength(4)
      expect(result.affectedSymbols.some((s) => s.name === 'e')).toBe(true)
    })

    it('defaults maxDepth to 3', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)
      const d = sym('d', 'x.ts', 4)
      const e = sym('e', 'x.ts', 5)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c, d, e],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
          createRelation({ source: d.id, target: c.id, type: RelationType.Calls }),
          createRelation({ source: e.id, target: d.id, type: RelationType.Calls }),
        ],
      )

      const result = await analyzeImpact(store, a.id, 'upstream')
      expect(result.affectedSymbols).toHaveLength(3)
      expect(result.affectedSymbols.some((s) => s.name === 'e')).toBe(false)
    })

    it('maxDepth 1 returns only direct dependents', async () => {
      const a = sym('a', 'x.ts', 1)
      const b = sym('b', 'x.ts', 2)
      const c = sym('c', 'x.ts', 3)

      await store.upsertFile(
        file('x.ts'),
        [a, b, c],
        [
          createRelation({ source: b.id, target: a.id, type: RelationType.Calls }),
          createRelation({ source: c.id, target: b.id, type: RelationType.Calls }),
        ],
      )

      const result = await analyzeImpact(store, a.id, 'upstream', 1)
      expect(result.affectedSymbols).toHaveLength(1)
      expect(result.affectedSymbols[0]!.depth).toBe(1)
      expect(result.indirectDependents).toBe(0)
      expect(result.transitiveDependents).toBe(0)
    })

    it('treats hierarchy dependents as direct impact', async () => {
      const baseClass = createSymbolNode({
        name: 'BaseService',
        kind: SymbolKind.Class,
        filePath: 'base.ts',
        line: 1,
        column: 0,
      })
      const childClass = createSymbolNode({
        name: 'UserService',
        kind: SymbolKind.Class,
        filePath: 'user.ts',
        line: 1,
        column: 0,
      })

      await store.upsertFile(file('base.ts'), [baseClass], [])
      await store.upsertFile(
        file('user.ts'),
        [childClass],
        [
          createRelation({
            source: childClass.id,
            target: baseClass.id,
            type: RelationType.Extends,
          }),
        ],
      )

      const result = await analyzeImpact(store, baseClass.id, 'upstream')
      expect(result.directDependents).toBe(1)
      expect(result.affectedFiles).toContain('user.ts')
      expect(result.affectedSymbols.map((symbol) => symbol.name)).toContain('UserService')
    })

    it('resolves imported-file symbols deterministically from the connected call subgraph', async () => {
      const target = sym('target', 'core.ts', 1)
      const facade = sym('facade', 'consumer.ts', 1)
      const helper = sym('helper', 'consumer.ts', 2)
      const helperTwo = sym('helperTwo', 'consumer.ts', 3)

      await store.upsertFile(file('core.ts'), [target], [])
      await store.upsertFile(
        file('consumer.ts'),
        [facade, helper, helperTwo],
        [
          createRelation({
            source: 'consumer.ts',
            target: 'core.ts',
            type: RelationType.Imports,
          }),
          createRelation({ source: facade.id, target: target.id, type: RelationType.Calls }),
          createRelation({ source: helper.id, target: facade.id, type: RelationType.Calls }),
          createRelation({ source: helperTwo.id, target: helper.id, type: RelationType.Calls }),
        ],
      )

      const result = await analyzeImpact(store, target.id, 'upstream')
      const affectedNames = result.affectedSymbols.map((symbol) => symbol.name).sort()

      expect(affectedNames).toEqual(['facade', 'helper', 'helperTwo'])
      expect(result.affectedFiles).toContain('consumer.ts')
      expect(result.directDependents).toBe(1)
    })
  })

  describe('analyzeFileImpact', () => {
    it('merges impact across all symbols in a file', async () => {
      const s1 = sym('fn1', 'a.ts', 1)
      const s2 = sym('fn2', 'a.ts', 5)
      const caller = sym('caller', 'b.ts', 1)

      await store.upsertFile(file('a.ts'), [s1, s2], [])
      await store.upsertFile(
        file('b.ts'),
        [caller],
        [createRelation({ source: caller.id, target: s1.id, type: RelationType.Calls })],
      )

      const result = await analyzeFileImpact(store, 'a.ts', 'upstream')
      expect(result.symbols).toHaveLength(2)
      expect(result.affectedFiles).toContain('b.ts')
    })
  })

  describe('detectChanges', () => {
    it('detects affected symbols from changed files', async () => {
      const target = sym('target', 'a.ts', 1)
      const caller = sym('caller', 'b.ts', 1)

      await store.upsertFile(file('a.ts'), [target], [])
      await store.upsertFile(
        file('b.ts'),
        [caller],
        [createRelation({ source: caller.id, target: target.id, type: RelationType.Calls })],
      )

      const result = await detectChanges(store, ['a.ts'])
      expect(result.changedSymbols).toHaveLength(1)
      expect(result.summary).toContain('1 symbol(s) changed')
    })

    it('returns summary for files with no symbols', async () => {
      const result = await detectChanges(store, ['nonexistent.ts'])
      expect(result.riskLevel).toBe('LOW')
      expect(result.summary).toContain('No symbols found')
    })
  })
})
