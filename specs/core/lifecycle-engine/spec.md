# Lifecycle Engine

## Purpose

Unifying lifecycle validation, artifact status, and repair diagnostics into a single source of truth is critical to preventing "liar context" and ensuring consistent system behavior. The `LifecycleEngine` is a centralized domain service that combines the change's persisted state with schema-defined workflow rules to derive the authoritative effective state, available transitions, and machine-readable blockers.

## Requirements

### Requirement: Centralized validation logic

The `LifecycleEngine` SHALL be the sole authority for interpreting a change's state within a project's workflow. It MUST unify three validation dimensions:

1.  **Protocol Validation**: Enforcing the valid state transition graph.
2.  **Artifact Validation**: Verifying structural completion of required artifacts.
3.  **Content Validation**: Checking internal task completion within artifacts.

### Requirement: Effective artifact status computation

Artifacts may contain multiple files (e.g., one per spec ID). The `Change` entity persists an _aggregated_ state for the artifact based on its files. The engine MUST compute the logical (effective) status of every artifact by combining this aggregated persisted state with its dependency chain.

The public contract remains centered on `LifecycleEngine.evaluate(...)`. Effective artifact statuses are returned as part of that verdict; callers MUST NOT depend on a separate public `computeEffectiveStatus(...)` API.

The engine exists specifically because the entity does not know the schema artifact DAG. Persisted aggregate status and history remain on `Change`; dependency-aware effective status is derived here.

**Mapping Rules:**

- If the aggregated state is `drifted-pending-review`, its effective status remains `drifted-pending-review`.
- If the aggregated state is `pending-review`, its effective status remains `pending-review`.
- If the aggregated state is `complete` but any of its required upstream dependencies is not `complete` or `skipped`, its effective status SHALL be `pending-parent-artifact-review`.
- In any other case, the effective status matches the aggregated persisted state (`missing`, `in-progress`, `complete`, `skipped`).

The engine MUST detect recursive blocks: if Spec B depends on Spec A, and Spec A is `pending-review`, Spec B's effective status becomes `pending-parent-artifact-review`.

### Requirement: Machine-readable blockers

For every condition that prevents a transition or marks an artifact as incomplete, the engine MUST provide a structured `Blocker` object containing:

- `code`: A unique machine-readable identifier.
- `message`: A human-readable description.
- `isSkippable`: Boolean indicating if the blocker can be bypassed via a CLI flag or configuration.
- `bypassFlag`: (Optional) The name of the flag that bypasses this blocker (e.g., `--allow-overlap`).
- `affectedArtifacts` (optional): Detail identifying the specific artifact IDs and files.

If a blocker is skippable and the corresponding bypass is active in the engine's input, the engine SHALL treat the condition as a warning rather than a transition blocker.

**Mandatory Blocker Codes:**

- `MISSING_ARTIFACT`: A required artifact is completely absent (state: `missing`).
- `INCOMPLETE_ARTIFACT`: An artifact exists but has not been validated (state: `in-progress`).
- `ARTIFACT_DRIFT`: An artifact has changed on disk since its last validation (state: `drifted-pending-review`).
- `REVIEW_REQUIRED`: An artifact was invalidated or downgraded and requires review (state: `pending-review`).
- `PENDING_PARENT_REVIEW`: An artifact is blocked because one of its upstream dependencies requires review.
- `INCOMPLETE_TASKS`: An artifact contains unfinished checklist items (e.g., `- [ ]`).
- `OVERLAP_CONFLICT`: The change scope overlaps with specs modified by a recently archived change.
- `INVALID_TRANSITION`: The requested transition is not permitted by the lifecycle state machine.
- `APPROVAL_REQUIRED`: The transition is gated by a required human approval (spec approval or sign-off).

For file-level blockers (drift, review, parent review), the `affectedArtifacts` field MUST contain a grouped list identifying the specific artifact IDs and the exact filenames/paths that triggered the blocker.

### Requirement: Available steps and next action

The engine MUST derive the set of `AvailableStep` entries and the authoritative `EffectiveTarget` based on the current change state, project configuration (approval gates), and active bypass flags.

**Approval Gate Routing:**

- If a transition to a gated step (e.g., `implementing`) is requested and the corresponding gate is active (e.g., `approvals.spec: true`), the engine MUST route the transition to the intermediate pending state (e.g., `pending-spec-approval`).
- If a gate is disabled, any attempt to reach its corresponding pending or approved states MUST be blocked with an `INVALID_TRANSITION` code.

**Step Availability:**

- `isReady`: Whether all required artifacts for the step are logically complete/skipped.
- `isPermitted`: Whether the lifecycle protocol allows the transition. This check MUST combine the static `VALID_TRANSITIONS` graph with the dynamic approval status and active skippable blockers.

Based on the current state and blockers, the engine MUST recommend a single `NextAction` (cognitive or mechanical) to guide the user or agent toward the next valid state.

### Requirement: Review summary integration

The engine MUST detect and report **Drift** (physical content changes since last validation) and **Overlap** (conflicts with specs targeted by other archived changes) as part of the blocking diagnostics.

### Requirement: Shared lifecycle interpretation for consumers

Use cases that need DAG-aware lifecycle answers MUST consume `LifecycleEngine` rather than reimplementing schema interpretation locally.

This includes, at minimum:

- status/reporting consumers that need effective artifact status or blockers
- transition consumers that need routing and gated availability
- validation consumers that need dependency-order checks or recursive blocker context
- instruction consumers that need to determine which artifact is next in the DAG

## Spec Dependencies

- [`core:change`](../change/spec.md) — Source of persisted state facts (hashes, history, base status).
- [`core:workflow-model`](../workflow-model/spec.md) — Source of workflow transition rules and task gating requirements.
- [`core:schema-format`](../schema-format/spec.md) — Source of artifact requirements and schema structure.
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — Defines service layer boundaries.
