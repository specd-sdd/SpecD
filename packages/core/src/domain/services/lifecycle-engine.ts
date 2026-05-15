/* eslint-disable jsdoc/require-jsdoc */
import { type Change, type InvalidatedEvent } from '../entities/change.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import {
  type ChangeState,
  VALID_TRANSITIONS,
  isValidTransition,
} from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'

export interface LifecycleEngineOptions {
  readonly requestedTarget?: ChangeState
  readonly approvals?: { readonly spec: boolean; readonly signoff: boolean }
  readonly bypassFlags?: readonly string[]
}

export interface LifecycleAffectedFile {
  readonly key: string
  readonly filename: string
  readonly state: ArtifactStatus
}

export interface LifecycleAffectedArtifact {
  readonly type: string
  readonly files: readonly LifecycleAffectedFile[]
}

export interface LifecycleBlocker {
  readonly code: string
  readonly message: string
  readonly isSkippable: boolean
  readonly bypassFlag?: string
  readonly affectedArtifacts?: readonly LifecycleAffectedArtifact[]
}

export interface LifecycleReviewOverlapEntry {
  readonly archivedChangeName: string
  readonly overlappingSpecIds: readonly string[]
}

export interface LifecycleReviewSummary {
  readonly required: boolean
  readonly route: 'designing' | null
  readonly reason: 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict' | null
  readonly affectedArtifacts: readonly LifecycleAffectedArtifact[]
  readonly overlapDetail: readonly LifecycleReviewOverlapEntry[]
}

export interface LifecycleNextAction {
  readonly targetStep: ChangeState
  readonly actionType: 'cognitive' | 'mechanical'
  readonly reason: string
  readonly command: string | null
}

export interface LifecycleArtifactVerdict {
  readonly type: string
  readonly state: ArtifactStatus
  readonly effectiveStatus: ArtifactStatus
}

export interface LifecycleTransitionBlocker {
  readonly transition: ChangeState
  readonly reason: 'requires'
  readonly blocking: readonly string[]
}

export interface LifecycleStepVerdict {
  readonly step: string
  readonly available: boolean
  readonly isReady: boolean
  readonly isPermitted: boolean
  readonly blockingArtifacts: readonly string[]
  readonly blockers: readonly LifecycleBlocker[]
}

export interface LifecycleVerdict {
  readonly artifacts: readonly LifecycleArtifactVerdict[]
  readonly availableSteps: readonly LifecycleStepVerdict[]
  readonly blockers: readonly LifecycleBlocker[]
  readonly review: LifecycleReviewSummary
  readonly nextAction: LifecycleNextAction
  readonly validTransitions: readonly ChangeState[]
  readonly availableTransitions: readonly ChangeState[]
  readonly transitionBlockers: readonly LifecycleTransitionBlocker[]
  readonly nextArtifact: string | null
  readonly effectiveTarget?: ChangeState
}

export class LifecycleEngine {
  constructor(
    private readonly _debug: (message: string, context?: object) => void = () => undefined,
  ) {}

