import { describe, afterEach, expect, it, vi } from 'vitest'
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
    await store.bulkLoad({ files, symbols: [], specs, relations: [] })
    for (const document of documents) {
      await store.upsertDocument(document)
    }

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
    await store.upsertFile(baseline, [], [])

    const staged = createFileNode({
      path: 'core:src/staged.ts',
      configRelativePath: 'src/staged.ts',
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
      memberForm: undefined,
    })
    const session = store.beginBulkIndexSession()
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
    expect(await store.getFile(staged.path)).toBeUndefined()
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

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.sqlite'))).toBe(false)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)
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
    expect(SQLITE_SCHEMA_VERSION).toBe(9)
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
  })

  it('rejects an incompatible prior schema without recreating derived storage', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))
    const graphDir = join(tempDir, 'graph')
    const databasePath = join(graphDir, 'code-graph.sqlite')
    const initialStore = new SQLiteGraphStore(tempDir)
    await initialStore.open()
    await initialStore.close()

    const db = new Database(databasePath)
    db.prepare("UPDATE meta SET value = '8' WHERE key = 'schemaVersion'").run()
    db.close()

    const incompatibleStore = new SQLiteGraphStore(tempDir)
    await expect(incompatibleStore.open()).rejects.toThrow(
      'SQLite graph storage schema 8 is incompatible with expected 9',
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

  it('propagates ordinary runtime open failures without recreating or rotating storage', async () => {
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
      runtime: { modulePath: '/nonexistent/not-a-sqlite-module.js' },
    })

    await expect(failedStore.open()).rejects.not.toBeInstanceOf(GraphStorageRecoveryRequiredError)
    expect(failedStore.isOpen).toBe(false)
    expect(readFileSync(databasePath)).toEqual(databaseBeforeFailure)
    expect(readFileSync(epochPath)).toEqual(epochBeforeFailure)
    await failedStore.close()
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
      memberForm: undefined,
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
})
