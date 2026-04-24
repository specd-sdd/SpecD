import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  CompileContext,
  type CompileContextConfig,
  type CompileContextResult,
} from '../../../src/application/use-cases/compile-context.js'
import { type PreviewSpec } from '../../../src/application/use-cases/preview-spec.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import {
  ArtifactType,
  type ArtifactTypeProps,
} from '../../../src/domain/value-objects/artifact-type.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { ExtractorTransformError } from '../../../src/domain/errors/extractor-transform-error.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import {
  type ArtifactParserRegistry,
  type ArtifactParser,
} from '../../../src/application/ports/artifact-parser.js'
import { type ExtractorTransformRegistry } from '../../../src/domain/services/content-extraction.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
import { createBuiltinExtractorTransforms } from '../../../src/composition/extractor-transforms/index.js'
import {
  makeChangeRepository,
  makeSpecRepository,
  makeArtifactType as makeArtifactTypeBase,
  makeSchema as makeSchemaBase,
  makeContentHasher,
} from './helpers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testActor = { name: 'Test', email: 'test@example.com' }

function makeChange(
  name: string,
  opts: {
    specIds?: string[]
    artifacts?: ChangeArtifact[]
    schemaName?: string
  } = {},
): Change {
  const { specIds = ['default:auth/login'], artifacts = [] } = opts
  const createdAt = new Date('2024-01-15')
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds,
      schemaName: opts.schemaName ?? '@specd/schema-std',
      schemaVersion: 1,
    },
    {
      type: 'transitioned',
      from: 'drafting',
      to: 'designing',
      at: new Date(),
      by: testActor,
    },
  ]
  const change = new Change({
    name,
    createdAt,
    specIds,
    history: events,
  })
  for (const artifact of artifacts) {
    change.setArtifact(artifact)
  }
  return change
}

function makeSchema(
  opts: {
    artifacts?: ArtifactType[]
    workflow?: WorkflowStep[]
    metadataExtraction?: import('../../../src/domain/value-objects/metadata-extraction.js').MetadataExtraction
  } = {},
): Schema {
  return makeSchemaBase({
    ...opts,
    name: '@specd/schema-std',
    artifacts: opts.artifacts ?? [
      makeArtifactType('spec', {
        scope: 'spec',
        output: 'spec.md',
      }),
    ],
  })
}

function makeArtifactType(id: string, extra: Partial<ArtifactTypeProps> = {}): ArtifactType {
  return makeArtifactTypeBase(id, { scope: 'spec', ...extra })
}

/** Returns a spec repo serving the given specs and artifact content lookup. */
function makeSpecRepo(
  specs: Spec[],
  /** key = `'capPath/filename'` */
  artifacts: Record<string, string | null> = {},
): SpecRepository {
  return makeSpecRepository({ specs, artifacts })
}

