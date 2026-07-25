import { describe, expect, it } from 'vitest'
import { GetPersistedSpecOptimizations } from '../../../src/application/use-cases/get-persisted-spec-optimizations.js'
import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

function makeOptimizationDeps() {
  return {
    parsers: makeParsers(),
    extractorTransforms: createBuiltinExtractorTransforms(),
    hasher: makeContentHasher(),
  }
}

describe('GetPersistedSpecOptimizations', () => {
  it('reports missing optimizations when uninitialized', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.initialized).toBe(false)
    expect(result.fresh).toBe(false)
  })

  it('reports missing field when filtered field is absent', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    await new UpdatePersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      makeOptimizationDeps(),
    ).execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'summary' },
    })

    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
    )

    const result = await useCase.execute({
      specId: 'default:auth/login',
      field: 'optimizedContext',
    })

    expect(result.optimizedContext).toEqual({
      freshness: 'missing',
      reasons: ['missing'],
    })
    expect(result.fresh).toBe(false)
  })

  it('returns aggregate fresh false when initialized with no optimization fields', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })

    await new UpdatePersistedSpecDeps(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
      makeOptimizationDeps(),
    ).execute({ specId: 'default:auth/login', set: ['default:auth/shared'] })

    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.initialized).toBe(true)
    expect(result.fresh).toBe(false)
  })
})
