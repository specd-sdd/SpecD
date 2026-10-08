import { describe, afterEach, expect, it, vi } from 'vitest'

const walLock = vi.hoisted(() => ({ failures: 0 }))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rm: async (
      target: Parameters<typeof actual.rm>[0],
      options?: Parameters<typeof actual.rm>[1],
    ) => {
      if (walLock.failures > 0 && String(target).endsWith('code-graph.sqlite-wal')) {
        walLock.failures -= 1
        throw Object.assign(new Error('locked'), { code: 'EBUSY' })
      }
      return actual.rm(target, options)
    },
  }
})
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { IndexedResourceKind } from '../../../src/domain/value-objects/indexed-input-freshness.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  assignQualifiedNames,
  createPublicBinding,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { SQLiteWorkerClient } from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { GraphStoreRecreateRequiresClosedError } from '../../../src/domain/errors/graph-store-recreate-requires-closed-error.js'
import { GraphStorageRecoveryRequiredError } from '../../../src/domain/errors/graph-storage-recovery-required-error.js'
import {
  SQLITE_SCHEMA_DDL,
  SQLITE_SCHEMA_VERSION,
} from '../../../src/infrastructure/sqlite/schema.js'
import { graphStoreContractTests } from '../../domain/ports/graph-store.contract.js'

let tempDir: string | undefined

graphStoreContractTests(
  'SQLiteGraphStore',
  () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    return new SQLiteGraphStore(tempDir)
  },
  async () => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  },
  { supportsReferenceFacts: true },
)

