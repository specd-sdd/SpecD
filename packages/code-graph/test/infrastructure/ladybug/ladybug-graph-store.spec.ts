import { describe, afterEach, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LadybugGraphStore } from '../../../src/infrastructure/ladybug/ladybug-graph-store.js'
import { SCHEMA_DDL, SCHEMA_VERSION } from '../../../src/infrastructure/ladybug/schema.js'
import { graphStoreContractTests } from '../../domain/ports/graph-store.contract.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
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

  it('exposes schema version 6 hierarchy tables in the ddl', () => {
    expect(SCHEMA_VERSION).toBe(6)
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

    await store.recreate()

    expect(existsSync(join(tempDir, 'graph'))).toBe(false)
  })
})
