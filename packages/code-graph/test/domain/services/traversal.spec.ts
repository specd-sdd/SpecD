import { describe, it, expect, beforeEach } from 'vitest'
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
