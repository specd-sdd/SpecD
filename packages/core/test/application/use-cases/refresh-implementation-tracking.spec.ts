import { describe, it, expect, vi } from 'vitest'
import { RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import {
  makeChangeRepository,
  makeArchiveRepository,
  makeFileReader,
  makeChange,
  testActor,
} from './helpers.js'

const PROJECT_ROOT = '/test'

function makeRefresh(
  repo: ReturnType<typeof makeChangeRepository>,
  detectModifiedFiles: (
    change: ReturnType<typeof makeChange>,
    options?: { excludePaths?: readonly string[] },
  ) => Promise<readonly string[]> = async () => [],
  files: Record<string, string> = {},
  archives: ReturnType<typeof makeArchiveRepository> = makeArchiveRepository(),
) {
  return new RefreshImplementationTracking(
    repo,
    archives,
    { detectModifiedFiles },
    makeFileReader(files),
    PROJECT_ROOT,
  )
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

  it('passes exclusion paths to detector', async () => {
    const change = changeInImplementing('excl-change')
    const repo = makeChangeRepository([change])
    const detectModifiedFiles = vi.fn().mockResolvedValue([])
    const uc = makeRefresh(repo, detectModifiedFiles)

    await uc.execute({ name: 'excl-change' })

    expect(detectModifiedFiles).toHaveBeenCalledTimes(1)
    const options = detectModifiedFiles.mock.calls[0]![1]
    expect(options?.excludePaths).toBeDefined()
    expect(options.excludePaths!.length).toBeGreaterThan(0)
  })

  it('tracks new detected paths as open when the file exists', async () => {
    const change = changeInImplementing('new-path')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'], {
      '/test/packages/core/src/foo.ts': 'content',
    })

    const result = await uc.execute({ name: 'new-path' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'open' },
    ])
    const persisted = await repo.get('new-path')
    expect(persisted?.trackedImplementationFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'open' },
    ])
  })

  it('marks detected files as removed when they do not exist on disk', async () => {
    const change = changeInImplementing('new-missing')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'], {})

    const result = await uc.execute({ name: 'new-missing' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'removed' },
    ])
  })

  it('preserves existing resolved review state for detected paths when file exists', async () => {
    const change = changeInImplementing('resolved-path')
    change.trackImplementationFile('packages/core/src/foo.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'], {
      '/test/packages/core/src/foo.ts': 'content',
    })

    const result = await uc.execute({ name: 'resolved-path' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'resolved' },
    ])
  })

  it('preserves existing ignored review state for detected paths', async () => {
    const change = changeInImplementing('ignored-path')
    change.trackImplementationFile('packages/core/src/foo.ts', 'ignored')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'])

    const result = await uc.execute({ name: 'ignored-path' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'ignored' },
    ])
  })

  it('revives removed files to open when detected and the file exists', async () => {
    const change = changeInImplementing('revive-detected')
    change.trackImplementationFile('packages/core/src/foo.ts', 'removed')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => ['packages/core/src/foo.ts'], {
      '/test/packages/core/src/foo.ts': 'content',
    })

    const result = await uc.execute({ name: 'revive-detected' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'packages/core/src/foo.ts', state: 'open' },
    ])
  })

  it('transitions missing open files to removed', async () => {
    const change = changeInImplementing('missing-open')
    change.trackImplementationFile('src/missing.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], {})

    const result = await uc.execute({ name: 'missing-open' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/missing.ts', state: 'removed' },
    ])
  })

  it('transitions missing resolved files to removed', async () => {
    const change = changeInImplementing('missing-resolved')
    change.trackImplementationFile('src/missing.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], {})

    const result = await uc.execute({ name: 'missing-resolved' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/missing.ts', state: 'removed' },
    ])
  })

  it('preserves ignored state even when file is missing', async () => {
    const change = changeInImplementing('ignored-missing')
    change.trackImplementationFile('src/ignored.ts', 'ignored')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], {})

    const result = await uc.execute({ name: 'ignored-missing' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/ignored.ts', state: 'ignored' },
    ])
  })

  it('removes links when a tracked file becomes removed', async () => {
    const change = changeInImplementing('link-cleanup')
    change.trackImplementationFile('src/gone.ts', 'open')
    change.addImplementationLink({
      specId: 'default:core/foo',
      file: 'src/gone.ts',
      fileLinkExplicit: true,
    })
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], {})

    const result = await uc.execute({ name: 'link-cleanup' })

    expect(result.implementationTracking.links).toEqual([])
    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/gone.ts', state: 'removed' },
    ])
  })

  it('resurrects removed files to open when they exist again', async () => {
    const change = changeInImplementing('resurrect')
    change.trackImplementationFile('src/back.ts', 'removed')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], { '/test/src/back.ts': 'content' })

    const result = await uc.execute({ name: 'resurrect' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/back.ts', state: 'open' },
    ])
  })

  it('keeps existing open files as open when they exist', async () => {
    const change = changeInImplementing('still-open')
    change.trackImplementationFile('src/exists.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeRefresh(repo, async () => [], { '/test/src/exists.ts': 'content' })

    const result = await uc.execute({ name: 'still-open' })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/exists.ts', state: 'open' },
    ])
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
