# Design: versioned-approval-invalidation

This document is the authoritative implementation contract for versioned manifest validity, approval invalidation, verification evidence, lifecycle recovery, CLI exposure, and skill behaviour. It is intentionally self-contained: implementation must follow the types, algorithms, mutation boundaries, error semantics, wiring, migration rules, and tests defined here without deriving additional behaviour from lifecycle position or historical event ordering.

## Non-goals

- Do not add schema-driven skipping of `implementing` or `verifying`, workflow `when` expressions, or configurable backward-transition topology.
- Do not add symbol-level, AST-level, parser-aware, formatter-driven, or semantic implementation hashing.
- Do not infer verification success from tests, reports, lifecycle transitions, or the existence of an active attempt. Only `CompleteVerification` records successful evidence.
- Do not rewrite archived manifests or v1 active manifests merely because they are read.
- Do not remove, reorder, compact, or rewrite history events.
- Do not make `hasTasks` depend on artifact IDs or filenames.
- Do not make CLI handlers, checks, repositories, or skills choose approval recovery or mutate validity projections independently.

## Architectural invariants

1. Domain services are pure and perform no I/O. The `Change` aggregate enforces projection and event invariants but does not discover files, parse configuration, or choose gate applicability.
2. Application services obtain fresh facts through ports. `ReconcileChangeValidity` is the only application orchestration path allowed to apply artifact review, projection invalidation, audit events, and automatic lifecycle recovery.
3. Infrastructure loads and persists versioned data and reports file facts. Repository hydration never decides validity and never performs migration writes.
4. CLI and skills are delivery adapters. They invoke Core use cases and render canonical results; they never compute fingerprints or repair manifests directly.
5. History is append-only audit evidence. Materialized projections are the sole v2 source of current approval and verification state.
6. `stale` is caused by a changed or unprovable reviewed input. `revoked` is caused by an explicit withdrawal of consent. Neither status heals when bytes later match.
7. Artifact policy, workflow policy, and gate recovery are independent. Gate recovery has priority over workflow policy; artifact policy never waives freshness.
8. All persisted multi-field changes use the existing per-change serialized `ChangeRepository.mutate` boundary and one atomic manifest replacement.
9. Every human identity persisted in an approval, verification projection, invalidation, or matching audit event comes exclusively from the injected `ActorResolver`. Config-based composition must inject `CompositionResolver.getActorResolver()`, whose existing `PrivacyActorResolver` decorator applies the configured masking, hashing, anonymization, and metadata filtering before application code sees the identity. Use cases and repositories must never read Git/VCS identity directly, reconstruct a raw name or email, or apply a second privacy transformation.

## Data models & contracts

### Structured invalidation policy

Replace the scalar domain policy with these complete types in `packages/core/src/domain/value-objects/invalidation-policy.ts`:

```ts
export type ArtifactInvalidationPolicy = 'none' | 'surgical' | 'downstream' | 'global'
export type WorkflowInvalidationPolicy = 'preserve' | 'redesign'

export interface InvalidationPolicy {
  readonly artifacts: ArtifactInvalidationPolicy
  readonly workflow: WorkflowInvalidationPolicy
}

export interface InvalidationPolicyOverride {
  readonly artifacts?: ArtifactInvalidationPolicy
  readonly workflow?: WorkflowInvalidationPolicy
}

export const DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = {
  artifacts: 'downstream',
  workflow: 'preserve',
} as const

export const LEGACY_DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = {
  artifacts: 'downstream',
  workflow: 'redesign',
} as const

export function resolveInvalidationPolicy(
  base: InvalidationPolicy,
  override?: InvalidationPolicyOverride,
): InvalidationPolicy
```

`resolveInvalidationPolicy` overlays only supplied dimensions and returns a new frozen-compatible value. New changes use `DEFAULT_INVALIDATION_POLICY`. A legacy scalar maps to `{ artifacts: scalar, workflow: 'redesign' }`; an absent legacy scalar maps to `LEGACY_DEFAULT_INVALIDATION_POLICY`.

### Fingerprints

Add `packages/core/src/domain/value-objects/validity-fingerprint.ts` with the following public contract:

```ts
export type Sha256Digest = `sha256:${string}`
export type ArtifactFingerprintAlgorithm = 'artifact-pre-hash-v1'
export type TextNormalizationAlgorithm = 'text-v1'
export type BinaryNormalizationAlgorithm = 'bytes-v1'

export interface ArtifactFingerprint {
  readonly version: 1
  readonly algorithm: ArtifactFingerprintAlgorithm
  readonly files: Readonly<Record<string, Sha256Digest>>
}

export interface SpecApprovalFingerprint {
  readonly version: 1
  readonly specIds: readonly string[]
  readonly artifacts: ArtifactFingerprint
}

export interface ImplementationFingerprintEntry {
  readonly hash: Sha256Digest
  readonly content: 'text' | 'binary'
  readonly normalization: TextNormalizationAlgorithm | BinaryNormalizationAlgorithm
}

export interface ImplementationFingerprint {
  readonly version: 1
  readonly hashAlgorithm: 'sha256'
  readonly textNormalization: TextNormalizationAlgorithm
  readonly binaryNormalization: BinaryNormalizationAlgorithm
  readonly files: Readonly<Record<string, ImplementationFingerprintEntry>>
}

export interface ValidityFingerprint {
  readonly version: 1
  readonly artifacts: ArtifactFingerprint
  readonly implementation: ImplementationFingerprint
}

export interface FingerprintDifference {
  readonly scope: 'spec' | 'artifact' | 'implementation'
  readonly key: string
  readonly kind:
    | 'spec-added'
    | 'spec-removed'
    | 'added'
    | 'removed'
    | 'changed'
    | 'algorithm-changed'
    | 'unreadable'
  readonly expected?: string
  readonly actual?: string
}

export interface FingerprintComparison {
  readonly equal: boolean
  readonly differences: readonly FingerprintDifference[]
}

export function normalizeTextV1(content: string): string
export function compareArtifactFingerprints(
  expected: ArtifactFingerprint,
  actual: ArtifactFingerprint,
): FingerprintComparison
export function compareSpecApprovalFingerprints(
  expected: SpecApprovalFingerprint,
  actual: SpecApprovalFingerprint,
): FingerprintComparison
export function compareImplementationFingerprints(
  expected: ImplementationFingerprint,
  actual: ImplementationFingerprint,
): FingerprintComparison
export function compareValidityFingerprints(
  expected: ValidityFingerprint,
  actual: ValidityFingerprint,
): FingerprintComparison
```

All record keys and `SpecApprovalFingerprint.specIds` are canonicalized, deduplicated, and inserted in lexical order before serialization. Spec scope equality compares the complete canonical set; input ordering and duplicates are immaterial, while additions and removals produce `spec-added` and `spec-removed` differences with `scope: 'spec'`. Other equality compares the version, algorithm identifiers, complete key set, content kind, normalization identifier, and digest. `normalizeTextV1` performs, in order: remove one leading UTF-8 BOM; replace CRLF and lone CR with LF; remove trailing spaces and tabs from every line; thereby turn whitespace-only lines into empty lines; remove all terminal LF characters and append exactly one LF. It does not alter leading indentation, internal whitespace, Unicode normalization, strings, or formatting.

Implementation file classification is deterministic: bytes are text only when they contain no NUL byte and a fatal UTF-8 `TextDecoder` can decode the complete byte sequence. All other inputs are binary. Text is decoded, normalized, UTF-8 encoded, then SHA-256 hashed. Binary is SHA-256 hashed byte-for-byte. Empty text normalizes to `"\n"`; an empty binary file hashes zero bytes. Artifact content continues using schema `preHashCleanup` followed by the existing UTF-8 SHA-256 hasher.

Artifact keys remain `${artifactType}:${fileKey}`. Implementation keys are normalized POSIX project-relative paths: replace `\\` with `/`, remove redundant `.` segments, reject absolute paths, reject empty paths, reject any `..` segment after normalization, deduplicate, and lexical-sort. Symbol refinements and `fileLinkExplicit` do not narrow the file content. A change in the path set is a fingerprint change even if hashes match.

### Approval and verification projections

Extend `ChangeProps` and `Change` with these domain types and immutable-copy getters:

```ts
export type ProjectionStatus = 'valid' | 'stale' | 'revoked'

export type ValidityInvalidationCause =
  | 'artifact-drift'
  | 'implementation-drift'
  | 'scope-change'
  | 'manual-invalidation'
  | 'verification-invalidated'
  | 'spec-overlap-conflict'
  | 'legacy-unknown'

export interface ProjectionInvalidation {
  readonly at: Date
  readonly by: ActorIdentity
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

export interface ApprovalDecision {
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
}

export interface SpecApprovalProjection {
  readonly status: ProjectionStatus
  readonly decision: ApprovalDecision
  readonly fingerprint: SpecApprovalFingerprint
  readonly invalidation?: ProjectionInvalidation
}

export interface SignoffProjection {
  readonly status: ProjectionStatus
  readonly decision: ApprovalDecision
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly verificationId: string | null
  readonly invalidation?: ProjectionInvalidation
}

export interface VerificationAttempt {
  readonly id: string
  readonly startedAt: Date
  readonly startedBy: ActorIdentity
  readonly startedIn: ChangeState
  readonly baseline: ValidityFingerprint
}

export interface CompletedVerification {
  readonly id: string
  readonly attemptId: string
  readonly status: 'valid' | 'stale'
  readonly completedAt: Date
  readonly completedBy: ActorIdentity
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly invalidation?: ProjectionInvalidation
}

export interface VerificationProjection {
  readonly activeAttempt?: VerificationAttempt
  readonly completed?: CompletedVerification
}
```

`null` implementation fingerprints are legal only for evidence adapted from v1 history. Native start, completion, and sign-off always persist a concrete `ImplementationFingerprint`, including an observed empty `files` map. Absence of a projection means no approval or completed verification has ever been recorded; it is not equivalent to legacy unknown evidence.

Attempt IDs are aggregate-local and deterministic: `verification-attempt-<n>`, where `n` is one plus the number of `verification-attempt-started` events already in history. Completed evidence ID is `verification-<n>` using the same attempt ordinal. Repository serialization provides concurrency safety because creation occurs inside `mutate`.

Starting a new attempt replaces only `verification.activeAttempt`; any previous active attempt remains in history and the current completed evidence is left unchanged. Completing atomically writes `verification.completed`, removes `activeAttempt`, and appends completion. A second completion without an active attempt fails. Explicit invalidation leaves the active attempt unchanged, marks completed evidence stale once, and preserves the first invalidation metadata.

### Audit events

Keep all existing event variants for v1 compatibility and add:

```ts
export interface ApprovalInvalidatedEvent {
  readonly type: 'approval-invalidated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly gate: 'spec' | 'signoff'
  readonly status: 'stale' | 'revoked'
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

export interface VerificationAttemptStartedEvent {
  readonly type: 'verification-attempt-started'
  readonly at: Date
  readonly by: ActorIdentity
  readonly attemptId: string
  readonly state: ChangeState
  readonly fingerprintVersion: 1
  readonly artifactAlgorithm: ArtifactFingerprintAlgorithm
  readonly textNormalization: TextNormalizationAlgorithm
  readonly binaryNormalization: BinaryNormalizationAlgorithm
}

export interface VerificationCompletedEvent {
  readonly type: 'verification-completed'
  readonly at: Date
  readonly by: ActorIdentity
  readonly attemptId: string
  readonly verificationId: string
}

export interface VerificationInvalidatedEvent {
  readonly type: 'verification-invalidated'
  readonly at: Date
  readonly by: ActorIdentity
  readonly verificationId: string
  readonly reason: string
}

export interface SpecApprovedEventV2 {
  readonly type: 'spec-approved'
  readonly at: Date
  readonly by: ActorIdentity
  readonly reason: string
  readonly fingerprint: SpecApprovalFingerprint
}
```

The strict v2 serializer for `ApprovalInvalidatedEvent.differences` MUST use the complete `FingerprintDifference` union, not an event-local subset:

```ts
export interface FingerprintDifference {
  readonly scope: 'artifact' | 'implementation' | 'spec'
  readonly key: string
  readonly kind:
    | 'added'
    | 'removed'
    | 'changed'
    | 'algorithm-changed'
    | 'unreadable'
    | 'spec-added'
    | 'spec-removed'
  readonly expected?: string
  readonly actual?: string
}
```

The schema accepts `scope: 'spec'` and `kind: 'spec-added' | 'spec-removed'` so a valid scope invalidation round-trips. It remains strict: unknown scopes, unknown kinds, or extra fields fail v2 parsing. Domain type, raw type, Zod schema, loader, and serializer all import or derive from this single union so they cannot diverge.

