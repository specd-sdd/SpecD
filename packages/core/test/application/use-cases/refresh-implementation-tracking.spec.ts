import { describe, it, expect, vi } from 'vitest'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'

function makeRefresh(
  repo: ReturnType<typeof makeChangeRepository>,
  detectModifiedFiles: (
    change: ReturnType<typeof makeChange>,
  ) => Promise<readonly string[]> = async () => [],
) {
  return new RefreshImplementationTracking(repo, { detectModifiedFiles })
}

function changeInImplementing(name: string) {
  const change = makeChange(name)
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

describe('RefreshImplementationTracking', () => {
  it('throws ChangeNotFoundError when change is missing', async () => {
    const uc = makeRefresh(makeChangeRepository())

    await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
  })

  it('skips detector when change has never entered implementing', async () => {
    const change = makeChange('draft-only')
    const repo = makeChangeRepository([change])
    const detectModifiedFiles = vi.fn().mockResolvedValue(['packages/core/src/foo.ts'])
    const uc = makeRefresh(repo, detectModifiedFiles)

    const result = await uc.execute({ name: 'draft-only' })

    expect(detectModifiedFiles).not.toHaveBeenCalled()
    expect(result.implementationTracking.trackedFiles).toEqual([])
  })

  it('invokes detector when change has entered implementing', async () => {
    const change = changeInImplementing('impl-change')
    const repo = makeChangeRepository([change])
    const detectModifiedFiles = vi.fn().mockResolvedValue([])
    const uc = makeRefresh(repo, detectModifiedFiles)

    await uc.execute({ name: 'impl-change' })

    expect(detectModifiedFiles).toHaveBeenCalledTimes(1)
  })

  it('tracks new detected paths as open', async () => {
    const change = changeInImplementing('new-path')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'])

    const result = await uc.execute({ name: 'new-path' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'open' },
    ])
    const persisted = await repo.get('new-path')
    expect(persisted?.trackedImplementationFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'open' },
    ])
  })

  it('preserves existing resolved review state for detected paths', async () => {
    const change = changeInImplementing('resolved-path')
    change.trackImplementationFile('packages/core/src/foo.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'])

    const result = await uc.execute({ name: 'resolved-path' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'resolved' },
    ])
  })

  it('does not persist when detector finds no new tracked files', async () => {
    const change = changeInImplementing('stable-paths')
    change.trackImplementationFile('packages/core/src/foo.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const before = repo.store.get('stable-paths')?.updatedAt.toISOString()
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'])

    const result = await uc.execute({ name: 'stable-paths' })
    const after = repo.store.get('stable-paths')?.updatedAt.toISOString()

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'resolved' },
    ])
    expect(after).toBe(before)
  })

  it('returns trackedFiles and links projection', async () => {
    const change = changeInImplementing('projection')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo)

    const result = await uc.execute({ name: 'projection' })

    expect(result.implementationTracking).toMatchObject({
      trackedFiles: [],
      links: expect.any(Array),
    })
  })
})
