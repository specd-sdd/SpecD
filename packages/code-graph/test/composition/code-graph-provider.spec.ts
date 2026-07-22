import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type SpecRepository, type Spec } from '@specd/core'
import { createCodeGraphProvider } from '../../src/composition/create-code-graph-provider.js'
import { createBootstrapGraphConfig } from '../../src/application/services/bootstrap-graph-config.js'
import { StoreNotOpenError } from '../../src/domain/errors/store-not-open-error.js'
import { GraphProviderStaleError } from '../../src/domain/errors/graph-provider-stale-error.js'
import { InMemoryGraphStore } from '../helpers/in-memory-graph-store.js'

const makeListResult = (specs: Spec[] = []) => {
  const items = specs.map((spec) => ({
    workspace: spec.workspace,
    path: spec.name.toFsPath('/'),
    title: spec.name.toString().split('/').at(-1) ?? spec.name.toString(),
  }))
  return {
    items,
    meta: { total: items.length, count: items.length, limit: items.length },
  }
}

const makeMockRepo = (specs: Spec[] = []): SpecRepository =>
  ({
    get specsPath() {
      return undefined
    },
    list: async () => makeListResult(specs),
    count: async () => specs.length,
    specHash: async () => null,
    metadata: async () => null,
    readPersistedDependsOn: async () => [],
    readPersistedImplementation: async () => [],
    artifact: async () => null,
  }) as unknown as SpecRepository

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

  it('can be instantiated with a Ladybug backend', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-graph-provider-ladybug-'))
    const provider = await createCodeGraphProvider({
      storagePath: tempDir,
      projectRoot: tempDir,
      graphStoreId: 'ladybug',
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
})