Events never include source bytes. Existing v1 and transitional-v2 `spec-approved` and `signed-off` events remain readable. Every new `spec-approved` event MUST contain the complete `SpecApprovalFingerprint`; it may additionally retain the current artifact-hash compatibility field during the deprecation window, but the projection and event fingerprint must be equal. A legacy approval event without `fingerprint.specIds` adapts as scope-unknown and cannot authorize a required gate. V2 current validity is read exclusively from projections. `signoff-invalidated` adapts as a revoked sign-off. New code uses `approval-invalidated` for precise status and cause. Existing broad `invalidated` remains artifact-review audit evidence and no longer implicitly clears every projection.

### Manifest v1 and v2

In `packages/core/src/infrastructure/fs/manifest.ts`, define and validate a discriminated raw union:

```ts
export type ChangeManifest = LegacyChangeManifestV1 | ChangeManifestV2

export interface LegacyChangeManifestV1 {
  readonly manifestVersion?: undefined
  readonly name: string
  readonly createdAt: string
  readonly updatedAt?: string
  readonly description?: string
  readonly archivedAt?: string
  readonly archivedBy?: ManifestActorIdentity
  readonly schema: { readonly name: string; readonly version: number }
  readonly workspaces?: readonly string[]
  readonly specIds: readonly string[]
  readonly specDependsOn?: Readonly<Record<string, readonly string[]>>
  readonly invalidationPolicy?: ArtifactInvalidationPolicy
  readonly implementationTrackingStartedAt?: string | null
  readonly trackedImplementationFiles?: readonly TrackedImplementationFile[]
  readonly implementationLinks?: readonly ImplementationLink[]
  readonly artifacts: readonly RawChangeArtifact[]
  readonly history: readonly RawChangeEventV1[]
}

export interface ChangeManifestV2 {
  readonly manifestVersion: 2
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly description?: string
  readonly archivedAt?: string
  readonly archivedBy?: ManifestActorIdentity
  readonly schema: { readonly name: string; readonly version: number }
  readonly specIds: readonly string[]
  readonly specDependsOn?: Readonly<Record<string, readonly string[]>>
  readonly invalidation: InvalidationPolicy
  readonly artifacts: readonly RawChangeArtifact[]
  readonly trackedImplementationFiles?: readonly TrackedImplementationFile[]
  readonly implementationLinks?: readonly ImplementationLink[]
  readonly implementationTrackingStartedAt?: string | null
  readonly specApproval?: RawSpecApprovalProjection
  readonly signoff?: RawSignoffProjection
  readonly verification?: RawVerificationProjection
  readonly history: readonly RawChangeEventV2[]
}

export const MAX_SUPPORTED_MANIFEST_VERSION = 2
export function parseChangeManifest(raw: unknown): ChangeManifest
```

The raw projection definitions are exact JSON forms of the domain projections: every `Date` is an ISO-8601 string and all other fields retain the domain name and type. They are not left implicit:

```ts
export interface RawProjectionInvalidation {
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly cause: ValidityInvalidationCause
  readonly reason: string
  readonly differences: readonly FingerprintDifference[]
}

export interface RawApprovalDecision {
  readonly at: string
  readonly by: ManifestActorIdentity
  readonly reason: string
}

export interface RawSpecApprovalProjection {
  readonly status: ProjectionStatus
  readonly decision: RawApprovalDecision
  readonly fingerprint: SpecApprovalFingerprint
  readonly invalidation?: RawProjectionInvalidation
}

export interface RawSignoffProjection {
  readonly status: ProjectionStatus
  readonly decision: RawApprovalDecision
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly verificationId: string | null
  readonly invalidation?: RawProjectionInvalidation
}

export interface RawVerificationAttempt {
  readonly id: string
  readonly startedAt: string
  readonly startedBy: ManifestActorIdentity
  readonly startedIn: ChangeState
  readonly baseline: ValidityFingerprint
}

export interface RawCompletedVerification {
  readonly id: string
  readonly attemptId: string
  readonly status: 'valid' | 'stale'
  readonly completedAt: string
  readonly completedBy: ManifestActorIdentity
  readonly fingerprint: {
    readonly version: 1
    readonly artifacts: ArtifactFingerprint
    readonly implementation: ImplementationFingerprint | null
  }
  readonly invalidation?: RawProjectionInvalidation
}

export interface RawVerificationProjection {
  readonly activeAttempt?: RawVerificationAttempt
  readonly completed?: RawCompletedVerification
}

export type RawChangeEventV2 =
  | RawChangeEventV1
  | RawSpecApprovedEventV2
  | RawApprovalInvalidatedEvent
  | RawVerificationAttemptStartedEvent
  | RawVerificationCompletedEvent
  | RawVerificationInvalidatedEvent

export interface RawApprovalInvalidatedEvent extends Omit<ApprovalInvalidatedEvent, 'at' | 'by'> {
  readonly at: string
  readonly by: ManifestActorIdentity
}

export interface RawVerificationAttemptStartedEvent extends Omit<
  VerificationAttemptStartedEvent,
  'at' | 'by'
> {
  readonly at: string
  readonly by: ManifestActorIdentity
}

export interface RawVerificationCompletedEvent extends Omit<
  VerificationCompletedEvent,
  'at' | 'by'
> {
  readonly at: string
  readonly by: ManifestActorIdentity
}

export interface RawVerificationInvalidatedEvent extends Omit<
  VerificationInvalidatedEvent,
  'at' | 'by'
> {
  readonly at: string
  readonly by: ManifestActorIdentity
}

export interface RawSpecApprovedEventV2 extends Omit<SpecApprovedEventV2, 'at' | 'by'> {
  readonly at: string
  readonly by: ManifestActorIdentity
}
```

`ManifestActorIdentity` contains required `name` and `email`, plus optional `provider`, `providerId`, and `metadata: Record<string,string>`. `RawChangeArtifact` is the existing array entry `{ type, optional, requires, state?, files }`; each file is `{ key, filename, state?, validatedHash: string | null, hasDrift? }`. `RawChangeEventV1` is the exact union of existing `created`, `transitioned`, `spec-approved`, `signed-off`, `signoff-invalidated`, `invalidated`, `archive-failed`, `drafted`, `restored`, `discarded`, `artifact-skipped`, `artifacts-synced`, and `description-updated` records. Every record has `type`, ISO `at`, and `by`; its payload remains respectively: creation spec/schema identity; from/to; reason plus artifact hashes; reason plus artifact hashes; no extra payload; cause/message/affected artifacts; step/message/commitStarted; optional reason; no extra payload; reason/optional supersededBy; artifactId/optional reason; added/removed types/files; or description. The four new raw events have the same fields as their domain event definitions with `at: string`. Zod schemas are strict for projections/fingerprints and validate digest strings with `^sha256:[0-9a-f]{64}$`; legacy event parsing remains passthrough-compatible so old additive event fields are retained. V2 does not persist the legacy computed `workspaces` field. Archive writes set `archivedAt` and `archivedBy` without changing `manifestVersion` or validity evidence.

`parseChangeManifest` first inspects `raw.manifestVersion` as unknown. Missing means v1 and invokes the v1 schema. Exact `2` invokes the v2 schema. Any other number, non-number present value, or version greater than 2 throws `UnsupportedManifestVersionError`; malformed supported shapes remain `CorruptedManifestError`. The v2 reader temporarily accepts pre-contract approval projections/events whose fingerprint contains artifacts but no `specIds`; the adapter marks that approval stale with `legacy-unknown` and an unknown-scope diagnostic rather than copying current scope. Every new v2 write requires the strict complete scope-aware shape, includes all structured fields, and never emits `invalidationPolicy`.

The v1 adapter replays history exactly once at the infrastructure boundary to derive the latest known spec approval and sign-off. Every v1 spec approval lacks a reliable approved-scope snapshot and therefore adapts as stale with cause `legacy-unknown`, even if artifact hashes are present. A later `invalidated` event remains audit evidence; `signoff-invalidated` makes sign-off revoked. A v1 sign-off has `implementation: null`. If historical verification can be recognized but has no captured fingerprint, adapt it as stale completed evidence with `implementation: null`; otherwise verification is absent. Current scope and files must never be used to invent a legacy baseline.

Plain `get`, archive inspection, list indexing, and status lookup before reconciliation do not write. Any successful active mutation serializes the in-memory aggregate as v2. Archived content remains in its original version unless a separate explicit archive migration is introduced in a future change.

### Fresh implementation-file port

Extend `ChangeRepository` with an explicit safe read rather than allowing application code to import `fs`:

```ts
export type ImplementationFileReadResult =
  | { readonly status: 'found'; readonly path: string; readonly bytes: Uint8Array }
  | { readonly status: 'missing'; readonly path: string }
  | { readonly status: 'unreadable'; readonly path: string; readonly reason: string }
  | { readonly status: 'outside-project'; readonly path: string }

abstract implementationFile(
  change: Change,
  projectRelativePath: string,
): Promise<ImplementationFileReadResult>
```

The filesystem adapter resolves against `config.projectRoot`, verifies the resolved target is contained by that root after normalization, reads bytes without text coercion, and returns an explicit fact for every failure. It must not follow an input path outside the project root. The in-memory test repository implements the full method.

### Validity facts, verdict, and recovery

Add pure contracts in `packages/core/src/domain/services/change-validity.ts`:

```ts
export interface ArtifactReviewTarget {
  readonly artifactId: string
  readonly fileKey: string
  readonly filename: string
  readonly origin: 'drift' | 'direct' | 'downstream' | 'global' | 'parent'
}

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
    | 'VERIFICATION_VALIDITY_UNAVAILABLE'
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface ChangeValidityFacts {
  readonly currentFingerprint: ValidityFingerprint | null
  readonly currentSpecApprovalFingerprint: SpecApprovalFingerprint | null
  readonly fingerprintFailures: readonly FingerprintInputFailure[]
  readonly driftedArtifacts: readonly ArtifactReviewTarget[]
  readonly pendingReviewArtifacts: readonly ArtifactReviewTarget[]
  readonly taskArtifacts: ReadonlySet<string>
  readonly approvalsRequired: { readonly spec: boolean; readonly signoff: boolean }
  readonly verificationRequired: boolean
}

export type AutomaticRecovery =
  | { readonly cause: 'spec-approval'; readonly from: ChangeState; readonly to: 'designing' }
  | { readonly cause: 'signoff'; readonly from: ChangeState; readonly to: 'done' }
  | { readonly cause: 'workflow-redesign'; readonly from: ChangeState; readonly to: 'designing' }

export interface ProjectionChange {
  readonly projection: 'specApproval' | 'signoff' | 'verification'
  readonly from: ProjectionStatus | 'absent'
  readonly to: ProjectionStatus | 'absent'
  readonly cause: ValidityInvalidationCause
  readonly differences: readonly FingerprintDifference[]
}

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

export function evaluateChangeValidity(
  change: Change,
  facts: ChangeValidityFacts,
  policy: InvalidationPolicy,
): ChangeValidityVerdict
```

Recovery priority is fixed:

1. A required spec approval that changes from valid to stale/revoked requests `designing`.
2. Otherwise a required sign-off that changes from valid to stale/revoked requests `done` only when the current state is later than `done` on the canonical delivery axis.
3. Otherwise `workflow: redesign` plus unresolved non-task artifact drift/review requests `designing`.
4. Otherwise lifecycle state is preserved.

Recovery never advances an earlier state: a stale sign-off observed in `designing`, `ready`, `implementing`, `verifying`, or `done` does not transition to `done`; a stale spec approval already in `designing` produces no transition. Verification staleness alone never moves lifecycle state. Before `verifying` it is contextual; at `verifying -> done`, sign-off, and archive boundaries it blocks and recommends verification in place.

### Reconciliation use case

Add `packages/core/src/application/use-cases/reconcile-change-validity.ts`:

```ts
export interface ReconcileChangeValidityInput {
  readonly name: string
  readonly intent?: ReconciliationIntent
  readonly refreshImplementationTracking?: boolean
  /** Already decorated identity for one caller-owned logical operation. */
  readonly actor?: ActorIdentity
}

export type ReconciliationIntent =
  | { readonly type: 'observe' }
  | {
      readonly type: 'manual-invalidation'
      readonly reason: string
      readonly policy: InvalidationPolicy
      readonly targets: readonly ArtifactReviewTarget[]
      readonly revoke: readonly ('spec' | 'signoff')[]
    }
  | { readonly type: 'verification-invalidation'; readonly reason: string }
  | {
      readonly type: 'spec-overlap-conflict'
      readonly reason: string
      readonly targets: readonly ArtifactReviewTarget[]
    }

export interface ReconcileChangeValidityResult {
  readonly change: Change
  readonly verdict: ChangeValidityVerdict
  readonly projectionChanges: readonly ProjectionChange[]
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  readonly automaticReturn: AutomaticRecovery | null
  readonly changed: boolean
}

export interface ReconcileChangeValidityDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
  readonly actor: ActorResolver
  readonly refreshImplementationTracking: RefreshImplementationTracking
  readonly fingerprint: ValidityFingerprintService
  readonly approvals: { readonly spec: boolean; readonly signoff: boolean }
}

export class ReconcileChangeValidity {
  constructor(deps: ReconcileChangeValidityDeps)
  execute(input: ReconcileChangeValidityInput): Promise<ReconcileChangeValidityResult>
  mutate<T>(
    input: ReconcileChangeValidityInput,
    operation: (context: ReconciledMutationContext) => Promise<T> | T,
  ): Promise<ReconciledMutationResult<T>>
}

export interface ReconciledMutationContext {
  readonly change: Change
  readonly before: ChangeValidityVerdict
  readonly fingerprint: ValidityFingerprint | null
  reconcileAfter(intent?: ReconciliationIntent): Promise<ChangeValidityVerdict>
}

export interface ReconciledMutationResult<T> extends ReconcileChangeValidityResult {
  readonly result: T
}
```

