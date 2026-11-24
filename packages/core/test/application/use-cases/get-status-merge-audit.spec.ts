import { describe, it, expect, vi } from 'vitest'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { type RefreshImplementationTracking } from '../../../src/application/use-cases/refresh-implementation-tracking.js'
import { type ReconcileChangeValidity } from '../../../src/application/use-cases/reconcile-change-validity.js'
import { type Change } from '../../../src/domain/entities/change.js'
import { type ChangeValidityVerdict } from '../../../src/domain/services/change-validity.js'
import { fail, type CheckBinding } from '../../../src/domain/services/transition-checks.js'
import {
  makeChangeRepository,
  makeChange,
  makeSchemaProvider,
  makeSchema,
  makeArtifactType,
  testActor,
} from './helpers.js'

const schema = makeSchema([
  makeArtifactType('proposal'),
  makeArtifactType('specs', { scope: 'spec' }),
])

function verdict(overrides: Partial<ChangeValidityVerdict> = {}): ChangeValidityVerdict {
  return {
    artifactReviewRequired: false,
    affectedArtifacts: [],
    projectionChanges: [],
    specApproval: 'not-required',
    signoff: 'not-required',
    verification: 'valid',
    fingerprintIssues: [],
    blockers: [],
    recovery: null,
    ...overrides,
  }
}

function at(name: string, states: readonly Parameters<Change['transition']>[0][]): Change {
  const change = makeChange(name)
  for (const state of states) change.transition(state, testActor)
  return change
}

interface Row {
  readonly id: string
  readonly code?: string
  readonly message?: string
  readonly skippable: boolean
  readonly action?: { readonly kind: string }
  readonly to?: string
  readonly archive?: boolean
}

function bindingFor(row: Row, from: string): CheckBinding {
  const check = {
    id: row.id,
    label: `Checking ${row.id}`,
    kind: 'predicate' as const,
    execute: async () =>
      fail(row.id, row.code ?? 'IMPLEMENTATION_STATE', row.message ?? `${row.id} failed`),
  }
  const withAction = {
    ...check,
    execute: async () => ({
      ...fail(row.id, row.code ?? 'IMPLEMENTATION_STATE', row.message ?? `${row.id} failed`),
      ...(row.action !== undefined ? { action: row.action } : {}),
    }),
  }
  return {
    check: withAction as unknown as CheckBinding['check'],
    applicability: [
      row.archive === true
        ? { scope: 'archive' as const }
        : {
            scope: 'transition' as const,
            from: from as never,
            to: (row.to ?? '*') as never,
            along: '*' as never,
          },
    ],
    skippable: row.skippable,
    allowBindingOverride: true,
    allowConfigOverride: true,
  }
}

async function status(
  change: Change,
  rows: readonly Row[],
  v: ChangeValidityVerdict = verdict(),
  archiveRows: readonly Row[] = [],
) {
  const changes = makeChangeRepository([change])
  const refresh = {
    execute: vi.fn().mockResolvedValue({ trackedFiles: [], links: [] }),
  } as unknown as RefreshImplementationTracking
  const reconcile = {
    execute: async () => ({
      change,
      verdict: v,
      projectionChanges: [],
      affectedArtifacts: [],
      automaticReturn: null,
      changed: false,
    }),
  } as unknown as ReconcileChangeValidity
  const uc = new GetStatus(
    changes,
    makeSchemaProvider(schema),
    { spec: false, signoff: false },
    refresh,
    rows.map((row) => bindingFor(row, change.state)),
    archiveRows.map((row) => bindingFor({ ...row, archive: true }, change.state)),
    reconcile,
  )
  return uc.execute({ name: change.name })
}

