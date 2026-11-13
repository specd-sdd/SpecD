import { describe, expect, it, vi } from 'vitest'
import { GetPersistedSpecSchema } from '../../../src/application/use-cases/get-persisted-spec-schema.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { SpecNotInitializedError } from '../../../src/domain/errors/spec-not-initialized-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
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

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const getSpy = vi.spyOn(repo, 'get')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecSchema(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'auth/a,b' })).rejects.toThrow(InvalidSpecIdError)
    expect(getSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('resolves a bare specId before throwing SpecNotInitializedError', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecSchema(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'auth/login' })).rejects.toBeInstanceOf(
      SpecNotInitializedError,
    )
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const useCase = new GetPersistedSpecSchema(new Map([['default', makeSpecRepository()]]))

    await expect(useCase.execute({ specId: 'unknown:auth/login' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })

  it('accepts a fully qualified specId when lock exists', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: [],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = new GetPersistedSpecSchema(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.specId).toBe('default:auth/login')
    expect(result.schema).toEqual({ name: 'specd-std', version: 1 })
  })
})

describe('GetPersistedSpecSchema reads', () => {
  it('throws SpecNotFoundError (not SpecNotInitializedError) for an unknown spec', async () => {
    const useCase = new GetPersistedSpecSchema(new Map([['default', makeSpecRepository()]]))

    await expect(useCase.execute({ specId: 'default:auth/ghost' })).rejects.toBeInstanceOf(
      SpecNotFoundError,
    )
  })

  it('quotes a malformed ID and never writes persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    await repo.writePersistedState(
      spec,
      { schema: { name: 'specd-std', version: 1 }, dependsOn: [], implementation: [] },
      { expectedRevision: null },
    )
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecSchema(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'Bad Id' })).rejects.toThrow(/Bad Id/)
    await useCase.execute({ specId: 'auth/login' })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