`execute` owns a repository mutation, optionally refreshes tracking before it, collects fresh facts inside the serialized window, evaluates, applies only new consequences, and returns the persisted aggregate. `mutate` is the same orchestration path with a caller operation between the pre- and post-evaluation. It exists so scope edits, validation, approvals, and verification mutations cannot update a baseline while losing pre-mutation drift evidence. Callers must not invoke `Change.invalidate`, projection invalidators, or recovery transitions outside this coordinator.

Actor resolution is operation-scoped. A human-triggered use case first calls its already privacy-decorated `ActorResolver.identity()` exactly once, then passes that value in `input.actor` to every `execute`/`mutate` stage belonging to the logical operation. The reconciler MUST reuse a supplied actor for projection invalidation, artifact invalidation, recovery transitions, caller mutation, and all audit events; it MUST NOT call its own resolver in that branch. When `actor` is absent for a system observation such as status, the reconciler resolves its configured system/decorated actor once for that reconciliation. This prevents the caller and reconciler from recording different names, emails, providers, or metadata.

If a requested transition/archive is no longer applicable after reconciliation, the caller returns or throws only after `execute` has committed recovery. It then opens a second serialized mutation for the requested operation, performs a fresh in-mutation reconciliation, reruns checks, and commits only if still applicable. This deliberate two-stage flow prevents a thrown transition error from rolling back an already detected mandatory recovery.

The reconciler is idempotent by comparing persisted projection status/invalidation identity, artifact review states, and current lifecycle state before mutation. The same facts append no second invalidation or transition event. It logs diagnostics but does not cache external-file freshness by manifest mtime.

Automatic recovery is not a user transition. Add a recovery-only aggregate operation and topology:

```ts
export type RecoveryTransitionTable = Readonly<
  Record<
    AutomaticRecovery['cause'],
    Readonly<Partial<Record<ChangeState, ChangeState>>>
  >
>

export const RECOVERY_ONLY_TRANSITIONS: RecoveryTransitionTable

recover(recovery: AutomaticRecovery, actor: ActorIdentity): void
```

`recover` verifies `change.state === recovery.from`, permits spec/workflow recovery to `designing`, and permits sign-off recovery from `signed-off`, `archivable`, or `archiving` to `done`; it appends the normal attributed transition evidence exactly once. These recovery-only edges are not advertised by `VALID_TRANSITIONS`, `availableTransitions`, `HAPPY_PATH_NEXT`, or `TransitionChange`. Therefore a manual request for `archiving -> done`, `archivable -> done`, or `signed-off -> done` fails `protocol.edge`, while the central reconciler can apply the same target through `recover`. Existing manual `archiving -> archivable` and `archiving -> designing` remain valid; manual `archiving -> implementing|verifying` remains invalid.

### Verification use cases

Add these application contracts:

```ts
export interface StartVerificationInput {
  readonly name: string
}
export interface StartVerificationResult {
  readonly change: Change
  readonly attempt: VerificationAttempt
  readonly supersededAttemptId: string | null
  readonly reconciliation: ReconcileChangeValidityResult
}
export interface StartVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly schemaProvider: SchemaProvider
  readonly reconcileChangeValidity: ReconcileChangeValidity
  readonly refreshImplementationTracking: RefreshImplementationTracking
  readonly fingerprint: ValidityFingerprintService
  readonly implementationChecks: readonly Check[]
}

export interface CompleteVerificationInput {
  readonly name: string
}
export interface CompleteVerificationResult {
  readonly change: Change
  readonly verification: CompletedVerification
  readonly reconciliation: ReconcileChangeValidityResult
}
export interface CompleteVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly reconcileChangeValidity: ReconcileChangeValidity
  readonly fingerprint: ValidityFingerprintService
}

export interface InvalidateVerificationInput {
  readonly name: string
  readonly reason: string
}
export interface InvalidateVerificationResult {
  readonly change: Change
  readonly verification: CompletedVerification
  readonly invalidated: boolean
  readonly reason: string
  readonly signoffChanged: boolean
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}
export interface InvalidateVerificationDeps {
  readonly changes: ChangeRepository
  readonly actor: ActorResolver
  readonly reconcileChangeValidity: ReconcileChangeValidity
}
```

Each use case has `createX(deps)`, `createX(config, options?)`, and `resolveXDeps(resolver)` following `normalizeCompositionFactoryArgs`. Supplying options with the deps overload throws the existing `InvalidCompositionFactoryArgumentsError`. None bootstraps a full kernel.

For every factory in this design that has an `actor: ActorResolver` dependency, `resolveXDeps(resolver)` must obtain it through `resolver.getActorResolver()`. The config overload therefore always receives the already privacy-decorated resolver. The direct-deps overload remains injectable for tests and hosts; its caller owns construction of the supplied resolver, and the use case consumes the returned `ActorIdentity` without bypassing or redecorating it.

The exported factory signatures are not shorthand; implement all overloads explicitly for `StartVerification`, `CompleteVerification`, `InvalidateVerification`, and `ReconcileChangeValidity`:

```ts
export function createX(deps: XDeps): X
export function createX(config: SpecdConfig, options?: CompositionResolutionOptions): X
export function resolveXDeps(resolver: CompositionResolver): XDeps
```

`StartVerification` is valid in every active lifecycle state. It refreshes implementation tracking, executes the registered `impl.filesResolved` and `impl.linksInScope` checks using the normal check execution context, fails before baseline creation when either fails, calculates a complete fingerprint, and starts the attempt through `ReconcileChangeValidity.mutate`. Repeated start supersedes only the active attempt. Starting with identical inputs is still a new attempt because it represents new verification work. Existing completed evidence remains as-is unless ordinary reconciliation has already made it stale.

`StartVerificationDeps.schemaProvider` is mandatory. Start resolves the change schema and constructs a `scope: 'operation', operation: 'verification-start'` check context containing the reconciled change, schema, validity verdict, implementation state, and actual change name. It does not construct a fake transition or `verifying -> verifying` context. The check runner selects the two stable implementation readiness IDs and deduplicates by ID before execution.

`CompleteVerification` requires an active attempt. Inside the reconciled mutation it collects fresh facts, compares the active baseline with the fresh fingerprint using `compareValidityFingerprints`, and on equality records completion. It never runs tests. On mismatch, unreadable input, or missing attempt it makes no baseline or success mutation. After failure the skill must inspect, run `start` again, repeat verification work, and only then complete.

`InvalidateVerification` requires completed evidence. It uses the reconciliation intent to mark valid or legacy-unknown evidence stale, appends one event, and makes a current valid sign-off stale because that human consent depended on the completed verification ID. An already stale verification still performs observe/reconcile, then returns a successful `invalidated: false` result with the first persisted invalidation reason; a different new input reason is ignored and never echoed as stored evidence. It never starts an attempt, calculates a new baseline, or transitions to the same state.

### Changed aggregate and existing use-case signatures

The `Change` aggregate exposes these new/changed operations. Every argument containing external facts is supplied by application code; the methods perform no I/O:

```ts
get specApproval(): SpecApprovalProjection | undefined
get signoff(): SignoffProjection | undefined
get verification(): VerificationProjection
get invalidationPolicy(): InvalidationPolicy
set invalidationPolicy(policy: InvalidationPolicy)

invalidate(
  cause: InvalidatedEvent['cause'],
  actor: ActorIdentity,
  message: string,
  affectedArtifacts: readonly InvalidatedArtifactEntry[],
  dag: ArtifactDag,
  policy?: InvalidationPolicy,
  taskArtifactIds?: ReadonlySet<string>,
): void

recordSpecApproval(
  reason: string,
  fingerprint: SpecApprovalFingerprint,
  actor: ActorIdentity,
): void
recordSignoff(
  reason: string,
  fingerprint: SignoffProjection['fingerprint'],
  verificationId: string,
  actor: ActorIdentity,
): void
markApprovalInvalid(
  gate: 'spec' | 'signoff',
  status: 'stale' | 'revoked',
  invalidation: ProjectionInvalidation,
): boolean
startVerification(
  baseline: ValidityFingerprint,
  actor: ActorIdentity,
  at?: Date,
): { readonly attempt: VerificationAttempt; readonly supersededAttemptId: string | null }
completeVerification(actor: ActorIdentity, at?: Date): CompletedVerification
invalidateVerification(invalidation: ProjectionInvalidation): boolean
```

`markApprovalInvalid` and `invalidateVerification` return `false` without touching `updatedAt` or history when the same or stronger terminal state is already present. `revoked` is stronger than `stale`; automatic drift never changes revoked back to stale. Renewal replaces the current projection with valid evidence and leaves all old events intact. Compatibility getters `activeSpecApproval` and `activeSignoff` remain temporarily available but return the latest approval event only when the corresponding projection is `valid`; new validity logic must not use them.

The changed public application inputs/results are:

```ts
export interface CreateChangeInput {
  readonly name: string
  readonly description?: string
  readonly specIds: readonly string[]
  readonly schemaName?: string
  readonly schemaVersion?: number
  readonly invalidation?: InvalidationPolicy
  readonly includeOverlapCheck?: boolean
}

export interface EditChangeInput {
  readonly name: string
  readonly addSpecIds?: readonly string[]
  readonly removeSpecIds?: readonly string[]
  readonly description?: string
  readonly invalidation?: InvalidationPolicyOverride
}

export interface EditChangeResult {
  readonly change: Change
  readonly invalidated: boolean
  readonly scopeChanged: boolean
  readonly validityChanged: boolean
  readonly effectivePolicy: InvalidationPolicy
  readonly projectionChanges: readonly ProjectionChange[]
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}

export interface InvalidateChangeInput {
  readonly name: string
  readonly reason: string
  readonly policyOverride?: InvalidationPolicyOverride
  readonly targets?: readonly InvalidateTargetInput[]
  readonly force?: boolean
}

export interface InvalidateChangeResult {
  readonly change: Change
  readonly reason: string
  readonly effectivePolicy: InvalidationPolicy
  readonly affected: readonly AffectedArtifactFile[]
  readonly projectionChanges: readonly ProjectionChange[]
  readonly automaticReturn: AutomaticRecovery | null
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}
```

`EditChangeResult.invalidated` is a deprecated compatibility alias for `validityChanged`; it is never derived from `scopeChanged`. `ApproveSpecInput` and `ApproveSignoffInput` remain `{ readonly name: string; readonly reason: string }`; both continue returning the persisted `Change`. `TransitionChangeInput` retains its existing target/hook/refresh/bypass fields and `GetStatusInput` retains its fields; their results gain canonical validity information without removing existing fields. This is additive for SDK hosts except for the intentional scalar-to-structured invalidation-policy type replacement.

`InvalidateChangeResult.reason` is the exact human-readable reason persisted for this successful invocation. Text includes it, and JSON/TOON expose it as the named `reason` field; adapters never reconstruct it from history or omit it from structured output.

`CreateChange` resolves policy at the application boundary, not in a CLI-only adapter. Its direct-dependency factory accepts an explicit project default policy dependency and its config-based factory obtains the resolved project default from `CompositionResolver`; `CompositionKernel` wires that same resolved value. Resolution order is exact: a complete `input.invalidation` wins, otherwise the injected project default wins, and only a deliberately constructed downstream host that supplies neither may use `DEFAULT_INVALIDATION_POLICY` (`{ artifacts: 'downstream', workflow: 'preserve' }`) as the compatibility fallback. The use case persists the resolved complete pair. A CLI flag therefore overrides project configuration, while omitted flags inherit project configuration identically through the CLI, kernel, config factory, and direct application host.

`EditChange` obtains the canonical workspace set through the existing `ListWorkspaces` use case/port contract. When `scopeChanged` is true it refreshes implementation tracking even if reconciliation produces no approval or verification projection change; scope and validity are independent facts. The refresh must not be conditioned on the deprecated `invalidated` alias.

