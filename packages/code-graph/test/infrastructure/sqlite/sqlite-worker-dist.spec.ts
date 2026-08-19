import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
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
    tempDir = mkdtempSync(joinPath(tmpdir(), 'code-graph-sqlite-dist-test-'))
    const resolvedWorker = resolveSqliteWorkerPath()
    const store = new SQLiteGraphStore(tempDir, {
      workerPath: resolvedWorker,
    })

    await store.open()
    const stats = await store.getStatistics()
    expect(stats.fileCount).toBe(0)
    await store.close()
  })
})

function joinPath(...parts: string[]): string {
  return parts.join('/')
}
