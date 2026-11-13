import { describe, expect, it, vi } from 'vitest'
import { type GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { SpecNotFoundError } from '../../../src/application/errors/spec-not-found-error.js'
import { ArtifactParseError } from '../../../src/domain/errors/artifact-parse-error.js'
import { ArtifactConflictError } from '../../../src/domain/errors/artifact-conflict-error.js'
import { PersistedSchemaDependencyConflictError } from '../../../src/domain/errors/persisted-schema-dependency-conflict-error.js'
import { ReadOnlyWorkspaceError } from '../../../src/domain/errors/read-only-workspace-error.js'
import { UpdatePersistedSpecSchema } from '../../../src/application/use-cases/update-persisted-spec-schema.js'
import { SpecNotInitializedError } from '../../../src/domain/errors/spec-not-initialized-error.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { makeSpec } from '../../helpers/make-spec.js'
import {
  makeArtifactType,
  makeContentHasher,
  makeParser,
  makeGetActiveSchema,
  makeParsers,
  makeSchema,
  makeSpecRepository,
} from './helpers.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'

function makeUseCase(repo: ReturnType<typeof makeSpecRepository>) {
  return new UpdatePersistedSpecSchema(
    new Map([['default', repo]]),
    makeGetActiveSchema(makeSchema()),
    {
      parsers: makeParsers(),
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    },
  )
}

describe('UpdatePersistedSpecSchema', () => {
  it('never creates a lock', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({ specId: 'default:auth/login', schemaRef: '@specd/schema-std' }),
    ).rejects.toBeInstanceOf(SpecNotInitializedError)
  })

  it('rejects an invalid specId before any repository call', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const getSpy = vi.spyOn(repo, 'get')
    const writeSpy = vi.spyOn(repo, 'writePersistedState')
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({ specId: 'Login', schemaRef: '@specd/schema-std' }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(getSpy).not.toHaveBeenCalled()
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('resolves a bare specId before SpecNotInitializedError', async () => {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth' },
    })
    const useCase = makeUseCase(repo)

    await expect(
      useCase.execute({ specId: 'auth/login', schemaRef: '@specd/schema-std' }),
    ).rejects.toBeInstanceOf(SpecNotInitializedError)
  })

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    const useCase = makeUseCase(makeSpecRepository())

    await expect(
      useCase.execute({ specId: 'unknown:auth/login', schemaRef: '@specd/schema-std' }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })
})

