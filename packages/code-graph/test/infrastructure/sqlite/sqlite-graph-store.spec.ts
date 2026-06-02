import { describe, afterEach, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
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
)

describe('SQLiteGraphStore', () => {
  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
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

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph'))).toBe(false)
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
    expect(SQLITE_SCHEMA_VERSION).toBe(4)
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS files')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS documents')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS spec_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS document_fts')
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
})
