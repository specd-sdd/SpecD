# InvalidateVerification

## Purpose

A completed verification may need to be withdrawn explicitly even when no file drift has yet been detected. Manual invalidation must preserve the verified fingerprint and audit history, mark the current evidence stale, and apply the same phase-aware recovery used by automatic reconciliation.

## Requirements

### Requirement: Input and result contracts

`InvalidateVerification.execute` SHALL accept readonly `name` and mandatory human-readable `reason` fields.

It SHALL return the reconciled change, the resulting verification projection, whether this invocation newly invalidated it, the persisted invalidation reason, any sign-off validity consequence, canonical blockers and next action, and any automatic lifecycle return committed by canonical reconciliation.

### Requirement: Existing verification required

The use case operates from any lifecycle state of active changes with a completed verification projection. If the change does not exist it throws `ChangeNotFoundError`. If verification has never completed or only an unfinished attempt exists, it throws a typed `VerificationNotFoundError` without mutation.

Legacy historical evidence whose freshness is unknown counts as an existing completed record that may be explicitly marked stale; the operation MUST NOT fabricate its missing fingerprint.

### Requirement: Preserve evidence and mark stale

When the current completed verification is `valid`, the use case SHALL change its materialized status to `stale`, retain the original artifact and implementation fingerprints, algorithms, completion actor and time, and record the supplied reason as its invalidation cause.

It SHALL append one `verification-invalidated` event containing actor, time, reason, and completed verification identity. It MUST NOT delete, rewrite, or replace the verified baseline.

When the completed verification is already `stale`, the operation is idempotent: it still performs canonical observation/reconciliation, returns `invalidated: false`, preserves and returns the first persisted invalidation reason, and appends no duplicate event. A different reason supplied by the repeated request is not persisted or echoed as the authoritative reason. A revoked approval state is unrelated and MUST NOT be reinterpreted as verification.

### Requirement: Canonical reconciliation and recovery

Manual verification invalidation SHALL execute through the central serialized reconciliation path. It does not inspect or calculate a new fingerprint and does not start a new verification attempt.

The stale verification is phase-aware:

- before `verifying`, it remains durable context and does not replace the phase's normal next action
- at verification-requiring boundaries, it blocks forward progress and recommends a new start/checks/complete cycle in the current state
- if current sign-off relies on the invalidated verification, sign-off becomes stale and required sign-off recovery follows canonical gate priority

The verification-requiring boundary includes `verifying`, `done`, `archivable`, and `archiving` when no higher-priority approval or artifact recovery has changed the state. In each of those states, invalidation MUST retain the current lifecycle state and return the canonical verification blocker and `/specd-verify` next action; it MUST NOT return an empty next action merely because the state is later than `done`. If required sign-off or spec consent becomes stale, the returned action MUST instead describe the reconciler's committed higher-priority recovery.

Spec approval is not invalidated merely because verification was withdrawn. Projection changes, audit events, and any mandatory return SHALL be committed atomically.

### Requirement: No lifecycle self-transition

`InvalidateVerification` MUST NOT append a `transitioned` event to the same state, capture or replace an attempt baseline, run tests, validate artifacts, or approve any gate. A new verification baseline is captured by explicit `StartVerification` after input checks pass, without requiring phase movement.

### Requirement: Established use-case composition signatures

The use case SHALL expose:

- `InvalidateVerificationDeps`
- `InvalidateVerificationInput`
- `InvalidateVerificationResult`
- `createInvalidateVerification(deps: InvalidateVerificationDeps)`
- `createInvalidateVerification(config: SpecdConfig, options?: CompositionResolutionOptions)`
- `resolveInvalidateVerificationDeps(resolver)`

The config overload SHALL use `normalizeCompositionFactoryArgs`, resolve through the shared `CompositionResolver`, and delegate to canonical deps construction. Passing composition options with the deps overload SHALL raise the existing `InvalidCompositionFactoryArgumentsError`.

Dependencies SHALL include `ChangeRepository`, `ActorResolver`, and `ReconcileChangeValidity`. The factory MUST NOT reproduce filesystem wiring or initialize an entire kernel merely to obtain this use case.

## Constraints

- Invalidation preserves the completed verification fingerprint and append-only history.
- The command is idempotent for an already stale verification.
- Invalidation never creates or replaces an attempt baseline.
- `verifying → verifying` remains invalid.

## Spec Dependencies

- [core:change](../../core/change/spec.md) — completed verification projection and audit history
- [core:change-repository-port](../../core/change-repository-port/spec.md) — serialized atomic mutation
- [core:transition-checks](../../core/transition-checks/spec.md) — canonical validity and recovery priority
- [core:composition-resolver](../../core/composition-resolver/spec.md) — established config/deps factory resolution
