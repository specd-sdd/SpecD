import { describe, expect, it } from 'vitest'
import { UpdatePersistedSpecImplementation } from '../../../src/application/use-cases/update-persisted-spec-implementation.js'
import { ImplementationFileNotFoundError } from '../../../src/domain/errors/implementation-file-not-found-error.js'
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

describe('UpdatePersistedSpecImplementation', () => {
  it('throws when adding a missing file', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = new UpdatePersistedSpecImplementation(
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

    await expect(
      useCase.execute({
        specId: 'default:auth/login',
        action: 'add',
        file: 'src/missing.ts',
      }),
    ).rejects.toBeInstanceOf(ImplementationFileNotFoundError)
  })
})
