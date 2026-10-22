import { afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../../src/observability/logger.js'
import { Change, type ChangeEvent } from '../../../src/domain/entities/change.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import {
  evaluateLifecycleVerdict,
  isAtOrAfterVerificationBoundary,
  recommendedForwardTarget,
  projectArtifacts,
  findBlockingParent,
  type LifecycleVerdictInput,
} from '../../../src/domain/services/lifecycle-verdict.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import {
  fail,
  pass,
  skip,
  checkMatches,
  type CheckAttempt,
  type CheckId,
  type CheckResult,
  classifyAlong,
} from '../../../src/domain/services/transition-checks.js'
import { VALID_TRANSITIONS } from '../../../src/domain/value-objects/change-state.js'
import { TRANSITION_BINDING_SPECS } from '../../../src/domain/services/check-bindings.js'
import { type Schema } from '../../../src/domain/value-objects/schema.js'
import { run as runProtocolEdge } from '../../../src/domain/checks/protocol-edge.js'
import { run as runWorkflowRequires } from '../../../src/domain/checks/workflow-requires.js'
import { run as runApprovalSpec } from '../../../src/domain/checks/approval-spec.js'
import { run as runApprovalSignoff } from '../../../src/domain/checks/approval-signoff.js'
import {
  makeArtifactType,
  makeSchema,
  testActor,
  makeWorkflowStep,
} from '../../application/use-cases/helpers.js'

function tableBindingMatches(
  checkId: CheckId,
  attempt: CheckAttempt,
  along: ReturnType<typeof classifyAlong>,
): boolean {
  const spec = TRANSITION_BINDING_SPECS.find((row) => row.id === checkId)
  if (spec === undefined) {
    return false
  }
  if (spec.exceptAlong?.includes(along) === true) {
    return false
  }
  return spec.applicability.some((row) => checkMatches(row, attempt))
}

describe('recommendedForwardTarget', () => {
  const approvals = { spec: false, signoff: false } as const
  const optionalImplementing = makeSchema({
    workflow: [
      makeWorkflowStep('ready'),
      makeWorkflowStep('implementing', { optional: true }),
      makeWorkflowStep('verifying'),
      makeWorkflowStep('done'),
    ],
  })

  it('returns the immediate mandatory successor', () => {
    expect(recommendedForwardTarget('designing', ['ready'], optionalImplementing, approvals)).toBe(
      'ready',
    )
  })

  it('recommends the checked shortcut while retaining explicit optional entry', () => {
    expect(
      recommendedForwardTarget(
        'ready',
        ['implementing', 'verifying'],
        optionalImplementing,
        approvals,
      ),
    ).toBe('verifying')
  })

  it('falls back to entering the optional step when its shortcut is unavailable', () => {
    expect(
      recommendedForwardTarget('ready', ['implementing'], optionalImplementing, approvals),
    ).toBe('implementing')
  })

  it('treats an empty effective skip-check set as an available unconditional bypass', () => {
    expect(
      recommendedForwardTarget(
        'ready',
        ['implementing', 'verifying'],
        optionalImplementing,
        approvals,
      ),
    ).toBe('verifying')
  })

  it('selects the furthest target after consecutive optional steps', () => {
    const schema = makeSchema({
      workflow: [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying', { optional: true }),
        makeWorkflowStep('done'),
      ],
    })
    expect(
      recommendedForwardTarget('ready', ['implementing', 'verifying', 'done'], schema, approvals),
    ).toBe('done')
  })
})

function implStateFail(id: 'impl.filesResolved' | 'impl.linksInScope'): CheckResult {
  return {
    id,
    label:
      id === 'impl.filesResolved'
        ? 'Checking open implementation files'
        : 'Checking implementation links',
    kind: 'predicate',
    outcome: 'fail',
    code: 'IMPLEMENTATION_STATE',
    message: id === 'impl.filesResolved' ? '1 open tracked file remain open: a.ts' : 'out of scope',
  }
}

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
    schemaName: '@specd/schema-std',
    schemaVersion: 1,
    history: [created],
  })
}

