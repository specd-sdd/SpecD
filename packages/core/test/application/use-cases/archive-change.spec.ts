import { describe, it, expect, vi } from 'vitest'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { DeltaApplicationError } from '../../../src/application/ports/artifact-parser.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import { type ArchiveRepository } from '../../../src/application/ports/archive-repository.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
} from '../../../src/application/ports/artifact-parser.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { makeChangeRepository, makeGitAdapter, testActor } from './helpers.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeArtifactType(
  id: string,
  opts: {
    optional?: boolean
    delta?: boolean
    format?: 'markdown' | 'json' | 'yaml' | 'plaintext'
    output?: string
  } = {},
): ArtifactType {
  return new ArtifactType({
    id,
    scope: 'change',
    output: opts.output ?? `${id}.md`,
    requires: [],
    validations: [],
    deltaValidations: [],
    contextSections: [],
    preHashCleanup: [],
    ...(opts.optional !== undefined && { optional: opts.optional }),
    ...(opts.delta !== undefined && { delta: opts.delta }),
    ...(opts.format !== undefined && { format: opts.format }),
  })
}

function makeSchema(artifactTypes: ArtifactType[], workflow: WorkflowStep[] = []): Schema {
  return new Schema('test-schema', 1, artifactTypes, workflow)
}

function makeSchemaRegistry(schema: Schema | null = null) {
  return {
    async resolve(_ref: string, _paths: ReadonlyMap<string, string>): Promise<Schema | null> {
      return schema
    },
    async list(_paths: ReadonlyMap<string, string>) {
      return []
    },
  }
}

function makeArchiveRepository(override?: (change: Change) => ArchivedChange): ArchiveRepository {
  const repo = {
    workspace() {
      return 'default'
    },
    ownership() {
      return 'project' as const
    },
    isExternal() {
      return false
    },
    async archive(change: Change): Promise<ArchivedChange> {
      if (override) return override(change)
      const ts = change.createdAt
      const p = (n: number) => String(n).padStart(2, '0')
      const archivedName = `${ts.getUTCFullYear()}${p(ts.getUTCMonth() + 1)}${p(ts.getUTCDate())}-${p(ts.getUTCHours())}${p(ts.getUTCMinutes())}${p(ts.getUTCSeconds())}-${change.name}`
      return new ArchivedChange({
        name: change.name,
        archivedName,
        workspace: SpecPath.parse(change.workspaces[0] ?? 'default'),
        archivedAt: new Date(),
        artifacts: [],
      })
    },
    async list() {
      return []
    },
    async get() {
      return null
    },
    async reindex() {},
  }
  return repo as unknown as ArchiveRepository
}

function makeHookRunner(exitCode = 0, stderr = '') {
  return {
    async run(_command: string, _variables: unknown): Promise<HookResult> {
      return new HookResult(exitCode, '', stderr)
    },
  }
}

function makeSpecRepository(
  existing: Map<string, string> = new Map(),
): SpecRepository & { saved: Map<string, string> } {
  const saved = new Map<string, string>()
  const repo = {
    saved,
    workspace() {
      return 'default'
    },
    ownership() {
      return 'owned' as const
    },
    isExternal() {
      return false
    },
    async get(name: SpecPath): Promise<Spec | null> {
      return new Spec('default', name, [])
    },
    async list() {
      return []
    },
    async artifact(_spec: Spec, filename: string): Promise<SpecArtifact | null> {
      const content = existing.get(filename)
      if (content === undefined) return null
      return new SpecArtifact(filename, content)
    },
    async save(_spec: Spec, artifact: SpecArtifact): Promise<void> {
      saved.set(artifact.filename, artifact.content)
    },
    async delete() {},
  }
  return repo as unknown as SpecRepository & { saved: Map<string, string> }
}

