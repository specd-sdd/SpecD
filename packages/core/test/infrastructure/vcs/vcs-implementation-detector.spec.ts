import { describe, expect, it } from 'vitest'
import { Change, type ActorIdentity } from '../../../src/domain/entities/change.js'
import { VcsImplementationDetector } from '../../../src/infrastructure/vcs/vcs-implementation-detector.js'
import { NullVcsAdapter } from '../../../src/infrastructure/null/vcs-adapter.js'
import { type VcsAdapter } from '../../../src/application/ports/vcs-adapter.js'

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

describe('VcsImplementationDetector', () => {
  it('resolves historical base ref and normalizes repo files to project-relative paths', async () => {
    const calls: string[] = []
    const adapter: VcsAdapter = {
      async rootDir() {
        calls.push('rootDir')
        return '/repo'
      },
      async branch() {
        return 'main'
      },
      async isClean() {
        return true
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
    }

    const detector = new VcsImplementationDetector('/repo', adapter)
    const result = await detector.detectModifiedFiles(makeChange())

    expect(calls.some((call) => call.startsWith('refAt:'))).toBe(true)
    expect(calls).toContain('modifiedFiles:base-123')
    expect(result).toEqual(['packages/core/src/change.ts', 'README.md'])
  })

  it('falls back to current ref when historical lookup is unavailable', async () => {
    const adapter: VcsAdapter = {
      async rootDir() {
        return '/repo'
      },
      async branch() {
        return 'main'
      },
      async isClean() {
        return true
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
    }

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
