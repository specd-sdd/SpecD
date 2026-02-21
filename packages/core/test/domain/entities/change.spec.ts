import { describe, it, expect } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { ApprovalRequiredError } from '../../../src/domain/errors/approval-required-error.js'

const scope = SpecPath.parse('auth/oauth')

function makeChange(
  state?: import('../../../src/domain/value-objects/change-state.js').ChangeState,
) {
  return new Change({ name: 'add-oauth-login', scope, ...(state !== undefined ? { state } : {}) })
}

function makeArtifact(
  type: string,
  status: import('../../../src/domain/value-objects/artifact-status.js').ArtifactStatus,
  requires: string[] = [],
) {
  return new ChangeArtifact({ type, filename: `${type}.md`, status, requires })
}

describe('Change', () => {
  describe('constructor defaults', () => {
    it('defaults state to drafting', () => {
      expect(makeChange().state).toBe('drafting')
    })

    it('defaults artifacts to empty map', () => {
      expect(makeChange().artifacts.size).toBe(0)
    })

    it('defaults approval to undefined', () => {
      expect(makeChange().approval).toBeUndefined()
    })

    it('sets createdAt', () => {
      expect(makeChange().createdAt).toBeInstanceOf(Date)
    })
  })

  describe('transition', () => {
    it('transitions to a valid next state', () => {
      const c = makeChange('drafting')
      c.transition('designing')
      expect(c.state).toBe('designing')
    })

    it('chains multiple valid transitions', () => {
      const c = makeChange()
      c.transition('designing')
      c.transition('ready')
      c.transition('implementing')
      c.transition('done')
      c.transition('archivable')
      expect(c.state).toBe('archivable')
    })

    it('throws InvalidStateTransitionError on invalid transition', () => {
      const c = makeChange('drafting')
      expect(() => c.transition('ready')).toThrow(InvalidStateTransitionError)
    })

    it('throws on backwards transition', () => {
      const c = makeChange('designing')
      expect(() => c.transition('drafting')).toThrow(InvalidStateTransitionError)
    })

    it('throws on self-transition', () => {
      const c = makeChange('drafting')
      expect(() => c.transition('drafting')).toThrow(InvalidStateTransitionError)
    })
  })

  describe('approve', () => {
    it('transitions to approved and stores approval record', () => {
      const c = makeChange('pending-approval')
      c.approve('Security review', 'alice@example.com', [])
      expect(c.state).toBe('approved')
      expect(c.approval).toMatchObject({
        reason: 'Security review',
        approvedBy: 'alice@example.com',
        structuralChanges: [],
      })
      expect(c.approval?.approvedAt).toBeInstanceOf(Date)
    })

    it('stores structural changes in approval record', () => {
      const c = makeChange('pending-approval')
      const changes = [
        { spec: 'auth/spec.md', type: 'MODIFIED' as const, requirement: 'Token expiry' },
      ]
      c.approve('Approved', 'alice@example.com', changes)
      expect(c.approval?.structuralChanges).toEqual(changes)
    })

    it('throws when not in pending-approval state', () => {
      const c = makeChange('done')
      expect(() => c.approve('reason', 'alice@example.com', [])).toThrow(
        InvalidStateTransitionError,
      )
    })
  })

  describe('assertArchivable', () => {
    it('does not throw when in archivable state', () => {
      const c = makeChange('archivable')
      expect(() => c.assertArchivable()).not.toThrow()
    })

    it('throws ApprovalRequiredError when pending-approval', () => {
      const c = makeChange('pending-approval')
      expect(() => c.assertArchivable()).toThrow(ApprovalRequiredError)
    })

    it('throws InvalidStateTransitionError for other non-archivable states', () => {
      for (const state of [
        'drafting',
        'designing',
        'ready',
        'implementing',
        'done',
        'approved',
      ] as const) {
        const c = makeChange(state)
        expect(() => c.assertArchivable()).toThrow(InvalidStateTransitionError)
      }
    })
  })

  describe('isArchivable', () => {
    it('returns true only in archivable state', () => {
      expect(makeChange('archivable').isArchivable).toBe(true)
    })

    it('returns false for all other states', () => {
      for (const state of [
        'drafting',
        'designing',
        'ready',
        'implementing',
        'done',
        'pending-approval',
        'approved',
      ] as const) {
        expect(makeChange(state).isArchivable).toBe(false)
      }
    })
  })

  describe('artifact management', () => {
    it('stores and retrieves an artifact', () => {
      const c = makeChange()
      const a = makeArtifact('proposal', 'in-progress')
      c.setArtifact(a)
      expect(c.getArtifact('proposal')).toBe(a)
    })

    it('returns null for unknown artifact type', () => {
      const c = makeChange()
      expect(c.getArtifact('proposal')).toBeNull()
    })

    it('overwrites artifact of same type', () => {
      const c = makeChange()
      const a1 = makeArtifact('proposal', 'in-progress')
      const a2 = makeArtifact('proposal', 'complete')
      c.setArtifact(a1)
      c.setArtifact(a2)
      expect(c.getArtifact('proposal')).toBe(a2)
    })
  })

  describe('effectiveStatus', () => {
    it('returns missing when artifact not in map', () => {
      expect(makeChange().effectiveStatus('proposal')).toBe('missing')
    })

    it('returns missing when artifact status is missing', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'missing'))
      expect(c.effectiveStatus('proposal')).toBe('missing')
    })

    it('returns in-progress when artifact is in-progress with no requires', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'in-progress'))
      expect(c.effectiveStatus('proposal')).toBe('in-progress')
    })

    it('returns complete when artifact is complete with no requires', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'complete'))
      expect(c.effectiveStatus('proposal')).toBe('complete')
    })

    it('returns in-progress when artifact is complete but required artifact is not complete', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'in-progress'))
      c.setArtifact(makeArtifact('design', 'complete', ['proposal']))
      expect(c.effectiveStatus('design')).toBe('in-progress')
    })

    it('returns complete when artifact and all its requires are complete', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'complete'))
      c.setArtifact(makeArtifact('design', 'complete', ['proposal']))
      expect(c.effectiveStatus('design')).toBe('complete')
    })

    it('cascades through a chain of dependencies', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('proposal', 'in-progress'))
      c.setArtifact(makeArtifact('design', 'complete', ['proposal']))
      c.setArtifact(makeArtifact('tasks', 'complete', ['design']))
      expect(c.effectiveStatus('tasks')).toBe('in-progress')
    })

    it('returns in-progress when a required artifact is missing', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('design', 'complete', ['proposal']))
      // proposal not added to change
      expect(c.effectiveStatus('design')).toBe('in-progress')
    })
  })
})
