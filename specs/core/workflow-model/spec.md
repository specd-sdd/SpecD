# Workflow Model

## Purpose

The schema format defines the YAML structure of workflow step entries, but not what those steps mean semantically — when they are available, how they relate to change state, or how hooks and requires are enforced. Without a dedicated semantic model, `GetStatus`, `TransitionChange`, and related use cases would interpret step semantics independently. `CompileContext` MUST NOT evaluate hop availability. This spec defines the semantic model of workflow steps: how step names relate to change states, how requires-based gating works, and how hooks are executed at step boundaries.

## Requirements

### Requirement: Step names reference domain lifecycle states

The Change entity defines a fixed set of lifecycle states (`drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`). Drain-only approval states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) exist on `ChangeState` for historical recovery; they are not `workflow[]` extras and MUST NOT be introduced as schema steps. Protocol membership and legal hops SHALL come from `ChangeState` and `VALID_TRANSITIONS`.

The schema's `workflow[]` array SHALL treat `step` as a lookup key onto an existing state. A matching row SHALL attach only that state's extra configuration (`requires`, `requiresTaskCompletion`, `hooks`). A `workflow[]` entry MUST NOT introduce a new lifecycle state.

Omitting a known state from `workflow[]` MUST NOT remove that state from the protocol. When no row matches, `workflowStep(state)` SHALL be null: the hop remains legal when `VALID_TRANSITIONS` allows it, with no schema extras.

If a schema declares a `step` value that does not correspond to a valid Change lifecycle state, `buildSchema` / schema resolve MUST throw `SchemaValidationError`. That string MUST NOT occupy a progress-axis slot (it MUST NOT invert `along` for real states). Resolved schemas never contain unknown step names, so `TransitionChange` is not the rejection site. The domain enforces the state machine; the schema configures flags and hooks for named states.

### Requirement: Step semantics

Each workflow step has a defined semantic role in the change lifecycle:

- **Designing** (`designing`) — the agent creates or modifies spec artifacts (proposal, specs, verify, design, tasks). This step iterates over the artifact DAG: `CompileContext` is called once per artifact being authored. The step is typically always available (empty `requires`).
- **Implementing** (`implementing`) — the agent writes code and completes tasks. All working artifacts must already be in a review-complete state before implementation proceeds. The step runs once (not per-artifact).
- **Verifying** (`verifying`) — the agent confirms the implementation satisfies verify.md scenarios. Verification has two semantic outcomes:
  - `implementation-failure` — artifacts remain correct and the fix fits within the already-defined tasks; route back to `implementing`
  - `artifact-review-required` — artifacts must be revised, or new tasks are required before implementation can continue; route back to `designing`
- **Archiving** (`archiving`) — deterministic finalization: delta merge, spec sync, metadata generation, archive move. Executed atomically by the `ArchiveChange` use case, not by an agent interactively.

Any file already marked `drifted-pending-review` also forces the workflow back to `designing`; drift is never treated as an implementation-only retry.

### Requirement: Requires-based gating

Each workflow step declares a `requires` array of artifact IDs. That declaration SHALL be evaluated as the `workflow.requires` check with `to = effective` (see [`core:transition-checks`](../transition-checks/spec.md)). Status and `TransitionChange` MUST share that evaluation.

If any required artifact has an effective status other than `complete` or `skipped`, the transition is rejected with `InvalidStateTransitionError`.

An empty or omitted `requires` means the step has no artifact gating — the `workflow.requires` check skips. Other matching predicates (`protocol.edge`, enter-ready deps, approvals, …) MAY still block the hop.

A skipped optional artifact satisfies the requirement identically to a completed one.

Artifacts in `missing`, `in-progress`, `pending-review`, or `drifted-pending-review` do not satisfy `requires`.

### Requirement: Task completion gating

When a workflow step declares a `requiresTaskCompletion` array, that declaration SHALL be evaluated as the `workflow.taskCompletion` check with `to = effective`. Only artifacts listed in `requiresTaskCompletion` are content-checked — other artifacts in `requires` are checked only via `effectiveStatus`.

The `requiresTaskCompletion` array MUST be a subset of the step's `requires` array. Each listed artifact ID MUST reference an artifact type that declares `taskCompletionCheck` on its `ArtifactType`. These constraints are validated at schema build time by `buildSchema`.

For each artifact ID in `requiresTaskCompletion`:

1. Look up the `ArtifactType` from the schema to obtain `taskCompletionCheck.incompletePattern`.
2. Get the `ChangeArtifact` via `change.getArtifact(artifactId)`. If it does not exist, skip it.
3. Iterate the artifact's `files` map. For each `ArtifactFile`, load the file content via `ChangeRepository.artifact(change, file.filename)`.
4. If the file does not exist (returns `null`), skip it.
5. Compile `incompletePattern` using `safeRegex` with the `'m'` flag.
6. If the regex is valid and matches any line in the file content, reject the transition with `InvalidStateTransitionError` including a structured reason (`incomplete-tasks`) with the artifact ID and match counts.

Application use cases MUST NOT duplicate file walks in `evaluateLifecycleVerdict`. `CountTasks` SHALL be composed into `workflow.taskCompletion` via `createWorkflowTaskCompletion`.

When `requiresTaskCompletion` is absent or empty on a workflow step, no task completion gating applies — even if the step requires artifacts that declare `taskCompletionCheck`. The `taskCompletionCheck` on the artifact type defines _what_ pattern to check; the workflow step's `requiresTaskCompletion` controls _when_ it applies.

### Requirement: Step availability evaluation

