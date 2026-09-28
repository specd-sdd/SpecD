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

This validation happens before any mutation or approval guard handling.

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

Before mutation, the use case SHALL determine from the canonical verdict whether the requested invalidation would revoke a currently `valid` spec approval or sign-off. If so, it requires `force=true` and reports each affected gate and recovery target. Historical events and already stale or revoked projections do not by themselves trigger the guard.

Without force, no mutation occurs. With force, revocation, audit evidence, artifact effects, and recovery are applied atomically by the reconciler.

### Requirement: Canonical gate-safe invalidation and recovery

When execution passes validation and approval guards, `InvalidateChange` SHALL delegate the complete mutation to the central reconciler. Manual invalidation appends audit evidence and applies the artifact policy. Lifecycle state is preserved or returned to `designing` according to the workflow policy unless mandatory gate recovery is stricter.

Explicit invalidation of a valid approval requires `force=true`. A forced spec-approval revocation returns the change to `designing`; a forced sign-off revocation returns a later change to `done`; when both are affected, spec recovery wins. The operation MUST commit projection changes and recovery together and MUST be idempotent.

### Requirement: Manual invalidation cause

Manual invalidation executed through this use case MUST record the domain invalidation cause `artifact-review-required`.

The caller supplies only the human-readable `reason` string; it is recorded on the invalidated event message.

### Requirement: Policy-aware artifact effects

After change-level invalidation is accepted, artifact/file-state behavior MUST follow the effective policy:

- `none` — no artifact/file state is invalidated
- `surgical` — only the normalized target set is invalidated
- `downstream` — the normalized target set and all schema DAG descendants of the target artifact types are invalidated
- `global` — every artifact/file in the change is invalidated

The use case MUST obtain `schema.artifactDag()` from the active schema and pass it to `Change.invalidate()` for policy expansion.

The final affected set MUST be deduplicated before mutation and reporting.

### Requirement: Affected-set traversal order

After policy expansion and deduplication, `InvalidateChange` MUST order artifact types for human-facing reporting using `schema.artifactDag().topologicalOrder()`, retaining only artifact types present in the final affected set.

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

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

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
