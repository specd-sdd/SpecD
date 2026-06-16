import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('SQLiteGraphStore migration safety', () => {
  let tempDir: string | undefined

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('better-sqlite3')
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('does not delete the graph database on non-destructive probe failures', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-migration-'))
    const graphDir = join(tempDir, 'graph')
    mkdirSync(graphDir, { recursive: true })
    const dbPath = join(graphDir, 'code-graph.sqlite')
    writeFileSync(dbPath, 'sentinel-db')

    vi.doMock('better-sqlite3', () => ({
      default: class MockDatabase {
        constructor() {
          throw new Error('database is locked')
        }
      },
    }))

    const { SQLiteGraphStore } =
      await import('../../../src/infrastructure/sqlite/sqlite-graph-store.js')
    const store = new SQLiteGraphStore(tempDir)

    await expect(store.open()).rejects.toThrow('database is locked')
    expect(existsSync(dbPath)).toBe(true)
  })
})
