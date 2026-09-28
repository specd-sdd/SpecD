/** One fingerprint difference safe to print: identity of the input, not its bytes or digest. */
export interface PublicFingerprintDifference {
  readonly scope: string
  readonly key: string
  readonly kind: string
}

/** Projection transition reported by Core, without digest payloads. */
export interface PublicProjectionChange {
  readonly projection: string
  readonly from: string
  readonly to: string
  readonly cause: string
  readonly differences: readonly PublicFingerprintDifference[]
}

/** Automatic lifecycle return reported by Core. */
export interface PublicAutomaticReturn {
  readonly cause: string
  readonly from: string
  readonly to: string
}

/** Canonical next action reported by Core. */
export interface PublicNextAction {
  readonly targetStep: string
  readonly actionType: string
  readonly reason: string
  readonly command: string | null
}

/** Validity verdict fields the CLI is allowed to render. */
export interface PublicValidity {
  readonly specApproval?: string
  readonly signoff?: string
  readonly verification?: string
  readonly recovery?: PublicAutomaticReturn | null
  readonly blockers?: readonly { readonly code: string; readonly message: string }[]
  readonly projectionChanges?: readonly PublicProjectionChange[]
  readonly affectedArtifacts?: readonly {
    readonly artifactId: string
    readonly fileKey: string
    readonly filename: string
    readonly origin: string
  }[]
}

/** Fingerprint summary that counts files and names algorithms. */
export interface PublicFingerprintSummary {
  readonly artifacts?: {
    readonly algorithm: string
    readonly fileCount: number
  }
  /** `null` is legacy unknown evidence. Omitted when the fingerprint has no implementation scope. */
  readonly implementation?: null | {
    readonly fileCount: number
    readonly observedEmpty: boolean
    readonly hashAlgorithm?: string
    readonly textNormalization?: string
    readonly binaryNormalization?: string
  }
}

/** Active attempt and completed evidence, kept distinct and hash-free. */
export interface PublicVerificationEvidence {
  readonly activeAttempt?: {
    readonly id: string
    readonly startedIn?: string
    readonly fingerprint: PublicFingerprintSummary
  }
  readonly completed?: {
    readonly id: string
    readonly attemptId?: string
    readonly status: string
    readonly fingerprint: PublicFingerprintSummary
  }
}

/**
 * Drops digest fields from a difference list.
 *
 * @param differences - Core fingerprint differences, which may include expected/actual digests
 * @returns Scope, key, and kind only
 */
export function publicDifferences(differences: unknown): readonly PublicFingerprintDifference[] {
  if (!Array.isArray(differences)) return []
  const result: PublicFingerprintDifference[] = []
  for (const entry of differences) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { scope?: unknown; key?: unknown; kind?: unknown }
    if (
      typeof record.scope !== 'string' ||
      typeof record.key !== 'string' ||
      typeof record.kind !== 'string'
    ) {
      continue
    }
    result.push({ scope: record.scope, key: record.key, kind: record.kind })
  }
  return result
}

/**
 * Copies a Core validity verdict into a hash-free view.
 *
 * @param value - `GetStatus.validity` or another reconciler verdict
 * @returns The public view, or `undefined` when no verdict was returned
 */
export function publicValidity(value: unknown): PublicValidity | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as {
    specApproval?: unknown
    signoff?: unknown
    verification?: unknown
    recovery?: unknown
    blockers?: unknown
    projectionChanges?: unknown
    affectedArtifacts?: unknown
  }
  return {
    ...(typeof record.specApproval === 'string' ? { specApproval: record.specApproval } : {}),
    ...(typeof record.signoff === 'string' ? { signoff: record.signoff } : {}),
    ...(typeof record.verification === 'string' ? { verification: record.verification } : {}),
    ...(record.recovery === null
      ? { recovery: null }
      : isAutomaticReturn(record.recovery)
        ? { recovery: record.recovery }
        : {}),
    ...(Array.isArray(record.blockers)
      ? {
          blockers: record.blockers.flatMap((blocker) => {
            if (typeof blocker !== 'object' || blocker === null) return []
            const item = blocker as { code?: unknown; message?: unknown }
            if (typeof item.code !== 'string' || typeof item.message !== 'string') return []
            return [{ code: item.code, message: item.message }]
          }),
        }
      : {}),
    ...(Array.isArray(record.projectionChanges)
      ? { projectionChanges: publicProjectionChanges(record.projectionChanges) }
      : {}),
    ...(Array.isArray(record.affectedArtifacts)
      ? { affectedArtifacts: publicAffectedArtifacts(record.affectedArtifacts) }
      : {}),
  }
}

