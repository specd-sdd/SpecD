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

Before recording the signoff, the use case MUST compute a content hash for every file across all artifacts in the change. Obtain the schema once from `SchemaProvider.get()`. Build a cleanup map from that schema. For each artifact, iterate the artifact's `files` map. For each file:

1. Skip files with status `missing` or `skipped`.
2. Load the file content from the repository via `ChangeRepository.artifact(change, file.filename)`.
3. If the file cannot be loaded (returns `null`), skip it silently.
4. Apply the matching cleanup rules (by artifact type) to the content, then hash the cleaned content via the `ContentHasher`.

The result is a `Record<string, string>` mapping `type:key` hash keys to hash strings (e.g. `"proposal:proposal"`, `"specs:default:auth/login"`), where `type` is the artifact type ID and `key` is the file key within the artifact.

### Requirement: Signoff recording and state transition

The use case MUST resolve the current actor identity via the `ActorResolver`, then call `change.recordSignoff(reason, artifactHashes, actor)` to append a `signed-off` history event.

When the change is in a state bound as `from` for `approval.signoff` (check registry bindings; currently `done`), it MUST NOT call `change.transition('signed-off', actor)` or `change.transition('pending-signoff', actor)`. The change remains in that state so `approval.signoff` can pass on the next bound delivery edge.

Drain: when the change is already in `pending-signoff`, the use case MAY still `change.transition('signed-off', actor)`. Drain states are not `approval.signoff` bindings.

### Requirement: Persistence and return value

After computing artifact hashes, the use case MUST record the signoff through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the use case records the signoff on the fresh change. It MUST NOT transition a change whose state is bound as `from` for `approval.signoff` into `pending-signoff` or `signed-off`. Drain transitions from `pending-signoff` remain allowed.

`ApproveSignoff.execute` returns the updated `Change` entity produced by that serialized mutation.

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

The config-based `createApproveSignoff(config, options?)` form MUST derive `ApproveSignoffDeps` through `resolveApproveSignoffDeps(resolver)` and then delegate to canonical `createApproveSignoff(deps)`.

`resolveApproveSignoffDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `contentHasher: ContentHasher`
- `approvals: ApprovalGates`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

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
