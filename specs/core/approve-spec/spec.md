# ApproveSpec

## Purpose

Changes need a controlled gate where a human confirms the spec is correct before implementation proceeds, and artifact hashes must be captured at that moment to detect later tampering. The `ApproveSpec` use case records a spec approval on a change and transitions it to the `spec-approved` state, enforcing that the gate is enabled, computing artifact hashes using schema-defined pre-hash cleanup rules, and persisting the updated change. It is the only path through the spec approval gate in the change lifecycle.

## Requirements

### Requirement: Gate guard

The use case MUST reject the operation with an `ApprovalGateDisabledError` if the `approvalsSpec` input flag is `false`. The gate check MUST occur before any repository access or side effects.

### Requirement: Change lookup

The use case MUST load the change by name from the `ChangeRepository`. If no change with the given name exists, it MUST throw a `ChangeNotFoundError`.

### Requirement: Artifact hash computation

Before recording the approval, the use case MUST compute a content hash for every artifact in the change. For each artifact:

1. Load the artifact content from the repository via `ChangeRepository.artifact()`.
2. If the artifact cannot be loaded (returns `null`), skip it silently.
3. Resolve the active schema from the `SchemaRegistry` using the configured schema reference and workspace schema paths.
4. If the schema resolves, build a cleanup map of artifact-type to pre-hash cleanup rules; if it does not resolve, use an empty cleanup map.
5. Apply the matching cleanup rules (by artifact type) to the content, then hash the cleaned content via the `ContentHasher`.

The result is a `Record<string, string>` mapping artifact filename to hash string.

### Requirement: Approval recording and state transition

The use case MUST resolve the current actor identity via the `ActorResolver`, then:

1. Call `change.recordSpecApproval(reason, artifactHashes, actor)` to append a `spec-approved` history event.
2. Call `change.transition('spec-approved', actor)` to advance the lifecycle state.

The `Change` entity enforces that the transition from the current state to `spec-approved` is valid. If the change is not in `pending-spec-approval` state, the entity throws an `InvalidStateTransitionError`.

### Requirement: Persistence and return value

After recording the approval and transitioning state, the use case MUST persist the change via `ChangeRepository.save()` and return the updated `Change` entity.

### Requirement: Input contract

The `ApproveSpecInput` interface MUST include:

- `name` (string) -- the change slug identifying the target change.
- `reason` (string) -- free-text rationale recorded in the approval event.
- `approvalsSpec` (boolean) -- whether the spec approval gate is enabled in the active configuration.

All fields are required and readonly.

## Constraints

- The gate check MUST be the first validation step -- no I/O occurs if the gate is disabled.
- Artifact hashes are computed from on-disk content at approval time, not from cached or in-memory state.
- The use case does not validate artifact content beyond hashing it -- content validation is a separate concern.
- The use case does not determine whether the gate should be enabled; the caller passes that decision as `approvalsSpec`.

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) -- Change entity lifecycle and state machine
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) -- schema structure and pre-hash cleanup rules
- [`specs/core/composition/spec.md`](../composition/spec.md) -- how the use case is wired and injected
- [`specs/core/kernel/spec.md`](../kernel/spec.md) -- kernel entry under `specs.approveSpec`
