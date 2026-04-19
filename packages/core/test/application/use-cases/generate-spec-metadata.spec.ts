import { describe, expect, it } from 'vitest'
import { GenerateSpecMetadata } from '../../../src/application/use-cases/generate-spec-metadata.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { ExtractorTransformError } from '../../../src/domain/errors/extractor-transform-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'
import {
  makeArtifactType,
  makeContentHasher,
  makeParser,
  makeParsers,
  makeSchema,
  makeSchemaProvider,
  makeSpecRepository,
} from './helpers.js'

describe('GenerateSpecMetadata', () => {
  it('resolves dependsOn through the built-in extractor transform runtime', async () => {
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/spec.md':
          '# Auth Login\n\n## Spec Dependencies\n\n- [`default:auth/shared`](../shared/spec.md)\n',
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
                {
                  type: 'paragraph',
                  value: '- [`default:auth/shared`](../shared/spec.md)',
                },
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

    const useCase = new GenerateSpecMetadata(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.hasExtraction).toBe(true)
    expect(result.metadata.dependsOn).toEqual(['default:auth/shared'])
  })

  it('falls back from a legacy dependency label to the captured href candidate', async () => {
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const shared = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec.md':
          '# Auth Login\n\n## Spec Dependencies\n\n- [`specs/default/auth/shared/spec.md`](../shared/spec.md)\n',
      },
      resolveFromPath: async (inputPath) => {
        if (inputPath !== '../shared/spec.md') return null
        return {
          specPath: SpecPath.parse('auth/shared'),
          specId: 'default:auth/shared',
        }
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
                {
                  type: 'paragraph',
                  value: '- [`specs/default/auth/shared/spec.md`](../shared/spec.md)',
                },
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

    const useCase = new GenerateSpecMetadata(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.hasExtraction).toBe(true)
    expect(result.metadata.dependsOn).toEqual(['default:auth/shared'])
  })

  it('normalizes ../../_global/architecture/spec.md to default:_global/architecture', async () => {
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
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

    const coreSpec = new Spec('core', SpecPath.parse('core/actor-resolver-port'), ['spec.md'])
    const globalArchitecture = new Spec('default', SpecPath.parse('_global/architecture'), [
      'spec.md',
    ])
    const coreRepo = makeSpecRepository({
      specs: [coreSpec],
      artifacts: {
        'core/actor-resolver-port/spec.md':
          '# Actor Resolver\n\n## Spec Dependencies\n\n- [`../../_global/architecture/spec.md`](../../_global/architecture/spec.md)\n',
      },
      workspace: 'core',
      resolveFromPath: async (inputPath) => {
        if (inputPath !== '../../_global/architecture/spec.md') return null
        return { crossWorkspaceHint: ['_global', 'architecture'] }
      },
    })
    const defaultRepo = makeSpecRepository({
      specs: [globalArchitecture],
      workspace: 'default',
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
                {
                  type: 'paragraph',
                  value:
                    '- [`../../_global/architecture/spec.md`](../../_global/architecture/spec.md)',
                },
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

    const useCase = new GenerateSpecMetadata(
      new Map([
        ['core', coreRepo],
        ['default', defaultRepo],
      ]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
      [
        { workspace: 'default', prefixSegments: ['_global'] },
        { workspace: 'core', prefixSegments: ['core'] },
      ],
    )

    const result = await useCase.execute({ specId: 'core:core/actor-resolver-port' })
    expect(result.hasExtraction).toBe(true)
    expect(result.metadata.dependsOn).toEqual(['default:_global/architecture'])
  })

  it('accepts canonical spec ids without backticks or links', async () => {
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const shared = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec, shared],
      artifacts: {
        'auth/login/spec.md':
          '# Auth Login\n\n## Spec Dependencies\n\n- default:auth/shared — shared auth helpers\n',
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
                {
                  type: 'paragraph',
                  value: '- default:auth/shared — shared auth helpers',
                },
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

    const useCase = new GenerateSpecMetadata(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    const result = await useCase.execute({ specId: 'default:auth/login' })
    expect(result.hasExtraction).toBe(true)
    expect(result.metadata.dependsOn).toEqual(['default:auth/shared'])
  })

  it('fails extraction when resolveSpecPath cannot resolve any candidate', async () => {
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
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

    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const shared = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
    const repo = makeSpecRepository({
      specs: [spec, shared],
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
              children: [
                {
                  type: 'paragraph',
                  value: '- [`Shared`](not-a-spec)',
                },
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

    const useCase = new GenerateSpecMetadata(
      new Map([['default', repo]]),
      makeSchemaProvider(schema),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    await expect(useCase.execute({ specId: 'default:auth/login' })).rejects.toThrow(
      ExtractorTransformError,
    )
  })
})