describe('SQLiteGraphStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  async function seedImpactFrontierFixture(store: SQLiteGraphStore) {
    const coreFile = createFileNode({
      path: 'core:src/impact-source.ts',
      configRelativePath: 'src/impact-source.ts',
      language: 'typescript',
      contentHash: 'sha256:impact-core',
      workspace: 'core',
    })
    const cliFile = createFileNode({
      path: 'cli:src/impact-source.ts',
      configRelativePath: 'src/impact-source.ts',
      language: 'typescript',
      contentHash: 'sha256:impact-cli',
      workspace: 'cli',
    })
    const targetFile = createFileNode({
      path: 'code-graph:src/impact-target.ts',
      configRelativePath: 'src/impact-target.ts',
      language: 'typescript',
      contentHash: 'sha256:impact-target',
      workspace: 'code-graph',
    })
    const quotedFile = createFileNode({
      path: 'quoted:src/impact-source.ts',
      configRelativePath: 'src/impact-source.ts',
      language: 'typescript',
      contentHash: 'sha256:impact-quoted',
      workspace: "quoted' OR 1=1 --",
    })
    const coreFunction = createSymbolNode({
      name: 'coreCaller',
      kind: SymbolKind.Function,
      filePath: coreFile.path,
      line: 1,
      column: 0,
    })
    const cliClass = createSymbolNode({
      name: 'cliCaller',
      kind: SymbolKind.Class,
      filePath: cliFile.path,
      line: 1,
      column: 0,
    })
    const targetSymbol = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: targetFile.path,
      line: 1,
      column: 0,
    })
    const downstreamSymbol = createSymbolNode({
      name: 'downstream',
      kind: SymbolKind.Method,
      filePath: targetFile.path,
      line: 2,
      column: 0,
    })
    const quotedFunction = createSymbolNode({
      name: 'quotedCaller',
      kind: SymbolKind.Function,
      filePath: quotedFile.path,
      line: 1,
      column: 0,
    })
    const coreSpec = createSpecNode({
      specId: 'core:impact-source',
      path: 'specs/impact-source',
      title: 'Core impact source',
      contentHash: 'sha256:impact-core-spec',
      workspace: 'core',
    })
    const targetSpec = createSpecNode({
      specId: 'code-graph:impact-target',
      path: 'specs/impact-target',
      title: 'Impact target',
      contentHash: 'sha256:impact-target-spec',
      workspace: 'code-graph',
    })

    await store.bulkLoad({
      files: [coreFile, cliFile, targetFile, quotedFile],
      symbols: [coreFunction, cliClass, targetSymbol, downstreamSymbol, quotedFunction],
      specs: [coreSpec, targetSpec],
      relations: [
        createRelation({
          source: coreFunction.id,
          target: targetSymbol.id,
          type: RelationType.Calls,
        }),
        createRelation({ source: cliClass.id, target: targetSymbol.id, type: RelationType.Calls }),
        createRelation({
          source: quotedFunction.id,
          target: targetSymbol.id,
          type: RelationType.Calls,
        }),
        createRelation({
          source: targetSymbol.id,
          target: downstreamSymbol.id,
          type: RelationType.Calls,
        }),
        createRelation({
          source: coreFile.path,
          target: targetFile.path,
          type: RelationType.Imports,
        }),
        createRelation({
          source: coreSpec.specId,
          target: targetSpec.specId,
          type: RelationType.DependsOn,
        }),
        createRelation({
          source: targetSpec.specId,
          target: targetFile.path,
          type: RelationType.CoversFile,
        }),
        createRelation({
          source: targetSpec.specId,
          target: targetSymbol.id,
          type: RelationType.CoversSymbol,
        }),
      ],
    })

    return {
      coreFile,
      coreFunction,
      cliClass,
      targetFile,
      targetSymbol,
      downstreamSymbol,
      quotedFunction,
      coreSpec,
      targetSpec,
    }
  }

  it('transports real filtered frontiers and hydrates only requested result categories', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-impact-types-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const fixture = await seedImpactFrontierFixture(store)

    const symbolsOnly = await store.queryImpactFrontier({
      resource: 'symbol',
      frontier: [fixture.targetSymbol.id],
      direction: 'upstream',
      depth: 1,
      maxDepth: 3,
      relationTypes: [RelationType.Calls],
      filter: { types: ['symbols'] },
    })
    expect(symbolsOnly.symbols.map((symbol) => symbol.id)).toEqual([
      fixture.cliClass.id,
      fixture.coreFunction.id,
      fixture.quotedFunction.id,
    ])
    expect(symbolsOnly.files).toEqual([])
    expect(symbolsOnly.specs).toEqual([])

    const filesOnly = await store.queryImpactFrontier({
      resource: 'file',
      frontier: [fixture.targetFile.path],
      direction: 'upstream',
      depth: 1,
      maxDepth: 3,
      relationTypes: [RelationType.Imports],
      filter: { types: ['files'] },
    })
    expect(filesOnly.files.map((file) => file.path)).toEqual([fixture.coreFile.path])
    expect(filesOnly.symbols).toEqual([])
    expect(filesOnly.specs).toEqual([])

    const specsOnly = await store.queryImpactFrontier({
      resource: 'spec',
      frontier: [fixture.targetSpec.specId],
      direction: 'upstream',
      depth: 1,
      maxDepth: 3,
      relationTypes: [RelationType.DependsOn],
      filter: { types: ['specs'] },
    })
    expect(specsOnly.specs.map((spec) => spec.specId)).toEqual([fixture.coreSpec.specId])
    expect(specsOnly.symbols).toEqual([])
    expect(specsOnly.files).toEqual([])

    const fileCoverage = await store.queryImpactFrontier({
      resource: 'spec',
      frontier: [fixture.targetFile.path],
      direction: 'upstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversFile],
      filter: { types: ['specs'], workspaces: ['code-graph'] },
    })
    expect(fileCoverage.specs.map((spec) => spec.specId)).toEqual([fixture.targetSpec.specId])

    // Candidate resource category: query covered symbols and files from spec at depth 0 (D-4)
    const downstreamSymbolCoverage = await store.queryImpactFrontier({
      resource: 'symbol',
      frontier: [fixture.targetSpec.specId],
      direction: 'downstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversSymbol],
      filter: { types: ['symbols'] },
    })
    expect(downstreamSymbolCoverage.symbols.map((s) => s.id)).toEqual([fixture.targetSymbol.id])
    expect(downstreamSymbolCoverage.relations).toHaveLength(1)

    const downstreamFileCoverage = await store.queryImpactFrontier({
      resource: 'file',
      frontier: [fixture.targetSpec.specId],
      direction: 'downstream',
      depth: 0,
      maxDepth: 0,
      relationTypes: [RelationType.CoversFile],
      filter: { types: ['files'] },
    })
    expect(downstreamFileCoverage.files.map((f) => f.path)).toEqual([fixture.targetFile.path])
    expect(downstreamFileCoverage.relations).toHaveLength(1)

    await store.close()
  })

  it('applies kind and workspace predicates in SQLite with exclusion precedence', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-impact-predicates-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const fixture = await seedImpactFrontierFixture(store)
    const input = {
      resource: 'symbol' as const,
      frontier: [fixture.targetSymbol.id],
      direction: 'upstream' as const,
      depth: 1,
      maxDepth: 3,
      relationTypes: [RelationType.Calls],
    }

    await expect(
      store.queryImpactFrontier({
        ...input,
        filter: { types: ['symbols'], kinds: [SymbolKind.Function], workspaces: ['core'] },
      }),
    ).resolves.toMatchObject({
      symbols: [expect.objectContaining({ id: fixture.coreFunction.id })],
    })
    await expect(
      store.queryImpactFrontier({
        ...input,
        filter: {
          types: ['symbols'],
          workspaces: ['core'],
          excludeWorkspaces: ['core'],
        },
      }),
    ).resolves.toEqual({ relations: [], symbols: [], files: [], specs: [] })
    await expect(
      store.queryImpactFrontier({
        ...input,
        filter: { types: ['symbols'], workspaces: ['missing'] },
      }),
    ).resolves.toEqual({ relations: [], symbols: [], files: [], specs: [] })
    const unconstrained = await store.queryImpactFrontier({
      ...input,
      filter: { types: ['symbols'], kinds: [], workspaces: [], excludeWorkspaces: [] },
    })
    expect(unconstrained.symbols.map((symbol) => symbol.id)).toEqual([
      fixture.cliClass.id,
      fixture.coreFunction.id,
      fixture.quotedFunction.id,
    ])
    const bothDirections = await store.queryImpactFrontier({ ...input, direction: 'both' })
    expect(bothDirections.relations.map((relation) => relation.source)).toEqual([
      fixture.cliClass.id,
      fixture.targetSymbol.id,
      fixture.coreFunction.id,
      fixture.quotedFunction.id,
    ])
    await store.close()
  })

  it('binds metacharacter workspace values without broadening the impact query', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-impact-parameters-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const fixture = await seedImpactFrontierFixture(store)

    const result = await store.queryImpactFrontier({
      resource: 'symbol',
      frontier: [fixture.targetSymbol.id],
      direction: 'upstream',
      depth: 1,
      maxDepth: 3,
      relationTypes: [RelationType.Calls],
      filter: { types: ['symbols'], workspaces: ["quoted' OR 1=1 --"] },
    })

    expect(result.symbols.map((symbol) => symbol.id)).toEqual([fixture.quotedFunction.id])
    expect(result.relations).toHaveLength(1)
    await expect(store.getStatistics()).resolves.toMatchObject({ fileCount: 4, symbolCount: 5 })
    await store.close()
  })

  it('uses one RPC per non-empty traversal batch and no RPC for empty inputs', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-rpc-batch-'))
    const store = new SQLiteGraphStore(tempDir)
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    sendRequest.mockResolvedValue([])

    await expect(store.getSymbolsByIds([])).resolves.toEqual([])
    await expect(store.getIncomingSymbolRelations([], [RelationType.Calls])).resolves.toEqual([])
    await expect(store.getOutgoingSymbolRelations(['symbol'], [])).resolves.toEqual([])
    expect(sendRequest).not.toHaveBeenCalled()

    await store.getSymbolsByIds(['symbol'])
    await store.getIncomingSymbolRelations(['symbol'], [RelationType.Calls])
    await store.getOutgoingSymbolRelations(['symbol'], [RelationType.Calls])

    expect(sendRequest.mock.calls).toEqual([
      ['getSymbolsByIds', { symbolIds: ['symbol'] }],
      [
        'getIncomingSymbolRelations',
        { symbolIds: ['symbol'], relationTypes: [RelationType.Calls] },
      ],
      [
        'getOutgoingSymbolRelations',
        { symbolIds: ['symbol'], relationTypes: [RelationType.Calls] },
      ],
    ])
  })

  it('avoids worker dispatch for empty newly chunked lookup inputs', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-empty-chunked-lookups-'))
    const store = new SQLiteGraphStore(tempDir)
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    sendRequest.mockResolvedValue({ graph: false, workspaces: {} })

    await expect(store.findDirectlyAffectedFiles([])).resolves.toEqual([])
    await expect(store.getCoveringSpecsForFiles([])).resolves.toEqual([])
    await expect(store.getCoveringSpecsForSymbols([])).resolves.toEqual([])
    await expect(store.findLogicalSymbolsByQualifiedNames([])).resolves.toEqual([])
    await expect(store.findLogicalSymbolsByIds([])).resolves.toEqual([])
    await expect(store.findDeclarations([])).resolves.toEqual([])
    await expect(store.findPublicBindings([])).resolves.toEqual([])
    await expect(store.findPublicBindingsByExportedNames([])).resolves.toEqual([])
    await expect(store.findResolutionSteps([])).resolves.toEqual([])
    await expect(store.findIndexCoverage([])).resolves.toEqual([])
    await expect(store.getFreshnessLatches([])).resolves.toEqual({ graph: false, workspaces: {} })

    expect(sendRequest.mock.calls).toEqual([['readFreshnessLatches', { workspaces: [] }]])
  })

  it('dispatches one worker operation for each oversized chunked lookup', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-chunked-lookup-rpc-'))
    const store = new SQLiteGraphStore(tempDir)
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    sendRequest.mockResolvedValue([])
    const filePaths = Array.from({ length: 901 }, (_, index) => `core:src/${String(index)}.ts`)
    const ids = filePaths.map((path) => `logical:${path}`)

    await Promise.all([
      store.findDirectlyAffectedFiles(filePaths),
      store.getCoveringSpecsForFiles(filePaths),
      store.findLogicalSymbolsByIds(ids),
      store.findResolutionSteps(ids),
      store.findIndexCoverage(filePaths),
      store.findSymbols({ filePaths }),
    ])

    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'findDirectlyAffectedFiles',
      'getCoveringSpecsForFiles',
      'findLogicalSymbolsByIds',
      'findResolutionSteps',
      'findIndexCoverage',
      'findSymbols',
    ])
  })

  it('chunks repeated affected-file path parameters at the budget boundary', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-affected-file-boundary-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const changedFiles = Array.from({ length: 447 }, (_, index) =>
      createFileNode({
        path: `core:src/changed-${String(index).padStart(3, '0')}.ts`,
        configRelativePath: `src/changed-${String(index).padStart(3, '0')}.ts`,
        language: 'typescript',
        contentHash: `sha256:changed-${String(index)}`,
        workspace: 'core',
      }),
    )
    const affectedFiles = changedFiles.map((changed, index) =>
      createFileNode({
        path: `core:src/affected-${String(index).padStart(3, '0')}.ts`,
        configRelativePath: `src/affected-${String(index).padStart(3, '0')}.ts`,
        language: 'typescript',
        contentHash: `sha256:affected-${String(index)}`,
        workspace: 'core',
      }),
    )
    const relations = changedFiles.map((changed, index) =>
      createRelation({
        source: affectedFiles[index]!.path,
        target: changed.path,
        type: RelationType.Imports,
      }),
    )
    await store.bulkLoad({
      files: [...changedFiles, ...affectedFiles],
      symbols: [],
      specs: [],
      relations,
    })

    const expected = affectedFiles
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right))
    const belowBoundaryExpected = affectedFiles
      .slice(0, 446)
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right))
    const request = [
      ...changedFiles.map((file) => file.path).reverse(),
      changedFiles[0]!.path,
      'missing',
    ]
    await expect(
      store.findDirectlyAffectedFiles(changedFiles.slice(0, 446).map((file) => file.path)),
    ).resolves.toEqual(belowBoundaryExpected)
    await expect(store.findDirectlyAffectedFiles(request)).resolves.toEqual(expected)
    await store.close()
  })

  it('chunks fixed relation-type coverage lookups at the budget boundary', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-coverage-boundary-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const spec = createSpecNode({
      specId: 'core:coverage-boundary',
      path: 'specs/coverage-boundary',
      title: 'Coverage boundary',
      contentHash: 'sha256:coverage-boundary',
      workspace: 'core',
    })
    const files = Array.from({ length: 900 }, (_, index) =>
      createFileNode({
        path: `core:src/covered-${String(index).padStart(3, '0')}.ts`,
        configRelativePath: `src/covered-${String(index).padStart(3, '0')}.ts`,
        language: 'typescript',
        contentHash: `sha256:covered-${String(index)}`,
        workspace: 'core',
      }),
    )
    const symbols = files.map((file, index) =>
      createSymbolNode({
        name: `covered${String(index)}`,
        kind: SymbolKind.Function,
        filePath: file.path,
        line: 1,
        column: 0,
      }),
    )
    const relations = [
      ...files.map((file) =>
        createRelation({ source: spec.specId, target: file.path, type: RelationType.CoversFile }),
      ),
      ...symbols.map((symbol) =>
        createRelation({ source: spec.specId, target: symbol.id, type: RelationType.CoversSymbol }),
      ),
    ]
    await store.bulkLoad({ files, symbols, specs: [spec], relations })

    const fileTargets = [...files.map((file) => file.path).reverse(), files[0]!.path, 'missing']
    const symbolTargets = [
      ...symbols.map((symbol) => symbol.id).reverse(),
      symbols[0]!.id,
      'missing',
    ]
    const fileCoverage = await store.getCoveringSpecsForFiles(fileTargets)
    const symbolCoverage = await store.getCoveringSpecsForSymbols(symbolTargets)

    expect(fileCoverage).toHaveLength(900)
    expect(symbolCoverage).toHaveLength(900)
    expect(fileCoverage).toEqual(
      [...fileCoverage].sort(
        (left, right) =>
          left.source.localeCompare(right.source) ||
          left.type.localeCompare(right.type) ||
          left.target.localeCompare(right.target),
      ),
    )
    expect(symbolCoverage).toEqual(
      [...symbolCoverage].sort(
        (left, right) =>
          left.source.localeCompare(right.source) ||
          left.type.localeCompare(right.type) ||
          left.target.localeCompare(right.target),
      ),
    )
    await store.close()
  })

  it('chunks freshness latches and index coverage lookups above the safe budget', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-freshness-coverage-chunk-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const workspaces = Array.from({ length: 901 }, (_, index) => `workspace-${String(index)}`)
    const files = workspaces.map((workspace, index) =>
      createFileNode({
        path: `${workspace}:src/index.ts`,
        configRelativePath: 'src/index.ts',
        language: 'typescript',
        contentHash: `sha256:coverage-${String(index)}`,
        workspace,
      }),
    )
    const session = store.beginBulkIndexSession()
    await session.writeFiles(files)
    await session.writeReferenceFacts({
      logicalSymbols: [],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: files.map((file) => ({
        filePath: file.path,
        contentHash: file.contentHash,
        status: 'indexed' as const,
        reason: undefined,
        capabilities: [],
      })),
    })
    await session.commit()
    await store.markWorkspacesAndGraphStaleSinceLastIndex(workspaces)

    const latches = await store.getFreshnessLatches([...workspaces, workspaces[0]!, 'missing'])
    const coverage = await store.findIndexCoverage([
      ...files.map((file) => file.path).reverse(),
      files[0]!.path,
      'missing',
    ])

    expect(latches.graph).toBe(true)
    expect(latches.workspaces).toEqual(
      Object.fromEntries([
        ...workspaces.map((workspace) => [workspace, true] as const),
        ['missing', false],
      ]),
    )
    const expectedCoveragePaths = files
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right))
    expect(coverage.map((item) => item.filePath)).toEqual(expectedCoveragePaths)
    expect(
      (
        await store.findIndexCoverage([
          'missing',
          files[0]!.path,
          ...files.map((file) => file.path),
        ])
      ).map((item) => item.filePath),
    ).toEqual(expectedCoveragePaths)
    await store.close()
  })

  it('chunks logical-reference lookup families above the safe budget', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-logical-reference-chunk-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const logicalSymbols = Array.from({ length: 901 }, (_, index) => {
      const symbol = createLogicalSymbol({
        workspace: 'core',
        surface: 'core:src/references.ts',
        name: `Reference${String(index)}`,
        space: SymbolSpace.Value,
        ownerId: undefined,
        memberSemantics: undefined,
      })
      return { ...symbol, qualifiedName: `Reference.${String(index)}` }
    })
    const publicBindings = logicalSymbols.map((symbol, index) =>
      createPublicBinding({
        surface: 'core',
        exportedName: `Reference${String(index)}`,
        space: SymbolSpace.Value,
        targetId: symbol.id,
      }),
    )
    const declarations = logicalSymbols.map((symbol, index) => ({
      logicalSymbolId: symbol.id,
      declaration: {
        logicalId: symbol.id,
        symbolId: `symbol:${String(index)}`,
        location: {
          filePath: 'core:src/references.ts',
          line: index + 1,
          column: 0,
          endLine: index + 1,
          endColumn: 1,
        },
        kind: SymbolKind.Variable,
      },
    }))
    const steps = logicalSymbols.map((symbol, index) => ({
      fromId: symbol.id,
      toId: `resolved:${String(index)}`,
      kind: 'export' as const,
    }))
    await store.replaceReferenceFacts({
      logicalSymbols,
      declarations,
      publicBindings,
      localBindings: [],
      steps,
      coverage: [],
    })

    const ids = [
      ...logicalSymbols.map((symbol) => symbol.id).reverse(),
      logicalSymbols[0]!.id,
      'missing',
    ]
    const names = [
      ...publicBindings.map((binding) => binding.exportedName).reverse(),
      publicBindings[0]!.exportedName,
      'missing',
    ]
    const storedQualifiedNames = logicalSymbols.map((symbol) => symbol.qualifiedName ?? '')
    const qualifiedNames = [
      ...storedQualifiedNames.reverse(),
      storedQualifiedNames[0] ?? '',
      'missing',
    ]
    const expectedLogicalIds = [...logicalSymbols]
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((symbol) => symbol.id)
    const expectedDeclarationIds = [...declarations]
      .sort((left, right) => left.logicalSymbolId.localeCompare(right.logicalSymbolId))
      .map((declaration) => declaration.declaration.symbolId)
    const expectedBindingIds = [...publicBindings]
      .sort(
        (left, right) =>
          left.surface.localeCompare(right.surface) ||
          left.exportedName.localeCompare(right.exportedName) ||
          left.space.localeCompare(right.space) ||
          (left.targetId ?? '').localeCompare(right.targetId ?? '') ||
          left.id.localeCompare(right.id),
      )
      .map((binding) => binding.id)
    const expectedStepKeys = [...steps]
      .sort(
        (left, right) =>
          left.fromId.localeCompare(right.fromId) ||
          left.toId.localeCompare(right.toId) ||
          left.kind.localeCompare(right.kind),
      )
      .map((step) => `${step.fromId}\u0000${step.toId}\u0000${step.kind}`)

    expect((await store.findLogicalSymbolsByIds(ids)).map((symbol) => symbol.id)).toEqual(
      expectedLogicalIds,
    )
    expect(
      (await store.findDeclarations(ids)).map((declaration) => declaration.declaration.symbolId),
    ).toEqual(expectedDeclarationIds)
    expect(
      (await store.findPublicBindingsByExportedNames(names)).map((binding) => binding.id),
    ).toEqual(expectedBindingIds)
    expect(
      (await store.findLogicalSymbolsByQualifiedNames(qualifiedNames)).map((symbol) => symbol.id),
    ).toEqual(expectedLogicalIds)
    expect(
      (await store.findResolutionSteps(ids)).map(
        (step) => `${step.fromId}\u0000${step.toId}\u0000${step.kind}`,
      ),
    ).toEqual(expectedStepKeys)
    expect(
      (await store.findLogicalSymbolsByIds([...ids].reverse())).map((symbol) => symbol.id),
    ).toEqual(expectedLogicalIds)
    await store.close()
  })

  it('accounts for all bind parameters when chunking ids together with relation types', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-rel-types-chunk-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'core:src/rel-chunk.ts',
      configRelativePath: 'src/rel-chunk.ts',
      language: 'typescript',
      contentHash: 'sha256:rel-chunk',
      workspace: 'core',
    })
    const target = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const sources = Array.from({ length: 905 }, (_, index) =>
      createSymbolNode({
        name: `source${String(index)}`,
        kind: SymbolKind.Function,
        filePath: file.path,
        line: index + 2,
        column: 0,
      }),
    )
    const traversalTypes = [
      RelationType.Calls,
      RelationType.Constructs,
      RelationType.UsesType,
      RelationType.Extends,
      RelationType.Implements,
      RelationType.Overrides,
    ] as const
    const relations = sources.map((source, index) =>
      createRelation({
        source: source.id,
        target: target.id,
        type: traversalTypes[index % traversalTypes.length]!,
      }),
    )
    await store.bulkLoad({ files: [file], symbols: [target, ...sources], specs: [], relations })

    // 6 types + id chunks of (900 - 6) must stay within the parameter budget
    // while still covering every requested id exactly once.
    const outgoing = await store.getOutgoingSymbolRelations(
      sources.map((s) => s.id),
      [...traversalTypes],
    )
    expect(outgoing).toHaveLength(relations.length)
    expect(new Set(outgoing.map((r) => `${r.source}\u0000${r.type}`)).size).toBe(relations.length)

    const incoming = await store.getIncomingSymbolRelations(
      [target.id, target.id],
      [...traversalTypes],
    )
    expect(incoming).toHaveLength(relations.length)
    await store.close()
  })

  it('respects the combined id and relation-type parameter budget on both directions', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-rel-boundary-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const threeTypes = [RelationType.Calls, RelationType.Extends, RelationType.Implements] as const
    // With SQLITE_BATCH_PARAMETER_LIMIT = 900 and 3 types, the safe per-query
    // id budget is exactly 897. Exercise below/at/above that boundary so a
    // statement would exceed 900 bound parameters if types were not subtracted.
    for (const symbolCount of [896, 897, 898] as const) {
      const ring = Array.from({ length: symbolCount }, (_, index) =>
        createSymbolNode({
          name: `ring-${String(symbolCount)}-${String(index)}`,
          kind: SymbolKind.Function,
          filePath: `core:src/ring-${String(symbolCount)}.ts`,
          line: index + 1,
          column: 0,
        }),
      )
      const file = createFileNode({
        path: `core:src/ring-${String(symbolCount)}.ts`,
        configRelativePath: `src/ring-${String(symbolCount)}.ts`,
        language: 'typescript',
        contentHash: `sha256:ring-${String(symbolCount)}`,
        workspace: 'core',
      })
      const relations = threeTypes.flatMap((type) =>
        ring.map((symbol, index) =>
          createRelation({
            source: symbol.id,
            target: ring[(index + 1) % ring.length]!.id,
            type,
          }),
        ),
      )
      await store.bulkLoad({ files: [file], symbols: ring, specs: [], relations })

      const outgoing = await store.getOutgoingSymbolRelations(
        ring.map((symbol) => symbol.id),
        [...threeTypes],
      )
      expect(outgoing).toHaveLength(symbolCount * threeTypes.length)
      expect(new Set(outgoing.map((r) => `${r.source}\u0000${r.type}`)).size).toBe(
        symbolCount * threeTypes.length,
      )

      const incoming = await store.getIncomingSymbolRelations(
        ring.map((symbol) => symbol.id),
        [...threeTypes],
      )
      expect(incoming).toHaveLength(symbolCount * threeTypes.length)
      expect(new Set(incoming.map((r) => `${r.target}\u0000${r.type}`)).size).toBe(
        symbolCount * threeTypes.length,
      )

      // Deterministic ordering across repeated calls with different input order.
      const outgoingAgain = await store.getOutgoingSymbolRelations(
        [...ring].reverse().map((symbol) => symbol.id),
        [...threeTypes],
      )
      expect(outgoingAgain).toEqual(outgoing)
    }
    await store.close()
  })

  it('chunks more than 900 traversal ids inside one worker request without loss', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-large-read-batch-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'core:src/wide.ts',
      configRelativePath: 'src/wide.ts',
      language: 'typescript',
      contentHash: 'sha256:wide',
      workspace: 'core',
    })
    const target = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const sources = Array.from({ length: 905 }, (_, index) =>
      createSymbolNode({
        name: `source${String(index)}`,
        kind: SymbolKind.Function,
        filePath: file.path,
        line: index + 2,
        column: 0,
      }),
    )
    const relations = sources.map((source, index) =>
      createRelation({
        source: source.id,
        target: target.id,
        type: index % 2 === 0 ? RelationType.Calls : RelationType.UsesType,
      }),
    )
    await store.bulkLoad({ files: [file], symbols: [target, ...sources], specs: [], relations })

    const requestedIds = [...sources.map((symbol) => symbol.id).reverse(), sources[0]!.id]
    const symbols = await store.getSymbolsByIds(requestedIds)
    const outgoing = await store.getOutgoingSymbolRelations(requestedIds, [
      RelationType.UsesType,
      RelationType.Calls,
    ])

    expect(symbols.map((symbol) => symbol.id)).toEqual(sources.map((symbol) => symbol.id).reverse())
    expect(outgoing).toHaveLength(relations.length)
    expect(new Set(outgoing.map((relation) => `${relation.source}:${relation.type}`)).size).toBe(
      relations.length,
    )
    expect(outgoing).toEqual(
      [...outgoing].sort(
        (left, right) =>
          left.source.localeCompare(right.source) ||
          left.type.localeCompare(right.type) ||
          left.target.localeCompare(right.target),
      ),
    )
    await store.close()
  })

  it('uses one RPC per non-empty exact node batch and no RPC for empty inputs', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-node-batch-rpc-'))
    const store = new SQLiteGraphStore(tempDir)
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    sendRequest.mockResolvedValue([])

    await expect(store.getFilesByPaths([])).resolves.toEqual([])
    await expect(store.getDocumentsByPaths([])).resolves.toEqual([])
    await expect(store.getSpecsByIds([])).resolves.toEqual([])
    expect(sendRequest).not.toHaveBeenCalled()

    await store.getFilesByPaths(['core:src/a.ts'])
    await store.getDocumentsByPaths(['root:docs/a.md'])
    await store.getSpecsByIds(['core:auth'])

    expect(sendRequest.mock.calls).toEqual([
      ['getFilesByPaths', { filePaths: ['core:src/a.ts'] }],
      ['getDocumentsByPaths', { documentPaths: ['root:docs/a.md'] }],
      ['getSpecsByIds', { specIds: ['core:auth'] }],
    ])
  })

  it('chunks more than 900 exact node batch identities inside one worker request without loss', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-node-batch-chunk-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const files = Array.from({ length: 905 }, (_, index) =>
      createFileNode({
        path: `core:src/bulk-${String(index)}.ts`,
        configRelativePath: `src/bulk-${String(index)}.ts`,
        language: 'typescript',
        contentHash: `sha256:bulk-${String(index)}`,
        workspace: 'core',
      }),
    )
    const documents = Array.from({ length: 905 }, (_, index) =>
      createDocumentNode({
        path: `root:docs/bulk-${String(index)}.md`,
        configRelativePath: `docs/bulk-${String(index)}.md`,
        contentHash: `sha256:doc-${String(index)}`,
        content: `# Doc ${String(index)}`,
        workspace: 'root',
      }),
    )
    const specs = Array.from({ length: 905 }, (_, index) =>
      createSpecNode({
        specId: `core:spec-${String(index)}`,
        path: `specs/spec-${String(index)}`,
        title: `Spec ${String(index)}`,
        contentHash: `sha256:spec-${String(index)}`,
        workspace: 'test',
      }),
    )
    await store.bulkLoad({ files, symbols: [], documents, specs, relations: [] })

    const requestedFilePaths = [...files.map((file) => file.path).reverse(), files[0]!.path]
    const foundFiles = await store.getFilesByPaths(requestedFilePaths)
    expect(foundFiles.map((file) => file.path)).toEqual(files.map((file) => file.path).reverse())

    const requestedDocumentPaths = [
      ...documents.map((document) => document.path).reverse(),
      documents[0]!.path,
    ]
    const foundDocuments = await store.getDocumentsByPaths(requestedDocumentPaths)
    expect(foundDocuments.map((document) => document.path)).toEqual(
      documents.map((document) => document.path).reverse(),
    )

    const requestedSpecIds = [...specs.map((spec) => spec.specId), 'unknown-spec']
    const foundSpecs = await store.getSpecsByIds(requestedSpecIds)
    expect(foundSpecs.map((spec) => spec.specId)).toEqual(specs.map((spec) => spec.specId))

    await store.close()
  })

  it('batches large freshness observation lookups below SQLite expression limits', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-observation-batch-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const observations = await store.getIndexedInputObservations(
      Array.from({ length: 1_500 }, (_, index) => ({
        workspace: 'core',
        resourceKind: IndexedResourceKind.File,
        resourceId: `core:src/file-${String(index)}.ts`,
      })),
    )

    expect(observations).toEqual([])
    await store.close()
  })

  it('rolls back the complete native bulk generation when persistence fails', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-bulk-rollback-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const baseline = createFileNode({
      path: 'core:src/baseline.ts',
      configRelativePath: 'src/baseline.ts',
      language: 'typescript',
      contentHash: 'sha256:baseline',
      workspace: 'core',
      content: 'export const baseline = true',
    })
    const baselineSymbol = createSymbolNode({
      name: 'baseline',
      kind: SymbolKind.Variable,
      filePath: baseline.path,
      line: 1,
      column: 13,
    })
    const baselineTarget = createSymbolNode({
      name: 'baselineTarget',
      kind: SymbolKind.Function,
      filePath: baseline.path,
      line: 2,
      column: 0,
    })
    const baselineRelation = createRelation({
      source: baselineSymbol.id,
      target: baselineTarget.id,
      type: RelationType.Calls,
    })
    await store.upsertFile(baseline, [baselineSymbol, baselineTarget], [baselineRelation])

    const staged = createFileNode({
      path: baseline.path,
      configRelativePath: baseline.configRelativePath,
      language: 'typescript',
      contentHash: 'sha256:staged',
      workspace: 'core',
      content: 'export const staged = true',
    })
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: staged.path,
      name: 'staged',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const session = store.beginBulkIndexSession()
    await session.removeFiles([baseline.path])
    await session.writeFiles([staged])
    await session.writeReferenceFacts({
      logicalSymbols: [logical, logical],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    await expect(session.commit()).rejects.toThrow()
    expect(await store.getFile(baseline.path)).toEqual(baseline)
    expect(await store.findSymbols({ filePath: baseline.path })).toEqual([
      baselineSymbol,
      baselineTarget,
    ])
    expect(
      await store.getIncomingSymbolRelations([baselineTarget.id], [RelationType.Calls]),
    ).toEqual([baselineRelation])
    await expect(
      store.searchSourceContentCandidates({
        normalizedQuery: 'baseline',
        rawTerms: ['baseline'],
        expandedTerms: [],
        limit: 10,
      }),
    ).resolves.toMatchObject({ candidates: [{ file: { path: baseline.path } }] })
    await store.close()
  })

  it('rolls back a direct file upsert when relation persistence fails after cleanup', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-upsert-rollback-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const baseline = createFileNode({
      path: 'core:src/direct-rollback.ts',
      configRelativePath: 'src/direct-rollback.ts',
      language: 'typescript',
      contentHash: 'sha256:direct-rollback-baseline',
      workspace: 'core',
      content: 'export const directRollbackBaselineNeedle = true',
    })
    const retainedFile = createFileNode({
      path: 'core:src/direct-rollback-retained.ts',
      configRelativePath: 'src/direct-rollback-retained.ts',
      language: 'typescript',
      contentHash: 'sha256:direct-rollback-retained',
      workspace: 'core',
    })
    const baselineSymbols = [
      createSymbolNode({
        name: 'directRollbackIncomingTarget',
        kind: SymbolKind.Function,
        filePath: baseline.path,
        line: 1,
        column: 0,
      }),
      createSymbolNode({
        name: 'directRollbackOutgoingSource',
        kind: SymbolKind.Function,
        filePath: baseline.path,
        line: 2,
        column: 0,
      }),
    ]
    const retainedSymbol = createSymbolNode({
      name: 'directRollbackRetained',
      kind: SymbolKind.Function,
      filePath: retainedFile.path,
      line: 1,
      column: 0,
    })
    const baselineRelations = [
      createRelation({
        source: retainedSymbol.id,
        target: baselineSymbols[0]!.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: baselineSymbols[1]!.id,
        target: retainedSymbol.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: baseline.path,
        target: retainedFile.path,
        type: RelationType.Imports,
      }),
    ]
    await store.upsertFile(retainedFile, [retainedSymbol], [])
    await store.upsertFile(baseline, baselineSymbols, baselineRelations)

    const replacement = createFileNode({
      ...baseline,
      contentHash: 'sha256:direct-rollback-replacement',
      content: 'export const directRollbackReplacementNeedle = true',
    })
    const replacementSymbols = [
      createSymbolNode({
        name: 'directRollbackReplacementSource',
        kind: SymbolKind.Function,
        filePath: replacement.path,
        line: 1,
        column: 0,
      }),
      createSymbolNode({
        name: 'directRollbackReplacementTarget',
        kind: SymbolKind.Function,
        filePath: replacement.path,
        line: 2,
        column: 0,
      }),
    ]
    const invalidMetadataRelation = createRelation({
      source: replacementSymbols[0]!.id,
      target: replacementSymbols[1]!.id,
      type: RelationType.Calls,
      metadata: { invalid: 1n },
    })

    await expect(
      store.upsertFile(replacement, replacementSymbols, [invalidMetadataRelation]),
    ).rejects.toThrow()
    expect(await store.getFile(baseline.path)).toEqual(baseline)
    expect(await store.findSymbols({ filePath: baseline.path })).toEqual(baselineSymbols)
    expect(
      await store.getIncomingSymbolRelations([baselineSymbols[0]!.id], [RelationType.Calls]),
    ).toEqual([baselineRelations[0]])
    expect(
      await store.getOutgoingSymbolRelations([baselineSymbols[1]!.id], [RelationType.Calls]),
    ).toEqual([baselineRelations[1]])
    expect(await store.getImportees(baseline.path)).toEqual([baselineRelations[2]])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'directRollbackBaselineNeedle',
          rawTerms: ['directRollbackBaselineNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates.map((candidate) => candidate.file.path),
    ).toEqual([baseline.path])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'directRollbackReplacementNeedle',
          rawTerms: ['directRollbackReplacementNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates,
    ).toEqual([])
    expect(
      await store.getOutgoingSymbolRelations([replacementSymbols[0]!.id], [RelationType.Calls]),
    ).toEqual([])
    await store.close()
  })

  it('updates source-content FTS incrementally for standalone file writes', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-source-fts-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const original = createFileNode({
      path: 'core:src/incremental.ts',
      configRelativePath: 'src/incremental.ts',
      language: 'typescript',
      contentHash: 'sha256:original',
      workspace: 'core',
      content: 'export const originalNeedle = true',
    })
    const replacement = createFileNode({
      ...original,
      contentHash: 'sha256:replacement',
      content: 'export const replacementNeedle = true',
    })
    const search = (term: string) =>
      store.searchSourceContentCandidates({
        normalizedQuery: term,
        rawTerms: [term],
        expandedTerms: [],
        limit: 10,
      })

    await store.upsertFile(original, [], [])
    expect((await search('originalNeedle')).candidates).toHaveLength(1)

    await store.upsertFile(replacement, [], [])
    expect((await search('originalNeedle')).candidates).toHaveLength(0)
    expect((await search('replacementNeedle')).candidates).toHaveLength(1)

    await store.removeFile(replacement.path)
    expect((await search('replacementNeedle')).candidates).toHaveLength(0)
    await store.close()
  })

  it('persists hierarchy relations and statistics across reopen cycles', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const file = createFileNode({
      path: 'src/types.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:abc',
      workspace: '/project',
    })
    const baseClass = createSymbolNode({
      name: 'BaseService',
      kind: SymbolKind.Class,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const childClass = createSymbolNode({
      name: 'ChildService',
      kind: SymbolKind.Class,
      filePath: file.path,
      line: 6,
      column: 0,
    })
    const contract = createSymbolNode({
      name: 'Persistable',
      kind: SymbolKind.Interface,
      filePath: file.path,
      line: 12,
      column: 0,
    })
    const baseMethod = createSymbolNode({
      name: 'save',
      kind: SymbolKind.Method,
      filePath: file.path,
      line: 2,
      column: 2,
    })
    const childMethod = createSymbolNode({
      name: 'save',
      kind: SymbolKind.Method,
      filePath: file.path,
      line: 7,
      column: 2,
    })

    const relations = [
      createRelation({ source: file.path, target: baseClass.id, type: RelationType.Defines }),
      createRelation({ source: file.path, target: childClass.id, type: RelationType.Defines }),
      createRelation({ source: file.path, target: contract.id, type: RelationType.Defines }),
      createRelation({ source: file.path, target: baseMethod.id, type: RelationType.Defines }),
      createRelation({ source: file.path, target: childMethod.id, type: RelationType.Defines }),
      createRelation({ source: childClass.id, target: baseClass.id, type: RelationType.Extends }),
      createRelation({ source: childClass.id, target: contract.id, type: RelationType.Implements }),
      createRelation({
        source: childMethod.id,
        target: baseMethod.id,
        type: RelationType.Overrides,
      }),
    ]

    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.bulkLoad({
      files: [file],
      symbols: [baseClass, childClass, contract, baseMethod, childMethod],
      specs: [],
      relations,
      vcsRef: 'hierarchy-v1',
    })
    await initialStore.close()

    const reopenedStore = new SQLiteGraphStore(tempDir)
    await reopenedStore.open()

    const extenders = await reopenedStore.getExtenders(baseClass.id)
    const implementors = await reopenedStore.getImplementors(contract.id)
    const overriders = await reopenedStore.getOverriders(baseMethod.id)
    const stats = await reopenedStore.getStatistics()

    expect(extenders).toHaveLength(1)
    expect(extenders[0]?.source).toBe(childClass.id)
    expect(implementors).toHaveLength(1)
    expect(implementors[0]?.source).toBe(childClass.id)
    expect(overriders).toHaveLength(1)
    expect(overriders[0]?.source).toBe(childMethod.id)
    expect(stats.relationCounts[RelationType.Extends]).toBe(1)
    expect(stats.relationCounts[RelationType.Implements]).toBe(1)
    expect(stats.relationCounts[RelationType.Overrides]).toBe(1)
    expect(stats.lastIndexedRef).toBe('hierarchy-v1')

    await reopenedStore.close()
  })

  it('preserves fts search results across reopen cycles without rebuilding on open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const file = createFileNode({
      path: 'src/kernel.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:kernel',
      workspace: '/project',
    })
    const symbol = createSymbolNode({
      name: 'createKernel',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
      comment: 'Create the project kernel',
    })

    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.bulkLoad({
      files: [file],
      symbols: [symbol],
      specs: [],
      relations: [],
    })
    await initialStore.close()

    const reopenedStore = new SQLiteGraphStore(tempDir)
    await reopenedStore.open()

    const hits = await reopenedStore.searchSymbols({ query: 'createKernel' })

    expect(hits).toHaveLength(1)
    expect(hits[0]?.symbol.id).toBe(symbol.id)

    await reopenedStore.close()
  })

  it('creates sqlite schema artifacts under graph/ and recreates backend state destructively', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.close()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.sqlite'))).toBe(true)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)
    writeFileSync(join(tempDir, 'graph', 'index.lock'), 'lease\n')

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.sqlite'))).toBe(false)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)
    expect(existsSync(join(tempDir, 'graph', 'index.lock'))).toBe(true)
  })

  it('retries a locked WAL file while recreating the store', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.close()
    const walPath = join(tempDir, 'graph', 'code-graph.sqlite-wal')
    writeFileSync(walPath, 'locked')
    walLock.failures = 2

    await store.recreate()

    expect(walLock.failures).toBe(0)
    expect(existsSync(walPath)).toBe(false)
    expect(existsSync(join(tempDir, 'graph', 'index.lock'))).toBe(false)
  })

  it('surfaces the original lock error after five WAL failures', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.close()
    const walPath = join(tempDir, 'graph', 'code-graph.sqlite-wal')
    writeFileSync(walPath, 'locked')
    writeFileSync(join(tempDir, 'graph', 'index.lock'), 'lease\n')
    walLock.failures = 5

    await expect(store.recreate()).rejects.toMatchObject({ code: 'EBUSY' })

    expect(existsSync(walPath)).toBe(true)
    expect(existsSync(join(tempDir, 'graph', 'index.lock'))).toBe(true)
  })

  it('rejects recreation on an open store without closing or clearing it', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await expect(store.recreate()).rejects.toBeInstanceOf(GraphStoreRecreateRequiresClosedError)

    await expect(store.getStatistics()).resolves.toEqual(
      expect.objectContaining({
        fileCount: 0,
        documentCount: 0,
        symbolCount: 0,
        specCount: 0,
      }),
    )

    await store.close()
  })

  it('configures sqlite pragmas for concurrent reads and tolerant lock waits', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.close()

    const db = new Database(join(tempDir, 'graph', 'code-graph.sqlite'), { readonly: true })

    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
      expect(db.pragma('synchronous', { simple: true })).toBe(1)
    } finally {
      db.close()
    }
  })

  it('declares sqlite schema version and fts-backed ddl', () => {
    expect(SQLITE_SCHEMA_VERSION).toBe(12)
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS files')
    expect(SQLITE_SCHEMA_DDL).toContain('content TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS documents')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS spec_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS document_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS logical_declarations')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS public_bindings')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS local_bindings')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS resolution_steps')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS index_coverage')
    expect(SQLITE_SCHEMA_DDL).toContain('selection_start_line INTEGER NOT NULL')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE INDEX IF NOT EXISTS idx_files_workspace')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE INDEX IF NOT EXISTS idx_symbols_kind_file_path')
    expect(SQLITE_SCHEMA_DDL).toContain('member_kind TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('member_dispatch TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('member_accessor TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('native_kind TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('qualified_name TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain(
      'CREATE INDEX IF NOT EXISTS idx_logical_symbols_qualified_name ON logical_symbols(qualified_name)',
    )
    expect(SQLITE_SCHEMA_DDL).not.toContain('member_form')
    expect(SQLITE_SCHEMA_DDL).toContain(
      'CREATE TABLE IF NOT EXISTS public_bindings (\n  id TEXT PRIMARY KEY,\n  surface TEXT NOT NULL,\n  exported_name TEXT NOT NULL,\n  space TEXT NOT NULL,\n  target_id TEXT\n);',
    )
    expect(SQLITE_SCHEMA_DDL).toContain(
      'CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(\n  id UNINDEXED,\n  search_text,\n  comment,',
    )
  })

  it.each(['10', '11'])('rejects schema version %s without altering the table', async (version) => {
    const dir = mkdtempSync(join(tmpdir(), `code-graph-sqlite-schema-v${version}-`))
    const databasePath = join(dir, 'graph', 'code-graph.sqlite')
    const initialStore = new SQLiteGraphStore(dir)
    await initialStore.open()
    await initialStore.close()
    const db = new Database(databasePath)
    const before = db.prepare('PRAGMA table_info(logical_symbols)').all()
    db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(version, 'schemaVersion')
    db.close()

    const incompatibleStore = new SQLiteGraphStore(dir)
    const openError = await incompatibleStore.open().catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(GraphStorageRecoveryRequiredError)
    if (!(openError instanceof Error)) throw openError
    expect(openError.message).toContain(
      `SQLite graph storage schema ${version} is incompatible with expected 12`,
    )

    const afterDb = new Database(databasePath, { readonly: true })
    try {
      expect(afterDb.prepare('PRAGMA table_info(logical_symbols)').all()).toEqual(before)
      expect(afterDb.prepare("SELECT value FROM meta WHERE key = 'schemaVersion'").get()).toEqual({
        value: version,
      })
    } finally {
      afterDb.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reopens schema 12 without rebuilding stored member rows', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-schema-v11-'))
    const owner = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'EditChange',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const instance = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: 'method', dispatch: 'instance' },
    })
    const staticGetter = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: 'property', dispatch: 'static', accessor: 'get' },
    })
    const topLevel = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'top',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const named = assignQualifiedNames([owner, instance, staticGetter, topLevel])
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.replaceReferenceFacts({
      logicalSymbols: named,
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    await store.close()

    const reopened = new SQLiteGraphStore(tempDir)
    await reopened.open()
    const lookup = {
      workspace: 'core',
      surface: 'core:src/edit.ts' as string | undefined,
      name: 'execute',
      space: SymbolSpace.Value as string | undefined,
      ownerId: owner.id as string | undefined,
      memberKind: undefined as string | undefined,
      memberDispatch: 'instance' as string | undefined,
      memberAccessor: undefined as string | undefined,
      nativeKind: undefined as string | undefined,
    }
    await expect(reopened.findLogicalSymbols([lookup])).resolves.toEqual([
      expect.objectContaining({ id: instance.id, qualifiedName: 'EditChange.execute' }),
    ])
    await expect(
      reopened.findLogicalSymbolsByQualifiedNames(['EditChange.execute']),
    ).resolves.toHaveLength(2)
    await expect(
      reopened.findLogicalSymbols([{ ...lookup, memberDispatch: 'static', memberAccessor: 'get' }]),
    ).resolves.toEqual([
      expect.objectContaining({ id: staticGetter.id, qualifiedName: 'EditChange.execute' }),
    ])
    await expect(reopened.findLogicalSymbols([{ ...lookup, name: instance.id }])).resolves.toEqual(
      [],
    )
    await reopened.close()

    const db = new Database(join(tempDir, 'graph', 'code-graph.sqlite'), { readonly: true })
    try {
      const columns = (
        db.prepare('PRAGMA table_info(logical_symbols)').all() as Array<{ name: string }>
      ).map((column) => column.name)
      expect(columns).toEqual(
        expect.arrayContaining([
          'member_kind',
          'member_dispatch',
          'member_accessor',
          'native_kind',
          'qualified_name',
        ]),
      )
      expect(columns).not.toContain('member_form')
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>
      expect(indexes.map((index) => index.name)).toContain('idx_logical_symbols_qualified_name')
      const top = db
        .prepare('SELECT member_kind, member_dispatch FROM logical_symbols WHERE name = ?')
        .get('top')
      expect(top).toEqual({ member_kind: null, member_dispatch: null })
    } finally {
      db.close()
    }
  })

  it('creates the v10 workspace and kind indexes and rejects a version-9 store', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-schema-v10-'))
    const databasePath = join(tempDir, 'graph', 'code-graph.sqlite')
    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.close()

    const db = new Database(databasePath)
    try {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
        .all() as Array<{ name: string }>
      expect(indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining(['idx_files_workspace', 'idx_symbols_kind_file_path']),
      )
      db.prepare("UPDATE meta SET value = '9' WHERE key = 'schemaVersion'").run()
    } finally {
      db.close()
    }

    const incompatibleStore = new SQLiteGraphStore(tempDir)
    await expect(incompatibleStore.open()).rejects.toThrow(
      'SQLite graph storage schema 9 is incompatible with expected 12',
    )
    expect(existsSync(databasePath)).toBe(true)
  })

  it('rejects an incompatible prior schema without recreating derived storage', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const graphDir = join(tempDir, 'graph')
    const databasePath = join(graphDir, 'code-graph.sqlite')
    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.close()

    const db = new Database(databasePath)
    db.prepare("UPDATE meta SET value = '9' WHERE key = 'schemaVersion'").run()
    db.close()

    const incompatibleStore = new SQLiteGraphStore(tempDir)
    await expect(incompatibleStore.open()).rejects.toThrow(
      'SQLite graph storage schema 9 is incompatible with expected 12',
    )
    expect(existsSync(databasePath)).toBe(true)
  })

  it('classifies invalid SQLite bytes as recoverable corruption without mutating the closed store', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-corrupt-open-'))
    const graphDir = join(tempDir, 'graph')
    const databasePath = join(graphDir, 'code-graph.sqlite')
    const epochPath = join(graphDir, 'storage.epoch')
    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.close()

    const invalidDatabaseBytes = Buffer.from('this is not a SQLite database')
    writeFileSync(databasePath, invalidDatabaseBytes)
    const epochBeforeFailure = readFileSync(epochPath)

    const failedStore = new SQLiteGraphStore(tempDir)
    const openError = await failedStore.open().catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(GraphStorageRecoveryRequiredError)
    expect(openError).toMatchObject({
      code: 'GRAPH_STORAGE_RECOVERY_REQUIRED',
      reason: 'CORRUPT',
    })
    expect(failedStore.isOpen).toBe(false)
    expect(readFileSync(databasePath)).toEqual(invalidDatabaseBytes)
    expect(readFileSync(epochPath)).toEqual(epochBeforeFailure)

    await failedStore.recreate()
    expect(existsSync(databasePath)).toBe(false)
    await failedStore.open()
    await expect(failedStore.getStatistics()).resolves.toEqual(
      expect.objectContaining({ fileCount: 0, symbolCount: 0 }),
    )
    await failedStore.close()
  })

  it(
    'propagates ordinary runtime open failures without recreating or rotating storage',
    { timeout: 10_000 },
    async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-unrecoverable-open-'))
      const graphDir = join(tempDir, 'graph')
      const databasePath = join(graphDir, 'code-graph.sqlite')
      const epochPath = join(graphDir, 'storage.epoch')
      const initialStore = new SQLiteGraphStore(tempDir)
      await initialStore.open()
      await initialStore.close()

      const databaseBeforeFailure = readFileSync(databasePath)
      const epochBeforeFailure = readFileSync(epochPath)
      const failedStore = new SQLiteGraphStore(tempDir, {
        runtime: { modulePath: join(tempDir, 'not-a-sqlite-module.js') },
      })

      await expect(failedStore.open()).rejects.not.toBeInstanceOf(GraphStorageRecoveryRequiredError)
      expect(failedStore.isOpen).toBe(false)
      expect(readFileSync(databasePath)).toEqual(databaseBeforeFailure)
      expect(readFileSync(epochPath)).toEqual(epochBeforeFailure)
      await failedStore.close()
    },
  )

  it('does not treat a drive letter as a workspace name', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'C:/repo/src/a.ts',
      configRelativePath: 'src/a.ts',
      language: 'typescript',
      contentHash: 'sha256:drive',
      workspace: 'repo',
    })
    const symbol = createSymbolNode({
      name: 'DriveLetterSymbol',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    await store.upsertFile(file, [symbol], [])

    await expect(
      store.searchSymbols({ query: 'DriveLetterSymbol', workspace: 'C' }),
    ).resolves.toEqual([])
    await expect(store.searchSymbols({ query: 'DriveLetterSymbol' })).resolves.toMatchObject([
      { symbol: { id: symbol.id } },
    ])

    await store.close()
  })

  it('rebuilds symbol FTS from logical and public binding identities', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'code-graph:src/alpha.ts',
      configRelativePath: 'src/alpha.ts',
      language: 'typescript',
      contentHash: 'sha256:alpha',
      workspace: 'code-graph',
    })
    const symbol = createSymbolNode({
      name: 'AlphaImplementation',
      kind: SymbolKind.Class,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const logical = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'code-graph:src/alpha.ts',
      name: 'Alpha',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    await store.upsertFile(file, [symbol], [])
    await store.replaceReferenceFacts({
      logicalSymbols: [logical],
      declarations: [
        {
          logicalSymbolId: logical.id,
          declaration: {
            logicalId: logical.id,
            symbolId: symbol.id,
            location: { filePath: file.path, line: 1, column: 0, endLine: 1, endColumn: 1 },
            kind: SymbolKind.Class,
          },
        },
      ],
      publicBindings: [
        createPublicBinding({
          surface: 'code-graph',
          exportedName: 'PublicAlpha',
          space: SymbolSpace.Value,
          targetId: logical.id,
        }),
      ],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    expect(
      (await store.searchSymbols({ query: 'PublicAlpha' })).map((hit) => hit.symbol.id),
    ).toEqual([symbol.id])
    await store.close()
  })

  it('extracts symbol snippets using a line-budget windowing algorithm', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const content = [
      '// header',
      '',
      'function top() {}',
      '',
      '/**',
      ' * Target function',
      ' */',
      'export function target() {',
      '  // line 1',
      '',
      '  // line 2',
      '  return true',
      '}',
      '',
      'function bottom() {}',
    ].join('\n')

    const file = createFileNode({
      path: 'src/snippet.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:snippet',
      workspace: 'core',
      content,
    })
    const symbol = createSymbolNode({
      name: 'target',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 8, // 'export function target() {'
      column: 0,
    })

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.upsertFile(file, [symbol], [])
    await store.rebuildFtsIndexes()

    const results = await store.searchSymbols({ query: 'target' })
    expect(results).toHaveLength(1)

    // Algorithm budget: 2 non-blank lines up, 2 non-blank lines down
    // Up: line 7 (/**), line 6 (Target function) -> non-blank 2 reached. Line 5 (/**) is blank-ish? No, but let's check exact match.
    // Up from 8:
    // 7: /** (non-blank 1)
    // 6:  * Target function (non-blank 2) -> STOP
    // Down from 8:
    // 9:   // line 1 (non-blank 1)
    // 10: (blank)
    // 11:   // line 2 (non-blank 2) -> STOP

    const snippet = results[0]!.snippet
    const lines = snippet.split('\n')

    expect(lines).toContain('export function target() {')
    expect(lines).toContain(' * Target function')
    expect(lines).toContain('  // line 2')
    expect(lines[0]).toBe(' * Target function')
    expect(lines[lines.length - 1]).toBe('  // line 2')

    await store.close()
  })

  it('pushes exact findSymbols filters into SQL while preserving wildcard semantics', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const fileOne = createFileNode({
      path: 'src/alpha.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:alpha',
      workspace: '/project',
    })
    const fileTwo = createFileNode({
      path: 'src/beta.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:beta',
      workspace: '/project',
    })
    const alpha = createSymbolNode({
      name: 'AlphaService',
      kind: SymbolKind.Class,
      filePath: fileOne.path,
      line: 1,
      column: 0,
      comment: 'Primary alpha service',
    })
    const beta = createSymbolNode({
      name: 'betaService',
      kind: SymbolKind.Class,
      filePath: fileTwo.path,
      line: 1,
      column: 0,
      comment: 'Secondary beta service',
    })

    await store.bulkLoad({
      files: [fileOne, fileTwo],
      symbols: [alpha, beta],
      specs: [],
      relations: [],
    })

    const exactFile = await store.findSymbols({ filePath: 'src/alpha.ts' })
    const wildcardName = await store.findSymbols({ name: '*Service' })
    const exactNameCaseInsensitive = await store.findSymbols({ name: 'alphaservice' })
    const exactNameCaseSensitive = await store.findSymbols({
      name: 'alphaservice',
      caseSensitive: true,
    })
    const commentMatch = await store.findSymbols({ comment: 'primary alpha' })

    expect(exactFile.map((symbol) => symbol.id)).toEqual([alpha.id])
    expect(wildcardName.map((symbol) => symbol.id).sort()).toEqual([alpha.id, beta.id].sort())
    expect(exactNameCaseInsensitive.map((symbol) => symbol.id)).toEqual([alpha.id])
    expect(exactNameCaseSensitive).toHaveLength(0)
    expect(commentMatch.map((symbol) => symbol.id)).toEqual([alpha.id])

    await store.close()
  })

  it('chunks findSymbols file-path filters within the SQLite parameter budget', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-find-symbols-chunk-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const files = Array.from({ length: 901 }, (_, index) =>
      createFileNode({
        path: `core:src/chunk-${String(index)}.ts`,
        configRelativePath: `src/chunk-${String(index)}.ts`,
        language: 'typescript',
        contentHash: `sha256:chunk-${String(index)}`,
        workspace: 'core',
      }),
    )
    const symbols = files.map((file, index) =>
      createSymbolNode({
        name: 'Chunked',
        kind: SymbolKind.Function,
        filePath: file.path,
        line: index + 1,
        column: 0,
      }),
    )
    const sameFileSymbols = [
      createSymbolNode({
        name: 'Chunked',
        kind: SymbolKind.Function,
        filePath: files[0]!.path,
        line: 2,
        column: 0,
      }),
      createSymbolNode({
        name: 'Chunked',
        kind: SymbolKind.Function,
        filePath: files[0]!.path,
        line: 1,
        column: 2,
      }),
      createSymbolNode({
        name: 'Chunked',
        kind: SymbolKind.Function,
        filePath: files[0]!.path,
        line: 1,
        column: 1,
      }),
    ]
    const allSymbols = [...symbols, ...sameFileSymbols]
    await store.bulkLoad({ files, symbols: allSymbols, specs: [], relations: [] })

    const results = await store.findSymbols({
      filePaths: [...files.map((file) => file.path), files[0]!.path, 'core:src/missing.ts'],
      name: 'chunked',
    })

    const expectedIds = [...allSymbols]
      .sort(
        (left, right) =>
          left.filePath.localeCompare(right.filePath) ||
          left.line - right.line ||
          left.column - right.column ||
          left.id.localeCompare(right.id),
      )
      .map((symbol) => symbol.id)
    expect(results.map((symbol) => symbol.id)).toEqual(expectedIds)
    expect(
      (
        await store.findSymbols({
          filePaths: [...files].reverse().map((file) => file.path),
          name: 'chunked',
        })
      ).map((symbol) => symbol.id),
    ).toEqual(results.map((symbol) => symbol.id))
    await store.close()
  })

  it('expands specd/code-shaped queries before applying sqlite ranking', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const file = createFileNode({
      path: 'core:src/archive.ts',
      configRelativePath: 'packages/core/src/archive.ts',
      language: 'typescript',
      contentHash: 'sha256:archive',
      workspace: 'core',
      content: ['export function ArchiveChange() {}', 'export function fallback() {}'].join('\n'),
    })
    const declared = createSymbolNode({
      name: 'ArchiveChange',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const commentOnly = createSymbolNode({
      name: 'Fallback',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 2,
      column: 0,
      comment: 'Archive Change fallback handler',
    })
    const strongSpec = createSpecNode({
      specId: 'core:change',
      path: 'change',
      title: 'Change',
      description: 'Strong spec id match',
      contentHash: 'sha256:spec-strong',
      content: 'Change orchestration',
      workspace: 'core',
    })
    const weakSpec = createSpecNode({
      specId: 'core:scorekeeper',
      path: 'scorekeeper',
      title: 'Scorekeeper',
      description: 'Contains core:change only in content',
      contentHash: 'sha256:spec-weak',
      content: 'core:change core:change core:change',
      workspace: 'core',
    })
    const strongDocument = createDocumentNode({
      path: 'core:docs/architecture.md',
      configRelativePath: 'docs/architecture.md',
      contentHash: 'sha256:doc-strong',
      content: 'Architecture document',
      workspace: 'core',
    })
    const weakDocument = createDocumentNode({
      path: 'core:docs/notes.md',
      configRelativePath: 'docs/notes.md',
      contentHash: 'sha256:doc-weak',
      content: 'docs/architecture.md docs/architecture.md docs/architecture.md',
      workspace: 'core',
    })

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [file],
      documents: [strongDocument, weakDocument],
      symbols: [declared, commentOnly],
      specs: [strongSpec, weakSpec],
      relations: [],
    })

    const symbolHits = await store.searchSymbols({ query: 'ArchiveChange' })
    const specHits = await store.searchSpecs({ query: 'core:change' })
    const documentHits = await store.searchDocuments({ query: 'docs/architecture.md' })

    expect(symbolHits[0]?.symbol.id).toBe(declared.id)
    expect(specHits[0]?.spec.specId).toBe(strongSpec.specId)
    expect(documentHits[0]?.document.path).toBe(strongDocument.path)

    await store.close()
  })

  it('discovers exact identities when the FTS indexes are unavailable', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const file = createFileNode({
      path: 'core:src/identity.ts',
      configRelativePath: 'packages/core/src/identity.ts',
      language: 'typescript',
      contentHash: 'sha256:identity-file',
      workspace: 'core',
      content: 'export function findIdentity() {}',
    })
    const symbol = createSymbolNode({
      name: 'findIdentity',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const spec = createSpecNode({
      specId: 'core:identity',
      path: 'identity',
      title: 'Identity',
      description: 'Identity lookup',
      contentHash: 'sha256:identity-spec',
      content: 'Defines identity lookup behavior.',
      workspace: 'core',
    })
    const document = createDocumentNode({
      path: 'root:docs/identity.md',
      configRelativePath: 'docs/identity.md',
      contentHash: 'sha256:identity-document',
      content: '# Identity',
      workspace: 'root',
    })

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [file],
      documents: [document],
      symbols: [symbol],
      specs: [spec],
      relations: [],
    })
    await store.close()

    const database = new Database(join(tempDir, 'graph', 'code-graph.sqlite'))
    database.exec('DELETE FROM symbol_fts; DELETE FROM spec_fts; DELETE FROM document_fts;')
    database.close()

    await store.open()
    await expect(store.searchSymbols({ query: symbol.name })).resolves.toMatchObject([
      { symbol: { id: symbol.id } },
    ])
    await expect(store.searchSpecs({ query: spec.specId })).resolves.toMatchObject([
      { spec: { specId: spec.specId } },
    ])
    await expect(
      store.searchDocuments({ query: document.configRelativePath }),
    ).resolves.toMatchObject([{ document: { path: document.path } }])
    await store.close()
  })

  it('keeps exact-prefix-suffix-substring ordering for sqlite symbol ranking', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const file = createFileNode({
      path: 'core:src/repository.ts',
      configRelativePath: 'packages/core/src/repository.ts',
      language: 'typescript',
      contentHash: 'sha256:token-order',
      workspace: 'core',
      content: [
        'export function change() {}',
        'export function changeLog() {}',
        'export function prechange() {}',
        'export function exchangeRate() {}',
      ].join('\n'),
    })
    const exact = createSymbolNode({
      name: 'change',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const prefix = createSymbolNode({
      name: 'changeLog',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 2,
      column: 0,
    })
    const suffix = createSymbolNode({
      name: 'prechange',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 3,
      column: 0,
    })
    const substring = createSymbolNode({
      name: 'exchangeRate',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 4,
      column: 0,
    })

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [file],
      symbols: [exact, prefix, suffix, substring],
      specs: [],
      relations: [],
    })

    const hits = await store.searchSymbols({ query: 'change' })
    expect(hits.slice(0, 4).map((hit) => hit.symbol.id)).toEqual([
      exact.id,
      prefix.id,
      suffix.id,
      substring.id,
    ])

    await store.close()
  })

  it('ignores relations whose endpoints do not exist in the persisted graph', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const sourceFile = createFileNode({
      path: 'src/consumer.ts',
      configRelativePath: '',
      language: 'typescript',
      contentHash: 'sha256:consumer',
      workspace: '/project',
    })
    const caller = createSymbolNode({
      name: 'caller',
      kind: SymbolKind.Function,
      filePath: sourceFile.path,
      line: 1,
      column: 0,
    })

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [sourceFile],
      symbols: [caller],
      specs: [],
      relations: [
        createRelation({
          source: sourceFile.path,
          target: 'src/missing.ts',
          type: RelationType.Imports,
        }),
        createRelation({
          source: caller.id,
          target: 'missing-symbol',
          type: RelationType.Calls,
        }),
      ],
    })

    const importees = await store.getImportees(sourceFile.path)
    const callees = await store.getCallees(caller.id)
    const stats = await store.getStatistics()

    expect(importees).toHaveLength(0)
    expect(callees).toHaveLength(0)
    expect(stats.relationCounts[RelationType.Imports]).toBe(0)
    expect(stats.relationCounts[RelationType.Calls]).toBe(0)

    await store.close()
  })

  describe('FTS sanitization', () => {
    it('returns matching symbol for hyphenated query without crashing', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
      const file = createFileNode({
        path: 'src/artifacts.ts',
        configRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: 'core',
      })
      const symbol = createSymbolNode({
        name: 'pending-parent-artifact-review',
        kind: SymbolKind.Function,
        filePath: file.path,
        line: 1,
        column: 0,
      })

      const store = new SQLiteGraphStore(tempDir)
      await store.open()
      await store.upsertFile(file, [symbol], [])
      await store.rebuildFtsIndexes()
      const results = await store.searchSymbols({ query: 'pending-parent-artifact-review' })
      expect(results).toHaveLength(1)
      expect(results[0]!.symbol.name).toBe('pending-parent-artifact-review')
      await store.close()
    })

    it('treats FTS operators as literal text and returns matching symbols', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
      const file = createFileNode({
        path: 'src/logic.ts',
        configRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: 'core',
      })
      const symNot = createSymbolNode({
        name: 'assertNot',
        kind: SymbolKind.Function,
        filePath: file.path,
        line: 1,
        column: 0,
        comment: 'checks NOT condition',
      })
      const symUnrelated = createSymbolNode({
        name: 'fetchData',
        kind: SymbolKind.Function,
        filePath: file.path,
        line: 5,
        column: 0,
      })

      const store = new SQLiteGraphStore(tempDir)
      await store.open()
      await store.upsertFile(file, [symNot, symUnrelated], [])
      await store.rebuildFtsIndexes()
      const results = await store.searchSymbols({ query: 'NOT' })
      const names = results.map((r) => r.symbol.name)
      expect(names).toContain('assertNot')
      expect(names).not.toContain('fetchData')
      await store.close()
    })

    it('uses OR logic for multi-token discovery', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
      const file1 = createFileNode({
        path: 'src/status.ts',
        configRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:1',
        workspace: 'core',
      })
      const sym1 = createSymbolNode({
        name: 'effectiveStatus',
        kind: SymbolKind.Method,
        filePath: file1.path,
        line: 1,
        column: 0,
      })
      const file2 = createFileNode({
        path: 'src/lifecycle.ts',
        configRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:2',
        workspace: 'core',
      })
      const sym2 = createSymbolNode({
        name: 'findBlockingParent',
        kind: SymbolKind.Method,
        filePath: file2.path,
        line: 1,
        column: 0,
      })

      const store = new SQLiteGraphStore(tempDir)
      await store.open()
      await store.upsertFile(file1, [sym1], [])
      await store.upsertFile(file2, [sym2], [])
      await store.rebuildFtsIndexes()

      // Combined search for terms in different files
      const results = await store.searchSymbols({ query: 'effectiveStatus findBlockingParent' })
      const ids = results.map((r) => r.symbol.id)

      expect(ids).toContain(sym1.id)
      expect(ids).toContain(sym2.id)
      expect(results).toHaveLength(2)

      await store.close()
    })

    it('ranks results matching more tokens higher (BM25 precision)', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
      const file = createFileNode({
        path: 'src/relevance.ts',
        configRelativePath: '',
        language: 'typescript',
        contentHash: 'sha256:3',
        workspace: 'core',
      })
      const partialMatch = createSymbolNode({
        name: 'getStatus',
        kind: SymbolKind.Method,
        filePath: file.path,
        line: 1,
        column: 0,
      })
      const fullMatch = createSymbolNode({
        name: 'getEffectiveStatus',
        kind: SymbolKind.Method,
        filePath: file.path,
        line: 5,
        column: 0,
      })

      const store = new SQLiteGraphStore(tempDir)
      await store.open()
      await store.upsertFile(file, [partialMatch, fullMatch], [])
      await store.rebuildFtsIndexes()

      const results = await store.searchSymbols({ query: 'effective status' })

      // Both match "status" (expanded from getStatus/getEffectiveStatus)
      // but "getEffectiveStatus" also matches "effective"
      expect(results[0]!.symbol.name).toBe('getEffectiveStatus')
      expect(results[1]!.symbol.name).toBe('getStatus')
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score)

      await store.close()
    })

    it('handles empty query gracefully', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
      const store = new SQLiteGraphStore(tempDir)
      await store.open()
      const results = await store.searchSymbols({ query: '' })
      expect(results).toEqual([])
      await store.close()
    })
  })

  describe('IndexCoverage queries', () => {
    it('differentiates findIndexCoverage and getAllIndexCoverage correctly', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-coverage-test-'))
      const store = new SQLiteGraphStore(tempDir)
      await store.open()

      const session = store.beginBulkIndexSession()
      await session.writeFiles([
        createFileNode({
          path: 'core:src/a.ts',
          configRelativePath: 'src/a.ts',
          language: 'typescript',
          contentHash: 'sha256:a',
          workspace: 'core',
        }),
        createFileNode({
          path: 'core:src/b.ts',
          configRelativePath: 'src/b.ts',
          language: 'typescript',
          contentHash: 'sha256:b',
          workspace: 'core',
        }),
      ])
      await session.writeReferenceFacts({
        logicalSymbols: [],
        declarations: [],
        publicBindings: [],
        localBindings: [],
        steps: [],
        coverage: [
          {
            filePath: 'core:src/a.ts',
            contentHash: 'sha256:a',
            status: 'indexed',
            reason: undefined,
            capabilities: ['typescript'],
          },
          {
            filePath: 'core:src/b.ts',
            contentHash: 'sha256:b',
            status: 'indexed',
            reason: undefined,
            capabilities: ['typescript'],
          },
        ],
      })
      await session.commit()

      const allCoverage = await store.getAllIndexCoverage()
      expect(allCoverage).toHaveLength(2)
      expect(allCoverage.map((c) => c.filePath)).toEqual(['core:src/a.ts', 'core:src/b.ts'])

      const singleCoverage = await store.findIndexCoverage(['core:src/a.ts'])
      expect(singleCoverage).toHaveLength(1)
      expect(singleCoverage[0]?.filePath).toBe('core:src/a.ts')

      const emptyCoverage = await store.findIndexCoverage([])
      expect(emptyCoverage).toEqual([])

      await store.close()
    })
  })

  it('removes a file with more symbols than the former variable limit allowed', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-large-file-remove-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'core:src/generated.ts',
      configRelativePath: 'src/generated.ts',
      language: 'typescript',
      contentHash: 'sha256:generated',
      workspace: 'core',
      content: 'export const removedLargeFileNeedle = true',
    })
    const retainedFile = createFileNode({
      path: 'core:src/retained-remove.ts',
      configRelativePath: 'src/retained-remove.ts',
      language: 'typescript',
      contentHash: 'sha256:retained-remove',
      workspace: 'core',
    })
    const retainedSymbol = createSymbolNode({
      name: 'retainedRemove',
      kind: SymbolKind.Function,
      filePath: retainedFile.path,
      line: 1,
      column: 0,
    })
    const symbols = Array.from({ length: 16_384 }, (_, index) =>
      createSymbolNode({
        name: `generated${String(index)}`,
        kind: SymbolKind.Variable,
        filePath: file.path,
        line: index + 1,
        column: 0,
      }),
    )
    const relations = [
      createRelation({
        source: retainedSymbol.id,
        target: symbols[0]!.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: symbols[1]!.id,
        target: retainedSymbol.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: file.path,
        target: retainedFile.path,
        type: RelationType.Imports,
      }),
    ]
    await store.upsertFile(retainedFile, [retainedSymbol], [])
    await store.upsertFile(file, symbols, relations)

    await expect(store.removeFile(file.path)).resolves.toBeUndefined()
    expect(await store.getFile(file.path)).toBeUndefined()
    expect(await store.findSymbols({ filePath: file.path })).toEqual([])
    expect(await store.getIncomingSymbolRelations([symbols[0]!.id], [RelationType.Calls])).toEqual(
      [],
    )
    expect(await store.getOutgoingSymbolRelations([symbols[1]!.id], [RelationType.Calls])).toEqual(
      [],
    )
    expect(await store.getImportees(file.path)).toEqual([])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'removedLargeFileNeedle',
          rawTerms: ['removedLargeFileNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates,
    ).toEqual([])
    expect(await store.getFile(retainedFile.path)).toEqual(retainedFile)
    await store.close()
  })

  it('replaces a file with more symbols than the former variable limit allowed', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-large-file-upsert-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'core:src/generated-replace.ts',
      configRelativePath: 'src/generated-replace.ts',
      language: 'typescript',
      contentHash: 'sha256:generated-before',
      workspace: 'core',
      content: 'export const replacedLargeFileNeedle = true',
    })
    const retainedFile = createFileNode({
      path: 'core:src/retained-replace.ts',
      configRelativePath: 'src/retained-replace.ts',
      language: 'typescript',
      contentHash: 'sha256:retained-replace',
      workspace: 'core',
    })
    const retainedSymbol = createSymbolNode({
      name: 'retainedReplace',
      kind: SymbolKind.Function,
      filePath: retainedFile.path,
      line: 1,
      column: 0,
    })
    const oldSymbols = Array.from({ length: 16_384 }, (_, index) =>
      createSymbolNode({
        name: `old${String(index)}`,
        kind: SymbolKind.Variable,
        filePath: file.path,
        line: index + 1,
        column: 0,
      }),
    )
    const replacement = createFileNode({
      path: file.path,
      configRelativePath: file.configRelativePath,
      language: file.language,
      contentHash: 'sha256:generated-after',
      workspace: file.workspace,
      content: 'export const replacementLargeFileNeedle = true',
    })
    const replacementSymbol = createSymbolNode({
      name: 'replacement',
      kind: SymbolKind.Variable,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const oldRelations = [
      createRelation({
        source: retainedSymbol.id,
        target: oldSymbols[0]!.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: oldSymbols[1]!.id,
        target: retainedSymbol.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: file.path,
        target: retainedFile.path,
        type: RelationType.Imports,
      }),
    ]
    await store.upsertFile(retainedFile, [retainedSymbol], [])
    await store.upsertFile(file, oldSymbols, oldRelations)

    await expect(store.upsertFile(replacement, [replacementSymbol], [])).resolves.toBeUndefined()
    expect(await store.getFile(file.path)).toEqual(replacement)
    expect(await store.findSymbols({ filePath: file.path })).toEqual([replacementSymbol])
    expect(
      await store.getIncomingSymbolRelations([oldSymbols[0]!.id], [RelationType.Calls]),
    ).toEqual([])
    expect(
      await store.getOutgoingSymbolRelations([oldSymbols[1]!.id], [RelationType.Calls]),
    ).toEqual([])
    expect(await store.getImportees(file.path)).toEqual([])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'replacedLargeFileNeedle',
          rawTerms: ['replacedLargeFileNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates,
    ).toEqual([])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'replacementLargeFileNeedle',
          rawTerms: ['replacementLargeFileNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates.map((candidate) => candidate.file.path),
    ).toEqual([file.path])
    await store.close()
  })

  it('replaces a large file during bulk commit without exceeding SQLite variables', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-large-file-bulk-replace-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    const file = createFileNode({
      path: 'core:src/generated-bulk.ts',
      configRelativePath: 'src/generated-bulk.ts',
      language: 'typescript',
      contentHash: 'sha256:generated-bulk',
      workspace: 'core',
      content: 'export const replacedBulkLargeFileNeedle = true',
    })
    const retainedFile = createFileNode({
      path: 'core:src/retained-bulk.ts',
      configRelativePath: 'src/retained-bulk.ts',
      language: 'typescript',
      contentHash: 'sha256:retained-bulk',
      workspace: 'core',
    })
    const retainedSymbol = createSymbolNode({
      name: 'retainedBulk',
      kind: SymbolKind.Function,
      filePath: retainedFile.path,
      line: 1,
      column: 0,
    })
    const symbols = Array.from({ length: 16_384 }, (_, index) =>
      createSymbolNode({
        name: `bulk${String(index)}`,
        kind: SymbolKind.Variable,
        filePath: file.path,
        line: index + 1,
        column: 0,
      }),
    )
    const oldRelations = [
      createRelation({
        source: retainedSymbol.id,
        target: symbols[0]!.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: symbols[1]!.id,
        target: retainedSymbol.id,
        type: RelationType.Calls,
      }),
      createRelation({
        source: file.path,
        target: retainedFile.path,
        type: RelationType.Imports,
      }),
    ]
    await store.upsertFile(retainedFile, [retainedSymbol], [])
    await store.upsertFile(file, symbols, oldRelations)
    const replacement = createFileNode({
      path: file.path,
      configRelativePath: file.configRelativePath,
      language: file.language,
      contentHash: 'sha256:generated-bulk-replaced',
      workspace: file.workspace,
      content: 'export const replacementBulkLargeFileNeedle = true',
    })
    const replacementSymbol = createSymbolNode({
      name: 'bulkReplacement',
      kind: SymbolKind.Variable,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const session = store.beginBulkIndexSession()
    await session.removeFiles([file.path])
    await session.writeFiles([replacement])
    await session.writeSymbols([replacementSymbol])

    await expect(session.commit()).resolves.toBeUndefined()
    expect(await store.getFile(file.path)).toEqual(replacement)
    expect(await store.findSymbols({ filePath: file.path })).toEqual([replacementSymbol])
    expect(await store.getIncomingSymbolRelations([symbols[0]!.id], [RelationType.Calls])).toEqual(
      [],
    )
    expect(await store.getOutgoingSymbolRelations([symbols[1]!.id], [RelationType.Calls])).toEqual(
      [],
    )
    expect(await store.getImportees(file.path)).toEqual([])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'replacedBulkLargeFileNeedle',
          rawTerms: ['replacedBulkLargeFileNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates,
    ).toEqual([])
    expect(
      (
        await store.searchSourceContentCandidates({
          normalizedQuery: 'replacementBulkLargeFileNeedle',
          rawTerms: ['replacementBulkLargeFileNeedle'],
          expandedTerms: [],
          limit: 10,
        })
      ).candidates.map((candidate) => candidate.file.path),
    ).toEqual([file.path])
    expect(await store.getFile(retainedFile.path)).toEqual(retainedFile)
    await store.close()
  })
})
