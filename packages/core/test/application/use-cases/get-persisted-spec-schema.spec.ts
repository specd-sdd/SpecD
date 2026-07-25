import { describe, expect, it } from 'vitest'
import { GetPersistedSpecSchema } from '../../../src/application/use-cases/get-persisted-spec-schema.js'
import { SpecNotInitializedError } from '../../../src/domain/errors/spec-not-initialized-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { makeSpecRepository } from './helpers.js'

describe('GetPersistedSpecSchema', () => {
  it('throws SpecNotInitializedError when no lock exists', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecSchema(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'default:auth/login' })).rejects.toBeInstanceOf(
      SpecNotInitializedError,
    )
  })
})