/**
 * Reads verification evidence from a change-like object.
 *
 * @param change - Change aggregate or test double
 * @returns Active attempt and completed evidence summaries
 */
export function publicVerificationEvidence(change: object): PublicVerificationEvidence | undefined {
  if (!('verification' in change)) return undefined
  const verification = (change as { verification?: unknown }).verification
  if (typeof verification !== 'object' || verification === null) return undefined
  const record = verification as { activeAttempt?: unknown; completed?: unknown }
  const activeAttempt = publicAttempt(record.activeAttempt)
  const completed = publicCompleted(record.completed)
  if (activeAttempt === undefined && completed === undefined) return undefined
  return {
    ...(activeAttempt !== undefined ? { activeAttempt } : {}),
    ...(completed !== undefined ? { completed } : {}),
  }
}

/**
 * Reads `invalidationPolicy` when the change exposes the structured shape.
 *
 * @param change - Change aggregate or test double
 * @returns Both dimensions, when present
 */
export function readStructuredPolicy(
  change: object,
): { readonly artifacts: string; readonly workflow: string } | undefined {
  if (!('invalidationPolicy' in change)) return undefined
  const policy = (change as { invalidationPolicy?: unknown }).invalidationPolicy
  if (typeof policy !== 'object' || policy === null) return undefined
  const record = policy as { artifacts?: unknown; workflow?: unknown }
  if (typeof record.artifacts !== 'string' || typeof record.workflow !== 'string') return undefined
  return { artifacts: record.artifacts, workflow: record.workflow }
}

/**
 * Formats an effective policy that may still be a legacy scalar in older fixtures.
 *
 * @param policy - Core `effectivePolicy`
 * @returns A single display token and the artifact dimension used for `none` copy
 */
export function describeEffectivePolicy(policy: unknown): {
  readonly label: string
  readonly artifacts: string
  readonly workflow?: string
} {
  if (typeof policy === 'string') {
    return { label: policy, artifacts: policy }
  }
  if (typeof policy === 'object' && policy !== null) {
    const record = policy as { artifacts?: unknown; workflow?: unknown }
    const artifacts = typeof record.artifacts === 'string' ? record.artifacts : 'unknown'
    const workflow = typeof record.workflow === 'string' ? record.workflow : undefined
    return {
      artifacts,
      ...(workflow !== undefined ? { workflow } : {}),
      label: workflow !== undefined ? `artifacts=${artifacts} workflow=${workflow}` : artifacts,
    }
  }
  return { label: 'unknown', artifacts: 'unknown' }
}

/**
 * Text lines for a validity verdict and separate verification evidence.
 *
 * @param validity - Public validity view
 * @param evidence - Active attempt and completed evidence, when the change has them
 * @returns Lines without a section heading
 */
export function validityTextLines(
  validity: PublicValidity | undefined,
  evidence: PublicVerificationEvidence | undefined,
): string[] {
  const lines: string[] = []
  if (validity !== undefined) {
    if (validity.specApproval !== undefined) lines.push(`spec approval: ${validity.specApproval}`)
    if (validity.signoff !== undefined) lines.push(`signoff:       ${validity.signoff}`)
    if (validity.verification !== undefined) lines.push(`verification:  ${validity.verification}`)
    if (validity.recovery !== undefined) {
      lines.push(
        validity.recovery === null
          ? 'recovery:      (none)'
          : `recovery:      ${validity.recovery.from} → ${validity.recovery.to} (${validity.recovery.cause})`,
      )
    }
    for (const blocker of validity.blockers ?? []) {
      lines.push(`blocker:       ${blocker.code}: ${blocker.message}`)
    }
    for (const change of validity.projectionChanges ?? []) {
      lines.push(
        `projection:    ${change.projection} ${change.from} → ${change.to} (${change.cause})`,
      )
      for (const difference of change.differences) {
        lines.push(`  changed:     ${difference.scope} ${difference.key} ${difference.kind}`)
      }
    }
  }
  if (evidence?.activeAttempt !== undefined) {
    lines.push(`active attempt: ${evidence.activeAttempt.id}`)
    lines.push(...fingerprintTextLines('attempt fingerprint', evidence.activeAttempt.fingerprint))
  }
  if (evidence?.completed !== undefined) {
    lines.push(`completed evidence: ${evidence.completed.id} (${evidence.completed.status})`)
    lines.push(...fingerprintTextLines('evidence fingerprint', evidence.completed.fingerprint))
  }
  return lines
}

