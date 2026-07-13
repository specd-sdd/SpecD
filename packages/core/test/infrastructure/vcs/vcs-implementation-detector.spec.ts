import { describe, expect, it } from 'vitest'
import { Change, type ActorIdentity } from '../../../src/domain/entities/change.js'
import { VcsImplementationDetector } from '../../../src/infrastructure/vcs/vcs-implementation-detector.js'
import { NullVcsAdapter } from '../../../src/infrastructure/null/vcs-adapter.js'
import { VcsAdapter } from '../../../src/application/ports/vcs-adapter.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }

function makeChange(): Change {
  const createdAt = new Date('2024-01-01T00:00:00Z')
  const implementingAt = new Date('2024-01-03T12:00:00Z')
  return new Change({
    name: 'implementation-detector-test',
    createdAt,
    specIds: ['default:auth/login'],
    history: [
      {
        type: 'created',
        at: createdAt,
        by: actor,
        specIds: ['default:auth/login'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
      { type: 'transitioned', from: 'drafting', to: 'designing', at: createdAt, by: actor },
      { type: 'transitioned', from: 'designing', to: 'ready', at: createdAt, by: actor },
      { type: 'transitioned', from: 'ready', to: 'implementing', at: implementingAt, by: actor },
    ],
  })
}

function createAdapter(overrides: {
  readonly rootDir?: () => string
  readonly branch?: () => Promise<string>
  readonly isClean?: () => Promise<boolean>
  readonly ref?: () => Promise<string | null>
  readonly refAt?: (at: string) => Promise<string | null>
  readonly modifiedFiles?: (baseRef: string) => Promise<readonly string[]>
  readonly show?: (ref: string, filePath: string) => Promise<string | null>
  readonly identity?: () => Promise<{ name: string; email: string; provider: string }>
}): VcsAdapter {
  class TestVcsAdapter extends VcsAdapter {
    constructor() {
      super('/repo')
    }

    rootDir(): string {
      return overrides.rootDir?.() ?? '/repo'
    }

    branch(): Promise<string> {
      return overrides.branch?.() ?? Promise.resolve('main')
    }

    isClean(): Promise<boolean> {
      return overrides.isClean?.() ?? Promise.resolve(true)
    }

    ref(): Promise<string | null> {
      return overrides.ref?.() ?? Promise.resolve('HEAD')
    }

    refAt(at: string): Promise<string | null> {
      return overrides.refAt?.(at) ?? Promise.resolve('base-abc')
    }

    modifiedFiles(baseRef: string): Promise<readonly string[]> {
      return overrides.modifiedFiles?.(baseRef) ?? Promise.resolve([])
    }

    show(ref: string, filePath: string): Promise<string | null> {
      return overrides.show?.(ref, filePath) ?? Promise.resolve(null)
    }

    identity(): Promise<{ name: string; email: string; provider: string }> {
      return (
        overrides.identity?.() ??
        Promise.resolve({ name: 'Alice', email: 'alice@example.com', provider: 'git' })
      )
    }
  }

  return new TestVcsAdapter()
}

describe('VcsImplementationDetector', () => {
  it('resolves historical base ref and normalizes repo files to project-relative paths', async () => {
    const calls: string[] = []
    const adapter = createAdapter({
      rootDir() {
        calls.push('rootDir')
        return '/repo'
      },
      async ref() {
        calls.push('ref')
        return 'HEAD'
      },
      async refAt(at: string) {
        calls.push(`refAt:${at}`)
        return 'base-123'
      },
      async modifiedFiles(baseRef: string) {
        calls.push(`modifiedFiles:${baseRef}`)
        return ['packages/core/src/change.ts', 'README.md']
      },
      async show() {
        return null
      },
      async identity() {
        return { name: 'Alice', email: 'alice@example.com', provider: 'git' }
      },
    })

    const detector = new VcsImplementationDetector('/repo', adapter)
    const result = await detector.detectModifiedFiles(makeChange())

    expect(calls.some((call) => call.startsWith('refAt:'))).toBe(true)
    expect(calls).toContain('modifiedFiles:base-123')
    expect(result).toEqual(['packages/core/src/change.ts', 'README.md'])
  })

  it('falls back to current ref when historical lookup is unavailable', async () => {
    const adapter = createAdapter({
      rootDir() {
        return '/repo'
      },
      async ref() {
        return 'HEAD'
      },
      async refAt() {
        return null
      },
      async modifiedFiles(baseRef: string) {
        expect(baseRef).toBe('HEAD')
        return ['packages/core/src/change.ts']
      },
      async show() {
        return null
      },
      async identity() {
        return { name: 'Alice', email: 'alice@example.com', provider: 'git' }
      },
    })

    const detector = new VcsImplementationDetector('/repo', adapter)
    await expect(detector.detectModifiedFiles(makeChange())).resolves.toEqual([
      'packages/core/src/change.ts',
    ])
  })
})

describe('NullVcsAdapter', () => {
  it('returns safe defaults for refAt and modifiedFiles', async () => {
    const adapter = new NullVcsAdapter()

    await expect(adapter.refAt('2024-01-01T00:00:00Z')).resolves.toBeNull()
    await expect(adapter.modifiedFiles('HEAD')).resolves.toEqual([])
  })
})

describe('VcsImplementationDetector exclusion filtering', () => {
  function makeAdapter(files: string[]): VcsAdapter {
    return makeAdapterFromFiles(files)
  }

  function makeAdapterFromFiles(files: string[]): VcsAdapter {
    return createAdapter({
      async modifiedFiles() {
        return files
      },
    })
  }

  it('excludes files under specified excludePaths prefixes', async () => {
    const detector = new VcsImplementationDetector(
      '/repo',
      makeAdapter([
        'packages/core/src/change.ts',
        'specd-sdd/changes/20260603-foo/deltas/core/change/spec.md.delta.yaml',
        'specd-sdd/archive/old-change/manifest.json',
        'src/feature.ts',
      ]),
    )

    const result = await detector.detectModifiedFiles(makeChange(), {
      excludePaths: ['specd-sdd/changes', 'specd-sdd/archive'],
    })

    expect(result).toEqual(['packages/core/src/change.ts', 'src/feature.ts'])
  })

  it('does not exclude when excludePaths is omitted', async () => {
    const allFiles = ['packages/core/src/change.ts', 'specd-sdd/changes/foo/manifest.json']
    const detector = new VcsImplementationDetector('/repo', makeAdapter(allFiles))

    const result = await detector.detectModifiedFiles(makeChange())

    expect(result).toEqual(allFiles)
  })

  it('exact prefix match is excluded', async () => {
    const detector = new VcsImplementationDetector(
      '/repo',
      makeAdapter(['specd-sdd/changes', 'packages/core/src/change.ts']),
    )

    const result = await detector.detectModifiedFiles(makeChange(), {
      excludePaths: ['specd-sdd/changes'],
    })

    expect(result).toEqual(['packages/core/src/change.ts'])
  })
})
