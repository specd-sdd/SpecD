import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IMPLEMENTATION_SUGGESTION_CACHE_VERSION } from '../../../src/domain/value-objects/implementation-suggestion-cache.js'
import { FsImplementationSuggestionCache } from '../../../src/infrastructure/fs/fs-implementation-suggestion-cache.js'
import { FsSpecDepsSuggestionCache } from '../../../src/infrastructure/fs/fs-spec-deps-suggestion-cache.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
  }
})

const readFileMock = vi.mocked(await import('node:fs/promises')).readFile

interface DeferredString {
  promise: Promise<string>
  resolve: (value: string) => void
}

function deferredRead(): DeferredString {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function implCacheFile(specId: string): string {
  return JSON.stringify({
    header: {
      updatedAt: '2026-08-20T00:00:00.000Z',
      projectDir: '/tmp/x',
      cacheVersion: IMPLEMENTATION_SUGGESTION_CACHE_VERSION,
      graphLastIndexedAt: '2026-08-20T00:00:00.000Z',
      graphFingerprint: 'ref-1',
    },
    specs: {
      [specId]: {
        specId,
        title: 'Cached Spec',
        existing: { files: ['cli:packages/cli/src/cached.ts'], symbols: [], dependsOn: [] },
        suggestions: [],
      },
    },
  })
}

function depsCacheFile(specId: string): string {
  return JSON.stringify({
    header: {
      updatedAt: '2026-08-20T00:00:00.000Z',
      projectDir: '/tmp/x',
      cacheVersion: '1.1.0',
    },
    specs: {
      [specId]: {
        specId,
        title: 'Cached Spec',
        suggestedDependsOn: [],
        suggestions: [],
      },
    },
  })
}

describe('FS cache concurrent cold load', () => {
  const testDir = join(tmpdir(), `specd-cache-concurrent-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {})
    vi.mocked(readFileMock).mockRestore()
  })

  it('implementation cache: concurrent callers await in-flight disk load', async () => {
    const cache = new FsImplementationSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const p1 = cache.get('cli:spec-deps')
    const p2 = cache.getAll()
    expect(readFileMock).toHaveBeenCalledTimes(1)

    deferred.resolve(implCacheFile('cli:spec-deps'))
    const [entry, all] = await Promise.all([p1, p2])

    expect(entry?.title).toBe('Cached Spec')
    expect(all.get('cli:spec-deps')?.title).toBe('Cached Spec')

    // Post-load calls take the fast path without re-reading the file.
    await cache.get('cli:spec-deps')
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it('implementation cache: set issued mid-load waits and preserves loaded entry', async () => {
    const cache = new FsImplementationSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const pendingGet = cache.get('cli:spec-deps')
    const pendingSet = cache.set('cli:new-spec', {
      title: 'New Spec',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    deferred.resolve(implCacheFile('cli:spec-deps'))
    await Promise.all([pendingGet, pendingSet])

    expect((await cache.getAll()).has('cli:spec-deps')).toBe(true)
    expect((await cache.getAll()).has('cli:new-spec')).toBe(true)
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it('spec deps cache: concurrent callers await in-flight disk load', async () => {
    const cache = new FsSpecDepsSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const p1 = cache.get('core:spec-lock')
    const p2 = cache.getAll()
    expect(readFileMock).toHaveBeenCalledTimes(1)

    deferred.resolve(depsCacheFile('core:spec-lock'))
    const [entry, all] = await Promise.all([p1, p2])

    expect(entry?.title).toBe('Cached Spec')
    expect(all.get('core:spec-lock')?.title).toBe('Cached Spec')

    await cache.get('core:spec-lock')
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it('implementation cache: invalidate during pending cold load discards loaded entries', async () => {
    const cache = new FsImplementationSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const pendingGet = cache.get('cli:spec-deps') // triggers cold load
    await cache.invalidate() // while the disk load is still in flight

    deferred.resolve(implCacheFile('cli:spec-deps'))
    await Promise.all([pendingGet, Promise.resolve()])

    // The completed load must NOT repopulate invalidated entries.
    expect(await cache.get('cli:spec-deps')).toBeNull()
    expect((await cache.getAll()).size).toBe(0)
  })

  it('spec deps cache: invalidate during pending cold load discards loaded entries', async () => {
    const cache = new FsSpecDepsSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const pendingGet = cache.get('core:spec-lock') // triggers cold load
    await cache.invalidate() // while the disk load is still in flight

    deferred.resolve(depsCacheFile('core:spec-lock'))
    await Promise.all([pendingGet, Promise.resolve()])

    // The completed load must NOT repopulate invalidated entries.
    expect(await cache.get('core:spec-lock')).toBeNull()
    expect((await cache.getAll()).size).toBe(0)
  })

  it('spec deps cache: set issued mid-load waits and preserves loaded entry', async () => {
    const cache = new FsSpecDepsSuggestionCache({ projectDir: testDir })
    const deferred = deferredRead()
    vi.mocked(readFileMock).mockReturnValueOnce(deferred.promise)

    const pendingGet = cache.get('core:spec-lock')
    const pendingSet = cache.set('core:new-spec', {
      title: 'New Spec',
      existingDependsOn: [],
      suggestedDependsOn: [],
    })

    deferred.resolve(depsCacheFile('core:spec-lock'))
    await Promise.all([pendingGet, pendingSet])

    expect((await cache.getAll()).has('core:spec-lock')).toBe(true)
    expect((await cache.getAll()).has('core:new-spec')).toBe(true)
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })
})
