/* eslint-disable jsdoc/require-jsdoc -- Private verdict helpers; public types and evaluateLifecycleVerdict() are documented. */
import { type Change, type InvalidatedEvent } from '../entities/change.js'
import { type ChangeArtifact } from '../entities/change-artifact.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import {
  type ChangeState,
  VALID_TRANSITIONS,
  isValidTransition,
} from '../value-objects/change-state.js'
import { type Schema } from '../value-objects/schema.js'
import { type CheckResult } from './transition-checks.js'
import { boundFromStates } from './check-bindings.js'
import { Logger } from '../../observability/logger.js'

function isBypassFlagActive(bypassFlag: string | undefined, flags: ReadonlySet<string>): boolean {
  if (bypassFlag === undefined) return false
  const trimmed = bypassFlag.replace(/^--/, '')
  return flags.has(bypassFlag) || flags.has(trimmed) || flags.has(`--${trimmed}`)
}

function reviewMessage(
  reason: 'artifact-drift' | 'artifact-review-required' | 'spec-overlap-conflict',
): string {
  switch (reason) {
    case 'artifact-drift':
      return 'Validated artifact content drifted from disk and requires semantic consistency review'
    case 'spec-overlap-conflict':
      return 'Conflict detected with archived overlapping specs'
    default:
      return 'Artifacts require semantic consistency review before proceeding'
  }
}

/** Artifact lookup for DAG projection (`Change` or a drafted view). */
export interface ArtifactGraphSource {
  readonly name: string
  readonly artifacts: ReadonlyMap<string, ChangeArtifact>
  getArtifact(type: string): ChangeArtifact | null
}

export interface LifecycleVerdictInput {
  /**
   * Predicate results per protocol-legal target, produced by application
   * `check.execute`. Required for availability; the verdict does not re-run predicates.
   */
  readonly checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>
  /** Optional hop to score as the requested transition (blockers + `effectiveTarget`). */
  readonly requestedTarget?: ChangeState
  /**
   * Approval gates used for next-action copy and extras-row `isPermitted`
   * fallback when a target has no injected predicate results.
   */
  readonly approvals?: { readonly spec: boolean; readonly signoff: boolean }
  /** Bypass tokens such as `allow-overlap` that skip matching review blockers. */
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
  /** Gerund label from the failed check when the blocker is predicate-projected. */
  readonly label?: string
  /** Check id that produced this blocker when predicate-projected. */
  readonly checkId?: string
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
  /** Human prose when `required` is true. */
  readonly message?: string
  readonly affectedArtifacts: readonly LifecycleAffectedArtifact[]
  readonly overlapDetail: readonly LifecycleReviewOverlapEntry[]
}

export interface LifecycleNextHop {
  readonly targetStep: ChangeState
  readonly actionType: 'cognitive' | 'mechanical'
  readonly reason: string
}

