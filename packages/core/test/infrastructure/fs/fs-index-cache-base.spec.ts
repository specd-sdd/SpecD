import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FsIndexCache } from '../../../src/infrastructure/fs/fs-index-cache-base.js'

interface TestEntry {
  readonly id: string
  readonly value: number
}

describe('FsIndexCache', () => {
  let tmpDir: string
  let bucketDir: string
  let sourceDir: string
  let rebuildCalls: number
  let stampMap: Map<string, string>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-fs-index-cache-'))
    bucketDir = path.join(tmpDir, 'bucket')
    sourceDir = path.join(tmpDir, 'source')
    await fs.mkdir(sourceDir, { recursive: true })
    rebuildCalls = 0
    stampMap = new Map()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function createCache(): FsIndexCache<TestEntry> {
    return new FsIndexCache<TestEntry>({
      bucketDir,
      entryId: (entry) => entry.id,
      compare: (a, b) => a.value - b.value,
      cursor: (entry) => ({ key: String(entry.value), id: entry.id }),
      serializeEntry: (entry) => entry,
      deserializeEntry: (raw) => raw as TestEntry,
      rebuild: async function* () {
        rebuildCalls += 1
        for (const [id, mtime] of stampMap) {
          const value = Number.parseInt(id.replace('item-', ''), 10)
          yield { entry: { id, value }, sourceMtime: mtime }
        }
      },
      currentStamps: async () => new Map(stampMap),
    })
  }

  it('upserts and lists entries', async () => {
    const cache = createCache()
    stampMap.set('item-1', new Date('2024-01-01T00:00:00.000Z').toISOString())
    stampMap.set('item-2', new Date('2024-01-02T00:00:00.000Z').toISOString())

    await cache.upsert({ id: 'item-1', value: 1 }, { sourceMtime: stampMap.get('item-1')! })
    await cache.upsert({ id: 'item-2', value: 2 }, { sourceMtime: stampMap.get('item-2')! })

    const result = await cache.list()
    expect(result.items.map((e) => e.id)).toEqual(['item-1', 'item-2'])
    expect(result.meta.total).toBe(2)
  })

  it('remove drops a row and updates count', async () => {
    const cache = createCache()
    stampMap.set('item-1', new Date().toISOString())
    stampMap.set('item-2', new Date().toISOString())
    await cache.upsert({ id: 'item-1', value: 1 }, { sourceMtime: stampMap.get('item-1')! })
    await cache.upsert({ id: 'item-2', value: 2 }, { sourceMtime: stampMap.get('item-2')! })

    await cache.remove('item-1')
    stampMap.delete('item-1')

    expect(await cache.count()).toBe(1)
    const result = await cache.list()
    expect(result.items.map((e) => e.id)).toEqual(['item-2'])
  })

  it('invalidate triggers rebuild on next list', async () => {
    const cache = createCache()
    stampMap.set('item-1', new Date().toISOString())
    await cache.upsert({ id: 'item-1', value: 1 }, { sourceMtime: stampMap.get('item-1')! })

    await cache.invalidate()
    expect(rebuildCalls).toBe(0)

    await cache.list()
    expect(rebuildCalls).toBe(1)
  })

  it('rebuilds when source mtime changes', async () => {
    const cache = createCache()
    const mtime = new Date('2024-01-01T00:00:00.000Z').toISOString()
    stampMap.set('item-1', mtime)
    await cache.upsert({ id: 'item-1', value: 1 }, { sourceMtime: mtime })

    stampMap.set('item-1', new Date('2024-06-01T00:00:00.000Z').toISOString())
    await cache.list()
    expect(rebuildCalls).toBe(1)
  })

  it('serves from cache when stamps match regardless of generatedAt age', async () => {
    vi.useFakeTimers()
    try {
      const cache = createCache()
      const mtime = new Date('2024-01-01T00:00:00.000Z').toISOString()
      stampMap.set('item-1', mtime)
      await cache.upsert({ id: 'item-1', value: 1 }, { sourceMtime: mtime })

      vi.advanceTimersByTime(300_001)
      await cache.list()
      expect(rebuildCalls).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('serializes concurrent mutate callers', async () => {
    const cache = createCache()
    const order: number[] = []

    await Promise.all([
      cache.mutate(async () => {
        order.push(1)
        await new Promise((resolve) => setTimeout(resolve, 20))
        order.push(2)
      }),
      cache.mutate(async () => {
        order.push(3)
      }),
    ])

    expect(order).toEqual([1, 2, 3])
  })

  it('upsertIfChanged skips identical rows', async () => {
    const cache = createCache()
    const mtime = new Date().toISOString()
    stampMap.set('item-1', mtime)

    const changed1 = await cache.upsertIfChanged({ id: 'item-1', value: 1 }, { sourceMtime: mtime })
    const changed2 = await cache.upsertIfChanged({ id: 'item-1', value: 1 }, { sourceMtime: mtime })

    expect(changed1).toBe(true)
    expect(changed2).toBe(false)
  })
})
