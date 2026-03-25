import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  CompileContext,
  type CompileContextConfig,
  type CompileContextResult,
} from '../../../src/application/use-cases/compile-context.js'
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
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import {
  type ArtifactParserRegistry,
  type ArtifactParser,
} from '../../../src/application/ports/artifact-parser.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
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
  return makeSchemaBase({ ...opts, name: '@specd/schema-std' })
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
    rules?: Array<{ requirement: string; rules: string[] }>
    constraints?: string[]
    scenarios?: Array<{ requirement: string; name: string; when?: string[]; then?: string[] }>
  } = {},
): string {
  const hash = sha256Hex(specContent)
  const obj: Record<string, unknown> = {
    title: 'Test',
    description: opts.description ?? 'Test spec description.',
    contentHashes: { 'spec.md': hash },
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
  apply: (ast) => ast,
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
      s.title.includes(text) ||
      s.description.includes(text) ||
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

function makeSut(opts: {
  change?: Change
  schema?: Schema
  specRepos?: Map<string, SpecRepository>
  fileReader?: FileReader
  parsers?: ArtifactParserRegistry
}): {
  sut: CompileContext
  changeRepo: ChangeRepository
  schemaProvider: SchemaProvider
} {
  const { change, schema, specRepos, fileReader, parsers } = opts
  const changeRepo = makeStubChangeRepo(change)
  const schemaProvider = makeStubSchemaProvider(schema ?? null)

  const sut = new CompileContext(
    changeRepo,
    specRepos ?? new Map(),
    schemaProvider,
    fileReader ?? makeStubFileReader(),
    parsers ?? (new Map() as ArtifactParserRegistry),
    makeContentHasher(),
  )

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

    it('spec appears only once even if matched by multiple include patterns', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([loginSpec])
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',

        config: {
          contextIncludeSpecs: ['default:auth/login', 'default:auth/*'],
        },
      })

      // Spec should appear exactly once in the specs array
      expect(specIdCount(result, 'auth/login')).toBe(1)
    })
  })

  describe('Requirement: Cycle detection during dependsOn traversal', () => {
    it('breaks cycle, emits a warning, and includes both specs', async () => {
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
      // Cycle warning emitted
      const cycleWarnings = result.warnings.filter((w) => w.type === 'cycle')
      expect(cycleWarnings.length).toBeGreaterThan(0)
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
      })

      // Should emit a staleness warning (no metadata) and include content from metadataExtraction
      const stalenessWarnings = result.warnings.filter((w) => w.type === 'stale-metadata')
      expect(stalenessWarnings.length).toBeGreaterThan(0)
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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

    it('renders all sections when sections is undefined', async () => {
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
      })

      const specEntry = result.specs.find((s) => s.specId.includes('auth/login'))
      expect(specEntry).toBeDefined()
      expect(specEntry!.description).toContain('Auth login spec.')
      expect(specEntry!.content).toContain('Must validate tokens')
      expect(specEntry!.content).toContain('Passwords must be hashed')
      expect(specEntry!.content).toContain('Login works')
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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

        config: { contextIncludeSpecs: ['default:auth/login'] },
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
      // A is a specId, not a dependsOn target — not included via step 5
      expect(specsContain(result, 'Spec A')).toBe(false)
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
      // A is a specId, not a dependsOn target — not included via step 5
      expect(specsContain(result, 'Spec A')).toBe(false)
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

      // Neither A nor B should appear — dependsOn traversal requires followDeps to be included
      expect(specsContain(result, 'Spec A')).toBe(false)
      expect(specsContain(result, 'Spec B')).toBe(false)
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

  describe('tier classification', () => {
    it('lazy mode — specIds specs are tier 1 full', async () => {
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
          contextMode: 'lazy',
          contextIncludeSpecs: ['default:auth/login'],
        },
      })

      const specEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      expect(specEntry).toBeDefined()
      expect(specEntry!.mode).toBe('full')
      expect(specEntry!.source).toBe('specIds')
    })

    it('lazy mode — specDependsOn specs are tier 1 full', async () => {
      const sharedSpec = new Spec('default', SpecPath.parse('auth/shared'), ['spec.md'])
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const sharedContent = '# Shared Auth\n'
      const loginContent = '# Login\n'
      const sharedMetadata = freshMetadata(sharedContent, { description: 'Shared auth utilities.' })
      const loginMetadata = freshMetadata(loginContent, { description: 'Login spec.' })

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
          contextMode: 'lazy',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const sharedEntry = result.specs.find((s) => s.specId === 'default:auth/shared')
      expect(sharedEntry).toBeDefined()
      expect(sharedEntry!.mode).toBe('full')
      expect(sharedEntry!.source).toBe('specDependsOn')
    })

    it('lazy mode — includePattern specs are tier 2 summary', async () => {
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

      // auth/other is NOT in specIds or specDependsOn, only matched by include pattern
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'lazy',
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const otherEntry = result.specs.find((s) => s.specId === 'default:auth/other')
      expect(otherEntry).toBeDefined()
      expect(otherEntry!.mode).toBe('summary')
      expect(otherEntry!.content).toBeUndefined()
    })

    it('full mode — all specs are full', async () => {
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

      for (const specEntry of result.specs) {
        expect(specEntry.mode).toBe('full')
      }
    })

    it('lazy mode — dependsOnTraversal specs are tier 2 summary', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const loginContent = '# Login\n'
      const jwtContent = '# JWT\n'
      const loginMetadata = freshMetadata(loginContent, {
        description: 'Login spec.',
        dependsOn: ['auth/jwt'],
      })
      const jwtMetadata = freshMetadata(jwtContent, { description: 'JWT utilities.' })

      const specRepo = makeSpecRepo([loginSpec, jwtSpec], {
        'auth/login/.specd-metadata.yaml': loginMetadata,
        'auth/login/spec.md': loginContent,
        'auth/jwt/.specd-metadata.yaml': jwtMetadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextMode: 'lazy',
          contextIncludeSpecs: ['default:auth/login'],
        },
        followDeps: true,
      })

      const jwtEntry = result.specs.find((s) => s.specId === 'default:auth/jwt')
      expect(jwtEntry).toBeDefined()
      expect(jwtEntry!.source).toBe('dependsOnTraversal')
      expect(jwtEntry!.mode).toBe('summary')
    })

    it('default contextMode is lazy', async () => {
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

      // contextMode not set — should default to 'lazy'
      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        config: {
          contextIncludeSpecs: ['default:auth/*'],
        },
      })

      const loginEntry = result.specs.find((s) => s.specId === 'default:auth/login')
      const otherEntry = result.specs.find((s) => s.specId === 'default:auth/other')
      expect(loginEntry!.mode).toBe('full') // specIds → tier 1
      expect(otherEntry!.mode).toBe('summary') // includePattern → tier 2
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
})
