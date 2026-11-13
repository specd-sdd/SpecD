import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { analyzeFilesImpact } from '../../../src/domain/services/analyze-files-impact.js'
import {
  analyzeImpact,
  analyzePublicBindingImpact,
  analyzeResolvedSymbolImpact,
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
    projectRelativePath: '',
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

    const specsOnly = await analyzeFilesImpact(store, ['a.ts', 'b.ts'], 'upstream', 3, undefined, {
      types: ['specs'],
    })
    expect(specsOnly.affectedFiles).toEqual([])
    expect(specsOnly.affectedSymbols).toEqual([])
    expect(specsOnly.symbols).toHaveLength(2)
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
      memberSemantics: undefined,
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
      resolvedTarget: {
        kind: 'logical-target',
        logicalSymbol: logical,
        declarations,
        path: [],
      },
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
      memberSemantics: undefined,
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

    // The exact-route view is seeded from the route's declarations and its binding id, so it
    // reports consumers of the route and the target's physical dependents.
    expect(result.bindingImpact.affectedSymbols.map((symbol) => symbol.id).sort()).toEqual(
      [routeConsumer.id, directConsumer.id].sort(),
    )
    expect(result.bindingImpact.target).toBe(binding.id)
    expect(result.canonicalImpact.affectedSymbols.map((symbol) => symbol.id)).toEqual([
      directConsumer.id,
    ])
    expect(result.canonicalImpact.semanticCounts.directLogicalTargets).toBeGreaterThanOrEqual(0)
  })

  it('builds a non-empty exact-route view without any relation targeting the binding id', async () => {
    const target = sym('target', 'a.ts', 1)
    const consumer = sym('consumer', 'direct.ts', 1)
    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'a.ts',
      name: 'target',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const binding = createPublicBinding({
      surface: 'public.ts',
      exportedName: 'target',
      space: SymbolSpace.Value,
      targetId: logical.id,
    })
    await store.upsertFile(file('a.ts'), [target], [])
    await store.upsertFile(
      file('direct.ts'),
      [consumer],
      [createRelation({ source: consumer.id, target: target.id, type: RelationType.Calls })],
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
        path: [{ fromId: binding.id, toId: logical.id, kind: 're-export:named' }],
      },
      'upstream',
    )

    expect(result.bindingImpact.affectedSymbols.map((symbol) => symbol.id)).toEqual([consumer.id])
  })

  it('returns covering specs for inputs and impacted resources using two batch reads', async () => {
    const target = sym('target', 'a.ts', 1)
    const caller = sym('caller', 'b.ts', 1)
    const logicalOf = (symbol: typeof target): ReturnType<typeof createLogicalSymbol> =>
      createLogicalSymbol({
        workspace: 'core',
        surface: symbol.filePath,
        name: symbol.name,
        space: SymbolSpace.Value,
        ownerId: undefined,
        memberSemantics: undefined,
      })
    const targetLogical = logicalOf(target)
    const callerLogical = logicalOf(caller)
    await store.upsertFile(file('a.ts'), [target], [])
    await store.upsertFile(
      file('b.ts'),
      [caller],
      [
        createRelation({ source: 'b.ts', target: 'a.ts', type: RelationType.Imports }),
        createRelation({ source: caller.id, target: target.id, type: RelationType.Calls }),
      ],
    )
    await store.replaceReferenceFacts({
      logicalSymbols: [targetLogical, callerLogical],
      declarations: [
        [targetLogical, target],
        [callerLogical, caller],
      ].map(([logical, symbol]) => ({
        logicalSymbolId: (logical as typeof targetLogical).id,
        declaration: {
          logicalId: (logical as typeof targetLogical).id,
          symbolId: (symbol as typeof target).id,
          location: {
            filePath: (symbol as typeof target).filePath,
            line: 1,
            column: 0,
            endLine: undefined,
            endColumn: undefined,
          },
          kind: SymbolKind.Function,
          form: 'definition' as const,
          occurrenceForm: 'definition' as const,
        },
      })),
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
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
        target: targetLogical.id,
        type: RelationType.CoversSymbol,
      }),
    ])
    await store.upsertSpec(spec('spec:impacted'), [
      createRelation({ source: 'spec:impacted', target: 'b.ts', type: RelationType.CoversFile }),
      createRelation({
        source: 'spec:impacted',
        target: callerLogical.id,
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
        evidence: [
          { kind: 'symbol', target: targetLogical.id, depth: 0, declarations: [target.id] },
        ],
      },
      {
        specId: 'spec:impacted',
        minDepth: 1,
        evidence: [
          { kind: 'file', target: 'b.ts', depth: 1 },
          { kind: 'symbol', target: callerLogical.id, depth: 1, declarations: [caller.id] },
        ],
      },
    ])
  })

  it('deduplicates file-only coverage across multiple input files without a symbol read', async () => {
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
    // No file declares a logical symbol, so no physical id is ever queried as a coverage target.
    expect(symbolCoverage).not.toHaveBeenCalled()
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

  it('aggregates only admitted multi-file rows and keeps their shallowest symbol depth', async () => {
    const first = sym('first', 'a.ts', 1)
    const second = sym('second', 'b.ts', 1)
    const bridge = sym('bridge', 'bridge.ts', 1)
    const shared = sym('shared', 'shared.ts', 1)
    const excluded = sym('excluded', 'excluded.ts', 1)
    const inWorkspace = (path: string, workspace: string) =>
      createFileNode({
        path,
        projectRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:x',
        workspace,
      })

    await store.upsertFile(inWorkspace('a.ts', 'root'), [first], [])
    await store.upsertFile(inWorkspace('b.ts', 'root'), [second], [])
    await store.upsertFile(
      inWorkspace('bridge.ts', 'included'),
      [bridge],
      [createRelation({ source: bridge.id, target: second.id, type: RelationType.Calls })],
    )
    await store.upsertFile(
      inWorkspace('shared.ts', 'included'),
      [shared],
      [
        createRelation({ source: shared.id, target: first.id, type: RelationType.Calls }),
        createRelation({ source: shared.id, target: bridge.id, type: RelationType.Calls }),
      ],
    )
    await store.upsertFile(
      inWorkspace('excluded.ts', 'excluded'),
      [excluded],
      [createRelation({ source: excluded.id, target: first.id, type: RelationType.Calls })],
    )

    const result = await analyzeFilesImpact(
      store,
      ['a.ts', 'b.ts', 'a.ts'],
      'upstream',
      3,
      undefined,
      {
        types: ['files', 'symbols'],
        workspaces: ['included', 'excluded'],
        excludeWorkspaces: ['excluded'],
      },
    )

    expect(result.affectedFiles).toEqual(['bridge.ts', 'shared.ts'])
    expect(result.affectedSymbols.map((symbol) => [symbol.id, symbol.depth])).toEqual([
      [bridge.id, 1],
      [shared.id, 1],
    ])
    expect(result.affectedSymbols).not.toContainEqual(expect.objectContaining({ id: excluded.id }))
    expect(result.coveringSpecs).toEqual([])
    expect(result.symbols).toHaveLength(2)
    expect(result.directDependents).toBe(2)
    expect(result.indirectDependents).toBe(1)
    expect(result.riskLevel).toBe('MEDIUM')
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

  it('retains call-affected symbol spec coverage in specs-only file and multi-file impact (D-3)', async () => {
    const targetA = sym('targetA', 'a.ts', 1)
    const callerB = sym('callerB', 'b.ts', 1)
    const callerLogical = createLogicalSymbol({
      workspace: 'core',
      surface: 'b.ts',
      name: 'callerB',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const spec = createSpecNode({
      specId: 'core:caller-spec',
      workspace: '/p',
      path: 'caller-spec',
      title: 'Caller Spec',
      description: '',
      contentHash: 'sha256:caller-spec',
      content: '',
      dependsOn: [],
    })

    await store.upsertFile(file('a.ts'), [targetA], [])
    await store.upsertFile(
      file('b.ts'),
      [callerB],
      [createRelation({ source: callerB.id, target: targetA.id, type: RelationType.Calls })],
    )
    await store.replaceReferenceFacts({
      logicalSymbols: [callerLogical],
      declarations: [
        {
          logicalSymbolId: callerLogical.id,
          declaration: {
            logicalId: callerLogical.id,
            symbolId: callerB.id,
            location: {
              filePath: callerB.filePath,
              line: callerB.line,
              column: callerB.column,
              endLine: callerB.endLine,
              endColumn: callerB.endColumn,
            },
            kind: callerB.kind,
            form: 'definition',
            occurrenceForm: 'definition',
          },
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    await store.upsertSpec(spec, [
      createRelation({
        source: spec.specId,
        target: callerLogical.id,
        type: RelationType.CoversSymbol,
      }),
    ])

    const result = await analyzeFilesImpact(store, ['a.ts'], 'upstream', 3, undefined, {
      types: ['specs'],
    })

    expect(result.affectedSpecs).toEqual(['core:caller-spec'])
    expect(result.affectedFiles).toEqual([])
    expect(result.affectedSymbols).toEqual([])
    // Under a specs-only filter the coverage keeps its real depth and evidence.
    expect(result.coveringSpecs).toEqual([
      expect.objectContaining({
        specId: 'core:caller-spec',
        minDepth: 1,
        evidence: [expect.objectContaining({ kind: 'symbol', target: callerLogical.id, depth: 1 })],
      }),
    ])
  })

  it('collects covering specs of dependents reached only through calls', async () => {
    const target = sym('target', 'a.ts', 1)
    const consumer = sym('consumer', 'b.ts', 1)
    const spec = createSpecNode({
      specId: 'core:consumer-file-spec',
      workspace: '/p',
      path: 'consumer-file-spec',
      title: 'Consumer file spec',
      description: '',
      contentHash: 'sha256:consumer-file-spec',
      content: '',
      dependsOn: [],
    })
    await store.upsertFile(file('a.ts'), [target], [])
    await store.upsertFile(
      file('b.ts'),
      [consumer],
      [createRelation({ source: consumer.id, target: target.id, type: RelationType.Calls })],
    )
    await store.upsertSpec(spec, [
      createRelation({ source: spec.specId, target: 'b.ts', type: RelationType.CoversFile }),
    ])
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: 'a.ts',
      name: 'target',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })

    const result = await analyzeResolvedSymbolImpact(
      store,
      {
        kind: 'logical-target',
        logicalSymbol: logical,
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
        path: [],
      },
      'upstream',
    )

    expect(result.coveringSpecs).toEqual([
      expect.objectContaining({
        specId: 'core:consumer-file-spec',
        minDepth: 1,
        evidence: [expect.objectContaining({ kind: 'file', target: 'b.ts', depth: 1 })],
      }),
    ])
  })
})
