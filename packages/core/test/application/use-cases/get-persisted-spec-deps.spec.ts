import { describe, expect, it } from 'vitest'
import { GetPersistedSpecDeps } from '../../../src/application/use-cases/get-persisted-spec-deps.js'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
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

describe('GetPersistedSpecDeps', () => {
  it('returns empty deps when uninitialized', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.initialized).toBe(false)
    expect(result.dependsOn).toEqual([])
  })
})

describe('UpdatePersistedSpecDeps', () => {
  function makeUpdate(repo = makeSpecRepository()) {
    return new UpdatePersistedSpecDeps(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )
  }

  it('creates persisted state on set', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = makeUpdate(repo)

    const result = await useCase.execute({
      specId: 'default:auth/login',
      set: ['default:auth/shared'],
    })

    expect(result.created).toBe(true)
    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('rejects conflicting mutation flags', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = makeUpdate(repo)

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        set: ['default:auth/shared'],
        add: ['default:auth/other'],
      }),
    ).rejects.toBeInstanceOf(InvalidInputError)
  })
})
