# ApproveSignoff

## Purpose

Human signoff MUST record consent on a change that stays in `done` (when the signoff gate is on). This use case hashes in-scope artifacts, appends a signoff history event, and MUST NOT transition into `pending-signoff` or `signed-off` on that happy path. Drain from `pending-signoff` remains for in-flight changes.

## Requirements

### Requirement: Gate guard

The gate guard sequence is:

1. If `approvals.signoff` is `false` (baked at construction), throw `ApprovalGateDisabledError` with gate `'signoff'`. No repository access occurs.
2. Load the change by name from the `ChangeRepository`. If no change exists, throw `ChangeNotFoundError`.
3. Resolve the current actor identity via `ActorResolver`.
4. Obtain the active schema from `SchemaProvider`. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these.
5. Compare `schema.name()` with `change.schemaName`. If they differ, throw `SchemaMismatchError`.

### Requirement: Change lookup

The use case MUST load the change by name from the `ChangeRepository`. If no change with the given name exists, it MUST throw a `ChangeNotFoundError`.

### Requirement: Artifact hash computation

Before sign-off, the use case SHALL refresh implementation tracking and link resolution, then delegate validity application to the central reconciler. It SHALL reuse the current non-task artifact fingerprint and compute an implementation fingerprint from all confirmed in-scope implementation links.

The implementation fingerprint SHALL deduplicate project-relative paths, sort them deterministically, and hash each complete file. Symbol ranges do not narrow signed content. Text uses the persisted `text-v1` normalization algorithm; binary files are hashed byte-for-byte. Added, removed, renamed, or unlinked paths alter the fingerprint. Missing or unreadable linked files fail sign-off. An observed empty file map is valid and differs from legacy missing evidence.

### Requirement: Signoff recording and state transition

Sign-off MAY be granted or renewed only while the reconciled change is in `done`, with valid verification evidence and no unresolved non-task artifact review.

On success `ApproveSignoff` SHALL append the `signed-off` audit event and persist a current sign-off projection with status `valid`, actor, reason, timestamp, artifact fingerprint, implementation fingerprint, and both algorithm identifiers. Prior sign-off and invalidation events remain unchanged.

Actor name and email SHALL continue to be resolved through the existing approval actor decorator and its privacy/fallback rules. One logical sign-off operation MUST resolve exactly one decorated `ActorIdentity` value and reuse it for reconciliation consequences, the materialized projection, and every appended event. Direct-dependency factory forms MUST NOT permit the use case and reconciler to observe different actor resolvers.

If required sign-off is stale while the change is beyond `done`, reconciliation SHALL first return it to `done`. If verification is stale, verification recovery must complete before sign-off can be renewed.

Verification eligibility failures SHALL remain semantically distinct: never-completed evidence raises the typed not-found error; an active attempt without completion raises the typed in-progress error; stale or legacy-unknown evidence raises a typed stale/not-current error with `/specd-verify` recovery; and a current record that does not match a supplied expected fingerprint raises fingerprint mismatch. Stale evidence MUST NOT be reported as `VerificationNotFoundError`.

### Requirement: Canonical pre-signoff reconciliation

`ApproveSignoff` MUST use the single application reconciler for validity detection, invalidation, and automatic recovery. It MUST NOT independently stale a projection or choose a return target. If fresh facts make sign-off inapplicable, it persists the canonical reconciliation and reports that blocker instead of approving a later snapshot.

### Requirement: Persistence and return value

After the disabled-gate fast failure and implementation-tracking refresh, `ApproveSignoff` SHALL run reconciliation, fingerprinting, and sign-off through one serialized repository mutation. The valid sign-off MUST refer to the same fresh artifact and implementation snapshot that passed eligibility checks.

If reconciliation makes sign-off inapplicable, it persists any invalidity and recovery and returns the blocker without signing. Historic drain from `pending-signoff` remains supported for in-flight manifests; new work remains in `done`. The result is the post-mutation reconciled `Change`.

### Requirement: Input contract

The `ApproveSignoffInput` interface MUST include:

- `name` (string) — the change slug identifying the target change.
- `reason` (string) — free-text rationale recorded in the signoff event.

All fields are required and readonly. Approval gate state MUST NOT appear on the input.

### Requirement: Approval gate baked at construction

`ApproveSignoff` SHALL accept approval gate configuration at construction time:

```typescript
type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }
```

The constructor MUST receive `approvals: ApprovalGates`. `createApproveSignoff(config)` and kernel wiring MUST pass `config.approvals`.

`ApproveSignoff.execute` MUST evaluate the signoff gate using `approvals.signoff` from construction. Callers MUST NOT supply gate flags per invocation.

### Requirement: Config-based factory delegates through resolveApproveSignoffDeps

The public factory SHALL retain canonical `createApproveSignoff(deps: ApproveSignoffDeps)` and convenience `createApproveSignoff(config, options?)`. The config form uses `normalizeCompositionFactoryArgs`, resolves dependencies with `resolveApproveSignoffDeps(resolver)`, and delegates to the canonical form; options with the deps overload use the standard invalid-factory-arguments error.

Dependencies SHALL include the change repository, actor resolver, schema provider, shared fingerprint service or hasher, approval gates, implementation-tracking refresh/link resolution, and the central validity reconciler. Composition MUST reuse shared resolver wiring and MUST NOT duplicate filesystem construction or initialize a whole kernel for one use case.

## Constraints

- The gate check MUST be the first validation step — no I/O occurs if the gate is disabled.
- Artifact hashes are computed from on-disk content at signoff time, not from cached or in-memory state.
- The use case does not validate artifact content beyond hashing it — content validation is a separate concern.
- The use case does not determine whether the gate should be enabled at execute time; gate state is fixed at construction from project configuration.

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:composition`](../composition/spec.md)
- [`core:kernel`](../kernel/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:transition-checks`](../transition-checks/spec.md) — `from` states for `approval.signoff` come from check registry bindings
