# Workflow Model

## Purpose

The schema format defines the YAML structure of workflow step entries, but not what those steps mean semantically — when they are available, how they relate to change state, or how hooks and requires are enforced. Without a dedicated semantic model, `GetStatus`, `TransitionChange`, and related use cases would interpret step semantics independently. `CompileContext` MUST NOT evaluate hop availability. This spec defines the semantic model of workflow steps: how step names relate to change states, how requires-based gating works, and how hooks are executed at step boundaries.

## Requirements

### Requirement: Step names reference domain lifecycle states

The Change entity defines a fixed set of lifecycle states (`drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`, `archiving`). Drain-only approval states (`pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off`) exist on `ChangeState` for historical recovery; they are not `workflow[]` extras and MUST NOT be introduced as schema steps. Protocol membership comes from `ChangeState`. Legal hops SHALL be computed by the `workflow-topology` module (see [`core:workflow-topology`](../workflow-topology/spec.md)), which uses the canonical pipeline for forward progression and admits `VALID_TRANSITIONS` edges only as backward, redesign, recovery, escape, or drain moves for their exact source state.

The schema's `workflow[]` array SHALL treat `step` as a lookup key onto an existing state. A matching row SHALL attach only that state's extra configuration (`optional`, `disabled`, `requires`, `requiresTaskCompletion`, `hooks`, `checks`, `skipChecks`). A `workflow[]` entry MUST NOT introduce a new lifecycle state.

Omitting a known state from `workflow[]` MUST NOT remove that state from the protocol. When no row matches, `workflowStep(state)` SHALL be null: the state remains enabled in the pipeline, with no schema extras.

If a schema declares a `step` value that does not correspond to a delivery or bedrock lifecycle state — including any drain-only approval state — `buildSchema` / schema resolve MUST throw `SchemaValidationError`. That string MUST NOT occupy a pipeline slot. Resolved schemas never contain unknown or drain-state step names, so `TransitionChange` is not the rejection site. The domain enforces the state machine; the schema configures flags, hooks, and checks for named states.

### Requirement: Step semantics

Each workflow step has a defined semantic role in the change lifecycle:

- **Designing** (`designing`) — the agent creates or modifies spec artifacts (proposal, specs, verify, design, tasks). This step iterates over the artifact DAG: `CompileContext` is called once per artifact being authored. The step is typically always available (empty `requires`).
- **Implementing** (`implementing`) — the agent writes code and completes tasks. All working artifacts must already be in a review-complete state before implementation proceeds. The step runs once (not per-artifact).
- **Verifying** (`verifying`) — the agent confirms the implementation satisfies verify.md scenarios. Verification has two semantic outcomes:
  - `implementation-failure` — artifacts remain correct and the fix fits within the already-defined tasks; route back to `implementing`
  - `artifact-review-required` — artifacts must be revised, or new tasks are required before implementation can continue; route back to `designing`
- **Archiving** (`archiving`) — deterministic finalization: delta merge, spec sync, metadata generation, archive move. Executed atomically by the `ArchiveChange` use case, not by an agent interactively.

Any file already marked `drifted-pending-review` also forces the workflow back to `designing`; drift is never treated as an implementation-only retry.

### Requirement: Optional and disabled step declarations

A workflow step declaration in `workflow[]` MAY declare:

- `optional: boolean` (default: `false`): when `true`, the schema author permits the step to be bypassed and the topology exposes shortcut candidates across it. Core evaluates the effective `step-skip` bindings for the bypassed step. If one or more effective bindings exist, every non-disabled predicate MUST pass; if none exist, the bypass is unconditionally permitted.
- `disabled: boolean` (default: `false`): when `true`, the step is excluded from the active lifecycle graph and cannot be targeted or visited.

Validation rules enforced during schema resolution and topology validation:

1. **Bedrock States**: `drafting`, `designing`, `done`, `archiving`, and `archivable` CANNOT be declared `optional: true` or `disabled: true`. Attempting to make a bedrock state optional or disabled SHALL throw `SchemaValidationError`.
2. **Approval Anchor**: If `approvals.spec` is enabled, `ready` CANNOT be disabled. Attempting to disable the active spec-approval anchor SHALL throw `SchemaValidationError`. This rule SHALL be enforced when the schema is built or resolved with the project approvals (including `schema validate`), not deferred to the first topology query.
3. **Completion Boundary**: `done` is always the mandatory boundary that records completed development and verification, owns retry and in-place signoff semantics, and remains distinct from `archivable`. When `approvals.signoff` is disabled, the `approval.signoff` predicate skips on `done -> archivable`; Core MUST NOT remove or bypass `done`.
4. **Connectivity by construction**: Because bedrock states cannot be disabled and disabled steps leave the pipeline, the active steps always form a forward path from `designing` through `done` to `archivable`. Disabling every configurable delivery step (`ready` while the spec gate is off, `implementing`, `verifying`) is valid. No separate reachability error exists.
5. **Omission Default**: Omitting a canonical state from `workflow[]` does NOT disable it. Unlisted states default to enabled (`disabled: false`, `optional: false`).
6. **Authority Boundary**: Schemas define whether a non-bedrock step is optional, Core determines whether a concrete bypass passes its effective checks, and agent skills only consume Core's projected `availableTransitions` and `nextAction`. Skills MUST NOT infer optionality or invent additional bypass conditions.

