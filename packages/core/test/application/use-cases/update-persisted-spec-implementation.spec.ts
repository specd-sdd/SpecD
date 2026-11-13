import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { UpdatePersistedSpecImplementation } from '../../../src/application/use-cases/update-persisted-spec-implementation.js'
import { ImplementationFileNotFoundError } from '../../../src/domain/errors/implementation-file-not-found-error.js'
import { ImplementationWorkspaceBoundaryError } from '../../../src/domain/errors/implementation-workspace-boundary-error.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeFileReader,
  makeGetActiveSchema,
  makeListWorkspaces,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

function makeUseCase(repo: ReturnType<typeof makeSpecRepository>) {
  return new UpdatePersistedSpecImplementation(
    new Map([['default', repo]]),
    makeListWorkspaces(new Map([['default', repo]])),
    makeFileReader(),
    makeGetActiveSchema(makeSchema()),
    {
      parsers: makeParsers(),
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    },
  )
}

describe('UpdatePersistedSpecImplementation', () => {
  it('throws when adding a missing file', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        action: 'add',
        file: 'src/missing.ts',
      }),
    ).rejects.toBeInstanceOf(ImplementationFileNotFoundError)
  })

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const getSpy = vi.spyOn(repo, 'get')
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const useCase = makeUseCase(repo)

    await expect(useCase.execute({ specId: '', action: 'add', file: 'src/x.ts' })).rejects.toThrow(
      InvalidSpecIdError,
    )

    expect(getSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const repo = makeSpecRepository()
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({
        specId: 'unknown:auth/login',
        action: 'add',
        file: 'src/x.ts',
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('resolves a bare specId to the default workspace before file checks', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({
        specId: 'auth/login',
        action: 'add',
        file: 'src/missing.ts',
      }),
    ).rejects.toBeInstanceOf(ImplementationFileNotFoundError)
  })
})

