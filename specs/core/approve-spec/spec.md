# ApproveSpec

## Purpose

Human spec approval MUST record consent on a change that stays in `ready` (when the spec gate is on). This use case hashes in-scope artifacts, appends a spec-approval history event, and MUST NOT transition into `pending-spec-approval` or `spec-approved` on that happy path. Drain from `pending-spec-approval` remains for in-flight changes.

## Requirements

### Requirement: Gate guard

The gate guard sequence is:

1. If `approvals.spec` is `false` (baked at construction), throw `ApprovalGateDisabledError` with gate `'spec'`. No repository access occurs.
2. Load the change by name from the `ChangeRepository`. If no change exists, throw `ChangeNotFoundError`.
3. Resolve the current actor identity via `ActorResolver`.
4. Obtain the active schema from `SchemaProvider`. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these.
5. Compare `schema.name()` with `change.schemaName`. If they differ, throw `SchemaMismatchError`.

### Requirement: Change lookup

The use case MUST load the change by name from the `ChangeRepository`. If no change with the given name exists, it MUST throw a `ChangeNotFoundError`.

### Requirement: Artifact hash computation

Before approval, `ApproveSpec` SHALL delegate to the central validity reconciler and use its fresh scope and artifact projection. It SHALL compute a scope-aware fingerprint containing the exact sorted, deduplicated canonical `specIds` and a deterministic artifact fingerprint for every schema-relevant artifact file except artifacts whose type declares `hasTasks: true`, applying each artifact's configured `preHashCleanup` before hashing.

The approval MUST fail if a required artifact is missing or structurally invalid, or if any non-task artifact has drift or pending review. Validation establishes a structural baseline but does not itself constitute semantic or human approval.

### Requirement: Approval recording and state transition

Spec approval MAY be granted or renewed only while the reconciled change is in `ready`. `ApproveSpec` MUST NOT transition the change to an approval state.

On success it SHALL append the `spec-approved` audit event and persist a current spec-approval projection with status `valid`, actor, reason, timestamp, and the exact scope-aware fingerprint reviewed. The current projection and event SHALL contain the same canonical scope and artifact fingerprint. It replaces the current projection but never removes prior approval or invalidation events.

Actor name and email SHALL continue to be resolved through the existing approval actor decorator and its privacy/fallback rules. One logical approval operation MUST resolve exactly one decorated `ActorIdentity` value and reuse it for reconciliation consequences, the materialized projection, and every appended event. Scope-aware fingerprinting and direct-dependency factory forms MUST NOT introduce a second identity-resolution path or permit inconsistent actor resolvers.

A stale or revoked required spec approval cannot be renewed in `implementing`; reconciliation first returns the change to `designing`, after which artifacts are reviewed, the change reaches `ready`, and approval is granted there.

### Requirement: Canonical pre-approval reconciliation

`ApproveSpec` MUST use the single application reconciler for validity detection, invalidation, and automatic recovery. It MUST NOT independently mark a gate stale, infer recovery, or append a return transition. If reconciliation changes the state so approval is inapplicable, the use case SHALL persist that result and stop with the reconciled blocker.

### Requirement: Persistence and return value

After the disabled-gate fast failure, `ApproveSpec` SHALL run reconciliation and approval through one serialized repository mutation using fresh persisted state and file facts. If the canonical verdict is not eligible for approval, it persists any detected invalidity or recovery and returns the typed blocker without adding approval.

If eligible, the mutation records the valid materialized spec approval and its audit event while the change remains in `ready`. Historic drain from `pending-spec-approval` remains supported for in-flight manifests, but new work MUST NOT enter that state. The result is the post-mutation reconciled `Change`.

### Requirement: Input contract

The `ApproveSpecInput` interface MUST include:

- `name` (string) — the change slug identifying the target change.
- `reason` (string) — free-text rationale recorded in the approval event.

All fields are required and readonly. Approval gate state MUST NOT appear on the input.

### Requirement: Approval gate baked at construction

`ApproveSpec` SHALL accept approval gate configuration at construction time:

```typescript
type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }
```

The constructor MUST receive `approvals: ApprovalGates`. `createApproveSpec(config)` and kernel wiring MUST pass `config.approvals`.

`ApproveSpec.execute` MUST evaluate the spec gate using `approvals.spec` from construction. Callers MUST NOT supply gate flags per invocation.

### Requirement: Config-based factory delegates through resolveApproveSpecDeps

The public factory SHALL retain both established forms: canonical `createApproveSpec(deps: ApproveSpecDeps)` and convenience `createApproveSpec(config, options?)`. The config form uses `normalizeCompositionFactoryArgs`, obtains deps through `resolveApproveSpecDeps(resolver)`, and delegates to the canonical form; options with the deps overload use the standard invalid-factory-arguments error.

`ApproveSpecDeps` and `resolveApproveSpecDeps` SHALL provide the change repository, actor resolver, schema provider, content hasher or shared fingerprint service, approval gates, and the central validity reconciler. They MUST NOT duplicate filesystem bootstrap or construct an entire kernel to obtain reconciliation.

## Constraints

- The gate check MUST be the first validation step — no I/O occurs if the gate is disabled.
- Artifact hashes are computed from on-disk content at approval time, not from cached or in-memory state.
- The use case does not validate artifact content beyond hashing it — content validation is a separate concern.
- The use case does not determine whether the gate should be enabled at execute time; gate state is fixed at construction from project configuration.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:composition`](../composition/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:transition-checks`](../transition-checks/spec.md) — `from` states for `approval.spec` come from check registry bindings
