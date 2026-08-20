import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createSqliteGraphStoreFactory } from '../../src/composition/create-sqlite-graph-store-factory.js'
import { InvalidGraphStoreConfigurationError } from '../../src/domain/errors/invalid-graph-store-configuration-error.js'
import { resolveSqliteWorkerPath } from '../../src/infrastructure/sqlite/resolve-worker-path.js'

let tempDir: string | undefined

const require = createRequire(fileURLToPath(import.meta.url))

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('createSqliteGraphStoreFactory', () => {
  it('constructs an openable SQLite store by default', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-factory-default-'))
    const factory = createSqliteGraphStoreFactory()

    const store = factory.create({ storagePath: tempDir })
    await store.open()
    const stats = await store.getStatistics()
    expect(stats.fileCount).toBe(0)
    await store.close()
  })

  it('plumbs runtime descriptor modulePath through to the worker during open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-factory-runtime-'))
    const sqliteEntry = require.resolve('better-sqlite3')

    const factory = createSqliteGraphStoreFactory({
      runtime: { modulePath: sqliteEntry },
      maxPendingOperations: 4,
    })

    const store = factory.create({ storagePath: tempDir })
    await store.open()
    const stats = await store.getStatistics()
    expect(stats.fileCount).toBe(0)
    await store.close()
  })

  it('rejects an invalid maxPendingOperations at open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-factory-invalid-'))
    const factory = createSqliteGraphStoreFactory({ maxPendingOperations: 0 })

    const store = factory.create({ storagePath: tempDir })
    await expect(store.open()).rejects.toThrow(InvalidGraphStoreConfigurationError)
    await store.close()
  })

  it('fails open when modulePath points to a non-loadable module', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-factory-bad-runtime-'))
    const factory = createSqliteGraphStoreFactory({
      runtime: { modulePath: '/nonexistent/not-a-module.js' },
    })

    const store = factory.create({ storagePath: tempDir })
    await expect(store.open()).rejects.toThrow()
    await store.close()
  })

  it('resolves the worker script used by factories to an existing path', () => {
    expect(resolveSqliteWorkerPath()).toBeDefined()
  })
})