Approval, sign-off, verification, and invalidation operations resolve the actor once per logical operation through their injected `ActorResolver`. The exact decorated `ActorIdentity` returned by that port is passed into reconciliation and reused for the materialized projection mutation and every audit/transition event, so their names, emails, and metadata cannot diverge. Automatic operations use the existing system-actor convention only where the current operation already has no human initiator; introducing reconciliation does not convert a human-triggered approval or invalidation into a raw or system identity.

### Registered check

Extend `CheckId` and `CHECK_LABELS` with:

```ts
| 'verification.current'

'verification.current': 'Checking verification freshness'
```

Add `packages/core/src/application/checks/verification-current.ts`. Its `execute(ctx)` consumes `ctx.validity`, never reads files itself, and returns:

- pass when evidence is required and completed verification is `valid` for the reconciled fingerprint;
- fail `VERIFICATION_REQUIRED` when absent;
- fail `VERIFICATION_IN_PROGRESS` when only an active attempt exists;
- fail `VERIFICATION_STALE` when stale, legacy-unknown, mismatched, or unresolvable, with structured differences/failures and command `specd changes verification start <name>` in details;
- fail `VERIFICATION_VALIDITY_UNAVAILABLE` when the canonical verification verdict is absent at a boundary where the check is applicable; absence is never interpreted as `not-required`;
- skip only when the shared verdict explicitly says verification is not required. This branch is reserved for later workflow skipping and does not fabricate evidence.

Bind it to `verifying -> done`. Bind `impl.filesResolved` and `impl.linksInScope` to both `{ from: 'implementing', to: '*', along: 'forward' }` and `{ from: '*', to: 'verifying', along: '*' }`, plus their archive operation bindings. The matching-check collector MUST deduplicate by stable `CheckId` while preserving registry order, so `implementing -> verifying` executes each readiness check once. Entry from another state and forward exit to another state each retain the applicable guard. Archive and sign-off consume the same validity verdict through their existing checks; they do not invoke `CompleteVerification`. Entering `verifying` never captures a baseline. `verifying -> verifying` remains rejected by `protocol.edge`. Future skip support must attach crossed-boundary metadata when both endpoints omit a guarded phase; this change does not infer that route yet.

### Status projection

Extend `GetStatusResult` with:

```ts
export interface ApprovalStatusProjection {
  readonly required: boolean
  readonly status: 'not-required' | 'absent' | ProjectionStatus
  readonly decision?: ApprovalDecision
  readonly invalidation?: ProjectionInvalidation
}

export interface VerificationStatusProjection {
  readonly requiredAtCurrentBoundary: boolean
  readonly activeAttempt?: VerificationAttempt
  readonly completed?: CompletedVerification
  readonly freshness: 'not-required' | 'absent' | 'in-progress' | 'valid' | 'stale'
}

export interface ValidityStatusProjection {
  readonly specApproval: ApprovalStatusProjection
  readonly signoff: ApprovalStatusProjection
  readonly verification: VerificationStatusProjection
  readonly automaticReturn: AutomaticRecovery | null
  readonly projectionChanges: readonly ProjectionChange[]
  readonly affectedArtifacts: readonly ArtifactReviewTarget[]
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction
}
```

Active `GetStatus` always reconciles before projecting, even when `ifModifiedSince` matches, because manifest mtime cannot prove external-file freshness. Draft status remains read-only and may use the timestamp shortcut. `refreshImplementationTracking: false` is honored, but reconciliation still evaluates current known links and files. The public `GetStatusResult.validity` type is `ValidityStatusProjection`, assembled from both the committed aggregate and `ChangeValidityVerdict`; it is not an alias for or raw exposure of `ChangeValidityVerdict`. Active attempt and completed evidence remain simultaneously visible. The returned state, blockers, and next action describe the committed post-recovery aggregate.

The active path resolves `SchemaProvider.get()` before refresh or reconciliation. If it throws, `GetStatus` catches that exact failure and returns the existing degraded lifecycle projection with blocker code `SCHEMA_RESOLUTION_FAILED`, no mutating transitions, and schema-recovery guidance. It MUST NOT invoke `RefreshImplementationTracking`, the reconciler, or repository save/mutate after that failure. This ordering makes graceful degradation reachable with the real reconciler rather than only with test doubles. Draft lookup remains read-only and does not require active reconciliation.

## Affected areas

### Core domain and application

- `packages/core/src/domain/entities/change.ts` — CRITICAL hotspot within the fresh combined impact set (532 direct dependents, 1,023 transitive dependents, 365 affected files across the five central targets). `ChangeProps` gains structured policy and projections; `activeSpecApproval`/`activeSignoff` become compatibility aliases over materialized projections; `invalidate` accepts `InvalidationPolicy`; new projection mutation methods enforce status/event invariants; history union gains the events above. Preserve existing public getters wherever possible to contain blast radius.
- `packages/core/src/domain/value-objects/invalidation-policy.ts` — scalar aliases become structured types and resolvers. All callers must switch from comparing a string to reading `.artifacts` or `.workflow`.
- `packages/core/src/domain/value-objects/change-state.ts` — keep recovery-only returns out of `VALID_TRANSITIONS` and `HAPPY_PATH_NEXT`; export the separate `RECOVERY_ONLY_TRANSITIONS` contract consumed only by `Change.recover` and the central reconciler. This prevents lifecycle/status/CLI from advertising automatic sign-off repair as a manual hop.
- `packages/core/src/domain/value-objects/artifact-type.ts` — no signature change; `hasTasks` becomes the authoritative exclusion marker used by fingerprint and propagation services.
- `packages/core/src/domain/services/transition-checks.ts` — add `verification.current`, validity data on `CheckExecutionContext`, label, and structured results without changing generic progress-event ABI.
- `packages/core/src/domain/services/check-bindings.ts` — bind `verification.current` only to `verifying -> done`; bind both implementation readiness checks to forward exit from `implementing`, entry to `verifying`, and archive; add live task/freshness coverage to archive without removing existing predicates.
- `packages/core/src/domain/services/lifecycle-verdict.ts` and `packages/core/src/application/services/lifecycle-evaluation.ts` / `lifecycle-guidance.ts` — consume canonical validity blockers and phase-aware recovery; stale verification must not dominate earlier phases.
- `packages/core/src/application/services/execute-matching-predicates.ts` — carry the reconciled verdict in execution context, support verification-operation context without a fake transition, deduplicate overlapping matches by stable check ID in registry order, and keep checks non-mutating.
- `packages/core/src/application/checks/approval-spec.ts`, `approval-signoff.ts`, `workflow-check-registry.ts` — use projections/verdict; register `verification.current`; sign-off requires current verification when enabled.
- `packages/core/src/application/use-cases/create-change.ts`, `packages/core/src/composition/use-cases/create-change.ts`, and `packages/core/src/composition/kernel.ts` — resolve explicit input over the injected project invalidation default in every construction path; retain `{downstream,preserve}` only as the downstream compatibility fallback, and never let the CLI become the sole owner of config inheritance.
- `packages/core/src/application/use-cases/edit-change.ts` — accept partial `invalidation?: InvalidationPolicyOverride`; scope changes compare the canonical spec set through `SpecApprovalFingerprint`; output separates `scopeChanged` from `validityChanged` and includes blockers/next action; refresh implementation tracking from `ListWorkspaces` whenever scope changes, independently of validity projection changes.
- `packages/core/src/application/use-cases/invalidate-change.ts` — `policyOverride?: InvalidationPolicyOverride`; resolve dimensions independently; guard only valid consent affected by the request; delegate mutation/recovery; return the persisted reason, exact affected gates, blockers, next action, and Core-selected targets.
- `packages/core/src/application/use-cases/validate-artifacts.ts` — capture pre-validation drift inside reconciled mutation, ignore task content for automatic drift, validate task structure normally, then establish the new structural baseline without healing stale evidence; never invoke `Change.invalidate` directly or retain a no-reconciler fallback.
- `packages/core/src/application/use-cases/approve-spec.ts` — only `ready`; reconcile first; require all required non-task artifacts current and validated; build `SpecApprovalFingerprint` from canonical scope plus shared artifact fingerprint; persist the identical snapshot in projection and audit event; renew atomically through the decorated actor resolver without deleting pending/approval history.
- `packages/core/src/application/use-cases/approve-signoff.ts` — only `done`; refresh links, reconcile, require current completed verification, distinguish absent/active/stale/mismatched evidence, fingerprint whole linked files, record `verificationId`, remain in `done`, and use the same decorated actor for projection/event without deleting pending/sign-off history.
- `packages/core/src/application/use-cases/transition-change.ts` — reconcile before checks and after mutation-capable hooks; remove unconditional `invalidate` on transition to designing and broad signoff invalidation inference; reject recovery-only edges as manual requests; transition movement alone preserves matching verification; failed requests expose committed recovery through `ReconciledOperationBlockedError`.
- `packages/core/src/application/use-cases/get-status.ts` — resolve schema before any mutating collaborator, require reconciler in every factory path, remove active timestamp early-return, make `SCHEMA_RESOLUTION_FAILED` reachable without writes, combine verdict plus aggregate into `ValidityStatusProjection`, and project canonical next action without returning the raw verdict type.
- `packages/core/src/application/use-cases/invalidate-verification.ts` — retain state-independent invalidation and derive guidance from the reconciled lifecycle boundary: when no higher-priority spec/sign-off recovery applies, stale verification in `archivable` or `archiving` recommends `/specd-verify` in place just as the verification boundary does; it never recommends an unrelated design return.
- `packages/core/src/application/use-cases/archive-change.ts` — require the reconciler in the constructor and every factory; reconcile before initial predicates and again after hooks; after the latter, rerun live predicates/task count and only then build the publication plan, preflight, snapshots, and sidecars from the accepted post-hook change; materialize metadata through `MaterializeSpecMetadata`; enforce task, artifact, implementation, verification, and enabled gates; archive v2 projections/history unchanged; overlapping-change invalidation delegates to each peer's reconciler and own policy/gates rather than forcing designing.
- `packages/core/src/application/use-cases/index.ts`, `packages/core/src/application/index.ts`, `packages/core/src/public.ts`, and package root barrels — export new types/use cases/errors/factories as curated public API, never concrete adapters.

### Persistence and configuration

- `packages/core/src/application/ports/change-repository.ts` — add `implementationFile`; revise `get` documentation to be side-effect-free; keep `mutate` as the atomic boundary.
- `packages/core/src/application/ports/index.ts`, `packages/core/src/ports.ts`, and `packages/sdk/src/ports.ts` — export `BinaryContentHasher` as a port contract through Core and SDK port surfaces; do not export its Node adapter.
- `packages/core/src/infrastructure/fs/manifest.ts` — version-discriminated schemas and all raw v2 projection/event types; the strict `approval-invalidated.differences` schema includes spec scope and `spec-added`/`spec-removed` kinds exactly as the shared domain union.
- `packages/core/src/infrastructure/fs/manifest-change-loader.ts` — explicit v1 adapter and v2 loader; no validity decision or writes.
- `packages/core/src/infrastructure/fs/change-repository.ts` — remove hydration-time `change.invalidate`; hydration may expose physical observations such as missing/drifted files to application services but never derives, persists, or recovers logical validity; implement safe byte reads, serialize v2 only after a real application mutation, preserve atomic rename and history.
- `packages/core/src/infrastructure/fs/archive-repository.ts` — read both versions, reject future versions, and preserve the active v2 manifest during archive without inspection migration.
- `packages/core/src/infrastructure/fs/fs-change-index-cache.ts` and `fs-archive-index-cache.ts` — stop validating manifests through the unversioned schema; call the version discriminator and continue projecting only lightweight index fields. Index refresh remains read-only and propagates unsupported-version failures instead of rewriting or guessing.
- `packages/core/src/application/ports/config-schema.ts`, `packages/core/src/application/specd-config.ts`, `packages/core/src/infrastructure/fs/config-loader.ts` — add `invalidation`, keep deprecated `invalidationPolicy`, reject both in the effective merged config, adapt legacy, and expose only resolved structured policy to use cases.
- `packages/core/src/composition/composition-resolver.ts`, `composition/privacy-actor-resolver.ts`, `composition/use-cases/workflow-check-registry.ts`, every modified use-case factory, `composition/use-cases/index.ts`, `composition/index.ts`, and `composition/kernel.ts` — resolve one shared fingerprint service and reconciler and mount `startVerification`, `completeVerification`, and `invalidateVerification` under `kernel.changes`. Preserve the existing actor decorator chain: config factories obtain actors only through `getActorResolver()`, and no new use case is allowed to persist an undecorated name, email, or actor metadata.
- `packages/core/src/domain/value-objects/index.ts` — export the structured policy and fingerprint domain types through the existing internal layer barrel.
- `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts` — retain cleanup execution as the single low-level artifact hashing primitive; the new fingerprint service calls it rather than duplicating cleanup semantics.
- `packages/sdk/src/core-reexports.ts` — re-export the new Core public contracts so hosts continue importing only `@specd/sdk`.