describe('UpdatePersistedSpecImplementation confinement and links', () => {
  const CODE_ROOT = '/test/code/default'
  const SCHEMA = { name: 'specd-std', version: 1 }

  function setup(files: string[] = ['src/x.ts'], ownership: 'owned' | 'readOnly' = 'owned') {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
      ownership,
    })
    const reader = makeFileReader(
      Object.fromEntries(files.map((file) => [path.resolve(CODE_ROOT, file), 'content'])),
    )
    const readSpy = vi.spyOn(reader, 'read')
    const useCase = new UpdatePersistedSpecImplementation(
      new Map([['default', repo]]),
      makeListWorkspaces(new Map([['default', repo]])),
      reader,
      makeGetActiveSchema(makeSchema()),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )
    return { spec, repo, useCase, readSpy }
  }

  const ESCAPES = [
    '../x',
    path.resolve('/test/code', 'other', 'x'),
    path.resolve('/test/code', 'default-evil', 'x'),
    'default:../x',
    'default:../../etc/passwd',
    'other:src/x.ts',
    '.',
  ]

  it.each(ESCAPES)(
    'rejects %j with ImplementationWorkspaceBoundaryError and leaves state untouched',
    async (file) => {
      const { repo, useCase } = setup()
      const writeSpy = vi.spyOn(repo, 'writePersistedState')

      await expect(
        useCase.execute({ specId: 'default:auth/login', action: 'add', file }),
      ).rejects.toBeInstanceOf(ImplementationWorkspaceBoundaryError)

      expect(writeSpy).not.toHaveBeenCalled()
    },
  )

  it('rejects an invalid action with InvalidInputError before touching repositories', async () => {
    const { useCase, repo } = setup()
    const getSpy = vi.spyOn(repo, 'get')

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        action: 'bogus' as 'add',
        file: 'src/a.ts',
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('does not treat a drive-letter path as a workspace qualifier', async () => {
    const { useCase } = setup([])

    const result = useCase.execute({
      specId: 'default:auth/login',
      action: 'add',
      file: 'C:\\x',
    })

    // On Windows `C:\x` is outside codeRoot; on POSIX it is a plain missing filename. Either way `C:` is not treated as a workspace.
    const expectedError =
      process.platform === 'win32'
        ? ImplementationWorkspaceBoundaryError
        : ImplementationFileNotFoundError
    await expect(result).rejects.toBeInstanceOf(expectedError)
  })

  it('stores a nested path with forward slashes under the workspace qualifier', async () => {
    const { useCase } = setup(['src/deep/nested/x.ts'])

    const result = await useCase.execute({
      specId: 'default:auth/login',
      action: 'add',
      file: 'src/deep/nested/x.ts',
    })

    expect(result.implementation).toEqual([{ file: 'default:src/deep/nested/x.ts' }])
    expect(result.created).toBe(true)
  })

  it('accepts an own-workspace qualifier', async () => {
    const { useCase } = setup()

    const result = await useCase.execute({
      specId: 'default:auth/login',
      action: 'add',
      file: 'default:src/x.ts',
    })

    expect(result.implementation).toEqual([{ file: 'default:src/x.ts' }])
  })

  it('adds symbols to a file-level link, then removes symbols, the last symbol and the entry', async () => {
    const { useCase } = setup()
    const base = { specId: 'default:auth/login', file: 'src/x.ts' }

    await useCase.execute({ ...base, action: 'add' })
    const added = await useCase.execute({ ...base, action: 'add', symbols: ['A', 'B'] })
    expect(added.implementation).toEqual([{ file: 'default:src/x.ts', symbols: ['A', 'B'] }])
    expect(added.created).toBe(false)

    const afterOne = await useCase.execute({ ...base, action: 'remove', symbols: ['A'] })
    expect(afterOne.implementation).toEqual([{ file: 'default:src/x.ts', symbols: ['B'] }])

    const afterLast = await useCase.execute({ ...base, action: 'remove', symbols: ['B'] })
    expect(afterLast.implementation).toEqual([])

    await useCase.execute({ ...base, action: 'add' })
    const removed = await useCase.execute({ ...base, action: 'remove' })
    expect(removed.implementation).toEqual([])
  })

  it('creates state on a lock-less add (expectedRevision null)', async () => {
    const { spec, repo, useCase } = setup()
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    const result = await useCase.execute({
      specId: 'default:auth/login',
      action: 'add',
      file: 'src/x.ts',
    })

    expect(result.created).toBe(true)
    expect(writeSpy).toHaveBeenCalledWith(spec, expect.anything(), { expectedRevision: null })
  })

  it('does not write when removing from missing state', async () => {
    const { repo, useCase } = setup()
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    const result = await useCase.execute({
      specId: 'default:auth/login',
      action: 'remove',
      file: 'src/x.ts',
    })

    expect(result).toEqual({ specId: 'default:auth/login', implementation: [], created: false })
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('passes the observed originalHash as expectedRevision and propagates ArtifactConflictError', async () => {
    const { spec, repo, useCase } = setup()
    vi.spyOn(repo, 'readPersistedState').mockResolvedValue({
      schema: SCHEMA,
      dependsOn: [],
      implementation: [],
      originalHash: 'sha256:observed',
    })
    const writeSpy = vi
      .spyOn(repo, 'writePersistedState')
      .mockRejectedValue(new ArtifactConflictError('spec-lock.json', 'new', 'old'))

    await expect(
      useCase.execute({ specId: 'default:auth/login', action: 'add', file: 'src/x.ts' }),
    ).rejects.toBeInstanceOf(ArtifactConflictError)

    expect(writeSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).toHaveBeenCalledWith(spec, expect.anything(), {
      expectedRevision: 'sha256:observed',
    })
  })

  it('throws SpecNotFoundError for an unknown spec', async () => {
    const { useCase } = setup()

    await expect(
      useCase.execute({ specId: 'default:auth/ghost', action: 'add', file: 'src/x.ts' }),
    ).rejects.toBeInstanceOf(SpecNotFoundError)
  })

  it('rejects a readOnly workspace with the forSpec message', async () => {
    const { useCase } = setup(['src/x.ts'], 'readOnly')

    const err = await useCase
      .execute({ specId: 'auth/login', action: 'add', file: 'src/x.ts' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
    expect((err as Error).message).toBe(
      'Cannot modify spec "default:auth/login" — workspace "default" is readOnly.',
    )
  })

  it('checks file existence after confinement and before reading persisted state', async () => {
    const { repo, useCase, readSpy } = setup()
    const stateSpy = vi.spyOn(repo, 'readPersistedState')

    await useCase.execute({ specId: 'default:auth/login', action: 'add', file: 'src/x.ts' })

    expect(readSpy.mock.invocationCallOrder[0]!).toBeLessThan(stateSpy.mock.invocationCallOrder[0]!)
  })

  it('does not read persisted state when the file is missing', async () => {
    const { repo, useCase } = setup([])
    const stateSpy = vi.spyOn(repo, 'readPersistedState')

    await expect(
      useCase.execute({ specId: 'default:auth/login', action: 'add', file: 'src/missing.ts' }),
    ).rejects.toThrow('src/missing.ts')

    expect(stateSpy).not.toHaveBeenCalled()
  })
})