Step availability for hops MUST come from `evaluateLifecycleVerdict` projections of predicate `CheckResult`s (`availableTransitions` / `isReady` from `workflow.requires` when those results are present). `GetStatus` reports that projection. `CompileContext` MUST NOT evaluate step availability and MUST NOT call `evaluateLifecycleVerdict`.

DAG completeness (`complete` / `skipped` vs parent-review) MAY use `projectArtifacts` when `checksByTarget` is empty. Hop consumers MUST NOT independently re-walk `requires` with a different blocker-code algorithm than the check.

```
stepAvailable(step, change) =
  matching predicates for the hop all pass or skip
```

This evaluation is performed dynamically on each invocation — it is not cached or snapshotted. An empty `requires` does not make the hop protocol-legal.

### Requirement: Workflow array order is display order and progress axis

The order of entries in the `workflow` array is the intended display order for tooling (e.g. `GetStatus` shows the current step/state). `CompileContext` MAY list steps in this order for display; it MUST NOT evaluate step availability or call `evaluateLifecycleVerdict`.

That same order SHALL be the **progress axis** used to classify `along` as `forward` or `backward` (see [`core:transition-checks`](../transition-checks/spec.md)). Delivery states absent from `workflow[]` SHALL still appear on the axis, spliced by canonical `AXIS_FALLBACK` index (`buildAxis`), not tail-appended after later listed names. It MUST NOT mean consecutive steps are mandatory. Omitting a row MUST NOT make the corresponding protocol hop illegal. Each listed step remains independently gated by its own `requires` / checks.

`to = designing` is `redesign`, not “the previous workflow step”. `archiving → archivable` is `recovery`, not backward retry.

A step appearing later in the array may become available before an earlier one if its `requires` are satisfied first.

### Requirement: Step-to-state mapping

Entering a workflow step corresponds to transitioning the Change entity to the lifecycle state with the same name. The `step` value from the schema is used directly as the target state for `TransitionChange`. There is no indirection or mapping table — the step name IS the state name.

### Requirement: Hook execution at step boundaries

All workflow steps can declare `run:` and `instruction:` hooks in their `pre` and `post` phases. `run:` entries are **effects** selected with the same `from` / `to` / `along` matcher as predicates: pre matches `to = that step`, `from = *`, `along = any`; post matches `from = that step`, `to = *`, `along = forward` only. `instruction:` entries are not in the predicate/effect pipeline.

`TransitionChange` executes matching `run:` effects after predicates pass and **before persist** (`hook.post` on transitions is `phase = before-persist`), unless skipped via `skipHookPhases`. The archiving step's archive `run:` hooks are executed by `ArchiveChange` as operation `archive`, not as a lifecycle `along` value.

### Requirement: Two execution modes

`TransitionChange` SHALL auto-execute matching `run:` effects after predicates pass unless `skipHookPhases` skips them. `ArchiveChange` SHALL auto-execute operation-`archive` effects according to binding `phase` / `onFailure`.

Skills MAY pass `skipHookPhases` and invoke `run-hooks` / `hook-instruction` manually. That MUST NOT be a second pipeline where agent-driven steps never auto-run. There is one pipeline: predicates then matching effects.

### Requirement: Step requires reference artifact IDs

A workflow step's `requires` array contains **artifact IDs** (e.g. `specs`, `tasks`, `verify`), not other step names. This means step-to-step circular dependencies are structurally impossible — a step cannot depend on another step, only on artifact completion status. The artifact dependency graph itself is validated as a directed acyclic graph (DAG) at schema build time by `buildSchema()`, which performs depth-first cycle detection and throws `SchemaValidationError` if a cycle is found. Since step gating delegates entirely to artifact status, and the artifact graph is guaranteed acyclic, the step availability evaluation is always well-defined and termination is guaranteed.

## Constraints

- Lifecycle states and legal hops are defined by the Change entity (`ChangeState`, `VALID_TRANSITIONS`). `workflow[]` looks up extra flags/hooks; it does not add, remove, or reorder protocol membership
- Step availability is computed dynamically by `evaluateLifecycleVerdict` from predicate `CheckResult`s and DAG `projectArtifacts` — never from `change.effectiveStatus()` (the entity has no such method) and never cached
- `workflow` array order is display order **and** the progress axis for `along` (missing delivery states spliced by `AXIS_FALLBACK` index); it does not create implicit sequential dependencies between consecutive steps
- A step with an empty `requires` has no artifact gating; `protocol.edge` and other matching predicates may still block the hop
- Step `requires` contains artifact IDs, not step names — step-to-step cycles are structurally impossible
- The artifact dependency graph is validated as a DAG by `buildSchema()` — cycles are rejected at schema load time
- The archiving step is the only step that is both a workflow step and handled by a dedicated use case (`ArchiveChange`)
- Task completion gating is controlled by `requiresTaskCompletion` on the workflow step — not by the mere presence of `taskCompletionCheck` on the artifact type
- `requiresTaskCompletion` must be a subset of `requires` and reference artifacts with `taskCompletionCheck` — validated at schema build time
- Task completion checks use `safeRegex` to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown)

## Spec Dependencies

- [`core:change`](../change/spec.md) — change lifecycle states and artifact state lookup
- [`core:schema-format`](../schema-format/spec.md) — workflow array structure and artifact definitions
- [`core:build-schema`](../build-schema/spec.md) — DAG cycle detection at schema build time
- [`core:compile-context`](../compile-context/spec.md) — step availability during context assembly
- [`core:get-status`](../get-status/spec.md) — status reporting of the active workflow step
- [`core:transition-change`](../transition-change/spec.md) — runtime transition enforcement
- [`core:archive-change`](../archive-change/spec.md) — deterministic archiving step behavior
- [`core:hook-execution-model`](../hook-execution-model/spec.md) — hook execution semantics
