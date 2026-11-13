import { describe, expect, it, vi } from 'vitest'
import { GetPersistedSpecDeps } from '../../../src/application/use-cases/get-persisted-spec-deps.js'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/index.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
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

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const getSpy = vi.spyOn(repo, 'get')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: '' })).rejects.toThrow(InvalidSpecIdError)
    await expect(useCase.execute({ specId: 'Core/Foo' })).rejects.toThrow(InvalidSpecIdError)

    expect(getSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('resolves a bare specId to the default workspace', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'auth/login' })
    expect(result.specId).toBe('default:auth/login')
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const repo = makeSpecRepository()
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'unknown:auth/login' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })

  it('accepts a fully qualified specId', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: ['default:auth/shared'],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.specId).toBe('default:auth/login')
    expect(result.dependsOn).toEqual(['default:auth/shared'])
    expect(result.initialized).toBe(true)
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
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
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
    const shared = makeSpec({ name: 'auth/shared' })
    const other = makeSpec({ name: 'auth/other' })
    const repo = makeSpecRepository({ specs: [spec, shared, other] })
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

describe('GetPersistedSpecDeps reads', () => {
  it('keeps stored order and duplicates', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: ['default:b', 'default:a', 'default:b'],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    const result = await useCase.execute({ specId: 'auth/login' })

    expect(result.dependsOn).toEqual(['default:b', 'default:a', 'default:b'])
  })

  it('throws SpecNotFoundError for an unknown spec', async () => {
    const useCase = new GetPersistedSpecDeps(new Map([['default', makeSpecRepository()]]))

    await expect(useCase.execute({ specId: 'default:auth/ghost' })).rejects.toBeInstanceOf(
      SpecNotFoundError,
    )
  })

  it('quotes a malformed ID and never writes persisted state', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecDeps(new Map([['default', repo]]))

    await expect(useCase.execute({ specId: 'Bad Id' })).rejects.toThrow(/Bad Id/)
    await useCase.execute({ specId: 'auth/login' })

    expect(readSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
