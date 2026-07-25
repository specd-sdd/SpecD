import { describe, expect, it } from 'vitest'
import { GetPersistedSpecImplementation } from '../../../src/application/use-cases/get-persisted-spec-implementation.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { makeSpecRepository } from './helpers.js'

describe('GetPersistedSpecImplementation', () => {
  it('returns empty implementation when uninitialized', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.initialized).toBe(false)
    expect(result.implementation).toEqual([])
  })
})
