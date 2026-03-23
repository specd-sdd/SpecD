import { describe, it, expect } from 'vitest'
import { GetProjectContext } from '../../../src/application/use-cases/get-project-context.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  makeSpecRepository,
  makeSchemaProvider,
  makeArtifactType,
  makeSchema,
  makeFileReader,
  makeParsers,
  makeContentHasher,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetProjectContext', () => {
  it('returns context entries from config', async () => {
    const schema = makeSchema([])
    const specRepos = new Map([['default', makeSpecRepository()]])
    const fileReader = makeFileReader({
      '/project/ARCHITECTURE.md': '# Architecture\nHexagonal design.',
    })

    const uc = new GetProjectContext(
      specRepos,
      makeSchemaProvider(schema),
      fileReader,
      makeParsers(),
      makeContentHasher(),
    )

    const result = await uc.execute({
      config: {
        context: [
          { instruction: 'Always use TypeScript strict mode.' },
          { file: '/project/ARCHITECTURE.md' },
        ],
      },
    })

    expect(result.contextEntries).toHaveLength(2)
    expect(result.contextEntries[0]).toContain('Always use TypeScript strict mode.')
    expect(result.contextEntries[1]).toContain('Architecture')
  })

  it('throws SchemaNotFoundError when schema not resolved', async () => {
    const specRepos = new Map([['default', makeSpecRepository()]])

    const uc = new GetProjectContext(
      specRepos,
      makeSchemaProvider(null),
      makeFileReader(),
      makeParsers(),
      makeContentHasher(),
    )

    await expect(
      uc.execute({
        config: {},
      }),
    ).rejects.toThrow(SchemaNotFoundError)
  })

  it('includes specs matching include patterns', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
    })
    const schema = makeSchema([specType])

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: { 'auth/login/spec.md': '# Auth Login' },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new GetProjectContext(
      specRepos,
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(),
      makeContentHasher(),
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['*'],
      },
    })

    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]!.specId).toBe('default:auth/login')
    expect(result.specs[0]!.source).toBe('includePattern')
    expect(result.specs[0]!.mode).toBe('full')
  })

  it('populates title and description from metadata', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
    })
    const schema = makeSchema([specType])

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const specContent = '# Auth Login'
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md': specContent,
        'auth/login/.specd-metadata.yaml': JSON.stringify({
          title: 'Auth Login',
          description: 'Handles user authentication',
          contentHashes: { 'spec.md': 'sha256:placeholder' },
        }),
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new GetProjectContext(
      specRepos,
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(),
      makeContentHasher(),
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['*'],
      },
    })

    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]!.title).toBe('Auth Login')
    expect(result.specs[0]!.description).toBe('Handles user authentication')
  })

  it('excludes specs matching exclude patterns', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
    })
    const schema = makeSchema([specType])

    const spec1 = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('default', SpecPath.parse('billing/payments'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec1, spec2],
      artifacts: {
        'auth/login/spec.md': '# Auth Login',
        'billing/payments/spec.md': '# Payments',
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new GetProjectContext(
      specRepos,
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(),
      makeContentHasher(),
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['*'],
        contextExcludeSpecs: ['auth/*'],
      },
    })

    expect(result.specs).toHaveLength(1)
    expect(result.specs[0]!.specId).toBe('default:billing/payments')
  })
})