/**
 * Text lines for a fingerprint summary.
 *
 * @param label - Section label
 * @param summary - Hash-free fingerprint summary
 * @returns Indented detail lines
 */
export function fingerprintTextLines(label: string, summary: PublicFingerprintSummary): string[] {
  const lines = [`${label}:`]
  if (summary.artifacts !== undefined) {
    lines.push(`  artifacts: ${summary.artifacts.fileCount} files (${summary.artifacts.algorithm})`)
  }
  if (summary.implementation === undefined) return lines
  if (summary.implementation === null) {
    lines.push('  implementation: legacy unknown')
  } else if (summary.implementation.observedEmpty) {
    const algorithms = normalizationLabel(summary.implementation)
    lines.push(`  implementation: observed empty (0 files${algorithms})`)
  } else {
    const algorithms = normalizationLabel(summary.implementation)
    lines.push(`  implementation: ${summary.implementation.fileCount} files${algorithms}`)
  }
  return lines
}

/**
 * Summarizes a fingerprint object without copying file bytes or digests.
 *
 * @param fingerprint - Artifact fingerprint, complete fingerprint, or sign-off fingerprint
 * @returns Counts and algorithm names
 */
export function summarizeFingerprint(fingerprint: unknown): PublicFingerprintSummary | undefined {
  if (fingerprint === null) {
    return { implementation: null }
  }
  if (typeof fingerprint !== 'object' || fingerprint === undefined) return undefined
  const record = fingerprint as {
    algorithm?: unknown
    files?: unknown
    artifacts?: unknown
    implementation?: unknown
  }
  if ('artifacts' in record || 'implementation' in record) {
    const artifacts = summarizeArtifactMap(record.artifacts)
    const implementation = summarizeImplementation(record.implementation)
    return {
      ...(artifacts !== undefined ? { artifacts } : {}),
      ...(implementation !== undefined ? { implementation } : {}),
    }
  }
  const artifacts = summarizeArtifactMap(fingerprint)
  if (artifacts === undefined) return undefined
  return { artifacts }
}

/**
 * Formats a decision timestamp from a Date or ISO string.
 *
 * @param value - Core decision time
 * @returns ISO-8601 text, or an empty string when absent
 */
export function formatDecisionTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return ''
}

/**
 * Maps projection change payloads to the public view.
 *
 * @param changes - Core projection changes
 * @returns Hash-free projection changes
 */
export function publicProjectionChanges(changes: unknown): readonly PublicProjectionChange[] {
  if (!Array.isArray(changes)) return []
  const result: PublicProjectionChange[] = []
  for (const entry of changes) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as {
      projection?: unknown
      from?: unknown
      to?: unknown
      cause?: unknown
      differences?: unknown
    }
    if (
      typeof record.projection !== 'string' ||
      typeof record.from !== 'string' ||
      typeof record.to !== 'string' ||
      typeof record.cause !== 'string'
    ) {
      continue
    }
    result.push({
      projection: record.projection,
      from: record.from,
      to: record.to,
      cause: record.cause,
      differences: publicDifferences(record.differences),
    })
  }
  return result
}

/**
 * Reads an automatic return when Core included one.
 *
 * @param value - `automaticReturn` field
 * @returns The return, `null` when Core reported none, or `undefined` when absent
 */
export function readAutomaticReturn(value: unknown): PublicAutomaticReturn | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return isAutomaticReturn(value) ? value : undefined
}

/**
 * Is automatic return.
 *
 * @param value - value
 * @returns is automatic return result
 */
function isAutomaticReturn(value: unknown): value is PublicAutomaticReturn {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { cause?: unknown; from?: unknown; to?: unknown }
  return (
    typeof record.cause === 'string' &&
    typeof record.from === 'string' &&
    typeof record.to === 'string'
  )
}