function domainChecksByTarget(
  change: Change,
  schema: Schema,
  approvals: { readonly spec: boolean; readonly signoff: boolean } = {
    spec: false,
    signoff: false,
  },
): Partial<
  Record<(typeof VALID_TRANSITIONS)[keyof typeof VALID_TRANSITIONS][number], readonly CheckResult[]>
> {
  const artifacts = projectArtifacts(change, schema)
  const effectiveStatusByArtifact = new Map(
    artifacts.map((artifact) => [artifact.type, artifact.effectiveStatus]),
  )
  const checksByTarget: Partial<
    Record<
      (typeof VALID_TRANSITIONS)[keyof typeof VALID_TRANSITIONS][number],
      readonly CheckResult[]
    >
  > = {}
  for (const target of VALID_TRANSITIONS[change.state]) {
    const along = classifyAlong(change.state, target, schema, approvals)
    const protocol = runProtocolEdge({ from: change.state, to: target })
    const requires =
      along === 'recovery'
        ? skip('workflow.requires')
        : runWorkflowRequires({
            schema,
            target,
            effectiveStatusByArtifact,
          })
    const checks: CheckResult[] = [protocol, requires]
    const attempt = {
      scope: 'transition' as const,
      from: change.state,
      to: target,
      along,
    }
    if (tableBindingMatches('approval.spec', attempt, along)) {
      checks.push(runApprovalSpec({ specGateEnabled: approvals.spec, change }))
    }
    if (tableBindingMatches('approval.signoff', attempt, along)) {
      checks.push(runApprovalSignoff({ signoffGateEnabled: approvals.signoff, change }))
    }
    checksByTarget[target] = checks
  }
  return checksByTarget
}

function evaluate(change: Change, schema: Schema, options: Partial<LifecycleVerdictInput> = {}) {
  const approvals = options.approvals ?? { spec: false, signoff: false }
  return evaluateLifecycle(change, schema, {
    approvals,
    ...options,
    checksByTarget: {
      ...domainChecksByTarget(change, schema, approvals),
      ...(options.checksByTarget ?? {}),
    },
  })
}

describe('evaluateLifecycleVerdict', () => {
  it('given a domain verdict, when projected, then nextHop has no command', () => {
    const change = makeChange()
    const domain = evaluateLifecycleVerdict(change, makeSchema(), { checksByTarget: {} })
    expect(domain.nextHop).not.toHaveProperty('command')
  })

  it('given workflow.requires check results, when projecting availableSteps, then blockingArtifacts follow check details', () => {
    const change = makeChange()
    change.setArtifact(makeArtifact('proposal', 'in-progress'))
    change.setArtifact(makeArtifact('specs', 'in-progress'))
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('specs', { requires: ['proposal'] }),
      ],
      workflow: [makeWorkflowStep('designing', { requires: ['proposal', 'specs'] })],
    })
    const domain = evaluateLifecycleVerdict(change, schema, {
      checksByTarget: {
        designing: [
          fail(
            'workflow.requires',
            'INCOMPLETE_ARTIFACT',
            'Required artifact specs is in-progress',
            {
              artifactId: 'specs',
            },
          ),
        ],
      },
    })
    expect(
      domain.availableSteps.find((step) => step.step === 'designing')?.blockingArtifacts,
    ).toEqual(['specs'])
    expect(domain.transitionBlockers).toEqual([
      { transition: 'designing', reason: 'requires', blocking: ['specs'] },
    ])
  })

  it('given mixed review and incomplete parents, when projecting, then parent-review wins', () => {
    const change = makeChange()
    change.setArtifact(makeArtifact('proposal', 'pending-review'))
    change.setArtifact(makeArtifact('specs', 'in-progress'))
    change.setArtifact(makeArtifact('design', 'complete'))
    const schema = makeSchema({
      artifacts: [
        makeArtifactType('proposal'),
        makeArtifactType('specs'),
        makeArtifactType('design', { requires: ['proposal', 'specs'] }),
      ],
    })
    const artifacts = projectArtifacts(change, schema)
    expect(artifacts.find((artifact) => artifact.type === 'design')?.effectiveStatus).toBe(
      'pending-parent-artifact-review',
    )
  })
})

