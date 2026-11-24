import { describe, it, expect, vi } from 'vitest'
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

describe('ArchiveChange implementation links audit', () => {
  function build(
    skipChecksChange: Change,
    specRepo: ReturnType<typeof makeSpecRepository>,
    schema = makeSchema(),
  ) {
    const archiveUseCase = newArchiveChange(
      makeChangeRepository([skipChecksChange]),
      makeListWorkspaces(
        new Map([['default', specRepo]]),
        new Map(),
        new Map([['default', '/project/specs/default']]),
      ),
      makeArchiveRepository(),
      makeRunStepHooks(),
      makeActorResolver(),
      makeParsers(),
      makeSchemaProvider(schema),
      makeMaterializeMetadata(),
      new Map(),
      [],
      '/project',
    )
    return archiveUseCase
  }

  function specRepo() {
    return makeSpecRepository({
      specs: [
        makeSpec({ workspace: 'default', name: 'auth/oauth', filenames: ['spec.md'] }),
        makeSpec({ workspace: 'default', name: 'auth/shared', filenames: ['spec.md'] }),
      ],
    })
  }

  function changeWithLinks(
    links: { specId: string; file: string }[],
    specIds = ['default:auth/oauth'],
  ): Change {
    const change = makeArchivableChange('my-change', { specIds })
    for (const link of links) {
      change.trackImplementationFile(link.file, 'resolved')
      change.addImplementationLink({ ...link, fileLinkExplicit: true })
    }
    return change
  }

  const inScope = { specId: 'default:auth/oauth', file: 'specs/default/auth/oauth/spec.md' }
  const outside = { specId: 'default:auth/oauth', file: 'src/outside.ts' }
  const unknownWs = { specId: 'ghost:auth/oauth', file: 'specs/default/ghost.ts' }

  async function lockOf(repo: ReturnType<typeof specRepo>): Promise<unknown> {
    const saved = repo.saved.get('auth/oauth/spec-lock.json')
    return saved === undefined ? undefined : JSON.parse(saved)
  }

  it('fails impl.linksInScope when a link points outside the workspace codeRoot', async () => {
    const repo = specRepo()
    await expect(
      build(changeWithLinks([inScope, outside]), repo).execute({ name: 'my-change' }),
    ).rejects.toMatchObject({ name: 'CheckPredicateFailedError', checkId: 'impl.linksInScope' })
  })

  it('omits an out-of-codeRoot link from the sidecar when impl.linksInScope is bypassed', async () => {
    const repo = specRepo()
    await build(changeWithLinks([inScope, outside]), repo).execute({
      name: 'my-change',
      skipChecks: ['impl.linksInScope'],
    })
    expect(await lockOf(repo)).toMatchObject({
      implementation: [{ file: 'default:auth/oauth/spec.md' }],
    })
    expect(repo.saved.get('auth/oauth/spec-lock.json')).not.toContain('outside')
  })

  it('fails when a link targets an unknown workspace and is not bypassed', async () => {
    const repo = specRepo()
    await expect(
      build(changeWithLinks([inScope, unknownWs]), repo).execute({ name: 'my-change' }),
    ).rejects.toMatchObject({ name: 'CheckPredicateFailedError', checkId: 'impl.linksInScope' })
  })

  it('omits an unknown-workspace link from the sidecar when bypassed', async () => {
    const repo = specRepo()
    await build(changeWithLinks([inScope, unknownWs]), repo).execute({
      name: 'my-change',
      skipChecks: ['impl.linksInScope'],
    })
    expect(await lockOf(repo)).toMatchObject({
      implementation: [{ file: 'default:auth/oauth/spec.md' }],
    })
    expect(repo.saved.get('auth/oauth/spec-lock.json')).not.toContain('ghost')
  })

  describe('schema-disabled impl.linksInScope', () => {
    const disabledSchema = () =>
      makeSchema({
        workflow: [
          makeWorkflowStep('archiving', {
            archiveChecks: [{ id: 'impl.linksInScope', disabled: true }] as never,
          }),
        ],
      })

    for (const [label, link] of [
      ['an out-of-codeRoot link', outside],
      ['an unknown-workspace link', unknownWs],
    ] as const) {
      it(`omits ${label} instead of failing when the schema disables the check`, async () => {
        const repo = specRepo()
        await build(changeWithLinks([inScope, link]), repo, disabledSchema()).execute({
          name: 'my-change',
        })
        expect(await lockOf(repo)).toMatchObject({
          implementation: [{ file: 'default:auth/oauth/spec.md' }],
        })
        expect(repo.saved.get('auth/oauth/spec-lock.json')).not.toContain(
          link === outside ? 'outside' : 'ghost',
        )
      })
    }
  })

  describe('validity guard after hooks', () => {
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

    for (const [label, after] of [
      ['artifact review is required', { artifactReviewRequired: true }],
      ['signoff is broken', { signoff: 'stale' }],
      ['spec approval is not valid', { specApproval: 'stale' }],
    ] as const) {
      it(`throws InvalidStateTransitionError when ${label} after hooks`, async () => {
        const change = makeArchivableChange('guard-change')
        const repo = makeChangeRepository([change])
        const provider = makeSchemaProvider(
          makeSchema({ workflow: [makeWorkflowStep('verifying')] }),
        )
        const { reconcile } = makeReconcile(repo, provider, after)
        const archiveUseCase = newArchiveChange(
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
        const error = await archiveUseCase
          .execute({ name: 'guard-change' })
          .catch((e: unknown) => e)
        expect(error).toBeInstanceOf(InvalidStateTransitionError)
        expect(repo.store.get('guard-change')?.state).toBe('archivable')
      })
    }

    it('throws InvalidStateTransitionError when verification is not valid after hooks and no predicate explains it', async () => {
      const change = makeArchivableChange('guard-verification')
      const repo = makeChangeRepository([change])
      const provider = makeSchemaProvider(
        makeSchema({
          workflow: [
            makeWorkflowStep('verifying'),
            makeWorkflowStep('archiving', {
              archiveChecks: [{ id: 'verification.current', disabled: true }] as never,
            }),
          ],
        }),
      )
      const { reconcile } = makeReconcile(repo, provider, { verification: 'stale' })
      const error = await makeUseCase(repo, provider, reconcile)
        .execute({ name: 'guard-verification' })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(InvalidStateTransitionError)
      expect(repo.store.get('guard-verification')?.state).toBe('archivable')
    })
  })
})
