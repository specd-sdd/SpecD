import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { UpdateImplementationTracking } from '../../../src/application/use-cases/update-implementation-tracking.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { ImplementationFileNotFoundError } from '../../../src/application/errors/implementation-file-not-found-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeChangeRepository,
  makeFileReader,
  makeChange,
  makeSpecRepository,
  testActor,
} from './helpers.js'

const PROJECT_ROOT = '/test'
const COMMA_NAME =
  'docs/SpecD — Análisis de identidad LogicalSymbol, dependencias y casos de uso.md'

function hostFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([file, content]) => [
      file.startsWith(`${PROJECT_ROOT}/`)
        ? path.resolve(PROJECT_ROOT, file.slice(PROJECT_ROOT.length + 1))
        : file,
      content,
    ]),
  )
}

function makeUpdate(
  repo: ReturnType<typeof makeChangeRepository>,
  files: Record<string, string> = {},
  specRepositories: ReadonlyMap<string, ReturnType<typeof makeSpecRepository>> = new Map([
    ['core', makeSpecRepository()],
    ['default', makeSpecRepository()],
  ]),
  platform: NodeJS.Platform = process.platform,
) {
  return new UpdateImplementationTracking(
    repo,
    makeFileReader(hostFiles(files)),
    PROJECT_ROOT,
    specRepositories,
    platform,
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

    it('throws WorkspaceNotFoundError when specId has unknown workspace', async () => {
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
      ).rejects.toThrow(WorkspaceNotFoundError)
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

    it('rejects an invalid specId syntax before mutating', async () => {
      const change = changeInImplementing('invalid-spec-syntax', ['core:change'])
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/src/a.ts': 'export const a = 1;' },
        new Map([['core', makeSpecRepository({ specs: [] })]]),
      )

      await expect(
        uc.execute({
          name: 'invalid-spec-syntax',
          action: 'add',
          file: 'src/a.ts',
          specId: 'Core/Foo',
        }),
      ).rejects.toThrow(InvalidSpecIdError)
      expect(change.trackedImplementationFiles).toEqual([])
    })

    it('normalizes a bare specId to fully qualified', async () => {
      const change = changeInImplementing('bare-spec', ['default:auth/login'])
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/src/login.ts': 'export const login = 1;' },
        new Map([['default', makeSpecRepository({ specs: [] })]]),
      )

      const result = await uc.execute({
        name: 'bare-spec',
        action: 'add',
        file: 'src/login.ts',
        specId: 'auth/login',
      })

      expect(result.implementationTracking.links[0]!.specId).toBe('default:auth/login')
    })
  })

  describe('whole file names', () => {
    it('matches a comma-containing name exactly on ignore', async () => {
      const change = changeInImplementing('comma-name')
      change.trackImplementationFile(COMMA_NAME, 'open')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { [`/test/${COMMA_NAME}`]: '# notes' })

      const result = await uc.execute({
        name: 'comma-name',
        action: 'ignore',
        file: COMMA_NAME,
      })

      expect(
        result.implementationTracking.trackedFiles.find((f) => f.file === COMMA_NAME)?.state,
      ).toBe('ignored')
    })

    it('quotes the whole missing comma name', async () => {
      const change = changeInImplementing('missing-comma')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {})

      await expect(
        uc.execute({
          name: 'missing-comma',
          action: 'ignore',
          file: 'a,b.md',
        }),
      ).rejects.toThrow('Implementation file "a,b.md" does not exist')
    })

    it('preserves leading and trailing spaces in the name', async () => {
      const spaced = ' docs/ spaced name.md '
      const change = changeInImplementing('spaced-name')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { [`/test/${spaced}`]: 'x' })

      const result = await uc.execute({
        name: 'spaced-name',
        action: 'add',
        file: spaced,
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.some((f) => f.file === spaced)).toBe(true)
    })

    it('preserves quotes, backslashes, and non-ASCII on linux', async () => {
      const weird = 'docs/"quoted" — Análisis\\notes.md'
      const change = changeInImplementing('weird-name')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { [`/test/${weird}`]: 'x' }, undefined, 'linux')

      const result = await uc.execute({
        name: 'weird-name',
        action: 'add',
        file: weird,
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.some((f) => f.file === weird)).toBe(true)
    })

    it('accepts an SDK-style files array', async () => {
      const change = changeInImplementing('sdk-files')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {
        '/test/src/a.ts': 'a',
        '/test/src/b.ts': 'b',
      })

      const result = await uc.execute({
        name: 'sdk-files',
        action: 'add',
        files: ['src/a.ts', 'src/b.ts'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((f) => f.file).sort()).toEqual([
        'src/a.ts',
        'src/b.ts',
      ])
    })
  })

  describe('platform path normalization', () => {
    it('on win32 normalizes backslashes and matches tracked forward-slash paths', async () => {
      const change = changeInImplementing('win-norm')
      change.trackImplementationFile('packages/core/x.ts', 'open')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/packages/core/x.ts': 'export {}' }, undefined, 'win32')

      const result = await uc.execute({
        name: 'win-norm',
        action: 'resolve',
        file: 'packages\\core\\x.ts',
      })

      expect(result.implementationTracking.trackedFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'packages/core/x.ts', state: 'resolved' }),
        ]),
      )
    })

    it('on linux keeps a backslash as part of the file name', async () => {
      const change = changeInImplementing('linux-backslash')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/back\\slash.md': 'x' }, undefined, 'linux')

      const result = await uc.execute({
        name: 'linux-backslash',
        action: 'add',
        file: 'back\\slash.md',
        specId: 'core:change',
      })

      expect(
        result.implementationTracking.trackedFiles.some((f) => f.file === 'back\\slash.md'),
      ).toBe(true)
    })

    it('on win32 keeps a comma in a normalized path', async () => {
      const change = changeInImplementing('win-comma')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/docs/Análisis, dependencias.md': 'x' },
        undefined,
        'win32',
      )

      const result = await uc.execute({
        name: 'win-comma',
        action: 'add',
        file: 'docs\\Análisis, dependencias.md',
        specId: 'core:change',
      })

      expect(
        result.implementationTracking.trackedFiles.some(
          (f) => f.file === 'docs/Análisis, dependencias.md',
        ),
      ).toBe(true)
    })

    it('normalizes a win32 batch entry by entry', async () => {
      const change = changeInImplementing('win-batch')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        {
          '/test/packages/core/a.ts': 'a',
          '/test/packages/core/b.ts': 'b',
        },
        undefined,
        'win32',
      )

      const result = await uc.execute({
        name: 'win-batch',
        action: 'add',
        files: ['packages\\core\\a.ts', 'packages\\core\\b.ts'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((f) => f.file).sort()).toEqual([
        'packages/core/a.ts',
        'packages/core/b.ts',
      ])
    })

    it('leaves earlier files open when a four-file resolve batch has a missing fourth', async () => {
      const change = changeInImplementing('batch-missing-fourth')
      change.trackImplementationFile('src/a.ts', 'open')
      change.trackImplementationFile('src/b.ts', 'open')
      change.trackImplementationFile('src/c.ts', 'open')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {
        '/test/src/a.ts': 'a',
        '/test/src/b.ts': 'b',
        '/test/src/c.ts': 'c',
      })

      await expect(
        uc.execute({
          name: 'batch-missing-fourth',
          action: 'resolve',
          files: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/missing.ts'],
        }),
      ).rejects.toThrow(ImplementationFileNotFoundError)

      expect([...change.trackedImplementationFiles].map((f) => [f.file, f.state]).sort()).toEqual([
        ['src/a.ts', 'open'],
        ['src/b.ts', 'open'],
        ['src/c.ts', 'open'],
      ])
    })
  })

  describe('audit hardening: whole names and batches', () => {
    it('treats files: ["a.md", "b, c.md"] as exactly two files', async () => {
      const change = changeInImplementing('two-files')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/a.md': 'a', '/test/b, c.md': 'b' })

      const result = await uc.execute({
        name: 'two-files',
        action: 'add',
        files: ['a.md', 'b, c.md'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((f) => f.file).sort()).toEqual([
        'a.md',
        'b, c.md',
      ])
    })

    it('stores quotes, backslashes (linux) and non-ASCII names byte for byte', async () => {
      const names = ['"quoted".md', 'back\\slash.md', 'ñandú.md']
      const change = changeInImplementing('byte-names')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        Object.fromEntries(names.map((n) => [`/test/${n}`, 'x'])),
        undefined,
        'linux',
      )

      const result = await uc.execute({
        name: 'byte-names',
        action: 'add',
        files: names,
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((f) => f.file).sort()).toEqual(
        [...names].sort(),
      )
    })

    it('on win32 ignore normalizes a name that contains a comma', async () => {
      const change = changeInImplementing('win-ignore')
      change.trackImplementationFile('docs/Análisis, dependencias.md', 'open')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {}, undefined, 'win32')

      const result = await uc.execute({
        name: 'win-ignore',
        action: 'ignore',
        file: 'docs\\Análisis, dependencias.md',
      })

      expect(result.implementationTracking.trackedFiles).toEqual([
        expect.objectContaining({ file: 'docs/Análisis, dependencias.md', state: 'ignored' }),
      ])
    })

    it('on win32 normalizes ignore, resolve, unresolve and remove batches', async () => {
      const change = changeInImplementing('win-actions')
      change.trackImplementationFile('a/x.ts', 'open')
      change.trackImplementationFile('a/y.ts', 'open')
      const files = { '/test/a/x.ts': 'x', '/test/a/y.ts': 'y' }
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, files, undefined, 'win32')
      const batch = ['a\\x.ts', 'a\\y.ts']
      const states = (r: Awaited<ReturnType<typeof uc.execute>>) =>
        r.implementationTracking.trackedFiles.map((f) => `${f.file}:${f.state}`).sort()

      expect(
        states(await uc.execute({ name: 'win-actions', action: 'ignore', files: batch })),
      ).toEqual(['a/x.ts:ignored', 'a/y.ts:ignored'])
      expect(
        states(await uc.execute({ name: 'win-actions', action: 'resolve', files: batch })),
      ).toEqual(['a/x.ts:resolved', 'a/y.ts:resolved'])
      expect(
        states(await uc.execute({ name: 'win-actions', action: 'unresolve', files: batch })),
      ).toEqual(['a/x.ts:open', 'a/y.ts:open'])

      await uc.execute({
        name: 'win-actions',
        action: 'add',
        files: batch,
        specId: 'core:change',
      })
      const removed = await uc.execute({
        name: 'win-actions',
        action: 'remove',
        files: batch,
        specId: 'core:change',
      })
      expect(removed.implementationTracking.links).toEqual([])
    })

    it('persists a two-file ignore with a single ChangeRepository.mutate call', async () => {
      const change = changeInImplementing('one-mutate')
      change.trackImplementationFile('src/a.ts', 'open')
      change.trackImplementationFile('src/b.ts', 'open')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = makeUpdate(repo, {})

      await uc.execute({ name: 'one-mutate', action: 'ignore', files: ['src/a.ts', 'src/b.ts'] })

      expect(mutateSpy).toHaveBeenCalledTimes(1)
    })

    it('collapses duplicate batch entries', async () => {
      const change = changeInImplementing('dupes')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/src/a.ts': 'a' })

      const result = await uc.execute({
        name: 'dupes',
        action: 'add',
        files: ['src/a.ts', 'src/a.ts'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles).toHaveLength(1)
    })

    it('combines file and files: file first, then files', async () => {
      const change = changeInImplementing('combined')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/x': 'x', '/test/y': 'y' })

      const result = await uc.execute({
        name: 'combined',
        action: 'add',
        file: 'x',
        files: ['y'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((f) => f.file)).toEqual(['x', 'y'])
    })

    it('quotes the original win32 value when a file is missing', async () => {
      const change = changeInImplementing('win-missing')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {}, undefined, 'win32')

      await expect(
        uc.execute({
          name: 'win-missing',
          action: 'add',
          file: 'a\\b.ts',
          specId: 'core:change',
        }),
      ).rejects.toThrow('a\\b.ts')
    })

    it.each(['add', 'remove'] as const)(
      'rejects %s without specId with InvalidInputError and leaves the change untouched',
      async (action) => {
        const change = changeInImplementing(`no-spec-${action}`)
        const repo = makeChangeRepository([change])
        const mutateSpy = vi.spyOn(repo, 'mutate')
        const uc = makeUpdate(repo, { '/test/src/a.ts': 'a' })

        const err = await uc
          .execute({ name: `no-spec-${action}`, action, file: 'src/a.ts' })
          .catch((e: unknown) => e)

        expect(err).toBeInstanceOf(InvalidInputError)
        expect((err as Error).message).toBe(`specId is required for action "${action}"`)
        expect(mutateSpy).not.toHaveBeenCalled()
        expect(change.trackedImplementationFiles).toEqual([])
      },
    )

    it('reports a malformed specId before the first file failure', async () => {
      const change = changeInImplementing('bad-spec')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, {})

      await expect(
        uc.execute({
          name: 'bad-spec',
          action: 'add',
          file: 'src/missing.ts',
          specId: 'Bad Id',
        }),
      ).rejects.toThrow(InvalidSpecIdError)
    })
  })

  describe('case comparison follows the host platform', () => {
    it.each(['win32', 'darwin'] as const)(
      'collapses case aliases within one new add batch on %s',
      async (platform) => {
        const change = changeInImplementing('new-case-batch')
        const repo = makeChangeRepository([change])
        const mutateSpy = vi.spyOn(repo, 'mutate')
        const uc = makeUpdate(repo, { '/test/Docs/Notes.md': 'content' }, undefined, platform)

        const result = await uc.execute({
          name: 'new-case-batch',
          action: 'add',
          files: ['Docs/Notes.md', 'docs/notes.md'],
          specId: 'core:change',
        })

        expect(result.implementationTracking.trackedFiles.map((entry) => entry.file)).toEqual([
          'Docs/Notes.md',
        ])
        expect(result.implementationTracking.links.map((entry) => entry.file)).toEqual([
          'Docs/Notes.md',
        ])
        expect(mutateSpy).toHaveBeenCalledTimes(1)
      },
    )

    it('keeps new case variants distinct on Linux', async () => {
      const change = changeInImplementing('new-case-linux')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(
        repo,
        { '/test/Docs/Notes.md': 'upper', '/test/docs/notes.md': 'lower' },
        undefined,
        'linux',
      )

      const result = await uc.execute({
        name: 'new-case-linux',
        action: 'add',
        files: ['Docs/Notes.md', 'docs/notes.md'],
        specId: 'core:change',
      })

      expect(result.implementationTracking.trackedFiles.map((entry) => entry.file)).toEqual([
        'Docs/Notes.md',
        'docs/notes.md',
      ])
      expect(result.implementationTracking.links.map((entry) => entry.file)).toEqual([
        'Docs/Notes.md',
        'docs/notes.md',
      ])
    })

    it.each(['win32', 'darwin'] as const)(
      'treats a case-only difference as the same tracked file on %s and keeps the recorded spelling',
      async (platform) => {
        const change = changeInImplementing('case-insensitive')
        change.trackImplementationFile('Docs/Notes.md', 'open')
        const repo = makeChangeRepository([change])
        const uc = makeUpdate(repo, { '/test/Docs/Notes.md': 'content' }, undefined, platform)

        const result = await uc.execute({
          name: 'case-insensitive',
          action: 'resolve',
          file: 'docs/notes.md',
        })

        expect(result.implementationTracking.trackedFiles).toEqual([
          { file: 'Docs/Notes.md', state: 'resolved' },
        ])
      },
    )

    it('keeps case-only differences distinct on a case-sensitive host', async () => {
      const change = changeInImplementing('case-sensitive')
      change.trackImplementationFile('Docs/Notes.md', 'open')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo, { '/test/docs/notes.md': 'content' }, undefined, 'linux')

      await expect(
        uc.execute({ name: 'case-sensitive', action: 'resolve', file: 'docs/notes.md' }),
      ).rejects.toThrow(ImplementationFileNotFoundError)
      expect(change.trackedImplementationFiles).toEqual([{ file: 'Docs/Notes.md', state: 'open' }])
    })
  })

  describe('specId validation for start', () => {
    it('rejects a malformed specId and does not activate tracking', async () => {
      const change = changeInImplementing('start-bad-spec')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo)

      await expect(
        uc.execute({ name: 'start-bad-spec', action: 'start', specId: 'Bad Id' }),
      ).rejects.toThrow(InvalidSpecIdError)
    })

    it('reports when tracking started', async () => {
      const change = changeInImplementing('start-ok')
      const repo = makeChangeRepository([change])
      const uc = makeUpdate(repo)

      const result = await uc.execute({ name: 'start-ok', action: 'start' })

      expect(result.trackingStartedAt).toBeInstanceOf(Date)
    })
  })
})
