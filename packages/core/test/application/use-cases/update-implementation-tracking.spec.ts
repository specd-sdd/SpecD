import { describe, it, expect } from 'vitest'
import { UpdateImplementationTracking } from '../../../src/application/use-cases/update-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ImplementationFileNotFoundError } from '../../../src/application/errors/implementation-file-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeChangeRepository,
  makeFileReader,
  makeChange,
  makeSpecRepository,
  testActor,
} from './helpers.js'

const PROJECT_ROOT = '/test'

function makeUpdate(
  repo: ReturnType<typeof makeChangeRepository>,
  files: Record<string, string> = {},
  specRepositories?: ReadonlyMap<string, ReturnType<typeof makeSpecRepository>>,
) {
  return new UpdateImplementationTracking(
    repo,
    makeFileReader(files),
    PROJECT_ROOT,
    specRepositories,
  )
}

function changeInImplementing(name: string, specIds: string[] = ['core:change']) {
  const change = makeChange(name, { specIds })
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

  it('validates every resolved file before applying an atomic batch', async () => {
    const change = changeInImplementing('resolve-batch')
    change.trackImplementationFile('src/first.ts', 'open')
    change.trackImplementationFile('src/missing.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/first.ts': 'content' })

    await expect(
      uc.execute({
        name: 'resolve-batch',
        action: 'resolve',
        file: 'src/first.ts',
        files: ['src/first.ts', 'src/missing.ts'],
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)

    expect(change.trackedImplementationFiles).toEqual([
      { file: 'src/first.ts', state: 'open' },
      { file: 'src/missing.ts', state: 'open' },
    ])
  })

  it('does not partially unresolve when a later batch file is invalid', async () => {
    const change = changeInImplementing('unresolve-batch')
    change.trackImplementationFile('src/first.ts', 'resolved')
    change.trackImplementationFile('src/missing.ts', 'resolved')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, { '/test/src/first.ts': 'content' })

    await expect(
      uc.execute({
        name: 'unresolve-batch',
        action: 'unresolve',
        file: 'src/first.ts',
        files: ['src/first.ts', 'src/missing.ts'],
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
    expect(change.trackedImplementationFiles.map((entry) => entry.state)).toEqual([
      'resolved',
      'resolved',
    ])
  })

  it('does not partially ignore when a later untracked batch file is missing', async () => {
    const change = changeInImplementing('ignore-batch')
    change.trackImplementationFile('src/first.ts', 'open')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await expect(
      uc.execute({
        name: 'ignore-batch',
        action: 'ignore',
        file: 'src/first.ts',
        files: ['src/first.ts', 'src/missing.ts'],
      }),
    ).rejects.toThrow(ImplementationFileNotFoundError)
    expect(change.trackedImplementationFiles).toEqual([{ file: 'src/first.ts', state: 'open' }])
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

  it('start activates implementation tracking on change without requiring file', async () => {
    const change = makeChange('start-tracking')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    expect(change.isImplementationTrackingActive).toBe(false)

    const result = await uc.execute({
      name: 'start-tracking',
      action: 'start',
    })

    expect(change.isImplementationTrackingActive).toBe(true)
    expect(change.implementationTrackingStartedAt).not.toBeNull()
    expect(result.implementationTracking).toBeDefined()
  })

  it('start is idempotent and preserves initial timestamp on repeated execution', async () => {
    const change = makeChange('start-idempotent')
    const repo = makeChangeRepository([change])
    const uc = makeUpdate(repo, {})

    await uc.execute({ name: 'start-idempotent', action: 'start' })
    const initialTimestamp = change.implementationTrackingStartedAt

    await uc.execute({ name: 'start-idempotent', action: 'start' })
    expect(change.implementationTrackingStartedAt).toEqual(initialTimestamp)
  })

  describe('specId validation on add', () => {
    it('succeeds when specId is declared in change.specIds', async () => {
      const change = changeInImplementing('in-scope-spec', ['core:change'])
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/src/foo.ts': 'export const x = 1;' },
        new Map([['core', makeSpecRepository({ specs: [] })]]),
      )

      const result = await uc.execute({
        name: 'in-scope-spec',
        action: 'add',
        file: 'src/foo.ts',
        specId: 'core:change',
      })

      expect(result.implementationTracking.links).toHaveLength(1)
      expect(result.implementationTracking.links[0]!.specId).toBe('core:change')
    })

    it('succeeds when specId is out of scope but exists in canonical spec repository', async () => {
      const change = changeInImplementing('out-of-scope-existing', ['core:change'])
      const repo = makeChangeRepository([change])
      const specRepo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/oauth', filenames: ['spec.md'] })],
      })
      const uc = makeUpdate(
        repo,
        { '/test/src/oauth.ts': 'export const oauth = 1;' },
        new Map([['default', specRepo]]),
      )

      const result = await uc.execute({
        name: 'out-of-scope-existing',
        action: 'add',
        file: 'src/oauth.ts',
        specId: 'default:auth/oauth',
      })

      expect(result.implementationTracking.links).toHaveLength(1)
      expect(result.implementationTracking.links[0]!.specId).toBe('default:auth/oauth')
    })

    it('throws SpecNotFoundError when specId is out of scope and does not exist in repository', async () => {
      const change = changeInImplementing('out-of-scope-nonexistent', ['core:change'])
      const repo = makeChangeRepository([change])
      const specRepo = makeSpecRepository({ specs: [] })
      const uc = makeUpdate(
        repo,
        { '/test/src/entry.ts': 'export class ArchiveListEntry {}' },
        new Map([['core', specRepo]]),
      )

      await expect(
        uc.execute({
          name: 'out-of-scope-nonexistent',
          action: 'add',
          file: 'src/entry.ts',
          specId: 'core:archive-list-entry',
        }),
      ).rejects.toThrow(SpecNotFoundError)
    })

    it('throws SpecNotFoundError when specId has unknown workspace', async () => {
      const change = changeInImplementing('unknown-ws', ['core:change'])
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/src/entry.ts': 'export class Foo {}' },
        new Map([['core', makeSpecRepository({ specs: [] })]]),
      )

      await expect(
        uc.execute({
          name: 'unknown-ws',
          action: 'add',
          file: 'src/entry.ts',
          specId: 'unknown-workspace:some-spec',
        }),
      ).rejects.toThrow(SpecNotFoundError)
    })

    it('rejects batch add atomically and tracks no files when specId is invalid', async () => {
      const change = changeInImplementing('batch-invalid-spec', ['core:change'])
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        {
          '/test/src/a.ts': 'export const a = 1;',
          '/test/src/b.ts': 'export const b = 2;',
        },
        new Map([['core', makeSpecRepository({ specs: [] })]]),
      )

      await expect(
        uc.execute({
          name: 'batch-invalid-spec',
          action: 'add',
          file: 'src/a.ts',
          files: ['src/a.ts', 'src/b.ts'],
          specId: 'core:nonexistent',
        }),
      ).rejects.toThrow(SpecNotFoundError)

      expect(change.trackedImplementationFiles).toEqual([])
      expect(change.implementationLinks).toEqual([])
    })
  })
})
