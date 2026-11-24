# InvalidateChange

## Purpose

Changes need an explicit way to be invalidated for semantic review without pretending that every invalidation is physical drift. The system also needs one canonical place where policy-aware artifact reopening, approval rollback, focused target handling, and invalidation event recording are coordinated for manual invalidation.

This spec defines the `InvalidateChange` use case for explicit invalidation requests. It covers target normalization, policy resolution, approval guards, and the contract between the command surface and the `Change` entity's invalidation behavior.

## Requirements

### Requirement: Input contract

`InvalidateChange.execute` MUST accept `name`, mandatory human-readable `reason`, optional structured `policyOverride`, optional repeated `targets`, and optional `force` confirmation.

`policyOverride` MAY set `artifacts: none | surgical | downstream | global` and `workflow: preserve | redesign` independently. Targets use `<artifactId>` or `<artifactId>@<specId>`. The override applies only to this execution and MUST NOT mutate the change's persisted default policy.

### Requirement: Effective policy resolution

The use case SHALL resolve one effective structured policy by overlaying the supplied override on the change's persisted `invalidation` policy. Target requirements are determined solely by the effective `artifacts` dimension. The `workflow` dimension does not alter target syntax or artifact expansion.

### Requirement: Policy-dependent target rules

After resolving the effective policy, the use case MUST validate command shape against it:

- `surgical` and `downstream` REQUIRE at least one target
- `none` and `global` MUST reject any target as invalid input

This validation happens before any mutation or approval guard handling. Validation error messages MUST use host-neutral domain terms (`targets`, `policy`) and MUST NOT embed CLI flag names such as `--target`.

### Requirement: Target normalization and validation

When targets are allowed, the use case MUST:

1. Normalize every requested target
2. Validate artifact existence and scope compatibility
3. Deduplicate the normalized target set
4. Fail the whole command if any target is invalid

Validation errors MUST accumulate across the entire requested target set. The use case MUST report every invalid target combination it finds instead of stopping at the first error.

For scope compatibility:

- `<artifactId>@<specId>` is only valid for `scope: spec` artifacts
- `<artifactId>` against a `scope: spec` artifact targets all files for that artifact across specs in the change
- `<artifactId>` against a `scope: change` artifact targets that single change-scoped file

### Requirement: Approval guard

Before applying the invalidation, inside the same serialized reconciler mutation, the use case SHALL determine from the spec-approval and sign-off projection status as left by the reconciler's pre-pass over the fresh files whether the requested invalidation would revoke a currently `valid` spec approval or sign-off. A consent whose projection was persisted as `valid` but which is already stale according to its fingerprints has recovered through that pre-pass, is not currently valid and MUST recover without `force`. If a consent still has projection status `valid` after the pre-pass, the request requires `force=true` and reports each affected gate and recovery target via `InvalidateRequiresForceError` (exposing `gates` and `recoveries` metadata) with a host-neutral message that does not embed CLI flags such as `--force`. Historical events and already stale or revoked consent do not by themselves trigger the guard.

Only consent of gates that are enabled in the configured approvals (`approvals.spec`, `approvals.signoff`) is considered by the guard and by the forced-revocation recovery preview. A valid consent record of a disabled gate is revoked by the invalidation without requiring `force`, never produces a recovery and never appears in `gates` or `recoveries`, because the reconciler treats a disabled gate as not required.

Revoking the valid consent of a disabled gate is recorded in the change history as one `approval-invalidated` event (status `revoked`, cause `manual-invalidation`) and reported in the result's `projectionChanges`. A consent revoked this way is not restored if the gate is later re-enabled: the next reconciliation treats the gate as having revoked consent and consent MUST be recorded again. In `designing` nothing moves; in `ready` the change stays in `ready` and consent is renewed there; in any later state spec-consent recovery returns the change to `designing`, and a revoked sign-off returns a change after `done` to `done`.

When valid consent of an enabled gate and valid consent of a disabled gate coexist and `force` is not set, the guard fails with `InvalidateRequiresForceError` and nothing is revoked, including the consent of the disabled gate; with `force` both are revoked. Without force, no mutation occurs. With force, revocation, audit evidence, artifact effects, and recovery are applied atomically by the reconciler.

The forced-revocation recovery preview reported in `InvalidateRequiresForceError` (`forceRecoveries` / `recoveries`) MUST be computed with the effective invalidation policy of the request (the persisted change policy combined with the execution overrides), never with a fixed policy, so it reports exactly the recovery the reconciler will commit. The preview is the single combined recovery that the reconciler would commit for the whole set of revoked gates, selected with the same priority as the reconciler (spec consent recovery to `designing` outranks sign-off recovery to `done`, which outranks workflow redesign). Every affected gate is still listed, each entry reporting the target of that one combined recovery (or the current state when no move would be committed), so with both gates valid and `force` the target is `designing` for the whole set. In particular, a spec-approval revocation from `ready` reports no move (the change stays in `ready`) under workflow `preserve`, and reports `designing` when the effective workflow is `redesign`.

With only the sign-off gate enabled and valid, the preview lists only `signoff`, with target `done` when the change is past `done`.

### Requirement: Canonical gate-safe invalidation and recovery

When execution passes validation and approval guards, `InvalidateChange` SHALL delegate the complete mutation to the central reconciler. Manual invalidation appends audit evidence and applies the artifact policy. Lifecycle state is preserved or returned to `designing` according to the effective workflow policy unless mandatory gate recovery is stricter.

