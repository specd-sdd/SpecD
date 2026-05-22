# InvalidateChange

## Purpose

Changes need an explicit way to be invalidated for semantic review without pretending that every invalidation is physical drift. The system also needs one canonical place where policy-aware artifact reopening, approval rollback, focused target handling, and invalidation event recording are coordinated for manual invalidation.

This spec defines the `InvalidateChange` use case for explicit invalidation requests. It covers target normalization, policy resolution, approval guards, and the contract between the command surface and the `Change` entity's invalidation behavior.

## Requirements

### Requirement: Input contract

`InvalidateChange.execute` MUST accept an input object with:

- `name` — the target change name
- `reason` — mandatory human-readable explanation recorded on the invalidated event
- `policyOverride` — optional one-off invalidation policy override
- `targets` — optional repeated normalized targets
- `force` — optional confirmation flag for destructive approval/signoff rollback

Targets use one canonical shape:

- `<artifactId>` — the whole artifact
- `<artifactId>@<specId>` — one spec-scoped artifact file

### Requirement: Effective policy resolution

The use case MUST resolve one effective invalidation policy for the execution:

- `policyOverride`, when provided
- otherwise the change's persisted `invalidationPolicy`

The use case MUST NOT maintain a separate manual-default policy dimension.

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

If the loaded change currently has an active spec approval or signoff, the use case MUST stop by default and require explicit confirmation via `force=true` before executing the invalidation.

Without `force=true`, the use case MUST fail without mutating the change.

### Requirement: Change-level invalidation is unconditional

When execution proceeds past validation and approval guards, the use case MUST invalidate the change and return it to `designing` regardless of the effective invalidation policy.

The invalidation policy governs only artifact/file-state consequences, not whether the change-level invalidation occurs.

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

On success, the use case MUST return:

- the updated `Change`
- the effective invalidation policy
- the final deduplicated affected artifact/file set after policy expansion

This affected set is the authoritative result for human-facing reporting.

## Constraints

- `InvalidateChange` MUST NOT perform filesystem drift detection itself.
- The use case MUST delegate lifecycle rollback and policy-aware invalidation to the `Change` entity rather than re-implementing entity rules externally.
- Target validation failures happen before approval/signoff confirmation handling.

## Spec Dependencies

- [`core:change`](../change/spec.md) — `Change.invalidate()` owns lifecycle rollback and policy-aware artifact mutation.
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md) — downstream consequences are interpreted later from canonical artifact states.
- [`core:config`](../config/spec.md) — the persisted `invalidationPolicy` originates from project/change configuration.
- [`default:_global/architecture`](../../_global/architecture/spec.md) — use-case orchestration versus entity-owned invalidation rules.