  evaluate(change: Change, schema: Schema, options: LifecycleEngineOptions = {}): LifecycleVerdict {
    const approvals = options.approvals ?? { spec: false, signoff: false }
    const bypassFlags = new Set(options.bypassFlags ?? [])
    const validTransitions = VALID_TRANSITIONS[change.state]
    const effectiveTarget =
      options.requestedTarget !== undefined
        ? this._resolveTarget(change.state, options.requestedTarget, approvals)
        : undefined

    const artifactIds = [
      ...new Set([
        ...schema.artifacts().map((artifactType) => artifactType.id),
        ...change.artifacts.keys(),
      ]),
    ]
    const artifacts = artifactIds.map((artifactId) => ({
      type: artifactId,
      state: change.getArtifact(artifactId)?.status ?? 'missing',
      effectiveStatus: this._effectiveStatus(change, schema, artifactId, new Set()),
    }))
    const verdictByArtifact = new Map(artifacts.map((artifact) => [artifact.type, artifact]))

    const review = this._deriveReview(change)
    const reviewBlockers = this._reviewBlockers(review, bypassFlags)

    const availableSteps: LifecycleStepVerdict[] = schema.workflow().map((workflowStep) => {
      const blockingArtifacts = workflowStep.requires.filter((artifactId) => {
        const status = verdictByArtifact.get(artifactId)?.effectiveStatus ?? 'missing'
        return status !== 'complete' && status !== 'skipped'
      })
      const readinessBlockers = blockingArtifacts.flatMap((artifactId) =>
        this._artifactBlockers(change, schema, artifactId, verdictByArtifact, false),
      )
      const isReady = blockingArtifacts.length === 0
      const isPermitted = this._isStepPermitted(
        change.state,
        workflowStep.step as ChangeState,
        approvals,
      )
      return {
        step: workflowStep.step,
        available: isReady && isPermitted,
        isReady,
        isPermitted,
        blockingArtifacts,
        blockers: isReady ? [] : this._dedupeBlockers(readinessBlockers),
      }
    })

    const transitionBlockers: LifecycleTransitionBlocker[] = validTransitions.flatMap(
      (transition) => {
        const workflowStep = schema.workflowStep(transition)
        if (workflowStep === null) return []
        const blocking = workflowStep.requires.filter((artifactId) => {
          const status = verdictByArtifact.get(artifactId)?.effectiveStatus ?? 'missing'
          return status !== 'complete' && status !== 'skipped'
        })
        return blocking.length === 0 ? [] : [{ transition, reason: 'requires', blocking }]
      },
    )

    const availableTransitions = validTransitions.filter((transition) => {
      const stepVerdict = availableSteps.find((step) => step.step === transition)
      if (stepVerdict === undefined) {
        return this._isStepPermitted(change.state, transition, approvals)
      }
      return stepVerdict.isReady && stepVerdict.isPermitted
    })

    const requestedBlockers =
      options.requestedTarget !== undefined
        ? this._requestedTargetBlockers(
            change,
            schema,
            options.requestedTarget,
            approvals,
            verdictByArtifact,
            reviewBlockers,
          )
        : []

    const blockers = this._dedupeBlockers([...reviewBlockers, ...requestedBlockers])
    const nextArtifact = this._nextArtifact(schema, verdictByArtifact)
    const nextAction = this._nextAction(change.state, review, availableTransitions)

    this._debug('LifecycleEngine evaluated change lifecycle', {
      change: change.name,
      requestedTarget: options.requestedTarget,
      effectiveTarget,
      approvals,
      bypassFlags: [...bypassFlags],
      blockerCodes: blockers.map((blocker) => blocker.code),
      nextArtifact,
      nextAction: nextAction.command,
    })

    return {
      artifacts,
      availableSteps,
      blockers,
      review,
      nextAction,
      validTransitions,
      availableTransitions,
      transitionBlockers,
      nextArtifact,
      ...(effectiveTarget !== undefined ? { effectiveTarget } : {}),
    }
  }

  findBlockingParent(
    change: Change,
    schema: Schema,
    artifactId: string,
  ): { artifactId: string; status: ArtifactStatus } | null {
    return this._findBlockingParent(change, schema, artifactId, new Set())
  }

  private _resolveTarget(
    fromState: ChangeState,
    requestedTarget: ChangeState,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
  ): ChangeState {
    if (fromState === 'ready' && requestedTarget === 'implementing' && approvals.spec) {
      return 'pending-spec-approval'
    }
    if (fromState === 'done' && requestedTarget === 'archivable' && approvals.signoff) {
      return 'pending-signoff'
    }
    return requestedTarget
  }

  private _isStepPermitted(
    fromState: ChangeState,
    step: ChangeState,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
  ): boolean {
    if (step === 'pending-spec-approval' || step === 'spec-approved') {
      return approvals.spec && isValidTransition(fromState, step)
    }
    if (step === 'pending-signoff' || step === 'signed-off') {
      return approvals.signoff && isValidTransition(fromState, step)
    }
    const routed = this._resolveTarget(fromState, step, approvals)
    return routed === step && isValidTransition(fromState, step)
  }

  private _effectiveStatus(
    change: Change,
    schema: Schema,
    artifactId: string,
    visiting: Set<string>,
  ): ArtifactStatus {
    const artifact = change.getArtifact(artifactId)
    if (artifact === null) return 'missing'
    if (artifact.status === 'missing') return 'missing'
    if (
      artifact.status === 'pending-review' ||
      artifact.status === 'drifted-pending-review' ||
      artifact.status === 'skipped' ||
      artifact.status === 'in-progress'
    ) {
      return artifact.status
    }
    if (visiting.has(artifactId)) {
      return 'in-progress'
    }

    visiting.add(artifactId)
    let blockedByReview = false
    for (const requiredId of this._requiresForArtifact(change, schema, artifactId)) {
      const requiredStatus = this._effectiveStatus(change, schema, requiredId, visiting)
      if (requiredStatus === 'complete' || requiredStatus === 'skipped') {
        continue
      }
      if (
        requiredStatus === 'pending-review' ||
        requiredStatus === 'drifted-pending-review' ||
        requiredStatus === 'pending-parent-artifact-review'
      ) {
        blockedByReview = true
        continue
      }

      visiting.delete(artifactId)
      return 'in-progress'
    }
    visiting.delete(artifactId)

    if (blockedByReview) {
      const parent = this._findBlockingParent(change, schema, artifactId, new Set())
      this._debug('LifecycleEngine downgraded artifact to parent-review', {
        change: change.name,
        artifactId,
        blockedBy: parent?.artifactId ?? null,
        blockedByStatus: parent?.status ?? null,
      })
      return 'pending-parent-artifact-review'
    }

    return artifact.status
  }

