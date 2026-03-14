# Workflow Model

## Purpose

The schema format defines the YAML structure of workflow step entries, but not what those steps mean semantically — when they are available, how they relate to change state, or which execution model governs each step. Without a dedicated semantic model, every consumer (CompileContext, GetStatus, CLI commands) would interpret step semantics independently, leading to inconsistent gating and unclear agent interaction contracts. This spec defines the semantic model of workflow steps: how step names relate to change states, how requires-based gating works, and what execution model each step implies.

## Requirements

### Requirement: Step names reference domain lifecycle states

The Change entity defines a fixed set of lifecycle states (`drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, plus approval gate states). The schema's `workflow[]` array references these states via the `step` field — it selects which states participate in the workflow and in what display order, but does not define new states.

If a schema declares a `step` value that does not correspond to a valid Change lifecycle state, `TransitionChange` rejects it with `InvalidStateTransitionError`. The domain enforces the state machine; the schema configures which states are workflow-visible and what gating and hooks apply to them.

### Requirement: Step semantics

Each workflow step has a defined semantic role in the change lifecycle:

- **Designing** (`designing`) — the agent creates or modifies spec artifacts (proposal, specs, verify, design, tasks). This step iterates over the artifact DAG: `CompileContext` is called once per artifact being authored. The step is typically always available (empty `requires`).
- **Implementing** (`implementing`) — the agent writes code and completes tasks. All working artifacts (tasks, specs) must be complete. The step runs once (not per-artifact).
- **Verifying** (`verifying`) — the agent confirms the implementation satisfies verify.md scenarios. The step runs once. May loop back to implementing if verification fails.
- **Archiving** (`archiving`) — deterministic finalization: delta merge, spec sync, metadata generation, archive move. Executed atomically by the `ArchiveChange` use case, not by an agent interactively.

### Requirement: Requires-based gating

Each workflow step declares a `requires` array of artifact IDs. A step is **available** when every artifact ID in its `requires` list has effective status `complete` or `skipped` (via `change.effectiveStatus(artifactId)`). A skipped optional artifact satisfies the requirement identically to a completed one.

An empty or omitted `requires` means the step is always available (no gating).

### Requirement: Step availability evaluation

Step availability MUST be evaluated consistently by all consumers that need it. `CompileContext` evaluates step availability during context assembly. `GetStatus` reports the current change state, which corresponds directly to the active workflow step (since step name = state name). The evaluation is:

```
stepAvailable(step, change) =
  step.requires.every(id => change.effectiveStatus(id) ∈ { complete, skipped })
```

This evaluation is performed dynamically on each invocation — it is not cached or snapshotted.

### Requirement: Workflow array order is display order

The order of entries in the `workflow` array is the intended display order for tooling (e.g. `CompileContext` lists steps in this order, `GetStatus` shows the current step/state). It does NOT enforce sequential blocking between consecutive steps — each step is independently gated by its own `requires`. A step appearing later in the array may become available before an earlier one if its `requires` are satisfied first.

### Requirement: Step-to-state mapping

Entering a workflow step corresponds to transitioning the Change entity to the lifecycle state with the same name. The `step` value from the schema is used directly as the target state for `TransitionChange`. There is no indirection or mapping table — the step name IS the state name.

### Requirement: Two execution modes

Workflow steps fall into two execution modes based on their intent:

- **Agent-driven** — the step's work is performed interactively by an AI agent or human. The agent reads context via `CompileContext`, executes `run:` hooks via `specd change run-hooks`, does the work, and transitions to the next state. Steps like designing, implementing, and verifying are agent-driven.
- **Deterministic** — the step's work is performed atomically by a use case. The use case executes hooks internally, performs the operation, and produces a result. The archiving step is deterministic, handled entirely by `ArchiveChange`.

The execution mode is not declared in the schema — it is implied by which use case or command handles the step. The distinction matters for hook execution: deterministic steps execute hooks internally; agent-driven steps rely on the agent to invoke hooks via CLI.

### Requirement: Step requires reference artifact IDs

A workflow step's `requires` array contains **artifact IDs** (e.g. `specs`, `tasks`, `verify`), not other step names. This means step-to-step circular dependencies are structurally impossible — a step cannot depend on another step, only on artifact completion status. The artifact dependency graph itself is validated as a directed acyclic graph (DAG) at schema build time by `buildSchema()`, which performs depth-first cycle detection and throws `SchemaValidationError` if a cycle is found. Since step gating delegates entirely to artifact status, and the artifact graph is guaranteed acyclic, the step availability evaluation is always well-defined and termination is guaranteed.

## Constraints

- Lifecycle states are defined by the Change entity — the schema selects which states are workflow-visible, it does not create new ones
- Step availability is always computed dynamically from `change.effectiveStatus()` — never cached
- `workflow` array order is display order only; it does not create implicit sequential dependencies
- A step with an empty `requires` is always available regardless of change state
- Step `requires` contains artifact IDs, not step names — step-to-step cycles are structurally impossible
- The artifact dependency graph is validated as a DAG by `buildSchema()` — cycles are rejected at schema load time
- The archiving step is the only step that is both a workflow step and handled by a dedicated use case (`ArchiveChange`)

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `effectiveStatus()`, lifecycle states
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `workflow[]` array structure, `step`, `requires`, `hooks`
- [`specs/core/build-schema/spec.md`](../build-schema/spec.md) — artifact DAG cycle detection at schema build time
- [`specs/core/compile-context/spec.md`](../compile-context/spec.md) — step availability evaluation, context compilation per step
- [`specs/core/get-status/spec.md`](../get-status/spec.md) — reports current change state (= active workflow step)
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — deterministic execution of the archiving step
