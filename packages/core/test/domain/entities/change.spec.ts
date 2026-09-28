import { describe, it, expect } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { ChangeArtifact, SKIPPED_SENTINEL } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { InvalidStateTransitionError } from '../../../src/domain/errors/invalid-state-transition-error.js'
import { InvalidChangeError } from '../../../src/domain/errors/invalid-change-error.js'
import { HistoricalImplementationGuardError } from '../../../src/domain/errors/historical-implementation-guard-error.js'
import type { ActorIdentity, ChangeEvent } from '../../../src/domain/entities/change.js'
import type { ArtifactStatus } from '../../../src/domain/value-objects/artifact-status.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import {
  ArtifactDag,
  artifactDagFromChangeArtifacts,
} from '../../../src/domain/value-objects/artifact-dag.js'
import type {
  ArtifactFingerprint,
  SpecApprovalFingerprint,
} from '../../../src/domain/value-objects/validity-fingerprint.js'

const actor: ActorIdentity = { name: 'Alice', email: 'alice@example.com' }
const otherActor: ActorIdentity = { name: 'Bob', email: 'bob@example.com' }
const allArtifactsMessage = 'Invalidated because artifacts require review.'

function makeChange(history: ChangeEvent[] = []) {
  return new Change({
    name: 'add-oauth-login',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['auth/login'],
    history,
  })
}

function approvalFingerprint(
  change: Change,
  artifacts: ArtifactFingerprint | Record<string, string> = {},
): SpecApprovalFingerprint {
  return {
    version: 1,
    specIds: [...change.specIds].sort(),
    artifacts:
      'algorithm' in artifacts
        ? (artifacts as ArtifactFingerprint)
        : {
            version: 1,
            algorithm: 'artifact-pre-hash-v1',
            files: artifacts as Record<string, `sha256:${string}`>,
          },
  }
}

function makeArtifact(type: string, status: ArtifactStatus, requires: string[] = []) {
  const file = new ArtifactFile({ key: type, filename: `${type}.md`, status })
  return new ChangeArtifact({ type, requires, files: new Map([[type, file]]) })
}

function dagFor(change: Change): ArtifactDag {
  return artifactDagFromChangeArtifacts(change.artifacts.values())
}

