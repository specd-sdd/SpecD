import { describe, expect, it } from 'vitest'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { projectSpecCoverage } from '../../../src/application/services/project-spec-coverage.js'

describe('projectSpecCoverage', () => {
  it('projects file and uniquely resolved logical-symbol coverage', async () => {
    const filePath = 'code-graph:src/service.ts'
    const symbol = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
    })

    const result = await projectSpecCoverage({
      specs: [
        {
          specId: 'code-graph:coverage',
          implementation: [{ file: filePath }, { file: filePath, symbols: ['run'] }],
        },
      ],
      indexedFilePaths: new Set([filePath]),
      symbolsByFile: () => [symbol],
      logicalIdByDeclarationSymbolId: new Map([[symbol.id, 'logical:run']]),
    })

    expect(result.diagnostics).toEqual([])
    expect(result.relations).toEqual([
      expect.objectContaining({
        source: 'code-graph:coverage',
        target: filePath,
        type: RelationType.CoversFile,
      }),
      expect.objectContaining({
        source: 'code-graph:coverage',
        target: 'logical:run',
        type: RelationType.CoversSymbol,
      }),
    ])
  })

  it('reports missing files, missing symbols, and ambiguous logical targets without fallback', async () => {
    const filePath = 'code-graph:src/service.ts'
    const first = createSymbolNode({
      name: 'duplicate',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
    })
    const second = createSymbolNode({
      name: 'duplicate',
      kind: SymbolKind.Function,
      filePath,
      line: 2,
      column: 0,
    })

    const result = await projectSpecCoverage({
      specs: [
        {
          specId: 'code-graph:coverage',
          implementation: [
            { file: 'code-graph:src/missing.ts' },
            { file: filePath, symbols: ['absent', 'duplicate'] },
          ],
        },
      ],
      indexedFilePaths: new Set([filePath]),
      symbolsByFile: () => [first, second],
      logicalIdByDeclarationSymbolId: new Map([
        [first.id, 'logical:first'],
        [second.id, 'logical:second'],
      ]),
    })

    expect(result.relations).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        specId: 'code-graph:coverage',
        filePath: 'code-graph:src/missing.ts',
        reason: 'FILE_NOT_INDEXED',
      },
      {
        specId: 'code-graph:coverage',
        filePath,
        symbolName: 'absent',
        reason: 'SYMBOL_NOT_FOUND',
      },
      {
        specId: 'code-graph:coverage',
        filePath,
        symbolName: 'duplicate',
        reason: 'SYMBOL_AMBIGUOUS',
      },
    ])
  })

  it('emits coverage relations without a stale flag and reports absent symbols as SYMBOL_NOT_FOUND', async () => {
    const filePath = 'code-graph:src/service.ts'
    const present = createSymbolNode({
      name: 'present',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
    })

    const result = await projectSpecCoverage({
      specs: [
        {
          specId: 'code-graph:coverage',
          implementation: [{ file: filePath, symbols: ['present', 'gone'] }],
        },
      ],
      indexedFilePaths: new Set([filePath]),
      symbolsByFile: () => [present],
      logicalIdByDeclarationSymbolId: new Map([[present.id, 'logical:present']]),
    })

    const symbolRelations = result.relations.filter((relation) => relation.type === 'COVERS_SYMBOL')
    expect(symbolRelations).toHaveLength(1)
    for (const relation of result.relations) {
      expect(relation.metadata ?? {}).not.toHaveProperty('stale')
    }
    expect(result.diagnostics).toEqual([
      {
        specId: 'code-graph:coverage',
        filePath,
        symbolName: 'gone',
        reason: 'SYMBOL_NOT_FOUND',
      },
    ])
  })

  it('classifies a matched physical-only declaration as coverage not applicable', async () => {
    const filePath = 'code-graph:src/service.ts'
    const physicalOnly = createSymbolNode({
      name: '<anonymous>',
      kind: SymbolKind.Function,
      filePath,
      line: 3,
      column: 2,
    })

    const result = await projectSpecCoverage({
      specs: [
        {
          specId: 'code-graph:coverage',
          implementation: [{ file: filePath, symbols: ['<anonymous>'] }],
        },
      ],
      indexedFilePaths: new Set([filePath]),
      symbolsByFile: () => [physicalOnly],
      logicalIdByDeclarationSymbolId: new Map(),
    })

    expect(result.relations).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        specId: 'code-graph:coverage',
        filePath,
        symbolName: '<anonymous>',
        reason: 'COVERAGE_NOT_APPLICABLE',
      },
    ])
  })
})