function makeImplementingSchema() {
  return makeSchema({
    artifacts: [
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: {
          incompletePattern: '^\\s*-\\s+\\[ \\]',
          completePattern: '^\\s*-\\s+\\[[xX]\\]',
        },
      }),
    ],
    workflow: [
      {
        step: 'ready',
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      },
      {
        step: 'implementing',
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: [], post: [] },
      },
      {
        step: 'verifying',
        requires: [],
        requiresTaskCompletion: ['tasks'],
        hooks: { pre: [], post: [] },
      },
    ],
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

describe('evaluateLifecycle', () => {
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

    const verdict = evaluate(change, schema)
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

    const verdict = evaluate(change, schema, {})
    expect(verdict.artifacts.find((artifact) => artifact.type === 'verify')?.effectiveStatus).toBe(
      'pending-parent-artifact-review',
    )
    expect(findBlockingParent(change, schema, 'verify')).toEqual({
      artifactId: 'proposal',
      status: 'pending-review',
    })
  })

  it('keeps implementing as effectiveTarget when spec approval is required', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)

    const schema = makeSchema({
      workflow: [
        {
          step: 'ready',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
        {
          step: 'implementing',
          requires: [],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    const verdict = evaluate(change, schema, {
      requestedTarget: 'implementing',
      approvals: { spec: true, signoff: false },
    })

    expect(verdict.effectiveTarget).toBe('implementing')
    expect(verdict.availableTransitions).not.toContain('implementing')
    expect(verdict.blockers.some((blocker) => blocker.code === 'APPROVAL_REQUIRED')).toBe(true)
    expect(verdict.checks).toEqual(verdict.checksByTarget.implementing)
    expect(
      verdict.checksByTarget.implementing?.some(
        (check) => check.id === 'approval.spec' && check.outcome === 'fail',
      ),
    ).toBe(true)
    expect(verdict.nextAction.command).toBe('specd changes approve spec')
    expect(verdict.nextAction.targetStep).toBe('ready')
  })

  it('given designing with spec gate on, when evaluate runs, then nextAction is not spec approve', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    const verdict = evaluate(change, makeSchema(), {
      approvals: { spec: true, signoff: false },
    })
    expect(verdict.nextAction.command).toBe('/specd-design')
    expect(verdict.nextAction.command).not.toBe('specd changes approve spec')
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

    const verdict = evaluate(change, schema)
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

    const debug = vi.spyOn(Logger, 'debug')
    evaluateLifecycleVerdict(change, schema, {
      requestedTarget: 'implementing',
      approvals: { spec: false, signoff: false },
      checksByTarget: domainChecksByTarget(change, schema),
    })

    expect(debug).toHaveBeenCalled()
    debug.mockRestore()
  })

  it('does not project OVERLAP_CONFLICT from review invalidation overlap', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'my-change',
      createdAt,
      specIds: ['default:auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
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
    const verdict = evaluate(change, schema, {
      requestedTarget: 'designing',
      approvals: { spec: false, signoff: false },
    })

    expect(verdict.review.reason).toBe('spec-overlap-conflict')
    expect(verdict.review.message).toBe('Conflict detected with archived overlapping specs')
    expect(verdict.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
    expect(verdict.nextHop.targetStep).toBe('designing')
    expect(verdict.nextAction.targetStep).toBe('designing')
    expect(verdict.nextAction.command).toBe('/specd-design')
  })

  it('does not treat CLI-only aliases allow-overlap or allow-out-of-scope as domain bypass flags', () => {
    const change = makeChange()
    const overlapFail: CheckResult = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      outcome: 'fail',
      code: 'OVERLAP_CONFLICT',
      message: 'overlap',
    }
    const schema = makeSchema()

    const withAlias = evaluate(change, schema, {
      requestedTarget: 'designing',
      bypassFlags: [
        'allow-overlap',
        '--allow-overlap',
        'allow-out-of-scope',
        '--allow-out-of-scope',
      ],
      checksByTarget: { designing: [overlapFail] },
    })
    expect(withAlias.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(true)
  })

  it('omits skippable OVERLAP_CONFLICT when the canonical spec.overlap bypass is supplied', () => {
    const change = makeChange()
    const overlapFail: CheckResult = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      outcome: 'fail',
      code: 'OVERLAP_CONFLICT',
      message: 'overlap',
    }
    const schema = makeSchema({ workflow: [makeWorkflowStep('designing')] })
    const bypassed = evaluate(change, schema, {
      requestedTarget: 'designing',
      bypassFlags: ['spec.overlap'],
      checksByTarget: { designing: [overlapFail] },
    })
    expect(bypassed.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(false)
    expect('warnings' in bypassed).toBe(false)
    expect(bypassed.availableSteps.find((step) => step.step === 'designing')?.isPermitted).toBe(
      true,
    )

    const fullFlagBypassed = evaluate(change, schema, {
      requestedTarget: 'designing',
      bypassFlags: ['--skip-checks spec.overlap'],
      checksByTarget: { designing: [overlapFail] },
    })
    expect(fullFlagBypassed.blockers.some((blocker) => blocker.code === 'OVERLAP_CONFLICT')).toBe(
      false,
    )
    expect('warnings' in fullFlagBypassed).toBe(false)
    expect(
      fullFlagBypassed.availableSteps.find((step) => step.step === 'designing')?.isPermitted,
    ).toBe(true)
  })

  it('projects non-skippable OVERLAP_CONFLICT without bypassFlag when schema sets skippable: false', () => {
    const change = makeChange()
    const overlapFail: CheckResult = {
      id: 'spec.overlap',
      label: 'Checking spec overlap',
      kind: 'predicate',
      outcome: 'fail',
      code: 'OVERLAP_CONFLICT',
      message: 'overlap',
    }
    const hardenedSchema = makeSchema({
      workflow: [
        makeWorkflowStep('designing'),
        makeWorkflowStep('ready'),
        makeWorkflowStep('archiving', {
          archiveChecks: [{ id: 'spec.overlap', skippable: false }],
        }),
      ],
    })
    const verdict = evaluate(change, hardenedSchema, {
      requestedTarget: 'designing',
      bypassFlags: ['spec.overlap', '--skip-checks spec.overlap'],
      checksByTarget: { designing: [overlapFail] },
    })
    const overlapBlocker = verdict.blockers.find((blocker) => blocker.code === 'OVERLAP_CONFLICT')
    expect(overlapBlocker).toBeDefined()
    expect(overlapBlocker?.isSkippable).toBe(false)
    expect(overlapBlocker?.bypassFlag).toBeUndefined()
  })

  it('projects skippability for custom plugin checks from bindingsByTarget and archiveBindings', () => {
    const change = makeChange()
    const pluginCheckFail: CheckResult = {
      id: '@sec.scan',
      label: 'Scanning security',
      kind: 'predicate',
      outcome: 'fail',
      code: 'SECURITY_FINDINGS',
      message: 'findings detected',
    }
    const schema = makeSchema({
      workflow: [makeWorkflowStep('designing'), makeWorkflowStep('ready')],
    })
    const verdict = evaluate(change, schema, {
      checksByTarget: { ready: [pluginCheckFail] },
      bindingsByTarget: {
        ready: [
          {
            check: {
              id: '@sec.scan',
              label: 'Scanning security',
              kind: 'predicate',
              execute: async () => pluginCheckFail,
            },
            applicability: [{ scope: 'transition', from: '*', to: 'ready', along: '*' }],
            skippable: true,
            allowBindingOverride: true,
            allowConfigOverride: true,
          },
        ],
      },
    })
    const blocker = verdict.blockers.find((b) => b.code === 'SECURITY_FINDINGS')
    expect(blocker).toBeDefined()
    expect(blocker?.isSkippable).toBe(true)
    expect(blocker?.bypassFlag).toBe('--skip-checks @sec.scan')
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

    const verdict = evaluate(change, schema)
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

    const verdict = evaluate(change, schema)
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

    const verdict = evaluate(change, schema)
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
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
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

    const verdict = evaluate(change, makeSchema())
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
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
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

    const verdict = evaluate(change, makeSchema())
    expect(verdict.nextAction.targetStep).toBe('designing')
    expect(verdict.nextAction.command).toBe('/specd-design')
  })

  it('hides verifying from availableTransitions when gated tasks are incomplete', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.setArtifact(makeArtifact('tasks', 'complete'))

    const verdict = evaluate(change, makeImplementingSchema(), {
      checksByTarget: {
        verifying: [
          fail(
            'workflow.taskCompletion',
            'INCOMPLETE_TASKS',
            "Artifact 'tasks' has 2 incomplete tasks",
          ),
        ],
      },
    })

    expect(verdict.validTransitions).toContain('verifying')
    expect(verdict.availableTransitions).not.toContain('verifying')
    expect(verdict.nextAction.command).toBe('/specd-implement')
    expect(verdict.nextAction.targetStep).toBe('implementing')
  })

  it('includes verifying and recommends /specd-verify when gated tasks are complete', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.setArtifact(makeArtifact('tasks', 'complete'))

    const verdict = evaluate(change, makeImplementingSchema(), {
      checksByTarget: {
        verifying: [pass('workflow.taskCompletion')],
      },
    })

    expect(verdict.availableTransitions).toContain('verifying')
    expect(verdict.nextAction.command).toBe('/specd-verify')
    expect(verdict.nextAction.targetStep).toBe('verifying')
  })

  it('given designing with ready available, when evaluate runs, then nextAction targets ready with /specd-design', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.setArtifact(makeArtifact('proposal', 'complete'))

    const schema = makeSchema({
      artifacts: [makeArtifactType('proposal')],
      workflow: [
        {
          step: 'ready',
          requires: ['proposal'],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    const verdict = evaluate(change, schema)

    expect(verdict.availableTransitions).toContain('ready')
    expect(verdict.nextAction.targetStep).toBe('ready')
    expect(verdict.nextAction.command).toBe('/specd-design')
  })

  it('given designing with incomplete design artifacts, when evaluate runs, then nextAction stays designing', () => {
    const change = makeChange()
    change.transition('designing', testActor)

    const schema = makeSchema({
      artifacts: [makeArtifactType('proposal')],
      workflow: [
        {
          step: 'ready',
          requires: ['proposal'],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    const verdict = evaluate(change, schema)

    expect(verdict.availableTransitions).not.toContain('ready')
    expect(verdict.nextAction.targetStep).toBe('designing')
    expect(verdict.nextAction.command).toBe('/specd-design')
  })

  it('given verifying with done available, when evaluate runs, then nextAction targets done with /specd-verify', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)

    const verdict = evaluate(change, makeSchema())

    expect(verdict.availableTransitions).toContain('done')
    expect(verdict.nextAction.targetStep).toBe('done')
    expect(verdict.nextAction.command).toBe('/specd-verify')
  })

  it('given archivable, when evaluate runs, then nextAction targets archiving with /specd-archive', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)
    change.transition('archivable', testActor)

    const verdict = evaluate(change, makeSchema())

    expect(verdict.nextAction.targetStep).toBe('archiving')
    expect(verdict.nextAction.command).toBe('/specd-archive')
  })

  it('given archivable with archiving blocked, when evaluate runs, then nextAction stays archivable', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)
    change.transition('archivable', testActor)

    const verdict = evaluate(change, makeSchema(), {
      checksByTarget: {
        archiving: [fail('protocol.edge', 'INVALID_TRANSITION', 'blocked')],
      },
    })

    expect(verdict.nextAction.targetStep).toBe('archivable')
    expect(verdict.nextAction.reason).toBe('Remaining blockers prevent archive')
    expect(verdict.nextAction.command).toBe('/specd-archive')
  })

  it('given failed impl.filesResolved, when blockers are projected, then bypassFlag is absent', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)

    const verdict = evaluate(change, makeImplementingSchema(), {
      requestedTarget: 'verifying',
      checksByTarget: {
        verifying: [implStateFail('impl.filesResolved')],
        designing: [
          {
            id: 'protocol.edge',
            label: 'Validating transition edge',
            kind: 'predicate',
            outcome: 'pass',
          },
        ],
      },
    })

    const blocker = verdict.blockers.find((entry) => entry.code === 'IMPLEMENTATION_STATE')
    expect(blocker).toBeDefined()
    expect(blocker?.bypassFlag).toBeUndefined()
    expect(blocker?.isSkippable).toBe(false)
    expect(blocker?.checkId).toBe('impl.filesResolved')
  })

  it('given failed impl.linksInScope, when blockers are projected, then bypassFlag is --skip-checks impl.linksInScope', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)

    const verdict = evaluate(change, makeImplementingSchema(), {
      requestedTarget: 'verifying',
      checksByTarget: {
        verifying: [implStateFail('impl.linksInScope')],
        designing: [
          {
            id: 'protocol.edge',
            label: 'Validating transition edge',
            kind: 'predicate',
            outcome: 'pass',
          },
        ],
      },
    })

    const blocker = verdict.blockers.find((entry) => entry.code === 'IMPLEMENTATION_STATE')
    expect(blocker).toBeDefined()
    expect(blocker?.bypassFlag).toBe('--skip-checks impl.linksInScope')
    expect(blocker?.isSkippable).toBe(true)
    expect(blocker?.checkId).toBe('impl.linksInScope')
  })

  it('lists skill hops from done without recommending implement as nextAction', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)

    const verdict = evaluate(change, makeSchema())

    expect(verdict.validTransitions).toEqual(
      expect.arrayContaining(['archivable', 'designing', 'implementing', 'verifying']),
    )
    expect(verdict.availableTransitions).toEqual(
      expect.arrayContaining(['implementing', 'verifying']),
    )
    expect(verdict.nextAction.targetStep).toBe('archivable')
    expect(verdict.nextAction.command).toBe('/specd-archive')
    expect(verdict.nextAction.command).not.toBe('/specd-implement')
  })

  it('given done with archivable blocked, when evaluate runs, then nextAction stays on done', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    change.transition('done', testActor)

    const verdict = evaluate(change, makeSchema(), {
      checksByTarget: {
        archivable: [
          {
            id: 'deps.consistent',
            label: 'Checking spec dependencies',
            kind: 'predicate',
            outcome: 'fail',
            code: 'DEPS_INCONSISTENT',
            message: 'blocked for test',
          },
        ],
        designing: [
          {
            id: 'protocol.edge',
            label: 'Validating transition edge',
            kind: 'predicate',
            outcome: 'pass',
          },
        ],
        implementing: [
          {
            id: 'protocol.edge',
            label: 'Validating transition edge',
            kind: 'predicate',
            outcome: 'pass',
          },
        ],
        verifying: [
          {
            id: 'protocol.edge',
            label: 'Validating transition edge',
            kind: 'predicate',
            outcome: 'pass',
          },
        ],
      },
    })

    expect(verdict.availableTransitions).not.toContain('archivable')
    expect(verdict.nextAction.targetStep).toBe('done')
    expect(verdict.nextAction.command).toBe('/specd-verify')
    expect(verdict.nextAction.reason).toMatch(/archivable/i)
  })

  it('keeps archiving recovery available when archivable requires are incomplete', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const change = new Change({
      name: 'my-change',
      createdAt,
      specIds: ['default:auth/login'],
      schemaName: '@specd/schema-std',
      schemaVersion: 1,
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
      ],
    })

    const schema = makeSchema({
      workflow: [
        {
          step: 'archivable',
          requires: ['proposal'],
          requiresTaskCompletion: [],
          hooks: { pre: [], post: [] },
        },
      ],
    })

    const verdict = evaluate(change, schema)
    expect(verdict.availableTransitions).toContain('archivable')
    expect(
      verdict.checksByTarget.archivable?.some(
        (check) => check.id === 'workflow.requires' && check.outcome === 'skip',
      ),
    ).toBe(true)
  })

  it('projects injected CheckResults without filesystem I/O', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)

    const verdict = evaluate(change, makeImplementingSchema(), {
      checksByTarget: {
        verifying: [
          fail(
            'workflow.taskCompletion',
            'INCOMPLETE_TASKS',
            "Artifact 'tasks' has 1 incomplete tasks",
          ),
        ],
      },
    })

    expect(verdict.availableTransitions).not.toContain('verifying')
    expect(
      verdict.checksByTarget.verifying?.some((check) => check.id === 'workflow.taskCompletion'),
    ).toBe(true)
  })

  it('given workflow omits implementing, when evaluate runs from ready, then availableSteps has no implementing extras row', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    const schema = makeSchema({
      workflow: [makeWorkflowStep('ready'), makeWorkflowStep('verifying')],
    })

    const verdict = evaluate(change, schema)

    expect(verdict.validTransitions).toContain('implementing')
    expect(verdict.availableSteps.map((step) => step.step)).not.toContain('implementing')
  })

  it('given a change in designing with a missing required artifact, when evaluate is called, then it returns INCOMPLETE_ARTIFACT', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    const schema = makeSchema({
      artifacts: [makeArtifactType('proposal')],
      workflow: [makeWorkflowStep('ready', { requires: ['proposal'] })],
    })

    const verdict = evaluate(change, schema, { requestedTarget: 'ready' })

    expect(verdict.blockers.some((blocker) => blocker.code === 'INCOMPLETE_ARTIFACT')).toBe(true)
    expect(verdict.blockers.some((blocker) => blocker.code === 'MISSING_ARTIFACT')).toBe(false)
    const readyStep = verdict.availableSteps.find((step) => step.step === 'ready')
    expect(readyStep?.isReady).toBe(false)
    expect(readyStep?.isPermitted).toBe(true)
  })

  it('given requestedTarget requires fail, when evaluate projects blockers, then it does not dual-write MISSING_ARTIFACT', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    const schema = makeSchema({
      artifacts: [makeArtifactType('proposal')],
      workflow: [makeWorkflowStep('implementing', { requires: ['proposal'] })],
    })

    const verdict = evaluate(change, schema, { requestedTarget: 'implementing' })

    expect(verdict.blockers.some((blocker) => blocker.code === 'INCOMPLETE_ARTIFACT')).toBe(true)
    expect(verdict.blockers.some((blocker) => blocker.code === 'MISSING_ARTIFACT')).toBe(false)
  })
})