export interface LifecycleDomainVerdict {
  readonly artifacts: readonly LifecycleArtifactVerdict[]
  readonly availableSteps: readonly LifecycleStepVerdict[]
  readonly blockers: readonly LifecycleBlocker[]
  readonly review: LifecycleReviewSummary
  readonly nextHop: LifecycleNextHop
  readonly validTransitions: readonly ChangeState[]
  readonly availableTransitions: readonly ChangeState[]
  readonly transitionBlockers: readonly LifecycleTransitionBlocker[]
  readonly nextArtifact: string | null
  /** Echo of `options.requestedTarget` when a specific hop was evaluated. */
  readonly effectiveTarget?: ChangeState
  readonly checksByTarget: Readonly<Partial<Record<ChangeState, readonly CheckResult[]>>>
  readonly checks: readonly CheckResult[]
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

export function evaluateLifecycleVerdict(
  change: Change,
  schema: Schema,
  options: LifecycleVerdictInput,
): LifecycleDomainVerdict {
  const approvals = options.approvals ?? { spec: false, signoff: false }
  const bypassFlags = new Set(options.bypassFlags ?? [])
  const validTransitions = VALID_TRANSITIONS[change.state]
  const effectiveTarget =
    options.requestedTarget !== undefined ? options.requestedTarget : undefined

  const artifacts = projectArtifacts(change, schema)
  const verdictByArtifact = new Map(artifacts.map((artifact) => [artifact.type, artifact]))

  const review = deriveReview(change)
  const reviewBlockers = reviewBlockersFromSummary(review)

  const checksByTarget: Partial<Record<ChangeState, readonly CheckResult[]>> = {
    ...options.checksByTarget,
  }
  const availableTransitions: ChangeState[] = []
  for (const target of validTransitions) {
    const injected = options.checksByTarget[target]
    if (injected === undefined) {
      continue
    }
    checksByTarget[target] = injected
    if (injected.every((check) => check.outcome !== 'fail')) {
      availableTransitions.push(target)
    }
  }

  const availableSteps: LifecycleStepVerdict[] = schema.workflow().map((workflowStep) => {
    const step = workflowStep.step as ChangeState
    const evaluationChecks = checksByTarget[step]
    const blockingArtifacts = blockingArtifactIds(
      workflowStep.requires,
      evaluationChecks,
      verdictByArtifact,
    )
    const readinessBlockers = blockingArtifacts.flatMap((artifactId) =>
      artifactBlockers(change, schema, artifactId, verdictByArtifact, false),
    )
    const requiresFailed =
      evaluationChecks !== undefined
        ? evaluationChecks.some(
            (check) => check.id === 'workflow.requires' && check.outcome === 'fail',
          )
        : blockingArtifacts.length > 0
    const isReady = !requiresFailed
    const isPermitted =
      evaluationChecks !== undefined
        ? evaluationChecks.every(
            (check) => check.id !== 'protocol.edge' || check.outcome !== 'fail',
          )
        : isStepPermitted(change.state, step, approvals)
    const available =
      evaluationChecks !== undefined
        ? evaluationChecks.every((check) => check.outcome !== 'fail')
        : isReady && isPermitted
    return {
      step: workflowStep.step,
      available,
      isReady,
      isPermitted,
      blockingArtifacts,
      blockers: evaluationChecks !== undefined || isReady ? [] : dedupeBlockers(readinessBlockers),
    }
  })

  const transitionBlockers: LifecycleTransitionBlocker[] = validTransitions.flatMap(
    (transition) => {
      if (change.state === 'archiving' && transition === 'archivable') {
        return []
      }
      const evaluationChecks = checksByTarget[transition]
      if (evaluationChecks !== undefined) {
        const requiresFailed = evaluationChecks.some(
          (check) => check.id === 'workflow.requires' && check.outcome === 'fail',
        )
        return requiresFailed ? [{ transition, reason: 'requires', blocking: [] }] : []
      }
      const workflowStep = schema.workflowStep(transition)
      if (workflowStep === null) return []
      const blocking = [...blockingArtifactIds(workflowStep.requires, undefined, verdictByArtifact)]
      return blocking.length === 0 ? [] : [{ transition, reason: 'requires', blocking }]
    },
  )

  const hopBlockers =
    options.requestedTarget !== undefined
      ? requestedTargetBlockers(
          change,
          schema,
          options.requestedTarget,
          approvals,
          verdictByArtifact,
          reviewBlockers,
          checksByTarget[options.requestedTarget] ?? [],
          bypassFlags,
        )
      : blockersFromFailedChecks(
          Object.values(checksByTarget).flatMap((rows) => rows ?? []),
          bypassFlags,
        )

  const blockers = dedupeBlockers([...reviewBlockers, ...hopBlockers])
  const nextArtifactId = nextArtifact(schema, verdictByArtifact)
  const nextHop = resolveLifecycleNextHop(change, review, availableTransitions, approvals)
  const checks =
    options.requestedTarget !== undefined
      ? (checksByTarget[options.requestedTarget] ?? [])
      : (checksByTarget[nextHop.targetStep] ?? [])
  const failedCheckIds = [
    ...new Set(
      Object.values(checksByTarget)
        .flatMap((rows) => rows ?? [])
        .filter((check) => check.outcome === 'fail')
        .map((check) => check.id),
    ),
  ]
  const requestedAllowed =
    options.requestedTarget !== undefined
      ? availableTransitions.includes(options.requestedTarget)
      : availableTransitions.includes(nextHop.targetStep)

  Logger.debug('evaluateLifecycleVerdict evaluated change lifecycle', {
    change: change.name,
    requestedTarget: options.requestedTarget,
    effectiveTarget,
    allowed: requestedAllowed,
    failedCheckIds,
    approvals,
    bypassFlags: [...bypassFlags],
    blockerCodes: blockers.map((blocker) => blocker.code),
    nextArtifact: nextArtifactId,
    nextHop: nextHop.targetStep,
  })

  return {
    artifacts,
    availableSteps,
    blockers,
    review,
    nextHop,
    validTransitions,
    availableTransitions,
    transitionBlockers,
    nextArtifact: nextArtifactId,
    checksByTarget,
    checks,
    ...(effectiveTarget !== undefined ? { effectiveTarget } : {}),
  }
}

/**
 * Projects dependency-aware artifact statuses without running predicates.
 *
 * @param change - Change under evaluation
 * @param schema - Active schema
 * @returns Artifact verdicts used by requires checks and status UI
 */
export function projectArtifacts(
  change: ArtifactGraphSource,
  schema: Schema,
): readonly LifecycleArtifactVerdict[] {
  const artifactIds = [
    ...new Set([
      ...schema.artifacts().map((artifactType) => artifactType.id),
      ...change.artifacts.keys(),
    ]),
  ]
  return artifactIds.map((artifactId) => ({
    type: artifactId,
    state: change.getArtifact(artifactId)?.status ?? 'missing',
    effectiveStatus: effectiveStatus(change, schema, artifactId, new Set()),
  }))
}

export function findBlockingParent(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
): { artifactId: string; status: ArtifactStatus } | null {
  return findBlockingParentInternal(change, schema, artifactId, new Set())
}

function resolveTarget(requestedTarget: ChangeState): ChangeState {
  return requestedTarget
}

function isStepPermitted(
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
  return resolveTarget(step) === step && isValidTransition(fromState, step)
}

function effectiveStatus(
  change: ArtifactGraphSource,
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
  let blockedByIncomplete = false
  for (const requiredId of requiresForArtifact(change, schema, artifactId)) {
    const requiredStatus = effectiveStatus(change, schema, requiredId, visiting)
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

    blockedByIncomplete = true
  }
  visiting.delete(artifactId)

  if (blockedByReview) {
    const parent = findBlockingParentInternal(change, schema, artifactId, new Set())
    Logger.debug('evaluateLifecycleVerdict downgraded artifact to parent-review', {
      change: change.name,
      artifactId,
      blockedBy: parent?.artifactId ?? null,
      blockedByStatus: parent?.status ?? null,
    })
    return 'pending-parent-artifact-review'
  }

  if (blockedByIncomplete) {
    return 'in-progress'
  }

  return artifact.status
}

function findBlockingParentInternal(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
  visiting: Set<string>,
): { artifactId: string; status: ArtifactStatus } | null {
  const requiredIds = requiresForArtifact(change, schema, artifactId)
  if (visiting.has(artifactId)) {
    return null
  }

  visiting.add(artifactId)
  for (const requiredId of requiredIds) {
    const requiredStatus = effectiveStatus(change, schema, requiredId, new Set())
    if (requiredStatus === 'pending-review' || requiredStatus === 'drifted-pending-review') {
      return { artifactId: requiredId, status: requiredStatus }
    }
    const parent = findBlockingParentInternal(change, schema, requiredId, visiting)
    if (parent !== null) {
      return parent
    }
  }

  return null
}

function deriveReview(change: Change): LifecycleReviewSummary {
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
  const overlapDetail = collectUnhandledOverlaps(change)
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
    message: reviewMessage(
      hasDrift ? 'artifact-drift' : (overlapReason ?? 'artifact-review-required'),
    ),
    affectedArtifacts: affectedArtifacts.length > 0 ? affectedArtifacts : outstandingArtifacts,
    overlapDetail: overlapReason === null ? [] : overlapDetail,
  }
}

