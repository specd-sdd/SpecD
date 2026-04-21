import { describe, it, expect, vi } from 'vitest'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { DeltaApplicationError } from '../../../src/domain/errors/delta-application-error.js'
import { SpecOverlapError } from '../../../src/domain/errors/spec-overlap-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ArchiveRepository } from '../../../src/application/ports/archive-repository.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { type GenerateSpecMetadata } from '../../../src/application/use-cases/generate-spec-metadata.js'
import { type SaveSpecMetadata } from '../../../src/application/use-cases/save-spec-metadata.js'
import { MarkdownParser } from '../../../src/infrastructure/artifact-parser/markdown-parser.js'
import {
  type RunStepHooksInput,
  type RunStepHooksResult,
} from '../../../src/application/use-cases/run-step-hooks.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeRunStepHooks,
  makeSchemaProvider,
  makeSpecRepository,
  makeArtifactType,
  makeSchema,
  makeParser,
  makeParsers,
  testActor,
} from './helpers.js'

function makeGenerateMetadata(): GenerateSpecMetadata {
  return {
    execute: vi.fn().mockResolvedValue({ metadata: {}, hasExtraction: false }),
  } as unknown as GenerateSpecMetadata
}

function makeSaveMetadata(): SaveSpecMetadata {
  return {
    execute: vi.fn().mockResolvedValue({ spec: 'default:test' }),
  } as unknown as SaveSpecMetadata
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

class StubArchiveRepository extends ArchiveRepository {
  private readonly _override: ((change: Change) => ArchivedChange) | undefined

  constructor(override?: (change: Change) => ArchivedChange) {
    super({ workspace: 'default', ownership: 'owned', isExternal: false, configPath: '/test' })
    this._override = override
  }

  override async archive(
    change: Change,
  ): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }> {
    const ts = change.createdAt
    const p = (n: number) => String(n).padStart(2, '0')
    const archivedName = `${ts.getUTCFullYear()}${p(ts.getUTCMonth() + 1)}${p(ts.getUTCDate())}-${p(ts.getUTCHours())}${p(ts.getUTCMinutes())}${p(ts.getUTCSeconds())}-${change.name}`
    const archivedChange = this._override
      ? this._override(change)
      : new ArchivedChange({
          name: change.name,
          archivedName,
          archivedAt: new Date(),
          artifacts: [],
          specIds: [...change.specIds],
          schemaName: change.schemaName,
          schemaVersion: change.schemaVersion,
        })
    return { archivedChange, archiveDirPath: `/archive/${archivedName}` }
  }

  override async list(): Promise<ArchivedChange[]> {
    return []
  }

  override async get(): Promise<ArchivedChange | null> {
    return null
  }

  override async reindex(): Promise<void> {}

  override archivePath(archivedChange: ArchivedChange): string {
    return `/archive/${archivedChange.archivedName}`
  }
}

function makeArchiveRepository(override?: (change: Change) => ArchivedChange): ArchiveRepository {
  return new StubArchiveRepository(override)
}

