import { describe, expect, it } from 'vitest'
import { UpdatePersistedSpecSchema } from '../../../src/application/use-cases/update-persisted-spec-schema.js'
import { SpecNotInitializedError } from '../../../src/domain/errors/spec-not-initialized-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

describe('UpdatePersistedSpecSchema', () => {
  it('never creates a lock', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = new UpdatePersistedSpecSchema(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      {
        parsers: makeParsers(),
        extractorTransforms: createBuiltinExtractorTransforms(),
        hasher: makeContentHasher(),
      },
    )

    await expect(
      useCase.execute({ specId: 'default:auth/login', schemaRef: '@specd/schema-std' }),
    ).rejects.toBeInstanceOf(SpecNotInitializedError)
  })
})
