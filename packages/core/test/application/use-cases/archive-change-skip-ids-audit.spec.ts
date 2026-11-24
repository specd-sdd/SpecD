import { describe, it, expect, vi } from 'vitest'
import { type ChangeEvent, Change } from '../../../src/domain/entities/change.js'
import { type ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { toArchivedChangeView } from '../../../src/domain/read-only-change-view.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
} from '../../../src/application/ports/archive-repository.js'
import { type ListResult } from '../../../src/application/ports/repository.js'
import { type ArchiveListEntry } from '../../../src/domain/archived-change-index-entry.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { UnknownCheckError } from '../../../src/domain/errors/check-registry-errors.js'
import {
  pass as passResult,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import {
  makeChangeRepository,
  makeListWorkspaces,
  makeActorResolver,
  makeRunStepHooks,
  makeSchemaProvider,
  makeSpecRepository,
  makeSchema,
  makeParsers,
  makeMaterializeMetadata,
  makeArchiveBindings,
  newArchiveChange,
  testActor,
  makeWorkflowStep,
} from './helpers.js'

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

describe('ArchiveChange skipChecks id validation (audit)', () => {
  /** Skippable plugin binding that counts how often its predicate runs. */
  function countedBinding(id: string, counter: { runs: number }): CheckBinding {
    return {
      check: {
        id,
        label: 'Counted plugin',
        kind: 'predicate',
        execute: async () => {
          counter.runs += 1
          return passResult(id, 'predicate', 'Counted plugin')
        },
      },
      applicability: [{ scope: 'archive' }],
      skippable: true,
      allowBindingOverride: true,
      allowConfigOverride: true,
      allowDisable: true,
    }
  }

  function makePeer(name: string, specIds: string[]): Change {
    return new Change({
      name,
      createdAt: new Date(),
      specIds,
      schemaName: 'test-schema',
      schemaVersion: 1,
      history: [
        {
          type: 'created',
          at: new Date(),
          by: testActor,
          specIds,
          schemaName: 'test-schema',
          schemaVersion: 1,
        },
      ],
    })
  }

  function setup(counter: { runs: number }, hooksSpy = vi.fn()) {
    const repo = makeChangeRepository([
      makeArchivableChange('my-change'),
      makePeer('other-change', ['default:auth/oauth']),
    ])
    const listWorkspaces = makeListWorkspaces(new Map([['default', makeSpecRepository()]]))
    const parsers = makeParsers()
    const schemaProvider = makeSchemaProvider(
      makeSchema({ workflow: [makeWorkflowStep('archiving')] }),
    )
    const bindings = [
      ...makeArchiveBindings({ changes: repo, listWorkspaces, parsers, schemaProvider }),
      countedBinding('@acme.counted', counter),
    ]
    const useCase = newArchiveChange(
      repo,
      listWorkspaces,
      makeArchiveRepository(),
      makeRunStepHooks({
        execute: async (input) => {
          hooksSpy(input)
          return { success: true, hooks: [], failedHooks: [] } as never
        },
      }),
      makeActorResolver(),
      parsers,
      schemaProvider,
      makeMaterializeMetadata(),
      new Map(),
      [],
      process.cwd(),
      undefined,
      bindings,
      undefined,
      new CheckRegistry(),
    )
    return { useCase, repo, hooksSpy }
  }

  it('treats ids as case-sensitive: Spec.Overlap is rejected with UnknownCheckError', async () => {
    const counter = { runs: 0 }
    const { useCase, repo } = setup(counter)

    const error = await useCase
      .execute({
        name: 'my-change',
        skipChecks: ['Spec.Overlap'],
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnknownCheckError)
    expect((error as UnknownCheckError).message).toContain('Spec.Overlap')
    expect(counter.runs).toBe(0)
    expect((await repo.get('my-change'))?.state).toBe('archivable')
  })

  it('rejects a mixed valid and unknown request before any predicate runs', async () => {
    const counter = { runs: 0 }
    const { useCase, repo, hooksSpy } = setup(counter)

    const error = await useCase
      .execute({
        name: 'my-change',
        skipChecks: ['spec.overlap', 'nope.check'],
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnknownCheckError)
    expect((error as UnknownCheckError).message).toContain('nope.check')
    expect(counter.runs).toBe(0)
    expect(hooksSpy).not.toHaveBeenCalled()
    expect((await repo.get('my-change'))?.state).toBe('archivable')
    expect((await repo.get('other-change'))?.state).toBe('drafting')
  })

  it('rejects the unknown id regardless of its position in the list', async () => {
    const counter = { runs: 0 }
    const { useCase } = setup(counter)

    const error = await useCase
      .execute({
        name: 'my-change',
        skipChecks: ['nope.check', '@acme.counted'],
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnknownCheckError)
    expect(counter.runs).toBe(0)
  })

  it('accepts the same skippable id when every id is valid (control)', async () => {
    const counter = { runs: 0 }
    const { useCase } = setup(counter)

    const result = await useCase.execute({
      name: 'my-change',
      skipChecks: ['spec.overlap', '@acme.counted'],
    })

    expect(result.archivedChange).toBeDefined()
    expect(counter.runs).toBe(0)
  })
})