### Requirement: Workflow step checks and skip-checks declarations

A workflow step declaration in `workflow[]` MAY declare:

- `checks: WorkflowStepCheckDeclaration[]`: an array of predicate check declarations evaluated when transitioning into the step (`scope: 'transition'`). Each declaration MAY specify `id` (canonical check identifier), `along` (default: `'forward'`), `from` (default: `'*'`), `onFailure` (`'abort'` | `'collect'`, default: `'abort'`), `skippable` (boolean), `disabled` (boolean, default: `false`), and `config` (arbitrary JSON record).
- `skipChecks: WorkflowStepSkipCheckDeclaration[]`: an array of predicate check declarations evaluated when the step is optional and bypassed during a transition (`scope: 'step-skip'`). Each declaration MAY specify `id`, `onFailure` (`'abort'` | `'collect'`, default: `'abort'`), `skippable` (boolean), `disabled` (boolean, default: `false`), and `config` (arbitrary JSON record).

Validation rules enforced during schema construction:

1. **Check Existence**: Every check `id` declared in `checks` or `skipChecks` MUST exist in the active `CheckRegistry`. Referencing an unregistered check SHALL throw `UnknownCheckError`.
2. **Coordinate Uniqueness**: Duplicate check declarations for the exact same coordinate (`{id, scope: 'transition', to: step, along}` or `{id, scope: 'step-skip', step}`) SHALL throw `DuplicateCheckBindingError`.
3. **Governance Locks**:
   - Placement lock: A check with `allowSchemaEmbedding: false` CANNOT be declared in `checks` or `skipChecks` at a coordinate that none of its code-defined bindings serves (throws `CheckEmbeddingForbiddenError`). Declaring any check, built-in or plugin, at a coordinate one of its code-defined bindings already serves is always permitted, subject to the locks below. Coordinate matching for `checks` uses `to`, `along`, and `from`; for `skipChecks` it uses `step`.
   - Policy lock: A matching code-defined binding with `allowBindingOverride: false` CANNOT have its `onFailure` or `skippable` modified (throws `CheckBindingOverrideForbiddenError`). Schema-owned declarations carry no policy lock.
   - Parameter lock: A check or code-defined binding with `allowConfigOverride: false` CANNOT declare `config` overrides (throws `CheckConfigOverrideForbiddenError`).
   - Disablement lock: A check or code-defined binding with `allowDisable: false` CANNOT declare `disabled: true` (throws `CheckDisableForbiddenError`).
   - Locks are evaluated against the merged declaration produced by schema layering, so a later schema layer MAY change a declaration that an earlier schema layer created, within the check-level locks (see [`core:check-registry`](../check-registry/spec.md)).
4. **Step Status Compatibility**: `skipChecks` SHALL NOT be declared on steps that are declared `disabled: true`. Attempting to declare `skipChecks` on a disabled step SHALL throw `SchemaValidationError`.

### Requirement: Sovereign change schema authority

Each change is bound at creation to a specific schema recorded in its manifest (`manifest.schema`). The project configuration (`specd.yaml`) specifies the default schema used when creating a change if none is explicitly provided. Once created, the change's recorded schema reference is the immutable, sovereign authority governing its artifact DAG, validation rules, workflow steps, topology, and transition predicates across all commands, use cases, and verification sessions. Changes are never implicitly rebound to the current workspace `specd.yaml` schema.

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

### Requirement: Step check declarations

A `WorkflowStep` in `schema.yaml` MAY declare a `checks` array (`readonly WorkflowStepCheckDeclaration[]`).
Each entry associates a transition check with that workflow step:

```typescript
export interface WorkflowStepCheckDeclaration {
  readonly id: string
  readonly from?: ChangeState | '*'
  readonly along?: TransitionAlong | '*'
  readonly onFailure?: 'abort' | 'collect'
  readonly skippable?: boolean
  readonly disabled?: boolean
  readonly config?: Readonly<Record<string, unknown>>
}
```

The step declaration delegates execution to the orchestrator while allowing declarative specialization of:

- `along`: The transition direction (`forward`, `backward`, `recovery`, `redesign`, or `*`) when the check applies. Defaults to `forward`.
- `onFailure`: Whether a failure aborts immediately (`'abort'`, default) or accumulates with other failures (`'collect'`).
- `skippable`: Permission to bypass via `--skip-checks`, subject to kernel governance locks.
- `disabled`: Whether the check is declaratively disabled and omitted from execution on this step, subject to `allowDisable` governance locks.
- `config`: Step-specific configuration merged over check-level defaults.

