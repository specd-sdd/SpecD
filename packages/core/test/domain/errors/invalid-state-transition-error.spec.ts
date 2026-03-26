import { describe, it, expect } from 'vitest'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'

describe('InvalidStateTransitionError', () => {
  it('produces generic message when no reason provided', () => {
    const err = new InvalidStateTransitionError('ready', 'implementing')
    expect(err.message).toBe("Cannot transition from 'ready' to 'implementing'")
    expect(err.reason).toBeUndefined()
  })

  it('includes artifact ID for incomplete-artifact reason', () => {
    const err = new InvalidStateTransitionError('ready', 'implementing', {
      type: 'incomplete-artifact',
      artifactId: 'specs',
    })
    expect(err.message).toContain("artifact 'specs' is not complete")
    expect(err.reason).toEqual({ type: 'incomplete-artifact', artifactId: 'specs' })
  })

  it('includes counts for incomplete-tasks reason', () => {
    const err = new InvalidStateTransitionError('implementing', 'verifying', {
      type: 'incomplete-tasks',
      artifactId: 'tasks',
      incomplete: 3,
      complete: 27,
      total: 30,
    })
    expect(err.message).toContain('tasks has incomplete items (27/30 tasks complete)')
    expect(err.reason?.type).toBe('incomplete-tasks')
  })

  it('produces generic message for invalid-transition reason', () => {
    const err = new InvalidStateTransitionError('drafting', 'archivable', {
      type: 'invalid-transition',
    })
    expect(err.message).toBe("Cannot transition from 'drafting' to 'archivable'")
    expect(err.reason).toEqual({ type: 'invalid-transition' })
  })

  it('includes approval message for spec gate', () => {
    const err = new InvalidStateTransitionError('pending-spec-approval', 'spec-approved', {
      type: 'approval-required',
      gate: 'spec',
    })
    expect(err.message).toContain('waiting for human spec approval')
    expect(err.reason).toEqual({ type: 'approval-required', gate: 'spec' })
  })

  it('includes approval message for signoff gate', () => {
    const err = new InvalidStateTransitionError('pending-signoff', 'signed-off', {
      type: 'approval-required',
      gate: 'signoff',
    })
    expect(err.message).toContain('waiting for human signoff')
    expect(err.reason).toEqual({ type: 'approval-required', gate: 'signoff' })
  })
})