  private _findBlockingParent(
    change: Change,
    schema: Schema,
    artifactId: string,
    visiting: Set<string>,
  ): { artifactId: string; status: ArtifactStatus } | null {
    const requiredIds = this._requiresForArtifact(change, schema, artifactId)
    if (visiting.has(artifactId)) {
      return null
    }

    visiting.add(artifactId)
    for (const requiredId of requiredIds) {
      const requiredStatus = this._effectiveStatus(change, schema, requiredId, new Set())
      if (requiredStatus === 'pending-review' || requiredStatus === 'drifted-pending-review') {
        return { artifactId: requiredId, status: requiredStatus }
      }
      const parent = this._findBlockingParent(change, schema, requiredId, visiting)
      if (parent !== null) {
        return parent
      }
    }

    return null
  }

  private _deriveReview(change: Change): LifecycleReviewSummary {
    const outstandingArtifacts: LifecycleAffectedArtifact[] = []
    for (const artifact of change.artifacts.values()) {
      const files = [...artifact.files.values()]
        .filter(
          (file) => file.status === 'pending-review' || file.status === 'drifted-pending-review',
        )
        .map((file) => ({
          key: file.key,
          filename: file.filename,
          state: file.status,
        }))

      if (files.length > 0) {
        outstandingArtifacts.push({ type: artifact.type, files })
      }
    }

    if (outstandingArtifacts.length === 0) {
      return {
        required: false,
        route: null,
        reason: null,
        affectedArtifacts: [],
        overlapDetail: [],
      }
    }

    const latestInvalidated = [...change.history]
      .reverse()
      .find((event): event is InvalidatedEvent => event.type === 'invalidated')
    const hasDrift = outstandingArtifacts.some((artifact) =>
      artifact.files.some((file) => file.state === 'drifted-pending-review'),
    )
    const overlapDetail = this._collectUnhandledOverlaps(change)
    const overlapReason = !hasDrift && overlapDetail.length > 0 ? 'spec-overlap-conflict' : null

    const affectedArtifacts =
      latestInvalidated === undefined
        ? outstandingArtifacts
        : latestInvalidated.affectedArtifacts
            .map((affectedArtifact): LifecycleAffectedArtifact | null => {
              const current = outstandingArtifacts.find(
                (artifact) => artifact.type === affectedArtifact.type,
              )
              if (current === undefined) return null
              const files = affectedArtifact.files
                .map((key) => current.files.find((file) => file.key === key))
                .filter((file): file is LifecycleAffectedFile => file !== undefined)
              return files.length === 0 ? null : { type: affectedArtifact.type, files }
            })
            .filter((artifact): artifact is LifecycleAffectedArtifact => artifact !== null)

    return {
      required: true,
      route: 'designing',
      reason: hasDrift ? 'artifact-drift' : (overlapReason ?? 'artifact-review-required'),
      affectedArtifacts: affectedArtifacts.length > 0 ? affectedArtifacts : outstandingArtifacts,
      overlapDetail: overlapReason === null ? [] : overlapDetail,
    }
  }

