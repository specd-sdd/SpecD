import { describe, afterEach, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LadybugGraphStore } from '../../../src/infrastructure/ladybug/ladybug-graph-store.js'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../../../src/infrastructure/ladybug/schema.js'
import { graphStoreContractTests } from '../../domain/ports/graph-store.contract.js'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'

let tempDir: string | undefined

graphStoreContractTests(
  'LadybugGraphStore',
  () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))
    return new LadybugGraphStore(tempDir)
  },
  async () => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  },
)

describe('LadybugGraphStore hierarchy persistence', () => {
  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('persists hierarchy relations and statistics across reopen cycles', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

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

    const initialStore = new LadybugGraphStore(tempDir)
    await initialStore.open()
    await initialStore.bulkLoad({
      files: [file],
      symbols: [baseClass, childClass, contract, baseMethod, childMethod],
      specs: [],
      relations,
      vcsRef: 'hierarchy-v1',
    })
    await initialStore.close()

    const reopenedStore = new LadybugGraphStore(tempDir)
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

  it('refreshes fts search results after bulk load and file removal', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

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

    const store = new LadybugGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [file],
      symbols: [symbol],
      specs: [],
      relations: [],
    })

    const hitsAfterLoad = await store.searchSymbols({ query: 'createKernel' })
    expect(hitsAfterLoad).toHaveLength(1)
    expect(hitsAfterLoad[0]?.symbol.id).toBe(symbol.id)

    await store.removeFile(file.path)

    const hitsAfterRemove = await store.searchSymbols({ query: 'createKernel' })
    expect(hitsAfterRemove).toHaveLength(0)

    await store.close()
  })

  it('exposes schema version 8 with document storage in the ddl', () => {
    expect(SCHEMA_VERSION).toBe(8)
    expect(SCHEMA_DDL).toContain('CREATE NODE TABLE IF NOT EXISTS Document')
    expect(SCHEMA_DDL).toContain('CREATE REL TABLE IF NOT EXISTS EXTENDS')
    expect(SCHEMA_DDL).toContain('CREATE REL TABLE IF NOT EXISTS IMPLEMENTS')
    expect(SCHEMA_DDL).toContain('CREATE REL TABLE IF NOT EXISTS OVERRIDES')
  })

  it('stores graph data under graph/ and recreates backend state destructively', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

    const store = new LadybugGraphStore(tempDir)
    await store.open()
    await store.close()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.lbug'))).toBe(true)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph', 'code-graph.lbug'))).toBe(false)
    expect(existsSync(join(tempDir, 'graph', 'storage.epoch'))).toBe(true)
  })

  it('recreates the storage generation sidecar after schema migration', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))
    const store = new LadybugGraphStore(tempDir)
    await store.open()
    const conn = (store as unknown as { conn: { query: (query: string) => Promise<unknown> } }).conn
    await conn.query("MATCH (m:Meta {key: 'schemaVersion'}) SET m.value = '1'")
    await store.close()

    const epochPath = join(tempDir, 'graph', 'storage.epoch')
    writeFileSync(epochPath, 'stale-generation')

    const migrated = new LadybugGraphStore(tempDir)
    await migrated.open()

    expect(readFileSync(epochPath, 'utf8')).not.toBe('stale-generation')
    await expect(migrated.getStatistics()).resolves.toMatchObject({ fileCount: 0 })
    await migrated.close()
  })

  it('keeps file data when a transactional removal fails', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))
    const file = createFileNode({
      path: 'core:src/atomic.ts',
      configRelativePath: 'packages/core/src/atomic.ts',
      language: 'typescript',
      contentHash: 'sha256:atomic',
      workspace: 'core',
    })
    const symbol = createSymbolNode({
      name: 'atomicRemoval',
      kind: SymbolKind.Function,
      filePath: file.path,
      line: 1,
      column: 0,
    })
    const store = new LadybugGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({ files: [file], symbols: [symbol], specs: [], relations: [] })

    const local = store as unknown as {
      deleteFileLocalState: (conn: unknown, path: string) => Promise<void>
      conn: unknown
    }
    const originalDelete = local.deleteFileLocalState.bind(store)
    vi.spyOn(local, 'deleteFileLocalState').mockImplementation(async (conn, path) => {
      await originalDelete(conn, path)
      throw new Error('simulated removal failure')
    })

    await expect(store.removeFile(file.path)).rejects.toThrow('simulated removal failure')
    await expect(store.getFile(file.path)).resolves.toMatchObject({ path: file.path })
    await expect(store.getSymbol(symbol.id)).resolves.toMatchObject({ id: symbol.id })
    await store.close()
  })

  it('recreate on an open store reopens the store for subsequent operations', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

    const store = new LadybugGraphStore(tempDir)
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

  it('expands specd/code-shaped queries before reranking Ladybug results', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

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

    const store = new LadybugGraphStore(tempDir)
    await store.open()
    await store.bulkLoad({
      files: [file],
      documents: [strongDocument, weakDocument],
      symbols: [declared, commentOnly],
      specs: [strongSpec, weakSpec],
      relations: [],
    })
    await store.rebuildFtsIndexes()

    const symbolHits = await store.searchSymbols({ query: 'ArchiveChange' })
    const specHits = await store.searchSpecs({ query: 'core:change' })
    const documentHits = await store.searchDocuments({ query: 'docs/architecture.md' })

    expect(symbolHits[0]?.symbol.id).toBe(declared.id)
    expect(specHits[0]?.spec.specId).toBe(strongSpec.specId)
    expect(documentHits[0]?.document.path).toBe(strongDocument.path)

    await store.close()
  })

  it('keeps exact-prefix-suffix-substring ordering for Ladybug symbol reranking', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))

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

    const store = new LadybugGraphStore(tempDir)
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
})