describe('GetStatus blocker merge audit', () => {
  const implementing = ['designing', 'ready', 'implementing'] as const
  const same = { id: 'shared.check', message: 'shared failure' }

  it.each([
    { label: 'skippable first, locked second', first: true, second: false, expected: false },
    { label: 'locked first, skippable second', first: false, second: true, expected: false },
    { label: 'skippable on both', first: true, second: true, expected: true },
    { label: 'locked on both', first: false, second: false, expected: false },
  ])('combines per-target skippability as AND: $label', async ({ first, second, expected }) => {
    const change = at('and', implementing)
    const result = await status(change, [
      { ...same, to: 'verifying', skippable: first },
      { ...same, to: 'designing', skippable: second },
    ])
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0]).toMatchObject({
      checkId: 'shared.check',
      message: 'shared failure',
      isSkippable: expected,
    })
  })

  it('keeps two distinct checks that share code and message as two blockers, in target order', async () => {
    const change = at('distinct', implementing)
    const result = await status(change, [
      { id: 'one.check', message: 'same text', to: 'verifying', skippable: true },
      { id: 'two.check', message: 'same text', to: 'designing', skippable: false },
    ])
    expect(result.blockers.map((b) => [b.checkId, b.message, b.isSkippable])).toEqual([
      ['one.check', 'same text', true],
      ['two.check', 'same text', false],
    ])
  })

  it('keeps two distinct checks and a checkId-less blocker sharing code and message apart', async () => {
    const change = at('absorb', implementing)
    const code = 'ARTIFACT_REVIEW_REQUIRED'
    const result = await status(
      change,
      [
        { id: 'one.check', code, message: 'same text', to: 'verifying', skippable: true },
        { id: 'two.check', code, message: 'same text', to: 'designing', skippable: true },
      ],
      verdict({ blockers: [{ code, message: 'same text' }] }),
    )
    expect(result.blockers.map((b) => b.checkId).sort()).toEqual(
      [undefined, 'one.check', 'two.check'].sort(),
    )
  })

  it('delivers the adopted action of a dropped validity blocker to the winning check blocker', async () => {
    const change = at('adopt', implementing)
    const result = await status(
      change,
      [
        {
          id: 'approval.spec',
          code: 'APPROVAL_STALE',
          message: 'check says stale',
          to: 'verifying',
          skippable: false,
        },
      ],
      verdict({
        blockers: [
          {
            code: 'APPROVAL_STALE',
            message: 'validity says stale',
            action: { kind: 'approve-spec' },
          },
        ],
      }),
    )
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0]?.checkId).toBe('approval.spec')
    expect(result.blockers[0]?.action).toEqual({ kind: 'approve-spec' })
  })

  it('archive failures use archive bindings only', async () => {
    const change = at('archive', [...implementing, 'verifying', 'done', 'archivable'])
    const result = await status(
      change,
      [{ id: 'arch.check', message: 'transition failure', skippable: true }],
      verdict(),
      [{ id: 'arch.check', message: 'archive failure', skippable: false }],
    )
    const bySkip = (message: string) =>
      result.blockers.find((b) => b.message === message)?.isSkippable
    expect(bySkip('archive failure')).toBe(false)
    expect(bySkip('transition failure')).toBe(true)
  })

  it.each([
    { label: 'transition skippable, archive locked', t: true, a: false, expected: false },
    { label: 'transition locked, archive skippable', t: false, a: true, expected: false },
    { label: 'both skippable', t: true, a: true, expected: true },
    { label: 'both locked', t: false, a: false, expected: false },
  ])(
    'same check and message in transition and archive is skippable only if both: $label',
    async ({ t, a, expected }) => {
      const change = at('both-ctx', [...implementing, 'verifying', 'done', 'archivable'])
      const result = await status(change, [{ ...same, skippable: t }], verdict(), [
        { ...same, skippable: a },
      ])
      const rows = result.blockers.filter((b) => b.checkId === 'shared.check')
      expect(rows).toHaveLength(1)
      expect(rows[0]?.isSkippable).toBe(expected)
    },
  )

  it('a blocker takes the skippability of its own binding when messages differ per target', async () => {
    const change = at('attempts', implementing)
    const result = await status(change, [
      { id: 'multi.check', message: 'to verifying', to: 'verifying', skippable: true },
      { id: 'multi.check', message: 'to designing', to: 'designing', skippable: false },
    ])
    expect(result.blockers.map((b) => [b.message, b.isSkippable])).toEqual([
      ['to verifying', true],
      ['to designing', false],
    ])
  })

  it('different messages of the same check keep their own skippability', async () => {
    const change = at('own-msg', implementing)
    const result = await status(change, [
      { id: 'same.id', message: 'skippable one', to: 'verifying', skippable: true },
      { id: 'same.id', message: 'locked one', to: 'designing', skippable: false },
    ])
    const bySkip = (m: string) => result.blockers.find((b) => b.message === m)?.isSkippable
    expect(result.blockers).toHaveLength(2)
    expect(bySkip('skippable one')).toBe(true)
    expect(bySkip('locked one')).toBe(false)
  })

  it('verdict blocker without a failing predicate takes nothing from archive bindings', () => {
    const archiveBinding = bindingFor(
      { id: 'arch.check', message: 'archive failure', skippable: true, archive: true },
      'archivable',
    )
    const uc = new GetStatus(
      makeChangeRepository([]),
      makeSchemaProvider(schema),
      { spec: false, signoff: false },
      { execute: vi.fn() } as unknown as RefreshImplementationTracking,
      [],
      [archiveBinding],
      { execute: vi.fn() } as unknown as ReconcileChangeValidity,
    )
    const merge = (
      uc as unknown as {
        _mergeBlockers: (...args: unknown[]) => { message: string; isSkippable: boolean }[]
      }
    )._mergeBlockers.bind(uc)
    const blockers = merge(
      [{ code: 'IMPLEMENTATION_STATE', message: 'verdict says no', checkId: 'arch.check' }],
      {},
      {},
      [fail('arch.check', 'IMPLEMENTATION_STATE', 'archive failure')],
      [archiveBinding],
    )
    expect(blockers.find((b) => b.message === 'verdict says no')?.isSkippable).toBe(false)
    expect(blockers.find((b) => b.message === 'archive failure')?.isSkippable).toBe(true)
  })

  it('ANDs the skippability over every archive binding of one check id', async () => {
    const change = at('archive-and', [...implementing, 'verifying', 'done', 'archivable'])
    const result = await status(change, [], verdict(), [
      { id: 'arch.multi', message: 'archive multi', skippable: true },
      { id: 'arch.multi', message: 'archive multi', skippable: false },
      { id: 'arch.multi', message: 'archive multi', skippable: true },
    ])
    const rows = result.blockers.filter((b) => b.checkId === 'arch.multi')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isSkippable).toBe(false)
  })

  describe('direct merge', () => {
    type Merged = {
      code: string
      message: string
      checkId?: string
      label?: string
      isSkippable: boolean
    }
    function mergeFn(archiveBindings: readonly CheckBinding[] = []) {
      const uc = new GetStatus(
        makeChangeRepository([]),
        makeSchemaProvider(schema),
        { spec: false, signoff: false },
        { execute: vi.fn() } as unknown as RefreshImplementationTracking,
        [],
        archiveBindings,
        { execute: vi.fn() } as unknown as ReconcileChangeValidity,
      )
      return (
        uc as unknown as { _mergeBlockers: (...args: unknown[]) => Merged[] }
      )._mergeBlockers.bind(uc)
    }

    it('keeps a no-family predicate failure as its own blocker beside a checkId-less verdict blocker', () => {
      const code = 'ARTIFACT_REVIEW_REQUIRED'
      const binding = bindingFor({ id: 'review.check', code, message: 'm', skippable: true }, 'x')
      const blockers = mergeFn()(
        [{ code, message: 'm' }],
        { verifying: [fail('review.check', code, 'm')] },
        { verifying: [binding] },
      )
      expect(blockers).toHaveLength(2)
      const own = blockers.find((b) => b.checkId === 'review.check')
      expect(own).toMatchObject({ code, message: 'm', isSkippable: true })
      expect(own?.label).toBeDefined()
      expect(blockers.find((b) => b.checkId === undefined)).toMatchObject({
        code,
        isSkippable: false,
      })
    })

    it('a verdict blocker with the same check id and message as an archive failure stays locked', () => {
      const archiveBinding = bindingFor(
        { id: 'arch.check', message: 'same msg', skippable: true, archive: true },
        'archivable',
      )
      const blockers = mergeFn([archiveBinding])(
        [{ code: 'IMPLEMENTATION_STATE', message: 'same msg', checkId: 'arch.check' }],
        {},
        {},
        [fail('arch.check', 'IMPLEMENTATION_STATE', 'same msg')],
        [archiveBinding],
      )
      expect(blockers).toHaveLength(1)
      expect(blockers[0]?.isSkippable).toBe(false)
    })

    it.each([
      { own: true, resolved: false },
      { own: undefined, resolved: true },
      { own: false, resolved: true },
    ])(
      'a verdict blocker with own isSkippable $own takes the resolved value $resolved',
      ({ own, resolved }) => {
        const binding = bindingFor(
          { id: 'res.check', message: 'same msg', skippable: resolved },
          'x',
        )
        const blockers = mergeFn()(
          [
            {
              code: 'IMPLEMENTATION_STATE',
              message: 'same msg',
              checkId: 'res.check',
              ...(own !== undefined ? { isSkippable: own } : {}),
            },
          ],
          { verifying: [fail('res.check', 'IMPLEMENTATION_STATE', 'same msg')] },
          { verifying: [binding] },
        )
        expect(blockers).toHaveLength(1)
        expect(blockers[0]?.isSkippable).toBe(resolved)
      },
    )
  })
})