function makeParser(
  opts: {
    parseDelta?: () => Array<{ op: 'added' | 'modified' | 'removed' }>
    apply?: (ast: unknown) => unknown
  } = {},
): ArtifactParser {
  const stubAst = { root: { type: 'doc' } }
  return {
    fileExtensions: ['.md'],
    parse(_content: string) {
      return stubAst
    },
    apply(ast: unknown, _delta: unknown) {
      if (opts.apply) return opts.apply(ast) as typeof stubAst
      return stubAst
    },
    serialize(_ast: unknown) {
      return 'merged-content'
    },
    renderSubtree(_node: unknown) {
      return ''
    },
    nodeTypes() {
      return []
    },
    outline(_ast: unknown) {
      return []
    },
    deltaInstructions() {
      return ''
    },
    parseDelta(_content: string) {
      return opts.parseDelta?.() ?? []
    },
  }
}

function makeParsers(
  formatParser?: ArtifactParser,
  yamlParser?: ArtifactParser,
): ArtifactParserRegistry {
  const map = new Map<string, ArtifactParser>()
  map.set('markdown', formatParser ?? makeParser())
  map.set('yaml', yamlParser ?? makeParser())
  return map
}

/** Creates a Change in `archivable` state. */
function makeArchivableChange(
  name: string,
  opts: { specIds?: string[]; createdAt?: Date } = {},
): Change {
  const createdAt = opts.createdAt ?? new Date('2024-01-15T12:00:00Z')
  const events: ChangeEvent[] = [
    { type: 'transitioned', from: 'drafting', to: 'designing', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'designing', to: 'ready', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'ready', to: 'implementing', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'implementing', to: 'verifying', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'verifying', to: 'done', at: createdAt, by: testActor },
    { type: 'transitioned', from: 'done', to: 'archivable', at: createdAt, by: testActor },
  ]
  return new Change({
    name,
    createdAt,
    workspaces: ['default'],
    specIds: opts.specIds ?? ['default/auth/oauth'],
    history: events,
  })
}

