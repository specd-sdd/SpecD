# ApproveSignoff

## Purpose

After implementation, a final human signoff is needed to confirm the change is ready for archival, with artifact hashes captured to detect any post-signoff modifications. The `ApproveSignoff` use case records a signoff on a change and transitions it to the `signed-off` state, enforcing that the gate is enabled, computing artifact hashes using schema-defined pre-hash cleanup rules, and persisting the updated change. It is the only path through the signoff gate in the change lifecycle.

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

Before recording the signoff, the use case MUST compute a content hash for every file across all artifacts in the change. For each artifact, it iterates over the artifact's `files` map. For each file:

1. Skip files with status `missing` or `skipped`.
2. Load the file content from the repository via `ChangeRepository.artifact(change, file.filename)`.
3. If the file cannot be loaded (returns `null`), skip it silently.
4. Resolve the active schema from the `SchemaRegistry` using the configured schema reference and workspace schema paths.
5. If the schema resolves, build a cleanup map of artifact-type to pre-hash cleanup rules; if it does not resolve, use an empty cleanup map.
6. Apply the matching cleanup rules (by artifact type) to the content, then hash the cleaned content via the `ContentHasher`.

The result is a `Record<string, string>` mapping `type:key` hash keys to hash strings (e.g. `"proposal:proposal"`, `"specs:default:auth/login"`), where `type` is the artifact type ID and `key` is the file key within the artifact.

### Requirement: Signoff recording and state transition

The use case MUST resolve the current actor identity via the `ActorResolver`, then:

1. Call `change.recordSignoff(reason, artifactHashes, actor)` to append a `signed-off` history event.
2. Call `change.transition('signed-off', actor)` to advance the lifecycle state.

The `Change` entity enforces that the transition from the current state to `signed-off` is valid. If the change is not in `pending-signoff` state, the entity throws an `InvalidStateTransitionError`.

### Requirement: Persistence and return value

After computing artifact hashes, the use case MUST record the signoff and lifecycle transition through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`; the use case records the signoff on that instance, transitions it to `signed-off`, and returns the updated change. This ensures the signoff event, artifact hashes, and lifecycle transition are persisted atomically with respect to other mutations of the same change.

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
- `hasher: ContentHasher`
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
