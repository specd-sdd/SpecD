# ApproveSignoff

## Purpose

After implementation, a final human signoff is needed to confirm the change is ready for archival, with artifact hashes captured to detect any post-signoff modifications. The `ApproveSignoff` use case records a signoff on a change and transitions it to the `signed-off` state, enforcing that the gate is enabled, computing artifact hashes using schema-defined pre-hash cleanup rules, and persisting the updated change. It is the only path through the signoff gate in the change lifecycle.

## Requirements

### Requirement: Gate guard

The use case MUST reject the operation with an `ApprovalGateDisabledError` if the `approvalsSignoff` input flag is `false`. The gate check MUST occur before any repository access or side effects.

### Requirement: Change lookup

The use case MUST load the change by name from the `ChangeRepository`. If no change with the given name exists, it MUST throw a `ChangeNotFoundError`.

### Requirement: Artifact hash computation

Before recording the signoff, the use case MUST compute a content hash for every artifact in the change. For each artifact:

1. Load the artifact content from the repository via `ChangeRepository.artifact()`.
2. If the artifact cannot be loaded (returns `null`), skip it silently.
3. Resolve the active schema from the `SchemaRegistry` using the configured schema reference and workspace schema paths.
4. If the schema resolves, build a cleanup map of artifact-type to pre-hash cleanup rules; if it does not resolve, use an empty cleanup map.
5. Apply the matching cleanup rules (by artifact type) to the content, then hash the cleaned content via the `ContentHasher`.

The result is a `Record<string, string>` mapping artifact filename to hash string.

### Requirement: Signoff recording and state transition

The use case MUST resolve the current actor identity via the `ActorResolver`, then:

1. Call `change.recordSignoff(reason, artifactHashes, actor)` to append a `signed-off` history event.
2. Call `change.transition('signed-off', actor)` to advance the lifecycle state.

The `Change` entity enforces that the transition from the current state to `signed-off` is valid. If the change is not in `pending-signoff` state, the entity throws an `InvalidStateTransitionError`.

### Requirement: Persistence and return value

After recording the signoff and transitioning state, the use case MUST persist the change via `ChangeRepository.save()` and return the updated `Change` entity.

### Requirement: Input contract

The `ApproveSignoffInput` interface MUST include:

- `name` (string) -- the change slug identifying the target change.
- `reason` (string) -- free-text rationale recorded in the signoff event.
- `approvalsSignoff` (boolean) -- whether the signoff gate is enabled in the active configuration.

All fields are required and readonly.

## Constraints

- The gate check MUST be the first validation step -- no I/O occurs if the gate is disabled.
- Artifact hashes are computed from on-disk content at signoff time, not from cached or in-memory state.
- The use case does not validate artifact content beyond hashing it -- content validation is a separate concern.
- The use case does not determine whether the gate should be enabled; the caller passes that decision as `approvalsSignoff`.

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) -- Change entity lifecycle and state machine
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) -- schema structure and pre-hash cleanup rules
- [`specs/core/composition/spec.md`](../composition/spec.md) -- how the use case is wired and injected
- [`specs/core/kernel/spec.md`](../kernel/spec.md) -- kernel entry under `specs.approveSignoff`
