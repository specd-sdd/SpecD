import { describe, expect, it, vi } from 'vitest'
import { GetPersistedSpecOptimizations } from '../../../src/application/use-cases/get-persisted-spec-optimizations.js'
import { UpdatePersistedSpecOptimizations } from '../../../src/application/use-cases/update-persisted-spec-optimizations.js'
import { UpdatePersistedSpecDeps } from '../../../src/application/use-cases/update-persisted-spec-deps.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeContentHasher,
  makeGetActiveSchema,
  makeParsers,
  makeArtifactType,
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
    const shared = makeSpec({ name: 'auth/shared' })
    const repo = makeSpecRepository({
      specs: [spec, shared],
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

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const getSpy = vi.spyOn(repo, 'get')
    const readSpy = vi.spyOn(repo, 'readPersistedState')
    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
    )

    await expect(useCase.execute({ specId: '' })).rejects.toThrow(InvalidSpecIdError)
    expect(getSpy).not.toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
  })

  it('resolves a bare specId to the default workspace', async () => {
    const spec = makeSpec({ name: 'auth/login' })
    const repo = makeSpecRepository({ specs: [spec] })
    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', repo]]),
      makeGetActiveSchema(makeSchema()),
    )

    const result = await useCase.execute({ specId: 'auth/login' })
    expect(result.specId).toBe('default:auth/login')
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const useCase = new GetPersistedSpecOptimizations(
      new Map([['default', makeSpecRepository()]]),
      makeGetActiveSchema(makeSchema()),
    )

    await expect(useCase.execute({ specId: 'unknown:auth/login' })).rejects.toThrow(
      WorkspaceNotFoundError,
    )
  })
})

describe('GetPersistedSpecOptimizations freshness and filtering', () => {
  const SPEC_FILE = 'auth/login/spec.md'
  const VERIFY_FILE = 'auth/login/verify.md'

  function setup(opts: { withVerify?: boolean } = {}) {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const artifacts: Record<string, string | null> = { [SPEC_FILE]: '# Auth' }
    const repo = makeSpecRepository({ specs: [spec], artifacts })
    const schema = makeSchema([
      makeArtifactType('specs', { scope: 'spec' }),
      ...(opts.withVerify === true
        ? [makeArtifactType('verify', { scope: 'spec', output: 'verify.md' })]
        : []),
    ])
    const repos = new Map([['default', repo]])
    const writer = new UpdatePersistedSpecOptimizations(
      repos,
      makeGetActiveSchema(schema),
      makeOptimizationDeps(),
    )
    const reader = new GetPersistedSpecOptimizations(repos, makeGetActiveSchema(schema))
    return { spec, artifacts, repo, writer, reader }
  }

  it('returns only the requested field when it is present', async () => {
    const { writer, reader } = setup()
    await writer.execute({
      specId: 'default:auth/login',
      set: { optimizedDescription: 'd', optimizedContext: 'c' },
    })

    const result = await reader.execute({
      specId: 'default:auth/login',
      field: 'optimizedDescription',
    })

    expect(result.optimizedDescription).toMatchObject({ value: 'd', freshness: 'fresh' })
    expect('optimizedContext' in result).toBe(false)
    expect(result.fresh).toBe(true)
  })

  it('returns missing without a value when the requested field is absent', async () => {
    const { writer, reader } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })

    const result = await reader.execute({ specId: 'default:auth/login', field: 'optimizedContext' })

    expect(result.optimizedContext).toEqual({ freshness: 'missing', reasons: ['missing'] })
    expect('value' in result.optimizedContext!).toBe(false)
    expect('optimizedDescription' in result).toBe(false)
  })

  it('omits an absent field when no filter is given', async () => {
    const { writer, reader } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect('optimizedContext' in result).toBe(false)
    expect(result.fresh).toBe(true)
  })

  it('reports artifact-changed when a spec artifact hash changes', async () => {
    const { writer, reader, artifacts } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    artifacts[SPEC_FILE] = '# Auth changed'

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect(result.optimizedDescription).toMatchObject({
      freshness: 'stale',
      reasons: ['artifact-changed'],
    })
    expect(result.fresh).toBe(false)
  })

  it('reports artifact-removed when a baseline artifact disappears', async () => {
    const { writer, reader, artifacts } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    artifacts[SPEC_FILE] = null

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect(result.optimizedDescription?.reasons).toEqual(['artifact-removed'])
    expect(result.optimizedDescription?.freshness).toBe('stale')
  })

  it('reports artifact-added when a new spec artifact appears after the baseline', async () => {
    const { writer, reader, artifacts } = setup({ withVerify: true })
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    artifacts[VERIFY_FILE] = '# Verify'

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect(result.optimizedDescription?.reasons).toEqual(['artifact-added'])
    expect(result.optimizedDescription?.freshness).toBe('stale')
  })

  it('stays fresh when only lastModified differs', async () => {
    const { spec, writer, reader, repo } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    const state = (await repo.readPersistedState(spec))!
    const field = state.optimizations!.optimizedDescription!
    await repo.writePersistedState(
      spec,
      {
        schema: state.schema,
        dependsOn: state.dependsOn,
        implementation: state.implementation,
        optimizations: {
          optimizedDescription: {
            ...field,
            artifactState: Object.fromEntries(
              Object.entries(field.artifactState).map(([name, entry]) => [
                name,
                { ...entry, lastModified: '2000-01-01T00:00:00.000Z' },
              ]),
            ),
          },
        },
      },
      { expectedRevision: state.originalHash },
    )

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect(result.optimizedDescription).toMatchObject({ freshness: 'fresh', reasons: [] })
  })

  it('reports schema-changed when the field baseline schema differs from the lock schema', async () => {
    const { spec, writer, reader, repo } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    const state = (await repo.readPersistedState(spec))!
    await repo.writePersistedState(
      spec,
      {
        schema: { name: 'test-schema', version: 2 },
        dependsOn: state.dependsOn,
        implementation: state.implementation,
        optimizations: state.optimizations!,
      },
      { expectedRevision: state.originalHash },
    )

    const result = await reader.execute({ specId: 'default:auth/login' })

    expect(result.optimizedDescription?.reasons).toContain('schema-changed')
    expect(result.optimizedDescription?.freshness).toBe('stale')
  })

  it('computes the aggregate fresh flag only over the filtered field', async () => {
    const { writer, reader, artifacts } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    artifacts[SPEC_FILE] = '# Auth changed'
    await writer.execute({ specId: 'default:auth/login', set: { optimizedContext: 'c' } })

    expect((await reader.execute({ specId: 'default:auth/login' })).fresh).toBe(false)
    expect(
      (await reader.execute({ specId: 'default:auth/login', field: 'optimizedDescription' })).fresh,
    ).toBe(false)
    expect(
      (await reader.execute({ specId: 'default:auth/login', field: 'optimizedContext' })).fresh,
    ).toBe(true)
  })

  it('throws SpecNotFoundError for an unknown spec and quotes a malformed ID', async () => {
    const { reader } = setup()

    await expect(reader.execute({ specId: 'default:auth/ghost' })).rejects.toBeInstanceOf(
      SpecNotFoundError,
    )
    await expect(reader.execute({ specId: 'Bad Id' })).rejects.toThrow(/Bad Id/)
  })

  it('never writes persisted state', async () => {
    const { repo, writer, reader } = setup()
    await writer.execute({ specId: 'default:auth/login', set: { optimizedDescription: 'd' } })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const readSpy = vi.spyOn(repo, 'readPersistedState')

    await reader.execute({ specId: 'default:auth/login' })

    expect(readSpy).toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
