import { describe, expect, it } from 'vitest'
import { executeCheckWithProgress } from '../../../src/application/services/execute-matching-predicates.js'
import {
  CHECK_LABELS,
  type Check,
  type CheckExecutionContext,
  type CheckProgressEvent,
  type CheckResult,
} from '../../../src/domain/services/transition-checks.js'
import { makeSchema, testActor } from '../use-cases/helpers.js'
import { Change } from '../../../src/domain/entities/change.js'

function makeCtx(onCheckProgress?: (event: CheckProgressEvent) => void): CheckExecutionContext {
  const change = new Change({
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
  return {
    change,
    schema: makeSchema(),
    attempt: {
      scope: 'transition',
      from: 'designing',
      to: 'ready',
      along: 'forward',
    },
    approvals: { spec: false, signoff: false },
    allowOverlap: false,
    allowOutOfScope: false,
    effectiveStatusByArtifact: new Map(),
    ...(onCheckProgress !== undefined ? { onCheckProgress } : {}),
  }
}

describe('executeCheckWithProgress', () => {
  it('given execute throws, when wrapped, then emits check-done fail then rethrows', async () => {
    const events: CheckProgressEvent[] = []
    const check: Check = {
      id: 'deps.consistent',
      label: CHECK_LABELS['deps.consistent'],
      kind: 'predicate',
      execute: async () => {
        throw new Error('boom')
      },
    }

    await expect(
      executeCheckWithProgress(
        check,
        makeCtx((e) => events.push(e)),
      ),
    ).rejects.toThrow('boom')

    expect(events).toEqual([
      { type: 'check-start', id: 'deps.consistent', label: CHECK_LABELS['deps.consistent'] },
      {
        type: 'check-done',
        id: 'deps.consistent',
        label: CHECK_LABELS['deps.consistent'],
        outcome: 'fail',
        reason: 'boom',
      },
    ])
  })

  it('given execute returns pass, when wrapped, then emits start and done', async () => {
    const events: CheckProgressEvent[] = []
    const passResult: CheckResult = {
      id: 'protocol.edge',
      label: CHECK_LABELS['protocol.edge'],
      kind: 'predicate',
      outcome: 'pass',
    }
    const check: Check = {
      id: 'protocol.edge',
      label: CHECK_LABELS['protocol.edge'],
      kind: 'predicate',
      execute: async () => passResult,
    }

    await expect(
      executeCheckWithProgress(
        check,
        makeCtx((e) => events.push(e)),
      ),
    ).resolves.toEqual(passResult)
    expect(events.map((e) => e.type)).toEqual(['check-start', 'check-done'])
  })
})
