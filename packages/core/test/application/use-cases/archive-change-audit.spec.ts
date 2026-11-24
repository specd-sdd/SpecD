import { afterEach, describe, it, expect, vi } from 'vitest'
import { Logger } from '../../../src/application/logger.js'
import { makeSpec } from '../../helpers/make-spec.js'
import { type ChangeEvent, Change } from '../../../src/domain/entities/change.js'
import { type ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { toArchivedChangeView } from '../../../src/domain/read-only-change-view.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
} from '../../../src/application/ports/archive-repository.js'
import { type ListResult } from '../../../src/application/ports/repository.js'
import { type ArchiveListEntry } from '../../../src/domain/archived-change-index-entry.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { type MaterializeSpecMetadata } from '../../../src/application/use-cases/materialize-spec-metadata.js'
import { NoopArchiveBatchSnapshot } from '../../../src/application/archive-batch-snapshot-noop.js'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { ArchiveBatchRestoreError } from '../../../src/domain/errors/archive-batch-restore-error.js'
import { ArtifactParseError } from '../../../src/domain/errors/artifact-parse-error.js'
import { HookFailedError } from '../../../src/domain/errors/hook-failed-error.js'
import { CheckPredicateFailedError } from '../../../src/domain/errors/check-predicate-failed-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { ReconciledOperationBlockedError } from '../../../src/application/errors/reconciled-operation-blocked-error.js'
import {
  makeChangeRepository,
  makeListWorkspaces,
  makeActorResolver,
  makeRunStepHooks,
  makeSchemaProvider,
  makeSpecRepository,
  makeArtifactType,
  makeSchema,
  makeParser,
  makeParsers,
  makeMaterializeMetadata,
  newArchiveChange,
  testActor,
  makeWorkflowStep,
  makeRealReconcile,
  makeArchiveBindings,
  makeObservingReconcile,
  makeContentHasher,
} from './helpers.js'

function makeMaterializeMetadataMock(
  metadata: Record<string, unknown> = {},
): MaterializeSpecMetadata {
  return {
    execute: vi.fn().mockResolvedValue({
      metadata,
      metadataFingerprint: 'test-fp',
      source: 'generated',
      regenerated: true,
      warnings: [],
    }),
  } as unknown as MaterializeSpecMetadata
}

afterEach(() => {
  vi.restoreAllMocks()
})

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
      : toArchivedChangeView(change, {
          archivedName,
          archivedAt: new Date(),
        })
    return { archivedChange, archiveDirPath: `/archive/${archivedName}` }
  }

  override async list(options?: ArchiveListOptions): Promise<ListResult<ArchiveListEntry>> {
    return {
      items: [],
      meta: {
        total: 0,
        count: 0,
        limit: options?.limit ?? 100,
      },
    }
  }

  override async count(): Promise<number> {
    return 0
  }

  override async get(): Promise<ArchivedChange | null> {
    return null
  }

  override async reindex(): Promise<void> {}

  override archivePath(archivedChange: ArchivedChange): string {
    return `/archive/${archivedChange.archivedName}`
  }

  override internalPaths(): readonly string[] {
    return ['/archive']
  }
}

