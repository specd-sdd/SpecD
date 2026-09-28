import { type Change } from '../entities/change.js'
import {
  type CompletedVerification,
  type ProjectionStatus,
  type SignoffProjection,
  type SpecApprovalProjection,
  type ValidityInvalidationCause,
} from '../entities/change.js'
import { type ChangeState } from '../value-objects/change-state.js'
import { type InvalidationPolicy } from '../value-objects/invalidation-policy.js'
import {
  compareSpecApprovalFingerprints,
  compareValidityFingerprints,
  type FingerprintDifference,
  type ArtifactFingerprint,
  type ImplementationFingerprint,
  type SpecApprovalFingerprint,
  type ValidityFingerprint,
} from '../value-objects/validity-fingerprint.js'

/**
 * One artifact file selected for review by drift, a direct target, or policy expansion.
 */
export interface ArtifactReviewTarget {
  readonly artifactId: string
  readonly fileKey: string
  readonly filename: string
  readonly origin: 'drift' | 'direct' | 'downstream' | 'global' | 'parent'
}

/** One validity blocker projected from a reconciled verdict. */
export interface ValidityBlocker {
  readonly code:
    | 'ARTIFACT_DRIFT'
    | 'ARTIFACT_REVIEW_REQUIRED'
    | 'FINGERPRINT_INPUT_ERROR'
    | 'APPROVAL_REQUIRED'
    | 'APPROVAL_STALE'
    | 'APPROVAL_REVOKED'
    | 'SIGNOFF_REQUIRED'
    | 'SIGNOFF_STALE'
    | 'SIGNOFF_REVOKED'
    | 'VERIFICATION_REQUIRED'
    | 'VERIFICATION_IN_PROGRESS'
    | 'VERIFICATION_STALE'
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

/** Failure recorded while collecting a fingerprint input. */
export interface FingerprintInputFailure {
  readonly scope: 'artifact' | 'implementation'
  readonly key: string
  readonly reason: 'missing' | 'unreadable' | 'outside-project' | 'invalid-path'
  readonly message: string
}

/** Fresh facts supplied to {@link evaluateChangeValidity}. */
export interface ChangeValidityFacts {
  readonly currentFingerprint: ValidityFingerprint | null
  readonly currentSpecApprovalFingerprint?: SpecApprovalFingerprint | null
  readonly fingerprintFailures: readonly FingerprintInputFailure[]
  readonly driftedArtifacts: readonly ArtifactReviewTarget[]
  readonly pendingReviewArtifacts: readonly ArtifactReviewTarget[]
  readonly taskArtifacts: ReadonlySet<string>
  readonly approvalsRequired: { readonly spec: boolean; readonly signoff: boolean }
  readonly verificationRequired: boolean
}

/** Lifecycle return requested by validity recovery. Never moves a change forward. */
export type AutomaticRecovery =
  | { readonly cause: 'spec-approval'; readonly from: ChangeState; readonly to: 'designing' }
  | { readonly cause: 'signoff'; readonly from: ChangeState; readonly to: 'done' }
  | { readonly cause: 'workflow-redesign'; readonly from: ChangeState; readonly to: 'designing' }

/** One materialized projection status transition. */
export interface ProjectionChange {
  readonly projection: 'specApproval' | 'signoff' | 'verification'
  readonly from: ProjectionStatus | 'absent'
  readonly to: ProjectionStatus | 'absent'
  readonly cause: ValidityInvalidationCause
  readonly differences: readonly FingerprintDifference[]
}

/** Pure verdict derived from a change, fresh facts, and the effective policy. */
export interface ChangeValidityVerdict {
  readonly artifactReviewRequired: boolean
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  readonly projectionChanges: readonly ProjectionChange[]
  readonly specApproval: 'not-required' | 'absent' | ProjectionStatus
  readonly signoff: 'not-required' | 'absent' | ProjectionStatus
  readonly verification: 'not-required' | 'absent' | 'attempt-active' | 'valid' | 'stale'
  readonly blockers: readonly ValidityBlocker[]
  readonly recovery: AutomaticRecovery | null
}

/** Canonical delivery order. Earlier indexes must never be advanced by recovery. */
const DELIVERY_AXIS: readonly ChangeState[] = [
  'drafting',
  'designing',
  'ready',
  'pending-spec-approval',
  'spec-approved',
  'implementing',
  'verifying',
  'done',
  'pending-signoff',
  'signed-off',
  'archivable',
  'archiving',
]

/** Approval field. */
type ApprovalField = 'not-required' | 'absent' | ProjectionStatus

/**
 * Derives one canonical validity verdict from a change snapshot and fresh facts.
 *
 * Callers supply non-task drift and pending-review targets. Artifact policy `none`
 * still reports review as required, and returns an empty affected set because `none`
 * waives reopening rather than freshness. Recovery never moves a change forward.
 *
 * @param change - Aggregate whose projections and state are evaluated
 * @param facts - Fresh fingerprint, drift, and gate facts
 * @param policy - Effective structured invalidation policy
 * @returns The verdict, including projection transitions that are not yet persisted
 */
export function evaluateChangeValidity(
  change: Change,
  facts: ChangeValidityFacts,
  policy: InvalidationPolicy,
): ChangeValidityVerdict {
  const reviewTargets = nonTaskReviewTargets(facts)
  const artifactReviewRequired = reviewTargets.length > 0
  const affectedArtifacts = policy.artifacts === 'none' ? [] : reviewTargets
  const projectionChanges: ProjectionChange[] = []

  const specNext = projectApproval(
    'specApproval',
    change.specApproval,
    facts,
    'artifact',
    projectionChanges,
  )
  const signoffNext = projectSignoff(change.signoff, facts, projectionChanges)
  const verificationNext = projectVerification(change, facts, projectionChanges)

  const specApproval = approvalField(facts.approvalsRequired.spec, change.specApproval, specNext)
  const signoff = approvalField(facts.approvalsRequired.signoff, change.signoff, signoffNext)
  const verification = verificationField(change, facts, verificationNext)

  return {
    artifactReviewRequired,
    affectedArtifacts,
    projectionChanges,
    specApproval,
    signoff,
    verification,
    blockers: buildBlockers(facts, reviewTargets, specApproval, signoff, verification),
    recovery: selectAutomaticRecovery(
      change.state,
      policy,
      specApproval,
      signoff,
      artifactReviewRequired,
    ),
  }
}

/**
 * Selects the single automatic lifecycle return for a verdict.
 *
 * Priority is required spec consent, then required sign-off later than `done`,
 * then workflow redesign. Verification staleness never selects a return.
 *
 * @param state - Current lifecycle state
 * @param policy - Effective invalidation policy
 * @param specApproval - Spec approval field after this evaluation
 * @param signoff - Sign-off field after this evaluation
 * @param artifactReviewRequired - Whether non-task drift or review remains
 * @returns The recovery to commit, or `null` when state should stay
 */
export function selectAutomaticRecovery(
  state: ChangeState,
  policy: InvalidationPolicy,
  specApproval: ApprovalField,
  signoff: ApprovalField,
  artifactReviewRequired: boolean,
): AutomaticRecovery | null {
  if (isBrokenConsent(specApproval) && isAfter(state, 'designing')) {
    return { cause: 'spec-approval', from: state, to: 'designing' }
  }
  if (isBrokenConsent(signoff) && isAfter(state, 'done')) {
    return { cause: 'signoff', from: state, to: 'done' }
  }
  if (policy.workflow === 'redesign' && artifactReviewRequired && isAfter(state, 'designing')) {
    return { cause: 'workflow-redesign', from: state, to: 'designing' }
  }
  return null
}

/**
 * Non task review targets.
 *
 * @param facts - facts
 * @returns non task review targets result
 */
function nonTaskReviewTargets(facts: ChangeValidityFacts): ArtifactReviewTarget[] {
  const seen = new Set<string>()
  const targets: ArtifactReviewTarget[] = []
  for (const target of [...facts.driftedArtifacts, ...facts.pendingReviewArtifacts]) {
    if (facts.taskArtifacts.has(target.artifactId)) continue
    const id = `${target.artifactId}:${target.fileKey}`
    if (seen.has(id)) continue
    seen.add(id)
    targets.push(target)
  }
  return targets
}

/**
 * Project approval.
 *
 * @param projection - projection
 * @param current - current
 * @param facts - facts
 * @param scope - scope
 * @param changes - changes
 * @returns project approval result
 */
function projectApproval(
  projection: 'specApproval',
  current: SpecApprovalProjection | undefined,
  facts: ChangeValidityFacts,
  scope: 'artifact',
  changes: ProjectionChange[],
): ProjectionStatus | undefined {
  if (current === undefined || current.status !== 'valid') return undefined
  const differences = specApprovalDifferences(current.fingerprint, facts)
  if (differences === null) return undefined
  const cause = causeFor(differences, facts, scope)
  changes.push({
    projection,
    from: 'valid',
    to: 'stale',
    cause,
    differences,
  })
  return 'stale'
}

/**
 * Project signoff.
 *
 * @param current - current
 * @param facts - facts
 * @param changes - changes
 * @returns project signoff result
 */
function projectSignoff(
  current: SignoffProjection | undefined,
  facts: ChangeValidityFacts,
  changes: ProjectionChange[],
): ProjectionStatus | undefined {
  if (current === undefined || current.status !== 'valid') return undefined
  const compared = compareStoredValidity(current.fingerprint, facts)
  if (compared === null) return undefined
  changes.push({
    projection: 'signoff',
    from: 'valid',
    to: 'stale',
    cause: compared.cause,
    differences: compared.differences,
  })
  return 'stale'
}

/**
 * Project verification.
 *
 * @param change - change
 * @param facts - facts
 * @param changes - changes
 * @returns project verification result
 */
function projectVerification(
  change: Change,
  facts: ChangeValidityFacts,
  changes: ProjectionChange[],
): 'stale' | undefined {
  const completed = change.verification.completed
  if (completed === undefined || completed.status !== 'valid') return undefined
  const compared = compareStoredValidity(completed.fingerprint, facts)
  if (compared === null) return undefined
  changes.push({
    projection: 'verification',
    from: 'valid',
    to: 'stale',
    cause: compared.cause,
    differences: compared.differences,
  })
  return 'stale'
}

/**
 * Artifact differences.
 *
 * @param expected - expected
 * @param facts - facts
 * @returns artifact differences result
 */
function specApprovalDifferences(
  expected: SpecApprovalProjection['fingerprint'],
  facts: ChangeValidityFacts,
): readonly FingerprintDifference[] | null {
  if (facts.currentFingerprint === null) {
    return unreadableDifferences(facts.fingerprintFailures, 'artifact')
  }
  if (
    facts.currentSpecApprovalFingerprint === null ||
    facts.currentSpecApprovalFingerprint === undefined
  ) {
    return unreadableDifferences(facts.fingerprintFailures, 'artifact')
  }
  const comparison = compareSpecApprovalFingerprints(expected, facts.currentSpecApprovalFingerprint)
  return comparison.equal ? null : comparison.differences
}

/**
 * Compare stored validity.
 *
 * @param expected - expected stored fingerprint
 * @param expected.artifacts - expected artifact fingerprint
 * @param expected.implementation - expected implementation fingerprint, or null when unknown
 * @param facts - facts
 * @returns fingerprint differences, or null when the stored fingerprint still matches
 */
function compareStoredValidity(
  expected: {
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  },
  facts: ChangeValidityFacts,
): {
  readonly cause: ValidityInvalidationCause
  readonly differences: readonly FingerprintDifference[]
} | null {
  if (expected.implementation === null) {
    return {
      cause: 'legacy-unknown',
      differences: [
        {
          scope: 'implementation',
          key: '$legacy',
          kind: 'unreadable',
          actual: 'legacy-unknown',
        },
      ],
    }
  }
  if (facts.currentFingerprint === null) {
    return {
      cause: causeFor(unreadableDifferences(facts.fingerprintFailures, 'any'), facts, 'any'),
      differences: unreadableDifferences(facts.fingerprintFailures, 'any'),
    }
  }
  const current: ValidityFingerprint = {
    version: 1,
    artifacts: facts.currentFingerprint.artifacts,
    implementation: facts.currentFingerprint.implementation,
  }
  const expectedFingerprint: ValidityFingerprint = {
    version: 1,
    artifacts: expected.artifacts,
    implementation: expected.implementation,
  }
  const comparison = compareValidityFingerprints(expectedFingerprint, current)
  if (comparison.equal) return null
  return {
    cause: causeFor(comparison.differences, facts, 'any'),
    differences: comparison.differences,
  }
}

/**
 * Unreadable differences.
 *
 * @param failures - failures
 * @param scope - scope
 * @returns unreadable differences result
 */
function unreadableDifferences(
  failures: readonly FingerprintInputFailure[],
  scope: 'artifact' | 'any',
): readonly FingerprintDifference[] {
  const relevant =
    scope === 'artifact' ? failures.filter((failure) => failure.scope === 'artifact') : failures
  if (relevant.length === 0) {
    return [
      {
        scope: scope === 'artifact' ? 'artifact' : 'implementation',
        key: '$fingerprint',
        kind: 'unreadable',
        actual: 'missing',
      },
    ]
  }
  return relevant.map((failure) => ({
    scope: failure.scope,
    key: failure.key,
    kind: 'unreadable' as const,
    actual: failure.reason,
  }))
}

/**
 * Cause for.
 *
 * @param differences - differences
 * @param facts - facts
 * @param scope - scope
 * @returns cause for result
 */
function causeFor(
  differences: readonly FingerprintDifference[],
  facts: ChangeValidityFacts,
  scope: 'artifact' | 'any',
): ValidityInvalidationCause {
  if (
    facts.fingerprintFailures.some(
      (failure) => failure.reason === 'missing' && failure.key === '$legacy',
    )
  ) {
    return 'legacy-unknown'
  }
  if (differences.some((difference) => difference.scope === 'spec')) {
    return 'scope-change'
  }
  if (
    scope !== 'artifact' &&
    differences.some((difference) => difference.scope === 'implementation')
  ) {
    return 'implementation-drift'
  }
  return 'artifact-drift'
}

/**
 * Approval field.
 *
 * @param required - required
 * @param current - current
 * @param next - next
 * @returns approval field result
 */
function approvalField(
  required: boolean,
  current: { readonly status: ProjectionStatus } | undefined,
  next: ProjectionStatus | undefined,
): ApprovalField {
  if (!required) return 'not-required'
  if (current === undefined) return 'absent'
  return next ?? current.status
}

/**
 * Verification field.
 *
 * @param change - change
 * @param facts - facts
 * @param projected - projected
 * @returns verification field result
 */
function verificationField(
  change: Change,
  facts: ChangeValidityFacts,
  projected: 'stale' | undefined,
): ChangeValidityVerdict['verification'] {
  const completed: CompletedVerification | undefined = change.verification.completed
  const active = change.verification.activeAttempt !== undefined
  const stale = projected === 'stale' || completed?.status === 'stale'
  if (stale) return 'stale'
  if (active) return 'attempt-active'
  if (completed?.status === 'valid') return 'valid'
  if (!facts.verificationRequired) return 'not-required'
  return 'absent'
}

/**
 * Build blockers.
 *
 * @param facts - facts
 * @param reviewTargets - review targets
 * @param specApproval - spec approval
 * @param signoff - signoff
 * @param verification - verification
 * @returns build blockers result
 */
function buildBlockers(
  facts: ChangeValidityFacts,
  reviewTargets: readonly ArtifactReviewTarget[],
  specApproval: ApprovalField,
  signoff: ApprovalField,
  verification: ChangeValidityVerdict['verification'],
): readonly ValidityBlocker[] {
  const blockers: ValidityBlocker[] = []
  if (facts.fingerprintFailures.length > 0) {
    blockers.push({
      code: 'FINGERPRINT_INPUT_ERROR',
      message: 'Fingerprint inputs could not be read',
      details: { failures: facts.fingerprintFailures },
    })
  }
  const drifted = reviewTargets.filter((target) =>
    facts.driftedArtifacts.some(
      (drift) => drift.artifactId === target.artifactId && drift.fileKey === target.fileKey,
    ),
  )
  if (drifted.length > 0) {
    blockers.push({
      code: 'ARTIFACT_DRIFT',
      message: 'Artifact files differ from their validated baseline',
      details: { artifacts: drifted.map((target) => `${target.artifactId}:${target.fileKey}`) },
    })
  }
  const pending = reviewTargets.filter(
    (target) =>
      !drifted.some(
        (drift) => drift.artifactId === target.artifactId && drift.fileKey === target.fileKey,
      ),
  )
  if (pending.length > 0) {
    blockers.push({
      code: 'ARTIFACT_REVIEW_REQUIRED',
      message: 'Artifact files require review',
      details: { artifacts: pending.map((target) => `${target.artifactId}:${target.fileKey}`) },
    })
  }
  pushConsentBlocker(blockers, 'APPROVAL', specApproval)
  pushConsentBlocker(blockers, 'SIGNOFF', signoff)
  if (facts.verificationRequired) {
    if (verification === 'absent' || verification === 'not-required') {
      blockers.push({ code: 'VERIFICATION_REQUIRED', message: 'Verification is required' })
    } else if (verification === 'attempt-active') {
      blockers.push({ code: 'VERIFICATION_IN_PROGRESS', message: 'Verification is in progress' })
    } else if (verification === 'stale') {
      blockers.push({
        code: 'VERIFICATION_STALE',
        message: 'Verification is stale',
        details: { command: 'specd changes verification start <name>' },
      })
    }
  }
  return blockers
}

/**
 * Push consent blocker.
 *
 * @param blockers - blockers
 * @param gate - gate
 * @param status - status
 */
function pushConsentBlocker(
  blockers: ValidityBlocker[],
  gate: 'APPROVAL' | 'SIGNOFF',
  status: ApprovalField,
): void {
  const label = gate === 'APPROVAL' ? 'Spec approval' : 'Sign-off'
  if (status === 'absent') {
    blockers.push({ code: `${gate}_REQUIRED`, message: `${label} is required` })
  } else if (status === 'stale') {
    blockers.push({ code: `${gate}_STALE`, message: `${label} is stale` })
  } else if (status === 'revoked') {
    blockers.push({ code: `${gate}_REVOKED`, message: `${label} is revoked` })
  }
}

/**
 * Is broken consent.
 *
 * @param status - status
 * @returns is broken consent result
 */
function isBrokenConsent(status: ApprovalField): boolean {
  return status === 'stale' || status === 'revoked'
}

/**
 * Is after.
 *
 * @param state - state
 * @param boundary - boundary
 * @returns is after result
 */
function isAfter(state: ChangeState, boundary: ChangeState): boolean {
  return DELIVERY_AXIS.indexOf(state) > DELIVERY_AXIS.indexOf(boundary)
}