/** Default hook variables for tests. */
const hookVars = { project: { root: '/repo' } }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArchiveChange', () => {
  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const uc = new ArchiveChange(
        makeChangeRepository([]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(makeSchema([])),
      )
      await expect(
        uc.execute({
          name: 'missing',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given the schema cannot be resolved', () => {
    it('throws SchemaNotFoundError', async () => {
      const change = makeArchivableChange('my-change')
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(null),
      )
      await expect(
        uc.execute({
          name: 'my-change',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('given the change is not in archivable state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = new Change({
        name: 'my-change',
        createdAt: new Date(),
        workspaces: ['default'],
        specIds: [],
        history: [
          {
            type: 'transitioned',
            from: 'drafting',
            to: 'designing',
            at: new Date(),
            by: testActor,
          },
          { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: testActor },
          {
            type: 'transitioned',
            from: 'ready',
            to: 'implementing',
            at: new Date(),
            by: testActor,
          },
          {
            type: 'transitioned',
            from: 'implementing',
            to: 'verifying',
            at: new Date(),
            by: testActor,
          },
          { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: testActor },
          // deliberately stopped at 'done' — not transitioned to 'archivable'
        ],
      })
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(makeSchema([])),
      )
      await expect(
        uc.execute({
          name: 'my-change',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given the change is in archivable state', () => {
    it('proceeds without error', async () => {
      const change = makeArchivableChange('my-change', { specIds: [] })
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(makeSchema([])),
      )
      const result = await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })
      expect(result.archivedChange).toBeDefined()
    })

    it('derives archivedName from change.createdAt', async () => {
      const change = makeArchivableChange('add-auth-flow', {
        specIds: [],
        createdAt: new Date('2024-01-15T12:00:00Z'),
      })

      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(makeSchema([])),
      )
      const result = await uc.execute({
        name: 'add-auth-flow',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(result.archivedChange.archivedName).toBe('20240115-120000-add-auth-flow')
    })

    it('returns an ArchivedChange with no approval or wasStructural fields', async () => {
      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change', { specIds: [] })]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(makeSchema([])),
      )
      const result = await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(result.archivedChange).not.toHaveProperty('approval')
      expect(result.archivedChange).not.toHaveProperty('wasStructural')
    })

    it('returns archivedChange, empty postHookFailures, and staleMetadataSpecPaths on success', async () => {
      const artifactType = makeArtifactType('spec', { delta: false })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const successChange = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      successChange.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          validatedHash: 'abc123',
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([successChange]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', '# Spec')
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      const result = await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(result.archivedChange).toBeInstanceOf(ArchivedChange)
      expect(result.postHookFailures).toEqual([])
      expect(result.staleMetadataSpecPaths).toContain('default/auth/oauth')
    })
  })

  describe('given a pre-archive run hook is configured', () => {
    it('runs the hook before writing spec files', async () => {
      const callOrder: string[] = []
      const specRepo = makeSpecRepository()
      const origSave = specRepo.save.bind(specRepo)
      specRepo.save = async (...args) => {
        callOrder.push('save')
        return origSave(...args)
      }

      const hooks = {
        async run(command: string, _variables: unknown): Promise<HookResult> {
          callOrder.push(command)
          return new HookResult(0, '', '')
        },
      }

      const artifactType = makeArtifactType('spec', { delta: false })
      const schema = makeSchema(
        [artifactType],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: { pre: [{ type: 'run', command: 'pnpm test' }], post: [] },
          },
        ],
      )

      const change = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          validatedHash: 'abc123',
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', '# Spec')
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        hooks,
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(callOrder[0]).toBe('pnpm test')
      expect(callOrder[1]).toBe('save')
    })

    it('throws HookFailedError and does not write spec files when the hook fails', async () => {
      const specRepo = makeSpecRepository()

      const hooks = {
        async run(_command: string, _variables: unknown): Promise<HookResult> {
          return new HookResult(1, '', 'test failed')
        },
      }

      const schema = makeSchema(
        [makeArtifactType('spec')],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: { pre: [{ type: 'run', command: 'pnpm test' }], post: [] },
          },
        ],
      )

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        hooks,
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(HookFailedError)

      expect(specRepo.saved.size).toBe(0)
    })

    it('throws HookFailedError and does not return a result', async () => {
      const schema = makeSchema(
        [],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: { pre: [{ type: 'run', command: 'fail' }], post: [] },
          },
        ],
      )

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change', { specIds: [] })]),
        new Map(),
        makeArchiveRepository(),
        makeHookRunner(1, 'error'),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(HookFailedError)
    })
  })

  describe('given an instruction-type pre hook entry is configured', () => {
    it('does not invoke the hook runner', async () => {
      const runSpy = vi.fn().mockResolvedValue(new HookResult(0, '', ''))
      const hooks = { run: runSpy }

      const schema = makeSchema(
        [],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: {
              pre: [{ type: 'instruction', text: 'Review delta specs' }],
              post: [],
            },
          },
        ],
      )

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change', { specIds: [] })]),
        new Map(),
        makeArchiveRepository(),
        hooks,
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(runSpy).not.toHaveBeenCalled()
    })
  })

  describe('given a delta artifact type', () => {
    it('merges the delta into the base spec', async () => {
      const baseContent = '# Base\n\n## Req 1\nOriginal.'
      const mergedContent = '# Base\n\n## Req 1\nUpdated.'

      const mdParser = makeParser({ apply: () => ({ root: { type: 'doc' } }) })
      const serializeSpy = vi.spyOn(mdParser, 'serialize').mockReturnValue(mergedContent)
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' as const }] })

      const specRepo = makeSpecRepository(new Map([['spec.md', baseContent]]))
      const artifactType = makeArtifactType('spec', { delta: true, format: 'markdown' })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          validatedHash: 'abc123',
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, filename: string) {
          if (filename === 'deltas/default/auth/oauth/spec.md.delta.yaml')
            return new SpecArtifact(filename, 'delta-content')
          return null
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(mdParser, yamlParser),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(serializeSpy).toHaveBeenCalled()
      expect(specRepo.saved.get('spec.md')).toBe(mergedContent)
    })

    it('re-throws DeltaApplicationError when the delta apply conflicts', async () => {
      const mdParser = makeParser({
        apply: () => {
          throw new DeltaApplicationError('conflict: same block in MODIFIED and REMOVED')
        },
      })
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' as const }] })

      const artifactType = makeArtifactType('spec', { delta: true, format: 'markdown' })
      const schema = makeSchema([artifactType])

      const conflictChange = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      conflictChange.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          validatedHash: 'abc123',
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([conflictChange]), {
        async artifact(_change: Change, filename: string) {
          if (filename === 'deltas/default/auth/oauth/spec.md.delta.yaml')
            return new SpecArtifact(filename, 'delta')
          return null
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', makeSpecRepository()]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(mdParser, yamlParser),
        makeSchemaRegistry(schema),
      )

      await expect(
        uc.execute({
          name: 'my-change',
          schemaRef: 'std',
          workspaceSchemasPaths: new Map(),
          hookVariables: hookVars,
        }),
      ).rejects.toThrow(DeltaApplicationError)
    })
  })

  describe('given a non-delta artifact type', () => {
    it('syncs the artifact directly from change to spec', async () => {
      const artifactContent = '# New Spec\n\nContent.'
      const artifactType = makeArtifactType('spec', { delta: false })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          filename: 'spec.md',
          status: 'complete',
          validatedHash: 'abc123',
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', artifactContent)
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(specRepo.saved.get('spec.md')).toBe(artifactContent)
    })
  })

  describe('given an artifact with missing effective status', () => {
    it('does not sync the artifact to the spec', async () => {
      const artifactType = makeArtifactType('spec', { optional: true })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      // No change artifact set → effectiveStatus is 'missing'
      const uc = new ArchiveChange(
        makeChangeRepository([
          makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] }),
        ]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(specRepo.saved.size).toBe(0)
    })
  })

  describe('given an artifact with skipped effective status', () => {
    it('does not sync the artifact to the spec', async () => {
      const artifactType = makeArtifactType('spec', { optional: true })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default/auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({ type: 'spec', filename: 'spec.md', validatedHash: '__skipped__' }),
      )

      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeHookRunner(),
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(specRepo.saved.size).toBe(0)
    })
  })

  describe('given a post-archive hook is configured', () => {
    it('runs the hook after the archive repository is called', async () => {
      const callOrder: string[] = []

      const archiveRepo = makeArchiveRepository()
      const origArchive = archiveRepo.archive.bind(archiveRepo)
      archiveRepo.archive = async (change: Change) => {
        callOrder.push('archive')
        return origArchive(change)
      }

      const hooks = {
        async run(command: string, _variables: unknown): Promise<HookResult> {
          callOrder.push(command)
          return new HookResult(0, '', '')
        },
      }

      const schema = makeSchema(
        [],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: { pre: [], post: [{ type: 'run', command: 'git commit -m archive' }] },
          },
        ],
      )

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change', { specIds: [] })]),
        new Map(),
        archiveRepo,
        hooks,
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(callOrder).toEqual(['archive', 'git commit -m archive'])
    })

    it('collects hook failure without rolling back the archive', async () => {
      let archiveCalled = false

      const archiveRepo = makeArchiveRepository()
      const origArchive = archiveRepo.archive.bind(archiveRepo)
      archiveRepo.archive = async (change: Change) => {
        archiveCalled = true
        return origArchive(change)
      }

      const hooks = {
        async run(_command: string, _variables: unknown): Promise<HookResult> {
          return new HookResult(1, '', 'post hook failed')
        },
      }

      const schema = makeSchema(
        [],
        [
          {
            step: 'archiving',
            requires: [],
            hooks: { pre: [], post: [{ type: 'run', command: 'git push' }] },
          },
        ],
      )

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change', { specIds: [] })]),
        new Map(),
        archiveRepo,
        hooks,
        makeGitAdapter(),
        makeParsers(),
        makeSchemaRegistry(schema),
      )
      const result = await uc.execute({
        name: 'my-change',
        schemaRef: 'std',
        workspaceSchemasPaths: new Map(),
        hookVariables: hookVars,
      })

      expect(archiveCalled).toBe(true)
      expect(result.postHookFailures).toEqual(['git push'])
    })
  })
})
