import { describe, expect, it } from 'vitest'
import {
  isWorkflowTransitionLegal,
  listWorkflowTransitions,
  resolveWorkflowPipeline,
} from '../../../src/domain/services/workflow-topology.js'
import { run as runApprovalSignoff } from '../../../src/domain/checks/approval-signoff.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { makeSchema, testActor } from '../../application/use-cases/helpers.js'

const approvals = { spec: false, signoff: false } as const

describe('workflow-topology audit scenarios', () => {
  it('disabled signoff skips its check rather than done', () => {
    const schema = makeSchema([], [])
    const pipeline = resolveWorkflowPipeline(schema, approvals)
    expect(pipeline.map((p) => p.step)).toContain('done')

    const created: ChangeEvent = {
      type: 'created',
      at: new Date('2024-01-01T00:00:00Z'),
      by: testActor,
      specIds: ['default:auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
    }
    const change = new Change({
      name: 'c',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      specIds: ['default:auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
      history: [created],
    })
    expect(runApprovalSignoff({ signoffGateEnabled: false, change }).outcome).toBe('skip')
  })

  describe('drain states gain no forward shortcuts', () => {
    const schema = makeSchema([], [])
    for (const gates of [approvals, { spec: true, signoff: true }]) {
      it(`pending-spec-approval exits only to implementing and designing (${JSON.stringify(gates)})`, () => {
        const exits = listWorkflowTransitions('pending-spec-approval', schema, gates)
        expect([...exits].sort()).toEqual(['designing', 'implementing'])
        expect(exits).not.toContain('spec-approved')
        expect(exits).not.toContain('signed-off')
        expect(isWorkflowTransitionLegal('pending-spec-approval', 'verifying', schema, gates)).toBe(
          false,
        )
      })

      it(`pending-signoff exits only to archivable, designing and done (${JSON.stringify(gates)})`, () => {
        const exits = listWorkflowTransitions('pending-signoff', schema, gates)
        expect([...exits].sort()).toEqual(['archivable', 'designing', 'done'])
        expect(exits).not.toContain('spec-approved')
        expect(exits).not.toContain('signed-off')
      })
    }
  })
})
