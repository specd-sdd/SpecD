import { describe, it, expect } from 'vitest'
import {
  GetProjectContext,
  type GetProjectContextInput,
  type GetProjectContextResult,
} from '../../../src/application/use-cases/get-project-context.js'
import { type CompileContextConfig } from '../../../src/application/use-cases/compile-context.js'
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
  makeListWorkspaces,
} from './helpers.js'

type LegacyGetProjectContextInput = GetProjectContextInput & { config?: CompileContextConfig }

function makeGetProjectContext(
  listWorkspaces: ReturnType<typeof makeListWorkspaces>,
  schemaProvider: ReturnType<typeof makeSchemaProvider>,
  files: ReturnType<typeof makeFileReader>,
  parsers: ReturnType<typeof makeParsers>,
  hasher: ReturnType<typeof makeContentHasher>,
  extractorTransforms = createBuiltinExtractorTransforms(),
  workspaceRoutes: readonly { workspace: string; prefixSegments: readonly string[] }[] = [],
  defaultConfig: CompileContextConfig = {},
): GetProjectContext & {
  execute: (input: LegacyGetProjectContextInput) => Promise<GetProjectContextResult>
} {
  const uc = new GetProjectContext(
    listWorkspaces,
    schemaProvider,
    files,
    parsers,
    hasher,
    extractorTransforms,
    workspaceRoutes,
    defaultConfig,
  )
  const base = uc.execute.bind(uc)
  const rebuild = (config: CompileContextConfig): GetProjectContext =>
    new GetProjectContext(
      listWorkspaces,
      schemaProvider,
      files,
      parsers,
      hasher,
      extractorTransforms,
      workspaceRoutes,
      config,
    )
  uc.execute = ((input: LegacyGetProjectContextInput) => {
    const { config, ...rest } = input
    if (config !== undefined) {
      return rebuild(config).execute(rest)
    }
    return base(rest)
  }) as GetProjectContext['execute']
  return uc as GetProjectContext & {
    execute: (input: LegacyGetProjectContextInput) => Promise<GetProjectContextResult>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetProjectContext', () => {
  it('returns context entries from config', async () => {
    const schema = makeSchema([])
    const specRepos = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))
    const fileReader = makeFileReader({
      '/project/ARCHITECTURE.md': '# Architecture\nHexagonal design.',
    })

    const uc = makeGetProjectContext(
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
    const specRepos = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))

    const uc = makeGetProjectContext(
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
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = makeGetProjectContext(
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
    expect(result.specs[0]!.mode).toBe('summary')
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
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = makeGetProjectContext(
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
    const specRepos = makeListWorkspaces(new Map([['default', repo]]))

    const uc = makeGetProjectContext(
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

    const uc = makeGetProjectContext(
      makeListWorkspaces(new Map([['default', repo]])),
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

  it('uses metadata dependsOn even when the schema omits dependency extraction', async () => {
    const schema = makeSchema({ metadataExtraction: {} })
    const hasher = makeContentHasher()
    const loginContent = '# Auth Login\n'
    const sharedContent = '# Shared\n'
    const repo = makeSpecRepository({
      specs: [
        new Spec('default', SpecPath.parse('auth/login'), ['spec.md']),
        new Spec('default', SpecPath.parse('auth/shared'), ['spec.md']),
      ],
      artifacts: {
        'auth/login/spec.md': loginContent,
        'auth/login/.specd-metadata.yaml': JSON.stringify({
          title: 'Login',
          dependsOn: ['default:auth/shared'],
          contentHashes: { 'spec.md': hasher.hash(loginContent) },
        }),
        'auth/shared/spec.md': sharedContent,
        'auth/shared/.specd-metadata.yaml': JSON.stringify({
          title: 'Shared',
          contentHashes: { 'spec.md': hasher.hash(sharedContent) },
        }),
      },
    })

    const uc = makeGetProjectContext(
      makeListWorkspaces(new Map([['default', repo]])),
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(),
      hasher,
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['default:auth/login'],
      },
      followDeps: true,
    })

    expect(result.specs.some((spec) => spec.specId === 'default:auth/shared')).toBe(true)
    expect(result.warnings.filter((warning) => warning.type === 'missing-metadata')).toHaveLength(0)
  })

  it('normalizes ../../_global/architecture/spec.md during followDeps fallback extraction', async () => {
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

    const actorResolverSpec = new Spec('core', SpecPath.parse('core/actor-resolver-port'), [
      'spec.md',
    ])
    const architectureSpec = new Spec('default', SpecPath.parse('_global/architecture'), [
      'spec.md',
    ])
    const architectureContent = '# Architecture'
    const coreRepo = makeSpecRepository({
      workspace: 'core',
      specs: [actorResolverSpec],
      artifacts: {
        'core/actor-resolver-port/spec.md':
          '# Actor Resolver\n\n## Spec Dependencies\n\n- [`../../_global/architecture/spec.md`](../../_global/architecture/spec.md)\n',
      },
      resolveFromPath: async (inputPath) => {
        if (inputPath !== '../../_global/architecture/spec.md') return null
        return { crossWorkspaceHint: ['_global', 'architecture'] }
      },
    })
    const defaultRepo = makeSpecRepository({
      workspace: 'default',
      specs: [architectureSpec],
      artifacts: {
        '_global/architecture/spec.md': architectureContent,
        '_global/architecture/.specd-metadata.yaml': JSON.stringify({
          title: 'Architecture',
          description: 'Global architecture constraints.',
          contentHashes: {
            'spec.md': 'sha256:a38f7bc6aff8e64968ac404465c1579222a2e0b6388f37e9bb31b8fe5f7829a0',
          },
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

    const uc = makeGetProjectContext(
      makeListWorkspaces(
        new Map([
          ['core', coreRepo],
          ['default', defaultRepo],
        ]),
      ),
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
      [
        { workspace: 'default', prefixSegments: ['_global'] },
        { workspace: 'core', prefixSegments: ['core'] },
      ],
    )

    const result = await uc.execute({
      config: {
        contextIncludeSpecs: ['core:core/actor-resolver-port'],
      },
      followDeps: true,
    })

    expect(result.specs.some((spec) => spec.specId === 'default:_global/architecture')).toBe(true)
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

    const uc = makeGetProjectContext(
      makeListWorkspaces(new Map([['default', repo]])),
      makeSchemaProvider(schema),
      makeFileReader(),
      makeParsers(markdownParser),
      makeContentHasher(),
      createBuiltinExtractorTransforms(),
    )

    await expect(
      uc.execute({
        config: {
          projectRoot: '/project',
          configPath: '/project/.specd',
          contextIncludeSpecs: ['default:auth/login'],
        },
        followDeps: true,
      }),
    ).rejects.toThrow(ExtractorTransformError)
  })

  describe('cache verification (llmOptimizedContext)', () => {
    const configPath = '/project/.specd'
    const metadataPath = '/project/.specd/project-metadata.json'
    const configYamlPath = '/project/specd.yaml'

    it('returns optimized context when cache is fresh', async () => {
      const schema = makeSchema([])
      const specRepos = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))
      const hasher = makeContentHasher()
      const fileReader = makeFileReader({
        [metadataPath]: JSON.stringify({
          version: 1,
          optimized: { context: 'Optimized project summary' },
          freshness: {
            algorithm: 'sha256',
            inputs: {
              config: { path: 'specd.yaml', hash: hasher.hash('config content') },
              contextFiles: [],
              specMetadata: [],
            },
            combinedHash: 'combined',
          },
          generated: { at: new Date().toISOString() },
        }),
        [configYamlPath]: 'config content',
      })

      const uc = makeGetProjectContext(
        specRepos,
        makeSchemaProvider(schema),
        fileReader,
        makeParsers(),
        hasher,
      )

      const result = await uc.execute({
        config: {
          projectRoot: '/project',
          configPath,
          llmOptimizedContext: true,
        },
      })

      expect(result.contextEntries).toEqual(['Optimized project summary'])
      expect(result.specs).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('falls back and warns when config hash mismatches', async () => {
      const schema = makeSchema([])
      const specRepos = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))
      const hasher = makeContentHasher()
      const fileReader = makeFileReader({
        [metadataPath]: JSON.stringify({
          version: 1,
          optimized: { context: 'Optimized project summary' },
          freshness: {
            algorithm: 'sha256',
            inputs: {
              config: { path: 'specd.yaml', hash: 'OLD_HASH' },
              contextFiles: [],
              specMetadata: [],
            },
            combinedHash: 'combined',
          },
          generated: { at: new Date().toISOString() },
        }),
        [configYamlPath]: 'NEW config content',
      })

      const uc = makeGetProjectContext(
        specRepos,
        makeSchemaProvider(schema),
        fileReader,
        makeParsers(),
        hasher,
      )

      const result = await uc.execute({
        config: {
          projectRoot: '/project',
          configPath,
          llmOptimizedContext: true,
          context: [{ instruction: 'Fallback' }],
        },
      })

      expect(result.contextEntries).toContain('**Source: instruction**\n\nFallback')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]!.type).toBe('stale-optimization')
    })

    it('falls back and warns when spec metadata hash mismatches', async () => {
      const specType = makeArtifactType('specs', {
        scope: 'spec',
        output: 'spec.md',
        format: 'markdown',
      })
      const schema = makeSchema([specType])
      const hasher = makeContentHasher()

      const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const repo = makeSpecRepository({
        specs: [spec],
        artifacts: {
          'auth/login/.specd-metadata.yaml': JSON.stringify({
            title: 'Title',
            description: 'Desc',
            contentHashes: { 'spec.md': hasher.hash('NEW CONTENT') },
          }),
        },
      })
      const specRepos = makeListWorkspaces(new Map([['default', repo]]))

      const fileReader = makeFileReader({
        [metadataPath]: JSON.stringify({
          version: 1,
          optimized: { context: 'Optimized' },
          freshness: {
            algorithm: 'sha256',
            inputs: {
              config: { path: 'specd.yaml', hash: hasher.hash('config') },
              contextFiles: [],
              specMetadata: [{ id: 'default:auth/login', hash: hasher.hash('OLD_METADATA_HASH') }],
            },
            combinedHash: 'combined',
          },
          generated: { at: new Date().toISOString() },
        }),
        [configYamlPath]: 'config',
      })

      const uc = makeGetProjectContext(
        specRepos,
        makeSchemaProvider(schema),
        fileReader,
        makeParsers(),
        hasher,
      )

      const result = await uc.execute({
        config: {
          projectRoot: '/project',
          configPath,
          llmOptimizedContext: true,
          contextIncludeSpecs: ['*'],
        },
      })

      expect(result.warnings.some((w) => w.type === 'stale-optimization')).toBe(true)
      expect(result.specs).toHaveLength(1) // processed normally
    })

    it('warns when individual spec is missing optimizedContext field', async () => {
      const specType = makeArtifactType('specs', {
        scope: 'spec',
        output: 'spec.md',
        format: 'markdown',
      })
      const schema = makeSchema([specType])
      const hasher = makeContentHasher()

      const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const repo = makeSpecRepository({
        specs: [spec],
        artifacts: {
          'auth/login/.specd-metadata.yaml': JSON.stringify({
            title: 'Title',
            description: 'Desc',
            contentHashes: { 'spec.md': hasher.hash('# Content\n') },
          }),
          'auth/login/spec.md': '# Content\n',
        },
      })
      const specRepos = makeListWorkspaces(new Map([['default', repo]]))

      const fileReader = makeFileReader({
        [configYamlPath]: 'config',
      })

      const uc = makeGetProjectContext(
        specRepos,
        makeSchemaProvider(schema),
        fileReader,
        makeParsers(),
        hasher,
      )

      const result = await uc.execute({
        config: {
          projectRoot: '/project',
          configPath,
          llmOptimizedContext: true,
          contextIncludeSpecs: ['*'],
        },
      })

      expect(
        result.warnings.some(
          (w) => w.type === 'stale-optimization' && w.path === 'default:auth/login',
        ),
      ).toBe(true)
    })
  })
})
