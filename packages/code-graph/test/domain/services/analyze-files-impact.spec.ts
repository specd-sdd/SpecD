import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { analyzeFilesImpact } from '../../../src/domain/services/analyze-files-impact.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

function sym(name: string, filePath: string, line: number) {
  return createSymbolNode({ name, kind: SymbolKind.Function, filePath, line, column: 0 })
}

function file(path: string) {
  return createFileNode({
    path,
    configRelativePath: '',
    language: 'typescript',
    contentHash: 'sha256:x',
    workspace: '/p',
  })
}

describe('analyzeFilesImpact service', () => {
  let store: InMemoryGraphStore

  beforeEach(async () => {
    store = new InMemoryGraphStore()
    await store.open()
  })

  afterEach(async () => {
    await store.close()
  })

  it('aggregates risk level, affected files, and dependents counts for multiple files', async () => {
    // Set up file A: high risk (6 direct downstream dependents)
    const targetA = sym('targetA', 'a.ts', 1)
    const callerA1 = sym('callerA1', 'c.ts', 1)
    const callerA2 = sym('callerA2', 'd.ts', 1)
    const callerA3 = sym('callerA3', 'e.ts', 1)
    const callerA4 = sym('callerA4', 'g.ts', 1)
    const callerA5 = sym('callerA5', 'h.ts', 1)
    const callerA6 = sym('callerA6', 'i.ts', 1)

    // Set up file B: medium risk (1 direct downstream dependent)
    const targetB = sym('targetB', 'b.ts', 1)
    const callerB = sym('callerB', 'f.ts', 1)

    await store.upsertFile(file('a.ts'), [targetA], [])
    await store.upsertFile(file('b.ts'), [targetB], [])

    // Add relations:
    // targetA called by callerA1 to callerA6 -> HIGH risk (>= 6 direct)
    await store.upsertFile(
      file('c.ts'),
      [callerA1],
      [createRelation({ source: callerA1.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('d.ts'),
      [callerA2],
      [createRelation({ source: callerA2.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('e.ts'),
      [callerA3],
      [createRelation({ source: callerA3.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('g.ts'),
      [callerA4],
      [createRelation({ source: callerA4.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('h.ts'),
      [callerA5],
      [createRelation({ source: callerA5.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('i.ts'),
      [callerA6],
      [createRelation({ source: callerA6.id, target: targetA.id, type: RelationType.Calls })],
    )

    // targetB called by callerB -> LOW/MEDIUM risk
    await store.upsertFile(
      file('f.ts'),
      [callerB],
      [createRelation({ source: callerB.id, target: targetB.id, type: RelationType.Calls })],
    )

    const result = await analyzeFilesImpact(store, ['a.ts', 'b.ts'], 'upstream')

    expect(result.riskLevel).toBe('HIGH')
    expect(result.directDependents).toBe(7)
    expect(result.affectedFiles).toContain('c.ts')
    expect(result.affectedFiles).toContain('d.ts')
    expect(result.affectedFiles).toContain('e.ts')
    expect(result.affectedFiles).toContain('g.ts')
    expect(result.affectedFiles).toContain('h.ts')
    expect(result.affectedFiles).toContain('i.ts')
    expect(result.affectedFiles).toContain('f.ts')
    expect(result.symbols).toHaveLength(2) // results breakdown for both target files
  })
})
