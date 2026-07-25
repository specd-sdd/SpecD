import { describe, expect, it } from 'vitest'
import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import { InvalidInputError } from '../../../src/domain/errors/index.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

describe('UpdatePersistedSpecOptimizations', () => {
  it('rejects empty set and clear', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
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

    await expect(useCase.execute({ specId: 'default:auth/login' })).rejects.toBeInstanceOf(
      InvalidInputError,
    )
  })

  it('no-ops clear against missing persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema({ name: 'default' })),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    const result = await useCase.execute({
      specId: 'default:auth/login',
      clear: ['optimizedDescription'],
    })

    expect(result).toEqual({ specId: 'default:auth/login', created: false })
    expect(await repo.readPersistedState(spec)).toBeNull()
  })

  it('records persisted schema when state already exists', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const initialUseCase = new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema({ name: 'default' })),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    await initialUseCase.execute({
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
})
