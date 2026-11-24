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

  it('produces generic message for invalid-transition reason', () => {
    const err = new InvalidStateTransitionError('drafting', 'archivable', {
      type: 'invalid-transition',
    })
    expect(err.message).toBe("Cannot transition from 'drafting' to 'archivable'")
    expect(err.reason).toEqual({ type: 'invalid-transition' })
  })
})