function makeArchiveRepository(): ArchiveRepository {
  return new StubArchiveRepository()
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
    schemaName: opts.schemaName ?? 'test-schema',
    schemaVersion: 1,
    history: events,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArchiveChange audit', () => {
  describe('stale verification', () => {
    it('fails verification.current with a start-verification action naming the change', async () => {
      const change = makeArchivableChange('stale-verify')
      change.startVerification(
        {
          version: 1,
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
          implementation: {
            version: 1,
            hashAlgorithm: 'sha256',
            textNormalization: 'text-v1',
            binaryNormalization: 'bytes-v1',
            files: { 'src/gone.ts': 'sha256:' + 'f'.repeat(64) },
          },
        } as never,
        testActor,
      )
      change.completeVerification(testActor)
      const repo = makeChangeRepository([change])
      const provider = makeSchemaProvider(makeSchema({ workflow: [makeWorkflowStep('verifying')] }))
      const uc = newArchiveChange(
        repo,
        makeListWorkspaces(new Map()),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        provider,
        makeMaterializeMetadata(),
        new Map(),
        [],
        process.cwd(),
        undefined,
        undefined,
        makeRealReconcile(repo, provider),
      )

      const error = await uc.execute({ name: 'stale-verify' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('verification.current')
      expect(failure.action?.kind).toBe('start-verification')
      expect(failure.action?.params).toEqual({ changeName: 'stale-verify' })
      expect(failure.message).not.toMatch(/specd |--/)
    })
  })

  describe('validity that still blocks after hooks', () => {
    /** Reconcile stub: real verdict, with `verification: 'valid'` first and `after` on later calls. */
    function makeReconcile(
      repo: ReturnType<typeof makeChangeRepository>,
      provider: ReturnType<typeof makeSchemaProvider>,
      after: Record<string, unknown>,
    ) {
      const real = makeRealReconcile(repo, provider)
      let calls = 0
      const reconcile = {
        execute: async (input: Parameters<typeof real.execute>[0]) => {
          const result = await real.execute(input)
          calls += 1
          return {
            ...result,
            verdict: {
              ...result.verdict,
              verification: 'valid' as const,
              ...(calls >= 2 ? after : {}),
            },
          }
        },
      } as unknown as typeof real
      return { reconcile, calls: () => calls }
    }

    function makeUseCase(
      repo: ReturnType<typeof makeChangeRepository>,
      provider: ReturnType<typeof makeSchemaProvider>,
      reconcile: ReturnType<typeof makeRealReconcile>,
    ) {
      return newArchiveChange(
        repo,
        makeListWorkspaces(new Map()),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        provider,
        makeMaterializeMetadata(),
        new Map(),
        [],
        process.cwd(),
        undefined,
        undefined,
        reconcile,
      )
    }

    it('re-runs the predicates first so a stale verification keeps its start-verification action', async () => {
      const change = makeArchivableChange('stale-after-hooks')
      const repo = makeChangeRepository([change])
      const provider = makeSchemaProvider(makeSchema({ workflow: [makeWorkflowStep('verifying')] }))
      const { reconcile, calls } = makeReconcile(repo, provider, {
        verification: 'stale',
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Verification evidence is stale' }],
      })

      const error = await makeUseCase(repo, provider, reconcile)
        .execute({ name: 'stale-after-hooks' })
        .catch((e: unknown) => e)
      expect(calls()).toBeGreaterThanOrEqual(2)
      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('verification.current')
      expect(failure.action?.kind).toBe('start-verification')
      expect(failure.action?.params).toEqual({ changeName: 'stale-after-hooks' })
    })

    it('throws an invalid-state error when validity blocks and no predicate fails', async () => {
      const change = makeArchivableChange('review-after-hooks')
      const repo = makeChangeRepository([change])
      const provider = makeSchemaProvider(makeSchema({ workflow: [makeWorkflowStep('verifying')] }))
      const { reconcile, calls } = makeReconcile(repo, provider, { artifactReviewRequired: true })

      const error = await makeUseCase(repo, provider, reconcile)
        .execute({ name: 'review-after-hooks' })
        .catch((e: unknown) => e)
      expect(calls()).toBeGreaterThanOrEqual(2)
      expect(error).toBeInstanceOf(InvalidStateTransitionError)
      expect(error).not.toBeInstanceOf(ReconciledOperationBlockedError)
      expect(repo.store.get('review-after-hooks')?.state).toBe('archivable')
    })
  })

  describe('deps.consistent mismatch', () => {
    it('reports mismatches, the archivable to archiving hop and the resolved skippable flag', async () => {
      const artifactType = makeArtifactType('spec', { delta: false, scope: 'spec' })
      const schema = makeSchema({
        artifacts: [artifactType],
        metadataExtraction: {
          dependsOn: {
            artifact: 'spec',
            extractor: {
              selector: { type: 'section', matches: '^Spec Dependencies$' },
              extract: 'content',
              capture: '(core:[a-z-]+)',
            },
          },
        },
      })
      const specRepo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/oauth', filenames: ['spec.md'] })],
        artifacts: { 'auth/oauth/spec.md': '# Spec' },
      })
      const markdownParser = makeParser({
        parse: () => ({
          root: {
            type: 'document',
            children: [
              {
                type: 'section',
                label: 'Spec Dependencies',
                children: [{ type: 'paragraph', value: '- core:extracted' }],
              },
            ],
          },
        }),
        renderSubtree: (node): string =>
          (node.value as string | undefined) ??
          (node.children ?? [])
            .map((child) => ((child as { value?: unknown }).value as string | undefined) ?? '')
            .join('\n'),
      })
      const materializeMetadata = makeMaterializeMetadataMock({
        title: 'OAuth',
        description: 'desc',
        dependsOn: ['core:extracted'],
        contentHashes: { 'spec.md': 'sha256:' + 'a'.repeat(64) },
      })
      const change = makeArchivableChange('my-change', { specIds: ['default:auth/oauth'] })
      change.setSpecDependsOn('default:auth/oauth', ['core:manifest'])
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
        async artifact() {
          return new SpecArtifact('spec.md', '# Spec')
        },
      })
      const uc = newArchiveChange(
        changeRepo,
        makeListWorkspaces(new Map([['default', specRepo]])),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(markdownParser),
        makeSchemaProvider(schema),
        materializeMetadata,
      )

      const error = await uc.execute({ name: 'my-change' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('deps.consistent')
      expect(failure.checkCode).toBe('DEPS_INCONSISTENT')
      expect(failure.from).toBe('archivable')
      expect(failure.to).toBe('archiving')
      // deps.consistent is locked non-skippable in its resolved archive binding.
      expect(failure.skippable).toBe(false)
      expect(failure.details?.['mismatches']).toEqual([
        {
          specId: 'default:auth/oauth',
          extracted: ['core:extracted'],
          persisted: ['core:manifest'],
        },
      ])
      expect(failure.details?.['specIds']).toEqual(['default:auth/oauth'])
      expect(specRepo.saved.has('spec.md')).toBe(false)
    })
  })

  describe('workspace.readOnly failure', () => {
    it('uses the prescribed message format and exposes details.specs', async () => {
      const change = makeArchivableChange('my-change', { specIds: ['platform:auth/tokens'] })
      const schema = makeSchema({
        artifacts: [makeArtifactType('specs', { scope: 'spec', delta: true })],
      })
      const repo = makeChangeRepository([change])
      const uc = newArchiveChange(
        repo,
        makeListWorkspaces(
          new Map([['platform', makeSpecRepository('readOnly')]]),
          new Map([['platform', 'readOnly']]),
        ),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeMaterializeMetadata(),
      )

      const error = await uc.execute({ name: 'my-change' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(CheckPredicateFailedError)
      const failure = error as CheckPredicateFailedError
      expect(failure.checkId).toBe('workspace.readOnly')
      expect(failure.checkCode).toBe('READ_ONLY_WORKSPACE')
      expect(failure.details?.['specs']).toEqual([
        { specId: 'platform:auth/tokens', workspace: 'platform' },
      ])
      expect(failure.message).toBe(
        [
          `Check 'workspace.readOnly' failed: Change "my-change" contains specs from readOnly workspaces:`,
          '',
          '  - platform:auth/tokens  →  workspace "platform" (readOnly)',
          '',
          'Writing deltas into protected specs is not allowed.',
        ].join('\n'),
      )
      expect((await repo.get('my-change'))?.state).toBe('archivable')
    })
  })
  describe('error propagation', () => {
    function deltaChange(name: string): {
      change: Change
      changeRepo: ReturnType<typeof makeChangeRepository>
    } {
      const change = makeArchivableChange(name, { specIds: ['default:auth/oauth'] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              'default:auth/oauth',
              new ArtifactFile({
                key: 'default:auth/oauth',
                filename: 'deltas/default/auth/oauth/spec.md.delta.yaml',
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
            return new SpecArtifact(filename, 'delta')
          return null
        },
      })
      return { change, changeRepo }
    }

    it('propagates the ArtifactParseError of a delta apply unchanged', async () => {
      const thrown = new ArtifactParseError('markdown', 'base is not parseable')
      const mdParser = makeParser({
        apply: () => {
          throw thrown
        },
      })
      const yamlParser = makeParser({ parseDelta: () => [{ op: 'modified' as const }] })
      const schema = makeSchema([
        makeArtifactType('spec', { delta: true, format: 'markdown', scope: 'spec' }),
      ])
      const { changeRepo } = deltaChange('parse-fail')
      const uc = newArchiveChange(
        changeRepo,
        makeListWorkspaces(
          new Map([
            ['default', makeSpecRepository({ artifacts: { 'auth/oauth/spec.md': '# Base' } })],
          ]),
        ),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(mdParser, yamlParser),
        makeSchemaProvider(schema),
        makeMaterializeMetadata(),
      )

      const error = await uc.execute({ name: 'parse-fail' }).catch((e: unknown) => e)

      expect(error).toBe(thrown)
      expect(error).toBeInstanceOf(ArtifactParseError)
    })

    it('throws the plain composition Error when lock-less on-disk dependsOn has no ContentHasher', async () => {
      const change = makeArchivableChange('no-hasher', { specIds: ['default:auth/oauth'] })
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
        async artifact() {
          return new SpecArtifact('spec.md', '# Spec')
        },
      })
      const specRepo = makeSpecRepository({
        specs: [makeSpec({ workspace: 'default', name: 'auth/oauth', filenames: ['spec.md'] })],
        artifacts: { 'auth/oauth/spec.md': '# Spec' },
      })
      const workspaces = makeListWorkspaces(new Map([['default', specRepo]]))
      const parsers = makeParsers()
      const provider = makeSchemaProvider(
        makeSchema({
          artifacts: [makeArtifactType('spec', { delta: false, scope: 'spec' })],
        }),
      )
      const build = (hasher: ReturnType<typeof makeContentHasher> | undefined) =>
        new ArchiveChange(
          changeRepo,
          workspaces,
          makeArchiveRepository(),
          makeArchiveBindings({
            changes: changeRepo,
            listWorkspaces: workspaces,
            parsers,
            schemaProvider: provider,
          }),
          makeActorResolver(),
          parsers,
          provider,
          makeMaterializeMetadata(),
          new Map(),
          [],
          process.cwd(),
          undefined as never,
          hasher,
          makeObservingReconcile(changeRepo),
        )

      const error = await build(undefined)
        .execute({ name: 'no-hasher' })
        .catch((e: unknown) => e)

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).constructor).toBe(Error)
      expect((error as Error).message).toContain('requires ContentHasher')
    })

    it('propagates HookFailedError when an after-persist hook binding aborts', async () => {
      const change = makeArchivableChange('post-abort')
      const changeRepo = makeChangeRepository([change])
      const workspaces = makeListWorkspaces(new Map())
      const parsers = makeParsers()
      const provider = makeSchemaProvider(makeSchema())
      const runStepHooks = makeRunStepHooks({
        execute: async (input) =>
          input.phase === 'post'
            ? {
                hooks: [],
                success: false,
                failedHooks: [
                  {
                    id: 'push',
                    command: 'git push',
                    exitCode: 1,
                    stdout: '',
                    stderr: 'rejected',
                    success: false,
                  },
                ],
                warnings: [],
              }
            : { hooks: [], success: true, failedHooks: [], warnings: [] },
      })
      const bindings = makeArchiveBindings({
        changes: changeRepo,
        listWorkspaces: workspaces,
        runStepHooks,
        parsers,
        schemaProvider: provider,
      }).map((binding) =>
        binding.check.id === 'hook.post' ? { ...binding, onFailure: 'abort' as const } : binding,
      )
      const uc = newArchiveChange(
        changeRepo,
        workspaces,
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        parsers,
        provider,
        makeMaterializeMetadata(),
        new Map(),
        [],
        process.cwd(),
        undefined,
        bindings,
      )

      const error = await uc.execute({ name: 'post-abort' }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(HookFailedError)
    })
  })

  describe('debug logging', () => {
    function debugCalls(spy: { mock: { calls: unknown[][] } }, message: string) {
      return spy.mock.calls
        .filter(([entry]) => entry === message)
        .map(([, context]) => context as Record<string, unknown>)
    }

    function specChange(name: string, specId = 'default:auth/oauth'): Change {
      const change = makeArchivableChange(name, { specIds: [specId] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              specId,
              new ArtifactFile({
                key: specId,
                filename: 'deltas/default/auth/oauth/spec.md.delta.yaml',
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      return change
    }

    it('logs guard outcomes, hook phases with skipped phases, and the direct tracked artifact', async () => {
      const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
      const changeRepo = Object.assign(makeChangeRepository([specChange('logged')]), {
        async artifact() {
          return new SpecArtifact('spec.md', '# Synced content')
        },
      })
      const uc = newArchiveChange(
        changeRepo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeMaterializeMetadata(),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await uc.execute({ name: 'logged', skipHookPhases: new Set(['pre']) })

      const guards = debugCalls(debug, 'ArchiveChange guard outcome')
      expect(guards.map((entry) => entry['checkId']).sort()).toEqual([
        'spec.overlap',
        'workspace.readOnly',
      ])
      for (const guard of guards) {
        expect(guard['specIds']).toEqual(['default:auth/oauth'])
        expect(guard['outcome']).toBe('pass')
      }
      const pre = debugCalls(debug, 'ArchiveChange before-persist effects started')
      expect(pre.length).toBeGreaterThan(0)
      expect(pre[0]).toMatchObject({
        change: 'logged',
        step: 'archive',
        phase: 'pre',
        skipped: true,
        skippedPhases: ['pre'],
      })
      expect(debugCalls(debug, 'ArchiveChange before-persist effects completed')[0]).toMatchObject({
        phase: 'pre',
        skippedPhases: ['pre'],
      })
      const post = debugCalls(debug, 'ArchiveChange after-persist effects started')
      expect(post[0]).toMatchObject({ step: 'archive', phase: 'post', skipped: false })
      const selected = debugCalls(debug, 'ArchiveChange selected tracked artifact file')
      expect(selected[0]).toMatchObject({ specId: 'default:auth/oauth', source: 'direct' })
    })

    it('logs the overlap entries when spec.overlap blocks the archive', async () => {
      const change = makeArchivableChange('mine', { specIds: ['default:auth/oauth'] })
      const peer = new Change({
        name: 'peer',
        createdAt: new Date('2024-01-15T12:00:00Z'),
        specIds: ['default:auth/oauth'],
        schemaName: 'test-schema',
        schemaVersion: 1,
        history: [],
      })
      const repo = makeChangeRepository([change, peer])
      const uc = newArchiveChange(
        repo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema([makeArtifactType('spec', { scope: 'spec' })])),
        makeMaterializeMetadata(),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'mine' })).rejects.toBeInstanceOf(CheckPredicateFailedError)

      const overlap = debugCalls(debug, 'ArchiveChange guard outcome').find(
        (entry) => entry['checkId'] === 'spec.overlap',
      )
      expect(overlap).toMatchObject({
        change: 'mine',
        outcome: 'fail',
        specIds: ['default:auth/oauth'],
        overlapEntries: [{ changeName: 'peer', overlappingSpecIds: ['default:auth/oauth'] }],
      })
    })

    it('logs the readOnly workspaces when workspace.readOnly blocks the archive', async () => {
      const change = makeArchivableChange('ro', { specIds: ['platform:auth/tokens'] })
      const uc = newArchiveChange(
        makeChangeRepository([change]),
        makeListWorkspaces(
          new Map([['platform', makeSpecRepository('readOnly')]]),
          new Map([['platform', 'readOnly']]),
        ),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema([makeArtifactType('specs', { scope: 'spec' })])),
        makeMaterializeMetadata(),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'ro' })).rejects.toBeInstanceOf(CheckPredicateFailedError)

      const guard = debugCalls(debug, 'ArchiveChange guard outcome').find(
        (entry) => entry['checkId'] === 'workspace.readOnly',
      )
      expect(guard).toMatchObject({
        outcome: 'fail',
        specIds: ['platform:auth/tokens'],
        readOnlyWorkspaces: ['platform'],
      })
    })

    it('logs the plan-phase failure with change, step, phase and specId', async () => {
      const schema = makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])
      const changeRepo = Object.assign(makeChangeRepository([specChange('preflight')]), {
        async artifact(): Promise<never> {
          throw Object.assign(new Error('read failed'), { specId: 'default:auth/oauth' })
        },
      })
      const uc = newArchiveChange(
        changeRepo,
        makeListWorkspaces(new Map([['default', makeSpecRepository()]])),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(schema),
        makeMaterializeMetadata(),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'preflight' })).rejects.toThrow('read failed')

      const failed = debugCalls(debug, 'ArchiveChange archive plan preparation failed')
      expect(failed).toHaveLength(1)
      expect(failed[0]).toMatchObject({
        change: 'preflight',
        step: 'prepare',
        phase: 'plan',
        specId: 'default:auth/oauth',
      })
      expect(failed[0]).not.toHaveProperty('code')
    })
  })

  describe('failure and metadata logging', () => {
    function debugCalls(spy: { mock: { calls: unknown[][] } }, message: string) {
      return spy.mock.calls
        .filter(([entry]) => entry === message)
        .map(([, context]) => context as Record<string, unknown>)
    }

    const specId = 'default:auth/oauth'
    const directSchema = () =>
      makeSchema([makeArtifactType('spec', { delta: false, scope: 'spec' })])

    function specChange(name: string, filename = 'specs/default/auth/oauth/spec.md'): Change {
      const change = makeArchivableChange(name, { specIds: [specId] })
      change.setArtifact(
        new ChangeArtifact({
          type: 'spec',
          files: new Map([
            [
              specId,
              new ArtifactFile({
                key: specId,
                filename,
                status: 'complete',
                validatedHash: 'abc123',
              }),
            ],
          ]),
        }),
      )
      return change
    }

    function build(
      change: Change,
      opts: {
        archive?: ArchiveRepository
        snapshot?: Parameters<typeof newArchiveChange>[11]
        materialize?: MaterializeSpecMetadata
        schema?: ReturnType<typeof makeSchema>
        spec?: ReturnType<typeof makeSpecRepository>
      } = {},
    ): ArchiveChange {
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact() {
          return new SpecArtifact('spec.md', '# Synced content')
        },
      })
      return newArchiveChange(
        changeRepo,
        makeListWorkspaces(new Map([['default', opts.spec ?? makeSpecRepository()]])),
        opts.archive ?? makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(opts.schema ?? directSchema()),
        opts.materialize ?? makeMaterializeMetadata(),
        new Map(),
        [],
        process.cwd(),
        opts.snapshot,
      )
    }

    function snapshotWith(overrides: Partial<NoopArchiveBatchSnapshot>): NoopArchiveBatchSnapshot {
      return Object.assign(new NoopArchiveBatchSnapshot(), overrides)
    }

    class FailingArchiveRepository extends StubArchiveRepository {
      override async archive(): Promise<never> {
        throw Object.assign(new Error('move failed'), { specId })
      }
    }

    it('tags the metadata failure log with step metadata and the spec id', async () => {
      const uc = build(specChange('meta-fail'), {
        materialize: {
          execute: vi.fn().mockRejectedValue(new Error('boom')),
        } as unknown as MaterializeSpecMetadata,
      })
      const debug = vi.spyOn(Logger, 'debug')

      const result = await uc.execute({ name: 'meta-fail' })

      const failed = debugCalls(debug, 'ArchiveChange metadata generation failed')
      expect(failed).toEqual([{ change: 'meta-fail', step: 'metadata', specId }])
      expect(result.staleMetadataSpecPaths).toEqual([specId])
    })

    it('logs the metadata skip when a stale spec has no published state', async () => {
      const change = makeArchivableChange('meta-skip', { specIds: [specId] })
      change.setSpecDependsOn(specId, ['default:other/spec'])
      const materialize = { execute: vi.fn() } as unknown as MaterializeSpecMetadata
      const uc = build(change, { materialize })
      const debug = vi.spyOn(Logger, 'debug')

      await uc.execute({ name: 'meta-skip' })

      const skipped = debugCalls(debug, 'ArchiveChange metadata generation skipped')
      expect(skipped).toEqual([
        {
          change: 'meta-skip',
          step: 'metadata',
          specId,
          reason: 'no published state recorded for the spec',
        },
      ])
      expect(materialize.execute).not.toHaveBeenCalled()
    })

    it('logs source delta for a delta-tracked artifact file', async () => {
      const schema = makeSchema([makeArtifactType('spec', { delta: true, scope: 'spec' })])
      const spec = makeSpecRepository({
        specs: [makeSpec({ name: 'auth/oauth', filenames: ['spec.md'] })],
        artifacts: { 'auth/oauth/spec.md': '# Base' },
      })
      const uc = build(specChange('delta-src', 'deltas/default/auth/oauth/spec.md.delta.yaml'), {
        schema,
        spec,
      })
      const debug = vi.spyOn(Logger, 'debug')

      await uc.execute({ name: 'delta-src' })

      const selected = debugCalls(debug, 'ArchiveChange selected tracked artifact file')
      expect(selected[0]).toMatchObject({ specId, source: 'delta' })
    })

    it('carries the spec id on a commit-phase archive-move failure and logs the restore', async () => {
      const uc = build(specChange('move-fail'), {
        archive: new FailingArchiveRepository(),
        snapshot: snapshotWith({
          restoreBatch: async () => ({ restoredSpecIds: [specId], failedSpecIds: [] }),
        }),
      })
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'move-fail' })).rejects.toThrow('move failed')

      const recorded = debugCalls(debug, 'ArchiveChange recorded failed archive attempt')
      expect(recorded).toHaveLength(1)
      expect(recorded[0]).toMatchObject({
        change: 'move-fail',
        step: 'archive',
        specId,
        commitStarted: true,
      })
      const rollback = debugCalls(debug, 'ArchiveChange lifecycle rollback to archivable')
      expect(rollback).toEqual([
        { change: 'move-fail', restoreCompleted: true, restoredSpecIds: [specId] },
      ])
    })

    it('logs restored and failed spec ids on a partial restore', async () => {
      const uc = build(specChange('partial'), {
        archive: new FailingArchiveRepository(),
        snapshot: snapshotWith({
          restoreBatch: async () => ({
            restoredSpecIds: ['default:a/one'],
            failedSpecIds: ['default:b/two'],
          }),
        }),
      })
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'partial' })).rejects.toBeInstanceOf(ArchiveBatchRestoreError)

      const partial = debugCalls(debug, 'ArchiveChange partial restore — staying in archiving')
      expect(partial).toEqual([
        {
          change: 'partial',
          restoredSpecIds: ['default:a/one'],
          failedSpecIds: ['default:b/two'],
        },
      ])
    })

    it('carries the spec id on a snapshot or orphan failure', async () => {
      const uc = build(specChange('orphan'), {
        snapshot: snapshotWith({
          detectOrphans: async () => {
            throw Object.assign(new Error('orphan backup'), { specId })
          },
        }),
      })
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'orphan' })).rejects.toThrow('orphan backup')

      const recorded = debugCalls(debug, 'ArchiveChange recorded failed archive attempt')
      expect(recorded[0]).toMatchObject({
        change: 'orphan',
        step: 'prepare',
        specId,
        commitStarted: false,
      })
    })

    it('logs a distinct plan-phase message without a hardcoded code when plan preparation fails', async () => {
      const uc = build(specChange('plan-fail'))
      vi.spyOn(
        uc as unknown as { _prepareArchivePlan: () => Promise<never> },
        '_prepareArchivePlan',
      ).mockRejectedValue(Object.assign(new Error('plan broke'), { specId }))
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'plan-fail' })).rejects.toThrow('plan broke')

      const planLogs = debugCalls(debug, 'ArchiveChange archive plan preparation failed')
      expect(planLogs).toEqual([
        { change: 'plan-fail', step: 'prepare', phase: 'plan', specId, message: 'plan broke' },
      ])
      expect(debugCalls(debug, 'ArchiveChange full-batch archive preflight failed')).toEqual([])
      expect(planLogs[0]).not.toHaveProperty('code')
    })

    it('logs a distinct preflight-phase message and keeps the error own code', async () => {
      const uc = build(specChange('preflight-fail'))
      vi.spyOn(
        uc as unknown as { _prepareArchivePreflight: () => Promise<never> },
        '_prepareArchivePreflight',
      ).mockRejectedValue(
        Object.assign(new Error('preflight broke'), { specId, code: 'PARSE_FAILED' }),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'preflight-fail' })).rejects.toThrow('preflight broke')

      expect(debugCalls(debug, 'ArchiveChange full-batch archive preflight failed')).toEqual([
        {
          change: 'preflight-fail',
          step: 'prepare',
          phase: 'preflight',
          specId,
          code: 'PARSE_FAILED',
          message: 'preflight broke',
        },
      ])
      expect(debugCalls(debug, 'ArchiveChange archive plan preparation failed')).toEqual([])
    })

    it('does not log before-persist completion after a fail-fast hook failure', async () => {
      const change = specChange('pre-fail')
      const changeRepo = Object.assign(makeChangeRepository([change]), {
        async artifact() {
          return new SpecArtifact('spec.md', '# Synced content')
        },
      })
      const workspaces = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))
      const parsers = makeParsers()
      const provider = makeSchemaProvider(directSchema())
      const runStepHooks = makeRunStepHooks({
        execute: async (input) =>
          input.phase === 'pre'
            ? {
                hooks: [],
                success: false,
                failedHooks: [
                  {
                    id: 'lint',
                    command: 'lint',
                    exitCode: 1,
                    stdout: '',
                    stderr: 'bad',
                    success: false,
                  },
                ],
                warnings: [],
              }
            : { hooks: [], success: true, failedHooks: [], warnings: [] },
      })
      const uc = newArchiveChange(
        changeRepo,
        workspaces,
        makeArchiveRepository(),
        runStepHooks,
        makeActorResolver(),
        parsers,
        provider,
        makeMaterializeMetadata(),
        new Map(),
        [],
        process.cwd(),
        undefined,
        makeArchiveBindings({
          changes: changeRepo,
          listWorkspaces: workspaces,
          runStepHooks,
          parsers,
          schemaProvider: provider,
        }),
      )
      const debug = vi.spyOn(Logger, 'debug')

      await expect(uc.execute({ name: 'pre-fail' })).rejects.toBeInstanceOf(HookFailedError)

      expect(
        debugCalls(debug, 'ArchiveChange before-persist effects started').length,
      ).toBeGreaterThan(0)
      expect(debugCalls(debug, 'ArchiveChange before-persist effects completed')).toEqual([])
    })
  })

  describe('non-archivable change', () => {
    it('reports InvalidStateTransitionError before any predicate failure', async () => {
      // A readOnly workspace would fail `workspace.readOnly` if predicates ran at all.
      const change = new Change({
        name: 'not-yet',
        createdAt: new Date('2024-01-15T12:00:00Z'),
        specIds: ['platform:auth/tokens'],
        schemaName: 'test-schema',
        schemaVersion: 1,
        history: [],
      })
      change.transition('designing', testActor)
      const uc = newArchiveChange(
        makeChangeRepository([change]),
        makeListWorkspaces(
          new Map([['platform', makeSpecRepository('readOnly')]]),
          new Map([['platform', 'readOnly']]),
        ),
        makeArchiveRepository(),
        makeRunStepHooks(),
        makeActorResolver(),
        makeParsers(),
        makeSchemaProvider(makeSchema([makeArtifactType('specs', { scope: 'spec' })])),
        makeMaterializeMetadata(),
      )

      const error = await uc.execute({ name: 'not-yet' }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(InvalidStateTransitionError)
      expect(error).not.toBeInstanceOf(CheckPredicateFailedError)
    })
  })
})