function allArtifacts(change: Change) {
  return [...change.artifacts.values()].map((artifact) => ({
    type: artifact.type,
    files: [...artifact.files.keys()],
  }))
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

    it('throws InvalidChangeError for non-kebab-case name', () => {
      expect(
        () =>
          new Change({
            name: 'Add_OAuth',
            createdAt: new Date(),
            specIds: [],
            history: [],
          }),
      ).toThrow(InvalidChangeError)
    })

    it('throws InvalidChangeError for name with uppercase letters', () => {
      expect(
        () =>
          new Change({
            name: 'AddOAuth',
            createdAt: new Date(),
            specIds: [],
            history: [],
          }),
      ).toThrow(InvalidChangeError)
    })

    it('throws InvalidChangeError for name with leading hyphen', () => {
      expect(
        () =>
          new Change({
            name: '-add-oauth',
            createdAt: new Date(),
            specIds: [],
            history: [],
          }),
      ).toThrow(InvalidChangeError)
    })

    it('throws InvalidChangeError for empty name', () => {
      expect(
        () =>
          new Change({
            name: '',
            createdAt: new Date(),
            specIds: [],
            history: [],
          }),
      ).toThrow(InvalidChangeError)
    })

    it('deduplicates specIds', () => {
      const c = new Change({
        name: 'dedup-test',
        createdAt: new Date(),
        specIds: ['auth/login', 'auth/login', 'billing:invoices'],
        history: [],
      })
      expect(c.specIds).toEqual(['auth/login', 'billing:invoices'])
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

  describe('implementation tracking', () => {
    it('returns the first time the change entered implementing', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const implementingAt = new Date('2024-01-03T10:00:00Z')
      const c = makeChange([
        {
          type: 'created',
          at: createdAt,
          by: actor,
          specIds: ['auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'drafting', to: 'designing', at: createdAt, by: actor },
        { type: 'transitioned', from: 'designing', to: 'ready', at: createdAt, by: actor },
        { type: 'transitioned', from: 'ready', to: 'implementing', at: implementingAt, by: actor },
        {
          type: 'transitioned',
          from: 'implementing',
          to: 'designing',
          at: new Date('2024-01-04T00:00:00Z'),
          by: actor,
        },
      ])

      expect(c.getHistoricalImplementationAt()).toEqual(implementingAt)
      expect(c.hasEverReachedImplementing).toBe(true)
    })

    it('keeps explicit file links when the last symbol is removed', () => {
      const c = makeChange()
      c.addImplementationLink({
        specId: 'default:auth/login',
        file: 'packages/core/src/login.ts',
        fileLinkExplicit: true,
        symbols: ['login'],
      })

      c.removeImplementationSymbol('default:auth/login', 'packages/core/src/login.ts', 'login')

      expect(c.implementationLinks).toEqual([
        {
          specId: 'default:auth/login',
          file: 'packages/core/src/login.ts',
          fileLinkExplicit: true,
        },
      ])
    })

    it('removes container-only file links when the last symbol is removed', () => {
      const c = makeChange()
      c.addImplementationLink({
        specId: 'default:auth/login',
        file: 'packages/core/src/login.ts',
        fileLinkExplicit: false,
        symbols: ['login'],
      })

      c.removeImplementationSymbol('default:auth/login', 'packages/core/src/login.ts', 'login')

      expect(c.implementationLinks).toEqual([])
    })

    it('rejects container-only links without symbols', () => {
      const c = makeChange()
      expect(() =>
        c.addImplementationLink({
          specId: 'default:auth/login',
          file: 'packages/core/src/login.ts',
          fileLinkExplicit: false,
        }),
      ).toThrow(InvalidChangeError)
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

    it.each(['signed-off', 'archivable', 'archiving'] as const)(
      'applies sign-off recovery from %s to done with one attributed event',
      (from) => {
        const c = makeChange([
          { type: 'transitioned', from: 'drafting', to: from, at: new Date(), by: actor },
        ])
        const before = c.history.length

        c.recover({ cause: 'signoff', from, to: 'done' }, otherActor)

        expect(c.state).toBe('done')
        expect(c.history).toHaveLength(before + 1)
        expect(c.history.at(-1)).toMatchObject({
          type: 'transitioned',
          from,
          to: 'done',
          by: otherActor,
        })
      },
    )

    it.each(['signed-off', 'archivable', 'archiving'] as const)(
      'rejects the manual %s to done recovery edge',
      (from) => {
        const c = makeChange([
          { type: 'transitioned', from: 'drafting', to: from, at: new Date(), by: actor },
        ])
        expect(() => c.transition('done', actor)).toThrow(InvalidStateTransitionError)
      },
    )
  })

  describe('invalidate', () => {
    it('appends invalidated event and preserves lifecycle state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.invalidate('spec-change', actor, allArtifactsMessage, allArtifacts(c), dagFor(c))

      const history = c.history
      const last = history[history.length - 1]
      expect(last?.type).toBe('invalidated')
      expect(c.state).toBe('ready')
    })

    it('records the cause on the invalidated event without transitioning state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.invalidate(
        'artifact-drift',
        actor,
        'Invalidated because validated artifacts drifted',
        [{ type: 'proposal', files: ['proposal'] }],
        dagFor(c),
      )

      const evt = c.history.find((e) => e.type === 'invalidated')
      expect(evt?.type === 'invalidated' && evt.cause).toBe('artifact-drift')
      expect(c.state).toBe('designing')
    })

    it('marks complete artifacts pending-review while preserving hashes', () => {
      const c = makeChange()
      c.transition('designing', actor)
      const file = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
      const proposal = new ChangeArtifact({
        type: 'proposal',
        files: new Map([['proposal', file]]),
      })
      proposal.markComplete('proposal', 'sha256:abc')
      c.setArtifact(proposal)

      c.invalidate('spec-change', actor, allArtifactsMessage, allArtifacts(c), dagFor(c))

      expect(proposal.getFile('proposal')?.validatedHash).toBe('sha256:abc')
      expect(proposal.status).toBe('pending-review')
    })

    it('marks skipped artifacts pending-review while preserving hashes', () => {
      const c = makeChange()
      const file = new ArtifactFile({ key: 'adr', filename: 'adr.md' })
      const adr = new ChangeArtifact({
        type: 'adr',
        optional: true,
        files: new Map([['adr', file]]),
      })
      adr.markSkipped()
      c.setArtifact(adr)

      c.invalidate('spec-change', actor, allArtifactsMessage, allArtifacts(c), dagFor(c))

      expect(adr.getFile('adr')?.validatedHash).toBe(SKIPPED_SENTINEL)
      expect(adr.status).toBe('pending-review')
    })

    it('marks all artifacts pending-review when invalidated without a focused payload', () => {
      const c = makeChange()
      const pFile = new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })
      const proposal = new ChangeArtifact({
        type: 'proposal',
        files: new Map([['proposal', pFile]]),
      })
      proposal.markComplete('proposal', 'sha256:111')
      const dFile = new ArtifactFile({ key: 'design', filename: 'design.md' })
      const design = new ChangeArtifact({ type: 'design', files: new Map([['design', dFile]]) })
      design.markComplete('design', 'sha256:222')
      c.setArtifact(proposal)
      c.setArtifact(design)

      c.invalidate(
        'artifact-review-required',
        actor,
        allArtifactsMessage,
        allArtifacts(c),
        dagFor(c),
      )

      expect(proposal.getFile('proposal')?.validatedHash).toBe('sha256:111')
      expect(proposal.status).toBe('pending-review')
      expect(design.getFile('design')?.validatedHash).toBe('sha256:222')
      expect(design.status).toBe('pending-review')
    })

    it('succeeds from archivable state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(c.state).toBe('archivable')

      c.invalidate(
        'artifact-review-required',
        actor,
        allArtifactsMessage,
        allArtifacts(c),
        dagFor(c),
      )
      expect(c.state).toBe('archivable')
    })

    it('with drift payload marks only specified and downstream artifacts for review', () => {
      // DAG: proposal → specs → verify, proposal → design, specs + design → tasks
      const c = makeChange()
      const proposal = new ChangeArtifact({
        type: 'proposal',
        requires: [],
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      proposal.markComplete('proposal', 'sha256:p')
      const specs = new ChangeArtifact({
        type: 'specs',
        requires: ['proposal'],
        files: new Map([['specs', new ArtifactFile({ key: 'specs', filename: 'specs.md' })]]),
      })
      specs.markComplete('specs', 'sha256:s')
      const verify = new ChangeArtifact({
        type: 'verify',
        requires: ['specs'],
        files: new Map([['verify', new ArtifactFile({ key: 'verify', filename: 'verify.md' })]]),
      })
      verify.markComplete('verify', 'sha256:v')
      const design = new ChangeArtifact({
        type: 'design',
        requires: ['proposal'],
        files: new Map([['design', new ArtifactFile({ key: 'design', filename: 'design.md' })]]),
      })
      design.markComplete('design', 'sha256:d')
      const tasks = new ChangeArtifact({
        type: 'tasks',
        requires: ['specs', 'design'],
        files: new Map([['tasks', new ArtifactFile({ key: 'tasks', filename: 'tasks.md' })]]),
      })
      tasks.markComplete('tasks', 'sha256:t')
      c.setArtifact(proposal)
      c.setArtifact(specs)
      c.setArtifact(verify)
      c.setArtifact(design)
      c.setArtifact(tasks)

      c.invalidate(
        'artifact-drift',
        actor,
        'Invalidated because validated artifacts drifted',
        [{ type: 'tasks', files: ['tasks'] }],
        dagFor(c),
      )

      expect(tasks.getFile('tasks')?.validatedHash).toBe('sha256:t')
      expect(tasks.status).toBe('drifted-pending-review')
      expect(tasks.getFile('tasks')?.hasDrift).toBe(true)
      // tasks has no descendants, so with downstream policy only tasks is reopened
      expect(proposal.status).toBe('complete')
      expect(specs.status).toBe('complete')
      expect(verify.status).toBe('complete')
      expect(design.status).toBe('complete')
    })

    it('with drift payload marks drifted and downstream artifacts pending-review via downstream policy', () => {
      // DAG: proposal → specs → verify, proposal → design, specs + design → tasks
      const c = makeChange()
      const proposal = new ChangeArtifact({
        type: 'proposal',
        requires: [],
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      proposal.markComplete('proposal', 'sha256:p')
      const specs = new ChangeArtifact({
        type: 'specs',
        requires: ['proposal'],
        files: new Map([['specs', new ArtifactFile({ key: 'specs', filename: 'specs.md' })]]),
      })
      specs.markComplete('specs', 'sha256:s')
      const verify = new ChangeArtifact({
        type: 'verify',
        requires: ['specs'],
        files: new Map([['verify', new ArtifactFile({ key: 'verify', filename: 'verify.md' })]]),
      })
      verify.markComplete('verify', 'sha256:v')
      const design = new ChangeArtifact({
        type: 'design',
        requires: ['proposal'],
        files: new Map([['design', new ArtifactFile({ key: 'design', filename: 'design.md' })]]),
      })
      design.markComplete('design', 'sha256:d')
      const tasks = new ChangeArtifact({
        type: 'tasks',
        requires: ['specs', 'design'],
        files: new Map([['tasks', new ArtifactFile({ key: 'tasks', filename: 'tasks.md' })]]),
      })
      tasks.markComplete('tasks', 'sha256:t')
      c.setArtifact(proposal)
      c.setArtifact(specs)
      c.setArtifact(verify)
      c.setArtifact(design)
      c.setArtifact(tasks)

      c.invalidate(
        'artifact-drift',
        actor,
        'Invalidated because validated artifacts drifted',
        [{ type: 'specs', files: ['specs'] }],
        dagFor(c),
      )

      expect(specs.getFile('specs')?.validatedHash).toBe('sha256:s')
      expect(specs.status).toBe('drifted-pending-review')
      expect(verify.getFile('verify')?.validatedHash).toBe('sha256:v')
      expect(verify.status).toBe('pending-review')
      expect(tasks.getFile('tasks')?.validatedHash).toBe('sha256:t')
      expect(tasks.status).toBe('pending-review')
      expect(proposal.status).toBe('complete')
      expect(proposal.getFile('proposal')?.validatedHash).toBe('sha256:p')
      expect(design.status).toBe('complete')
      expect(design.getFile('design')?.validatedHash).toBe('sha256:d')
    })

    it('handles spec-overlap-conflict cause', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      const message =
        "Invalidated because change 'alpha' was archived with overlapping specs: auth/login"
      c.invalidate(
        'spec-overlap-conflict',
        actor,
        message,
        [{ type: 'proposal', files: ['proposal'] }],
        dagFor(c),
      )

      const evt = c.history.find((e) => e.type === 'invalidated')
      expect(evt?.type === 'invalidated' && evt.cause).toBe('spec-overlap-conflict')
      expect(evt?.type === 'invalidated' && evt.message).toBe(message)
      expect(c.state).toBe('implementing')
    })
  })

  describe('invalidationPolicy', () => {
    it('defaults to downstream', () => {
      const c = makeChange()
      expect(c.invalidationPolicy).toEqual({ artifacts: 'downstream', workflow: 'preserve' })
    })

    it('accepts an explicit policy via constructor', () => {
      const c = new Change({
        name: 'test',
        createdAt: new Date('2024-01-15'),
        specIds: [],
        history: [
          {
            type: 'created',
            at: new Date('2024-01-15'),
            by: actor,
            specIds: [],
            schemaName: '@specd/schema-std',
            schemaVersion: 1,
          },
        ],
        artifacts: new Map(),
        invalidationPolicy: 'surgical',
      })
      expect(c.invalidationPolicy).toEqual({ artifacts: 'surgical', workflow: 'redesign' })
    })

    function makeChangeWithChain(): Change {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      const proposal = new ChangeArtifact({
        type: 'proposal',
        requires: [],
        files: new Map([
          ['proposal', new ArtifactFile({ key: 'proposal', filename: 'proposal.md' })],
        ]),
      })
      proposal.markComplete('proposal', 'sha256:p')
      const design = new ChangeArtifact({
        type: 'design',
        requires: ['proposal'],
        files: new Map([['design', new ArtifactFile({ key: 'design', filename: 'design.md' })]]),
      })
      design.markComplete('design', 'sha256:d')
      const tasks = new ChangeArtifact({
        type: 'tasks',
        requires: ['design'],
        files: new Map([['tasks', new ArtifactFile({ key: 'tasks', filename: 'tasks.md' })]]),
      })
      tasks.markComplete('tasks', 'sha256:t')
      c.setArtifact(proposal)
      c.setArtifact(design)
      c.setArtifact(tasks)
      return c
    }

    it('policy none does not reopen any artifacts but sets hasDrift', () => {
      const c = makeChangeWithChain()
      const result = c.invalidate(
        'artifact-drift',
        actor,
        'drift',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
        'none',
      )
      expect(c.state).toBe('implementing')
      expect(c.getArtifact('proposal')?.status).toBe('complete')
      expect(c.getArtifact('design')?.status).toBe('complete')
      expect(c.getArtifact('tasks')?.status).toBe('complete')
      expect(c.getArtifact('design')?.getFile('design')?.hasDrift).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ type: 'design', files: ['design'] })
    })

    it('policy surgical reopens only targeted files', () => {
      const c = makeChangeWithChain()
      const result = c.invalidate(
        'artifact-drift',
        actor,
        'drift',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
        'surgical',
      )
      expect(c.state).toBe('implementing')
      expect(c.getArtifact('proposal')?.status).toBe('complete')
      expect(c.getArtifact('design')?.status).toBe('drifted-pending-review')
      expect(c.getArtifact('design')?.getFile('design')?.hasDrift).toBe(true)
      expect(c.getArtifact('tasks')?.status).toBe('complete')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ type: 'design', files: ['design'] })
    })

    it('policy global reopens all artifacts', () => {
      const c = makeChangeWithChain()
      const result = c.invalidate(
        'artifact-drift',
        actor,
        'drift',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
        'global',
      )
      expect(c.state).toBe('implementing')
      expect(c.getArtifact('proposal')?.status).toBe('pending-review')
      expect(c.getArtifact('design')?.status).toBe('drifted-pending-review')
      expect(c.getArtifact('design')?.getFile('design')?.hasDrift).toBe(true)
      expect(c.getArtifact('tasks')?.status).toBe('pending-review')
      expect(result).toHaveLength(3)
      const types = result.map((e) => e.type).sort()
      expect(types).toEqual(['design', 'proposal', 'tasks'])
    })

    it('policy downstream reopens targets and DAG descendants', () => {
      const c = makeChangeWithChain()
      const result = c.invalidate(
        'artifact-drift',
        actor,
        'drift',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
        'downstream',
      )
      expect(c.state).toBe('implementing')
      expect(c.getArtifact('proposal')?.status).toBe('complete')
      expect(c.getArtifact('design')?.status).toBe('drifted-pending-review')
      expect(c.getArtifact('design')?.getFile('design')?.hasDrift).toBe(true)
      expect(c.getArtifact('tasks')?.status).toBe('pending-review')
      expect(result).toHaveLength(2)
      const types = result.map((e) => e.type).sort()
      expect(types).toEqual(['design', 'tasks'])
    })

    it('respects stored policy when no override is passed', () => {
      const c = makeChangeWithChain()
      c.invalidationPolicy = 'surgical'
      c.invalidate(
        'artifact-drift',
        actor,
        'drift',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
      )
      expect(c.getArtifact('tasks')?.status).toBe('complete')
      expect(c.getArtifact('design')?.status).toBe('drifted-pending-review')
    })

    it('cause other than artifact-drift does not set hasDrift', () => {
      const c = makeChangeWithChain()
      c.invalidate(
        'artifact-review-required',
        actor,
        'manual review',
        [{ type: 'design', files: ['design'] }],
        dagFor(c),
        'surgical',
      )
      expect(c.getArtifact('design')?.getFile('design')?.hasDrift).toBe(false)
      expect(c.getArtifact('design')?.status).toBe('pending-review')
    })
  })

  describe('recordSpecApproval', () => {
    it('appends spec-approved event', () => {
      const c = makeChange()
      c.recordSpecApproval('LGTM', approvalFingerprint(c, { proposal: 'sha256:abc' }), actor)
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
      c.recordSpecApproval('LGTM', approvalFingerprint(c), actor)
      expect(c.activeSpecApproval).toBeDefined()
      expect(c.activeSpecApproval?.reason).toBe('LGTM')
    })

    it('returns undefined after invalidation supersedes approval', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.recordSpecApproval('LGTM', approvalFingerprint(c), actor)
      c.invalidate('spec-change', actor, allArtifactsMessage, allArtifacts(c), dagFor(c))
      expect(c.activeSpecApproval).toBeUndefined()
    })

    it('returns new approval after re-approval following invalidation', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.recordSpecApproval('First approval', approvalFingerprint(c), actor)
      c.invalidate('spec-change', actor, allArtifactsMessage, allArtifacts(c), dagFor(c))
      c.recordSpecApproval('Second approval', approvalFingerprint(c), otherActor)
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
      c.invalidate(
        'artifact-review-required',
        actor,
        allArtifactsMessage,
        allArtifacts(c),
        dagFor(c),
      )
      expect(c.activeSignoff).toBeUndefined()
    })

    it('returns undefined after invalidateSignoff without clearing spec approval', () => {
      const c = makeChange()
      c.recordSpecApproval('LGTM', approvalFingerprint(c), actor)
      c.recordSignoff('Ship it', {}, actor)
      c.invalidateSignoff(actor)
      expect(c.activeSignoff).toBeUndefined()
      expect(c.activeSpecApproval).toBeDefined()
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
      const evt = c.history[c.history.length - 1]!
      expect(evt?.type).toBe('restored')
      if (evt?.type === 'restored') expect(evt.by).toBe(otherActor)
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

  describe('hasEverReachedImplementing', () => {
    it('returns false when no transitioned events exist', () => {
      const c = makeChange()
      expect(c.hasEverReachedImplementing).toBe(false)
    })

    it('returns false when transitioned events exist but none to implementing', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      expect(c.hasEverReachedImplementing).toBe(false)
    })

    it('returns true when a transitioned event has to: implementing', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      expect(c.hasEverReachedImplementing).toBe(true)
    })

    it('returns true after implementing then returning to designing', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('implementing', actor)
      c.transition('designing', actor)
      expect(c.hasEverReachedImplementing).toBe(true)
    })
  })

  describe('draft() with historical implementation guard', () => {
    it('throws HistoricalImplementationGuardError when change has reached implementing and force is not passed', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      expect(() => c.draft(actor)).toThrow(HistoricalImplementationGuardError)
    })

    it('throws HistoricalImplementationGuardError when change has reached implementing and force is false', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      expect(() => c.draft(actor, undefined, false)).toThrow(HistoricalImplementationGuardError)
    })

    it('appends drafted event when change has reached implementing and force is true', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.draft(actor, 'intentional rollback of workflow only', true)
      expect(c.isDrafted).toBe(true)
      const drafted = c.history.find((e) => e.type === 'drafted')
      expect(drafted).toBeDefined()
    })

    it('appends drafted event when change has never reached implementing without force', () => {
      const c = makeChange()
      c.draft(actor)
      expect(c.isDrafted).toBe(true)
    })

    it('includes the change name in HistoricalImplementationGuardError', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      try {
        c.draft(actor)
        expect.unreachable('Expected HistoricalImplementationGuardError')
      } catch (err) {
        expect(err).toBeInstanceOf(HistoricalImplementationGuardError)
        if (err instanceof HistoricalImplementationGuardError) {
          expect(err.operation).toBe('draft')
          expect(err.changeName).toBe('add-oauth-login')
        }
      }
    })
  })

  describe('discard() with historical implementation guard', () => {
    it('throws HistoricalImplementationGuardError when change has reached implementing and force is not passed', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      expect(() => c.discard('cleanup', actor)).toThrow(HistoricalImplementationGuardError)
    })

    it('throws HistoricalImplementationGuardError when change has reached implementing and force is false', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      expect(() => c.discard('cleanup', actor, undefined, false)).toThrow(
        HistoricalImplementationGuardError,
      )
    })

    it('appends discarded event when change has reached implementing and force is true', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.discard('workflow cleanup', actor, undefined, true)
      const discarded = c.history.find((e) => e.type === 'discarded')
      expect(discarded).toBeDefined()
    })

    it('appends discarded event when change has never reached implementing without force', () => {
      const c = makeChange()
      c.discard('no longer needed', actor)
      const discarded = c.history.find((e) => e.type === 'discarded')
      expect(discarded).toBeDefined()
    })

    it('includes the change name and operation in HistoricalImplementationGuardError', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      try {
        c.discard('cleanup', actor)
        expect.unreachable('Expected HistoricalImplementationGuardError')
      } catch (err) {
        expect(err).toBeInstanceOf(HistoricalImplementationGuardError)
        if (err instanceof HistoricalImplementationGuardError) {
          expect(err.operation).toBe('discard')
          expect(err.changeName).toBe('add-oauth-login')
        }
      }
    })
  })

  describe('updateSpecIds', () => {
    it('updates specIds, derives workspaces, and invalidates', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.updateSpecIds(['billing:invoices/create', 'auth/register'], actor, dagFor(c))
      expect(c.specIds).toEqual(['billing:invoices/create', 'auth/register'])
      expect(c.workspaces).toContain('billing')
      expect(c.workspaces).toContain('default')
      expect(c.state).toBe('designing')
      const invalidated = c.history.find((e) => e.type === 'invalidated')
      expect(invalidated?.type === 'invalidated' && invalidated.cause).toBe('spec-change')
    })

    it('deduplicates specIds', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.updateSpecIds(['auth/login', 'auth/login', 'billing:invoices'], actor, dagFor(c))
      expect(c.specIds).toEqual(['auth/login', 'billing:invoices'])
    })
  })

  describe('isArchivable', () => {
    it('returns true in archivable and archiving states', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(c.isArchivable).toBe(true)
      c.transition('archiving', actor)
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
    it('does not throw when in archivable or archiving state', () => {
      const c = makeChange()
      c.transition('designing', actor)
      c.transition('ready', actor)
      c.transition('implementing', actor)
      c.transition('verifying', actor)
      c.transition('done', actor)
      c.transition('archivable', actor)
      expect(() => c.assertArchivable()).not.toThrow()
      c.transition('archiving', actor)
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

  describe('syncArtifacts', () => {
    function makeSpecsArtifactType(): ArtifactType {
      return new ArtifactType({
        id: 'specs',
        scope: 'spec',
        output: 'specs/**/spec.md',
        delta: true,
        requires: [],
        validations: [],
        deltaValidations: [],
        preHashCleanup: [],
      })
    }

    it('preserves validated tracked filenames across representation-class changes', () => {
      const c = new Change({
        name: 'sync-artifacts',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['default:auth/login', 'default:auth/register'],
        history: [],
        artifacts: new Map([
          [
            'specs',
            new ChangeArtifact({
              type: 'specs',
              files: new Map([
                [
                  'default:auth/login',
                  new ArtifactFile({
                    key: 'default:auth/login',
                    filename: 'specs/default/auth/login/spec.md',
                    status: 'complete',
                    validatedHash: 'sha256:abc',
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const changed = c.syncArtifacts(
        [makeSpecsArtifactType()],
        new Map([
          ['default:auth/login', true],
          ['default:auth/register', false],
        ]),
      )

      expect(changed).toBe(true)
      const artifact = c.getArtifact('specs')
      expect(artifact).not.toBeNull()
      const existing = artifact?.getFile('default:auth/login')
      expect(existing?.filename).toBe('specs/default/auth/login/spec.md')
      expect(existing?.status).toBe('complete')
      expect(existing?.validatedHash).toBe('sha256:abc')
      expect(artifact?.getFile('default:auth/register')?.filename).toBe(
        'specs/default/auth/register/spec.md',
      )
    })

    it('does not rename existing filenames when spec existence data is absent', () => {
      const c = new Change({
        name: 'sync-artifacts-no-existence',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['default:auth/login'],
        history: [],
        artifacts: new Map([
          [
            'specs',
            new ChangeArtifact({
              type: 'specs',
              files: new Map([
                [
                  'default:auth/login',
                  new ArtifactFile({
                    key: 'default:auth/login',
                    filename: 'specs/default/auth/login/spec.md',
                    status: 'in-progress',
                  }),
                ],
              ]),
            }),
          ],
        ]),
      })

      const changed = c.syncArtifacts([makeSpecsArtifactType()])

      expect(changed).toBe(false)
      expect(c.getArtifact('specs')?.getFile('default:auth/login')?.filename).toBe(
        'specs/default/auth/login/spec.md',
      )
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

  describe('specDependsOn', () => {
    it('defaults to empty map', () => {
      const c = makeChange()
      expect(c.specDependsOn.size).toBe(0)
    })

    it('initialises from props', () => {
      const c = new Change({
        name: 'test-deps',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        history: [],
        specDependsOn: new Map([['auth/login', ['auth/shared', 'auth/jwt']]]),
      })
      expect([...c.specDependsOn.get('auth/login')!]).toEqual(['auth/shared', 'auth/jwt'])
    })

    it('setSpecDependsOn replaces deps for a spec', () => {
      const c = makeChange()
      c.setSpecDependsOn('auth/login', ['auth/shared'])
      expect([...c.specDependsOn.get('auth/login')!]).toEqual(['auth/shared'])
      c.setSpecDependsOn('auth/login', ['billing/core'])
      expect([...c.specDependsOn.get('auth/login')!]).toEqual(['billing/core'])
    })

    it('removeSpecDependsOn removes entry', () => {
      const c = makeChange()
      c.setSpecDependsOn('auth/login', ['auth/shared'])
      c.removeSpecDependsOn('auth/login')
      expect(c.specDependsOn.has('auth/login')).toBe(false)
    })

    it('does not trigger invalidation', () => {
      const c = makeChange()
      const historyLengthBefore = c.history.length
      c.setSpecDependsOn('auth/login', ['auth/shared'])
      expect(c.history.length).toBe(historyLengthBefore)
    })

    it('getter returns a defensive copy', () => {
      const c = makeChange()
      c.setSpecDependsOn('auth/login', ['auth/shared'])
      const deps = c.specDependsOn
      ;(deps as Map<string, readonly string[]>).delete('auth/login')
      expect(c.specDependsOn.has('auth/login')).toBe(true)
    })

    it('updateSpecIds removes orphaned specDependsOn entries', () => {
      const c = new Change({
        name: 'test-orphan',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login', 'auth/session'],
        history: [],
        specDependsOn: new Map([
          ['auth/login', ['auth/shared']],
          ['auth/session', ['auth/jwt']],
        ]),
      })
      c.updateSpecIds(['auth/login'], actor, dagFor(c))
      expect(c.specDependsOn.has('auth/session')).toBe(false)
      expect([...c.specDependsOn.get('auth/login')!]).toEqual(['auth/shared'])
    })

    it('updateSpecIds clears all specDependsOn when all specs with deps are removed', () => {
      const c = new Change({
        name: 'test-clear',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        history: [],
        specDependsOn: new Map([['auth/login', ['auth/shared']]]),
      })
      c.updateSpecIds(['billing/core'], actor, dagFor(c))
      expect(c.specDependsOn.size).toBe(0)
    })

    it('updateSpecIds preserves specDependsOn when no orphans', () => {
      const c = new Change({
        name: 'test-preserve',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login', 'auth/session'],
        history: [],
        specDependsOn: new Map([['auth/login', ['auth/shared']]]),
      })
      c.updateSpecIds(['auth/login', 'auth/session'], actor, dagFor(c))
      expect(c.specDependsOn.size).toBe(1)
      expect([...c.specDependsOn.get('auth/login')!]).toEqual(['auth/shared'])
    })
  })

  describe('updatedAt', () => {
    it('defaults updatedAt to createdAt when omitted', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const c = makeChange()
      expect(c.updatedAt).toEqual(createdAt)
    })

    it('throws InvalidChangeError when updatedAt is before createdAt', () => {
      expect(
        () =>
          new Change({
            name: 'add-oauth-login',
            createdAt: new Date('2024-01-02T00:00:00Z'),
            updatedAt: new Date('2024-01-01T00:00:00Z'),
            specIds: ['auth/login'],
            history: [],
          }),
      ).toThrow(InvalidChangeError)
    })

    it('touchUpdatedAt without arguments advances updatedAt to a later timestamp', () => {
      const c = makeChange()
      const before = c.updatedAt.getTime()
      c.touchUpdatedAt()
      expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    })

    it('touchUpdatedAt with explicit date sets updatedAt', () => {
      const c = makeChange()
      const explicit = new Date('2024-06-01T12:00:00Z')
      c.touchUpdatedAt(explicit)
      expect(c.updatedAt).toEqual(explicit)
    })

    it('touchUpdatedAt throws when explicit date is before createdAt', () => {
      const c = makeChange()
      expect(() => c.touchUpdatedAt(new Date('2023-12-31T00:00:00Z'))).toThrow(InvalidChangeError)
    })
  })

  describe('implementation tracking activation', () => {
    it('initializes as inactive when no timestamp or implementing history exists', () => {
      const c = makeChange()
      expect(c.isImplementationTrackingActive).toBe(false)
      expect(c.implementationTrackingStartedAt).toBeNull()
    })

    it('startImplementationTracking activates tracking with provided timestamp', () => {
      const c = makeChange()
      const start = new Date('2024-05-01T12:00:00Z')
      c.startImplementationTracking(start)
      expect(c.isImplementationTrackingActive).toBe(true)
      expect(c.implementationTrackingStartedAt).toEqual(start)
    })

    it('startImplementationTracking is idempotent and preserves initial timestamp', () => {
      const c = makeChange()
      const first = new Date('2024-05-01T12:00:00Z')
      const second = new Date('2024-05-02T12:00:00Z')
      c.startImplementationTracking(first)
      c.startImplementationTracking(second)
      expect(c.isImplementationTrackingActive).toBe(true)
      expect(c.implementationTrackingStartedAt).toEqual(first)
    })

    it('hydrates tracking from legacy historical implementing event when field omitted', () => {
      const histDate = new Date('2024-03-01T10:00:00Z')
      const c = new Change({
        name: 'legacy-change',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        history: [
          { type: 'transitioned', from: 'ready', to: 'implementing', at: histDate, by: actor },
        ],
      })
      expect(c.isImplementationTrackingActive).toBe(true)
      expect(c.implementationTrackingStartedAt).toEqual(histDate)
    })

    it('explicit null in implementationTrackingStartedAt keeps tracking inactive despite historical events', () => {
      const histDate = new Date('2024-03-01T10:00:00Z')
      const c = new Change({
        name: 'explicit-null',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        specIds: ['auth/login'],
        history: [
          { type: 'transitioned', from: 'ready', to: 'implementing', at: histDate, by: actor },
        ],
        implementationTrackingStartedAt: null,
      })
      expect(c.isImplementationTrackingActive).toBe(false)
      expect(c.implementationTrackingStartedAt).toBeNull()
    })
  })

  describe('projections and verification lifecycle', () => {
    const artFp = {
      version: 1 as const,
      algorithm: 'artifact-pre-hash-v1' as const,
      files: {
        'proposal:proposal': 'sha256:p1' as `sha256:${string}`,
      },
    }

    const implFp = {
      version: 1 as const,
      hashAlgorithm: 'sha256' as const,
      textNormalization: 'text-v1' as const,
      binaryNormalization: 'bytes-v1' as const,
      files: {
        'src/index.ts': {
          hash: 'sha256:i1' as `sha256:${string}`,
          content: 'text' as const,
          normalization: 'text-v1' as const,
        },
      },
    }

    const testBaseline = {
      version: 1 as const,
      artifacts: artFp,
      implementation: implFp,
    }

    it('rejects self-transitions', () => {
      const c = makeChange()
      c.transition('designing', actor)
      expect(() => c.transition('designing', actor)).toThrow(InvalidStateTransitionError)
    })

    it('records spec approval and updates activeSpecApproval projection', () => {
      const c = makeChange()
      const at = new Date('2024-01-02T10:00:00Z')
      c.recordSpecApproval('Approval reason', approvalFingerprint(c, artFp), actor, at)

      expect(c.specApproval).toEqual({
        status: 'valid',
        decision: {
          at,
          by: actor,
          reason: 'Approval reason',
        },
        fingerprint: {
          version: 1,
          specIds: ['auth/login'],
          artifacts: artFp,
        },
      })
      expect(c.activeSpecApproval).toBeDefined()
      const lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('spec-approved')
      if (lastEvent.type === 'spec-approved') {
        expect(lastEvent.by).toEqual(actor)
        expect(lastEvent.reason).toBe('Approval reason')
      }
    })

    it('records signoff and updates activeSignoff projection', () => {
      const c = makeChange()
      const at = new Date('2024-01-02T11:00:00Z')
      const signoffFp = {
        version: 1 as const,
        artifacts: artFp,
        implementation: implFp,
      }
      c.recordSignoff('Signoff reason', signoffFp, 'verification-1', actor, at)

      expect(c.signoff).toEqual({
        status: 'valid',
        decision: {
          at,
          by: actor,
          reason: 'Signoff reason',
        },
        fingerprint: signoffFp,
        verificationId: 'verification-1',
      })
      expect(c.activeSignoff).toBeDefined()
      const lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('signed-off')
      if (lastEvent.type === 'signed-off') {
        expect(lastEvent.by).toEqual(actor)
        expect(lastEvent.reason).toBe('Signoff reason')
      }
    })

    it('marks spec approval invalid as stale and appends approval-invalidated event', () => {
      const c = makeChange()
      const at = new Date('2024-01-02T10:00:00Z')
      c.recordSpecApproval('Initial approval', approvalFingerprint(c, artFp), actor, at)

      const invalAt = new Date('2024-01-02T12:00:00Z')
      const inval = {
        at: invalAt,
        by: actor,
        cause: 'artifact-drift' as const,
        reason: 'Specs drifted',
        differences: [],
      }
      const changed = c.markApprovalInvalid('spec', 'stale', inval)
      expect(changed).toBe(true)

      expect(c.specApproval?.status).toBe('stale')
      expect(c.specApproval?.invalidation).toEqual(inval)
      const lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('approval-invalidated')
      if (lastEvent.type === 'approval-invalidated') {
        expect(lastEvent.gate).toBe('spec')
        expect(lastEvent.status).toBe('stale')
        expect(lastEvent.cause).toBe('artifact-drift')
      }

      // Idempotent call should not add another event or change status
      const historyCount = c.history.length
      const changedAgain = c.markApprovalInvalid('spec', 'stale', inval)
      expect(changedAgain).toBe(false)
      expect(c.history.length).toBe(historyCount)
    })

    it('marks signoff invalid as revoked and does not overwrite with stale', () => {
      const c = makeChange()
      c.recordSignoff('Signoff ok', artFp.files, actor, undefined, new Date('2024-01-02T10:00:00Z'))

      c.invalidateSignoff(actor, 'User revoked signoff')
      expect(c.signoff?.status).toBe('revoked')
      expect(c.signoff?.invalidation?.cause).toBe('manual-invalidation')

      const historyCount = c.history.length
      // Once revoked, markApprovalInvalid should not downgrade to stale
      const changed = c.markApprovalInvalid('signoff', 'stale', {
        at: new Date('2024-01-02T12:00:00Z'),
        by: actor,
        cause: 'artifact-drift',
        reason: 'Drift occurred',
        differences: [],
      })
      expect(changed).toBe(false)
      expect(c.signoff?.status).toBe('revoked')
      expect(c.history.length).toBe(historyCount)
    })

    it('manages verification attempts and completion lifecycle', () => {
      const c = makeChange()
      expect(c.verification.completed).toBeUndefined()
      expect(c.verification.activeAttempt).toBeUndefined()

      // 1. Start attempt 1
      const at1 = new Date('2024-01-02T10:00:00Z')
      const { attempt: attempt1, supersededAttemptId: s1 } = c.startVerification(
        testBaseline,
        actor,
        at1,
      )
      expect(attempt1.id).toBe('verification-attempt-1')
      expect(s1).toBeNull()
      expect(c.verification.activeAttempt).toEqual(attempt1)
      let lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('verification-attempt-started')
      if (lastEvent.type === 'verification-attempt-started') {
        expect(lastEvent.attemptId).toBe('verification-attempt-1')
      }

      // 2. Start attempt 2 supersedes attempt 1
      const at2 = new Date('2024-01-02T11:00:00Z')
      const { attempt: attempt2, supersededAttemptId: s2 } = c.startVerification(
        testBaseline,
        actor,
        at2,
      )
      expect(attempt2.id).toBe('verification-attempt-2')
      expect(s2).toBe('verification-attempt-1')
      expect(c.verification.activeAttempt).toEqual(attempt2)
      lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('verification-attempt-started')
      if (lastEvent.type === 'verification-attempt-started') {
        expect(lastEvent.attemptId).toBe('verification-attempt-2')
      }

      // 3. Complete verification with active attempt
      const compAt = new Date('2024-01-02T12:00:00Z')
      const completed = c.completeVerification(actor, compAt)
      expect(completed.id).toBe('verification-2')
      expect(completed.attemptId).toBe('verification-attempt-2')
      expect(completed.status).toBe('valid')
      expect(c.verification.activeAttempt).toBeUndefined()
      expect(c.verification.completed).toBeDefined()
      expect(c.verification.completed?.id).toBe('verification-2')

      lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('verification-completed')
      if (lastEvent.type === 'verification-completed') {
        expect(lastEvent.verificationId).toBe('verification-2')
        expect(lastEvent.attemptId).toBe('verification-attempt-2')
      }

      // 4. Invalidate verification
      const invalAt = new Date('2024-01-02T13:00:00Z')
      const inval = {
        at: invalAt,
        by: actor,
        cause: 'implementation-drift' as const,
        reason: 'Code modified',
        differences: [],
      }
      const invalChanged = c.invalidateVerification(inval)
      expect(invalChanged).toBe(true)
      expect(c.verification.completed?.status).toBe('stale')
      expect(c.verification.completed?.invalidation).toEqual(inval)

      lastEvent = c.history[c.history.length - 1]!
      expect(lastEvent.type).toBe('verification-invalidated')
      if (lastEvent.type === 'verification-invalidated') {
        expect(lastEvent.verificationId).toBe('verification-2')
        expect(lastEvent.reason).toBe('Code modified')
      }

      // 5. Idempotent invalidation
      const count = c.history.length
      const invalChangedAgain = c.invalidateVerification(inval)
      expect(invalChangedAgain).toBe(false)
      expect(c.history.length).toBe(count)
    })
  })
})