### Requirement: Step availability evaluation

Step availability for hops MUST come from `evaluateLifecycleVerdict` projections of predicate `CheckResult`s (`availableTransitions` / `isReady` from `workflow.requires` when those results are present). `GetStatus` reports that projection. `CompileContext` MUST NOT evaluate step availability and MUST NOT call `evaluateLifecycleVerdict`.

DAG completeness (`complete` / `skipped` vs parent-review) MAY use `projectArtifacts` when `checksByTarget` is empty. Hop consumers MUST NOT independently re-walk `requires` with a different blocker-code algorithm than the check.

```
stepAvailable(step, change) =
  matching predicates for the hop all pass or skip
```

This evaluation is performed dynamically on each invocation — it is not cached or snapshotted. An empty `requires` does not make the hop protocol-legal.

### Requirement: Workflow array order is not significant

The order of entries in the `workflow` array carries no meaning. Rows only carry per-step properties; rows declared in a noncanonical order SHALL be normalized silently to the canonical lifecycle order and SHALL NOT raise an error.

Display order for tooling (e.g. `GetStatus`, `changes status`) and the **progress axis** used to classify `along` as `forward` or `backward` SHALL both be the canonical pipeline computed by `resolveWorkflowPipeline(schema, approvals)` (see [`core:transition-checks`](../transition-checks/spec.md) and [`core:workflow-topology`](../workflow-topology/spec.md)). Steps declared `disabled: true` are excluded from the axis. Canonical states omitted from `workflow[]` default to enabled. The axis MUST NOT mean consecutive steps are mandatory; intermediate optional steps may be bypassed. `CompileContext` MAY list steps in this order for display; it MUST NOT evaluate step availability or call `evaluateLifecycleVerdict`.

`to = designing` is `redesign`, not “the previous workflow step”. `archiving → archivable` is `recovery`, not backward retry.

Availability is independent of position: a later step may become available before an earlier one if its `requires` are satisfied first, but entering it still requires a legal hop from the current state.

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

- Canonical lifecycle states are enumerated by `ChangeState`. Legal transitions, active pipeline progression, bypassed steps, and shortcut hops are governed dynamically by the `workflow-topology` module based on the active schema and project approvals (see [`core:workflow-topology`](../workflow-topology/spec.md)).
- Step availability is computed dynamically by `evaluateLifecycleVerdict` from predicate `CheckResult`s and DAG `projectArtifacts` — never from `change.effectiveStatus()` (the entity has no such method) and never cached.
- The progress axis for `along` is derived directly from `resolveWorkflowPipeline(schema, approvals)`; steps declared `disabled: true` are excluded from the axis, and omitting a canonical step defaults to enabled.
- A step with an empty `requires` has no artifact gating; `protocol.edge` and other matching predicates may still block the hop.
- Step `requires` contains artifact IDs, not step names — step-to-step cycles are structurally impossible. `buildSchema()` SHALL reject any `requires` (or `requiresTaskCompletion`) entry that is not a declared artifact ID, including a lifecycle step name, with `SchemaValidationError`.
- The artifact dependency graph is validated as a DAG by `buildSchema()` — cycles are rejected at schema load time.
- The archiving step is the only step that is both a workflow step and handled by a dedicated use case (`ArchiveChange`).
- Task completion gating is controlled by `requiresTaskCompletion` on the workflow step — not by the mere presence of `taskCompletionCheck` on the artifact type.
- `requiresTaskCompletion` must be a subset of `requires` and reference artifacts with `taskCompletionCheck` — validated at schema build time.
- Task completion checks use `safeRegex` to compile patterns; patterns that fail compilation or contain nested quantifiers are treated as non-matching (no error thrown).

## Spec Dependencies

- [`core:change`](../change/spec.md) — change lifecycle states and artifact state lookup
- [`core:schema-format`](../schema-format/spec.md) — workflow array structure and artifact definitions
- [`core:build-schema`](../build-schema/spec.md) — DAG cycle detection at schema build time
- [`core:compile-context`](../compile-context/spec.md) — step availability during context assembly
- [`core:get-status`](../get-status/spec.md) — status reporting of the active workflow step
- [`core:transition-change`](../transition-change/spec.md) — runtime transition enforcement
- [`core:archive-change`](../archive-change/spec.md) — deterministic archiving step behavior
- [`core:hook-execution-model`](../hook-execution-model/spec.md) — hook execution semantics
- [`core:workflow-topology`](../workflow-topology/spec.md) — authoritative domain service computing workflow topology
- [`core:check-registry`](../check-registry/spec.md) — governance locks applied to step `checks` and `skipChecks` declarations
