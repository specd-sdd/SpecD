import { describe, expect, it, vi } from 'vitest'
import { GetPersistedSpecImplementation } from '../../../src/application/use-cases/get-persisted-spec-implementation.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
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

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const getSpy = vi.spyOn(repo, 'get')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: '' })).rejects.toThrow(InvalidSpecIdError)
    expect(getSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('resolves a bare specId to the default workspace', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'auth/login' })
    expect(result.specId).toBe('default:auth/login')
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const useCase = new GetPersistedSpecImplementation(new Map([['default', makeSpecRepository()]]))

    await expect(useCase.execute({ specId: 'unknown:auth/login' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })

  it('accepts a fully qualified specId', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.specId).toBe('default:auth/login')
  })
})

describe('GetPersistedSpecImplementation reads', () => {
  it('keeps stored order and duplicate links', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const links = [
      { specId: 'default:b', file: 'default:src/b.ts' },
      { specId: 'default:a', file: 'default:src/a.ts' },
      { specId: 'default:b', file: 'default:src/b.ts' },
    ]
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: [],
        implementation: links,
      },
      { expectedRevision: null },
    )
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'auth/login' })

    expect(result.implementation).toEqual(links)
    expect(result.initialized).toBe(true)
  })

  it('throws SpecNotFoundError for an unknown spec', async () => {
    const useCase = new GetPersistedSpecImplementation(new Map([['default', makeSpecRepository()]]))

    await expect(useCase.execute({ specId: 'default:auth/ghost' })).rejects.toBeInstanceOf(
      SpecNotFoundError,
    )
  })

  it('quotes a malformed ID and never writes persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecImplementation(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'Bad Id' })).rejects.toThrow(/Bad Id/)
    await useCase.execute({ specId: 'auth/login' })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
