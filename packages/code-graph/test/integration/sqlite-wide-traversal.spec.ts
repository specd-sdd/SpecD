import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeFileImpact } from '../../src/domain/services/analyze-file-impact.js'
import { analyzeFilesImpact } from '../../src/domain/services/analyze-files-impact.js'
import { computeHotspots } from '../../src/domain/services/compute-hotspots.js'
import { createFileNode } from '../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../src/domain/value-objects/relation.js'
import { RelationType } from '../../src/domain/value-objects/relation-type.js'
import { createSpecNode } from '../../src/domain/value-objects/spec-node.js'
import { createSymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../src/domain/value-objects/symbol-kind.js'
import { SQLiteGraphStore } from '../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { InMemoryGraphStore } from '../helpers/in-memory-graph-store.js'

describe('SQLite wide traversal', () => {
  let storagePath: string | undefined

  afterEach(() => {
    if (storagePath !== undefined) rmSync(storagePath, { recursive: true, force: true })
    storagePath = undefined
  })

  it('matches in-memory upstream and downstream impact with a 32-request queue', async () => {
    storagePath = mkdtempSync(join(tmpdir(), 'code-graph-wide-traversal-'))
    const sqlite = new SQLiteGraphStore(storagePath, { maxPendingOperations: 32 })
    const memory = new InMemoryGraphStore()

    try {
      await Promise.all([sqlite.open(), memory.open()])

      const inputFiles = Array.from({ length: 6 }, (_, fileIndex) =>
        createFileNode({
          path: `code-graph:src/input-${String(fileIndex)}.ts`,
          configRelativePath: `src/input-${String(fileIndex)}.ts`,
          language: 'typescript',
          contentHash: `sha256:input-${String(fileIndex)}`,
          workspace: 'code-graph',
        }),
      )
      const callerFile = createFileNode({
        path: 'code-graph:src/callers.ts',
        configRelativePath: 'src/callers.ts',
        language: 'typescript',
        contentHash: 'sha256:callers',
        workspace: 'code-graph',
      })
      const dependencyFile = createFileNode({
        path: 'code-graph:src/dependencies.ts',
        configRelativePath: 'src/dependencies.ts',
        language: 'typescript',
        contentHash: 'sha256:dependencies',
        workspace: 'code-graph',
      })
      const inputSymbols = inputFiles.flatMap((inputFile, fileIndex) =>
        Array.from({ length: 12 }, (_, symbolIndex) =>
          createSymbolNode({
            name: `input${String(fileIndex)}Symbol${String(symbolIndex)}`,
            kind: SymbolKind.Function,
            filePath: inputFile.path,
            line: symbolIndex + 1,
            column: 0,
          }),
        ),
      )
      const callers = Array.from({ length: 48 }, (_, index) =>
        createSymbolNode({
          name: `caller${String(index)}`,
          kind: SymbolKind.Function,
          filePath: callerFile.path,
          line: index + 1,
          column: 0,
        }),
      )
      const dependencies = Array.from({ length: 48 }, (_, index) =>
        createSymbolNode({
          name: `dependency${String(index)}`,
          kind: SymbolKind.Function,
          filePath: dependencyFile.path,
          line: index + 1,
          column: 0,
        }),
      )
      const callRelations = inputSymbols.flatMap((inputSymbol, index) => [
        createRelation({
          source: callers[index % callers.length]!.id,
          target: inputSymbol.id,
          type: index % 3 === 0 ? RelationType.UsesType : RelationType.Calls,
        }),
        createRelation({
          source: inputSymbol.id,
          target: dependencies[index % dependencies.length]!.id,
          type: index % 3 === 0 ? RelationType.Constructs : RelationType.Calls,
        }),
      ])
      const coverageSpec = createSpecNode({
        specId: 'code-graph:wide-traversal',
        path: 'code-graph/wide-traversal',
        title: 'Wide traversal',
        contentHash: 'sha256:wide-traversal',
        workspace: 'code-graph',
      })
      const data = {
        files: [...inputFiles, callerFile, dependencyFile],
        symbols: [...inputSymbols, ...callers, ...dependencies],
        specs: [coverageSpec],
        relations: [
          ...callRelations,
          createRelation({
            source: coverageSpec.specId,
            target: callerFile.path,
            type: RelationType.CoversFile,
          }),
          createRelation({
            source: coverageSpec.specId,
            target: dependencies[0]!.id,
            type: RelationType.CoversSymbol,
          }),
        ],
      }
      await Promise.all([sqlite.bulkLoad(data), memory.bulkLoad(data)])
      const filePaths = inputFiles.map((inputFile) => inputFile.path)

      const [sqliteUpstream, memoryUpstream] = await Promise.all([
        analyzeFilesImpact(sqlite, filePaths, 'upstream', 2),
        analyzeFilesImpact(memory, filePaths, 'upstream', 2),
      ])
      const [sqliteDownstream, memoryDownstream] = await Promise.all([
        analyzeFilesImpact(sqlite, filePaths, 'downstream', 2),
        analyzeFilesImpact(memory, filePaths, 'downstream', 2),
      ])

      expect(sqliteUpstream).toEqual(memoryUpstream)
      expect(sqliteDownstream).toEqual(memoryDownstream)
      expect(sqliteUpstream.affectedSymbols).toHaveLength(callers.length)
      expect(sqliteDownstream.affectedSymbols).toHaveLength(dependencies.length)
      expect(sqliteUpstream.coveringSpecs[0]?.specId).toBe(coverageSpec.specId)
      expect(sqliteDownstream.coveringSpecs[0]?.specId).toBe(coverageSpec.specId)
    } finally {
      await Promise.all([sqlite.close(), memory.close()])
    }
  })

  it('computes wide hotspots with a 16-request queue without overloading the store', async () => {
    storagePath = mkdtempSync(join(tmpdir(), 'code-graph-wide-hotspots-'))
    const sqlite = new SQLiteGraphStore(storagePath, { maxPendingOperations: 16 })
    const memory = new InMemoryGraphStore()

    try {
      await Promise.all([sqlite.open(), memory.open()])

      const baseFile = createFileNode({
        path: 'code-graph:src/base.ts',
        configRelativePath: 'src/base.ts',
        language: 'typescript',
        contentHash: 'sha256:base',
        workspace: 'code-graph',
      })
      const hierarchyFile = createFileNode({
        path: 'code-graph:src/hierarchy.ts',
        configRelativePath: 'src/hierarchy.ts',
        language: 'typescript',
        contentHash: 'sha256:hierarchy',
        workspace: 'code-graph',
      })
      const baseClass = createSymbolNode({
        name: 'Base',
        kind: SymbolKind.Class,
        filePath: baseFile.path,
        line: 1,
        column: 0,
      })
      const contract = createSymbolNode({
        name: 'Contract',
        kind: SymbolKind.Interface,
        filePath: baseFile.path,
        line: 4,
        column: 0,
      })
      const descendants = Array.from({ length: 600 }, (_, index) =>
        createSymbolNode({
          name: `Descendant${String(index)}`,
          kind: SymbolKind.Class,
          filePath: hierarchyFile.path,
          line: index + 1,
          column: 0,
        }),
      )
      const data = {
        files: [baseFile, hierarchyFile],
        symbols: [baseClass, contract, ...descendants],
        specs: [],
        relations: descendants.flatMap((descendant, index) => [
          createRelation({
            source: descendant.id,
            target: baseClass.id,
            type: RelationType.Extends,
          }),
          ...(index % 2 === 0
            ? [
                createRelation({
                  source: descendant.id,
                  target: contract.id,
                  type: RelationType.Implements,
                }),
              ]
            : []),
        ]),
      }
      await Promise.all([sqlite.bulkLoad(data), memory.bulkLoad(data)])

      const [sqliteHotspots, memoryHotspots] = await Promise.all([
        computeHotspots(sqlite, {
          minRisk: 'LOW',
          kinds: [SymbolKind.Class, SymbolKind.Interface],
        }),
        computeHotspots(memory, {
          minRisk: 'LOW',
          kinds: [SymbolKind.Class, SymbolKind.Interface],
        }),
      ])

      expect(sqliteHotspots).toEqual(memoryHotspots)
      const baseEntry = sqliteHotspots.entries.find((entry) => entry.symbol.id === baseClass.id)
      expect(baseEntry).toBeDefined()
      expect(baseEntry!.score).toBeGreaterThan(0)
    } finally {
      await Promise.all([sqlite.close(), memory.close()])
    }
  })

  it('matches in-memory single-file impact with a 16-request queue', async () => {
    storagePath = mkdtempSync(join(tmpdir(), 'code-graph-wide-single-impact-'))
    const sqlite = new SQLiteGraphStore(storagePath, { maxPendingOperations: 16 })
    const memory = new InMemoryGraphStore()

    try {
      await Promise.all([sqlite.open(), memory.open()])

      const targetFile = createFileNode({
        path: 'code-graph:src/target.ts',
        configRelativePath: 'src/target.ts',
        language: 'typescript',
        contentHash: 'sha256:target',
        workspace: 'code-graph',
      })
      const callerFile = createFileNode({
        path: 'code-graph:src/callers.ts',
        configRelativePath: 'src/callers.ts',
        language: 'typescript',
        contentHash: 'sha256:callers',
        workspace: 'code-graph',
      })
      const targets = Array.from({ length: 40 }, (_, index) =>
        createSymbolNode({
          name: `target${String(index)}`,
          kind: SymbolKind.Function,
          filePath: targetFile.path,
          line: index + 1,
          column: 0,
        }),
      )
      const callers = Array.from({ length: 120 }, (_, index) =>
        createSymbolNode({
          name: `caller${String(index)}`,
          kind: SymbolKind.Function,
          filePath: callerFile.path,
          line: index + 1,
          column: 0,
        }),
      )
      const data = {
        files: [targetFile, callerFile],
        symbols: [...targets, ...callers],
        specs: [],
        relations: callers.map((caller, index) =>
          createRelation({
            source: caller.id,
            target: targets[index % targets.length]!.id,
            type: RelationType.Calls,
          }),
        ),
      }
      await Promise.all([sqlite.bulkLoad(data), memory.bulkLoad(data)])

      const [sqliteImpact, memoryImpact] = await Promise.all([
        analyzeFileImpact(sqlite, targetFile.path, 'upstream', 3),
        analyzeFileImpact(memory, targetFile.path, 'upstream', 3),
      ])

      expect(sqliteImpact).toEqual(memoryImpact)
      expect(sqliteImpact.affectedSymbols).toHaveLength(callers.length)
    } finally {
      await Promise.all([sqlite.close(), memory.close()])
    }
  })
})