function sha256Hex(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

/** Builds a valid metadata JSON string with correct hashes for `spec.md`. */
function freshMetadata(
  specContent: string,
  opts: {
    description?: string
    dependsOn?: string[]
    contentHashes?: Record<string, string>
    rules?: Array<{ requirement: string; rules: string[] }>
    constraints?: string[]
    scenarios?: Array<{ requirement: string; name: string; when?: string[]; then?: string[] }>
  } = {},
): string {
  const hash = sha256Hex(specContent)
  const obj: Record<string, unknown> = {
    title: 'Test',
    description: opts.description ?? 'Test spec description.',
    contentHashes: opts.contentHashes ?? { 'spec.md': hash },
  }
  if (opts.dependsOn && opts.dependsOn.length > 0) {
    obj.dependsOn = opts.dependsOn
  }
  if (opts.rules && opts.rules.length > 0) {
    obj.rules = opts.rules
  }
  if (opts.constraints && opts.constraints.length > 0) {
    obj.constraints = opts.constraints
  }
  if (opts.scenarios && opts.scenarios.length > 0) {
    obj.scenarios = opts.scenarios
  }
  return JSON.stringify(obj)
}

/** A stubbed parser that does nothing meaningful. */
const stubParser: ArtifactParser = {
  fileExtensions: ['.md'],
  parse: () => ({ root: { type: 'document', children: [] } }),
  apply: (ast) => ({ ast, warnings: [] }),
  serialize: () => '',
  renderSubtree: () => '',
  nodeTypes: () => [],
  outline: () => [],
  deltaInstructions: () => 'delta format instructions',
  parseDelta: () => [],
}

/** Recursively renders a node and its children, collecting all `value` fields. */
function renderSubtreeRecursive(node: {
  value?: unknown
  children?: readonly { value?: unknown; children?: readonly unknown[] }[]
}): string {
  if (node.value !== undefined) return String(node.value as string)
  return (node.children ?? [])
    .map((c) => renderSubtreeRecursive(c as typeof node))
    .filter(Boolean)
    .join('\n')
}

const noOp: CompileContextConfig = {
  contextMode: 'full',
  contextIncludeSpecs: [],
  contextExcludeSpecs: [],
}

// ---------------------------------------------------------------------------
// Structured-result query helpers
// ---------------------------------------------------------------------------

/** Check if any project context entry contains the given text. */
function projectContextContains(result: CompileContextResult, text: string): boolean {
  return result.projectContext.some((e) => e.content.includes(text))
}

/** Check if any spec entry's specId, description, or content contains the given text. */
function specsContain(result: CompileContextResult, text: string): boolean {
  return result.specs.some(
    (s) =>
      s.specId.includes(text) ||
      (s.title?.includes(text) ?? false) ||
      (s.description?.includes(text) ?? false) ||
      (s.content?.includes(text) ?? false),
  )
}

/** Check if any available step entry contains the given text. */
function availableStepsContain(result: CompileContextResult, text: string): boolean {
  return result.availableSteps.some(
    (s) => s.step.includes(text) || s.blockingArtifacts.some((a) => a.includes(text)),
  )
}

/** Check across all structured fields for the given text. */
function resultContains(result: CompileContextResult, text: string): boolean {
  return (
    projectContextContains(result, text) ||
    specsContain(result, text) ||
    availableStepsContain(result, text)
  )
}

/** Count how many spec entries have a specId containing the given text. */
function specIdCount(result: CompileContextResult, text: string): number {
  return result.specs.filter((s) => s.specId.includes(text)).length
}

function listSpecIds(result: CompileContextResult): string[] {
  return result.specs.map((spec) => spec.specId)
}

function makeSut(opts: {
  change?: Change
  schema?: Schema
  specRepos?: Map<string, SpecRepository>
  fileReader?: FileReader
  parsers?: ArtifactParserRegistry
  previewSpec?: PreviewSpec
  extractorTransforms?: ExtractorTransformRegistry
  workspaceRoutes?: readonly {
    workspace: string
    prefixSegments: readonly string[]
  }[]
}): {
  sut: CompileContext
  changeRepo: ChangeRepository
  schemaProvider: SchemaProvider
} {
  const {
    change,
    schema,
    specRepos,
    fileReader,
    parsers,
    previewSpec,
    extractorTransforms,
    workspaceRoutes,
  } = opts
  const changeRepo = makeStubChangeRepo(change)
  const schemaProvider = makeStubSchemaProvider(schema ?? null)

  const sut = new CompileContext(
    changeRepo,
    specRepos ?? new Map(),
    schemaProvider,
    fileReader ?? makeStubFileReader(),
    parsers ?? (new Map() as ArtifactParserRegistry),
    makeContentHasher(),
    previewSpec ?? makeStubPreviewSpec(),
    extractorTransforms ?? new Map(),
    workspaceRoutes ?? [],
  )

  const execute = sut.execute.bind(sut)
  sut.execute = ((input) =>
    execute({
      includeChangeSpecs: true,
      ...input,
    })) as CompileContext['execute']

  return { sut, changeRepo, schemaProvider }
}

function makeStubChangeRepo(change?: Change) {
  return makeChangeRepository(change ? [change] : [])
}

function makeStubSchemaProvider(schema: Schema | null): SchemaProvider {
  return {
    get: async () => {
      if (schema === null) throw new SchemaNotFoundError('(test)')
      return schema
    },
  }
}

function makeStubFileReader(files: Record<string, string> = {}): FileReader {
  return {
    read: async (path: string) => files[path] ?? null,
  }
}

function makeStubPreviewSpec(): PreviewSpec {
  return {
    execute: vi.fn().mockResolvedValue({ specId: '', changeName: '', files: [], warnings: [] }),
  } as unknown as PreviewSpec
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompileContext', () => {
  describe('Requirement: Ports and constructor', () => {
    it('constructs without error', () => {
      expect(
        () =>
          new CompileContext(
            makeStubChangeRepo(),
            new Map(),
            makeStubSchemaProvider(null),
            makeStubFileReader(),
            new Map() as ArtifactParserRegistry,
            makeContentHasher(),
            makeStubPreviewSpec(),
          ),
      ).not.toThrow()
    })
  })

  describe('Requirement: Input — error handling', () => {
    it('throws ChangeNotFoundError when change is not found', async () => {
      const sut = new CompileContext(
        makeStubChangeRepo(),
        new Map(),
        makeStubSchemaProvider(makeSchema()),
        makeStubFileReader(),
        new Map() as ArtifactParserRegistry,
        makeContentHasher(),
        makeStubPreviewSpec(),
      )
      await expect(
        sut.execute({
          name: 'no-such-change',
          step: 'designing',

          config: noOp,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })

    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChange('my-change')
      const sut = new CompileContext(
        makeStubChangeRepo(change),
        new Map(),
        makeStubSchemaProvider(null),
        makeStubFileReader(),
        new Map() as ArtifactParserRegistry,
        makeContentHasher(),
        makeStubPreviewSpec(),
      )
      await expect(
        sut.execute({
          name: 'my-change',
          step: 'designing',

          config: noOp,
        }),
      ).rejects.toThrow(SchemaNotFoundError)
    })

    it('throws SchemaMismatchError when active schema name differs from change schema name', async () => {
      const change = makeChange('my-change', { schemaName: 'schema-a' })
      const schema = new Schema('schema', 'schema-b', 1, [], [])

      const { sut } = makeSut({ change, schema })

      await expect(
        sut.execute({
          name: 'my-change',
          step: 'designing',
          config: noOp,
        }),
      ).rejects.toThrow(SchemaMismatchError)
    })
  })

  describe('Requirement: Falls back to extraction when metadata is stale or absent', () => {
    it('uses resolveSpecPath during fallback dependsOn traversal', async () => {
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
      const repos = new Map([
        [
          'default',
          makeSpecRepo([login, shared], {
            'auth/login/spec.md':
              '# Auth Login\n\n## Spec Dependencies\n\n- [`default:auth/shared`](../shared/spec.md)\n',
            'auth/shared/spec.md': sharedContent,
            'auth/shared/.specd-metadata.yaml': freshMetadata(sharedContent, {
              description: 'Shared auth helpers.',
            }),
          }),
        ],
      ])

      const markdownParser: ArtifactParser = {
        ...stubParser,
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
        renderSubtree: renderSubtreeRecursive,
      }

      const { sut } = makeSut({
        change: makeChange('dep-fallback', { specIds: ['default:auth/login'] }),
        schema,
        specRepos: repos,
        parsers: new Map([['markdown', markdownParser]]) as ArtifactParserRegistry,
        extractorTransforms: createBuiltinExtractorTransforms(),
      })

      const result = await sut.execute({
        name: 'dep-fallback',
        step: 'implementing',
        config: noOp,
        followDeps: true,
      })

      expect(result.specs.some((spec) => spec.specId === 'default:auth/shared')).toBe(true)
      expect(result.warnings.some((warning) => warning.type === 'missing-metadata')).toBe(true)
    })

    it('fails fallback dependsOn traversal when no dependency candidate is resolvable', async () => {
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
      const repos = new Map([
        [
          'default',
          makeSpecRepo([login, shared], {
            'auth/login/spec.md':
              '# Auth Login\n\n## Spec Dependencies\n\n- [`Shared`](not-a-spec)\n',
          }),
        ],
      ])

      const markdownParser: ArtifactParser = {
        ...stubParser,
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
        renderSubtree: renderSubtreeRecursive,
      }

      const { sut } = makeSut({
        change: makeChange('dep-fallback', { specIds: ['default:auth/login'] }),
        schema,
        specRepos: repos,
        parsers: new Map([['markdown', markdownParser]]) as ArtifactParserRegistry,
        extractorTransforms: createBuiltinExtractorTransforms(),
      })

      await expect(
        sut.execute({
          name: 'dep-fallback',
          step: 'implementing',
          config: noOp,
          followDeps: true,
        }),
      ).rejects.toThrow(ExtractorTransformError)
    })

    it('normalizes ../../_global/architecture/spec.md during fallback dependsOn traversal', async () => {
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
          '_global/architecture/.specd-metadata.yaml': freshMetadata(architectureContent, {
            description: 'Architecture constraints.',
          }),
        },
      })

      const markdownParser: ArtifactParser = {
        ...stubParser,
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
        renderSubtree: renderSubtreeRecursive,
      }

      const { sut } = makeSut({
        change: makeChange('dep-fallback', { specIds: ['core:core/actor-resolver-port'] }),
        schema,
        specRepos: new Map([
          ['core', coreRepo],
          ['default', defaultRepo],
        ]),
        parsers: new Map([['markdown', markdownParser]]) as ArtifactParserRegistry,
        extractorTransforms: createBuiltinExtractorTransforms(),
        workspaceRoutes: [
          { workspace: 'default', prefixSegments: ['_global'] },
          { workspace: 'core', prefixSegments: ['core'] },
        ],
      })

      const result = await sut.execute({
        name: 'dep-fallback',
        step: 'implementing',
        config: noOp,
        followDeps: true,
      })

      expect(result.specs.some((spec) => spec.specId === 'default:_global/architecture')).toBe(true)
    })
  })

  describe('Requirement: Context spec collection', () => {
    it('applies project-level include patterns regardless of active workspace', async () => {
      // Change has no _global specs, but project-level include covers them
      const globalSpec = new Spec('default', SpecPath.parse('_global/commits'), ['spec.md'])
      const specRepo = makeSpecRepo([globalSpec])
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: ['_global/*'],
          contextExcludeSpecs: [],
        },
      })

      // Should not warn about unknown workspace for _global (it resolves to 'default')
      const unknownWorkspaceWarnings = result.warnings.filter((w) => w.type === 'unknown-workspace')
      expect(unknownWorkspaceWarnings).toHaveLength(0)
    })

    it('does not apply workspace-level include for inactive workspaces', async () => {
      // billing workspace is not active (no billing spec in change.specIds)
      const billingSpec = new Spec('billing', SpecPath.parse('payments'), ['spec.md'])
      const billingRepo = makeSpecRepo([billingSpec])
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const defaultSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const defaultRepo = makeSpecRepo([defaultSpec])

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([
          ['default', defaultRepo],
          ['billing', billingRepo],
        ]),
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: [],
          workspaces: {
            billing: { contextIncludeSpecs: ['*'] },
          },
        },
      })

      // billing specs should NOT be included — billing workspace is not active
      expect(specsContain(result, 'billing:payments')).toBe(false)
    })

    it('applies project-level exclude before workspace-level patterns', async () => {
      const draftSpec = new Spec('default', SpecPath.parse('drafts/old-spec'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([draftSpec, otherSpec])
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({ artifacts: [makeArtifactType('spec')] })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: ['default:*'],
          contextExcludeSpecs: ['default:drafts/*'],
        },
      })

      expect(specsContain(result, 'drafts/old-spec')).toBe(false)
    })

    it('applies workspace-level exclude after workspace-level include', async () => {
      const internalSpec = new Spec('default', SpecPath.parse('internal/notes'), ['spec.md'])
      const authSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([internalSpec, authSpec])
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({ artifacts: [makeArtifactType('spec')] })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: [],
          workspaces: {
            default: {
              contextIncludeSpecs: ['*'],
              contextExcludeSpecs: ['internal/*'],
            },
          },
        },
      })

      expect(specsContain(result, 'internal/notes')).toBe(false)
    })

    it('change specId survives matching exclude rules', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/*'],
          contextExcludeSpecs: ['default:auth/*'],
        },
      })

      expect(listSpecIds(result)).toContain('default:auth/login')
      const loginEntry = result.specs.find((spec) => spec.specId === 'default:auth/login')
      expect(loginEntry?.source).toBe('specIds')
    })

    it('includeChangeSpecs false skips direct change spec seed', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
      })
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        includeChangeSpecs: false,
        config: noOp,
      })

      expect(listSpecIds(result)).not.toContain('default:auth/login')
    })

    it('includeChangeSpecs false allows reinjection through include patterns', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
      })
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        includeChangeSpecs: false,
        config: {
          contextIncludeSpecs: ['default:auth/login'],
        },
      })

      const loginEntry = result.specs.find((spec) => spec.specId === 'default:auth/login')
      expect(loginEntry?.source).toBe('includePattern')
    })

    it('includeChangeSpecs false allows reinjection through dependsOn traversal', async () => {
      const startSpec = new Spec('default', SpecPath.parse('auth/start'), ['spec.md'])
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const startContent = '# Start\n'
      const loginContent = '# Login\n'
      const startMetadata = freshMetadata(startContent, {
        dependsOn: ['default:auth/login'],
      })
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const specRepo = makeSpecRepo([startSpec, loginSpec], {
        'auth/start/.specd-metadata.yaml': startMetadata,
        'auth/start/spec.md': startContent,
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
      })
      const change = makeChange('my-change', { specIds: ['default:auth/start'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        includeChangeSpecs: false,
        followDeps: true,
        config: noOp,
      })

      const loginEntry = result.specs.find((spec) => spec.specId === 'default:auth/login')
      expect(loginEntry?.source).toBe('dependsOnTraversal')
    })

    it('specDependsOn value is seeded even without pattern matches', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const loginContent = '# Login\n'
      const sharedContent = '# Shared\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const sharedMetadata = freshMetadata(sharedContent, { description: 'Shared auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, sharedSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec.md': sharedContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      expect(listSpecIds(result)).toEqual(['default:auth/login', 'default:auth/shared'])
      expect(result.specs[1]?.source).toBe('specDependsOn')
    })

    it('dependsOn traversal adds specs not matched by include patterns', async () => {
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])

      const loginContent = '# Auth Login\n'
      const jwtContent = '# Auth JWT\n'
      const loginMetadata = freshMetadata(loginContent, { dependsOn: ['auth/jwt'] })
      const jwtMetadata = freshMetadata(jwtContent, { description: 'JWT authentication spec.' })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/spec.md': jwtContent,
      })

      // specIds: ['default:auth/login'] — auth/login's dependsOn seeds the traversal
      const change = makeChange('my-change', {
        specIds: ['default:auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp, // no include patterns
        followDeps: true,
      })

      // auth/jwt should appear via dependsOn from auth/login
      expect(specsContain(result, 'auth/jwt')).toBe(true)
      expect(result.warnings.filter((w) => w.type === 'cycle')).toHaveLength(0)
    })

    it('dependsOn specs are NOT removed by exclude rules', async () => {
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])

      const loginContent = '# Auth Login\n'
      const jwtContent = '# Auth JWT\n'
      const loginMetadata = freshMetadata(loginContent, { dependsOn: ['auth/jwt'] })
      const jwtMetadata = freshMetadata(jwtContent)

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default:auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: ['default:auth/*'], // exclude all auth — but dependsOn specs are immune
        },
        followDeps: true,
      })

      expect(specsContain(result, 'auth/jwt')).toBe(true)
    })

    it('spec appears only once even if seeded, matched, and discovered again later', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const loginContent = '# Login\n'
      const sharedContent = '# Shared\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        dependsOn: ['auth/shared'],
      })
      const sharedMetadata = freshMetadata(sharedContent, { description: 'Shared auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, sharedSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec.md': sharedContent,
      })
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/login', 'default:auth/*'],
        },
        followDeps: true,
      })

      expect(specIdCount(result, 'auth/login')).toBe(1)
      expect(specIdCount(result, 'auth/shared')).toBe(1)
      expect(listSpecIds(result)).toEqual(['default:auth/login', 'default:auth/shared'])
    })
  })

  describe('Requirement: Cycle detection during dependsOn traversal', () => {
    it('breaks cycle quietly and includes both specs', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])

      const loginContent = '# Login\n'
      const jwtContent = '# JWT\n'
      // auth/login → auth/jwt → auth/login (cycle)
      const loginMetadata = freshMetadata(loginContent, { dependsOn: ['auth/jwt'] })
      const jwtMetadata = freshMetadata(jwtContent, { dependsOn: ['auth/login'] })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default:auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
        followDeps: true,
      })

      // No infinite loop — we got a result
      expect(result).toBeDefined()
      const cycleWarnings = result.warnings.filter((w) => w.type === 'cycle')
      expect(cycleWarnings).toHaveLength(0)
      expect(listSpecIds(result)).toContain('default:auth/login')
      expect(listSpecIds(result)).toContain('default:auth/jwt')
    })
  })

  describe('Requirement: Staleness detection and content fallback', () => {
    it('emits staleness warning when contentHash does not match current file', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginContent = '# Login\n'
      const jwtContent = '# JWT\n'
      const loginMetadata = freshMetadata(loginContent, { dependsOn: ['auth/jwt'] })
      // Deliberately wrong hash → stale metadata
      const staleMetadata = JSON.stringify({
        title: 'JWT',
        description: 'Old JWT spec.',
        contentHashes: { 'spec.md': 'sha256:deadbeef' },
      })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/.specd-metadata.yaml': staleMetadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default:auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { ...noOp, contextMode: 'full' },
        followDeps: true,
        sections: ['rules'],
      })

      const stalenessWarnings = result.warnings.filter((w) => w.type === 'stale-metadata')
      expect(stalenessWarnings.length).toBeGreaterThan(0)
      expect(stalenessWarnings[0]?.path).toBe('default:auth/jwt')
    })

    it('emits no staleness warning when all contentHashes match', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginContent = '# Login\n'
      const jwtContent = '# JWT\n'
      const loginMetadata = freshMetadata(loginContent, { dependsOn: ['auth/jwt'] })
      const metadata = freshMetadata(jwtContent, { description: 'JWT auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/.specd-metadata.yaml': metadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default:auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
        followDeps: true,
      })

      const stalenessWarnings = result.warnings.filter((w) => w.type === 'stale-metadata')
      expect(stalenessWarnings).toHaveLength(0)
    })
  })

  describe('Requirement: Step availability', () => {
    it('returns stepAvailable: false and blockingArtifacts when required artifact not complete', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change', {
        // tasks artifact is NOT set → effectiveStatus = 'missing'
        artifacts: [],
      })
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'implementing',

        config: noOp,
      })

      expect(result.stepAvailable).toBe(false)
      expect(result.blockingArtifacts).toContain('tasks')
    })

    it('returns stepAvailable: true when all required artifacts are complete', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const tasksArtifact = new ChangeArtifact({
        type: 'tasks',
        files: new Map([
          [
            'tasks',
            new ArtifactFile({
              key: 'tasks',
              filename: 'tasks.md',
              status: 'complete',
              validatedHash: 'abc123',
            }),
          ],
        ]),
      })
      const change = makeChange('my-change', { artifacts: [tasksArtifact] })
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'implementing',

        config: noOp,
      })

      expect(result.stepAvailable).toBe(true)
      expect(result.blockingArtifacts).toHaveLength(0)
    })

    it('does not throw when step is unavailable', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      await expect(
        sut.execute({
          name: 'my-change',
          step: 'implementing',

          config: noOp,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe('Requirement: Assembled context block', () => {
    it('injects instruction context entry verbatim', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          context: [{ instruction: 'Always prefer editing existing files.' }],
        },
      })

      expect(
        result.projectContext.some(
          (e) =>
            e.source === 'instruction' &&
            e.content.includes('Always prefer editing existing files.'),
        ),
      ).toBe(true)
    })

    it('reads file context entry via FileReader and injects into context block', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()
      const fileReader: FileReader = {
        read: async (path: string) => (path === 'specd-bootstrap.md' ? '# specd Bootstrap' : null),
      }

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          context: [{ file: 'specd-bootstrap.md' }],
        },
      })

      expect(
        result.projectContext.some(
          (e) => e.source === 'file' && e.content.includes('# specd Bootstrap'),
        ),
      ).toBe(true)
    })

    it('emits a warning for a missing file context entry and skips it', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()
      const fileReader: FileReader = {
        read: async () => null,
      }

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          context: [{ file: 'does-not-exist.md' }],
        },
      })

      const fileWarnings = result.warnings.filter((w) => w.type === 'missing-file')
      expect(fileWarnings.length).toBeGreaterThan(0)
      expect(fileWarnings[0]?.path).toBe('does-not-exist.md')
    })

    it('does not include artifact instructions in the context block', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec', { instruction: 'Create specifications...' })],
      })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
      })

      expect(resultContains(result, 'Create specifications...')).toBe(false)
    })

    it('does not include instruction hooks in the context block', async () => {
      const workflowStep: WorkflowStep = {
        step: 'archiving',
        requires: [],
        requiresTaskCompletion: [],
        hooks: {
          pre: [
            { id: 'review-delta', type: 'instruction', text: 'Review delta specs' },
            { id: 'run-test', type: 'run', command: 'pnpm test' },
          ],
          post: [],
        },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'archiving',

        config: noOp,
      })

      expect(resultContains(result, 'Review delta specs')).toBe(false)
      expect(resultContains(result, 'pnpm test')).toBe(false)
    })

    it('lists all schema workflow steps with availability annotations', async () => {
      const designStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const implStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change') // tasks artifact not complete
      const schema = makeSchema({ workflow: [designStep, implStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
      })

      const designingEntry = result.availableSteps.find((s) => s.step === 'designing')
      expect(designingEntry).toBeDefined()
      expect(designingEntry!.available).toBe(true)
      const implEntry = result.availableSteps.find((s) => s.step === 'implementing')
      expect(implEntry).toBeDefined()
      expect(implEntry!.available).toBe(false)
      expect(implEntry!.blockingArtifacts).toContain('tasks')
    })

    it('injects spec description from fresh metadata into spec content', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, {
        description: 'Handles user authentication flows.',
      })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change')
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.description).toContain('Handles user authentication flows.')
      expect(result.warnings.filter((w) => w.type === 'stale-metadata')).toHaveLength(0)
    })

    it('falls back to metadataExtraction when metadata is absent', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n\n## Requirements\n\nSome requirements.\n'

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/spec.md': loginContent,
        // no .specd-metadata.yaml
      })

      const parser: ArtifactParser = {
        ...stubParser,
        parse: () => ({
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Requirements',
                children: [{ type: 'paragraph', value: 'Some requirements.' }],
              },
            ],
          },
        }),
        renderSubtree: renderSubtreeRecursive,
      }

      const parsers: ArtifactParserRegistry = new Map([['markdown', parser]])

      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', {
            scope: 'spec',
          }),
        ],
        metadataExtraction: {
          rules: [
            {
              artifact: 'spec',
              extractor: {
                selector: { type: 'section', matches: '^Requirements$' },
                groupBy: 'label',
                extract: 'content',
              },
            },
          ],
        },
      })

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        parsers,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
        sections: ['rules'],
      })

      // Should emit a staleness warning (no metadata) and include content from metadataExtraction
      const stalenessWarnings = result.warnings.filter((w) => w.type === 'stale-metadata')
      expect(stalenessWarnings.length).toBeGreaterThan(0)
      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry?.content).toContain('Some requirements.')
    })

    it('multiple context entries preserve declaration order', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()

      const fileReader: FileReader = {
        read: async (path: string) => {
          if (path === 'AGENTS.md') return 'AGENTS content'
          if (path === 'specd-bootstrap.md') return 'Bootstrap content'
          return null
        },
      }

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          context: [
            { file: 'AGENTS.md' },
            { instruction: 'Inline note.' },
            { file: 'specd-bootstrap.md' },
          ],
        },
      })

      // Project context entries preserve declaration order
      expect(result.projectContext).toHaveLength(3)
      expect(result.projectContext[0]!.source).toBe('file')
      expect(result.projectContext[0]!.content).toContain('AGENTS content')
      expect(result.projectContext[1]!.source).toBe('instruction')
      expect(result.projectContext[1]!.content).toContain('Inline note.')
      expect(result.projectContext[2]!.source).toBe('file')
      expect(result.projectContext[2]!.content).toContain('Bootstrap content')
    })
  })

  describe('Requirement: Missing spec paths emit a warning', () => {
    it('emits a warning and skips non-existent spec paths', async () => {
      const specRepo = makeSpecRepo([]) // empty — no specs
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: ['default:auth/login'], // exact path that doesn't exist
        },
      })

      const missingWarnings = result.warnings.filter((w) => w.type === 'missing-spec')
      expect(missingWarnings.length).toBeGreaterThan(0)
    })
  })

  describe('Requirement: Unknown workspace qualifiers emit a warning', () => {
    it('emits a warning and skips unknown workspace qualifiers in include patterns', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map() })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: ['unknown-workspace:*'],
        },
      })

      const wsWarnings = result.warnings.filter((w) => w.type === 'unknown-workspace')
      expect(wsWarnings.length).toBeGreaterThan(0)
      expect(wsWarnings[0]?.path).toBe('unknown-workspace')
    })
  })

  describe('Requirement: Active workspace from change.workspaces', () => {
    it('uses change.workspaces to determine active workspaces, not specIds prefixes', async () => {
      // The billing workspace is not in change.workspaces even though the
      // change has a specId whose first segment could be misread as a workspace.
      const billingSpec = new Spec('billing', SpecPath.parse('payments'), ['spec.md'])
      const billingRepo = makeSpecRepo([billingSpec])
      const defaultRepo = makeSpecRepo([])

      // specId has no colon, so workspace defaults to 'default' — not 'billing'
      const change = new Change({
        name: 'my-change',
        createdAt: new Date(),
        specIds: ['billing/payments'], // first segment is 'billing', but workspace is 'default' (no colon)
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['billing/payments'],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
          {
            type: 'transitioned',
            from: 'drafting',
            to: 'designing',
            at: new Date(),
            by: testActor,
          },
        ],
      })

      const schema = makeSchema()
      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([
          ['default', defaultRepo],
          ['billing', billingRepo],
        ]),
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: [],
          workspaces: {
            billing: { contextIncludeSpecs: ['*'] },
          },
        },
      })

      // billing workspace NOT active → billing:payments must NOT appear in output
      expect(specsContain(result, 'billing:payments')).toBe(false)
    })
  })

  describe('Requirement: metadataExtraction fallback with glob output pattern', () => {
    it('resolves glob-style output to the base filename for specRepo.artifact', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n\n## Requirements\n\nSome requirements.\n'

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/spec.md': loginContent,
        // no .specd-metadata.yaml → forces fallback
      })

      const parser: ArtifactParser = {
        ...stubParser,
        parse: () => ({
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Requirements',
                children: [{ type: 'paragraph', value: 'Some requirements.' }],
              },
            ],
          },
        }),
        renderSubtree: renderSubtreeRecursive,
      }

      const parsers: ArtifactParserRegistry = new Map([['markdown', parser]])

      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', {
            // Glob-style output like schema-std uses
            output: 'specs/**/spec.md',
            scope: 'spec',
          }),
        ],
        metadataExtraction: {
          rules: [
            {
              artifact: 'spec',
              extractor: {
                selector: { type: 'section', matches: '^Requirements$' },
                groupBy: 'label',
                extract: 'content',
              },
            },
          ],
        },
      })

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        parsers,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      // The spec content should be present even though output has glob pattern
      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('Some requirements.')
    })
  })

  describe('Requirement: sections filter', () => {
    const specContent = '# Login\n'
    const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])

    function metadataWithAllSections(): string {
      return freshMetadata(specContent, {
        description: 'Auth login spec.',
        rules: [{ requirement: 'Auth', rules: ['Must validate tokens'] }],
        constraints: ['Passwords must be hashed'],
        scenarios: [
          {
            requirement: 'Auth',
            name: 'Login works',
            when: ['user logs in'],
            then: ['session created'],
          },
        ],
      })
    }

    it('renders raw artifact content when sections is undefined', async () => {
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadataWithAllSections(),
        'auth/login/spec.md': '# Login\n\nSpec body from artifact.\n',
      })
      const change = makeChange('my-change')
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.description).toContain('Auth login spec.')
      expect(specEntry!.content).toContain('#### spec.md')
      expect(specEntry!.content).toContain('Spec body from artifact.')
      expect(specEntry!.content).not.toContain('Must validate tokens')
    })

    it('renders only rules when sections is ["rules"]', async () => {
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadataWithAllSections(),
        'auth/login/spec.md': specContent,
      })
      const change = makeChange('my-change')
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
        sections: ['rules'],
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('Must validate tokens')
      expect(specEntry!.content).not.toContain('Auth login spec.')
      expect(specEntry!.content).not.toContain('Passwords must be hashed')
      expect(specEntry!.content).not.toContain('Login works')
    })

    it('renders rules and constraints when sections is ["rules", "constraints"]', async () => {
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadataWithAllSections(),
        'auth/login/spec.md': specContent,
      })
      const change = makeChange('my-change')
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
        sections: ['rules', 'constraints'],
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('Must validate tokens')
      expect(specEntry!.content).toContain('Passwords must be hashed')
      expect(specEntry!.content).not.toContain('Auth login spec.')
      expect(specEntry!.content).not.toContain('Login works')
    })

    it('filters fallback metadataExtraction by section when sections is set', async () => {
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/spec.md': specContent,
        // no metadata → forces fallback
      })

      const parser: ArtifactParser = {
        ...stubParser,
        parse: () => ({
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Requirements',
                children: [{ type: 'paragraph', value: 'Some rules.' }],
              },
              {
                type: 'section',
                label: 'Constraints',
                children: [{ type: 'list-item', label: 'Some constraints.' }],
              },
            ],
          },
        }),
        renderSubtree: renderSubtreeRecursive,
      }

      const parsers: ArtifactParserRegistry = new Map([['markdown', parser]])

      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', {
            scope: 'spec',
          }),
        ],
        metadataExtraction: {
          rules: [
            {
              artifact: 'spec',
              extractor: {
                selector: { type: 'section', matches: '^Requirements$' },
                groupBy: 'label',
                extract: 'content',
              },
            },
          ],
          constraints: [
            {
              artifact: 'spec',
              extractor: {
                selector: {
                  type: 'list-item',
                  parent: { type: 'section', matches: '^Constraints$' },
                },
                extract: 'label',
              },
            },
          ],
        },
      })

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        parsers,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
        sections: ['rules'],
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('Some rules.')
      expect(specEntry!.content).not.toContain('Some constraints.')
    })

    it('sections filter does not affect available steps', async () => {
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadataWithAllSections(),
        'auth/login/spec.md': specContent,
      })
      const workflowStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [workflowStep] })
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
        sections: ['constraints'],
      })

      // Available steps are always included regardless of sections filter
      expect(result.availableSteps.some((s) => s.step === 'designing')).toBe(true)
    })
  })

  describe('Requirement: depth limiting', () => {
    it('depth 1 includes direct deps only, not transitive deps', async () => {
      // Chain: A → B → C → D. A is in specIds, so traversal starts from B.
      const specA = new Spec('default', SpecPath.parse('a'), ['spec.md'])
      const specB = new Spec('default', SpecPath.parse('b'), ['spec.md'])
      const specC = new Spec('default', SpecPath.parse('c'), ['spec.md'])
      const specD = new Spec('default', SpecPath.parse('d'), ['spec.md'])

      const contentA = '# A\n'
      const contentB = '# B\n'
      const contentC = '# C\n'
      const contentD = '# D\n'

      const metadataA = freshMetadata(contentA, { dependsOn: ['b'], description: 'Spec A' })
      const metadataB = freshMetadata(contentB, { dependsOn: ['c'], description: 'Spec B' })
      const metadataC = freshMetadata(contentC, { dependsOn: ['d'], description: 'Spec C' })
      const metadataD = freshMetadata(contentD, { description: 'Spec D' })

      const specRepo = makeSpecRepo([specA, specB, specC, specD], {
        'a/.specd-metadata.yaml': metadataA,
        'a/spec.md': contentA,
        'b/.specd-metadata.yaml': metadataB,
        'b/spec.md': contentB,
        'c/.specd-metadata.yaml': metadataC,
        'c/spec.md': contentC,
        'd/.specd-metadata.yaml': metadataD,
        'd/spec.md': contentD,
      })

      const change = makeChange('my-change', {
        specIds: ['default:a'],
      })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
        followDeps: true,
        depth: 1,
      })

      // B is the direct dep seed (depth 0), C is at depth 1 — both appear
      expect(specsContain(result, 'Spec B')).toBe(true)
      expect(specsContain(result, 'Spec C')).toBe(true)
      // D is at depth 2 — should NOT appear
      expect(specsContain(result, 'Spec D')).toBe(false)
      // A stays present because change.specIds are always seeded into the result
      expect(specsContain(result, 'Spec A')).toBe(true)
    })

    it('unlimited depth includes all transitive deps', async () => {
      const specA = new Spec('default', SpecPath.parse('a'), ['spec.md'])
      const specB = new Spec('default', SpecPath.parse('b'), ['spec.md'])
      const specC = new Spec('default', SpecPath.parse('c'), ['spec.md'])

      const contentA = '# A\n'
      const contentB = '# B\n'
      const contentC = '# C\n'

      const metadataA = freshMetadata(contentA, { dependsOn: ['b'], description: 'Spec A' })
      const metadataB = freshMetadata(contentB, { dependsOn: ['c'], description: 'Spec B' })
      const metadataC = freshMetadata(contentC, { description: 'Spec C' })

      const specRepo = makeSpecRepo([specA, specB, specC], {
        'a/.specd-metadata.yaml': metadataA,
        'a/spec.md': contentA,
        'b/.specd-metadata.yaml': metadataB,
        'b/spec.md': contentB,
        'c/.specd-metadata.yaml': metadataC,
        'c/spec.md': contentC,
      })

      const change = makeChange('my-change', {
        specIds: ['default:a'],
      })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
        followDeps: true,
      })

      // B and C are transitive deps of A and should appear
      expect(specsContain(result, 'Spec B')).toBe(true)
      expect(specsContain(result, 'Spec C')).toBe(true)
      // A stays present because change.specIds are always seeded into the result
      expect(specsContain(result, 'Spec A')).toBe(true)
    })

    it('followDeps false skips traversal even with specIds that have dependsOn', async () => {
      const specA = new Spec('default', SpecPath.parse('a'), ['spec.md'])
      const specB = new Spec('default', SpecPath.parse('b'), ['spec.md'])

      const contentA = '# A\n'
      const contentB = '# B\n'

      const metadataA = freshMetadata(contentA, { dependsOn: ['b'], description: 'Spec A' })
      const metadataB = freshMetadata(contentB, { description: 'Spec B' })

      const specRepo = makeSpecRepo([specA, specB], {
        'a/.specd-metadata.yaml': metadataA,
        'a/spec.md': contentA,
        'b/.specd-metadata.yaml': metadataB,
        'b/spec.md': contentB,
      })

      const change = makeChange('my-change', {
        specIds: ['default:a'],
      })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: noOp,
        // followDeps omitted → false by default
      })

      // A is seeded from change.specIds; B still requires followDeps traversal
      expect(specsContain(result, 'Spec A')).toBe(true)
      expect(specsContain(result, 'Spec B')).toBe(false)
    })
  })

  describe('Requirement: Structured result assembly', () => {
    it('preserves change-scoped seed ordering ahead of include matches and traversal discoveries', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const architectureSpec = new Spec('default', SpecPath.parse('_global/architecture'), [
        'spec.md',
      ])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])

      const loginContent = '# Login\n'
      const sharedContent = '# Shared\n'
      const architectureContent = '# Architecture\n'
      const jwtContent = '# JWT\n'

      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        dependsOn: ['auth/shared'],
      })
      const sharedMetadata = freshMetadata(sharedContent, {
        description: 'Shared auth spec.',
        dependsOn: ['auth/jwt'],
      })
      const architectureMetadata = freshMetadata(architectureContent, {
        description: 'Architecture spec.',
      })
      const jwtMetadata = freshMetadata(jwtContent, { description: 'JWT auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, sharedSpec, architectureSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec.md': sharedContent,
        '_global/architecture/.specd-metadata.yaml': architectureMetadata,
        '_global/architecture/spec.md': architectureContent,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:_global/*'],
        },
        followDeps: true,
      })

      expect(listSpecIds(result)).toEqual([
        'default:auth/login',
        'default:auth/shared',
        'default:_global/architecture',
        'default:auth/jwt',
      ])
      expect(result.specs[0]?.source).toBe('specIds')
      expect(result.specs[1]?.source).toBe('specDependsOn')
      expect(result.specs[2]?.source).toBe('includePattern')
      expect(result.specs[3]?.source).toBe('dependsOnTraversal')
    })
  })

  describe('Requirement: Step availability — skipped artifacts', () => {
    it('treats a skipped optional artifact as satisfying the step requires', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['design'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }
      const designArtifact = new ChangeArtifact({
        type: 'design',
        optional: true,
        files: new Map([
          [
            'design',
            new ArtifactFile({
              key: 'design',
              filename: 'design.md',
              status: 'skipped',
              validatedHash: '__skipped__',
            }),
          ],
        ]),
      })
      const change = makeChange('my-change', { artifacts: [designArtifact] })
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'implementing',

        config: noOp,
      })

      expect(result.stepAvailable).toBe(true)
      expect(result.blockingArtifacts).toHaveLength(0)
    })
  })

  describe('context display modes', () => {
    it('summary mode is default when contextMode is omitted', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const loginContent = '# Login\n'
      const otherContent = '# Other\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const otherMetadata = freshMetadata(otherContent, { description: 'Other auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, otherSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/other/.specd-metadata.yaml': otherMetadata,
        'auth/other/spec.md': otherContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { contextIncludeSpecs: ['default:auth/*'] },
      })

      expect(result.specs.every((entry) => entry.mode === 'summary')).toBe(true)
    })

    it('list mode emits list-only entries', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'list',
          contextIncludeSpecs: ['default:auth/login'],
        },
      })

      expect(result.specs[0]?.mode).toBe('list')
      expect(result.specs[0]?.title).toBeUndefined()
      expect(result.specs[0]?.description).toBeUndefined()
      expect(result.specs[0]?.content).toBeUndefined()
    })

    it('full mode renders all collected entries as full', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const loginContent = '# Login\n'
      const otherContent = '# Other\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const otherMetadata = freshMetadata(otherContent, { description: 'Other auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, otherSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/other/.specd-metadata.yaml': otherMetadata,
        'auth/other/spec.md': otherContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'full',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      expect(result.specs.every((entry) => entry.mode === 'full')).toBe(true)
      expect(result.specs.every((entry) => entry.content !== undefined)).toBe(true)
    })

    it('hybrid mode renders direct change specs in full and others as summary', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const loginContent = '# Login\n'
      const otherContent = '# Other\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const otherMetadata = freshMetadata(otherContent, { description: 'Other auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, otherSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/other/.specd-metadata.yaml': otherMetadata,
        'auth/other/spec.md': otherContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'hybrid',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const loginEntry = result.specs.find((entry) => entry.specId === 'default:auth/login')
      const otherEntry = result.specs.find((entry) => entry.specId === 'default:auth/other')
      expect(loginEntry?.mode).toBe('full')
      expect(otherEntry?.mode).toBe('summary')
    })

    it('section flags do not change list and summary entry shapes', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        rules: [{ requirement: 'Login', rules: ['Must validate tokens'] }],
      })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const summaryResult = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'summary',
          contextIncludeSpecs: ['default:auth/login'],
        },
        sections: ['rules'],
      })
      const listResult = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'list',
          contextIncludeSpecs: ['default:auth/login'],
        },
        sections: ['rules'],
      })

      expect(summaryResult.specs[0]?.mode).toBe('summary')
      expect(summaryResult.specs[0]?.content).toBeUndefined()
      expect(listResult.specs[0]?.mode).toBe('list')
      expect(listResult.specs[0]?.content).toBeUndefined()
    })
  })

  describe('source tracking', () => {
    it('specIds source assigned correctly', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/login'],
        },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.source).toBe('specIds')
    })

    it('includePattern source assigned correctly', async () => {
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const otherContent = '# Other\n'
      const metadata = freshMetadata(otherContent, { description: 'Other auth spec.' })

      const specRepo = makeSpecRepo([otherSpec], {
        'auth/other/.specd-metadata.yaml': metadata,
        'auth/other/spec.md': otherContent,
      })

      // auth/other is NOT in specIds — only matched by include pattern
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const otherEntry = result.specs.find((s) => s.specId === 'default:auth/other')
      expect(otherEntry).toBeDefined()
      expect(otherEntry!.source).toBe('includePattern')
    })

    it('source priority — specDependsOn wins over dependsOnTraversal', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const loginContent = '# Login\n'
      const sharedContent = '# Shared Auth\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        dependsOn: ['auth/shared'],
      })
      const sharedMetadata = freshMetadata(sharedContent, { description: 'Shared auth utilities.' })

      const specRepo = makeSpecRepo([loginSpec, sharedSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec.md': sharedContent,
      })

      // auth/shared is both a specDependsOn target AND would be discovered via dependsOn traversal
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/*'],
        },
        followDeps: true,
      })

      const sharedEntry = result.specs.find((s) => s.specId === 'default:auth/shared')
      expect(sharedEntry).toBeDefined()
      expect(sharedEntry!.source).toBe('specDependsOn')
    })

    it('source priority — specIds wins over includePattern', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      // auth/login is BOTH in specIds AND matched by include pattern
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.source).toBe('specIds')
    })
  })

  describe('Requirement: Materialized delta view via PreviewSpec', () => {
    it('uses merged content from PreviewSpec for specs in specIds', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const mergedContent = '# Login (merged)\n\nNew merged content.'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const previewSpec: PreviewSpec = {
        execute: vi.fn().mockResolvedValue({
          specId: 'default:auth/login',
          changeName: 'my-change',
          files: [{ filename: 'spec.md', base: loginContent, merged: mergedContent }],
          warnings: [],
        }),
      } as unknown as PreviewSpec

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('#### spec.md')
      expect(specEntry!.content).toContain(mergedContent)
      expect(result.warnings.filter((w) => w.type === 'preview')).toHaveLength(0)
    })

    it('falls back to metadata when PreviewSpec returns empty files', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, {
        description: 'Login fallback spec.',
      })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const previewSpec: PreviewSpec = {
        execute: vi.fn().mockResolvedValue({
          specId: 'default:auth/login',
          changeName: 'my-change',
          files: [],
          warnings: [],
        }),
      } as unknown as PreviewSpec

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('#### spec.md')
      expect(specEntry!.content).toContain(loginContent)
    })

    it('falls back with warning when PreviewSpec throws', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, {
        description: 'Login throw-fallback spec.',
      })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const previewSpec: PreviewSpec = {
        execute: vi.fn().mockRejectedValue(new Error('preview exploded')),
      } as unknown as PreviewSpec

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { contextMode: 'full', contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.content).toContain('#### spec.md')
      expect(specEntry!.content).toContain(loginContent)
      // Preview warning emitted
      const previewWarnings = result.warnings.filter((w) => w.type === 'preview')
      expect(previewWarnings).toHaveLength(1)
      expect(previewWarnings[0]!.path).toBe('default:auth/login')
    })

    it('does not call PreviewSpec for non-specIds specs', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const loginContent = '# Login\n'
      const otherContent = '# Other\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const otherMetadata = freshMetadata(otherContent, { description: 'Other spec.' })

      const specRepo = makeSpecRepo([loginSpec, otherSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/other/.specd-metadata.yaml': otherMetadata,
        'auth/other/spec.md': otherContent,
      })

      const executeMock = vi.fn().mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'my-change',
        files: [],
        warnings: [],
      })
      const previewSpec: PreviewSpec = {
        execute: executeMock,
      } as unknown as PreviewSpec

      // auth/other is only in the include pattern, NOT in specIds
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })

      await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'full',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      // PreviewSpec should only have been called for auth/login (specIds), not auth/other
      const callArgs = executeMock.mock.calls.map((c) => (c[0] as { specId: string }).specId)
      expect(callArgs).toContain('default:auth/login')
      expect(callArgs).not.toContain('default:auth/other')
    })

    it('does not call PreviewSpec for summary-mode specs', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/other'), ['spec.md'])
      const loginContent = '# Login\n'
      const otherContent = '# Other\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const otherMetadata = freshMetadata(otherContent, { description: 'Other spec.' })

      const specRepo = makeSpecRepo([loginSpec, otherSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/other/.specd-metadata.yaml': otherMetadata,
        'auth/other/spec.md': otherContent,
      })

      const executeMock = vi.fn().mockResolvedValue({
        specId: 'default:auth/login',
        changeName: 'my-change',
        files: [],
        warnings: [],
      })
      const previewSpec: PreviewSpec = {
        execute: executeMock,
      } as unknown as PreviewSpec

      // auth/other is only in include pattern → hybrid mode keeps it as summary → no preview call
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })

      await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'hybrid',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      // PreviewSpec must not be called for auth/other (it is summary mode)
      const callArgs = executeMock.mock.calls.map((c) => (c[0] as { specId: string }).specId)
      expect(callArgs).not.toContain('default:auth/other')
    })

    it('renders all spec-scoped files in stable order when sections is undefined', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), [
        'spec.md',
        'verify.md',
        'examples.md',
      ])
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/spec.md': '# Login\n',
        'auth/login/examples.md': 'Example content.\n',
        'auth/login/verify.md': 'Verify content.\n',
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('verify', { scope: 'spec', output: 'verify.md' }),
          makeArtifactType('spec', { scope: 'spec', output: 'spec.md' }),
          makeArtifactType('examples', { scope: 'spec', output: 'examples.md' }),
        ],
      })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })
      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      const content = result.specs.find((s) => s.specId === 'default:auth/login')?.content ?? ''
      expect(content).toContain('#### spec.md')
      expect(content).toContain('#### examples.md')
      expect(content).toContain('#### verify.md')
      expect(content.indexOf('#### spec.md')).toBeLessThan(content.indexOf('#### examples.md'))
      expect(content.indexOf('#### examples.md')).toBeLessThan(content.indexOf('#### verify.md'))
    })

    it('renders files alphabetically when spec.md does not exist', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), [
        'verify.md',
        'examples.md',
      ])
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/examples.md': 'Example content.\n',
        'auth/login/verify.md': 'Verify content.\n',
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('verify', { scope: 'spec', output: 'verify.md' }),
          makeArtifactType('examples', { scope: 'spec', output: 'examples.md' }),
        ],
      })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })
      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      const content = result.specs.find((s) => s.specId === 'default:auth/login')?.content ?? ''
      expect(content).toContain('#### examples.md')
      expect(content).toContain('#### verify.md')
      expect(content.indexOf('#### examples.md')).toBeLessThan(content.indexOf('#### verify.md'))
    })

    it('uses merged preview files while keeping unchanged base files in display order', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), [
        'spec.md',
        'verify.md',
        'examples.md',
      ])
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/spec.md': '# Login\n',
        'auth/login/examples.md': 'Base examples.\n',
        'auth/login/verify.md': 'Base verify.\n',
      })

      const previewSpec: PreviewSpec = {
        execute: vi.fn().mockResolvedValue({
          specId: 'default:auth/login',
          changeName: 'my-change',
          files: [
            { filename: 'verify.md', base: 'Base verify.\n', merged: 'Merged verify.\n' },
            { filename: 'spec.md', base: '# Login\n', merged: '# Login merged\n' },
          ],
          warnings: [],
        }),
      } as unknown as PreviewSpec

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('verify', { scope: 'spec', output: 'verify.md' }),
          makeArtifactType('spec', { scope: 'spec', output: 'spec.md' }),
          makeArtifactType('examples', { scope: 'spec', output: 'examples.md' }),
        ],
      })

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
      })
      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      const content = result.specs.find((s) => s.specId === 'default:auth/login')?.content ?? ''
      expect(content).toContain('# Login merged')
      expect(content).toContain('Base examples.')
      expect(content).toContain('Merged verify.')
      expect(content.indexOf('#### spec.md')).toBeLessThan(content.indexOf('#### examples.md'))
      expect(content.indexOf('#### examples.md')).toBeLessThan(content.indexOf('#### verify.md'))
    })

    it('derives section-filtered content from merged preview artifacts', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md', 'verify.md'])
      const metadata = freshMetadata('# Login\n', { description: 'Base login spec.' })
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': '# Login\n',
        'auth/login/verify.md': 'Scenario: Base scenario',
      })

      const parser: ArtifactParser = {
        ...stubParser,
        parse: (content: string) => ({
          root: {
            type: 'document',
            children: content.includes('Scenario:')
              ? [
                  {
                    type: 'section',
                    label: 'Requirement: Auth',
                    children: [
                      {
                        type: 'section',
                        label: content.includes('Preview scenario')
                          ? 'Scenario: Preview scenario'
                          : 'Scenario: Base scenario',
                        children: [
                          { type: 'list-item', label: '**WHEN** user logs in' },
                          { type: 'list-item', label: '**THEN** session created' },
                        ],
                      },
                    ],
                  },
                ]
              : [],
          },
        }),
        renderSubtree: renderSubtreeRecursive,
      }

      const previewSpec: PreviewSpec = {
        execute: vi.fn().mockResolvedValue({
          specId: 'default:auth/login',
          changeName: 'my-change',
          files: [
            {
              filename: 'verify.md',
              base: 'Scenario: Base scenario',
              merged: 'Scenario: Preview scenario',
            },
          ],
          warnings: [],
        }),
      } as unknown as PreviewSpec

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', { scope: 'spec', output: 'spec.md' }),
          makeArtifactType('verify', { scope: 'spec', output: 'verify.md' }),
        ],
        metadataExtraction: {
          scenarios: [
            {
              artifact: 'verify',
              extractor: {
                selector: {
                  type: 'section',
                  matches: '^Scenario:',
                  parent: { type: 'section', matches: '^Requirement:' },
                },
                fields: {
                  requirement: { from: 'parentLabel', strip: '^Requirement:\\s*' },
                  name: { from: 'label', strip: '^Scenario:\\s*' },
                  when: {
                    childSelector: { type: 'list-item', contains: 'WHEN' },
                    capture: '\\*\\*WHEN\\*\\*\\s*(.+)',
                  },
                  then: {
                    childSelector: { type: 'list-item', contains: 'THEN' },
                    capture: '\\*\\*THEN\\*\\*\\s*(.+)',
                  },
                },
              },
            },
          ],
        },
      })

      const { sut } = makeSut({
        change,
        schema,
        specRepos: new Map([['default', specRepo]]),
        previewSpec,
        parsers: new Map([['markdown', parser]]),
      })
      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        sections: ['scenarios'],
      })

      const content = result.specs.find((s) => s.specId === 'default:auth/login')?.content ?? ''
      expect(content).toContain('Preview scenario')
      expect(content).not.toContain('#### verify.md')
    })
  })

  describe('Requirement: Context fingerprint', () => {
    it('returns unchanged when the provided fingerprint matches the assembled output', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const changed = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      const unchanged = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        fingerprint: changed.contextFingerprint,
      })

      expect(unchanged.status).toBe('unchanged')
      expect(unchanged.projectContext).toEqual([])
      expect(unchanged.specs).toEqual([])
      expect(unchanged.availableSteps).toEqual(changed.availableSteps)
    })

    it('changes when specDependsOn changes the emitted specs', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const loginContent = '# Login\n'
      const sharedContent = '# Shared\n'
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const sharedMetadata = freshMetadata(sharedContent, { description: 'Shared auth spec.' })

      const specRepo = makeSpecRepo([loginSpec, sharedSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/shared/.specd-metadata.yaml': sharedMetadata,
        'auth/shared/spec.md': sharedContent,
      })

      const schema = makeSchema()
      const baseChange = makeChange('my-change', { specIds: ['default:auth/login'] })
      const seededChange = makeChange('my-change', { specIds: ['default:auth/login'] })
      seededChange.setSpecDependsOn('default:auth/login', ['default:auth/shared'])

      const base = makeSut({
        change: baseChange,
        schema,
        specRepos: new Map([['default', specRepo]]),
      })
      const seeded = makeSut({
        change: seededChange,
        schema,
        specRepos: new Map([['default', specRepo]]),
      })

      const baseResult = await base.sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })
      const seededResult = await seeded.sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })

      expect(baseResult.contextFingerprint).not.toBe(seededResult.contextFingerprint)
    })

    it('changes when warnings change', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const fresh = freshMetadata(loginContent, { description: 'Login spec.' })
      const stale = JSON.stringify({
        title: 'Login',
        description: 'Login spec.',
        contentHashes: { 'spec.md': 'sha256:deadbeef' },
      })

      const freshRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': fresh,
        'auth/login/spec.md': loginContent,
      })
      const staleRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': stale,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const freshSut = makeSut({ change, schema, specRepos: new Map([['default', freshRepo]]) })
      const staleSut = makeSut({ change, schema, specRepos: new Map([['default', staleRepo]]) })

      const freshResult = await freshSut.sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        sections: ['rules'],
      })
      const staleResult = await staleSut.sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        sections: ['rules'],
      })

      expect(freshResult.warnings).toHaveLength(0)
      expect(staleResult.warnings.length).toBeGreaterThan(0)
      expect(freshResult.contextFingerprint).not.toBe(staleResult.contextFingerprint)
    })

    it('changes when step availability changes', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const metadata = freshMetadata(loginContent, { description: 'Login spec.' })
      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': metadata,
        'auth/login/spec.md': loginContent,
      })

      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      }

      const incompleteChange = makeChange('my-change', { specIds: ['default:auth/login'] })
      const completeTasks = new ChangeArtifact({
        type: 'tasks',
        files: new Map([
          [
            'tasks',
            new ArtifactFile({
              key: 'tasks',
              filename: 'tasks.md',
              status: 'complete',
              validatedHash: 'hash',
            }),
          ],
        ]),
      })
      const completeChange = makeChange('my-change', {
        specIds: ['default:auth/login'],
        artifacts: [completeTasks],
      })
      const schema = makeSchema({ workflow: [workflowStep] })

      const incomplete = makeSut({
        change: incompleteChange,
        schema,
        specRepos: new Map([['default', specRepo]]),
      })
      const complete = makeSut({
        change: completeChange,
        schema,
        specRepos: new Map([['default', specRepo]]),
      })

      const incompleteResult = await incomplete.sut.execute({
        name: 'my-change',
        step: 'implementing',
        config: noOp,
      })
      const completeResult = await complete.sut.execute({
        name: 'my-change',
        step: 'implementing',
        config: noOp,
      })

      expect(incompleteResult.stepAvailable).toBe(false)
      expect(completeResult.stepAvailable).toBe(true)
      expect(incompleteResult.contextFingerprint).not.toBe(completeResult.contextFingerprint)
    })

    it('changes when result-shaping flags change the emitted context', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginContent = '# Login\n'
      const jwtContent = '# JWT\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        dependsOn: ['auth/jwt'],
        rules: [{ requirement: 'Auth', rules: ['Must authenticate users'] }],
        constraints: ['No anonymous access'],
      })
      const jwtMetadata = freshMetadata(jwtContent, { description: 'JWT spec.' })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const baseResult = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
      })
      const followDepsResult = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        followDeps: true,
      })
      const rulesOnlyResult = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: noOp,
        sections: ['rules'],
      })

      expect(baseResult.contextFingerprint).not.toBe(followDepsResult.contextFingerprint)
      expect(baseResult.contextFingerprint).not.toBe(rulesOnlyResult.contextFingerprint)
    })

    it('keeps the same fingerprint when section flags are ignored in summary/list modes', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const loginContent = '# Login\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        rules: [{ requirement: 'Auth', rules: ['Must authenticate users'] }],
      })

      const specRepo = makeSpecRepo([loginSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()
      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const summaryBase = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { ...noOp, contextMode: 'summary' },
      })
      const summaryWithSections = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { ...noOp, contextMode: 'summary' },
        sections: ['rules', 'constraints'],
      })
      expect(summaryBase.contextFingerprint).toBe(summaryWithSections.contextFingerprint)

      const listBase = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { ...noOp, contextMode: 'list' },
      })
      const listWithSections = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: { ...noOp, contextMode: 'list' },
        sections: ['rules', 'constraints'],
      })
      expect(listBase.contextFingerprint).toBe(listWithSections.contextFingerprint)
    })
  })
})