Explicit invalidation that would revoke a valid consent of an enabled gate requires `force=true` (see Approval guard); revoking the valid consent of a disabled gate never requires `force`. A forced spec-approval revocation returns the change to `designing` from states after `ready`; from `ready` the change stays in `ready` (the spec gate blocks leaving `ready` and consent is renewed there) unless the effective workflow policy is `redesign`, in which case it returns to `designing`. A forced sign-off revocation returns a later change to `done`; when both are affected, spec recovery wins and the single committed recovery returns to `designing`. The operation MUST commit projection changes and recovery together and MUST be idempotent.

### Requirement: Manual invalidation cause

Manual invalidation executed through this use case MUST record the domain invalidation cause `artifact-review-required`.

The caller supplies only the human-readable `reason` string; it is recorded on the invalidated event message.

### Requirement: Policy-aware artifact effects

After change-level invalidation is accepted, artifact/file-state behavior MUST follow the effective policy:

- `none` - no artifact/file state is invalidated
- `surgical` - only the normalized target set is invalidated
- `downstream` - the normalized target set and all schema DAG descendants of the target artifact types are invalidated
- `global` - every artifact/file in the change is invalidated

The artifact DAG of the change's sovereign schema is used for policy expansion by the central reconciler (which owns the `Change.invalidate` call); the use case does not pass it to `Change.invalidate()` directly.

The final affected set MUST be deduplicated before mutation and reporting.

### Requirement: Affected-set traversal order

After policy expansion and deduplication, artifact types in the final affected set MUST be ordered for human-facing reporting in DAG topological order, retaining only artifact types present in the final affected set. The ordering and descendant expansion are performed by the central reconciler over the schema's artifact DAG (`dag.descendantsOf` / `topologicalOrder()`), not by the use case.

Within each artifact type, file entries MUST follow stable change manifest order.

The use case MUST NOT build a private adjacency map from persisted artifact `requires` for ordering.

### Requirement: Manual invalidation does not invent drift

Manual invalidation MUST NOT set, clear, or infer `hasDrift`.

`hasDrift` changes only when physical file state is compared to the validated baseline and found equal or unequal.

### Requirement: Idempotence on already reopened targets

If a targeted artifact/file is already in `pending-review` or `drifted-pending-review`, invalidation leaves that state unchanged and continues normally.

Already reopened targets are not command errors.

### Requirement: Output contract

On success the use case SHALL return the reconciled `Change`, the recorded human-readable `reason`, the effective structured invalidation policy, the deduplicated affected artifact/file set, all approval or verification projection changes, canonical blockers and next action, and any automatic lifecycle return committed by reconciliation. This result is authoritative for CLI reporting.

### Requirement: Config-based factory delegates through resolveInvalidateChangeDeps

The config-based `createInvalidateChange(config, options?)` form MUST derive `InvalidateChangeDeps` through `resolveInvalidateChangeDeps(resolver)` and then delegate to canonical `createInvalidateChange(deps)`.

`resolveInvalidateChangeDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `resolveChangeSchema: ResolveChangeSchema`
- `reconcile: ReconcileChangeValidity`
- `approvals`: the configured approval gate flags
- `transitionBindings` and, when present, `checkRegistry`, taken from the shared workflow check registry composition so that `evaluateLifecycle` evaluates the same forward candidates as `TransitionChange` and `GetStatus`

When `InvalidateChange` is constructed directly (outside this resolver), `transitionBindings` defaults to the domain `TRANSITION_BINDINGS` stubs, which carry no executable forward checks, and `checkRegistry` may be absent; the composition factory MUST always supply the real composed bindings and registry so recovery guidance is based on forward checks.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

### Requirement: Sovereign schema resolution

`InvalidateChange` MUST resolve the schema through `ResolveChangeSchema` after loading the target change. Artifact targets, global targets, and downstream propagation MUST be derived from that sovereign schema's artifact DAG.

The use case delegates the `Change.invalidate` mutation and the DAG-based expansion and ordering (`topologicalOrder()` / descendant traversal) to the central reconciler; it passes the resolved schema context and normalized targets to the reconciler and does not call `Change.invalidate` itself.

The use case MUST NOT consult the workspace default schema for a change-scoped invalidation, even when the default differs from the schema recorded on the change. Schema resolution errors MUST propagate before invalidation is persisted.

### Requirement: Next action follows lifecycle guidance

The `nextAction` returned after an invalidation that triggers an automatic recovery MUST be derived from lifecycle guidance (`evaluateLifecycle`) for the recovered state under the change's sovereign schema, not from a hard-coded intent per recovery target. When no automatic recovery occurred (`automaticReturn` is null), `nextAction` is the neutral fallback `{ targetStep: <current state>, actionType: 'cognitive', intent: null }` with a host-neutral reason asking the caller to review the reported blockers before advancing. It MUST be host-neutral: `intent` (`design | implement | verify | archive`) and an optional check-declared `action`, with no CLI command, flag, or slash command.

To obtain check-declared actions, `InvalidateChange` MUST evaluate the forward checks of the recovered state through the `CheckRegistry` supplied at construction (it MUST NOT pass an empty `checksByTarget`). When the schema disables `verifying`, the guidance MUST NOT be `intent: 'verify'` or an action of kind `start-verification`.

## Constraints

- `InvalidateChange` does not perform filesystem drift detection.
- Target validation completes before approval/sign-off confirmation handling.
- The use case delegates complete invalidation and recovery orchestration to the central reconciler. Aggregate methods may apply domain state changes but are not an independent application path.
- Manual invalidation never invents or clears physical `hasDrift` evidence.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md)
- [`core:config`](../config/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [core:resolve-change-schema](../resolve-change-schema/spec.md) — named sovereign lookup, provider identity validation, and same-name version advisory