### CLI

- `packages/cli/src/index.ts` — register `registerChangeVerification`.
- `packages/cli/src/commands/change/create.ts` — replace `--invalidation-policy` with `--artifact-policy` and `--workflow-policy`; pass a complete resolved policy.
- `packages/cli/src/commands/change/edit.ts` — accept the two optional dimensions, preserve unspecified values in Core, distinguish `scopeChanged` from `validityChanged`, warn only for actual projection changes, and render the Core-returned blockers plus next action in text as well as structured formats.
- `packages/cli/src/commands/change/invalidate.ts` — accept independent overrides; render the returned `reason`, exact affected gates, blockers, next action and Core-selected recovery in text/JSON/TOON; never choose or hard-code recovery.
- `packages/cli/src/commands/change/approve.ts` — render materialized status, fingerprint algorithms/counts, verification ID for sign-off, and distinguish empty observed implementation from legacy unknown. On a failure after committed reconciliation, consume structured recovery from the error or reload `GetStatus` before rendering so stale pre-operation state is never shown.
- `packages/cli/src/commands/change/status.ts` — render the public `ValidityStatusProjection`, active attempt separately from completed evidence, committed recovery, blockers, and phase-aware next action with semantic parity across text, JSON, and TOON; do not serialize the raw evaluator verdict or source bytes.
- `packages/cli/src/commands/change/transition.ts` — render repair guidance from fresh status with the actual change name, distinguish committed recovery from protocol-edge rejection, recommend in-place verification, and add no restart flag.
- New `packages/cli/src/commands/change/verification.ts` — thin `start`, `complete`, and `invalidate` group with the exact command signatures defined below; validate `--format` before invoking any mutating use case and serialize only the explicit public projection defined below.
- `packages/cli/test/commands/helpers.ts` and the matching command tests — extend the full mock kernel and fixtures. This helper is a CRITICAL test hotspot and must be changed compatibly.

### Skills and documentation

- `packages/skills/templates/shared/shared.md.tpl` — describe canonical status/reconciliation and in-place artifact review.
- `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` — own start/complete, repeat work after baseline renewal, and own the outer full-mode attempt.
- `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl` — standalone change-scoped start/complete; delegated mode requires both `--delegated` and `--attempt`, accepts the explicit outer attempt context and does neither. Delegation still selects the change-scoped branches for status, project context, scope discovery, direct dependency expansion, merged `changes spec-preview` reads, reports directory, and filename.
- `packages/skills/templates/skills/specd-design/SKILL.md.tpl`, `specd-implement/SKILL.md.tpl`, and `specd-archive/SKILL.md.tpl` — consume recovery guidance, allow in-place review without gate bypass, and route authoring/required spec recovery to design.
- Generated `.agents/skills/...` and `.codex/skills/...` copies are refreshed only through `pnpm ai-agents:sync`; do not hand-maintain divergent generated instructions.
- `docs/config/config-reference.md`, `docs/guide/configuration.md`, `docs/guide/workflow.md`, `docs/guide/_sections/getting-started/lifecycle.md`, `docs/guide/_sections/getting-started/usage.md`, and `docs/cli/cli-reference.md` must document structured policy, manifest compatibility, validity status, verification commands, and exit codes.
- Add `docs/cli/change-verification.md` as the dedicated command page required for the new `changes verification` group; cover `start`, `complete`, `invalidate`, examples, the safe public output projection, idempotence, typed failures, and current-state retry guidance, and link it from the CLI reference/navigation.
- `docs/core/use-cases.md`, `docs/core/ports.md`, and `docs/core/errors.md` must document the reconciler and verification use cases, both composition forms, privacy-decorated actor flow, `BinaryContentHasher`, fingerprint/verification errors, and the SDK-only host import boundary.
- Add `docs/adr/0028-materialized-validity-reconciliation.md` for the cross-package decision “materialized validity projections with a single reconciler”; use MADR, include confirmation, and link the affected specs.

All new and modified symbols require complete JSDoc. Source remains strict ESM, named exports, `kebab-case.ts`, no `any`, and exact optional property semantics.

## New constructs

Create these files:

- `packages/core/src/domain/value-objects/validity-fingerprint.ts` — types, normalization, and pure comparison.
- `packages/core/src/domain/services/change-validity.ts` — pure verdict and recovery selection.
- `packages/core/src/application/services/validity-fingerprint-service.ts` — artifact selection, safe implementation reads, hashing, and fact collection through ports.
- `packages/core/src/application/ports/binary-content-hasher.ts` — public port contract `abstract hash(content: Uint8Array): Sha256Digest`.
- `packages/core/src/infrastructure/node/binary-content-hasher.ts` — Node SHA-256 adapter; infrastructure-internal, never exported from the curated public surface.
- `packages/core/src/application/checks/verification-current.ts` — registered non-mutating predicate.
- `packages/core/src/application/use-cases/reconcile-change-validity.ts` — sole mutation coordinator.
- `packages/core/src/application/use-cases/start-verification.ts`.
- `packages/core/src/application/use-cases/complete-verification.ts`.
- `packages/core/src/application/use-cases/invalidate-verification.ts`.
- Matching composition factories in `packages/core/src/composition/use-cases/` for all four use cases.
- `packages/core/src/domain/errors/unsupported-manifest-version-error.ts` (`UNSUPPORTED_MANIFEST_VERSION`).
- `packages/core/src/application/errors/fingerprint-input-error.ts` (`FINGERPRINT_INPUT_ERROR`, with typed failures).
- `packages/core/src/application/errors/verification-attempt-not-found-error.ts` (`VERIFICATION_ATTEMPT_NOT_FOUND`).
- `packages/core/src/application/errors/verification-not-found-error.ts` (`VERIFICATION_NOT_FOUND`).
- `packages/core/src/application/errors/verification-in-progress-error.ts` (`VERIFICATION_IN_PROGRESS`).
- `packages/core/src/application/errors/verification-stale-error.ts` (`VERIFICATION_STALE`, including `/specd-verify` recovery).
- `packages/core/src/application/errors/verification-validity-unavailable-error.ts` (`VERIFICATION_VALIDITY_UNAVAILABLE`).
- `packages/core/src/application/errors/verification-fingerprint-mismatch-error.ts` (`VERIFICATION_FINGERPRINT_MISMATCH`, with differences).
- `packages/core/src/application/errors/reconciled-operation-blocked-error.ts` (`RECONCILED_OPERATION_BLOCKED`, with committed recovery context).
- `packages/cli/src/commands/change/verification.ts` and `packages/cli/test/commands/change/verification.spec.ts`.

The recovery error is a public application contract and is exported through the application and curated Core/SDK barrels:

```ts
export type ReconciledOperation = 'transition' | 'archive'

export class ReconciledOperationBlockedError extends SpecdError {
  readonly specd = true as const
  readonly code = 'RECONCILED_OPERATION_BLOCKED' as const
  readonly operation: ReconciledOperation
  readonly changeName: string
  readonly state: ChangeState
  readonly automaticReturn: AutomaticRecovery
  readonly blockers: readonly ValidityBlocker[]
  readonly nextAction: NextAction

  constructor(input: {
    readonly operation: ReconciledOperation
    readonly changeName: string
    readonly state: ChangeState
    readonly automaticReturn: AutomaticRecovery
    readonly blockers: readonly ValidityBlocker[]
    readonly nextAction: NextAction
  })
}
```

It is thrown only when reconciliation already committed an automatic return and the originally requested transition or archive is now inapplicable. Ordinary invalid protocol edges and check failures without recovery retain their existing errors. Its actionable message names the committed state and `nextAction.command`; adapters consume typed metadata rather than parsing the message. The class and every throwing public method have complete JSDoc including `code`, metadata, `@param`, and `@throws`.

`ArchiveChangeDeps.reconcile` is a required `ReconcileChangeValidity`, not optional. `isArchiveChangeDeps`, `resolveArchiveChangeDeps`, direct/config factory overloads, kernel wiring, SDK host mocks, and tests must all supply it. Archive contains no `undefined` branch and no fallback to `Change.invalidate`.

`ValidityFingerprintService` has this exact public API:

```ts
export interface FingerprintInputFailure {
  readonly scope: 'artifact' | 'implementation'
  readonly key: string
  readonly reason: 'missing' | 'unreadable' | 'outside-project' | 'invalid-path'
  readonly message: string
}

export interface FingerprintCollectionResult {
  readonly fingerprint: ValidityFingerprint | null
  readonly failures: readonly FingerprintInputFailure[]
}

export interface ValidityFingerprintServiceDeps {
  readonly changes: ChangeRepository
  readonly hasher: ContentHasher
  readonly binaryHasher: BinaryContentHasher
  readonly schemaProvider: SchemaProvider
}

export class ValidityFingerprintService {
  constructor(deps: ValidityFingerprintServiceDeps)
  artifactFingerprint(change: Change): Promise<FingerprintCollectionResult>
  specApprovalFingerprint(change: Change): Promise<{
    readonly fingerprint: SpecApprovalFingerprint | null
    readonly failures: readonly FingerprintInputFailure[]
  }>
  completeFingerprint(change: Change): Promise<FingerprintCollectionResult>
}
```

Add `BinaryContentHasher` as an application port with `hash(content: Uint8Array): Sha256Digest` and a Node adapter using `createHash('sha256').update(content)`. This avoids breaking the existing text-only `ContentHasher` contract and its many typed mocks.

`CompositionResolver` gains `getBinaryContentHasher(): BinaryContentHasher`, memoized exactly like `getContentHasher`. The four new use-case resolvers and the fingerprint service reuse that single composition-session instance. `createKernel` mounts the four new use cases from `resolveXDeps(resolver)` and does not instantiate a parallel reconciler.

## Approach & execution flow

### Collecting fingerprints

1. Resolve the active schema and build an artifact-type map.
2. Iterate change artifacts in lexical type/key order.
3. Skip every artifact whose schema `ArtifactType.hasTasks` is true.
4. Skip files explicitly `skipped`; treat missing/unreadable required non-task files as failures rather than silently omitting them.
5. Load artifact content through `ChangeRepository.artifact`, apply that type's `preHashCleanup`, hash, and store `${type}:${key}`.
6. For a complete fingerprint, normalize and deduplicate every confirmed implementation-link file path. Ignore symbols for content scope.
7. Read every path with `implementationFile`. Any non-found result becomes a failure and makes `fingerprint` null; partial fingerprints never authorize approval or verification.
8. Classify bytes, normalize text if applicable, hash, and construct lexically ordered entries.
9. Return the fingerprint only when failures are empty. An empty implementation set is a valid concrete map.

### Reconciliation

1. Acquire the change lock with `ChangeRepository.mutate` and reload the latest aggregate.
2. Resolve schema and optionally refresh implementation tracking before fact collection.
3. Collect artifact drift/pending review and complete fingerprint facts. Task artifacts contribute structural/task facts but not drift invalidation or fingerprints.
4. Build the current `SpecApprovalFingerprint` from canonical scope plus artifact inputs, and the complete validity fingerprint from artifact plus implementation inputs. Compare each currently valid projection against its own baseline. A scope addition/removal stales spec approval with cause `scope-change`; reordering alone does not. A missing/unreadable relevant input makes the affected projection stale; a previously stale/revoked projection stays unchanged.
5. Apply any explicit intent. Manual forced invalidation uses `revoked`; detected drift, scope change, overlap, unknown legacy evidence, and dependent verification withdrawal use `stale`.
6. Expand artifact review using only `policy.artifacts`: `none`, direct, DAG descendants, or all non-task artifacts. Never propagate from a parent into a task artifact. Explicitly targeted task review is allowed.
7. Compute recovery with the fixed priority table. Apply it only through `Change.recover`, append at most one necessary transition event, and never expose or execute it as a manual/self transition.
8. Append focused audit events only for new facts, update projections, and return one verdict/result.
9. Repository serialization writes a complete v2 manifest atomically. On any error before callback success, no mutation is persisted.

### Approval flows

Spec approval:

1. Reject when the gate is disabled.
2. Resolve the actor exactly once through the injected `ActorResolver`; config composition has already privacy-decorated it.
3. Reconcile and commit newly detected invalidity with that actor supplied to the reconciler.
4. Require the committed state to be exactly `ready`.
5. In a reconciled mutation using the same actor, recollect the canonical spec set plus artifact fingerprint, require no non-task drift/pending review/missing required artifact, and record the identical complete `SpecApprovalFingerprint` in the projection and audit event.
6. Do not move state; append approval audit and replace only the current spec projection. No step calls `identity()` again.