/**
 * Public affected artifacts.
 *
 * @param artifacts - artifacts
 * @returns public affected artifacts result
 */
function publicAffectedArtifacts(
  artifacts: readonly unknown[],
): NonNullable<PublicValidity['affectedArtifacts']> {
  const result: NonNullable<PublicValidity['affectedArtifacts']>[number][] = []
  for (const entry of artifacts) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as {
      artifactId?: unknown
      fileKey?: unknown
      filename?: unknown
      origin?: unknown
    }
    if (
      typeof record.artifactId !== 'string' ||
      typeof record.fileKey !== 'string' ||
      typeof record.filename !== 'string' ||
      typeof record.origin !== 'string'
    ) {
      continue
    }
    result.push({
      artifactId: record.artifactId,
      fileKey: record.fileKey,
      filename: record.filename,
      origin: record.origin,
    })
  }
  return result
}

/**
 * Public attempt.
 *
 * @param value - value
 * @returns public attempt result
 */
function publicAttempt(value: unknown): PublicVerificationEvidence['activeAttempt'] {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { id?: unknown; startedIn?: unknown; baseline?: unknown }
  if (typeof record.id !== 'string') return undefined
  const fingerprint = summarizeFingerprint(record.baseline) ?? {}
  return {
    id: record.id,
    ...(typeof record.startedIn === 'string' ? { startedIn: record.startedIn } : {}),
    fingerprint,
  }
}

/**
 * Public completed.
 *
 * @param value - value
 * @returns public completed result
 */
function publicCompleted(value: unknown): PublicVerificationEvidence['completed'] {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as {
    id?: unknown
    attemptId?: unknown
    status?: unknown
    fingerprint?: unknown
  }
  if (typeof record.id !== 'string' || typeof record.status !== 'string') return undefined
  const fingerprint = summarizeFingerprint(record.fingerprint) ?? {}
  return {
    id: record.id,
    ...(typeof record.attemptId === 'string' ? { attemptId: record.attemptId } : {}),
    status: record.status,
    fingerprint,
  }
}

/**
 * Summarize artifact map.
 *
 * @param value - value
 * @returns algorithm and file count, or undefined when the value is not a file map
 */
function summarizeArtifactMap(
  value: unknown,
): { readonly algorithm: string; readonly fileCount: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { algorithm?: unknown; files?: unknown }
  if (typeof record.algorithm !== 'string' || !isFileMap(record.files)) return undefined
  return { algorithm: record.algorithm, fileCount: Object.keys(record.files).length }
}

/**
 * Summarize implementation.
 *
 * @param value - value
 * @returns summarize implementation result
 */
function summarizeImplementation(value: unknown): PublicFingerprintSummary['implementation'] {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return null
  const record = value as {
    files?: unknown
    hashAlgorithm?: unknown
    textNormalization?: unknown
    binaryNormalization?: unknown
  }
  if (!isFileMap(record.files)) return null
  const fileCount = Object.keys(record.files).length
  return {
    fileCount,
    observedEmpty: fileCount === 0,
    ...(typeof record.hashAlgorithm === 'string' ? { hashAlgorithm: record.hashAlgorithm } : {}),
    ...(typeof record.textNormalization === 'string'
      ? { textNormalization: record.textNormalization }
      : {}),
    ...(typeof record.binaryNormalization === 'string'
      ? { binaryNormalization: record.binaryNormalization }
      : {}),
  }
}

/**
 * Normalization label.
 *
 * @param implementation - implementation fingerprint fields
 * @param implementation.hashAlgorithm - hash algorithm label
 * @param implementation.textNormalization - text normalization label
 * @param implementation.binaryNormalization - binary normalization label
 * @returns normalization label result
 */
function normalizationLabel(implementation: {
  readonly hashAlgorithm?: string
  readonly textNormalization?: string
  readonly binaryNormalization?: string
}): string {
  const parts = [
    implementation.hashAlgorithm,
    implementation.textNormalization,
    implementation.binaryNormalization,
  ].filter((part): part is string => part !== undefined)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

/**
 * Is file map.
 *
 * @param value - value
 * @returns is file map result
 */
function isFileMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
