import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { type SpecRepository } from '@specd/core'
import { type CodeGraphProvider } from '@specd/code-graph'
import { FsImplementationSuggestionCache } from '../../../src/infrastructure/fs/fs-implementation-suggestion-cache.js'
import { FsSpecDepsSuggestionCache } from '../../../src/infrastructure/fs/fs-spec-deps-suggestion-cache.js'
import { SPEC_DEPS_CACHE_VERSION } from '../../../src/domain/value-objects/spec-deps-suggestion-cache.js'

describe('FsImplementationSuggestionCache', () => {
  const testDir = join(tmpdir(), `specd-impl-cache-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {})
  })

  it('performs self-validating get, set, and findSpecByFile', async () => {
    const mockRepo = {
      get: vi.fn().mockResolvedValue({
        workspace: 'cli',
        path: 'spec-deps',
        artifacts: [
          { filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-abc' },
        ],
      }),
    } as unknown as SpecRepository

    const mockGraph = {
      getGraphHealth: vi
        .fn()
        .mockResolvedValue({ currentRef: 'fingerprint-1', freshness: '2026-08-17T12:00:00Z' }),
    } as unknown as CodeGraphProvider

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
      codeGraphProvider: mockGraph,
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
    expect(await cache.findSpecByFile('cli:packages/cli/src/commands/spec/deps.ts')).toBeNull()

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: {
        files: ['cli:packages/cli/src/commands/spec/deps.ts'],
        symbols: ['registerSpecDeps'],
        dependsOn: [],
      },
      suggestions: [
        {
          file: 'cli:packages/cli/src/commands/spec/deps.ts',
          symbols: ['registerSpecDeps'],
          confidence: 'HIGH',
          reasons: ['primary-symbol-match'],
          score: 300,
          alreadyIncluded: false,
        },
      ],
    })

    // HIT when graph and spec are fresh
    const retrieved = await cache.get('cli:spec-deps')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.specId).toBe('cli:spec-deps')

    // MISS when spec file hash changes
    mockRepo.get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [
        { filename: 'spec.md', lastModified: '2026-08-17T13:00:00Z', hash: 'hash-changed' },
      ],
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()

    // Reverse lookup code -> spec
    expect(await cache.findSpecByFile('cli:packages/cli/src/commands/spec/deps.ts')).toBe(
      'cli:spec-deps',
    )
    expect(await cache.findSpecByFile('packages/cli/src/commands/spec/deps.ts')).toBe(
      'cli:spec-deps',
    )
    expect(await cache.findSpecByFile('src/commands/spec/deps.ts')).toBe('cli:spec-deps')
    expect(await cache.findSpecByFile('unknown/file.ts')).toBeNull()

    // Test flush to disk
    await cache.flush()
    const diskContent = await readFile(
      join(testDir, '.specd', 'tmp', 'fs-cache', 'implementation-suggestions', 'suggestions.json'),
      'utf-8',
    )
    expect(diskContent).toContain('cli:spec-deps')
    expect(diskContent).toContain('fingerprint-1')
  })
})

describe('FsSpecDepsSuggestionCache', () => {
  const testDir = join(tmpdir(), `specd-deps-cache-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {})
  })

  it('performs self-validating get, set, flush and invalidate', async () => {
    const mockRepo = {
      get: vi.fn().mockResolvedValue({
        workspace: 'cli',
        path: 'spec-deps',
        artifacts: [
          { filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-abc' },
        ],
      }),
    } as unknown as SpecRepository

    const cache = new FsSpecDepsSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existingDependsOn: ['cli:host-context'],
      suggestedDependsOn: [
        { specId: 'cli:host-context', title: 'HostContext', reason: 'code import' },
      ],
    })

    const retrieved = await cache.get('cli:spec-deps')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.specId).toBe('cli:spec-deps')

    // MISS when the spec stamp changes
    mockRepo.get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [
        { filename: 'spec.md', lastModified: '2026-08-17T13:00:00Z', hash: 'hash-changed' },
      ],
    })
    expect(await cache.get('cli:spec-deps')).toBeNull()

    await cache.flush()
    const all = await cache.getAll()
    expect(all.size).toBe(1)

    await cache.invalidate()
    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('discards and regenerates a cache file persisted with an older cacheVersion', async () => {
    const cacheDir = join(testDir, '.specd', 'tmp', 'fs-cache', 'spec-deps-suggestions')
    await mkdir(cacheDir, { recursive: true })
    const cachePath = join(cacheDir, 'suggestions.json')
    await writeFile(
      cachePath,
      JSON.stringify({
        header: {
          updatedAt: '2026-01-01T00:00:00.000Z',
          projectDir: testDir,
          cacheVersion: '1.0.0',
        },
        specs: {
          'core:legacy': {
            specId: 'core:legacy',
            title: 'Legacy',
            specStamp: { lastModified: '', hash: '', artifacts: [] },
            existingDependsOn: [],
            suggestedDependsOn: [],
          },
        },
      }),
      'utf-8',
    )

    const cache = new FsSpecDepsSuggestionCache({ projectDir: testDir })

    // Version mismatch -> entry is not served.
    expect(await cache.get('core:legacy')).toBeNull()

    // Regeneration: next flush rewrites the file under the active version.
    await cache.set('core:fresh', {
      title: 'Fresh',
      existingDependsOn: [],
      suggestedDependsOn: [],
    })
    await cache.flush()

    const regenerated = JSON.parse(await readFile(cachePath, 'utf-8'))
    expect(regenerated.header.cacheVersion).toBe(SPEC_DEPS_CACHE_VERSION)
    expect(regenerated.specs['core:legacy']).toBeUndefined()
    expect(regenerated.specs['core:fresh']).toBeDefined()
  })
})
