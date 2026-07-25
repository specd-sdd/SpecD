import { describe, expect, it } from 'vitest'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeListWorkspaces,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

describe('UpdatePersistedSpecDeps', () => {
  it('no-ops remove against missing persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new UpdatePersistedSpecDeps(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    const result = await useCase.execute({
      specId: 'default:auth/login',
      remove: ['default:auth/shared'],
    })

    expect(result.created).toBe(false)
    expect(result.dependsOn).toEqual([])
  })
})
