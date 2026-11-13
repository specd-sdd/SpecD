import { describe, expect, it, vi } from 'vitest'
import { type GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import { InvalidInputError } from '../../../src/domain/errors/index.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeArtifactType,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

function setupUseCase() {
  const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md', 'verify.md'] })
  const repo = makeSpecRepository({
    specs: [spec],
    artifacts: {
      'auth/login/spec.md': '# Auth',
      'auth/login/verify.md': '# Verification',
    },
  })
  const getActiveSchema = makeGetActiveSchema(makeSchema({ name: 'default' }))
  const useCase = new UpdatePersistedSpecOptimizations(
    new Map([['default', repo]]),
    getActiveSchema,
    {
      parsers: makeParsers(),
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    },
  )

  return { spec, repo, getActiveSchema, useCase }
}

function setupValidationUseCase() {
  const { spec, repo } = setupUseCase()
  const getActiveSchema = {
    execute: vi.fn(async () => {
      throw new Error('getActiveSchema should not be called')
    }),
  } as unknown as GetActiveSchema
  const useCase = new UpdatePersistedSpecOptimizations(
    new Map([['default', repo]]),
    getActiveSchema,
    {
      parsers: makeParsers(),
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    },
  )

  return { spec, repo, getActiveSchema, useCase }
}

describe('UpdatePersistedSpecOptimizations', () => {
  it('no-ops clear against missing persisted state', async () => {
    const { spec, repo, useCase } = setupUseCase()

    const result = await useCase.execute({
      specId: 'default:auth/login',
      clear: ['optimizedDescription'],
    })

    expect(result).toEqual({ specId: 'default:auth/login', created: false })
    expect(await repo.readPersistedState(spec)).toBeNull()
  })

  it('records persisted schema when state already exists', async () => {
    const { spec, repo, useCase } = setupUseCase()

    await useCase.execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'first' },
    })

    const useCaseWithNewSchema = new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema({ name: 'schema-std' })),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    await useCaseWithNewSchema.execute({
      specId: 'default:auth/login',
      set: { optimizedContext: 'second' },
    })

    const state = await repo.readPersistedState(spec)
    expect(state?.optimizations?.optimizedContext?.schema).toEqual({
      name: 'default',
      version: 1,
    })
  })

  it('persists partial clear without changing the remaining baseline', async () => {
    const { spec, repo, useCase } = setupUseCase()

    await useCase.execute({
      specId: 'default:auth/login',
      set: {
        optimizedDescription: 'summary',
        optimizedContext: 'context',
      },
    })

    const beforeClear = await repo.readPersistedState(spec)
    await useCase.execute({
      specId: 'default:auth/login',
      clear: ['optimizedContext'],
    })
    const afterClear = await repo.readPersistedState(spec)

    expect(afterClear?.optimizations?.optimizedDescription).toEqual(
      beforeClear?.optimizations?.optimizedDescription,
    )
    expect(afterClear?.optimizations?.optimizedContext).toBeUndefined()
  })

  it('treats absent clear fields as a durable no-op', async () => {
    const { spec, repo, useCase } = setupUseCase()

    await useCase.execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'summary' },
    })

    const beforeClear = await repo.readPersistedState(spec)
    const result = await useCase.execute({
      specId: 'default:auth/login',
      clear: ['optimizedContext'],
    })
    const afterClear = await repo.readPersistedState(spec)

    expect(result).toEqual({
      specId: 'default:auth/login',
      created: false,
      optimizations: { optimizedDescription: 'summary' },
    })
    expect(afterClear).toEqual(beforeClear)
  })

  it('removes the optimizations block after clearing the final field', async () => {
    const { spec, repo, useCase } = setupUseCase()

    await useCase.execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'summary' },
    })

    const result = await useCase.execute({
      specId: 'default:auth/login',
      clear: ['optimizedDescription'],
    })
    const reloaded = await repo.readPersistedState(spec)

    expect(result).toEqual({
      specId: 'default:auth/login',
      created: false,
    })
    expect(reloaded).not.toBeNull()
    expect(reloaded).not.toHaveProperty('optimizations')
  })

  it.each([
    {
      name: 'non-object input',
      input: undefined as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'input: Required',
    },
    {
      name: 'unknown root key',
      input: {
        specId: 'default:auth/login',
        set: { optimizedDescription: 'summary' },
        extra: true,
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: "input: Unrecognized key(s) in object: 'extra'",
    },
    {
      name: 'missing spec id',
      input: {
        set: { optimizedDescription: 'summary' },
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'specId: Required',
    },
    {
      name: 'unknown set key',
      input: {
        specId: 'default:auth/login',
        set: { optimizedDescription: 'summary', extra: 'nope' },
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: "set: Unrecognized key(s) in object: 'extra'",
    },
    {
      name: 'non-string set value',
      input: {
        specId: 'default:auth/login',
        set: { optimizedDescription: 42 },
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'set.optimizedDescription: Expected string, received number',
    },
  ])('rejects malformed set/root payloads before I/O: $name', async ({ input, message }) => {
    const { repo, getActiveSchema, useCase } = setupValidationUseCase()
    const getSpy = vi.spyOn(repo, 'get')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const artifactMetaSpy = vi.spyOn(repo, 'artifactMeta')
    const ownershipSpy = vi.spyOn(repo, 'ownership')

    await expect(useCase.execute(input)).rejects.toEqual(
      expect.objectContaining({
        message: `Invalid persisted optimization update: ${message}`,
      }),
    )

    expect(getSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
    expect(artifactMetaSpy).not.toHaveBeenCalled()
    expect(ownershipSpy).not.toHaveBeenCalled()
    expect(getActiveSchema.execute).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'invalid clear name',
      input: {
        specId: 'default:auth/login',
        clear: ['bogusField'],
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message:
        "clear.0: Invalid enum value. Expected 'optimizedDescription' | 'optimizedContext', received 'bogusField'",
    },
    {
      name: 'non-array clear',
      input: {
        specId: 'default:auth/login',
        clear: 'optimizedDescription',
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'clear: Expected array, received string',
    },
    {
      name: 'non-string clear entry',
      input: {
        specId: 'default:auth/login',
        clear: [5],
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: "clear.0: Expected 'optimizedDescription' | 'optimizedContext', received number",
    },
    {
      name: 'missing operation',
      input: {
        specId: 'default:auth/login',
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'input: must include exactly one of set or clear',
    },
    {
      name: 'simultaneous operations',
      input: {
        specId: 'default:auth/login',
        set: { optimizedDescription: 'summary' },
        clear: ['optimizedContext'],
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message:
        'set: must not be provided when clear is present; clear: must not be provided when set is present',
    },
    {
      name: 'empty set',
      input: {
        specId: 'default:auth/login',
        set: {},
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'set: must include at least one field',
    },
    {
      name: 'empty clear',
      input: {
        specId: 'default:auth/login',
        clear: [],
      } as unknown as Parameters<UpdatePersistedSpecOptimizations['execute']>[0],
      message: 'clear: Array must contain at least 1 element(s)',
    },
  ])(
    'rejects malformed clear/cardinality payloads before I/O: $name',
    async ({ input, message }) => {
      const { repo, getActiveSchema, useCase } = setupValidationUseCase()
      const getSpy = vi.spyOn(repo, 'get')
      const readSpy = vi.spyOn(repo, 'readPersistedState')
      const writeSpy = vi.spyOn(repo, 'writePersistedState')
      const artifactMetaSpy = vi.spyOn(repo, 'artifactMeta')
      const ownershipSpy = vi.spyOn(repo, 'ownership')

      await expect(useCase.execute(input)).rejects.toEqual(
        expect.objectContaining({
          message: `Invalid persisted optimization update: ${message}`,
        }),
      )

      expect(getSpy).not.toHaveBeenCalled()
      expect(readSpy).not.toHaveBeenCalled()
      expect(writeSpy).not.toHaveBeenCalled()
      expect(artifactMetaSpy).not.toHaveBeenCalled()
      expect(ownershipSpy).not.toHaveBeenCalled()
      expect(getActiveSchema.execute).not.toHaveBeenCalled()
    },
  )

  it('rejects an invalid specId before any repository call', async () => {
    const { repo, getActiveSchema, useCase } = setupValidationUseCase()
    const getSpy = vi.spyOn(repo, 'get')
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    await expect(
      useCase.execute({ specId: 'Core/Foo', set: { optimizedDescription: 'x' } }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(getSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
    expect(getActiveSchema.execute).not.toHaveBeenCalled()
  })

  it('rejects an empty specId as InvalidSpecIdError', async () => {
    const { repo, getActiveSchema, useCase } = setupValidationUseCase()
    const getSpy = vi.spyOn(repo, 'get')
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    await expect(
      useCase.execute({ specId: '', set: { optimizedDescription: 'x' } }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(getSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
    expect(getActiveSchema.execute).not.toHaveBeenCalled()
  })

  it('resolves a bare specId to the default workspace', async () => {
    const { useCase } = setupUseCase()

    const result = await useCase.execute({
      specId: 'auth/login',
      set: { optimizedDescription: 'summary' },
    })

    expect(result.specId).toBe('default:auth/login')
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const { useCase } = setupUseCase()

    await expect(
      useCase.execute({
        specId: 'unknown:auth/login',
        set: { optimizedDescription: 'summary' },
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })
})

describe('UpdatePersistedSpecOptimizations input and persistence', () => {
  const SPEC_FILE = 'auth/login/spec.md'

  function setupBaseline() {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const artifacts: Record<string, string | null> = { [SPEC_FILE]: '# Auth' }
    const repo = makeSpecRepository({ specs: [spec], artifacts })
    const getActiveSchema = makeGetActiveSchema(
      makeSchema({
        name: 'effective-schema',
        version: 7,
        artifacts: [makeArtifactType('specs', { scope: 'spec' })],
      }),
    )
    const useCase = new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      getActiveSchema,
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )
    return { spec, repo, artifacts, useCase }
  }

  it('rejects specId: undefined with InvalidInputError and touches no port', async () => {
    const { repo, getActiveSchema, useCase } = setupValidationUseCase()
    const getSpy = vi.spyOn(repo, 'get')

    const err = await useCase
      .execute({
        specId: undefined,
        set: { optimizedDescription: 'x' },
      } as unknown as Parameters<typeof useCase.execute>[0])
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(getSpy).not.toHaveBeenCalled()
    expect(getActiveSchema.execute).not.toHaveBeenCalled()
  })

  it('captures an independent baseline per set field', async () => {
    const { spec, repo, artifacts, useCase } = setupBaseline()

    await useCase.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    const first = (await repo.readPersistedState(spec))!.optimizations!.optimizedDescription!
    artifacts[SPEC_FILE] = '# Auth changed'
    await useCase.execute({ specId: 'default:auth/login', set: { optimizedContext: 'c' } })
    const state = (await repo.readPersistedState(spec))!

    expect(state.optimizations!.optimizedDescription).toEqual(first)
    expect(state.optimizations!.optimizedContext!.artifactState['spec.md']!.hash).not.toBe(
      first.artifactState['spec.md']!.hash,
    )
  })

  it('records the effective schema on create and reports created:true with a null revision guard', async () => {
    const { spec, repo, useCase } = setupBaseline()
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    const result = await useCase.execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'd' },
    })

    expect(result.created).toBe(true)
    expect(writeSpy).toHaveBeenCalledWith(spec, expect.anything(), { expectedRevision: null })
    const state = (await repo.readPersistedState(spec))!
    expect(state.schema).toEqual({ name: 'effective-schema', version: 7 })
    expect(state.optimizations!.optimizedDescription!.schema).toEqual({
      name: 'effective-schema',
      version: 7,
    })
  })

  it('propagates ArtifactConflictError from the write', async () => {
    const { repo, useCase } = setupBaseline()
    vi.spyOn(repo, 'writePersistedState').mockRejectedValue(
      new ArtifactConflictError('spec-lock.json', 'new', 'old'),
    )

    await expect(
      useCase.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } }),
    ).rejects.toBeInstanceOf(ArtifactConflictError)
  })

  it('rejects a readOnly workspace with the forSpec message', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec({ name: 'auth/login' })],
      ownership: 'readOnly',
    })
    const useCase = new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    const err = await useCase
      .execute({ specId: 'auth/login', set: { optimizedDescription: 'x' } })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
    expect((err as Error).message).toBe(
      'Cannot modify spec "default:auth/login" — workspace "default" is readOnly.',
    )
  })
})
