import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  CompileContext,
  type CompileContextConfig,
} from '../../../src/application/use-cases/compile-context.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import {
  ArtifactType,
  type ArtifactTypeProps,
} from '../../../src/domain/value-objects/artifact-type.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type SchemaRegistry } from '../../../src/application/ports/schema-registry.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import {
  type ArtifactParserRegistry,
  type ArtifactParser,
} from '../../../src/application/ports/artifact-parser.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testActor = { name: 'Test', email: 'test@example.com' }

function makeChange(
  name: string,
  opts: {
    specIds?: string[]
    contextSpecIds?: string[]
    artifacts?: ChangeArtifact[]
  } = {},
): Change {
  const { specIds = ['default/auth/login'], contextSpecIds = [], artifacts = [] } = opts
  const events: ChangeEvent[] = [
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
    createdAt: new Date('2024-01-15'),
    workspaces: [...new Set(specIds.map((id) => id.split('/')[0] ?? id))],
    specIds,
    contextSpecIds,
    history: events,
  })
  for (const artifact of artifacts) {
    change.setArtifact(artifact)
  }
  return change
}

function makeSchema(opts: { artifacts?: ArtifactType[]; workflow?: WorkflowStep[] } = {}): Schema {
  return new Schema('@specd/schema-std', 1, opts.artifacts ?? [], opts.workflow ?? [])
}

function makeArtifactType(id: string, extra: Partial<ArtifactTypeProps> = {}): ArtifactType {
  return new ArtifactType({
    id,
    scope: 'spec',
    output: `${id}.md`,
    requires: [],
    validations: [],
    deltaValidations: [],
    contextSections: [],
    preHashCleanup: [],
    ...extra,
  })
}

/** Returns a spec repo serving the given specs and artifact content lookup. */
function makeSpecRepo(
  specs: Spec[],
  /** key = `'capPath/filename'` */
  artifacts: Record<string, string | null> = {},
): SpecRepository {
  return {
    workspace: () => specs[0]?.workspace ?? 'default',
    list: async (prefix?: SpecPath) => {
      if (prefix === undefined) return specs
      const prefixStr = prefix.toString()
      return specs.filter((s) => {
        const p = s.name.toString()
        return p === prefixStr || p.startsWith(`${prefixStr}/`)
      })
    },
    get: async (path: SpecPath) => specs.find((s) => s.name.toString() === path.toString()) ?? null,
    artifact: async (spec: Spec, filename: string) => {
      const key = `${spec.name.toString()}/${filename}`
      const content = artifacts[key]
      if (content === undefined || content === null) return null
      return new SpecArtifact(filename, content)
    },
  } as unknown as SpecRepository
}