Legacy compatibility exception: if a loaded change is already `pending-spec-approval`, `ApproveSpec` may complete the historical drain to `spec-approved`; no create, edit, transition, or approval path may enter `pending-spec-approval` for native v2 work. The drain records the same materialized scope-aware projection/event required for a new approval or, when legacy inputs cannot establish it, requires review through `ready` rather than fabricating consent.

Sign-off:

1. Reject when disabled.
2. Resolve the actor exactly once, refresh tracking, and reconcile with that supplied decorated actor.
3. Require state exactly `done`, current completed verification, and no blockers. Return `VerificationNotFoundError` only when no completion exists, `VerificationInProgressError` when only an active attempt exists, `VerificationStaleError` for stale or legacy-unknown evidence, and `VerificationFingerprintMismatchError` only for current evidence that differs from an explicitly compared expected fingerprint.
4. In one reconciled mutation using the same actor, recollect the complete fingerprint, verify it still equals completed evidence, and record sign-off with its `verificationId`, reusing that identity in the projection and audit event.
5. Do not move state. Later drift can stale spec approval, verification, and sign-off independently according to their baselines. No step calls `identity()` again.

Legacy compatibility exception: if a loaded change is already `pending-signoff`, `ApproveSignoff` may complete the historical drain to `signed-off`; native v2 flows never enter `pending-signoff`. The drain still requires current verification and complete sign-off evidence and MUST NOT treat the legacy state itself as proof of eligibility.

### Transition and archive flows

1. `TransitionChange` calls reconciliation first. If this commits a different state, stop the requested transition and throw `ReconciledOperationBlockedError` with committed state, `automaticReturn`, blockers, and next action. Do not retry or collapse it to `InvalidStateTransitionError`.
2. Resolve the target and run predicates using the reconciled verdict. Forward exit from `implementing` and entry to `verifying` each attach `impl.filesResolved` and `impl.linksInScope`; the runner deduplicates overlapping IDs, so `implementing -> verifying` emits one start/done pair per check.
3. Run pre-persist effects/hooks.
4. Refresh implementation tracking, reconcile again because hooks may modify files or links, then rerun relevant predicates, including `verification.current` for `verifying -> done`. Missing verification verdict fails closed; only explicit `not-required` skips.
5. Persist only the requested transition. Entry to `verifying` never starts verification. Backward movement alone never stales matching verification. Explicit return below a valid sign-off revokes sign-off but does not broadly invalidate spec approval.
   A request whose source and target are both `designing` is the sole application-level neutral self-entry: return the unchanged aggregate, append no `transitioned` event, do not change `updatedAt`, and do not invoke the domain transition method. Every other self-transition, including `verifying -> verifying`, remains an invalid protocol edge.
6. Archive requires its reconciler, resolves schema, performs initial reconciliation/checks, and runs pre-archive hooks. It does not create a publication plan yet.
7. After hooks, archive refreshes implementation tracking, reconciles again, reruns every applicable archive predicate and the live task count, and obtains the accepted post-hook `Change` plus verdict. If this commits recovery, throw `ReconciledOperationBlockedError` for `archive`; do not substitute a generic invalid-state error.
8. Only after step 7 passes, construct `PreparedArchivePlan`, `PreparedArchivePreflightSpec[]`, batch spec IDs, spec-lock sidecars, and snapshots from that same accepted `Change`. Archive metadata is produced through `MaterializeSpecMetadata`; this flow does not depend on or call the obsolete `RegenerateSpecMetadata` use case. A hook-added, accepted in-scope implementation link appears in the plan and sidecar; a hook-added blocker stops before snapshot/write.
9. Publish and archive through the existing atomic batch/restore flow. Any stale/missing required evidence, artifact review, unresolved implementation input, incomplete task, overlap, or schema/workspace/dependency blocker stops archive. Failure never rolls back committed validity recovery.
10. After publication invalidates overlapping active changes, each peer is reconciled with its own persisted effective policy and enabled gates. A peer returns to `designing` only when its required spec consent or `workflow: redesign` requires it; an ungated `workflow: preserve` peer remains in its current lifecycle state with explicit artifact blockers. Archive never hard-codes a peer transition or calls `Change.invalidate` directly.

### CLI contracts

The exact new commands are:

```text
specd changes verification start <name> [--format text|json|toon]
specd changes verification complete <name> [--format text|json|toon]
specd changes verification invalidate <name> --reason <text> [--format text|json|toon]
```

Before resolving CLI context or invoking a use case, every subcommand parses and validates `--format`; an unsupported format performs zero mutation and exits through the existing CLI error path. `invalidate` also validates its non-blank reason before context resolution.

JSON and TOON use an explicit safe projection rather than serializing the use-case result or aggregate. `start` exposes only `result`, `name`, `state`, `attemptId`, `supersededAttemptId`, a summarized fingerprint (algorithms and counts, never file hashes/content), and the public reconciliation summary. `complete` exposes only `result`, `name`, `state`, `verificationId`, `attemptId`, verification `status`, the same fingerprint summary, and public reconciliation summary. `invalidate` exposes only `result`, `invalidated`, persisted `reason`, `name`, `state`, `verificationId`, `verificationStatus`, `signoffChanged`, public `automaticReturn`, blocker `{code,message}` pairs, public `nextAction`, and the fingerprint summary. Unknown internal fields are dropped by construction.

Text output reports the same semantics: attempt/evidence IDs, state, fingerprint file counts and algorithms, superseded attempt, invalidation idempotence, persisted invalidation reason, sign-off consequence, recovery, blockers, and next command. `start` and `complete` do not invent a lifecycle `nextAction`; they render one only if it is part of the canonical public reconciliation summary. On repeated invalidation, every format renders the original stored reason, never the unused new request reason. No format emits source content or full hashes. Expected Core errors exit 1 through existing `handleError` and retain code/metadata.

Create/edit/invalidate signatures are:

```text
specd changes create <name> [--description <text>] [--spec <id> ...]
  [--artifact-policy none|surgical|downstream|global]
  [--workflow-policy preserve|redesign] [--format text|json|toon]

specd changes edit <name> [--add-spec <id> ...] [--remove-spec <id> ...]
  [--description <text>] [--artifact-policy none|surgical|downstream|global]
  [--workflow-policy preserve|redesign] [--format text|json|toon]

specd changes invalidate <name> --reason <text>
  [--artifact-policy none|surgical|downstream|global]
  [--workflow-policy preserve|redesign]
  [--target <artifactId>[@<specId>] ...] [--force]
  [--format text|json|toon]
```

The deprecated scalar is config-read compatibility only and is not exposed as a new-write CLI flag.

`changes edit` renders `scopeChanged` and `validityChanged` independently; its deprecated `invalidated` field mirrors only `validityChanged`. It emits approval-invalidated warnings only for returned projection changes, and its text mode prints every returned blocker plus `nextAction.targetStep`, command, and reason, so it cannot conceal that a preserved state is still blocked from advancing. `changes invalidate` renders `reason`, `blockers`, `nextAction`, exact affected gates, and `automaticReturn` directly from Core in all formats. Its force refusal never hard-codes `designing`: spec consent maps to the returned design recovery, sign-off-only maps to the returned done recovery, and an operation with no automatic return states that explicitly. Transition repair commands interpolate the requested change name before rendering; literal `<name>` is forbidden.

If `changes approve` catches an eligibility error after reconciliation may have committed state, it immediately calls `GetStatus({ name })` and renders that canonical status alongside the typed approval error, unless the error already carries equivalent structured fields. It never prints cached pre-call state. Text, JSON, and TOON expose actual state, blockers, and next action consistently.

### Skill protocol

- Every lifecycle skill starts by reading canonical status. If required spec consent is stale, it stops implementation/verification work and routes to `specd-design` through the normal `designing -> ready -> approval` recovery.
- Without mandatory spec recovery, a skill may semantically review drifted artifacts, repair contradictions, validate them, and continue in the same phase under `workflow: preserve`. Structural validation alone is never described as semantic review.
- Standalone `specd-verify` runs `verification start`, performs all scenarios, optionally delegates compliance with the returned attempt ID, runs applicable report/hooks, and runs `verification complete` only after success.
- Standalone `specd-compliance --change <name>` performs the same start/report/hooks/complete ownership. Project-wide/diff/no-active-change modes remain report-only.
- Delegated compliance requires explicit `--delegated --attempt <attemptId>`. It checks both values before audit work, does not infer delegation from an existing attempt, and invokes neither start nor complete. For every later branch it remains change-scoped: load status and project context, discover the change's specs, expand direct dependencies, read merged specs with `changes spec-preview`, write inside that change's reports directory, and use the change-scoped filename. Only attempt ownership differs from standalone `--change`.
- Full verify completes only after scenario checks and delegated compliance both succeed. Failure/interruption leaves an active attempt but no successful completion.
- If inputs change, the owner runs start again, repeats all required work against the new baseline, then completes. It never resets and immediately completes with results from the previous baseline.

### Verification-audit closure contract

The post-implementation verification audit identified places where a locally reasonable implementation could still violate the system contract. The following rules are normative and close those ambiguities:

1. `StartVerificationDeps.schemaProvider` is intentional and mandatory because implementation readiness checks require the real schema context; the dependency is part of the public factory contract, not an implementation leak.
2. `verification.current` skips only for the explicit canonical verdict `not-required`. Missing validity data is an error at an applicable boundary, never an implicit skip.
3. `GetStatus` returns `ValidityStatusProjection`. `ChangeValidityVerdict` remains internal evaluation data and must not leak through Core's status API or CLI serialization.
4. Repository hydration is observational. It can report physical drift/missing facts, but only `ReconcileChangeValidity` may materialize stale/revoked projections or automatic lifecycle recovery. `TransitionChange`, `ValidateArtifacts`, and `ArchiveChange` must not retain direct `Change.invalidate` fallback paths.
5. A spec approval fingerprint includes the canonical approved `specIds` alongside artifact evidence. Scope addition/removal therefore invalidates consent even when artifact hashes happen to be unchanged; reordering/deduplication does not.
6. A stale or otherwise non-current completed verification is not “not found”. Use cases and checks preserve the distinction among absent, active-only, stale/legacy-unknown, mismatch, and current evidence with their dedicated errors/results.
7. Renewing spec approval or sign-off replaces the materialized current projection and appends its new audit event. It never removes, truncates, rewrites, or filters prior `pending-spec-approval`, `pending-signoff`, approval, sign-off, or invalidation history. The legacy pending-state drain may move the current lifecycle state only through its explicit compatibility path; it does not erase the evidence that the state existed.
8. `changes edit` warnings are driven by actual `projectionChanges`, while advancement guidance is always driven by returned blockers and `nextAction`. A scope edit may therefore refresh tracking and show a blocker without falsely claiming an approval was invalidated.
9. `changes invalidate` and verification invalidation render Core-selected recovery/guidance. They never infer that every invalidation returns to designing. Verification invalidation from `archivable`/`archiving` recommends fresh verification in place unless a required approval gate has already selected a higher-priority recovery.
10. Invalid `--format` is rejected before context/kernel resolution and before every mutating verification command. Structured output is a field whitelist, not object spreading or raw result serialization.
11. Omitting an implementing or verifying phase from a future schema is not implemented by this change. The duplicate implementation-readiness bindings at exit from implementing and entry to verifying are deliberate preparation for future skippable phases, but the current topology and transition registry remain authoritative.
12. `designing -> designing` is an application-neutral idempotent request with no event; this exception does not weaken the aggregate rule that real self-transitions are invalid.

## Error handling & edge cases

