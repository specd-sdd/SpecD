import { describe, expect, it, vi } from 'vitest'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { InvalidSpecLockError } from '../../../src/domain/errors/invalid-spec-lock-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { resolveInitialPersistedDependsOn } from '../../../src/application/use-cases/resolve-initial-persisted-depends-on.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

vi.mock(
  '../../../src/application/use-cases/resolve-initial-persisted-depends-on.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../src/application/use-cases/resolve-initial-persisted-depends-on.js')
      >()
    return {
      ...actual,
      resolveInitialPersistedDependsOn: vi.fn(actual.resolveInitialPersistedDependsOn),
    }
  },
)

function makeUseCase(repos: Map<string, ReturnType<typeof makeSpecRepository>>) {
  return new UpdatePersistedSpecDeps(repos, makeGetActiveSchema(makeSchema()), {
    parsers: makeParsers(),
    extractorTransforms: createBuiltinExtractorTransforms(),
    hasher: makeContentHasher(),
  })
}

describe('UpdatePersistedSpecDeps', () => {
  it('no-ops remove against missing persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({ specs: [spec, shared] })
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'default:auth/login',
      remove: ['default:auth/shared'],
    })

    expect(result.created).toBe(false)
    expect(result.dependsOn).toEqual([])
  })

  it('rejects conflicting flags before any persisted I/O', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({ specs: [spec, shared] })
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const getSpy = vi.spyOn(repo, 'get')
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        set: ['default:auth/shared'],
        add: ['default:auth/shared'],
      }),
    ).rejects.toThrow(InvalidInputError)

    expect(readSpy).not.toHaveBeenCalled()
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('rejects no operation on missing persisted state before I/O', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'default:auth/login' })).rejects.toThrow(
      InvalidInputError,
    )

    expect(readSpy).not.toHaveBeenCalled()
  })

  it('rejects an invalid ID before any I/O', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: '', add: ['default:auth/shared'] })).rejects.toThrow(
      InvalidSpecIdError,
    )
    await expect(useCase.execute({ specId: 'default:auth/login', add: [''] })).rejects.toThrow(
      InvalidSpecIdError,
    )

    expect(writeSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('throws SpecNotFoundError when a dependency target is missing', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        add: ['default:auth/missing'],
      }),
    ).rejects.toThrow(SpecNotFoundError)

    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('throws SpecNotFoundError when the target spec is missing', async () => {
    const dep = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({ specs: [dep] })
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        add: ['default:auth/shared'],
      }),
    ).rejects.toThrow(SpecNotFoundError)
  })

  it('stores bare IDs as fully qualified', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({ specs: [spec, shared] })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: [],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'auth/login',
      add: ['auth/shared'],
    })

    expect(result.specId).toBe('default:auth/login')
    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('removes an invalid stored dependency value as given', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'specd-std', version: 1 },
          dependsOn: ['!!!bad!!!', 'default:auth/shared'],
          implementation: [],
        }),
      },
    })
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'default:auth/login',
      remove: ['!!!bad!!!'],
    })

    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('propagates InvalidSpecLockError from readPersistedState', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({ specs: [spec, shared] })
    vi.spyOn(repo, 'readPersistedState').mockRejectedValue(
      new InvalidSpecLockError(
        'default:auth/login',
        'specs/default/auth/login/spec-lock.json',
        'dependsOn.0',
        'must be a fully-qualified valid spec ID (workspace:capabilityPath)',
      ),
    )
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        add: ['default:auth/shared'],
      }),
    ).rejects.toThrow(InvalidSpecLockError)
  })

  it('clears all dependencies', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: ['default:auth/shared', 'default:auth/jwt'],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'default:auth/login',
      clear: true,
    })

    expect(result.dependsOn).toEqual([])
    expect(result.created).toBe(false)
  })

  it('rejects an unknown workspace', async () => {
    const repo = makeSpecRepository({ specs: [makeSpec({ name: 'auth/login' })] })
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'missing:auth/login',
        clear: true,
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('reads leniently for remove and normalizes a bare remove entry', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'specd-std', version: 1 },
          dependsOn: ['!!!bad!!!', 'default:auth/shared'],
          implementation: [],
        }),
      },
    })
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'default:auth/login',
      remove: ['!!!bad!!!', 'auth/shared'],
    })

    expect(readSpy).toHaveBeenCalledWith(spec, { lenientDependsOn: true })
    expect(result.dependsOn).toEqual([])
  })

  it('removes a bare entry stored in the lock by passing that same string', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'specd-std', version: 1 },
          dependsOn: ['auth/shared'],
          implementation: [],
        }),
      },
    })
    const useCase = makeUseCase(new Map([['default', repo]]))

    const result = await useCase.execute({
      specId: 'default:auth/login',
      remove: ['auth/shared'],
    })

    expect(result.dependsOn).toEqual([])
  })

  it('throws InvalidSpecLockError when invalid dependsOn entries remain after a repair mutation', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'specd-std', version: 1 },
          dependsOn: ['!!!bad!!!', 'default:auth/shared'],
          implementation: [],
        }),
      },
    })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        remove: ['default:auth/shared'],
      }),
    ).rejects.toBeInstanceOf(InvalidSpecLockError)

    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('keeps add reads strict against an invalid lock', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec-lock.json': JSON.stringify({
          schema: { name: 'specd-std', version: 1 },
          dependsOn: [''],
          implementation: [],
        }),
      },
    })
    const useCase = makeUseCase(new Map([['default', repo]]))

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        add: ['default:auth/shared'],
      }),
    ).rejects.toBeInstanceOf(InvalidSpecLockError)
  })

  describe('audit hardening', () => {
    const SCHEMA = { name: 'specd-std', version: 1 }

    async function seeded(dependsOn: string[]) {
      const spec = makeSpec({ name: 'auth/login' })
      const specs = ['a', 'b', 'c'].map((n) => makeSpec({ name: `auth/${n}` }))
      const repo = makeSpecRepository({ specs: [spec, ...specs] })
      await repo.writePersistedState(
        spec,
        { schema: SCHEMA, dependsOn, implementation: [] },
        { expectedRevision: null },
      )
      return { spec, repo }
    }

    it('applies remove before add on existing state', async () => {
      const { repo } = await seeded(['default:auth/a', 'default:auth/b'])
      const useCase = makeUseCase(new Map([['default', repo]]))

      const result = await useCase.execute({
        specId: 'default:auth/login',
        remove: ['default:auth/a'],
        add: ['default:auth/a', 'default:auth/c'],
      })

      expect(result.dependsOn).toEqual(['default:auth/b', 'default:auth/a', 'default:auth/c'])
      expect(result.created).toBe(false)
      expect(result.initialized).toBe(true)
    })

    it('passes the observed originalHash as expectedRevision', async () => {
      const { spec, repo } = await seeded(['default:auth/a'])
      vi.spyOn(repo, 'readPersistedState').mockResolvedValue({
        schema: SCHEMA,
        dependsOn: ['default:auth/a'],
        implementation: [],
        originalHash: 'sha256:observed',
      })
      const writeSpy = vi.spyOn(repo, 'writePersistedState')
      const useCase = makeUseCase(new Map([['default', repo]]))

      await useCase.execute({ specId: 'default:auth/login', add: ['default:auth/b'] })

      expect(writeSpy).toHaveBeenCalledWith(spec, expect.anything(), {
        expectedRevision: 'sha256:observed',
      })
    })

    it('propagates ArtifactConflictError without retrying', async () => {
      const { repo } = await seeded([])
      const writeSpy = vi
        .spyOn(repo, 'writePersistedState')
        .mockRejectedValue(new ArtifactConflictError('spec-lock.json', 'new', 'old'))
      const useCase = makeUseCase(new Map([['default', repo]]))

      await expect(
        useCase.execute({ specId: 'default:auth/login', add: ['default:auth/a'] }),
      ).rejects.toBeInstanceOf(ArtifactConflictError)
      expect(writeSpy).toHaveBeenCalledTimes(1)
    })

    it('rejects a readOnly workspace with the forSpec message before any I/O', async () => {
      const repo = makeSpecRepository({
        specs: [makeSpec({ name: 'auth/login' })],
        ownership: 'readOnly',
      })
      const getSpy = vi.spyOn(repo, 'get')
      const readSpy = vi.spyOn(repo, 'readPersistedState')
      const useCase = makeUseCase(new Map([['default', repo]]))

      const err = await useCase
        .execute({ specId: 'auth/login', clear: true })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
      expect((err as Error).message).toBe(
        'Cannot modify spec "default:auth/login" — workspace "default" is readOnly.',
      )
      expect(getSpy).not.toHaveBeenCalled()
      expect(readSpy).not.toHaveBeenCalled()
    })

    describe('missing persisted state', () => {
      function missing() {
        const spec = makeSpec({ name: 'auth/login' })
        const specs = ['a', 'b', 'c'].map((n) => makeSpec({ name: `auth/${n}` }))
        const repo = makeSpecRepository({ specs: [spec, ...specs] })
        return { spec, repo, useCase: makeUseCase(new Map([['default', repo]])) }
      }

      it('clear creates state with an empty list', async () => {
        const { repo, useCase } = missing()
        const writeSpy = vi.spyOn(repo, 'writePersistedState')

        const result = await useCase.execute({ specId: 'default:auth/login', clear: true })

        expect(result).toMatchObject({ dependsOn: [], created: true, initialized: true })
        expect(writeSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
          expectedRevision: null,
        })
      })

      it('set creates state and skips base derivation', async () => {
        const { useCase } = missing()
        vi.mocked(resolveInitialPersistedDependsOn).mockClear()

        const result = await useCase.execute({
          specId: 'default:auth/login',
          set: ['default:auth/a'],
        })

        expect(result).toMatchObject({
          dependsOn: ['default:auth/a'],
          created: true,
          initialized: true,
        })
        expect(resolveInitialPersistedDependsOn).not.toHaveBeenCalled()
      })

      it('add derives the base and appends to it', async () => {
        const { useCase } = missing()
        vi.mocked(resolveInitialPersistedDependsOn).mockResolvedValueOnce(['default:auth/b'])

        const result = await useCase.execute({
          specId: 'default:auth/login',
          add: ['default:auth/c'],
        })

        expect(result.dependsOn).toEqual(['default:auth/b', 'default:auth/c'])
        expect(result.created).toBe(true)
      })

      it('remove with a non-empty add drops the removed ID from the derived base (D4)', async () => {
        const { useCase } = missing()
        vi.mocked(resolveInitialPersistedDependsOn).mockResolvedValueOnce([
          'default:auth/a',
          'default:auth/b',
        ])

        const result = await useCase.execute({
          specId: 'default:auth/login',
          remove: ['default:auth/a'],
          add: ['default:auth/c'],
        })

        expect(result.dependsOn).toEqual(['default:auth/b', 'default:auth/c'])
        expect(result.created).toBe(true)
      })

      it('remove alone is a no-op reported as not initialized', async () => {
        const { repo, useCase } = missing()
        const writeSpy = vi.spyOn(repo, 'writePersistedState')

        const result = await useCase.execute({
          specId: 'default:auth/login',
          remove: ['default:auth/a'],
        })

        expect(result).toEqual({
          specId: 'default:auth/login',
          dependsOn: [],
          created: false,
          initialized: false,
        })
        expect(writeSpy).not.toHaveBeenCalled()
      })

      it('add: [] is a no-op reported as not initialized', async () => {
        const { repo, useCase } = missing()
        const writeSpy = vi.spyOn(repo, 'writePersistedState')

        const result = await useCase.execute({ specId: 'default:auth/login', add: [] })

        expect(result.initialized).toBe(false)
        expect(result.created).toBe(false)
        expect(writeSpy).not.toHaveBeenCalled()
      })
    })
  })
})
