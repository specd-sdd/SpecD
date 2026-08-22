import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { analyzeFilesImpact } from '../../../src/domain/services/analyze-files-impact.js'
import {
  analyzeImpact,
  analyzePublicBindingImpact,
} from '../../../src/domain/services/analyze-impact.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import {
  createLogicalSymbol,
  createPublicBinding,
  SymbolSpace,
  type SymbolResolutionResult,
} from '../../../src/domain/value-objects/symbol-reference.js'

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

  it('traverses every declaration once under one resolved logical target', async () => {
    const first = sym('target', 'a.ts', 1)
    const second = sym('target', 'a.ts', 2)
    const caller = sym('caller', 'b.ts', 1)
    await store.upsertFile(file('a.ts'), [first, second], [])
    await store.upsertFile(
      file('b.ts'),
      [caller],
      [
        createRelation({ source: caller.id, target: first.id, type: RelationType.Calls }),
        createRelation({ source: caller.id, target: second.id, type: RelationType.Calls }),
      ],
    )
    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'a.ts',
      name: 'target',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    const declarations = [first, second].map((symbol) => ({
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
    }))
    const resolution: SymbolResolutionResult = {
      request: { workspace: 'code-graph', requested: 'target' },
      status: 'resolved',
      reasonCode: null,
      health: { fresh: true, complete: true, reasonCodes: [] },
      target: logical,
      candidates: [{ target: logical, declarations, path: [] }],
      path: [],
    }

    const result = await analyzeImpact(store, first.id, 'upstream', 3, resolution)

    expect(result.target).toBe(logical.id)
    expect(result.directDependents).toBe(1)
    expect(result.affectedSymbols.map((symbol) => symbol.id)).toEqual([caller.id])
  })

  it('keeps exact public-binding and canonical impact separate', async () => {
    const target = sym('target', 'a.ts', 1)
    const routeConsumer = sym('routeConsumer', 'route.ts', 1)
    const directConsumer = sym('directConsumer', 'direct.ts', 1)
    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'a.ts',
      name: 'target',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    const binding = createPublicBinding({
      surface: 'public.ts',
      exportedName: 'alias',
      space: SymbolSpace.Value,
      targetId: logical.id,
    })
    await store.upsertFile(file('a.ts'), [target], [])
    await store.upsertFile(
      file('route.ts'),
      [routeConsumer],
      [createRelation({ source: routeConsumer.id, target: binding.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      file('direct.ts'),
      [directConsumer],
      [createRelation({ source: directConsumer.id, target: target.id, type: RelationType.Calls })],
    )

    const result = await analyzePublicBindingImpact(
      store,
      {
        binding,
        target: logical,
        declarations: [
          {
            logicalId: logical.id,
            symbolId: target.id,
            location: {
              filePath: target.filePath,
              line: target.line,
              column: target.column,
              endLine: undefined,
              endColumn: undefined,
            },
            kind: target.kind,
          },
        ],
        path: [{ fromId: binding.id, toId: logical.id, kind: 'reexport' }],
      },
      'upstream',
    )

    expect(result.bindingImpact.affectedSymbols.map((symbol) => symbol.id)).toEqual([
      routeConsumer.id,
    ])
    expect(result.canonicalImpact.affectedSymbols.map((symbol) => symbol.id)).toEqual([
      directConsumer.id,
    ])
  })

  it('returns covering specs for inputs and impacted resources using two batch reads', async () => {
    const target = sym('target', 'a.ts', 1)
    const caller = sym('caller', 'b.ts', 1)
    await store.upsertFile(file('a.ts'), [target], [])
    await store.upsertFile(
      file('b.ts'),
      [caller],
      [
        createRelation({ source: 'b.ts', target: 'a.ts', type: RelationType.Imports }),
        createRelation({ source: caller.id, target: target.id, type: RelationType.Calls }),
      ],
    )
    const spec = (specId: string) =>
      createSpecNode({
        specId,
        path: `specs/${specId}`,
        title: specId,
        description: '',
        content: '',
        contentHash: `hash:${specId}`,
        workspace: 'default',
      })
    await store.upsertSpec(spec('spec:input-file'), [
      createRelation({ source: 'spec:input-file', target: 'a.ts', type: RelationType.CoversFile }),
    ])
    await store.upsertSpec(spec('spec:input-symbol'), [
      createRelation({
        source: 'spec:input-symbol',
        target: target.id,
        type: RelationType.CoversSymbol,
      }),
    ])
    await store.upsertSpec(spec('spec:impacted'), [
      createRelation({ source: 'spec:impacted', target: 'b.ts', type: RelationType.CoversFile }),
      createRelation({
        source: 'spec:impacted',
        target: caller.id,
        type: RelationType.CoversSymbol,
      }),
    ])
    const fileCoverage = vi.spyOn(store, 'getCoveringSpecsForFiles')
    const symbolCoverage = vi.spyOn(store, 'getCoveringSpecsForSymbols')

    const result = await analyzeFilesImpact(store, ['a.ts'], 'upstream')

    expect(fileCoverage).toHaveBeenCalledTimes(1)
    expect(symbolCoverage).toHaveBeenCalledTimes(1)
    expect(result.coveringSpecs).toEqual([
      {
        specId: 'spec:input-file',
        minDepth: 0,
        evidence: [{ kind: 'file', target: 'a.ts', depth: 0 }],
      },
      {
        specId: 'spec:input-symbol',
        minDepth: 0,
        evidence: [{ kind: 'symbol', target: target.id, depth: 0 }],
      },
      {
        specId: 'spec:impacted',
        minDepth: 1,
        evidence: [
          { kind: 'file', target: 'b.ts', depth: 1 },
          { kind: 'symbol', target: caller.id, depth: 1 },
        ],
      },
    ])
  })

  it('deduplicates file-only coverage across multiple input files in constant batch reads', async () => {
    await store.upsertFile(file('a.ts'), [], [])
    await store.upsertFile(
      file('b.ts'),
      [],
      [createRelation({ source: 'b.ts', target: 'a.ts', type: RelationType.Imports })],
    )
    await store.upsertFile(file('c.ts'), [], [])
    await store.upsertSpec(
      createSpecNode({
        specId: 'spec:files',
        path: 'specs/files',
        title: 'Files',
        contentHash: 'hash:files',
        workspace: 'default',
      }),
      ['a.ts', 'b.ts', 'c.ts'].map((target) =>
        createRelation({ source: 'spec:files', target, type: RelationType.CoversFile }),
      ),
    )
    const fileCoverage = vi.spyOn(store, 'getCoveringSpecsForFiles')
    const symbolCoverage = vi.spyOn(store, 'getCoveringSpecsForSymbols')

    const result = await analyzeFilesImpact(store, ['a.ts', 'c.ts', 'a.ts'], 'upstream')

    expect(fileCoverage).toHaveBeenCalledTimes(1)
    expect(symbolCoverage).toHaveBeenCalledTimes(1)
    expect(result.coveringSpecs).toEqual([
      {
        specId: 'spec:files',
        minDepth: 0,
        evidence: [
          { kind: 'file', target: 'a.ts', depth: 0 },
          { kind: 'file', target: 'c.ts', depth: 0 },
          { kind: 'file', target: 'b.ts', depth: 1 },
        ],
      },
    ])
  })

  it('shares a maximum concurrency of four across multi-file impact work', async () => {
    const filePaths = Array.from({ length: 12 }, (_, index) => `input-${String(index)}.ts`)
    for (const filePath of filePaths) await store.upsertFile(file(filePath), [], [])

    const originalFindSymbols = store.findSymbols.bind(store)
    let active = 0
    let maximumActive = 0
    vi.spyOn(store, 'findSymbols').mockImplementation(async (query) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      try {
        return await originalFindSymbols(query)
      } finally {
        active -= 1
      }
    })

    const result = await analyzeFilesImpact(store, filePaths, 'upstream')

    expect(result.symbols).toHaveLength(filePaths.length)
    expect(maximumActive).toBe(4)
  })
})