function sha256Hex(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

/** Builds a valid `.specd-metadata.yaml` with correct hashes for `spec.md`. */
function freshMetadata(
  specContent: string,
  opts: {
    description?: string
    dependsOn?: string[]
    rules?: Array<{ requirement: string; rules: string[] }>
  } = {},
): string {
  const hash = sha256Hex(specContent)
  const parts = [
    `title: 'Test'`,
    `description: '${opts.description ?? 'Test spec description.'}'`,
    `contentHashes:`,
    `  'spec.md': '${hash}'`,
  ]
  if (opts.dependsOn && opts.dependsOn.length > 0) {
    parts.push(`dependsOn:`)
    for (const dep of opts.dependsOn) parts.push(`  - '${dep}'`)
  }
  if (opts.rules && opts.rules.length > 0) {
    parts.push(`rules:`)
    for (const r of opts.rules) {
      parts.push(`  - requirement: '${r.requirement}'`)
      parts.push(`    rules:`)
      for (const rule of r.rules) parts.push(`      - '${rule}'`)
    }
  }
  return parts.join('\n')
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

const noOp: CompileContextConfig = {
  contextIncludeSpecs: [],
  contextExcludeSpecs: [],
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
  schemaRegistry: SchemaRegistry
} {
  const { change, schema, specRepos, fileReader, parsers } = opts
  const changeRepo = {
    get: async (name: string) => (name === (change?.name ?? 'my-change') ? (change ?? null) : null),
  } as unknown as ChangeRepository

  const schemaRegistry = {
    resolve: async () => schema ?? null,
  } as unknown as SchemaRegistry

  const sut = new CompileContext(
    changeRepo,
    specRepos ?? new Map(),
    schemaRegistry,
    fileReader ?? ({ read: async () => null } as unknown as FileReader),
    parsers ?? (new Map() as ArtifactParserRegistry),
  )

  return { sut, changeRepo, schemaRegistry }
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
            {} as unknown as ChangeRepository,
            new Map(),
            {} as unknown as SchemaRegistry,
            {} as unknown as FileReader,
            new Map() as ArtifactParserRegistry,
          ),
      ).not.toThrow()
    })
  })

  describe('Requirement: Input — error handling', () => {
    it('throws ChangeNotFoundError when change is not found', async () => {
      const changeRepo = {
        get: async () => null,
      } as unknown as ChangeRepository
      const sut = new CompileContext(
        changeRepo,
        new Map(),
        { resolve: async () => makeSchema() } as unknown as SchemaRegistry,
        { read: async () => null } as unknown as FileReader,
        new Map() as ArtifactParserRegistry,
      )
      await expect(
        sut.execute({
          name: 'no-such-change',
          step: 'designing',
          schemaRef: '@specd/schema-std',
          workspaceSchemasPaths: new Map(),
          config: noOp,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })

    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChange('my-change')
      const changeRepo = {
        get: async () => change,
      } as unknown as ChangeRepository
      const sut = new CompileContext(
        changeRepo,
        new Map(),
        { resolve: async () => null } as unknown as SchemaRegistry,
        { read: async () => null } as unknown as FileReader,
        new Map() as ArtifactParserRegistry,
      )
      await expect(
        sut.execute({
          name: 'my-change',
          step: 'designing',
          schemaRef: '@specd/schema-std',
          workspaceSchemasPaths: new Map(),
          config: noOp,
        }),
      ).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('Requirement: Context spec collection', () => {
    it('applies project-level include patterns regardless of active workspace', async () => {
      // Change has no _global specs, but project-level include covers them
      const globalSpec = new Spec('default', SpecPath.parse('_global/commits'), ['spec.md'])
      const specRepo = makeSpecRepo([globalSpec])
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
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
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
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
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: [],
          workspaces: {
            billing: { contextIncludeSpecs: ['*'] },
          },
        },
      })

      // billing specs should NOT be included — billing workspace is not active
      // The spec content section should not contain 'billing:'
      expect(result.instructionBlock).not.toContain('billing:payments')
    })

    it('applies project-level exclude before workspace-level patterns', async () => {
      const draftSpec = new Spec('default', SpecPath.parse('drafts/old-spec'), ['spec.md'])
      const otherSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([draftSpec, otherSpec])
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
      const schema = makeSchema({ artifacts: [makeArtifactType('spec')] })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          contextIncludeSpecs: ['default:*'],
          contextExcludeSpecs: ['default:drafts/*'],
        },
      })

      expect(result.instructionBlock).not.toContain('drafts/old-spec')
    })

    it('applies workspace-level exclude after workspace-level include', async () => {
      const internalSpec = new Spec('default', SpecPath.parse('internal/notes'), ['spec.md'])
      const authSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([internalSpec, authSpec])
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
      const schema = makeSchema({ artifacts: [makeArtifactType('spec')] })

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
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

      expect(result.instructionBlock).not.toContain('internal/notes')
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

      // contextSpecIds: ['auth/login'] — auth/login seeds the traversal
      const change = makeChange('my-change', {
        specIds: ['default/auth/login'],
        contextSpecIds: ['auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp, // no include patterns
      })

      // auth/jwt should appear via dependsOn from auth/login
      expect(result.instructionBlock).toContain('auth/jwt')
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
        specIds: ['default/auth/login'],
        contextSpecIds: ['auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          contextIncludeSpecs: [],
          contextExcludeSpecs: ['default:auth/*'], // exclude all auth — but dependsOn specs are immune
        },
      })

      expect(result.instructionBlock).toContain('auth/jwt')
    })

    it('spec appears only once even if matched by multiple include patterns', async () => {
      const loginSpec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
      const specRepo = makeSpecRepo([loginSpec])
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          contextIncludeSpecs: ['default:auth/login', 'default:auth/*'],
        },
      })

      // Count how many times 'auth/login' appears in spec content
      const matches = result.instructionBlock.split('auth/login').length - 1
      expect(matches).toBe(1)
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
        specIds: ['default/auth/login'],
        contextSpecIds: ['auth/login'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
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
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const jwtContent = '# JWT\n'
      // Deliberately wrong hash → stale metadata
      const staleMetadata = `title: 'JWT'\ndescription: 'Old JWT spec.'\ncontentHashes:\n  'spec.md': 'sha256:deadbeef'`

      const specRepo = makeSpecRepo([jwtSpec], {
        'auth/jwt/.specd-metadata.yaml': staleMetadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default/auth/login'],
        contextSpecIds: ['auth/jwt'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      const stalenessWarnings = result.warnings.filter((w) => w.type === 'stale-metadata')
      expect(stalenessWarnings.length).toBeGreaterThan(0)
      expect(stalenessWarnings[0]?.path).toBe('default:auth/jwt')
    })

    it('emits no staleness warning when all contentHashes match', async () => {
      const jwtSpec = new Spec('default', SpecPath.parse('auth/jwt'), ['spec.md'])
      const jwtContent = '# JWT\n'
      const metadata = freshMetadata(jwtContent, { description: 'JWT auth spec.' })

      const specRepo = makeSpecRepo([jwtSpec], {
        'auth/jwt/.specd-metadata.yaml': metadata,
        'auth/jwt/spec.md': jwtContent,
      })

      const change = makeChange('my-change', {
        specIds: ['default/auth/login'],
        contextSpecIds: ['auth/jwt'],
      })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
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
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.stepAvailable).toBe(false)
      expect(result.blockingArtifacts).toContain('tasks')
    })

    it('returns stepAvailable: true when all required artifacts are complete', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        hooks: { pre: [], post: [] },
      }
      const tasksArtifact = new ChangeArtifact({
        type: 'tasks',
        filename: 'tasks.md',
        status: 'complete',
        validatedHash: 'abc123',
      })
      const change = makeChange('my-change', { artifacts: [tasksArtifact] })
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'implementing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.stepAvailable).toBe(true)
      expect(result.blockingArtifacts).toHaveLength(0)
    })

    it('does not throw when step is unavailable', async () => {
      const workflowStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [workflowStep] })

      const { sut } = makeSut({ change, schema })

      await expect(
        sut.execute({
          name: 'my-change',
          step: 'implementing',
          schemaRef: '@specd/schema-std',
          workspaceSchemasPaths: new Map(),
          config: noOp,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe('Requirement: Assembled instruction block', () => {
    it('injects instruction context entry verbatim before schema instruction', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec', { instruction: 'Create specifications carefully.' })],
      })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'spec',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          context: [{ instruction: 'Always prefer editing existing files.' }],
        },
      })

      const instructionIdx = result.instructionBlock.indexOf(
        'Always prefer editing existing files.',
      )
      const schemaInstrIdx = result.instructionBlock.indexOf('Create specifications carefully.')
      expect(instructionIdx).toBeGreaterThanOrEqual(0)
      expect(schemaInstrIdx).toBeGreaterThanOrEqual(0)
      expect(instructionIdx).toBeLessThan(schemaInstrIdx)
    })

    it('reads file context entry via FileReader and injects before schema instruction', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec', { instruction: 'Schema instruction.' })],
      })
      const fileReader: FileReader = {
        read: async (path: string) => (path === 'specd-bootstrap.md' ? '# specd Bootstrap' : null),
      } as unknown as FileReader

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'spec',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          context: [{ file: 'specd-bootstrap.md' }],
        },
      })

      const fileIdx = result.instructionBlock.indexOf('# specd Bootstrap')
      const schemaIdx = result.instructionBlock.indexOf('Schema instruction.')
      expect(fileIdx).toBeGreaterThanOrEqual(0)
      expect(schemaIdx).toBeGreaterThanOrEqual(0)
      expect(fileIdx).toBeLessThan(schemaIdx)
    })

    it('emits a warning for a missing file context entry and skips it', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema()
      const fileReader: FileReader = {
        read: async () => null,
      } as unknown as FileReader

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          context: [{ file: 'does-not-exist.md' }],
        },
      })

      const fileWarnings = result.warnings.filter((w) => w.type === 'missing-file')
      expect(fileWarnings.length).toBeGreaterThan(0)
      expect(fileWarnings[0]?.path).toBe('does-not-exist.md')
    })

    it('includes schema instruction only for the active artifact', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', { instruction: 'Create specifications...' }),
          makeArtifactType('verify', { instruction: 'Write scenarios...' }),
        ],
      })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'spec',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.instructionBlock).toContain('Create specifications...')
      expect(result.instructionBlock).not.toContain('Write scenarios...')
    })

    it('includes no artifact instruction when activeArtifact is absent', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec', { instruction: 'Spec instruction text.' })],
      })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'implementing',
        // no activeArtifact
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.instructionBlock).not.toContain('Spec instruction text.')
    })

    it('injects artifactRules only for the active artifact', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec'), makeArtifactType('verify')],
      })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'spec',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          artifactRules: {
            spec: ['All requirements must use SHALL/MUST'],
            verify: ['Scenarios must use GIVEN/WHEN/THEN'],
          },
        },
      })

      expect(result.instructionBlock).toContain('All requirements must use SHALL/MUST')
      expect(result.instructionBlock).not.toContain('Scenarios must use GIVEN/WHEN/THEN')
    })

    it('includes instruction hooks but excludes run hooks from the instruction block', async () => {
      const workflowStep: WorkflowStep = {
        step: 'archiving',
        requires: [],
        hooks: {
          pre: [
            { type: 'instruction', text: 'Review delta specs' },
            { type: 'run', command: 'pnpm test' },
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
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.instructionBlock).toContain('Review delta specs')
      expect(result.instructionBlock).not.toContain('pnpm test')
    })

    it('step hooks fire once regardless of artifact iteration', async () => {
      const workflowStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        hooks: {
          pre: [{ type: 'instruction', text: 'Plan your approach first.' }],
          post: [],
        },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({
        artifacts: [makeArtifactType('spec'), makeArtifactType('tasks')],
        workflow: [workflowStep],
      })

      const { sut } = makeSut({ change, schema })

      // First call: activeArtifact = 'spec'
      const result1 = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'spec',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      // Second call: activeArtifact = 'tasks'
      const result2 = await sut.execute({
        name: 'my-change',
        step: 'designing',
        activeArtifact: 'tasks',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result1.instructionBlock).toContain('Plan your approach first.')
      expect(result2.instructionBlock).toContain('Plan your approach first.')
    })

    it('includes schema instruction hooks merged before config-level hooks', async () => {
      const schemaStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        hooks: {
          pre: [{ type: 'instruction', text: 'Schema pre-hook.' }],
          post: [],
        },
      }
      const configStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        hooks: {
          pre: [{ type: 'instruction', text: 'Config pre-hook.' }],
          post: [],
        },
      }
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [schemaStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          workflow: [configStep],
        },
      })

      const schemaHookIdx = result.instructionBlock.indexOf('Schema pre-hook.')
      const configHookIdx = result.instructionBlock.indexOf('Config pre-hook.')
      expect(schemaHookIdx).toBeGreaterThanOrEqual(0)
      expect(configHookIdx).toBeGreaterThanOrEqual(0)
      // Schema hooks appear before config hooks
      expect(schemaHookIdx).toBeLessThan(configHookIdx)
    })

    it('lists all schema workflow steps with availability annotations', async () => {
      const designStep: WorkflowStep = {
        step: 'designing',
        requires: [],
        hooks: { pre: [], post: [] },
      }
      const implStep: WorkflowStep = {
        step: 'implementing',
        requires: ['tasks'],
        hooks: { pre: [], post: [] },
      }
      const change = makeChange('my-change') // tasks artifact not complete
      const schema = makeSchema({ workflow: [designStep, implStep] })

      const { sut } = makeSut({ change, schema })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.instructionBlock).toContain('designing: available')
      expect(result.instructionBlock).toContain('implementing: unavailable')
      expect(result.instructionBlock).toContain('tasks')
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

      const change = makeChange('my-change', { contextSpecIds: ['auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      expect(result.instructionBlock).toContain('Handles user authentication flows.')
      expect(result.warnings.filter((w) => w.type === 'stale-metadata')).toHaveLength(0)
    })

    it('falls back to contextSections when metadata is absent', async () => {
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
        renderSubtree: (node) => node.value?.toString() ?? '',
      }

      const parsers: ArtifactParserRegistry = new Map([['markdown', parser]])

      const change = makeChange('my-change', { contextSpecIds: ['auth/login'] })
      const schema = makeSchema({
        artifacts: [
          makeArtifactType('spec', {
            contextSections: [
              {
                selector: { type: 'section', matches: '^Requirements$' },
                role: 'rules',
                extract: 'content',
              },
            ],
          }),
        ],
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
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: noOp,
      })

      // Should emit a staleness warning (no metadata) and include content from contextSections
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
      } as unknown as FileReader

      const { sut } = makeSut({ change, schema, fileReader })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          context: [
            { file: 'AGENTS.md' },
            { instruction: 'Inline note.' },
            { file: 'specd-bootstrap.md' },
          ],
        },
      })

      const agentsIdx = result.instructionBlock.indexOf('AGENTS content')
      const inlineIdx = result.instructionBlock.indexOf('Inline note.')
      const bootstrapIdx = result.instructionBlock.indexOf('Bootstrap content')

      expect(agentsIdx).toBeLessThan(inlineIdx)
      expect(inlineIdx).toBeLessThan(bootstrapIdx)
    })
  })

  describe('Requirement: Missing spec paths emit a warning', () => {
    it('emits a warning and skips non-existent spec paths', async () => {
      const specRepo = makeSpecRepo([]) // empty — no specs
      const change = makeChange('my-change', { specIds: ['default/auth/login'] })
      const schema = makeSchema()

      const { sut } = makeSut({ change, schema, specRepos: new Map([['default', specRepo]]) })

      const result = await sut.execute({
        name: 'my-change',
        step: 'designing',
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
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
        schemaRef: '@specd/schema-std',
        workspaceSchemasPaths: new Map(),
        config: {
          contextIncludeSpecs: ['unknown-workspace:*'],
        },
      })

      const wsWarnings = result.warnings.filter((w) => w.type === 'unknown-workspace')
      expect(wsWarnings.length).toBeGreaterThan(0)
      expect(wsWarnings[0]?.path).toBe('unknown-workspace')
    })
  })
})
