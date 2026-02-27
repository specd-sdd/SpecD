import { describe, it, expect } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { makeChangeRepository, makeGitAdapter, testActor } from './helpers.js'

function makeChangeInState(name: string, events: ChangeEvent[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    workspaces: ['default'],
    specIds: ['auth/login'],
    history: events,
  })
}

const actor = testActor

describe('TransitionChange', () => {
  describe('given no change with that name', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new TransitionChange(repo, makeGitAdapter())

      await expect(
        uc.execute({
          name: 'missing',
          to: 'designing',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toThrow(ChangeNotFoundError)
    })
  })

  describe('given a change in drafting state', () => {
    it('transitions to designing', async () => {
      const change = makeChangeInState('my-change', [])
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.state).toBe('designing')
    })

    it('saves the updated change', async () => {
      const change = makeChangeInState('my-change', [])
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      await uc.execute({
        name: 'my-change',
        to: 'designing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      const saved = repo.store.get('my-change')
      expect(saved?.state).toBe('designing')
    })

    it('throws InvalidStateTransitionError for invalid transition', async () => {
      const change = makeChangeInState('my-change', [])
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      await expect(
        uc.execute({
          name: 'my-change',
          to: 'implementing',
          approvalsSpec: false,
          approvalsSignoff: false,
        }),
      ).rejects.toThrow(InvalidStateTransitionError)
    })
  })

  describe('given a change in ready state — approval gate routing', () => {
    function makeReadyChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
      ])
    }

    it('routes ready → implementing when approvalsSpec is false', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.state).toBe('implementing')
    })

    it('routes ready → pending-spec-approval when approvalsSpec is true', async () => {
      const change = makeReadyChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'implementing',
        approvalsSpec: true,
        approvalsSignoff: false,
      })

      expect(result.state).toBe('pending-spec-approval')
    })
  })

  describe('given a change in done state — signoff gate routing', () => {
    function makeDoneChange(name: string): Change {
      return makeChangeInState(name, [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: new Date(), by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: new Date(), by: actor },
        { type: 'transitioned', from: 'implementing', to: 'verifying', at: new Date(), by: actor },
        { type: 'transitioned', from: 'verifying', to: 'done', at: new Date(), by: actor },
      ])
    }

    it('routes done → archivable when approvalsSignoff is false', async () => {
      const change = makeDoneChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.state).toBe('archivable')
    })

    it('routes done → pending-signoff when approvalsSignoff is true', async () => {
      const change = makeDoneChange('my-change')
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'archivable',
        approvalsSpec: false,
        approvalsSignoff: true,
      })

      expect(result.state).toBe('pending-signoff')
    })
  })

  describe('given a designing → ready transition with contextSpecIds', () => {
    it('sets contextSpecIds before transitioning', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
        approvalsSpec: false,
        approvalsSignoff: false,
        contextSpecIds: ['auth/jwt', 'auth/session'],
      })

      expect(result.state).toBe('ready')
      expect(result.contextSpecIds).toEqual(['auth/jwt', 'auth/session'])
    })

    it('leaves contextSpecIds empty when not provided', async () => {
      const change = makeChangeInState('my-change', [
        { type: 'transitioned', from: 'drafting', to: 'designing', at: new Date(), by: actor },
      ])
      const repo = makeChangeRepository([change])
      const uc = new TransitionChange(repo, makeGitAdapter())

      const result = await uc.execute({
        name: 'my-change',
        to: 'ready',
        approvalsSpec: false,
        approvalsSignoff: false,
      })

      expect(result.contextSpecIds).toEqual([])
    })
  })
})
