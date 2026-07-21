import { describe, afterEach, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
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
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.sqlite'))).toBe(false)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)
  })

  it('recreate on an open store reopens the store for subsequent operations', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-test-'))

    const store = new SQLiteGraphStore(tempDir)
    await store.open()
    await store.recreate()

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
    expect(SQLITE_SCHEMA_VERSION).toBe(5)
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS files')
    expect(SQLITE_SCHEMA_DDL).toContain('content TEXT')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE TABLE IF NOT EXISTS documents')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS spec_fts')
    expect(SQLITE_SCHEMA_DDL).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS document_fts')
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
})