describe('UpdatePersistedSpecSchema artifact parse verification', () => {
  const OLD = { name: 'old-schema', version: 1 }
  const DEP_EXTRACTION = {
    dependsOn: {
      artifact: 'specs',
      extractor: {
        selector: { type: 'section', matches: '^Spec Dependencies$' },
        extract: 'content' as const,
        capture:
          '(?:^|\\n)\\s*-\\s+(?:\\[`?|`)?([^`\\]\\n]+?)(?:(?:`?\\]\\(([^)]+)\\)|`)|(?=\\s*(?:—|$)))',
        transform: { name: 'resolveSpecPath', args: ['$2'] },
      },
    },
  }

  function sectionParser(onParse?: (content: string) => void) {
    return makeParser({
      parse: (content: string) => {
        onParse?.(content)
        return {
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Spec Dependencies',
                children: [
                  { type: 'paragraph', value: '- [`default:auth/shared`](../shared/spec.md)' },
                ],
              },
            ],
          },
        }
      },
      renderSubtree: (node) =>
        (node.value as string | undefined) ??
        (node.children ?? [])
          .map((child) => ((child as { value?: unknown }).value as string | undefined) ?? '')
          .join('\n'),
    })
  }

  async function setup(
    opts: {
      targetSchema?: ReturnType<typeof makeSchema>
      parser?: ReturnType<typeof makeParser>
      dependsOn?: string[]
      artifacts?: Record<string, string | null>
      ownership?: 'owned' | 'readOnly'
    } = {},
  ) {
    const spec = makeSpec({ name: 'auth/login', filenames: ['spec.md'] })
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: opts.artifacts ?? { 'auth/login/spec.md': '# Auth' },
      ...(opts.ownership !== undefined ? { ownership: opts.ownership } : {}),
    })
    await repo.writePersistedState(
      spec,
      {
        schema: OLD,
        dependsOn: opts.dependsOn ?? [],
        implementation: [{ file: 'default:src/x.ts' }],
        optimizations: {
          optimizedDescription: { value: 'd', schema: OLD, artifactState: {} },
        },
      },
      { expectedRevision: null },
    )
    const schema =
      opts.targetSchema ??
      makeSchema({
        name: 'new-schema',
        version: 2,
        artifacts: [makeArtifactType('specs', { scope: 'spec', format: 'markdown' })],
      })
    const execute = vi.fn(async () => ({ raw: false as const, schema }))
    const getActiveSchema = { execute } as unknown as GetActiveSchema
    const parsers = makeParsers(opts.parser ?? makeParser())
    const useCase = new UpdatePersistedSpecSchema(new Map([['default', repo]]), getActiveSchema, {
      parsers,
      extractorTransforms: createBuiltinExtractorTransforms(),
      hasher: makeContentHasher(),
    })
    return { spec, repo, useCase, execute }
  }

  it('throws ArtifactParseError for a malformed artifact when the target schema has no dependsOn extraction, and does not write', async () => {
    const parser = makeParser({
      parse: () => {
        throw new SyntaxError('unexpected token')
      },
    })
    const { repo, useCase } = await setup({ parser })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    const err = await useCase
      .execute({ specId: 'default:auth/login', schemaRef: '@org/new' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ArtifactParseError)
    expect((err as Error).message).toContain('markdown')
    expect((err as Error).message).toContain('unexpected token')
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('skips artifacts whose format has no parser', async () => {
    const schema = makeSchema({
      name: 'new-schema',
      version: 2,
      artifacts: [makeArtifactType('notes', { scope: 'spec', output: 'notes.txt' })],
    })
    const { useCase } = await setup({
      targetSchema: schema,
      artifacts: { 'auth/login/notes.txt': 'anything' },
    })

    const result = await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(result.changed).toBe(true)
  })

  it('skips artifacts that do not exist on disk', async () => {
    const parse = vi.fn()
    const { useCase } = await setup({
      parser: makeParser({ parse }),
      artifacts: { 'auth/login/spec.md': null },
    })

    const result = await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(result.changed).toBe(true)
    expect(parse).not.toHaveBeenCalled()
  })

  it('succeeds with changed:true and preserves implementation and optimizations', async () => {
    const { spec, repo, useCase } = await setup()

    const result = await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(result).toMatchObject({
      specId: 'default:auth/login',
      schema: { name: 'new-schema', version: 2 },
      changed: true,
    })
    const state = (await repo.readPersistedState(spec))!
    expect(state.schema).toEqual({ name: 'new-schema', version: 2 })
    expect(state.implementation).toEqual([{ file: 'default:src/x.ts' }])
    expect(state.optimizations?.optimizedDescription?.value).toBe('d')
  })

  it('returns changed:false without parsing or writing when the schema is the same', async () => {
    const parse = vi.fn()
    const { repo, useCase } = await setup({
      targetSchema: makeSchema({ name: 'old-schema', version: 1 }),
      parser: makeParser({ parse }),
    })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    const result = await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/old' })

    expect(result.changed).toBe(false)
    expect(writeSpy).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('resolves the target schema through getActiveSchema in ref mode', async () => {
    const { useCase, execute } = await setup()

    await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(execute).toHaveBeenCalledWith({ mode: 'ref', ref: '@org/new' })
  })

  it('throws PersistedSchemaDependencyConflictError when extraction differs from persisted deps', async () => {
    const schema = makeSchema({
      name: 'new-schema',
      version: 2,
      artifacts: [makeArtifactType('specs', { scope: 'spec', format: 'markdown' })],
      metadataExtraction: DEP_EXTRACTION,
    })
    const { repo, useCase } = await setup({
      targetSchema: schema,
      parser: sectionParser(),
      dependsOn: [],
    })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    await expect(
      useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' }),
    ).rejects.toBeInstanceOf(PersistedSchemaDependencyConflictError)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('accepts extraction that equals the persisted deps', async () => {
    const schema = makeSchema({
      name: 'new-schema',
      version: 2,
      artifacts: [makeArtifactType('specs', { scope: 'spec', format: 'markdown' })],
      metadataExtraction: DEP_EXTRACTION,
    })
    const { useCase } = await setup({
      targetSchema: schema,
      parser: sectionParser(),
      dependsOn: ['default:auth/shared'],
    })

    const result = await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(result.changed).toBe(true)
    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('makes optimizations stale (schema-changed) after reassignment', async () => {
    const { spec, repo, useCase } = await setup()

    await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    const state = (await repo.readPersistedState(spec))!
    expect(state.schema).not.toEqual(state.optimizations!.optimizedDescription!.schema)
  })

  it('passes the observed originalHash as expectedRevision', async () => {
    const { spec, repo, useCase } = await setup()
    vi.spyOn(repo, 'readPersistedState').mockResolvedValue({
      schema: OLD,
      dependsOn: [],
      implementation: [],
      originalHash: 'sha256:observed',
    })
    const writeSpy = vi.spyOn(repo, 'writePersistedState')

    await useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' })

    expect(writeSpy).toHaveBeenCalledWith(spec, expect.anything(), {
      expectedRevision: 'sha256:observed',
    })
  })

  it('propagates ArtifactConflictError from the write', async () => {
    const { repo, useCase } = await setup()
    vi.spyOn(repo, 'writePersistedState').mockRejectedValue(
      new ArtifactConflictError('spec-lock.json', 'new', 'old'),
    )

    await expect(
      useCase.execute({ specId: 'default:auth/login', schemaRef: '@org/new' }),
    ).rejects.toBeInstanceOf(ArtifactConflictError)
  })

  it('throws SpecNotFoundError before SpecNotInitializedError for an unknown spec', async () => {
    const { useCase } = await setup()

    await expect(
      useCase.execute({ specId: 'default:auth/ghost', schemaRef: '@org/new' }),
    ).rejects.toBeInstanceOf(SpecNotFoundError)
  })

  it('rejects a readOnly workspace with the forSpec message', async () => {
    const { useCase } = await setup({ ownership: 'readOnly' })

    const err = await useCase
      .execute({ specId: 'auth/login', schemaRef: '@org/new' })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ReadOnlyWorkspaceError)
    expect((err as Error).message).toBe(
      'Cannot modify spec "default:auth/login" — workspace "default" is readOnly.',
    )
  })
})