  private _collectUnhandledOverlaps(change: Change): LifecycleReviewOverlapEntry[] {
    const entries: LifecycleReviewOverlapEntry[] = []
    for (const event of [...change.history].reverse()) {
      if (event.type === 'invalidated' && event.cause === 'spec-overlap-conflict') {
        const nameMatch = event.message.match(/change '([^']+)'/)
        const specsMatch = event.message.match(/specs:\s*(.+)$/)
        entries.push({
          archivedChangeName: nameMatch?.[1] ?? '',
          overlappingSpecIds: specsMatch?.[1]?.split(',').map((value) => value.trim()) ?? [],
        })
        continue
      }

      if (event.type === 'transitioned' && event.to !== 'designing') {
        break
      }
    }
    return entries
  }

  private _reviewBlockers(
    review: LifecycleReviewSummary,
    bypassFlags: ReadonlySet<string>,
  ): LifecycleBlocker[] {
    if (!review.required || review.reason === null) {
      return []
    }

    if (review.reason === 'artifact-drift') {
      return [
        {
          code: 'ARTIFACT_DRIFT',
          message:
            'Validated artifact content drifted from disk and requires semantic consistency review',
          isSkippable: false,
          affectedArtifacts: review.affectedArtifacts,
        },
      ]
    }

    if (review.reason === 'artifact-review-required') {
      return [
        {
          code: 'REVIEW_REQUIRED',
          message: 'Artifacts require semantic consistency review before proceeding',
          isSkippable: false,
          affectedArtifacts: review.affectedArtifacts,
        },
      ]
    }

    if (bypassFlags.has('allow-overlap')) {
      return []
    }

    return [
      {
        code: 'OVERLAP_CONFLICT',
        message: 'Conflict detected with archived overlapping specs',
        isSkippable: true,
        bypassFlag: '--allow-overlap',
        affectedArtifacts: review.affectedArtifacts,
      },
    ]
  }

  private _requestedTargetBlockers(
    change: Change,
    schema: Schema,
    requestedTarget: ChangeState,
    approvals: { readonly spec: boolean; readonly signoff: boolean },
    verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
    reviewBlockers: readonly LifecycleBlocker[],
  ): LifecycleBlocker[] {
    const blockers: LifecycleBlocker[] = []
    const effectiveTarget = this._resolveTarget(change.state, requestedTarget, approvals)

    if (
      (requestedTarget === 'pending-spec-approval' || requestedTarget === 'spec-approved') &&
      !approvals.spec
    ) {
      return [
        {
          code: 'INVALID_TRANSITION',
          message: `Transition to '${requestedTarget}' is not permitted when spec approvals are disabled`,
          isSkippable: false,
        },
      ]
    }

    if (
      (requestedTarget === 'pending-signoff' || requestedTarget === 'signed-off') &&
      !approvals.signoff
    ) {
      return [
        {
          code: 'INVALID_TRANSITION',
          message: `Transition to '${requestedTarget}' is not permitted when signoff approvals are disabled`,
          isSkippable: false,
        },
      ]
    }

    if (!isValidTransition(change.state, effectiveTarget)) {
      return [
        {
          code: 'INVALID_TRANSITION',
          message: `Transition from '${change.state}' to '${effectiveTarget}' is not permitted`,
          isSkippable: false,
        },
      ]
    }

    if (effectiveTarget !== requestedTarget) {
      blockers.push({
        code: 'APPROVAL_REQUIRED',
        message: `Transition to '${requestedTarget}' requires approval and routes to '${effectiveTarget}'`,
        isSkippable: false,
      })
    }

    const workflowStep = schema.workflowStep(effectiveTarget)
    if (workflowStep === null) {
      return this._dedupeBlockers([...blockers, ...reviewBlockers])
    }

    for (const artifactId of workflowStep.requires) {
      const blockersForArtifact = this._artifactBlockers(
        change,
        schema,
        artifactId,
        verdictByArtifact,
        true,
      )
      blockers.push(...blockersForArtifact)
    }

    return this._dedupeBlockers([...blockers, ...reviewBlockers])
  }

  private _artifactBlockers(
    change: Change,
    schema: Schema,
    artifactId: string,
    verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
    includeProgressStates: boolean,
  ): LifecycleBlocker[] {
    const verdict = verdictByArtifact.get(artifactId)
    const status = verdict?.effectiveStatus ?? 'missing'
    if (status === 'complete' || status === 'skipped') {
      return []
    }

    if (status === 'missing') {
      return [
        {
          code: 'MISSING_ARTIFACT',
          message: `Required artifact '${artifactId}' is missing`,
          isSkippable: false,
        },
      ]
    }

    if (status === 'in-progress') {
      return includeProgressStates
        ? [
            {
              code: 'INCOMPLETE_ARTIFACT',
              message: `Required artifact '${artifactId}' is incomplete`,
              isSkippable: false,
            },
          ]
        : []
    }

    const artifact = change.getArtifact(artifactId)
    const affectedArtifacts =
      artifact === null
        ? undefined
        : [
            {
              type: artifactId,
              files: [...artifact.files.values()].map((file) => ({
                key: file.key,
                filename: file.filename,
                state: file.status,
              })),
            },
          ]

    if (status === 'pending-review') {
      return [
        {
          code: 'REVIEW_REQUIRED',
          message: `Required artifact '${artifactId}' requires semantic consistency review`,
          isSkippable: false,
          ...(affectedArtifacts !== undefined ? { affectedArtifacts } : {}),
        },
      ]
    }

    if (status === 'drifted-pending-review') {
      return [
        {
          code: 'ARTIFACT_DRIFT',
          message: `Required artifact '${artifactId}' drifted since validation and requires semantic consistency review`,
          isSkippable: false,
          ...(affectedArtifacts !== undefined ? { affectedArtifacts } : {}),
        },
      ]
    }

    const parent = this._findBlockingParent(change, schema, artifactId, new Set())
    const parentArtifacts =
      parent === null ? affectedArtifacts : this._reviewAffectedArtifacts(change, parent.artifactId)
    return [
      {
        code: 'PENDING_PARENT_REVIEW',
        message:
          parent === null
            ? `Required artifact '${artifactId}' is blocked by an upstream review state`
            : `Required artifact '${artifactId}' is blocked by upstream artifact '${parent.artifactId}'`,
        isSkippable: false,
        ...(parentArtifacts !== undefined ? { affectedArtifacts: parentArtifacts } : {}),
      },
    ]
  }

  private _reviewAffectedArtifacts(
    change: Change,
    artifactId: string,
  ): readonly LifecycleAffectedArtifact[] | undefined {
    const artifact = change.getArtifact(artifactId)
    if (artifact === null) return undefined
    const files = [...artifact.files.values()]
      .filter(
        (file) => file.status === 'pending-review' || file.status === 'drifted-pending-review',
      )
      .map((file) => ({
        key: file.key,
        filename: file.filename,
        state: file.status,
      }))
    return files.length === 0 ? undefined : [{ type: artifactId, files }]
  }

  private _dedupeBlockers(blockers: readonly LifecycleBlocker[]): LifecycleBlocker[] {
    const seen = new Set<string>()
    const deduped: LifecycleBlocker[] = []
    for (const blocker of blockers) {
      const key = JSON.stringify([
        blocker.code,
        blocker.message,
        blocker.bypassFlag ?? null,
        blocker.affectedArtifacts?.map((artifact) => [
          artifact.type,
          artifact.files.map((file) => [file.key, file.filename, file.state]),
        ]) ?? null,
      ])
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(blocker)
    }
    return deduped
  }

  private _nextArtifact(
    schema: Schema,
    verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
  ): string | null {
    for (const artifactType of schema.artifacts()) {
      const status = verdictByArtifact.get(artifactType.id)?.effectiveStatus ?? 'missing'
      if (status === 'complete' || status === 'skipped') continue

      const dependenciesReady = artifactType.requires.every((requiredId) => {
        const requiredStatus = verdictByArtifact.get(requiredId)?.effectiveStatus ?? 'missing'
        return requiredStatus === 'complete' || requiredStatus === 'skipped'
      })

      if (dependenciesReady) {
        return artifactType.id
      }
    }

    return null
  }

  private _nextAction(
    state: ChangeState,
    review: LifecycleReviewSummary,
    availableTransitions: readonly ChangeState[],
  ): LifecycleNextAction {
    if (review.required) {
      return {
        targetStep: state,
        actionType: 'cognitive',
        reason: review.reason ?? 'Review required',
        command: '/specd-design',
      }
    }

    if (state === 'drafting' || state === 'designing') {
      return {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason: 'Elaborating design artifacts',
        command: '/specd-design',
      }
    }

    if (state === 'ready' && availableTransitions.includes('implementing')) {
      return {
        targetStep: 'implementing',
        actionType: 'mechanical',
        reason: 'Design complete, ready to implement',
        command: '/specd-implement',
      }
    }

    if (state === 'implementing') {
      return {
        targetStep: 'implementing',
        actionType: 'cognitive',
        reason: 'Implementing planned tasks',
        command: '/specd-implement',
      }
    }

    if (state === 'verifying') {
      return {
        targetStep: 'verifying',
        actionType: 'mechanical',
        reason: 'Verifying implementation against scenarios',
        command: '/specd-verify',
      }
    }

    return {
      targetStep: state,
      actionType: 'cognitive',
      reason: 'Proceed to next lifecycle step',
      command: null,
    }
  }

  private _requiresForArtifact(
    change: Change,
    schema: Schema,
    artifactId: string,
  ): readonly string[] {
    const schemaArtifact = schema.artifact(artifactId)
    if (schemaArtifact !== null) {
      return schemaArtifact.requires
    }
    return change.getArtifact(artifactId)?.requires ?? []
  }
}