function collectUnhandledOverlaps(change: Change): LifecycleReviewOverlapEntry[] {
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

function reviewBlockersFromSummary(review: LifecycleReviewSummary): LifecycleBlocker[] {
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

  // Invalidation from another archive is review + /specd-design, not OVERLAP_CONFLICT.
  return []
}

function requestedTargetBlockers(
  change: Change,
  schema: Schema,
  requestedTarget: ChangeState,
  approvals: { readonly spec: boolean; readonly signoff: boolean },
  verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
  reviewBlockers: readonly LifecycleBlocker[],
  requestedChecks: readonly CheckResult[],
  bypassFlags: ReadonlySet<string>,
): LifecycleBlocker[] {
  const blockers: LifecycleBlocker[] = blockersFromFailedChecks(requestedChecks, bypassFlags)
  const effectiveTarget = resolveTarget(requestedTarget)

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

  const workflowStep = schema.workflowStep(effectiveTarget)
  if (change.state === 'archiving' && effectiveTarget === 'archivable') {
    return dedupeBlockers([...blockers, ...reviewBlockers])
  }

  if (workflowStep === null) {
    return dedupeBlockers([...blockers, ...reviewBlockers])
  }

  const hasRequiresResult = requestedChecks.some((check) => check.id === 'workflow.requires')
  if (!hasRequiresResult) {
    for (const artifactId of workflowStep.requires) {
      const blockersForArtifact = artifactBlockers(
        change,
        schema,
        artifactId,
        verdictByArtifact,
        true,
      )
      blockers.push(...blockersForArtifact)
    }
  }

  return dedupeBlockers([...blockers, ...reviewBlockers])
}

function artifactBlockers(
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

  if (status === 'missing' || (status === 'in-progress' && includeProgressStates)) {
    return [
      {
        code: 'INCOMPLETE_ARTIFACT',
        message:
          status === 'missing'
            ? `Required artifact '${artifactId}' is missing`
            : `Required artifact '${artifactId}' is incomplete`,
        isSkippable: false,
      },
    ]
  }

  if (status === 'in-progress') {
    return []
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

  const parent = findBlockingParentInternal(change, schema, artifactId, new Set())
  const parentArtifacts =
    parent === null ? affectedArtifacts : reviewAffectedArtifacts(change, parent.artifactId)
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

function reviewAffectedArtifacts(
  change: Change,
  artifactId: string,
): readonly LifecycleAffectedArtifact[] | undefined {
  const artifact = change.getArtifact(artifactId)
  if (artifact === null) return undefined
  const files = [...artifact.files.values()]
    .filter((file) => file.status === 'pending-review' || file.status === 'drifted-pending-review')
    .map((file) => ({
      key: file.key,
      filename: file.filename,
      state: file.status,
    }))
  return files.length === 0 ? undefined : [{ type: artifactId, files }]
}

function dedupeBlockers(blockers: readonly LifecycleBlocker[]): LifecycleBlocker[] {
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

function blockingArtifactIds(
  requires: readonly string[],
  evaluationChecks: readonly CheckResult[] | undefined,
  verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
): readonly string[] {
  if (evaluationChecks !== undefined) {
    const requiresCheck = evaluationChecks.find((check) => check.id === 'workflow.requires')
    if (requiresCheck === undefined || requiresCheck.outcome !== 'fail') {
      return []
    }
    const artifactId = requiresCheck.details?.['artifactId']
    return typeof artifactId === 'string' ? [artifactId] : []
  }
  return requires.filter((artifactId) => {
    const status = verdictByArtifact.get(artifactId)?.effectiveStatus ?? 'missing'
    return status !== 'complete' && status !== 'skipped'
  })
}

function nextArtifact(
  schema: Schema,
  verdictByArtifact: ReadonlyMap<string, LifecycleArtifactVerdict>,
): string | null {
  for (const artifactId of schema.artifactDag().topologicalOrder()) {
    const artifactType = schema.artifact(artifactId)
    if (artifactType === null) continue

    const status = verdictByArtifact.get(artifactId)?.effectiveStatus ?? 'missing'
    if (status === 'complete' || status === 'skipped') continue

    const dependenciesReady = schema
      .artifactDag()
      .parentsOf(artifactId)
      .every((requiredId) => {
        const requiredStatus = verdictByArtifact.get(requiredId)?.effectiveStatus ?? 'missing'
        return requiredStatus === 'complete' || requiredStatus === 'skipped'
      })

    if (dependenciesReady) {
      return artifactId
    }
  }

  return null
}

function blockersFromFailedChecks(
  checks: readonly CheckResult[],
  bypassFlags: ReadonlySet<string>,
): LifecycleBlocker[] {
  return checks
    .filter((check) => check.outcome === 'fail' && check.code !== undefined)
    .flatMap((check) => {
      const code = check.code ?? 'INVALID_TRANSITION'
      const linksInScopeSkippable =
        code === 'IMPLEMENTATION_STATE' && check.id === 'impl.linksInScope'
      const skippable = code === 'OVERLAP_CONFLICT' || linksInScopeSkippable
      const blocker: LifecycleBlocker = {
        code,
        message: check.message ?? `Check '${check.id}' failed`,
        isSkippable: skippable,
        label: check.label,
        checkId: check.id,
        ...(code === 'OVERLAP_CONFLICT' ? { bypassFlag: '--allow-overlap' } : {}),
        ...(linksInScopeSkippable ? { bypassFlag: '--allow-out-of-scope' } : {}),
      }
      if (skippable && isBypassFlagActive(blocker.bypassFlag, bypassFlags)) {
        return []
      }
      return [blocker]
    })
}

export function resolveLifecycleNextHop(
  change: Change,
  review: LifecycleReviewSummary,
  availableTransitions: readonly ChangeState[],
  approvals: { readonly spec: boolean; readonly signoff: boolean },
): LifecycleNextHop {
  const state = change.state

  if (review.reason === 'spec-overlap-conflict') {
    return {
      targetStep: 'designing',
      actionType: 'cognitive',
      reason: review.message ?? review.reason,
    }
  }

  if (review.required) {
    return {
      targetStep: review.route ?? 'designing',
      actionType: 'cognitive',
      reason: review.message ?? review.reason ?? 'Review required',
    }
  }

  if (
    boundFromStates('approval.spec').includes(state) &&
    approvals.spec &&
    change.activeSpecApproval === undefined
  ) {
    return {
      targetStep: state,
      actionType: 'mechanical',
      reason: 'Spec approval is required before the bound delivery hop',
    }
  }

  if (
    boundFromStates('approval.signoff').includes(state) &&
    approvals.signoff &&
    change.activeSignoff === undefined
  ) {
    return {
      targetStep: state,
      actionType: 'mechanical',
      reason: 'Signoff is required before the bound delivery hop',
    }
  }

  if (state === 'drafting' || state === 'designing') {
    if (availableTransitions.includes('ready')) {
      return {
        targetStep: 'ready',
        actionType: 'cognitive',
        reason: 'Design complete, ready to leave designing',
      }
    }
    return {
      targetStep: 'designing',
      actionType: 'cognitive',
      reason: 'Elaborating design artifacts',
    }
  }

  if (state === 'ready' && availableTransitions.includes('implementing')) {
    return {
      targetStep: 'implementing',
      actionType: 'mechanical',
      reason: 'Design complete, ready to implement',
    }
  }

  if (state === 'pending-spec-approval') {
    return {
      targetStep: 'spec-approved',
      actionType: 'mechanical',
      reason: 'Spec approval is required',
    }
  }

  if (state === 'spec-approved' && availableTransitions.includes('implementing')) {
    return {
      targetStep: 'implementing',
      actionType: 'mechanical',
      reason: 'Design complete, ready to implement',
    }
  }

  if (state === 'implementing') {
    if (availableTransitions.includes('verifying')) {
      return {
        targetStep: 'verifying',
        actionType: 'mechanical',
        reason: 'Tasks complete, ready to verify',
      }
    }
    return {
      targetStep: 'implementing',
      actionType: 'cognitive',
      reason: 'Implementing planned tasks',
    }
  }

  if (state === 'verifying') {
    if (availableTransitions.includes('done')) {
      return {
        targetStep: 'done',
        actionType: 'mechanical',
        reason: 'Verification complete, ready to leave verifying',
      }
    }
    return {
      targetStep: 'verifying',
      actionType: 'mechanical',
      reason: 'Verifying implementation against scenarios',
    }
  }

  if (state === 'pending-signoff') {
    return {
      targetStep: 'signed-off',
      actionType: 'mechanical',
      reason: 'Signoff is required',
    }
  }

  if (state === 'done' || state === 'signed-off') {
    if (availableTransitions.includes('archivable')) {
      return {
        targetStep: 'archivable',
        actionType: 'mechanical',
        reason: 'Ready to enter archivable',
      }
    }
    return {
      targetStep: state,
      actionType: 'mechanical',
      reason: 'Remaining blockers prevent entering archivable',
    }
  }

  if (state === 'archivable') {
    if (!availableTransitions.includes('archiving')) {
      return {
        targetStep: 'archivable',
        actionType: 'mechanical',
        reason: 'Remaining blockers prevent archive',
      }
    }
    return {
      targetStep: 'archiving',
      actionType: 'mechanical',
      reason: 'Ready to archive',
    }
  }

  if (state === 'archiving') {
    const lastArchiveFailure = [...change.history]
      .reverse()
      .find((event) => event.type === 'archive-failed')
    if (
      lastArchiveFailure?.type === 'archive-failed' &&
      lastArchiveFailure.commitStarted &&
      change.state === 'archiving'
    ) {
      return {
        targetStep: 'designing',
        actionType: 'cognitive',
        reason:
          'Archive commit failed with incomplete restore — review and transition to designing',
      }
    }
    return {
      targetStep: 'archiving',
      actionType: 'mechanical',
      reason: 'Retry archive after reviewing canonical files',
    }
  }

  return {
    targetStep: state,
    actionType: 'cognitive',
    reason: 'Proceed to next lifecycle step',
  }
}

function requiresForArtifact(
  change: ArtifactGraphSource,
  schema: Schema,
  artifactId: string,
): readonly string[] {
  if (schema.artifact(artifactId) !== null) {
    return schema.artifactDag().parentsOf(artifactId)
  }
  return change.getArtifact(artifactId)?.requires ?? []
}