/** Creates a Change in `archivable` state. */
function makeArchivableChange(
  name: string,
  opts: { specIds?: string[]; createdAt?: Date; schemaName?: string } = {},
): Change {
  const createdAt = opts.createdAt ?? new Date('2024-01-15T12:00:00Z')
  const events: ChangeEvent[] = [
    {
      type: 'created',
      at: createdAt,
      by: testActor,
      specIds: opts.specIds ?? ['default:auth/oauth'],
      schemaName: opts.schemaName ?? 'test-schema',
      schemaVersion: 1,
    },
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
    specIds: opts.specIds ?? ['default:auth/oauth'],
    history: events,
  })
}

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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await expect(uc.execute({ name: 'missing' })).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given the schema cannot be resolved', () => {
    it('throws SchemaNotFoundError', async () => {
      const change = makeArchivableChange('my-change')
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(null),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(SchemaNotFoundError)
    })
  })

  describe('given the change is not in archivable state', () => {
    it('throws InvalidStateTransitionError', async () => {
      const change = new Change({
        name: 'my-change',
        createdAt: new Date(),
        specIds: ['core/some-spec'],
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['core/some-spec'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given the active schema name differs from the change schema name', () => {
    it('throws SchemaMismatchError', async () => {
      const change = makeArchivableChange('my-change', { schemaName: 'schema-a' })
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema({ name: 'schema-b' })),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(SchemaMismatchError)
    })
  })

  describe('given the change is in archivable state', () => {
    it('proceeds without error', async () => {
      const change = makeArchivableChange('my-change')
      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })
      expect(result.archivedChange).toBeDefined()
    })

    it('derives archivedName from change.createdAt', async () => {
      const change = makeArchivableChange('add-auth-flow', {
        createdAt: new Date('2024-01-15T12:00:00Z'),
      })

      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'add-auth-flow' })

      expect(result.archivedChange.archivedName).toBe('20240115-120000-add-auth-flow')
    })

    it('returns an ArchivedChange with no approval or wasStructural fields', async () => {
      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(result.archivedChange).not.toHaveProperty('approval')
      expect(result.archivedChange).not.toHaveProperty('wasStructural')
    })

    it('returns archivedChange, empty postHookFailures, and staleMetadataSpecPaths on success', async () => {
      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const successChange = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      successChange.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(result.archivedChange).toBeInstanceOf(ArchivedChange)
      expect(result.postHookFailures).toEqual([])
      expect(result.staleMetadataSpecPaths).toContain('default:auth/oauth')
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

      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', '# Spec')
        },
      })

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            callOrder.push('pnpm test')
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(callOrder[0]).toBe('pnpm test')
      expect(callOrder[1]).toBe('save')
    })

    it('throws HookFailedError and does not write spec files when the hook fails', async () => {
      const specRepo = makeSpecRepository()

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'run-tests',
                  command: 'pnpm test',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'test failed',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'run-tests',
                command: 'pnpm test',
                exitCode: 1,
                stdout: '',
                stderr: 'test failed',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(HookFailedError)

      expect(specRepo.saved.size).toBe(0)
    })

    it('throws HookFailedError and does not return a result', async () => {
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'fail-hook',
                  command: 'fail',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'error',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'fail-hook',
                command: 'fail',
                exitCode: 1,
                stdout: '',
                stderr: 'error',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(HookFailedError)
    })
  })

  describe('given project-level hooks are configured', () => {
    it('runs project-level pre hooks after schema pre hooks', async () => {
      const callOrder: string[] = []

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            callOrder.push('schema-pre', 'project-pre')
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(callOrder).toEqual(['schema-pre', 'project-pre'])
    })

    it('runs project-level post hooks after schema post hooks', async () => {
      const callOrder: string[] = []

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            callOrder.push('schema-post', 'project-post')
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(callOrder).toEqual(['schema-post', 'project-post'])
    })

    it('throws HookFailedError when project-level pre hook fails', async () => {
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'project-pre',
                  command: 'project-pre',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'fail',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'project-pre',
                command: 'project-pre',
                exitCode: 1,
                stdout: '',
                stderr: 'fail',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(HookFailedError)
    })

    it('collects project-level post hook failures without rollback', async () => {
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'project-post',
                  command: 'project-post',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'fail',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'project-post',
                command: 'project-post',
                exitCode: 1,
                stdout: '',
                stderr: 'fail',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(result.postHookFailures).toEqual(['project-post'])
    })
  })

  describe('given an instruction-type pre hook entry is configured', () => {
    it('does not invoke the hook runner', async () => {
      // RunStepHooks internally skips instruction hooks, so the default
      // stub (which returns success with no hooks executed) is correct.
      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(result.archivedChange).toBeDefined()
      expect(result.postHookFailures).toEqual([])
    })
  })

  describe('given archive hook phases are skipped', () => {
    it('still performs delta merge and spec sync', async () => {
      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', '# Synced content')
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['all']) })

      expect(specRepo.saved.get('spec.md')).toBe('# Synced content')
      expect(result.archivedChange).toBeDefined()
    })

    it('still generates metadata', async () => {
      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, _filename: string) {
          return new SpecArtifact('spec.md', '# Content')
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['all']) })

      expect(result.archiveDirPath).toBeDefined()
      expect(typeof result.archiveDirPath).toBe('string')
    })

    it('returns empty postHookFailures', async () => {
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'post-fail',
                  command: 'post-fail',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'fail',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'post-fail',
                command: 'post-fail',
                exitCode: 1,
                stdout: '',
                stderr: 'fail',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['all']) })

      expect(result.postHookFailures).toEqual([])
    })

    it('does not execute hooks', async () => {
      const executeSpy = vi.fn()

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          executeSpy(input)
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['all']) })

      expect(executeSpy).not.toHaveBeenCalled()
      expect(result.archivedChange).toBeDefined()
      expect(result.postHookFailures).toEqual([])
    })

    it('skips only pre hooks when skipHookPhases contains pre', async () => {
      const executeSpy = vi.fn()

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          executeSpy(input)
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['pre']) })

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(executeSpy).toHaveBeenCalledWith({
        name: 'my-change',
        step: 'archiving',
        phase: 'post',
      })
      expect(result.archivedChange).toBeDefined()
    })

    it('skips only post hooks when skipHookPhases contains post', async () => {
      const executeSpy = vi.fn()

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          executeSpy(input)
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change', skipHookPhases: new Set(['post']) })

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(executeSpy).toHaveBeenCalledWith({
        name: 'my-change',
        step: 'archiving',
        phase: 'pre',
      })
      expect(result.postHookFailures).toEqual([])
    })
  })

  describe('given a delta artifact type', () => {
    it('merges the delta into the base spec', async () => {
      const baseContent = '# Base\n\n## Req 1\nOriginal.'
      const mergedContent = '# Base\n\n## Req 1\nUpdated.'

      const mdParser = makeParser({ apply: () => ({ root: { type: 'doc' } }) })
      const serializeSpy = vi.spyOn(mdParser, 'serialize').mockReturnValue(mergedContent)
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' as const }] })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

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

      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const conflictChange = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      conflictChange.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(DeltaApplicationError)
    })

    it('preserves untouched inline formatting in markdown merge output', async () => {
      const baseContent =
        '## Requirement: Unchanged\n\nUse `specd change validate <name>`.\n\n## Requirement: Target\n\nOld text.\n'
      const mdParser = new MarkdownParser()
      const yamlParser = makeParser({
        parseDelta: () => [
          {
            op: 'modified' as const,
            selector: { type: 'section', matches: '^Requirement: Target$' },
            content: 'New text.\n',
          },
        ],
      })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      const merged = specRepo.saved.get('spec.md') ?? ''
      expect(merged).toContain('`specd change validate <name>`')
      expect(merged).not.toContain('\\<name\\>')
    })

    it('serializes mixed markdown styles deterministically after merge', async () => {
      const baseContent =
        '## Requirement: Unchanged\n\n- item a\n* item b\n\nUse _one_ and *two*.\nUse __three__ and **four**.\n\n## Requirement: Target\n\nOld text.\n'
      const mdParser = new MarkdownParser()
      const yamlParser = makeParser({
        parseDelta: () => [
          {
            op: 'modified' as const,
            selector: { type: 'section', matches: '^Requirement: Target$' },
            content: 'New text.\n',
          },
        ],
      })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      const merged = specRepo.saved.get('spec.md') ?? ''
      expect(merged).toContain('- item a')
      expect(merged).toContain('- item b')
      expect(merged).not.toContain('* item b')
      expect(merged).toContain('*one*')
      expect(merged).toContain('**three**')
    })

    it('preserves untouched thematic breaks when merging markdown deltas', async () => {
      const baseContent =
        '## Requirement: Unchanged\n\nBefore\n\n---\n\nAfter\n\n## Requirement: Target\n\nOld text.\n'
      const mdParser = new MarkdownParser()
      const yamlParser = makeParser({
        parseDelta: () => [
          {
            op: 'modified' as const,
            selector: { type: 'section', matches: '^Requirement: Target$' },
            content: 'New text.\n',
          },
        ],
      })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      const merged = specRepo.saved.get('spec.md') ?? ''
      expect(merged).toContain('\n---\n')
      expect(merged).not.toContain('\n***\n')
    })

    it('preserves untouched blockquotes when merging markdown deltas', async () => {
      const baseContent =
        '## Requirement: Unchanged\n\n> Warning line\n\n## Requirement: Target\n\nOld text.\n'
      const mdParser = new MarkdownParser()
      const yamlParser = makeParser({
        parseDelta: () => [
          {
            op: 'modified' as const,
            selector: { type: 'section', matches: '^Requirement: Target$' },
            content: 'New text.\n',
          },
        ],
      })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      const merged = specRepo.saved.get('spec.md') ?? ''
      expect(merged).toContain('> Warning line')
      expect(merged).not.toContain('\\> Warning line')
    })

    it('preserves untouched ordered list numbering when merging markdown deltas', async () => {
      const baseContent =
        '## Requirement: Unchanged\n\n3. Keep as three\n4. Keep as four\n\n## Requirement: Target\n\nOld text.\n'
      const mdParser = new MarkdownParser()
      const yamlParser = makeParser({
        parseDelta: () => [
          {
            op: 'modified' as const,
            selector: { type: 'section', matches: '^Requirement: Target$' },
            content: 'New text.\n',
          },
        ],
      })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
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
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      const merged = specRepo.saved.get('spec.md') ?? ''
      expect(merged).toContain('3. Keep as three')
      expect(merged).toContain('4. Keep as four')
      expect(merged).not.toContain('1. Keep as three')
    })
  })

  describe('given a non-delta artifact type', () => {
    it('syncs the artifact directly from change to spec', async () => {
      const artifactContent = '# New Spec\n\nContent.'
      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, filename: string) {
          if (filename === 'specs/default/auth/oauth/spec.md')
            return new SpecArtifact('spec.md', artifactContent)
          return null
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(specRepo.saved.get('spec.md')).toBe(artifactContent)
    })
  })

  describe('given a delta:true artifact with no delta file (new spec)', () => {
    it('copies the primary file to the spec directory', async () => {
      const artifactContent = '# New Spec\n\nBrand new content.'
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, filename: string) {
          // No delta file — only the primary file exists
          if (filename === 'specs/default/auth/oauth/spec.md')
            return new SpecArtifact('spec.md', artifactContent)
          return null
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(specRepo.saved.get('spec.md')).toBe(artifactContent)
    })
  })

  describe('given a delta:true artifact with both delta and primary files', () => {
    it('merges the delta and does not use the primary file', async () => {
      const baseContent = '# Base\n\n## Req 1\nOriginal.'
      const mergedContent = '# Base\n\n## Req 1\nUpdated via delta.'
      const primaryContent = '# Primary file content — should not be used'

      const mdParser = makeParser({ apply: () => ({ root: { type: 'doc' } }) })
      vi.spyOn(mdParser, 'serialize').mockReturnValue(mergedContent)
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' as const }] })

      const specRepo = makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': baseContent } })
      const artifactType = makeArtifactType('spec', {
        delta: true,
        format: 'markdown',
        scope: 'spec',
      })
      const schema = makeSchema([artifactType])

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'specs/default/auth/oauth/spec.md',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact(_change: Change, filename: string) {
          if (filename === 'deltas/default/auth/oauth/spec.md.delta.yaml')
            return new SpecArtifact(filename, 'delta-content')
          if (filename === 'specs/default/auth/oauth/spec.md')
            return new SpecArtifact('spec.md', primaryContent)
          return null
        },
      })

      const uc = new ArchiveChange(
        changeRepo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(specRepo.saved.get('spec.md')).toBe(mergedContent)
    })
  })

  describe('given an artifact with missing effective status', () => {
    it('does not sync the artifact to the spec', async () => {
      const artifactType = makeArtifactType('spec', { optional: true, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      // No change artifact set → effectiveStatus is 'missing'
      const uc = new ArchiveChange(
        makeChangeRepository([
          makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] }),
        ]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(specRepo.saved.size).toBe(0)
    })
  })

  describe('given an artifact with skipped effective status', () => {
    it('does not sync the artifact to the spec', async () => {
      const artifactType = makeArtifactType('spec', { optional: true, scope: 'spec' })
      const schema = makeSchema([artifactType])
      const specRepo = makeSpecRepository()

      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          optional: true,
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'spec.md',
                status: 'skipped',
                validatedHash: '__skipped__',
              }),
            ],
          ]),
        }),
      )

      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

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

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            callOrder.push('git commit -m archive')
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        archiveRepo,
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

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

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'git-push',
                  command: 'git push',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'post hook failed',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'git-push',
                command: 'git push',
                exitCode: 1,
                stdout: '',
                stderr: 'post hook failed',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        archiveRepo,
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(archiveCalled).toBe(true)
      expect(result.postHookFailures).toEqual(['git push'])
    })
  })

  describe('RunStepHooks delegation parameters', () => {
    it('passes name, step:"archiving", phase:"pre" for pre-hooks', async () => {
      const calls: Array<{ name: string; step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          calls.push({ name: input.name, step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(calls).toContainEqual({ name: 'my-change', step: 'archiving', phase: 'pre' })
    })

    it('passes name, step:"archiving", phase:"post" for post-hooks', async () => {
      const calls: Array<{ name: string; step: string; phase: string }> = []
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          calls.push({ name: input.name, step: input.step, phase: input.phase })
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      await uc.execute({ name: 'my-change' })

      expect(calls).toContainEqual({ name: 'my-change', step: 'archiving', phase: 'post' })
    })
  })

  describe('multiple post-hook failures', () => {
    it('collects all failed hook commands', async () => {
      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'post') {
            return {
              hooks: [
                {
                  id: 'hook-a',
                  command: 'npm run lint',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'lint failed',
                  success: false,
                },
                {
                  id: 'hook-b',
                  command: 'npm run deploy',
                  exitCode: 2,
                  stdout: '',
                  stderr: 'deploy failed',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'hook-a',
                command: 'npm run lint',
                exitCode: 1,
                stdout: '',
                stderr: 'lint failed',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )
      const result = await uc.execute({ name: 'my-change' })

      expect(result.postHookFailures).toEqual(['npm run lint', 'npm run deploy'])
    })
  })

  describe('pre-hook failure prevents archive', () => {
    it('does not call archive repository when pre-hook fails', async () => {
      let archiveCalled = false

      const archiveRepo = makeArchiveRepository()
      const origArchive = archiveRepo.archive.bind(archiveRepo)
      archiveRepo.archive = async (change: Change) => {
        archiveCalled = true
        return origArchive(change)
      }

      const runStepHooks = makeRunStepHooks({
        execute: async (input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          if (input.phase === 'pre') {
            return {
              hooks: [
                {
                  id: 'block-hook',
                  command: 'pnpm test',
                  exitCode: 1,
                  stdout: '',
                  stderr: 'tests failed',
                  success: false,
                },
              ],
              success: false,
              failedHook: {
                id: 'block-hook',
                command: 'pnpm test',
                exitCode: 1,
                stdout: '',
                stderr: 'tests failed',
                success: false,
              },
            }
          }
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        makeChangeRepository([makeArchivableChange('my-change')]),
        new Map(),
        archiveRepo,
        runStepHooks,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(HookFailedError)
      expect(archiveCalled).toBe(false)
    })
  })

  describe('archiving state transition', () => {
    it('transitions change to archiving before pre-hooks execute', async () => {
      const change = makeArchivableChange('my-change')
      const repo = makeChangeRepository([change])
      let stateAtHookTime: string | undefined
      const hookSpy = makeRunStepHooks({
        execute: async (_input: RunStepHooksInput): Promise<RunStepHooksResult> => {
          stateAtHookTime = repo.store.get('my-change')?.state
          return { hooks: [], success: true, failedHook: null }
        },
      })

      const uc = new ArchiveChange(
        repo,
        new Map(),
        makeArchiveRepository(),
        hookSpy,
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await uc.execute({ name: 'my-change' })
      expect(stateAtHookTime).toBe('archiving')
    })

    it('persists the initial archiving transition through ChangeRepository.mutate', async () => {
      const change = makeArchivableChange('my-change')
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')

      const uc = new ArchiveChange(
        repo,
        new Map(),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await uc.execute({ name: 'my-change' })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('overlap guard', () => {
    it('throws SpecOverlapError when other changes target the same specs', async () => {
      const archivable = makeArchivableChange('my-change', {
        specIds: ['default:auth/oauth'],
      })
      const other = new Change({
        name: 'other-change',
        createdAt: new Date(),
        specIds: ['default:auth/oauth'],
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['default:auth/oauth'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
        ],
      })
      const repo = makeChangeRepository([archivable, other])
      const specRepo = makeSpecRepository()
      const uc = new ArchiveChange(
        repo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(SpecOverlapError)
    })

    it('proceeds when allowOverlap is true despite overlap', async () => {
      const archivable = makeArchivableChange('my-change', {
        specIds: ['default:auth/oauth'],
      })
      const other = new Change({
        name: 'other-change',
        createdAt: new Date(),
        specIds: ['default:auth/oauth'],
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['default:auth/oauth'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
        ],
      })
      const repo = makeChangeRepository([archivable, other])
      const specRepo = makeSpecRepository()
      const uc = new ArchiveChange(
        repo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      const result = await uc.execute({ name: 'my-change', allowOverlap: true })
      expect(result.archivedChange).toBeDefined()
      expect(result.invalidatedChanges).toHaveLength(1)
      expect(result.invalidatedChanges[0]!.name).toBe('other-change')
      expect(result.invalidatedChanges[0]!.specIds).toContain('default:auth/oauth')

      const invalidated = await repo.get('other-change')
      expect(invalidated?.state).toBe('designing')
      const invEvent = invalidated?.history.find((e) => e.type === 'invalidated')
      expect(invEvent?.type === 'invalidated' && invEvent.cause).toBe('spec-overlap-conflict')
    })

    it('invalidates multiple overlapping changes when allowOverlap is true', async () => {
      const archivable = makeArchivableChange('my-change', {
        specIds: ['default:auth/oauth'],
      })
      const other1 = new Change({
        name: 'other-one',
        createdAt: new Date(),
        specIds: ['default:auth/oauth'],
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['default:auth/oauth'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
        ],
      })
      const other2 = new Change({
        name: 'other-two',
        createdAt: new Date(),
        specIds: ['default:auth/oauth'],
        history: [
          {
            type: 'created',
            at: new Date(),
            by: testActor,
            specIds: ['default:auth/oauth'],
            schemaName: 'test-schema',
            schemaVersion: 1,
          },
        ],
      })
      const repo = makeChangeRepository([archivable, other1, other2])
      const specRepo = makeSpecRepository()
      const uc = new ArchiveChange(
        repo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      const result = await uc.execute({ name: 'my-change', allowOverlap: true })
      expect(result.invalidatedChanges).toHaveLength(2)
      const names = result.invalidatedChanges.map((ic) => ic.name)
      expect(names).toContain('other-one')
      expect(names).toContain('other-two')
    })

    it('returns empty invalidatedChanges when allowOverlap is true but no overlap exists', async () => {
      const archivable = makeArchivableChange('my-change', {
        specIds: ['default:auth/oauth'],
      })
      const repo = makeChangeRepository([archivable])
      const specRepo = makeSpecRepository()
      const uc = new ArchiveChange(
        repo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      const result = await uc.execute({ name: 'my-change', allowOverlap: true })
      expect(result.invalidatedChanges).toHaveLength(0)
    })

    it('proceeds without flag when no overlap exists', async () => {
      const archivable = makeArchivableChange('my-change', {
        specIds: ['default:auth/oauth'],
      })
      const repo = makeChangeRepository([archivable])
      const specRepo = makeSpecRepository()
      const uc = new ArchiveChange(
        repo,
        new Map([['default', specRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema()),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      const result = await uc.execute({ name: 'my-change' })
      expect(result.archivedChange).toBeDefined()
    })
  })

  describe('readOnly workspace guard', () => {
    it('throws ReadOnlyWorkspaceError when change contains readOnly specs', async () => {
      const { ReadOnlyWorkspaceError } =
        await import('../../../src/domain/errors/read-only-workspace-error.js')

      const change = makeArchivableChange('my-change', {
        specIds: ['platform:auth/tokens'],
      })

      const readOnlySpecRepo = makeSpecRepository('readOnly')

      const schema = makeSchema({
        artifacts: [makeArtifactType('specs', { scope: 'spec', delta: true })],
      })

      const uc = new ArchiveChange(
        makeChangeRepository([change]),
        new Map([['platform', readOnlySpecRepo]]),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeGenerateMetadata(),
        makeSaveMetadata(),
      )

      await expect(uc.execute({ name: 'my-change' })).rejects.toThrow(ReadOnlyWorkspaceError)
    })
  })
})
