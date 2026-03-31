import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { type GraphStore } from '../../../src/domain/ports/graph-store.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'

export function graphStoreContractTests(
  name: string,
  createStore: () => GraphStore | Promise<GraphStore>,
  cleanup?: () => Promise<void>,
): void {
  describe(`GraphStore contract: ${name}`, () => {
    let store: GraphStore

    beforeEach(async () => {
      store = await createStore()
      await store.open()
    })

    afterEach(async () => {
      try {
        await store.close()
      } catch {
        // already closed
      }
      if (cleanup) await cleanup()
    })

    it('throws StoreNotOpenError when not open', async () => {
      const closedStore = await createStore()
      await expect(closedStore.getAllFiles()).rejects.toThrow(StoreNotOpenError)
    })

    it('upserts and retrieves a file', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      await store.upsertFile(file, [], [])

      const retrieved = await store.getFile('src/main.ts')
      expect(retrieved).toBeDefined()
      expect(retrieved!.path).toBe('src/main.ts')
      expect(retrieved!.language).toBe('typescript')
    })

    it('upserts a file with symbols and relations', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      const symbol = createSymbolNode({
        name: 'main',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 1,
        column: 0,
      })
      const rel = createRelation({
        source: 'src/main.ts',
        target: symbol.id,
        type: RelationType.Defines,
      })

      await store.upsertFile(file, [symbol], [rel])

      const retrieved = await store.getSymbol(symbol.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('main')

      const found = await store.findSymbols({ filePath: 'src/main.ts' })
      expect(found).toHaveLength(1)
    })

    it('removeFile removes file, symbols, and relations', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      const symbol = createSymbolNode({
        name: 'main',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 1,
        column: 0,
      })
      await store.upsertFile(
        file,
        [symbol],
        [createRelation({ source: 'src/main.ts', target: symbol.id, type: RelationType.Defines })],
      )

      await store.removeFile('src/main.ts')

      expect(await store.getFile('src/main.ts')).toBeUndefined()
      expect(await store.getSymbol(symbol.id)).toBeUndefined()
    })

    it('upsertFile replaces previous data atomically', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:v1',
        workspace: '/project',
      })
      const sym1 = createSymbolNode({
        name: 'old',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 1,
        column: 0,
      })
      await store.upsertFile(file, [sym1], [])

      const fileV2 = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:v2',
        workspace: '/project',
      })
      const sym2 = createSymbolNode({
        name: 'new',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 5,
        column: 0,
      })
      await store.upsertFile(fileV2, [sym2], [])

      expect(await store.getSymbol(sym1.id)).toBeUndefined()
      expect(await store.getSymbol(sym2.id)).toBeDefined()

      const updatedFile = await store.getFile('src/main.ts')
      expect(updatedFile!.contentHash).toBe('sha256:v2')
    })

    it('findSymbols by kind', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      const fn = createSymbolNode({
        name: 'doSomething',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 1,
        column: 0,
      })
      const cls = createSymbolNode({
        name: 'MyClass',
        kind: SymbolKind.Class,
        filePath: 'src/main.ts',
        line: 10,
        column: 0,
      })
      await store.upsertFile(file, [fn, cls], [])

      const functions = await store.findSymbols({ kind: SymbolKind.Function })
      expect(functions).toHaveLength(1)
      expect(functions[0]!.name).toBe('doSomething')
    })

    it('getStatistics returns correct counts', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      const symbol = createSymbolNode({
        name: 'fn',
        kind: SymbolKind.Function,
        filePath: 'src/main.ts',
        line: 1,
        column: 0,
      })
      await store.upsertFile(file, [symbol], [])

      const stats = await store.getStatistics()
      expect(stats.fileCount).toBe(1)
      expect(stats.symbolCount).toBe(1)
      expect(stats.languages).toContain('typescript')
      expect(stats.lastIndexedRef).toBeNull()
      expect(stats.relationCounts[RelationType.Extends]).toBe(0)
      expect(stats.relationCounts[RelationType.Implements]).toBe(0)
      expect(stats.relationCounts[RelationType.Overrides]).toBe(0)
    })

    it('returns incoming EXTENDS relations via getExtenders', async () => {
      const file = createFileNode({
        path: 'src/types.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      const base = createSymbolNode({
        name: 'BaseType',
        kind: SymbolKind.Class,
        filePath: 'src/types.ts',
        line: 1,
        column: 0,
      })
      const child = createSymbolNode({
        name: 'ChildType',
        kind: SymbolKind.Class,
        filePath: 'src/types.ts',
        line: 5,
        column: 0,
      })
      await store.upsertFile(
        file,
        [base, child],
        [
          createRelation({ source: file.path, target: base.id, type: RelationType.Defines }),
          createRelation({ source: file.path, target: child.id, type: RelationType.Defines }),
          createRelation({ source: child.id, target: base.id, type: RelationType.Extends }),
        ],
      )

      const extenders = await store.getExtenders(base.id)
      expect(extenders).toHaveLength(1)
      expect(extenders[0]?.source).toBe(child.id)
    })

    it('returns incoming IMPLEMENTS relations via getImplementors', async () => {
      const file = createFileNode({
        path: 'src/contracts.ts',
        language: 'typescript',
        contentHash: 'sha256:def',
        workspace: '/project',
      })
      const contract = createSymbolNode({
        name: 'Persistable',
        kind: SymbolKind.Interface,
        filePath: file.path,
        line: 1,
        column: 0,
      })
      const impl = createSymbolNode({
        name: 'Repo',
        kind: SymbolKind.Class,
        filePath: file.path,
        line: 6,
        column: 0,
      })
      await store.upsertFile(
        file,
        [contract, impl],
        [
          createRelation({ source: file.path, target: contract.id, type: RelationType.Defines }),
          createRelation({ source: file.path, target: impl.id, type: RelationType.Defines }),
          createRelation({ source: impl.id, target: contract.id, type: RelationType.Implements }),
        ],
      )

      const implementors = await store.getImplementors(contract.id)
      expect(implementors).toHaveLength(1)
      expect(implementors[0]?.source).toBe(impl.id)
    })

    it('returns incoming OVERRIDES relations via getOverriders', async () => {
      const file = createFileNode({
        path: 'src/methods.ts',
        language: 'typescript',
        contentHash: 'sha256:ghi',
        workspace: '/project',
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
        line: 8,
        column: 2,
      })
      await store.upsertFile(
        file,
        [baseMethod, childMethod],
        [
          createRelation({ source: file.path, target: baseMethod.id, type: RelationType.Defines }),
          createRelation({ source: file.path, target: childMethod.id, type: RelationType.Defines }),
          createRelation({
            source: childMethod.id,
            target: baseMethod.id,
            type: RelationType.Overrides,
          }),
        ],
      )

      const overriders = await store.getOverriders(baseMethod.id)
      expect(overriders).toHaveLength(1)
      expect(overriders[0]?.source).toBe(childMethod.id)
    })

    it('lastIndexedRef defaults to null', async () => {
      const stats = await store.getStatistics()
      expect(stats.lastIndexedRef).toBeNull()
    })

    it('lastIndexedRef is set after bulkLoad with vcsRef', async () => {
      await store.bulkLoad({
        files: [],
        symbols: [],
        specs: [],
        relations: [],
        vcsRef: 'abc1234def',
      })
      const stats = await store.getStatistics()
      expect(stats.lastIndexedRef).toBe('abc1234def')
    })

    it('lastIndexedRef is cleared on clear()', async () => {
      await store.bulkLoad({
        files: [],
        symbols: [],
        specs: [],
        relations: [],
        vcsRef: 'abc1234def',
      })
      await store.clear()
      const stats = await store.getStatistics()
      expect(stats.lastIndexedRef).toBeNull()
    })

    it('clear removes everything', async () => {
      const file = createFileNode({
        path: 'src/main.ts',
        language: 'typescript',
        contentHash: 'sha256:abc',
        workspace: '/project',
      })
      await store.upsertFile(file, [], [])
      await store.clear()

      const stats = await store.getStatistics()
      expect(stats.fileCount).toBe(0)
      expect(stats.symbolCount).toBe(0)
    })

    it('getAllFiles returns all files', async () => {
      const file1 = createFileNode({
        path: 'a.ts',
        language: 'typescript',
        contentHash: 'sha256:1',
        workspace: '/project',
      })
      const file2 = createFileNode({
        path: 'b.ts',
        language: 'typescript',
        contentHash: 'sha256:2',
        workspace: '/project',
      })
      await store.upsertFile(file1, [], [])
      await store.upsertFile(file2, [], [])

      const all = await store.getAllFiles()
      expect(all).toHaveLength(2)
    })

    it('upserts and retrieves spec nodes with dependencies', async () => {
      const spec1 = createSpecNode({
        specId: 'core:core/config',
        path: 'specs/core/config',
        title: 'Config',
        contentHash: 'sha256:a',
        workspace: 'test',
      })
      const spec2 = createSpecNode({
        specId: 'core:core/change',
        path: 'specs/core/change',
        title: 'Change',
        contentHash: 'sha256:b',
        dependsOn: ['core:core/config'],
        workspace: 'test',
      })
      await store.upsertSpec(spec1, [])
      await store.upsertSpec(spec2, [
        createRelation({
          source: 'core:core/change',
          target: 'core:core/config',
          type: RelationType.DependsOn,
        }),
      ])

      const retrieved = await store.getSpec('core:core/change')
      expect(retrieved).toBeDefined()
      expect(retrieved!.title).toBe('Change')

      const deps = await store.getSpecDependencies('core:core/change')
      expect(deps).toHaveLength(1)
      expect(deps[0]!.target).toBe('core:core/config')

      const dependents = await store.getSpecDependents('core:core/config')
      expect(dependents).toHaveLength(1)
      expect(dependents[0]!.source).toBe('core:core/change')
    })
  })
}

graphStoreContractTests('InMemoryGraphStore', () => new InMemoryGraphStore())
