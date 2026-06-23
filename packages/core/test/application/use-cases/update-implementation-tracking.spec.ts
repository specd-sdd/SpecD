import { describe, it, expect } from 'vitest'
import { UpdateImplementationTracking } from '../../../src/application/use-cases/update-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ImplementationFileNotFoundError } from '../../../src/application/errors/implementation-file-not-found-error.js'
import { makeChangeRepository, makeFileReader, makeChange, testActor } from './helpers.js'

const PROJECT_ROOT = '/test'

function makeUpdate(
  repo: ReturnType<typeof makeChangeRepository>,
  files: Record<string, string> = {},
) {
  return new UpdateImplementationTracking(repo, makeFileReader(files), PROJECT_ROOT)
}

function changeInImplementing(name: string) {
  const change = makeChange(name)
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  return change
}

describe('UpdateImplementationTracking', () => {
  it('throws ChangeNotFoundError when change is missing', async () => {
    const uc = makeUpdate(makeChangeRepository())

    await expect(
      uc.execute({
        name: 'missing',
        action: 'add',
        file: 'src/foo.ts',
        specId: 'core:change',
      }),
    ).rejects.toThrow(ChangeNotFoundError)
  })

  it('add requires the file to exist on disk', async () => {
    const change = changeInImplementing('add-missing')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await expect(
      uc.execute({
        name: 'add-missing',
        action: 'add',
        file: 'src/missing.ts',
        specId: 'core:change',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('add succeeds when the file exists', async () => {
    const change = changeInImplementing('add-exists')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/foo.ts': 'content' })

    const result = await uc.execute({
      name: 'add-exists',
      action: 'add',
      file: 'src/foo.ts',
      specId: 'core:change',
    })

    expect(result.implementationTracking.links.length).toBeGreaterThan(0)
  })

  it('resolve requires the file to exist on disk', async () => {
    const change = changeInImplementing('resolve-missing')
    change.trackImplementationFile('src/gone.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await expect(
      uc.execute({
        name: 'resolve-missing',
        action: 'resolve',
        file: 'src/gone.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('resolve succeeds when the file exists', async () => {
    const change = changeInImplementing('resolve-exists')
    change.trackImplementationFile('src/foo.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/foo.ts': 'content' })

    const result = await uc.execute({
      name: 'resolve-exists',
      action: 'resolve',
      file: 'src/foo.ts',
    })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/foo.ts', state: 'resolved' },
    ])
  })

  it('resolve rejects files that are not already tracked', async () => {
    const change = changeInImplementing('resolve-untracked')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/foo.ts': 'content' })

    await expect(
      uc.execute({
        name: 'resolve-untracked',
        action: 'resolve',
        file: 'src/foo.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('unresolve requires the file to exist on disk', async () => {
    const change = changeInImplementing('unresolve-missing')
    change.trackImplementationFile('src/gone.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await expect(
      uc.execute({
        name: 'unresolve-missing',
        action: 'unresolve',
        file: 'src/gone.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('unresolve refuses to reopen removed files', async () => {
    const change = changeInImplementing('unresolve-removed')
    change.trackImplementationFile('src/removed.ts', 'removed')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/removed.ts': 'content' })

    await expect(
      uc.execute({
        name: 'unresolve-removed',
        action: 'unresolve',
        file: 'src/removed.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('unresolve succeeds for resolved files that exist', async () => {
    const change = changeInImplementing('unresolve-ok')
    change.trackImplementationFile('src/foo.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/foo.ts': 'content' })

    const result = await uc.execute({
      name: 'unresolve-ok',
      action: 'unresolve',
      file: 'src/foo.ts',
    })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/foo.ts', state: 'open' },
    ])
  })

  it('unresolve rejects files that are not already tracked', async () => {
    const change = changeInImplementing('unresolve-untracked')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/foo.ts': 'content' })

    await expect(
      uc.execute({
        name: 'unresolve-untracked',
        action: 'unresolve',
        file: 'src/foo.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('ignore allows already-tracked missing files', async () => {
    const change = changeInImplementing('ignore-tracked-missing')
    change.trackImplementationFile('src/gone.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    const result = await uc.execute({
      name: 'ignore-tracked-missing',
      action: 'ignore',
      file: 'src/gone.ts',
    })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/gone.ts', state: 'ignored' },
    ])
  })

  it('ignore rejects untracked missing files', async () => {
    const change = changeInImplementing('ignore-untracked-missing')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await expect(
      uc.execute({
        name: 'ignore-untracked-missing',
        action: 'ignore',
        file: 'src/untracked.ts',
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
  })

  it('ignore preserves live links for tracked files', async () => {
    const change = changeInImplementing('ignore-linked')
    change.trackImplementationFile('src/linked.ts', 'open')
    change.addImplementationLink({
      specId: 'default:core/foo',
      file: 'src/linked.ts',
      fileLinkExplicit: true,
    })
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/linked.ts': 'content' })

    const result = await uc.execute({
      name: 'ignore-linked',
      action: 'ignore',
      file: 'src/linked.ts',
    })

    expect(result.implementationTracking.trackedFiles).toEqual([
      { file: 'src/linked.ts', state: 'ignored' },
    ])
    expect(result.implementationTracking.links).toEqual([
      {
        specId: 'default:core/foo',
        file: 'src/linked.ts',
        fileLinkExplicit: true,
      },
    ])
  })

  it('remove does not require file existence', async () => {
    const change = changeInImplementing('remove-missing')
    change.trackImplementationFile('src/gone.ts', 'open')
    change.addImplementationLink({
      specId: 'default:core/foo',
      file: 'src/gone.ts',
      fileLinkExplicit: true,
    })
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    const result = await uc.execute({
      name: 'remove-missing',
      action: 'remove',
      file: 'src/gone.ts',
      specId: 'default:core/foo',
    })

    expect(result.implementationTracking.links).toEqual([])
  })
})
