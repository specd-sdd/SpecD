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

  it('treats a differing hash as stale even when lastModified matches', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-a' }],
    })
    const mockRepo = {
      get,
    } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    // Same lastModified, different content hash -> must NOT serve the cache.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-b' }],
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('keeps entries fresh on matching hashes even when lastModified drifts', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-a' }],
    })
    const mockRepo = {
      get,
    } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    // Same hash, drifted lastModified -> hash is authoritative, still fresh.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-09-01T00:00:00Z', hash: 'hash-a' }],
    })

    expect(await cache.get('cli:spec-deps')).not.toBeNull()
  })

  it('stage 1: equal size+mtime is a HIT without requesting any content hash', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })
    artifactMeta.mockClear()

    // Same mtime + same size: stage 1 decides, no hash fetch on read.
    expect(await cache.get('cli:spec-deps')).not.toBeNull()
    expect(artifactMeta).not.toHaveBeenCalled()
  })

  it('stage 1: a differing byte-size is a MISS without any hash comparison', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 250 }],
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('stage 2: drifted mtime with equal size falls through to hash precedence', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    // Content changed within the same byte length and a newer mtime.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-09-01T00:00:00Z', size: 100 }],
    })
    artifactMeta.mockResolvedValue({
      lastModified: '2026-09-01T00:00:00Z',
      size: 100,
      hash: 'hash-b',
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('stage 2: drifted mtime with equal size and equal hash stays fresh', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [],
    })

    // Pure mtime drift (e.g. touch): content identical -> still fresh.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-09-01T00:00:00Z', size: 100 }],
    })
    artifactMeta.mockResolvedValue({
      lastModified: '2026-09-01T00:00:00Z',
      size: 100,
      hash: 'hash-a',
    })

    expect(await cache.get('cli:spec-deps')).not.toBeNull()
  })

  it('ranks candidate specs by (confirmed, evidenceStrength, workspaceAffinity, capabilitySymbolAffinity, score)', async () => {
    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    // Spec A: fenced-code evidence (strength 3)
    await cache.set('sdk:parser', {
      title: 'Parser',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/parser.ts',
          symbols: ['parseSpec'],
          confidence: 'HIGH',
          reasons: ['fenced-code-evidence'],
          score: 180,
          alreadyIncluded: false,
        },
      ],
    })

    // Spec B: inline-code evidence (strength 2) with higher score
    await cache.set('sdk:parser-v2', {
      title: 'ParserV2',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/parser.ts',
          symbols: ['parseSpec'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 220,
          alreadyIncluded: false,
        },
      ],
    })

    // Spec A wins because evidence strength 3 > 2, despite Spec B having higher score
    expect(await cache.findSpecByFile('packages/sdk/src/parser.ts')).toBe('sdk:parser')
  })

  it('narrows candidates by symbol name when provided', async () => {
    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    await cache.set('sdk:alpha', {
      title: 'Alpha',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/shared.ts',
          symbols: ['AlphaSymbol'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    await cache.set('sdk:beta', {
      title: 'Beta',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/shared.ts',
          symbols: ['BetaSymbol'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    // Symbol narrowing picks alpha or beta based on symbolName
    expect(await cache.findSpecByFile('packages/sdk/src/shared.ts', 'AlphaSymbol')).toBe(
      'sdk:alpha',
    )
    expect(await cache.findSpecByFile('packages/sdk/src/shared.ts', 'BetaSymbol')).toBe('sdk:beta')
  })

  it('returns null on semantic ties and never uses insertion order as tie-breaker', async () => {
    const cache1 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    // Equal tuples for Spec 1 and Spec 2
    await cache1.set('sdk:spec-one', {
      title: 'SpecOne',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/tied.ts',
          symbols: ['SharedSym'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    await cache1.set('sdk:spec-two', {
      title: 'SpecTwo',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/tied.ts',
          symbols: ['SharedSym'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    expect(await cache1.findSpecByFile('packages/sdk/src/tied.ts')).toBeNull()

    // Permuted insertion order: still null
    const cache2 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    await cache2.set('sdk:spec-two', {
      title: 'SpecTwo',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/tied.ts',
          symbols: ['SharedSym'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    await cache2.set('sdk:spec-one', {
      title: 'SpecOne',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/tied.ts',
          symbols: ['SharedSym'],
          confidence: 'HIGH',
          reasons: ['inline-code-evidence'],
          score: 200,
          alreadyIncluded: false,
        },
      ],
    })

    expect(await cache2.findSpecByFile('packages/sdk/src/tied.ts')).toBeNull()
  })

  it('confirmed links authoritatively beat unconfirmed suggestions', async () => {
    const cache = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    await cache.set('sdk:confirmed-owner', {
      title: 'ConfirmedOwner',
      existing: {
        files: ['packages/sdk/src/authoritative.ts'],
        symbols: ['ConfirmedSym'],
        dependsOn: [],
      },
      suggestions: [],
    })

    await cache.set('sdk:suggested-owner', {
      title: 'SuggestedOwner',
      existing: { files: [], symbols: [], dependsOn: [] },
      suggestions: [
        {
          file: 'packages/sdk/src/authoritative.ts',
          symbols: ['ConfirmedSym'],
          confidence: 'HIGH',
          reasons: ['fenced-code-evidence'],
          score: 500,
          alreadyIncluded: false,
        },
      ],
    })

    expect(await cache.findSpecByFile('packages/sdk/src/authoritative.ts')).toBe(
      'sdk:confirmed-owner',
    )
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

  it('treats a differing hash as stale even when lastModified matches', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-a' }],
    })
    const mockRepo = {
      get,
    } as unknown as SpecRepository

    const cache = new FsSpecDepsSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existingDependsOn: [],
      suggestedDependsOn: [],
    })

    // Same lastModified, different content hash -> must NOT serve the cache.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', hash: 'hash-b' }],
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('deps cache stage 1: a differing byte-size is a MISS', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsSpecDepsSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existingDependsOn: [],
      suggestedDependsOn: [],
    })

    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 250 }],
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()
  })

  it('deps cache stage 2: drifted mtime with equal size falls through to hash precedence', async () => {
    const get = vi.fn().mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-08-17T12:00:00Z', size: 100 }],
    })
    const artifactMeta = vi
      .fn()
      .mockResolvedValue({ lastModified: '2026-08-17T12:00:00Z', size: 100, hash: 'hash-a' })
    const mockRepo = { get, artifactMeta } as unknown as SpecRepository

    const cache = new FsSpecDepsSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
      specRepositories: new Map([['cli', mockRepo]]),
    })

    await cache.set('cli:spec-deps', {
      title: 'SpecDeps',
      existingDependsOn: [],
      suggestedDependsOn: [],
    })

    // Content changed within the same byte length and a newer mtime.
    get.mockResolvedValue({
      workspace: 'cli',
      path: 'spec-deps',
      artifacts: [{ filename: 'spec.md', lastModified: '2026-09-01T00:00:00Z', size: 100 }],
    })
    artifactMeta.mockResolvedValue({
      lastModified: '2026-09-01T00:00:00Z',
      size: 100,
      hash: 'hash-b',
    })

    expect(await cache.get('cli:spec-deps')).toBeNull()

    // Pure mtime drift with identical content -> still fresh (hash-a === hash-a).
    artifactMeta.mockResolvedValue({
      lastModified: '2026-10-01T00:00:00Z',
      size: 100,
      hash: 'hash-a',
    })

    expect(await cache.get('cli:spec-deps')).not.toBeNull()
  })

  it('merges concurrent writes from multiple cache instances on flush without data loss', async () => {
    const cache1 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })
    const cache2 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    await cache1.set('cli:spec-a', {
      title: 'Spec A',
      suggestions: [{ file: 'a.ts', confidence: 'HIGH', reasons: [], score: 100, alreadyIncluded: false, symbols: [] }],
    })
    await cache1.flush()

    await cache2.set('cli:spec-b', {
      title: 'Spec B',
      suggestions: [{ file: 'b.ts', confidence: 'HIGH', reasons: [], score: 100, alreadyIncluded: false, symbols: [] }],
    })
    await cache2.flush()

    // Third reader should see BOTH spec-a and spec-b preserved
    const reader = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })
    const all = await reader.getAll()
    expect(all.has('cli:spec-a')).toBe(true)
    expect(all.has('cli:spec-b')).toBe(true)
  })

  it('withLock holds lock during execution and reloads fresh disk state', async () => {
    const cache1 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })
    const cache2 = new FsImplementationSuggestionCache({
      projectDir: testDir,
      configPath: '.specd',
    })

    await cache1.set('cli:spec-x', {
      title: 'Spec X',
      suggestions: [{ file: 'x.ts', confidence: 'HIGH', reasons: [], score: 100, alreadyIncluded: false, symbols: [] }],
    })
    await cache1.flush()

    await cache2.withLock(async () => {
      const all = await cache2.getAll()
      expect(all.has('cli:spec-x')).toBe(true)
    })
  })
})