describe('canonical validity guidance', () => {
  function validity(
    overrides: Partial<
      import('../../../src/domain/services/change-validity.js').ChangeValidityVerdict
    >,
  ) {
    return {
      artifactReviewRequired: false,
      affectedArtifacts: [],
      projectionChanges: [],
      specApproval: 'not-required' as const,
      signoff: 'not-required' as const,
      verification: 'not-required' as const,
      blockers: [],
      recovery: null,
      ...overrides,
    }
  }

  it('keeps the implementing next action when verification is stale', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    const schema = makeSchema()
    const verdict = evaluateLifecycle(change, schema, {
      checksByTarget: {},
      validity: validity({ verification: 'stale' }),
    })
    expect(verdict.nextHop.targetStep).toBe('implementing')
    expect(verdict.nextAction.command).toBe('/specd-implement')
  })

  it('routes required stale spec approval to design ahead of preserve', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    const schema = makeSchema()
    const verdict = evaluateLifecycle(change, schema, {
      checksByTarget: {},
      validity: validity({
        specApproval: 'stale',
        artifactReviewRequired: true,
        recovery: { cause: 'spec-approval', from: 'implementing', to: 'designing' },
        blockers: [{ code: 'APPROVAL_STALE', message: 'Spec approval is stale' }],
      }),
    })
    expect(verdict.nextHop.targetStep).toBe('designing')
    expect(verdict.nextAction.command).toBe('/specd-design')
    expect(verdict.blockers.map((blocker) => blocker.code)).toContain('APPROVAL_STALE')
  })

  it('blocks the forward hop and renews verification in place', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)
    change.transition('verifying', testActor)
    const schema = makeSchema()
    const verdict = evaluateLifecycle(change, schema, {
      checksByTarget: {
        done: [pass('protocol.edge')],
      },
      validity: validity({
        verification: 'stale',
        artifactReviewRequired: true,
        recovery: null,
        blockers: [{ code: 'VERIFICATION_STALE', message: 'Verification is stale' }],
      }),
    })
    expect(verdict.availableTransitions).not.toContain('done')
    expect(verdict.nextHop.targetStep).toBe('verifying')
    expect(verdict.nextAction.command).toBe('/specd-verify')
  })

  it('preserves failed step-skip check evidence in checksByTarget while keeping shortcut unavailable', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)

    const schema = makeSchema({
      workflow: [
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing', { optional: true }),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    })

    const failedSkipCheck = fail(
      'workflow.tasksEmpty',
      'INCOMPLETE_TASKS',
      'Cannot skip implementing: 2 incomplete tasks',
    )

    const verdict = evaluate(change, schema, {
      checksByTarget: {
        implementing: [pass('protocol.edge')],
        verifying: [pass('protocol.edge'), failedSkipCheck],
      },
    })

    expect(verdict.checksByTarget.verifying).toBeDefined()
    expect(verdict.checksByTarget.verifying).toContain(failedSkipCheck)
    expect(verdict.availableTransitions).not.toContain('verifying')
    expect(verdict.availableTransitions).toContain('implementing')
  })

  it('keeps designing selectable in availableTransitions and availableSteps when advertised even if another nextAction is preferred', () => {
    const change = makeChange()
    change.transition('designing', testActor)
    change.transition('ready', testActor)
    change.transition('implementing', testActor)

    const schema = makeSchema({
      workflow: [
        makeWorkflowStep('designing'),
        makeWorkflowStep('ready'),
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying'),
        makeWorkflowStep('done'),
      ],
    })

    const verdict = evaluate(change, schema, {
      checksByTarget: {
        verifying: [pass('protocol.edge')],
        designing: [pass('protocol.edge')],
      },
    })

    expect(verdict.nextHop.targetStep).toBe('verifying')
    expect(verdict.nextAction.command).not.toBe('/specd-design')

    expect(verdict.availableTransitions).toContain('designing')
    expect(verdict.availableTransitions).toContain('verifying')
    const designingStep = verdict.availableSteps.find((s) => s.step === 'designing')
    expect(designingStep).toBeDefined()
    expect(designingStep?.available).toBe(true)
  })
})

