import { describe, it, expect } from 'vitest'
import { GetProjectContext } from '../../../src/application/use-cases/get-project-context.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { ExtractorTransformError } from '../../../src/domain/errors/extractor-transform-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'
import {
  makeSpecRepository,
  makeSchemaProvider,
  makeArtifactType,
  makeSchema,
  makeFileReader,
  makeParser,
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

  it('uses resolveSpecPath during followDeps fallback extraction', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
    })
    const schema = makeSchema({
      artifacts: [specType],
      metadataExtraction: {
        dependsOn: {
          artifact: 'specs',
          extractor: {
            selector: { type: 'section', matches: '^Spec Dependencies$' },
            extract: 'content',
            capture:
              '(?:^|\\n)\\s*-\\s+(?:\\[`?|`)?([^`\\]\\n]+?)(?:(?:`?\\]\\(([^)]+)\\)|`)|(?=\\s*(?:—|$)))',
            transform: { name: 'resolveSpecPath', args: ['$2'] },
          },
        },
      },
    })

    const login = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const shared = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
    const sharedContent = '# Shared'
    const repo = makeSpecRepository({
      specs: [login, shared],
      artifacts: {
        'auth/login/spec.md':
          '# Auth Login\n\n## Spec Dependencies\n\n- [`default:auth/shared`](../shared/spec.md)\n',
        'auth/shared/spec.md': sharedContent,
        'auth/shared/.specd-metadata.yaml': JSON.stringify({
          title: 'Shared',
          description: 'Shared auth helpers.',
          contentHashes: { 'spec.md': 'sha256:placeholder' },
        }),
      },
    })

    const markdownParser = makeParser({
      parse: () => ({
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
      }),
      renderSubtree: (node) =>
        (node.value as string | undefined) ??
        (node.children ?? [])
          .map((child) => ((child as { value?: unknown }).value as string | undefined) ?? '')
          .join('\n'),
    })

    const uc = new GetProjectContext(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['default:auth/login'],
      },
      followDeps: true,
    })

    expect(result.specs.some((spec) => spec.specId === 'default:auth/shared')).toBe(true)
    expect(result.warnings.some((warning) => warning.type === 'missing-metadata')).toBe(true)
  })

  it('fails followDeps fallback extraction when no dependency candidate is resolvable', async () => {
    const specType = makeArtifactType('specs', {
      scope: 'spec',
      output: 'spec.md',
      format: 'markdown',
    })
    const schema = makeSchema({
      artifacts: [specType],
      metadataExtraction: {
        dependsOn: {
          artifact: 'specs',
          extractor: {
            selector: { type: 'section', matches: '^Spec Dependencies$' },
            extract: 'content',
            capture:
              '(?:^|\\n)\\s*-\\s+(?:\\[`?|`)?([^`\\]\\n]+?)(?:(?:`?\\]\\(([^)]+)\\)|`)|(?=\\s*(?:—|$)))',
            transform: { name: 'resolveSpecPath', args: ['$2'] },
          },
        },
      },
    })

    const login = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const shared = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [login, shared],
      artifacts: {
        'auth/login/spec.md': '# Auth Login\n\n## Spec Dependencies\n\n- [`Shared`](not-a-spec)\n',
      },
    })

    const markdownParser = makeParser({
      parse: () => ({
        root: {
          type: 'document',
          children: [
            {
              type: 'section',
              label: 'Spec Dependencies',
              children: [{ type: 'paragraph', value: '- [`Shared`](not-a-spec)' }],
            },
          ],
        },
      }),
      renderSubtree: (node) =>
        (node.value as string | undefined) ??
        (node.children ?? [])
          .map((child) => ((child as { value?: unknown }).value as string | undefined) ?? '')
          .join('\n'),
    })

    const uc = new GetProjectContext(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    await expect(
      uc.execute({
        config: {
          contextIncludeSpecs: ['default:auth/login'],
        },
        followDeps: true,
      }),
    ).rejects.toThrow(ExtractorTransformError)
  })
})