- Unknown/future manifest version: `UnsupportedManifestVersionError`; no hydration or write.
- Malformed v1/v2: existing `CorruptedManifestError` with validation path.
- Both config shapes: `ConfigValidationError`, code `CONFIG_VALIDATION_ERROR`, path naming both keys and instruction to keep only `invalidation`.
- Invalid CLI enum or empty verification reason: commander/input failure before mutation, exit 1.
- Missing/unreadable/outside-project linked file: `FingerprintInputError`; no partial approval/start/completion.
- Missing active attempt: `VerificationAttemptNotFoundError`; no mutation.
- No completed evidence for invalidation: `VerificationNotFoundError`; unfinished attempt does not qualify.
- Sign-off with only an active attempt: `VerificationInProgressError`; do not report not-found.
- Sign-off with stale or legacy-unknown completed evidence: `VerificationStaleError` with `/specd-verify`; do not report not-found.
- Fingerprint mismatch at completion: `VerificationFingerprintMismatchError` with differences but no baseline replacement; guidance says start again and repeat work.
- Missing canonical verification verdict at an applicable check: `VerificationValidityUnavailableError`; fail closed. Only explicit `not-required` skips.
- Already stale verification: observe/reconcile, then success with `invalidated: false`, original persisted reason, and no duplicate event; ignore a different newly supplied reason.
- Restored bytes: projection remains stale/revoked until explicit renewal.
- Empty implementation links: concrete empty map; distinct from `null` legacy unknown.
- Duplicate links: one normalized path entry.
- Same final file set with changed spec-to-file association: fingerprint remains equal; accepted v1 limitation, while `impl.linksInScope` continues to validate relationships.
- Task artifact changed: no content drift invalidation or parent propagation; missing/invalid required task artifact and incomplete live tasks still block.
- Artifact policy `none`: adds no review reopening but existing drift remains a blocker; workflow/gates are still evaluated.
- `preserve` in a late state: retains phase only without stricter gate recovery; it does not authorize forward progress.
- Both gates stale: spec recovery to `designing` wins.
- Sign-off stale while already before/during `done`: no automatic forward move to `done`.
- Verification stale in early phases: show context but recommend the phase's normal work; require renewal only at an applicable boundary.
- `verifying -> verifying`: always protocol failure; start/complete are state-independent commands.
- Concurrent edit between read and completion: per-change lock plus fresh collection catches mismatch; failed callback persists no false success.
- Hook changes inputs: mandatory post-hook reconciliation/check rerun catches it.
- Overlapping implementation readiness bindings: runner executes each stable check ID once; non-overlapping entry/exit boundaries remain guarded.
- Missing reconciler in any direct deps path: typed construction/configuration failure; no fallback call to `Change.invalidate`.
- Reconciliation followed by failed requested transition/archive: throw `ReconciledOperationBlockedError` with committed state, automatic return, blockers, and next action; recovery remains committed and is not rolled back.
- Schema resolution failure during active status: return degraded `SCHEMA_RESOLUTION_FAILED` status before refresh/reconciliation; no manifest write, event, or timestamp change.
- Manual request for `archiving|archivable|signed-off -> done`: protocol failure because the edge is recovery-only; the reconciler applies it through `Change.recover` only for stale/revoked required sign-off.
- Strict v2 `approval-invalidated` with spec scope: `spec-added` and `spec-removed` round-trip; any unknown scope/kind remains a corrupted-manifest failure.
- Legacy active evidence: retained for audit but unknown evidence cannot authorize required progress/archive.
- Legacy or transitional-v2 spec approval without scope: retained for audit, marked scope-unknown/stale, and never populated from current `specIds`.
- Archived v1: readable and immutable on inspection.

## Key decisions

- Materialized projections, not history replay, determine v2 current validity. History remains audit evidence.
- Spec consent signs both canonical spec scope and artifact content. Scope is approved intent, not metadata inferred separately after approval.
- One application reconciler owns all validity mutation. Shared helpers alone are insufficient because independent callers could still diverge.
- Repository reads are side-effect-free. Status is an explicit application reconciliation and may write when it discovers invalidity.
- Workflow default is `preserve`; legacy scalar adaptation uses `redesign` to preserve old behaviour.
- Gate recovery is invariant, not configuration. Required stale spec consent means `designing`; required stale sign-off beyond done means `done`.
- Automatic recovery has a separate aggregate/topology path and is never exposed as a manual lifecycle transition.
- Verification is an explicit state-independent operation. Transitions check evidence but do not create it.
- Whole linked files are fingerprinted. This is deliberately conservative for change-per-branch development.
- Narrow text normalization tolerates transport/trailing whitespace but does not claim semantic equivalence.
- Task-bearing artifacts are operational state and excluded by `hasTasks`, while task structure and completion remain live blockers.
- A separate byte hasher port avoids a breaking expansion of the widely mocked `ContentHasher` contract.

Rejected alternatives include deleting history, implicit migration writes, treating every backward transition as invalidation, allowing each caller to choose recovery, a transition restart flag, baseline capture on entry to verifying, calling completion from a predicate, stripping all whitespace, parser/AST hashing, symbol slices, and accepting legacy unknown evidence as current.

## Trade-offs

- Whole-file hashing can invalidate evidence for unrelated edits in a linked file. Mitigation: isolate changes and introduce symbol-aware v2 only with language-neutral safety.
- `text-v1` does not ignore all formatter output and trailing whitespace can theoretically matter in multiline literals. Mitigation: false invalidation is preferred to silently preserving approval after semantic change; algorithm version is persisted.
- Status can now write and is more expensive because it checks external files. Mitigation: only active status reconciles, operations are idempotent, and no unsafe mtime cache is used.
- The `Change` aggregate is a CRITICAL hotspot. Mitigation: retain compatibility getters, isolate new value objects/services, and extend rather than rewrite public construction paths.
- The two-stage transition flow creates a small interval between committed recovery and retry. Mitigation: the second stage reacquires the lock and reconciles again; correctness is preferred over rolling recovery back with a failed request.
- v1 adaptation is necessarily incomplete. Mitigation: mark unknown evidence honestly and require renewal at the next protected boundary.
- Transitional v2 approval records without scope are readable but non-authoritative. Mitigation: strict new writes plus renewal produce complete scope-aware evidence without a second manifest-version bump.

## Spec impact

Fresh graph analysis of the central targets reports CRITICAL risk across Core, CLI, SDK, code graph, plugins, and skills. In particular, `TransitionChange` has 11 direct, 132 indirect, and 49 transitive symbol dependents across 59 files, including check factories, approval use cases, archive, status, kernel composition, SDK host context, and their tests. The broader combined set (`change.ts`, `get-status.ts`, `execute-matching-predicates.ts`, `manifest.ts`, and CLI `status.ts`) reports 532 direct dependents, 1,023 transitive dependents, and 365 affected files. Most are type/import dependents rather than behavioural consumers. Public compatibility aliases, strict adapter boundaries, full typed mock updates, SDK re-exports, and recovery-only topology isolation prevent unrelated package breakage.

Direct behavioural specs updated by this change are: `core:change`, `change-manifest`, `change-repository-port`, `config`, `create-change`, `edit-change`, `invalidate-change`, `validate-artifacts`, `approve-spec`, `approve-signoff`, `transition-checks`, `transition-change`, `get-status`, `archive-change`, `schema-format`; `cli:change-create`, `change-edit`, `change-invalidate`, `change-approve`, `change-transition`, `change-status`; and `skills:workflow-automation`, `skill-templates-source`. New specs are `core:invalidate-verification` and `cli:change-verification`.

Canonical coverage matrix:

| Spec ID                         | Implementation contract                                              | Primary automated coverage                                    |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `core:change`                   | Aggregate projections, events, invalidation and verification methods | `change.spec.ts`                                              |
| `core:change-manifest`          | v1/v2 raw schemas, adapter and serialization                         | `change-repository.spec.ts`, `manifest-change-loader.spec.ts` |
| `core:change-repository-port`   | Side-effect-free hydration, byte reads and atomic mutation           | `change-repository.spec.ts`                                   |
| `core:config`                   | Structured config/defaults/legacy ambiguity                          | `config-loader.spec.ts`                                       |
| `core:create-change`            | Structured creation input and v2 defaults                            | `create-change.spec.ts`                                       |
| `core:edit-change`              | Partial policy edits and atomic scope reconciliation                 | `edit-change.spec.ts`                                         |
| `core:invalidate-change`        | Independent overrides, force guard and recovery                      | `invalidate-change.spec.ts`                                   |
| `core:validate-artifacts`       | Pre/post reconciliation and task exception                           | `validate-artifacts.spec.ts`                                  |
| `core:approve-spec`             | Ready-only current artifact consent                                  | `approve-spec.spec.ts`                                        |
| `core:approve-signoff`          | Done-only verification-backed whole-file consent                     | `approve-signoff.spec.ts`                                     |
| `core:transition-checks`        | Canonical verdict plus `verification.current`                        | `transition-checks.spec.ts`, `verification-current.spec.ts`   |
| `core:transition-change`        | Pre/post-hook reconciliation and non-mutating verification exit      | `transition-change.spec.ts`                                   |
| `core:get-status`               | Active reconciliation and phase-aware projection                     | `get-status.spec.ts`                                          |
| `core:archive-change`           | Live canonical preflight and evidence preservation                   | `archive-change.spec.ts`                                      |
| `core:schema-format`            | `hasTasks` operational validity boundary                             | schema-format and validation tests                            |
| `core:invalidate-verification`  | Explicit idempotent withdrawal                                       | `invalidate-verification.spec.ts`                             |
| `cli:change-create`             | Independent creation flags                                           | CLI create tests                                              |
| `cli:change-edit`               | Partial structured edit flags and canonical output                   | CLI edit tests                                                |
| `cli:change-invalidate`         | Overrides, gate warning and result rendering                         | CLI invalidate tests                                          |
| `cli:change-approve`            | Thin approval adapter and evidence metadata                          | CLI approve tests                                             |
| `cli:change-transition`         | Fresh repair guidance without restart flag                           | CLI transition tests                                          |
| `cli:change-status`             | Validity/attempt/evidence/recovery rendering                         | CLI status tests                                              |
| `cli:change-verification`       | Start/complete/invalidate adapters                                   | `verification.spec.ts`                                        |
| `skills:workflow-automation`    | Cross-skill recovery and attempt ownership                           | `template-workflow.spec.ts`                                   |
| `skills:skill-templates-source` | Source/generated protocol parity                                     | template, repository and plugin install tests                 |

Transitive spec consumers remain valid because lifecycle state names/topology, repository list contracts, graph document models, plugin install contracts, and package dependency direction do not change. SDK composition and public API docs must be updated because kernel-equivalent use cases are added. Plugin-agent generated-skill tests must be rerun because source templates change. No additional normative spec is required beyond the affected set already present in this change.

Global constraints are satisfied: pure domain logic, application-only port use, infrastructure validation, manual DI, canonical factory overloads, SDK-only host imports, ESM/named exports/no `any`, typed actionable errors, mirrored Vitest tests, full typed mocks, and JSDoc. The cross-package architectural choice requires the ADR and docs listed above.

The active `implementation-snapshot` change also targets `core:change`. Before implementing that file, compare its current worktree/deltas and merge compatible projection/history fields; never overwrite or duplicate its work.

## Dependency map

```mermaid
flowchart LR
  CLI[CLI change commands] --> SDK[@specd/sdk exports]
  SDK --> UC[Core use cases]
  Skills[verify/compliance/lifecycle skills] --> CLI
  UC --> R[ReconcileChangeValidity]
  R --> FP[ValidityFingerprintService]
  R --> EV[evaluateChangeValidity]
  FP --> CR[ChangeRepository port]
  FP --> SP[SchemaProvider]
  CR --> FS[FsChangeRepository]
  EV --> C[Change aggregate]
  R --> C
  C --> M[materialized projections + append-only events]
  FS --> V1[v1 adapter]
  FS --> V2[v2 manifest]
  Checks[workflow check registry] --> EV
  Checks --> VC[verification.current]
  Status[GetStatus] --> R
  Transition[TransitionChange] --> R
  Archive[ArchiveChange] --> R
```

```text
skills ──commands──▶ CLI ──@specd/sdk──▶ Core use cases
                                           │
             ┌─────────────────────────────▼──────────────────────────┐
             │ ReconcileChangeValidity — sole mutation coordinator   │
             └──────────────┬──────────────────────┬──────────────────┘
                            │                      │
                    fresh fingerprints      pure validity verdict
                            │                      │
                 ChangeRepository port      Change aggregate
                            │                      │
                  FsChangeRepository        projections + events
                            │                      │
                       v1 adapter ───────▶ v2 atomic manifest
```

## Migration / rollback

Deployment requires no eager migration command:

1. Ship the v1/v2 reader before or with all v2 writers.
2. New changes write v2 and structured policy.
3. Reads adapt v1 only in memory.
4. The next successful active mutation writes the full adapted aggregate as v2.
5. Legacy unknown spec approval, verification, and sign-off stay non-authoritative until renewed; current scope/files are never copied into historical evidence.
6. Archived manifests remain untouched.

Rollback is safe only while the old binary will not encounter a v2 active manifest. Because v2 writes are intentionally incompatible with a v1-only writer, operational rollback requires either restoring the previous binary together with pre-deployment change storage backup, or retaining the new version-aware reader while reverting higher-level behaviour. Do not mechanically down-convert v2: doing so would lose projections, fingerprints, and verification audit links. Take a storage backup before release and document this compatibility boundary in release notes.

## Testing

### Automated tests

