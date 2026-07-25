import { describe, expect, it } from 'vitest'
import { InitializePersistedSpecState } from '../../../src/application/use-cases/initialize-persisted-spec-state.js'
import { SpecAlreadyInitializedError } from '../../../src/domain/errors/spec-already-initialized-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
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

function makeUseCase(repo = makeSpecRepository()) {
  return new InitializePersistedSpecState(
    new Map([['default', repo]]),
    makeListWorkspaces(new Map([['default', repo]])),
    makeGetActiveSchema(makeSchema()),
    {
      parsers: makeParsers(),
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    },
  )
}

describe('InitializePersistedSpecState', () => {
  it('initializes a lock-less spec', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const useCase = makeUseCase(repo)

    const result = await useCase.execute({
      target: { kind: 'spec', specId: 'default:auth/login' },
    })

    expect(result.kind).toBe('spec')
    if (result.kind === 'spec') {
      expect(result.initialized.specId).toBe('default:auth/login')
    }
    const state = await repo.readPersistedState(spec)
    expect(state).not.toBeNull()
  })

  it('throws SpecAlreadyInitializedError for an existing lock', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'specd-std', version: 1 },
        dependsOn: [],
        implementation: [],
      },
      { expectedRevision: null },
    )
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({ target: { kind: 'spec', specId: 'default:auth/login' } }),
    ).rejects.toBeInstanceOf(SpecAlreadyInitializedError)
  })

  it('reports existingSkipped on a repeated batch run', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const useCase = makeUseCase(repo)

    await useCase.execute({ target: { kind: 'all' } })
    const second = await useCase.execute({ target: { kind: 'all' } })
    expect(second.kind).toBe('batch')
    if (second.kind === 'batch') {
      expect(second.existingSkipped).toBe(1)
    }
  })

  it('throws ReadOnlyWorkspaceError for read-only workspaces', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      ownership: 'readOnly',
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({ target: { kind: 'spec', specId: 'default:auth/login' } }),
    ).rejects.toBeInstanceOf(ReadOnlyWorkspaceError)
  })
})
