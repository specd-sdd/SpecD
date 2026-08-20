import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type SpecRepository, type Spec } from '@specd/core'
import { createCodeGraphProvider } from '../../src/composition/create-code-graph-provider.js'
import { createBootstrapGraphConfig } from '../../src/application/services/bootstrap-graph-config.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'
import { GraphProviderStaleError } from '../../src/domain/errors/graph-provider-stale-error.js'
import { GraphStoreRegistryError } from '../../src/domain/errors/graph-store-registry-error.js'
import { InMemoryGraphStore } from '../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../helpers/make-mock-spec-repository.js'
import { createFileNode } from '../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  createPublicBinding,
  SymbolSpace,
} from '../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../src/domain/value-objects/symbol-kind.js'

const makeMockRepo = makeMockSpecRepository

describe('CodeGraphProvider', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  function existsSync(path: string): boolean {
    try {
      readdirSync(path)
      return true
    } catch {
      return false
    }
  }

  it('can be instantiated with a SQLite backend by default', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-sqlite-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })

    expect(provider).toBeDefined()
    await provider.close()
  })

  it('allows explicit selection of the sqlite backend', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-sqlite-explicit-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'sqlite',
    })
    await provider.open()

    expect(provider).toBeDefined()

    await provider.close()
  })

  it('throws StoreNotOpenError if operations are called before open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-closed-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.close()

    await expect(provider.getStatistics()).rejects.toThrow(StoreNotOpenError)
  })

  it('provides access to the underlying graph store', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-store-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })

    expect(provider).toBeDefined()
    await provider.close()
  })

  it('allows providing a custom store factory', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-custom-'))
    const customStore = new InMemoryGraphStore()

    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: {
        custom: {
          create: () => customStore,
        },
      },
      graphStoreId: 'custom',
    })

    expect(provider).toBeDefined()
    await provider.close()
  })

  it('selects an additive external factory and forwards its storage root', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-external-'))
    const externalStore = new InMemoryGraphStore()
    const create = vi.fn(() => externalStore)

    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { 'external-test': { create } },
      graphStoreId: 'external-test',
    })

    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({ storagePath: tempDir })
    await provider.close()
  })

  it('rejects an external collision with the sqlite built-in before store construction', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-collision-'))
    const create = vi.fn(() => new InMemoryGraphStore())

    expect(() =>
      createCodeGraphProvider({
        storagePath: tempDir,
        projectRoot: tempDir,
        graphStoreFactories: { sqlite: { create } },
      }),
    ).toThrow(GraphStoreRegistryError)
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects an unknown backend without falling back to sqlite', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-unknown-'))

    expect(() =>
      createCodeGraphProvider({
        storagePath: tempDir,
        projectRoot: tempDir,
        graphStoreId: 'unknown',
      }),
    ).toThrow(GraphStoreRegistryError)
  })

  it('delegates indexing to the IndexCodeGraph use case', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-index-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()

    const result = await provider.index({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      workspaces: [
        {
          name: 'default',
          prefix: null,
          codeRoot,
          specRepo: makeMockRepo(),
          ownership: 'owned',
          isExternal: false,
        },
      ],
      graphConfig: {
        includePaths: [],
        workspaces: new Map(),
      },
    })

    expect(result).toBeDefined()
    expect(result.filesIndexed).toBe(0)

    await provider.close()
  })

  it('can be instantiated from SpecdConfig', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-specd-config-'))
    const config = createBootstrapGraphConfig({
      projectRoot: tempDir,
      vcsRoot: tempDir,
    })
    const provider = createCodeGraphProvider(config)
    await provider.open()

    const stats = await provider.getStatistics()
    expect(stats.fileCount).toBe(0)

    await provider.close()
  })

  it('close is idempotent and can be safely called multiple times', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-idempotent-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()
    await provider.close()
    await expect(provider.close()).resolves.not.toThrow()
  })

  it('clear on an open provider keeps the store ready for subsequent operations', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-clear-open-'))
    const customStore = new InMemoryGraphStore()
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: {
        custom: {
          create: () => customStore,
        },
      },
      graphStoreId: 'custom',
    })
    await provider.open()
    await provider.clear()

    const stats = await provider.getStatistics()
    expect(stats.fileCount).toBe(0)

    await provider.close()
  })

  it('throws GraphProviderStaleError when the backing store generation changes externally', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-stale-'))
    const customStore = new InMemoryGraphStore()
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: {
        custom: {
          create: () => customStore,
        },
      },
      graphStoreId: 'custom',
    })
    await provider.open()
    await customStore.recreate()

    await expect(provider.getStatistics()).rejects.toThrow(GraphProviderStaleError)

    await provider.close()
  })

  it('supports async disposal', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-dispose-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()

    await provider[Symbol.asyncDispose]()

    await expect(provider.getStatistics()).rejects.toThrow(StoreNotOpenError)
  })

  it('exposes batch resolution under the open provider lifecycle', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-resolver-'))
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: {
        custom: {
          create: () => new InMemoryGraphStore(),
        },
      },
      graphStoreId: 'custom',
    })
    await provider.open()
    const health = await provider.getGraphHealth()

    await expect(provider.resolveSymbolReferences([], health)).resolves.toEqual([])
    expect(health.reasonCodes).toContain('GRAPH_HEALTH_UNAVAILABLE')

    await provider.close()
  })

  it('retrieves an exact public binding without ranked search pagination', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-exact-binding-'))
    const store = new InMemoryGraphStore()
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { custom: { create: () => store } },
      graphStoreId: 'custom',
    })
    await provider.open()

    const entries = Array.from({ length: 25 }, (_, index) => {
      const surface = `fixture:src/barrel-${String(index).padStart(2, '0')}.ts`
      const logical = createLogicalSymbol({
        workspace: 'fixture',
        surface,
        name: `run${index}`,
        space: SymbolSpace.Value,
        ownerId: undefined,
        memberForm: undefined,
      })
      const symbol = createSymbolNode({
        name: logical.name,
        kind: SymbolKind.Function,
        filePath: surface,
        line: 1,
        column: 0,
      })
      return {
        logical,
        symbol,
        binding: createPublicBinding({
          surface,
          exportedName: 'run',
          space: SymbolSpace.Value,
          targetId: logical.id,
        }),
      }
    })
    await store.replaceReferenceFacts({
      logicalSymbols: entries.map(({ logical }) => logical),
      declarations: entries.map(({ logical, symbol }) => ({
        logicalSymbolId: logical.id,
        declaration: {
          logicalId: logical.id,
          symbolId: symbol.id,
          location: {
            filePath: symbol.filePath,
            line: symbol.line,
            column: symbol.column,
            endLine: symbol.endLine,
            endColumn: symbol.endColumn,
          },
          kind: symbol.kind,
        },
      })),
      publicBindings: entries.map(({ binding }) => binding),
      localBindings: [],
      steps: [],
      coverage: [],
    })
    const search = vi.spyOn(store, 'searchSymbols')
    const selected = entries[24]!

    const result = await provider.getExactPublicBinding({
      surface: selected.binding.surface,
      exportedName: selected.binding.exportedName,
      space: selected.binding.space,
      targetId: selected.logical.id,
    })

    expect(result?.binding).toEqual(selected.binding)
    expect(result?.declarations.map(({ symbolId }) => symbolId)).toEqual([selected.symbol.id])
    expect(search).not.toHaveBeenCalled()
    await provider.close()
  })

  it('exposes one unified Code Graph-owned search operation', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-search-'))
    const store = new InMemoryGraphStore()
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { custom: { create: () => store } },
      graphStoreId: 'custom',
    })
    await provider.open()
    await store.upsertFile(
      createFileNode({
        path: 'root:src/messages.ts',
        configRelativePath: 'src/messages.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'root',
        content: 'const message = "graph search"',
      }),
      [],
      [],
    )

    const result = await provider.search({
      query: 'graph search',
      categories: ['files'],
      limit: 10,
      includeSnippet: false,
    })

    expect(result.files.map(({ file }) => file.path)).toEqual(['root:src/messages.ts'])
    expect(result.symbols).toEqual([])
    expect(result.specs).toEqual([])
    expect(result.documents).toEqual([])
    await provider.close()
  })

  it('normalizes an exact config-relative search file and keeps every occurrence', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-file-search-'))
    const store = new InMemoryGraphStore()
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { custom: { create: () => store } },
      graphStoreId: 'custom',
    })
    await provider.open()
    await store.upsertFile(
      createFileNode({
        path: 'root:src/messages.ts',
        configRelativePath: 'packages/root/src/messages.ts',
        language: 'typescript',
        contentHash: 'hash',
        workspace: 'root',
        content: Array.from({ length: 15 }, () => 'const message = "needle"').join('\n'),
      }),
      [],
      [],
    )

    const result = await provider.search({
      query: 'needle',
      categories: ['files'],
      filePattern: 'packages/root/src/messages.ts',
      limit: 10,
      includeSnippet: false,
    })

    expect(result.files[0]).toMatchObject({ totalMatches: 15, omittedMatches: 0 })
    expect(result.files[0]?.matches).toHaveLength(15)
    await provider.close()
  })

  it('repairs incompatible storage only through the indexing-specific open path', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-repair-'))
    class IncompatibleStore extends InMemoryGraphStore {
      incompatible = true
      recreateCount = 0

      override async open(): Promise<void> {
        if (this.incompatible) {
          throw new Error('SQLite graph storage schema 10 is incompatible with expected 11')
        }
        await super.open()
      }

      override async recreate(): Promise<void> {
        this.recreateCount += 1
        this.incompatible = false
        await super.recreate()
      }
    }
    const store = new IncompatibleStore()
    const createProvider = () =>
      createCodeGraphProvider({
        storagePath: tempDir,
        projectRoot: tempDir,
        graphStoreFactories: { custom: { create: () => store } },
        graphStoreId: 'custom',
      })

    const readProvider = createProvider()
    await expect(readProvider.open()).rejects.toThrow('incompatible')
    expect(store.recreateCount).toBe(0)

    const indexingProvider = createProvider()
    await expect(indexingProvider.openForIndexing()).resolves.toEqual({
      fullRebuild: true,
      fullRebuildReason: 'SCHEMA_INCOMPATIBLE',
    })
    expect(store.recreateCount).toBe(1)
    await indexingProvider.close()
  })
})
