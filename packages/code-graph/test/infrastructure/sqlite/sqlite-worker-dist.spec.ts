import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSqliteWorkerPath } from '../../../src/infrastructure/sqlite/resolve-worker-path.js'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'

describe('SQLiteWorker compiled dist integration', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('resolves a valid existing worker script path on disk', () => {
    const resolved = resolveSqliteWorkerPath()
    expect(existsSync(resolved)).toBe(true)
  })

  it('instantiates and operates SQLiteGraphStore against the resolved worker path', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-dist-test-'))
    const resolvedWorker = resolveSqliteWorkerPath()
    const store = new SQLiteGraphStore(tempDir, {
      workerPath: resolvedWorker,
    })

    try {
      await store.open()
      const stats = await store.getStatistics()
      expect(stats.fileCount).toBe(0)
    } finally {
      await store.close()
    }
  })
})
