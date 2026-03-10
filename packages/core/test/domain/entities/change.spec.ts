import { describe, it, expect } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import type { GitIdentity, ChangeEvent } from '../../../src/domain/entities/change.js'
import type { ArtifactStatus } from '../../../src/domain/value-objects/artifact-status.js'

const actor: GitIdentity = { name: 'Alice', email: 'alice@example.com' }
const otherActor: GitIdentity = { name: 'Bob', email: 'bob@example.com' }

function makeChange(history: ChangeEvent[] = []) {
  return new Change({
    name: 'add-oauth-login',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history,
  })
}

function makeArtifact(type: string, status: ArtifactStatus, requires: string[] = []) {
  return new ChangeArtifact({ type, filename: `${type}.md`, status, requires })
}

describe('Change', () => {
  describe('construction', () => {
    it('stores immutable name and createdAt', () => {
      const c = makeChange()
      expect(c.name).toBe('add-oauth-login')
      expect(c.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    })

    it('derives workspaces from specIds', () => {
      const c = makeChange()
      expect(c.workspaces).toEqual(['default'])
      expect(c.specIds).toEqual(['auth/login'])
    })

    it('derives multiple workspaces from mixed specIds', () => {
      const c = new Change({
        name: 'multi-ws',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['billing:invoices/create', 'auth/login'],
        history: [],
      })
      expect(c.workspaces).toContain('billing')
      expect(c.workspaces).toContain('default')
    })

    it('allows empty specIds', () => {
      const c = new Change({
        name: 'bootstrap',
        createdAt: new Date(),
        specIds: [],
        history: [],
      })
      expect(c.specIds).toEqual([])
      expect(c.workspaces).toEqual([])
    })

    it('defaults artifacts to empty map', () => {
      expect(makeChange().artifacts.size).toBe(0)
    })

    it('defaults history to empty', () => {
      expect(makeChange().history).toHaveLength(0)
    })
  })

  describe('state (derived from history)', () => {
    it('returns drafting when history is empty', () => {
      expect(makeChange().state).toBe('drafting')
    })

    it('returns to field of last transitioned event', () => {
      const c = makeChange()
      c.transition('designing', actor)
      expect(c.state).toBe('designing')
    })

    it('ignores non-transitioned events when deriving state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.draft(actor)
      expect(c.state).toBe('designing')
    })

    it('returns the most recent transitioned to state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      expect(c.state).toBe('ready')
    })
  })

  describe('transition', () => {
    it('transitions to a valid next state and appends event', () => {
      const c = makeChange()
      c.transition('designing', actor)
      expect(c.state).toBe('designing')
      expect(c.history).toHaveLength(1)
      const evt = c.history[0]
      expect(evt?.type).toBe('transitioned')
      if (evt?.type !== 'transitioned') throw new Error('unreachable')
      expect(evt.from).toBe('drafting')
      expect(evt.to).toBe('designing')
      expect(evt.by).toBe(actor)
    })

    it('chains multiple valid transitions', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(c.state).toBe('archivable')
    })

    it('throws InvalidStateTransitionError on invalid transition', () => {
      const c = makeChange()
      expect(() => c.transition('ready', actor)).toThrow(InvalidStateTransitionError)
    })

    it('throws on backwards transition', () => {
      const c = makeChange()
      c.transition('designing', actor)
      expect(() => c.transition('drafting', actor)).toThrow(InvalidStateTransitionError)
    })

    it('throws on self-transition', () => {
      const c = makeChange()
      expect(() => c.transition('drafting', actor)).toThrow(InvalidStateTransitionError)
    })

    it('does not append event when transition throws', () => {
      const c = makeChange()
      expect(() => c.transition('archivable', actor)).toThrow()
      expect(c.history).toHaveLength(0)
    })
  })

  describe('invalidate', () => {
    it('appends invalidated and transitioned events', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.invalidate('spec-change', actor)

      const history = c.history
      const last = history[history.length - 1]
      const secondLast = history[history.length - 2]
      expect(secondLast?.type).toBe('invalidated')
      expect(last?.type).toBe('transitioned')
      if (last?.type === 'transitioned') {
        expect(last.to).toBe('designing')
      }
    })

    it('rolls state back to designing', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.invalidate('spec-change', actor)
      expect(c.state).toBe('designing')
    })

    it('records the cause on the invalidated event', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.invalidate('artifact-change', actor)

      const evt = c.history.find((e) => e.type === 'invalidated')
      expect(evt?.type === 'invalidated' && evt.cause).toBe('artifact-change')
    })

    it('records the pre-invalidation state as from on the transitioned event', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.invalidate('spec-change', actor)

      const transitioned = [...c.history].reverse().find((e) => e.type === 'transitioned')
      expect(transitioned?.type === 'transitioned' && transitioned.from).toBe('ready')
    })

    it('clears validatedHash and resets complete artifacts to in-progress', () => {
      const c = makeChange()
      c.transition('designing', actor)
      const proposal = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      proposal.markComplete('sha256:abc')
      c.setArtifact(proposal)

      c.invalidate('spec-change', actor)

      expect(proposal.validatedHash).toBeUndefined()
      expect(proposal.status).toBe('in-progress')
    })

    it('clears validatedHash and resets skipped artifacts to missing', () => {
      const c = makeChange()
      const adr = new ChangeArtifact({ type: 'adr', filename: 'adr.md', optional: true })
      adr.markSkipped()
      c.setArtifact(adr)

      c.invalidate('spec-change', actor)

      expect(adr.validatedHash).toBeUndefined()
      expect(adr.status).toBe('missing')
    })

    it('clears hashes on all artifacts when invalidated', () => {
      const c = makeChange()
      const proposal = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      proposal.markComplete('sha256:111')
      const design = new ChangeArtifact({ type: 'design', filename: 'design.md' })
      design.markComplete('sha256:222')
      c.setArtifact(proposal)
      c.setArtifact(design)

      c.invalidate('artifact-change', actor)

      expect(proposal.validatedHash).toBeUndefined()
      expect(design.validatedHash).toBeUndefined()
    })
  })

  describe('recordSpecApproval', () => {
    it('appends spec-approved event', () => {
      const c = makeChange()
      c.recordSpecApproval('LGTM', { proposal: 'sha256:abc' }, actor)
      const evt = c.history[0]
      expect(evt?.type).toBe('spec-approved')
      if (evt?.type === 'spec-approved') {
        expect(evt.reason).toBe('LGTM')
        expect(evt.artifactHashes).toEqual({ proposal: 'sha256:abc' })
        expect(evt.by).toBe(actor)
      }
    })
  })

  describe('recordSignoff', () => {
    it('appends signed-off event', () => {
      const c = makeChange()
      c.recordSignoff('Ship it', { proposal: 'sha256:abc' }, actor)
      const evt = c.history[0]
      expect(evt?.type).toBe('signed-off')
      if (evt?.type === 'signed-off') {
        expect(evt.reason).toBe('Ship it')
      }
    })
  })

  describe('activeSpecApproval', () => {
    it('returns undefined when no spec-approved event exists', () => {
      expect(makeChange().activeSpecApproval).toBeUndefined()
    })

    it('returns the spec-approved event when present', () => {
      const c = makeChange()
      c.recordSpecApproval('LGTM', {}, actor)
      expect(c.activeSpecApproval).toBeDefined()
      expect(c.activeSpecApproval?.reason).toBe('LGTM')
    })

    it('returns undefined after invalidation supersedes approval', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.recordSpecApproval('LGTM', {}, actor)
      c.invalidate('spec-change', actor)
      expect(c.activeSpecApproval).toBeUndefined()
    })

    it('returns new approval after re-approval following invalidation', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.recordSpecApproval('First approval', {}, actor)
      c.invalidate('spec-change', actor)
      c.recordSpecApproval('Second approval', {}, otherActor)
      expect(c.activeSpecApproval?.reason).toBe('Second approval')
    })
  })

  describe('activeSignoff', () => {
    it('returns undefined when no signed-off event exists', () => {
      expect(makeChange().activeSignoff).toBeUndefined()
    })

    it('returns the signed-off event when present', () => {
      const c = makeChange()
      c.recordSignoff('Ship it', {}, actor)
      expect(c.activeSignoff?.reason).toBe('Ship it')
    })

    it('returns undefined after invalidation supersedes signoff', () => {
      const c = makeChange()
      c.recordSignoff('Ship it', {}, actor)
      c.invalidate('artifact-change', actor)
      expect(c.activeSignoff).toBeUndefined()
    })
  })

  describe('isDrafted', () => {
    it('returns false when no drafted or restored events exist', () => {
      expect(makeChange().isDrafted).toBe(false)
    })

    it('returns true after draft()', () => {
      const c = makeChange()
      c.draft(actor)
      expect(c.isDrafted).toBe(true)
    })

    it('returns false after restore()', () => {
      const c = makeChange()
      c.draft(actor)
      c.restore(actor)
      expect(c.isDrafted).toBe(false)
    })

    it('returns true after draft → restore → draft cycle', () => {
      const c = makeChange()
      c.draft(actor)
      c.restore(actor)
      c.draft(actor, 'parking again')
      expect(c.isDrafted).toBe(true)
    })
  })

  describe('draft', () => {
    it('appends drafted event with actor', () => {
      const c = makeChange()
      c.draft(actor, 'parking for now')
      const evt = c.history[0]
      expect(evt?.type).toBe('drafted')
      if (evt?.type === 'drafted') {
        expect(evt.reason).toBe('parking for now')
        expect(evt.by).toBe(actor)
      }
    })

    it('appends drafted event without reason when reason not provided', () => {
      const c = makeChange()
      c.draft(actor)
      const evt = c.history[0]
      expect(evt?.type === 'drafted' && 'reason' in evt).toBe(false)
    })
  })

  describe('restore', () => {
    it('appends restored event', () => {
      const c = makeChange()
      c.draft(actor)
      c.restore(otherActor)
      const evt = c.history[c.history.length - 1]
      expect(evt?.type).toBe('restored')
      expect(evt?.by).toBe(otherActor)
    })
  })

  describe('discard', () => {
    it('appends discarded event with mandatory reason', () => {
      const c = makeChange()
      c.discard('no longer needed', actor)
      const evt = c.history[0]
      expect(evt?.type).toBe('discarded')
      if (evt?.type === 'discarded') {
        expect(evt.reason).toBe('no longer needed')
        expect(evt.by).toBe(actor)
      }
    })

    it('includes supersededBy when provided', () => {
      const c = makeChange()
      c.discard('replaced', actor, ['new-oauth-login'])
      const evt = c.history[0]
      expect(evt?.type === 'discarded' && evt.supersededBy).toEqual(['new-oauth-login'])
    })

    it('omits supersededBy when not provided', () => {
      const c = makeChange()
      c.discard('replaced', actor)
      const evt = c.history[0]
      expect(evt?.type === 'discarded' && 'supersededBy' in evt).toBe(false)
    })
  })

  describe('updateSpecIds', () => {
    it('updates specIds, derives workspaces, and invalidates', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.updateSpecIds(['billing:invoices/create', 'auth/register'], actor)
      expect(c.specIds).toEqual(['billing:invoices/create', 'auth/register'])
      expect(c.workspaces).toContain('billing')
      expect(c.workspaces).toContain('default')
      expect(c.state).toBe('designing')
      const invalidated = c.history.find((e) => e.type === 'invalidated')
      expect(invalidated?.type === 'invalidated' && invalidated.cause).toBe('spec-change')
    })
  })

  describe('isArchivable', () => {
    it('returns true only in archivable state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(c.isArchivable).toBe(true)
    })

    it('returns false in non-archivable states', () => {
      for (const history of [
        [] as ChangeEvent[],
        [
          {
            type: 'transitioned' as const,
            at: new Date(),
            by: actor,
            from: 'drafting' as const,
            to: 'designing' as const,
          },
        ],
      ]) {
        const c = makeChange(history)
        expect(c.isArchivable).toBe(false)
      }
    })
  })

  describe('assertArchivable', () => {
    it('does not throw when in archivable state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(() => c.assertArchivable()).not.toThrow()
    })

    it('throws InvalidStateTransitionError for non-archivable states', () => {
      for (const state of [
        'drafting',
        'designing',
        'ready',
        'implementing',
        'done',
        'pending-spec-approval',
        'spec-approved',
        'pending-signoff',
        'signed-off',
      ] as const) {
        const c = new Change({
          name: 'x',
          createdAt: new Date(),
          specIds: ['auth/login'],
          history:
            state === 'drafting'
              ? []
              : [{ type: 'transitioned', at: new Date(), by: actor, from: 'drafting', to: state }],
        })
        expect(() => c.assertArchivable()).toThrow(InvalidStateTransitionError)
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
      expect(makeChange().getArtifact('proposal')).toBeNull()
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
      expect(c.effectiveStatus('design')).toBe('in-progress')
    })

    it('returns skipped when artifact status is skipped', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('adr', 'skipped'))
      expect(c.effectiveStatus('adr')).toBe('skipped')
    })

    it('does not block a dependent when required artifact is skipped', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('adr', 'skipped'))
      c.setArtifact(makeArtifact('design', 'complete', ['adr']))
      expect(c.effectiveStatus('design')).toBe('complete')
    })

    it('cascades skipped through a dependency chain', () => {
      const c = makeChange()
      c.setArtifact(makeArtifact('adr', 'skipped'))
      c.setArtifact(makeArtifact('design', 'complete', ['adr']))
      c.setArtifact(makeArtifact('tasks', 'complete', ['design']))
      expect(c.effectiveStatus('tasks')).toBe('complete')
    })
  })

  describe('clearArtifactValidations', () => {
    it('clears only the specified artifacts', () => {
      const c = makeChange()
      const proposal = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      proposal.markComplete('sha256:abc')
      const tasks = new ChangeArtifact({ type: 'tasks', filename: 'tasks.md' })
      tasks.markComplete('sha256:def')
      c.setArtifact(proposal)
      c.setArtifact(tasks)

      c.clearArtifactValidations(['proposal'])

      expect(proposal.validatedHash).toBeUndefined()
      expect(proposal.status).toBe('in-progress')
      expect(tasks.validatedHash).toBe('sha256:def')
      expect(tasks.status).toBe('complete')
    })

    it('silently skips unknown artifact IDs', () => {
      const c = makeChange()
      expect(() => c.clearArtifactValidations(['unknown'])).not.toThrow()
    })

    it('does nothing when the list is empty', () => {
      const c = makeChange()
      const proposal = new ChangeArtifact({ type: 'proposal', filename: 'proposal.md' })
      proposal.markComplete('sha256:abc')
      c.setArtifact(proposal)

      c.clearArtifactValidations([])

      expect(proposal.validatedHash).toBe('sha256:abc')
    })
  })

  describe('recordArtifactSkipped', () => {
    it('appends an artifact-skipped event', () => {
      const c = makeChange()
      c.recordArtifactSkipped('adr', actor)
      const evt = c.history.at(-1)
      expect(evt?.type).toBe('artifact-skipped')
    })

    it('stores the artifactId and actor', () => {
      const c = makeChange()
      c.recordArtifactSkipped('adr', actor)
      const evt = c.history.at(-1)
      if (evt?.type !== 'artifact-skipped') throw new Error('unexpected event type')
      expect(evt.artifactId).toBe('adr')
      expect(evt.by).toBe(actor)
    })

    it('omits reason when not provided', () => {
      const c = makeChange()
      c.recordArtifactSkipped('adr', actor)
      const evt = c.history.at(-1)
      if (evt?.type !== 'artifact-skipped') throw new Error('unexpected event type')
      expect(evt.reason).toBeUndefined()
    })

    it('includes reason when provided', () => {
      const c = makeChange()
      c.recordArtifactSkipped('adr', actor, 'not applicable for this change')
      const evt = c.history.at(-1)
      if (evt?.type !== 'artifact-skipped') throw new Error('unexpected event type')
      expect(evt.reason).toBe('not applicable for this change')
    })
  })
})