- `packages/core/test/domain/value-objects/validity-fingerprint.spec.ts`: exact `text-v1` cases, binary classification, order-independent equality, path-set changes, algorithm changes, empty map, internal-whitespace preservation, canonical spec sorting/deduplication, reorder equality, and explicit spec-added/spec-removed differences.
- `packages/core/test/domain/services/change-validity.spec.ts`: policy matrix, task exclusion, blocker applicability, recovery priority, no forward recovery, identical facts/idempotence, and phase-aware verification. Covers “Preservation does not waive drift”, “Gate recovery overrides workflow preservation”, “Identical facts produce identical recovery”, “Verification staleness blocks without moving lifecycle”, “Gate priority wins over preserve”, and “Ungated preserve retains lifecycle state”.
- `packages/core/test/domain/entities/change.spec.ts`: projection/history independence, attempt supersession/completion, lifecycle-neutral evidence, forced revocation, no duplicate events, and aggregate self-transition rejection. Covers every `core:change` scenario including projection status, repeated attempts, completion mismatch invariant, enabled/disabled gates, task exclusion, approval/sign-off renewal without deleting any prior pending/approval/invalidation event, and exact append-only history ordering.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` and `manifest-change-loader.spec.ts`: native v2 round trip including scope snapshots in current projection and every approval event; strict `approval-invalidated` round-trip for `scope: spec` with both `spec-added` and `spec-removed`; rejection of unknown difference scope/kind; native absence versus legacy unknown; v1 and transitional-v2 approval-without-scope reads without invented scope; no read-time write; post-save hydration may report physical drift facts but never persists validity/recovery; future rejection; atomic v2 reconciliation; safe implementation byte reads; complete attempt audit serialization; archived/read-only preservation.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`: new defaults, structured values, legacy mapping, merged old/new rejection. Covers both `core:config` scenarios.
- `packages/core/test/application/services/validity-fingerprint-service.spec.ts`: non-task cleanup hashing, whole linked files, duplicate links, empty set, missing/unreadable/outside paths, mixed text/binary, and task exclusion.
- `packages/core/test/application/use-cases/reconcile-change-validity.spec.ts`: one coherent mutation, repeated observation, overlap, manual intents, automatic returns, stale-does-not-heal, and post-mutation reconciliation.
- `packages/core/test/application/use-cases/start-verification.spec.ts`, `complete-verification.spec.ts`, and `invalidate-verification.spec.ts`: any active state, mandatory schema provider, operation-specific check context, no fake self-edge, implementation checks before capture, supersession, mismatch refusal, valid completion, unfinished-not-completed, stale evidence distinguished from not-found, idempotent invalidation with original persisted reason, continued observation, sign-off consequence, in-place blocking, `archivable`/`archiving` `/specd-verify` guidance, higher-priority gate recovery, factory equivalence, and invalid mixed arguments.
- Existing `create-change.spec.ts`, `edit-change.spec.ts`, `invalidate-change.spec.ts`, `validate-artifacts.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, `transition-change.spec.ts`, `get-status.spec.ts`, and `archive-change.spec.ts` receive explicit tests named after every scenario in their corresponding verify deltas. Assertions must include projection status, event count, state, policy, affected keys, blockers, and next action—not snapshots. Mandatory audit cases are: direct/config/kernel creation inherits project policy; explicit input overrides project policy; deliberate missing-default fallback is `{downstream,preserve}`; workflow-only and both-policy creation; scope edit refreshes tracking even when validity does not change and obtains workspaces through `ListWorkspaces`; reason in invalidate JSON/TOON; exact force gate/target pairs; actor resolver call count equals one with object identity reused; `ValidateArtifacts` routes drift through the reconciler and never directly invalidates; real-reconciler schema failure performs zero refresh/mutation calls; `GetStatusResult.validity` is the public projection; recovery errors carry all typed fields; neutral `designing -> designing` changes neither event count nor timestamp; archive construction fails without reconciler; archive metadata uses `MaterializeSpecMetadata`; peer overlap recovery respects preserve/redesign and gates; and a hook-added accepted implementation link is present in the post-reconciliation archive plan/sidecar.
- `packages/core/test/application/checks/verification-current.spec.ts`, `test/domain/services/transition-checks.spec.ts`, and `test/composition/use-cases/workflow-check-registry.spec.ts`: non-mutating check; missing/active/stale/valid branches; absent-verdict fail-closed; explicit-not-required skip; verification binding only on `verifying -> done`; dual readiness bindings; exactly-once deduplication on `implementing -> verifying`; independent other entry/exit boundaries; operation-context start; fresh evidence pass; post-hook mismatch failure.
- Composition tests for the four new factories and all modified factories verify deps/config equivalence, resolver reuse, no kernel bootstrap, `CreateChange` project-default injection through both resolver and kernel, and that config-based factories obtain actor identity through `CompositionResolver.getActorResolver()`. Privacy-mode cases (`mask`, `hash`, and anonymization) cover spec approval, sign-off, verification start/complete/invalidate, and reconciler-triggered invalidation; both projection and audit event must contain the same decorated identity, and raw names, emails, or filtered metadata must not appear anywhere in the persisted manifest. Direct-deps tests prove use cases preserve the supplied `ActorIdentity` without applying privacy twice. `barrel-kernel-coverage.spec.ts` and SDK re-export tests verify public completeness.
- CLI tests in `packages/cli/test/commands/change/verification.spec.ts` plus existing create/edit/invalidate/approve/status/transition tests cover exact flags, all formats, exit 1 cases, invalid-format preflight with zero kernel/use-case calls for start/complete/invalidate, thin delegation, a whitelist assertion that injected unknown/internal result fields never appear in JSON or TOON, no invented next action on start/complete, original invalidation reason on repeat, invalidate reason as a named JSON/TOON field, empty versus unknown fingerprint, `scopeChanged` versus actual validity warning, text blockers and next action after edit, exact force gates/targets without hard-coded design recovery, committed recovery, approval-failure status reload, text/JSON/TOON semantic parity, safe fingerprint evidence, actual-name repair commands, and repair guidance. `makeProgram`/mock kernel remain fully typed.
- `packages/skills/test/template-workflow.spec.ts`, `skill-repository.spec.ts`, and plugin-agent install tests assert independent/delegated ownership, required delegated attempt, report-only modes, repeated work after restart, and generated-copy parity. Delegated behavioral tests execute the downstream decision table for status, project context, scope, dependency expansion, spec-preview, report directory, and filename; phrase-presence assertions are insufficient.

For traceability, the remaining scenario groups map as follows:

- Create/edit policy scenarios map to their use-case and CLI tests, including complete override, invalid partial schema pair, explicit-default precedence, no history rewrite, partial edit preservation, no-op repetition, required edit, and output recovery.
- Manual invalidation scenarios map to Core and CLI invalidate tests, including independent overrides, target normalization, transient override, force only for current consent, atomic revocation/recovery, exact gate warning, `none` semantics, idempotent output, and CLI non-ownership.
- Approval scenarios map to approve-spec/signoff and CLI approve tests, including canonical scope snapshot, reorder/no-op behavior, additions/removals, task exclusion, missing artifacts, ready/done-only renewal, history retention, actor decorator parity, pre-approval drift, shared snapshot, failed eligibility, full-file/empty implementation, distinct missing/active/stale/mismatch errors, required verification, materialized metadata, and factory contracts.
- Transition/status/archive scenarios map to their existing suites, including recovery-only `archiving -> done` versus manual rejection, complete `ReconciledOperationBlockedError`, committed recovery after failed request, stale approval routing, disabled predicates, readiness-only entry, post-hook exit rejection, backward evidence preservation, explicit focused redesign, designing self-entry neutrality, active status persistence once, reachable read-only schema failure, external drift despite timestamp, draft shortcut, refresh option, rich status type, attempt/evidence distinction, cross-format parity, in-place recommendation, preserve/redesign routing, mandatory archive reconciler, plan-after-reconciliation, accepted link inclusion, archive live recheck, and archived v2 evidence.
- Skill scenarios map to source-template and installed-template tests: independent verify, shared full-mode attempt, standalone compliance, changed-input repeated work, generated parity, report-only compliance, delegated attempt validation, delegated downstream change-scoped branches, and delegated compliance non-ownership.

### Manual / E2E verification

1. Build and test:
   `pnpm --filter @specd/core test`, `pnpm --filter @specd/cli test`, `pnpm --filter @specd/skills test`, then `pnpm build`.
2. Create a change without policy flags and inspect its manifest; expect `manifestVersion: 2` and `{artifacts: downstream, workflow: preserve}`.
3. Load a v1 fixture through status without drift; expect no file rewrite. Perform a real edit; expect an atomic v2 write retaining every old event.
4. Put a future version in a fixture; expect exit 1 and `UNSUPPORTED_MANIFEST_VERSION`, with no mutation.
5. Enable spec approval, approve in ready, edit a fingerprinted artifact, run status; expect one stale event and committed return to designing. Repeat status; expect no new event.
6. Approve again, reorder the same spec IDs, and inspect status; expect approval to remain valid. Add then remove a spec; expect explicit scope differences, stale consent, retained old event scope, and renewal required.
7. Disable the spec gate, use preserve, drift a non-task artifact during implementing, run status; expect implementing retained, artifact blocker, and in-place review guidance.
8. Edit only a `hasTasks` artifact; expect no approval/verification drift. Leave a task incomplete and attempt archive; expect task blocker.
9. Start verification from implementing or done; expect an attempt and no transition. Complete without changing inputs; expect valid completed evidence. Change a linked file and complete another active attempt; expect mismatch with preserved baseline.
10. Run verification invalidate with reason A and repeat with reason B; expect first `invalidated: true`, second `false`, one event, retained fingerprint, reason A in text/JSON/TOON, and no self-transition.
11. Run `verifying -> done` without completed evidence, with active-only evidence, stale evidence, an unavailable verdict, explicit not-required, and fresh evidence; expect distinct actionable results and no implicit skip for unavailable validity.
12. Exercise `implementing -> verifying`, another permitted forward exit from implementing, and another permitted entry to verifying; expect readiness checks once per stable ID at each applicable boundary.
13. Sign off with no completion, active-only, stale legacy evidence, mismatch, and an empty resolved implementation set; expect distinct typed errors for the first four and concrete `{files:{}}` for success. Inspect a migrated v1 sign-off; expect `implementation: null` and renewal required.
14. Run `pnpm ai-agents:sync`, inspect verify/compliance skills in `.agents` and `.codex`, and confirm source/generated content is aligned.
15. Persist a v2 spec-approval invalidation caused by adding a spec and another caused by removing one; reload both and expect strict round-trip. Replace either kind with an unknown token and expect a corrupted-manifest error without rewrite.
16. From `archiving`, trigger required stale sign-off through status and expect automatic recovery to `done`; then request manual `archiving -> done` in a fresh fixture and expect protocol rejection. Repeat manual checks for `archivable|signed-off -> done`.
17. Configure the real schema provider to fail and run status; expect `SCHEMA_RESOLUTION_FAILED`, zero refresh/reconciler calls, and an unchanged manifest. Run transition/archive where reconciliation commits recovery; expect `RECONCILED_OPERATION_BLOCKED` with state, automatic return, blockers, and next action.
18. Use a pre-archive hook to add and accept an in-scope implementation link; expect the final publication plan/spec-lock to contain it. Repeat with an unresolved link and expect failure before snapshot or canonical write.
19. Run create once with only `--workflow-policy redesign` and once with both policy flags; inspect the exact structured policy. Run invalidate with a reason in JSON and TOON; expect a named `reason` field plus blockers and next action.
20. Run full verify delegated compliance and inspect logs/report paths; expect explicit outer attempt reuse and the same change-scoped context, spec dependency, spec-preview, report directory, and filename branches as standalone change compliance.
21. Set a non-default project invalidation policy and create changes through the CLI, config factory, direct factory, and kernel; expect identical inheritance when input is omitted and exact input precedence when supplied.
22. Invoke all three verification commands with an invalid format; expect exit 1, no attempt/evidence/event/timestamp change, and no kernel use-case invocation. Inject private sentinel fields into use-case test results and confirm JSON/TOON omit them.
23. Edit scope without changing any current approval/verification projection; expect implementation tracking refresh, `scopeChanged: true`, `validityChanged: false`, no invalidation warning, and blockers plus next action in text.
24. Invalidate completed verification from `archivable` and `archiving`; expect `/specd-verify` guidance without a lifecycle move when no gate recovery applies. Repeat with required stale spec consent and expect the higher-priority design recovery.
25. Archive a change that overlaps one preserve peer and one redesign/gated peer; expect reconciliation to retain the preserve peer with blockers and recover only the peer whose own policy/gates require designing. Confirm archive metadata was materialized without `RegenerateSpecMetadata`.

Expected failure indicators are duplicate invalidation/recovery events, any read-only migration write, repository hydration persisting validity, source bytes or unwhitelisted internal fields in output/history, mutation after invalid CLI format, a transition creating verification, a manual recovery-only edge succeeding, an eventful designing self-entry, archive planning before post-hook reconciliation, archive metadata regeneration through the obsolete use case, unconditional designing recovery for overlap peers, task content invalidating approval, `preserve` allowing forward drift, legacy unknown evidence passing a gate, stale evidence reported as not-found, missing structured invalidation reason, delegated compliance selecting non-change downstream branches, any CLI/skill computing fingerprints itself, approval renewal deleting history, or any approval/verification path resolving multiple actor identities or bypassing the configured privacy decorator.
