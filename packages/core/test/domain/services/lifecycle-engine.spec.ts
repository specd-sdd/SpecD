import { afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../../src/application/logger.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { LifecycleEngine } from '../../../src/domain/services/lifecycle-engine.js'
import { makeArtifactType, makeSchema, testActor } from '../../application/use-cases/helpers.js'

function makeChange(): Change {
  const created: ChangeEvent = {
    type: 'created',
    at: new Date('2024-01-01T00:00:00Z'),
    by: testActor,
    specIds: ['default:auth/login'],
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
  }
  return new Change({
    name: 'my-change',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: ['default:auth/login'],
    history: [created],
  })
}

function makeArtifact(type: string, status: ArtifactFile['status'], key = type): ChangeArtifact {
  return new ChangeArtifact({
    type,
    files: new Map([
      [
        key,
        new ArtifactFile({
          key,
          filename: `${type}.md`,
          status,
        }),
      ],
    ]),
  })
}

describe('LifecycleEngine', () => {
  afterEach(() => {
    Logger.resetImplementation()
  })

  it('computes effective status across dependency chains', () => {
    const change = makeChange()
    const proposal = makeArtifact('proposal', 'in-progress')
    const design = makeArtifact('design', 'complete')
    const tasks = makeArtifact('tasks', 'complete')
    change.setArtifact(proposal)
    change.setArtifact(design)
    change.setArtifact(tasks)

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('design', { requires: ['proposal'] }),
        makeArtifactType('tasks', { requires: ['design'] }),
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema)
    expect(verdict.artifacts.find((artifact) => artifact.type === 'tasks')?.effectiveStatus).toBe(
      'in-progress',
    )
  })

  it('downgrades complete artifacts to pending-parent-artifact-review for upstream review blockers', () => {
    const change = makeChange()
    change.setArtifact(makeArtifact('proposal', 'pending-review'))
    change.setArtifact(makeArtifact('specs', 'complete'))
    change.setArtifact(makeArtifact('verify', 'complete'))

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('specs', { requires: ['proposal'] }),
        makeArtifactType('verify', { requires: ['specs'] }),
      ],
    })

    const engine = new LifecycleEngine()
    const verdict = engine.evaluate(change, schema)
    expect(verdict.artifacts.find((artifact) => artifact.type === 'verify')?.effectiveStatus).toBe(
      'pending-parent-artifact-review',
    )
    expect(engine.findBlockingParent(change, schema, 'verify')).toEqual({
      artifactId: 'proposal',
      status: 'pending-review',
    })
  })

  it('routes gated targets through the pending approval step', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)

    const schema = makeSchema({
      workflow: [
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema, {
      requestedTarget: 'implementing',
      approvals: { spec: true, signoff: false },
    })

    expect(verdict.effectiveTarget).toBe('pending-spec-approval')
    expect(verdict.blockers.some((blocker) => blocker.code === 'APPROVAL_REQUIRED')).toBe(true)
  })

  it('treats skipped dependencies as satisfied for next-artifact resolution', () => {
    const change = makeChange()
    const optional = new ChangeArtifact({
      type: 'optional',
      optional: true,
      files: new Map([
        [
          'optional',
          new ArtifactFile({ key: 'optional', filename: 'optional.md', status: 'in-progress' }),
        ],
      ]),
    })
    optional.markSkipped()
    change.setArtifact(optional)
    change.setArtifact(makeArtifact('design', 'in-progress'))

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('optional', { optional: true }),
        makeArtifactType('design', { requires: ['optional'] }),
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema)
    expect(verdict.nextArtifact).toBe('design')
  })

  it('emits debug logs for lifecycle evaluation boundaries', () => {
    const change = makeChange()
    change.setArtifact(makeArtifact('proposal', 'pending-review'))
    change.setArtifact(makeArtifact('specs', 'complete'))

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('specs', { requires: ['proposal'] }),
      ],
    })

    const debug = vi.fn<(message: string, context?: object) => void>()
    new LifecycleEngine(debug).evaluate(change, schema, {
      requestedTarget: 'implementing',
      approvals: { spec: false, signoff: false },
    })

    expect(debug).toHaveBeenCalled()
  })

  it('downgrades overlap blockers when the allow-overlap bypass is active', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'my-change',
      createdAt,
      specIds: ['default:auth/login'],
      history: [
        {
          type: 'created',
          at: createdAt,
          by: testActor,
          specIds: ['default:auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        {
          type: 'invalidated',
          at: new Date('2024-01-02T00:00:00Z'),
          by: testActor,
          cause: 'spec-overlap-conflict',
          message: "Overlaps with archived change 'alpha' on specs: default:auth/login",
          affectedArtifacts: [],
        },
      ],
    })
    change.setArtifact(makeArtifact('proposal', 'pending-review'))

    const schema = makeSchema()
    const withoutBypass = new LifecycleEngine().evaluate(change, schema, {
      requestedTarget: 'designing',
      approvals: { spec: false, signoff: false },
    })
    const withBypass = new LifecycleEngine().evaluate(change, schema, {
      requestedTarget: 'designing',
      approvals: { spec: false, signoff: false },
      bypassFlags: ['allow-overlap'],
    })

    expect(withoutBypass.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(true)
    expect(withBypass.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
  })

  it('treats complete-with-drift as complete for lifecycle interpretation', () => {
    const change = makeChange()
    const driftedFile = new ArtifactFile({
      key: 'proposal',
      filename: 'proposal.md',
      status: 'complete',
      validatedHash: 'sha256:abc',
    })
    driftedFile.markDrifted()
    change.setArtifact(
      new ChangeArtifact({
        type: 'proposal',
        files: new Map([['proposal', driftedFile]]),
      }),
    )
    change.setArtifact(makeArtifact('design', 'complete'))

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('design', { requires: ['proposal'] }),
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema)
    const proposal = verdict.artifacts.find((a) => a.type === 'proposal')
    expect(proposal?.effectiveStatus).toBe('complete')
    expect(proposal?.state).toBe('complete')
    const driftBlockers = verdict.blockers.filter((b) => b.code === 'ARTIFACT_DRIFT')
    expect(driftBlockers).toHaveLength(0)
  })

  it('selects next artifact in topological order, not schema declaration order', () => {
    const change = makeChange()
    change.setArtifact(makeArtifact('proposal', 'complete'))
    change.setArtifact(makeArtifact('design', 'in-progress'))
    change.setArtifact(makeArtifact('specs', 'in-progress'))
    change.setArtifact(makeArtifact('verify', 'in-progress'))

    const schema = makeSchema({
      artifacts: [
        makeArtifactType('design', { requires: ['proposal', 'specs', 'verify'] }),
        makeArtifactType('proposal'),
        makeArtifactType('specs', { requires: ['proposal'] }),
        makeArtifactType('verify', { requires: ['specs'] }),
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema)
    expect(verdict.nextArtifact).toBe('specs')
  })

  it('uses canonical missing state even when hasDrift is true', () => {
    const change = makeChange()
    const missingDriftedFile = new ArtifactFile({
      key: 'proposal',
      filename: 'proposal.md',
      status: 'missing',
    })
    missingDriftedFile.markDrifted()
    change.setArtifact(
      new ChangeArtifact({
        type: 'proposal',
        files: new Map([['proposal', missingDriftedFile]]),
      }),
    )

    const schema = makeSchema({
      artifacts: [makeArtifactType('proposal')],
    })

    const verdict = new LifecycleEngine().evaluate(change, schema)
    const proposal = verdict.artifacts.find((a) => a.type === 'proposal')
    expect(proposal?.state).toBe('missing')
    expect(proposal?.effectiveStatus).toBe('missing')
  })

  it('exposes archiving escape transitions without archivable requires blockers', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'my-change',
      createdAt,
      specIds: ['default:auth/login'],
      history: [
        {
          type: 'created',
          at: createdAt,
          by: testActor,
          specIds: ['default:auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'done', to: 'archivable', at: createdAt, by: testActor },
        { type: 'transitioned', from: 'archivable', to: 'archiving', at: createdAt, by: testActor },
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, makeSchema())
    expect(verdict.validTransitions).toEqual(['archivable', 'designing'])
    expect(verdict.availableTransitions).toContain('archivable')
    expect(verdict.transitionBlockers.some((blocker) => blocker.transition === 'archivable')).toBe(
      false,
    )
  })

  it('recommends designing when archive commit failed and change remains archiving', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'my-change',
      createdAt,
      specIds: ['default:auth/login'],
      history: [
        {
          type: 'created',
          at: createdAt,
          by: testActor,
          specIds: ['default:auth/login'],
          schemaName: '@specd/schema-std',
          schemaVersion: 1,
        },
        { type: 'transitioned', from: 'archivable', to: 'archiving', at: createdAt, by: testActor },
        {
          type: 'archive-failed',
          at: createdAt,
          by: testActor,
          step: 'commit',
          message: 'partial restore',
          commitStarted: true,
        },
      ],
    })

    const verdict = new LifecycleEngine().evaluate(change, makeSchema())
    expect(verdict.nextAction.targetStep).toBe('designing')
    expect(verdict.nextAction.command).toBe('/specd-design')
  })
})
