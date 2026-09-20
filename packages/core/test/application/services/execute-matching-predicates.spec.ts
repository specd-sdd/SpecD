import { describe, expect, it, vi } from 'vitest'
import {
  executeMatchingPredicates,
  buildCheckExecutionContext,
} from '../../../src/application/services/execute-matching-predicates.js'
import {
  CHECK_LABELS,
  fail,
  type Check,
  type CheckBinding,
} from '../../../src/domain/services/transition-checks.js'
import { Change } from '../../../src/domain/entities/change.js'
import { makeSchema, testActor } from '../use-cases/helpers.js'

function makeChange(): Change {
  return new Change({
    name: 'c',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['default:auth/login'],
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: testActor,
        specIds: ['default:auth/login'],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
}

function makeFailingCheck(id: 'protocol.edge' | 'workflow.requires'): Check {
  return {
    id,
    label: CHECK_LABELS[id],
    kind: 'predicate',
    execute: async () => fail(id, 'CHECK_FAILED', `${id} failed`),
  }
}

describe('executeMatchingPredicates', () => {
  it('collects every matching fail when failFastOn is omitted (GetStatus path)', async () => {
    const later = vi.fn(async () =>
      fail('workflow.requires', 'CHECK_FAILED', 'workflow.requires failed'),
    )
    const bindings: CheckBinding[] = [
      {
        check: makeFailingCheck('protocol.edge'),
        applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      },
      {
        check: {
          id: 'workflow.requires',
          label: CHECK_LABELS['workflow.requires'],
          kind: 'predicate',
          execute: later,
        },
        applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      },
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx)

    expect(later).toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['protocol.edge', 'workflow.requires'])
  })

  it('stops after protocol.edge fail when failFastOn is protocol.edge (TransitionChange path)', async () => {
    const later = vi.fn(async () =>
      fail('workflow.requires', 'CHECK_FAILED', 'workflow.requires failed'),
    )
    const bindings: CheckBinding[] = [
      {
        check: makeFailingCheck('protocol.edge'),
        applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      },
      {
        check: {
          id: 'workflow.requires',
          label: CHECK_LABELS['workflow.requires'],
          kind: 'predicate',
          execute: later,
        },
        applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
      },
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'transition', from: 'designing', to: 'ready', along: 'forward' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx, { failFastOn: 'protocol.edge' })

    expect(later).not.toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['protocol.edge'])
  })

  it('stops after schema.nameMatch fail when failFastOn is schema.nameMatch (ArchiveChange path)', async () => {
    const later = vi.fn(async () =>
      fail('archive.archivable', 'CHECK_FAILED', 'archive.archivable failed'),
    )
    const bindings: CheckBinding[] = [
      {
        check: {
          id: 'schema.nameMatch',
          label: CHECK_LABELS['schema.nameMatch'],
          kind: 'predicate',
          execute: async () => fail('schema.nameMatch', 'CHECK_FAILED', 'schema.nameMatch failed'),
        },
        applicability: [{ scope: 'archive' }],
      },
      {
        check: {
          id: 'archive.archivable',
          label: CHECK_LABELS['archive.archivable'],
          kind: 'predicate',
          execute: later,
        },
        applicability: [{ scope: 'archive' }],
      },
    ]
    const ctx = buildCheckExecutionContext({
      change: makeChange(),
      schema: makeSchema(),
      attempt: { scope: 'archive' },
      approvals: { spec: false, signoff: false },
    })

    const result = await executeMatchingPredicates(bindings, ctx, {
      failFastOn: 'schema.nameMatch',
    })

    expect(later).not.toHaveBeenCalled()
    expect(result.allowed).toBe(false)
    expect(result.checks.map((check) => check.id)).toEqual(['schema.nameMatch'])
  })
})