describe('isAtOrAfterVerificationBoundary', () => {
  const approvals = { spec: false, signoff: false }
  const enabled = makeSchema(
    [],
    [makeWorkflowStep('implementing'), makeWorkflowStep('verifying'), makeWorkflowStep('done')],
  )

  it('is false before verifying and true from verifying onward', () => {
    expect(isAtOrAfterVerificationBoundary('implementing', enabled, approvals)).toBe(false)
    expect(isAtOrAfterVerificationBoundary('verifying', enabled, approvals)).toBe(true)
    expect(isAtOrAfterVerificationBoundary('done', enabled, approvals)).toBe(true)
    expect(isAtOrAfterVerificationBoundary('archivable', enabled, approvals)).toBe(true)
    expect(isAtOrAfterVerificationBoundary('archiving', enabled, approvals)).toBe(true)
  })

  it('places drain states after their anchor', () => {
    const gated = { spec: false, signoff: true }
    expect(isAtOrAfterVerificationBoundary('pending-signoff', enabled, gated)).toBe(true)
    expect(isAtOrAfterVerificationBoundary('signed-off', enabled, gated)).toBe(true)
    expect(
      isAtOrAfterVerificationBoundary('spec-approved', enabled, { spec: true, signoff: false }),
    ).toBe(false)
  })

  it('is always false when verifying is disabled', () => {
    const disabled = makeSchema(
      [],
      [
        makeWorkflowStep('implementing'),
        makeWorkflowStep('verifying', { disabled: true }),
        makeWorkflowStep('done'),
      ],
    )
    for (const state of ['verifying', 'done', 'archivable', 'archiving'] as const) {
      expect(isAtOrAfterVerificationBoundary(state, disabled, approvals)).toBe(false)
    }
  })
})
