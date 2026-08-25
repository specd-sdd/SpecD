import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type SpecRepository, type Spec } from '@specd/core'
import { createCodeGraphProvider } from '../../src/composition/create-code-graph-provider.js'
import { createBootstrapGraphConfig } from '../../src/application/services/bootstrap-graph-config.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'
import { InvalidGraphSelectorError } from '../../src/domain/errors/invalid-graph-selector-error.js'
import { GraphStoreRegistryError } from '../../src/domain/errors/graph-store-registry-error.js'
import { InMemoryGraphStore } from '../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../helpers/make-mock-spec-repository.js'
import { SQLiteWorkerClient } from '../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { createFileNode } from '../../src/domain/value-objects/file-node.js'
import { createSymbolNode } from '../../src/domain/value-objects/symbol-node.js'
import {
  createLogicalSymbol,
  createPublicBinding,
  SymbolSpace,
} from '../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../src/domain/value-objects/symbol-kind.js'
import { acquireGraphIndexLockByStoragePath } from '../../src/infrastructure/index-lock.js'
import { GraphBusyError } from '../../src/domain/errors/graph-busy-error.js'
import { GraphStorageRecoveryRequiredError } from '../../src/domain/errors/graph-storage-recovery-required-error.js'
import { GraphStoreRecreateRequiresClosedError } from '../../src/domain/errors/graph-store-recreate-requires-closed-error.js'

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

  it('uses logical clear rather than physical recreation for forced indexing', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-force-clear-'))
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    writeFileSync(join(codeRoot, 'entry.ts'), 'export const forced = 1\n')
    const store = new InMemoryGraphStore()
    const clear = vi.spyOn(store, 'clear')
    const recreate = vi.spyOn(store, 'recreate')
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { custom: { create: () => store } },
      graphStoreId: 'custom',
    })
    await provider.open()

    const result = await provider.index({
      projectRoot: tempDir,
      vcsRoot: tempDir,
      force: true,
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
      graphConfig: { includePaths: [], workspaces: new Map() },
    })

    expect(clear).toHaveBeenCalledOnce()
    expect(recreate).not.toHaveBeenCalled()
    expect(result.fullRebuild).toBe(true)
    expect(result.fullRebuildReason).toContain('logical')
    expect(result.filesIndexed).toBe(1)
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

  it('keeps reader availability locked while an index lease is held', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-reader-lock-'))
    const provider = createCodeGraphProvider({ storagePath: tempDir, projectRoot: tempDir })
    await provider.open()
    const release = acquireGraphIndexLockByStoragePath(tempDir)
    try {
      await expect(provider.getStatistics()).rejects.toThrow(GraphBusyError)
    } finally {
      release()
      await provider.close()
    }
  })

  it('accepts only a matching parent lock handoff for indexing', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-handoff-'))
    const previousRoot = process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
    const previousToken = process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
    const release = acquireGraphIndexLockByStoragePath(tempDir)
    const lockPath = join(tempDir, 'graph', 'index.lock')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { version: 1; token: string }
    writeFileSync(lockPath, JSON.stringify({ ...lock, pid: process.ppid }))
    process.env['SPECD_GRAPH_INDEX_LOCK_ROOT'] = tempDir
    process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = lock.token
    const store = new InMemoryGraphStore()
    const provider = createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreFactories: { custom: { create: () => store } },
      graphStoreId: 'custom',
    })
    const codeRoot = join(tempDir, 'workspace')
    mkdirSync(codeRoot, { recursive: true })
    try {
      await provider.open()
      await expect(
        provider.index({
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
          graphConfig: { includePaths: [], workspaces: new Map() },
        }),
      ).resolves.toBeDefined()
      // Indexing consumes the matching handoff, while the separate SQLite-backed
      // reader-lock regression above proves reads never consume it.
      await expect(provider.getStatistics()).resolves.toBeDefined()
    } finally {
      await provider.close()
      if (previousRoot === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
      else process.env['SPECD_GRAPH_INDEX_LOCK_ROOT'] = previousRoot
      if (previousToken === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
      else process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = previousToken
      rmSync(lockPath, { force: true })
      release()
    }
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

  it('requires a provider to be closed before physical recreation', async () => {
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
    await expect(provider.recreate()).rejects.toBeInstanceOf(GraphStoreRecreateRequiresClosedError)
    await provider.close()

    await expect(provider.recreate()).resolves.toBeUndefined()
  })

  it('serializes physical recreation with the graph index lock', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-recreate-lock-'))
    const provider = createCodeGraphProvider({ storagePath: tempDir, projectRoot: tempDir })
    const release = acquireGraphIndexLockByStoragePath(tempDir)
    try {
      await expect(provider.recreate()).rejects.toBeInstanceOf(GraphBusyError)
    } finally {
      release()
      await provider.close()
    }
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

  it('throws StoreNotOpenError for analyzeImpact after close', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-analyze-closed-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
    })
    await provider.open()
    await provider.close()

    await expect(provider.analyzeImpact('core:src/state.ts:render', 'downstream')).rejects.toThrow(
      StoreNotOpenError,
    )
  })

  it('resolves a config-relative file selector to the canonical workspace path', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-file-resolve-'))
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
      }),
      [],
      [],
    )

    const resolved = await provider.resolveFileSelector('packages/root/src/messages.ts')
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      canonicalPath: 'root:src/messages.ts',
      configRelativePath: 'packages/root/src/messages.ts',
      workspace: 'root',
    })
    await provider.close()
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

  it('propagates recoverable storage open errors until a closed caller recreates', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-repair-'))
    class IncompatibleStore extends InMemoryGraphStore {
      incompatible = true
      recreateCount = 0

      override async open(): Promise<void> {
        if (this.incompatible) {
          throw new GraphStorageRecoveryRequiredError(
            'schema is incompatible',
            'SCHEMA_INCOMPATIBLE',
          )
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
    await expect(readProvider.open()).rejects.toBeInstanceOf(GraphStorageRecoveryRequiredError)
    expect(store.recreateCount).toBe(0)

    await readProvider.recreate()
    expect(store.recreateCount).toBe(1)
    await readProvider.open()
    await readProvider.close()
  })

  it('validates availability exactly once per provider batch operation', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-batch-availability-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'sqlite',
    })
    await provider.open()
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    const snapshotCallCount = (): number =>
      sendRequest.mock.calls.filter(([op]) => op === 'readStorageGenerationSnapshot').length

    try {
      expect(await provider.getSymbolsByIds(['core:missing-symbol'])).toEqual([])
      expect(snapshotCallCount()).toBe(1)

      expect(await provider.getFilesByPaths(['core:src/missing.ts'])).toEqual([])
      expect(snapshotCallCount()).toBe(2)

      expect(await provider.getDocumentsByPaths(['root:docs/missing.md'])).toEqual([])
      expect(snapshotCallCount()).toBe(3)

      expect(await provider.getSpecsByIds(['core:missing-spec'])).toEqual([])
      expect(snapshotCallCount()).toBe(4)
    } finally {
      sendRequest.mockRestore()
      await provider.close()
    }
  })

  it('does not multiply availability validation across composite inner loops', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-composite-availability-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'sqlite',
    })
    await provider.open()
    const sendRequest = vi.spyOn(SQLiteWorkerClient.prototype, 'sendRequest')
    const snapshotCallCount = (): number =>
      sendRequest.mock.calls.filter(([op]) => op === 'readStorageGenerationSnapshot').length

    try {
      const result = await provider.analyzeFilesImpact(
        ['core:src/a.ts', 'core:src/b.ts', 'core:src/c.ts'],
        'upstream',
        2,
      )

      expect(result.riskLevel).toBe('LOW')
      expect(snapshotCallCount()).toBe(1)
    } finally {
      sendRequest.mockRestore()
      await provider.close()
    }
  })

  it('rejects empty selectors with the typed graph selector error', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-selector-error-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'sqlite',
    })
    await provider.open()

    try {
      const fileError = await provider.resolveFileSelector('').catch((error: unknown) => error)
      expect(fileError).toBeInstanceOf(InvalidGraphSelectorError)
      expect((fileError as InvalidGraphSelectorError).code).toBe('INVALID_GRAPH_SELECTOR')
      expect((fileError as InvalidGraphSelectorError).message).toBe('empty file selector')

      const symbolError = await provider.resolveSymbolSelector('').catch((error: unknown) => error)
      expect(symbolError).toBeInstanceOf(InvalidGraphSelectorError)
      expect((symbolError as InvalidGraphSelectorError).code).toBe('INVALID_GRAPH_SELECTOR')
      expect((symbolError as InvalidGraphSelectorError).message).toBe('empty symbol selector')
    } finally {
      await provider.close()
    }
  })
})
