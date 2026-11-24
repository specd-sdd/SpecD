# Compliance Audit Partial: Core Domain & Workflow Topology

## Scope

- `core:workflow-model`
- `core:workflow-topology`
- `core:check-registry`
- `core:transition-checks`

---

## Executive Summary

| Spec                     | Requirements Total | Fully Implemented | Discrepancies |      Test Status       |
| :----------------------- | :----------------: | :---------------: | :-----------: | :--------------------: |
| `core:workflow-topology` |         6          |         6         |       0       |    21 passing tests    |
| `core:workflow-model`    |         5          |         5         |       0       |   70+ passing tests    |
| `core:check-registry`    |         6          |         6         |       0       |    26 passing tests    |
| `core:transition-checks` |         6          |         6         |       0       |   170+ passing tests   |
| **Total**                |       **23**       |      **23**       |     **0**     | **280+ passing tests** |

---

## Detailed Requirements Verification

### 1. `core:workflow-topology`

Authoritative pure domain service computing ordered pipeline progression, dynamic graph reachability, legal transitions, bypassed step detection, and forward advancement.

- **Ordered Pipeline Construction (`WorkflowTopology.orderedPipeline`)**:
  - _Spec Requirement_: Assembles the active lifecycle pipeline starting from declared steps in `schema.workflow()`, preserving declared order, splicing omitted canonical states by index, and filtering out steps explicitly marked `disabled: true`. Steps explicitly marked `optional: true` are recorded with `optional: true`.
  - _Bedrock State Invariant_: Declaring any bedrock state (`drafting`, `designing`, `archiving`, `archivable`) as `disabled: true` throws `SchemaValidationError`.
  - _Approval Anchor Invariant_: When `approvals.spec` is active, `ready` cannot be disabled; when `approvals.signoff` is active, `done` cannot be disabled. Attempting to disable an active anchor throws `SchemaValidationError`.
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.orderedPipeline()`, lines 58–139).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 7–93).
  - _Status_: **FULLY IMPLEMENTED**.

- **Graph Reachability Invariant (`WorkflowTopology.isReachable`)**:
  - _Spec Requirement_: The active topology must form an unbroken, forward-reachable progression path from `designing` to `archivable`. Any combination of disabled steps breaking reachability throws `SchemaValidationError`.
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.isReachable()`, lines 391–418).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 84–92).
  - _Status_: **FULLY IMPLEMENTED**.

- **Dynamic Legal Transitions (`WorkflowTopology.legalTransitions`, `isLegalTransition`)**:
  - _Spec Requirement_: Computes legal destination states for candidate state `from`:
    1. Forward transition to the next active step in the pipeline.
    2. Backward transitions to preceding non-terminal active steps (filtering out disabled steps).
    3. Shortcut / bypass transitions across intermediate steps if and only if EVERY bypassed step is either `optional: true` or `disabled: true`.
    4. Disabled steps cannot be targeted (`isLegalTransition` returns `false`).
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.legalTransitions()`, lines 167–201; `isLegalTransition()`, lines 206–215; `computeForwardTargets()`, lines 334–386).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 118–160).
  - _Status_: **FULLY IMPLEMENTED**.

- **Bypassed Step Detection (`WorkflowTopology.bypassedSteps`)**:
  - _Spec Requirement_: Computes all intermediate active pipeline steps strictly between `from` and `to`. Immediate next steps return empty array; non-forward moves return empty array; disabled steps are excluded.
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.bypassedSteps()`, lines 222–243).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 162–193).
  - _Status_: **FULLY IMPLEMENTED**.

- **Topological Forward Progression (`WorkflowTopology.nextForwardStep`)**:
  - _Spec Requirement_: Returns the closest subsequent active step in the ordered pipeline. Skips disabled steps automatically. Returns `null` on terminal states (`archivable`, `archiving`, or parking states).
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.nextForwardStep()`, lines 249–277).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 195–218).
  - _Status_: **FULLY IMPLEMENTED**.

- **Step Enablement & Verification Boundary (`WorkflowTopology.isStepEnabled`)**:
  - _Spec Requirement_: Returns `true` if step is active in pipeline (not declared `disabled: true`), `false` otherwise. Bedrock states always return `true`. When `verifying` is disabled, verification evidence is not mandatory for entering `done` or `archivable`.
  - _Implementation_: `packages/core/src/domain/services/workflow-topology.ts` (`WorkflowTopology.isStepEnabled()`, lines 148–157).
  - _Tests_: `packages/core/test/domain/services/workflow-topology.spec.ts` (lines 95–116).
  - _Status_: **FULLY IMPLEMENTED**.

---

### 2. `core:workflow-model`

Defines schema workflow step model, optional / disabled declarations, step checks / skip-checks declarations, sovereign schema authority, and progress axis delegation.

- **Optional and Disabled Step Declarations**:
  - _Spec Requirement_: `workflow[]` steps declare `optional: boolean` (default `false`) and `disabled: boolean` (default `false`). Schema resolution validates bedrock state protection, approval anchor protection, and reachability. Unlisted canonical states default to enabled.
  - _Implementation_: `packages/core/src/domain/services/build-schema.ts` (lines 693–734) and `packages/core/src/domain/entities/schema.ts`.
  - _Tests_: `packages/core/test/domain/services/build-schema.spec.ts` and `packages/core/test/domain/services/workflow-topology.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Workflow Step Checks & Skip-Checks Declarations**:
  - _Spec Requirement_: `workflow[]` steps declare `checks: WorkflowStepCheckDeclaration[]` (`scope: 'transition'`) and `skipChecks: WorkflowStepSkipCheckDeclaration[]` (`scope: 'step-skip'`).
    - Every check `id` must exist in `CheckRegistry` (throws `UnknownCheckError`).
    - Coordinate uniqueness: duplicate check declarations on identical coordinates throw `DuplicateCheckBindingError`.
    - Governance confinement lock: check with `allowBindingOverride: false` cannot be embedded unless pre-bound (throws `CheckEmbeddingForbiddenError`).
    - Governance policy lock: binding with `allowBindingOverride: false` rejects modification of `onFailure` or `skippable` (throws `CheckBindingOverrideForbiddenError`).
    - Governance parameter lock: check / binding with `allowConfigOverride: false` rejects `config` override (throws `CheckConfigOverrideForbiddenError`).
    - Governance disablement lock: check / binding with `allowDisable: false` rejects `disabled: true` (throws `CheckDisableForbiddenError`).
    - Disabled steps cannot declare `skipChecks` (throws `SchemaValidationError`).
  - _Implementation_: `packages/core/src/domain/services/build-schema.ts` (lines 778–926).
  - _Tests_: `packages/core/test/domain/services/build-schema.spec.ts` (dedicated test cases verifying each error and governance lock).
  - _Status_: **FULLY IMPLEMENTED**.

- **Sovereign Change Schema Authority**:
  - _Spec Requirement_: Each change is bound at creation to a specific schema recorded in its manifest (`manifest.schema`, `change.schemaName`). All use cases (`TransitionChange`, `GetStatus`, `ValidateArtifacts`, `ArchiveChange`, etc.) resolve that schema via `SchemaProvider.get(change.schemaName)`. Changes are never implicitly rebound to workspace default `specd.yaml`.
  - _Implementation_: Manifest records `schemaName` and `schemaVersion`; `TransitionChange` loads schema via `await this._schemaProvider.get(change.schemaName)`.
  - _Tests_: `packages/core/test/application/use-cases/manifest-schema.spec.ts` and `packages/core/test/application/use-cases/transition-change.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Workflow Array Order is Display Order & Progress Axis**:
  - _Spec Requirement_: Display order and progress axis for classifying `along` are derived from `WorkflowTopology.orderedPipeline(schema, approvals)`. Disabled steps excluded from axis; intermediate optional steps can be bypassed without consecutive-step locking.
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (`classifyAlong()`, `buildAxis()`) delegating to active pipeline ordering.
  - _Tests_: `packages/core/test/domain/services/transition-checks.spec.ts` (lines 40–120).
  - _Status_: **FULLY IMPLEMENTED**.

- **Step Semantics & Hook Execution**:
  - _Spec Requirement_: Step name equals target state; `requires` references artifact IDs; hooks execute at step boundaries with support for auto-run and selective skipping (`skipHookPhases`).
  - _Implementation_: `packages/core/src/domain/services/lifecycle-verdict.ts` and `packages/core/src/application/use-cases/transition-change.ts`.
  - _Tests_: `packages/core/test/domain/services/lifecycle-verdict.spec.ts`, `packages/core/test/application/use-cases/transition-change.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

---

### 3. `core:check-registry`

Catalog and query API for transition checks, bindings, plugin check registration, namespacing, and two-tier governance locks.

- **Check Catalog & Query API**:
  - _Spec Requirement_: Exposes `get(canonicalId)`, `has(canonicalId)`, `list()`, `bindings()`, `getBindings(canonicalId)`, and `getGovernance(canonicalId)`.
  - _Implementation_: `packages/core/src/domain/services/check-registry.ts` (lines 124–174).
  - _Tests_: `packages/core/test/domain/services/check-registry.spec.ts` (lines 13–46, 138–151).
  - _Status_: **FULLY IMPLEMENTED**.

- **Immutability of Built-in Checks**:
  - _Spec Requirement_: All 16 built-in checks (`protocol.edge`, `workflow.requires`, `workflow.taskCompletion`, `workflow.tasksEmpty`, `deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `impl.linksInScope`, `approval.spec`, `approval.signoff`, `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `verification.current`, `hook.pre`, `hook.post`) are injected upon construction. Public API exposes no mutation/unregistration methods. Rejects external registration attempting to overwrite unprefixed built-ins (throws `InvalidPluginNameError`).
  - _Implementation_: `packages/core/src/domain/services/check-registry.ts` (lines 75–104, 203–205).
  - _Tests_: `packages/core/test/domain/services/check-registry.spec.ts` (lines 138–146, 177–210).
  - _Status_: **FULLY IMPLEMENTED**.

- **Canonical Namespacing & Plugin Registration**:
  - _Spec Requirement_: Registers custom plugin checks under `@<pluginName>.<check.id>`, validates plugin name pattern (`^[a-z][a-z0-9-]*$`), rejects duplicate registrations (`DuplicateCheckError`), and enforces predicate kind (`InvalidCheckKindError`).
  - _Implementation_: `packages/core/src/domain/services/check-registry.ts` (lines 188–232).
  - _Tests_: `packages/core/test/domain/services/check-registry.spec.ts` (lines 48–104, 212–278).
  - _Status_: **FULLY IMPLEMENTED**.

- **Binding Coordinate Identity & Duplicate Prevention**:
  - _Spec Requirement_: Uniquely indexes binding coordinates across `scope: 'transition'` (`to`, `along`), `scope: 'archive'`, and `scope: 'step-skip'` (`step`). Duplicate binding registration on the same coordinate throws `DuplicateCheckBindingError`.
  - _Implementation_: `packages/core/src/domain/services/check-registry.ts` (lines 47–58, 284–303).
  - _Tests_: `packages/core/test/domain/services/check-registry.spec.ts` (lines 106–136, 351–413).
  - _Status_: **FULLY IMPLEMENTED**.

- **Two-Tier Governance & Confinement Locks**:
  - _Spec Requirement_: Supports check-level and binding-level locks:
    - **Category A (Protocol Invariants)**: `allowBindingOverride: false`, `allowDisable: false`, `skippable: false`.
    - **Category B (Native Step Attributes)**: `allowBindingOverride: false`, `allowDisable: false`, `skippable: false`. Includes `workflow.tasksEmpty` under `scope: 'step-skip'` for step `implementing`.
    - **Category C (Policy Checks)**: `allowBindingOverride: true`, `allowDisable: true`.
    - **Monotonic Governance Rule**: Locks cannot be relaxed across schema layers or AST mergers. `mergeSchemaLayers` preserves both `step.checks` and `step.skipChecks` safely without erasing locks.
  - _Implementation_: `packages/core/src/domain/services/check-registry.ts` (lines 79–104), `packages/core/src/domain/services/check-bindings.ts`, and `packages/core/src/domain/services/merge-schema-layers.ts` (lines 623–648).
  - _Tests_: `packages/core/test/domain/services/check-registry.spec.ts` (lines 280–349), `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Cascading Configuration Hierarchy**:
  - _Spec Requirement_: Merges check default config, binding default config, and schema step config via `deepMergeConfig`.
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (`cascadeConfig()` in `resolveEffectiveBindings()`) and `packages/core/src/domain/services/deep-merge-config.ts`.
  - _Tests_: `packages/core/test/domain/services/deep-merge-config.spec.ts` (7 tests).
  - _Status_: **FULLY IMPLEMENTED**.

---

### 4. `core:transition-checks`

Transition attempt classification, check applicability matching, dynamic binding resolution, execution lifecycle, and progress reporting.

- **Attempt Classification & Progress Axis**:
  - _Spec Requirement_: Classifies `along` as `forward`, `backward`, `redesign`, `recovery`, or `any` derived from `WorkflowTopology.orderedPipeline()`. Disabled steps excluded from axis; omission of canonical steps defaults to enabled.
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (`classifyAlong()`, `buildAxis()`, lines 159–231).
  - _Tests_: `packages/core/test/domain/services/transition-checks.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Step-Skip Check Scope & Applicability**:
  - _Spec Requirement_: Supports `CheckAttempt` with `scope: 'step-skip'` (`step`, `from`, `to`) and `StepSkipApplicability` (`step`). `checkMatches` returns `true` when scope is `'step-skip'` and `step` matches attempt step (or `'*'`). Isolated from transition predicates.
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (lines 244–248, 264–269).
  - _Tests_: `packages/core/test/domain/services/transition-checks.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Dynamic Runtime Binding Composition (`resolveEffectiveBindings`)**:
  - _Spec Requirement_: Overlays schema-declared `checks` onto target step and `skipChecks` onto bypassed intermediate steps. Excludes checks with `disabled: true`. Synthesizes bindings for custom checks. Merges configurations via `deepMergeConfig`.
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (`resolveEffectiveBindings()`, lines 599–779).
  - _Tests_: `packages/core/test/domain/services/transition-checks.spec.ts` and `packages/core/test/application/use-cases/transition-change.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

- **Transition Attempt Evaluation (`TransitionChange`)**:
  - _Spec Requirement_:
    1. Resolves `to: 'next'` via `WorkflowTopology.nextForwardStep()`.
    2. Runs `protocol.edge` against `WorkflowTopology.legalTransitions()`. Fail-fast on `protocol.edge` failure in execution.
    3. Evaluates step-skip checks for all intermediate bypassed steps identified by `WorkflowTopology.bypassedSteps()`. Aborts transition if any step-skip check fails.
    4. Executes matching pre/post effects according to phase and `along === 'forward'`.
  - _Implementation_: `packages/core/src/application/use-cases/transition-change.ts` (lines 224–412).
  - _Tests_: `packages/core/test/application/use-cases/transition-change.spec.ts` (118 tests).
  - _Status_: **FULLY IMPLEMENTED**.

- **Built-in Registry Bindings & Skippability Permissions**:
  - _Spec Requirement_:
    - Category A invariants: `skippable: false`, non-disableable.
    - Category B native attributes: `skippable: false`. `workflow.tasksEmpty` bound under `scope: 'step-skip'` for step `implementing` (`skippable: false`).
    - Category C policy checks: `impl.linksInScope` (`skippable: true`), `impl.filesResolved` (`skippable: false`), `spec.overlap` (`skippable: true`), `deps.consistent` (`skippable: false`), `workspace.readOnly` (`skippable: false`).
  - _Implementation_: `packages/core/src/domain/services/check-bindings.ts` (lines 29–121).
  - _Tests_: `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts` (lines 112–145).
  - _Status_: **FULLY IMPLEMENTED**.

- **Generic Check Progress Bus**:
  - _Spec Requirement_: Emits `check-start`, `check-progress`, and `check-done` events with canonical gerund labels without `Executing:` prefix.
    - `protocol.edge`: "Validating transition edge"
    - `workflow.requires`: "Checking required artifacts"
    - `workflow.taskCompletion`: "Checking task completion"
    - `workflow.tasksEmpty`: "Checking empty tasks"
    - `deps.consistent`: "Checking spec dependencies"
    - `workspace.readOnly`: "Checking workspace ownership"
    - `impl.filesResolved`: "Checking open implementation files"
    - `impl.linksInScope`: "Checking implementation links"
    - `approval.spec`: "Checking spec approval"
    - `approval.signoff`: "Checking signoff approval"
    - `verification.current`: "Checking verification freshness"
    - `schema.nameMatch`: "Checking schema name"
    - `archive.archivable`: "Checking archivable state"
    - `spec.overlap`: "Checking spec overlap"
    - `hook.pre`: "Running pre hooks"
    - `hook.post`: "Running post hooks"
  - _Implementation_: `packages/core/src/domain/services/transition-checks.ts` (`CHECK_LABELS`, lines 50–67).
  - _Tests_: `packages/core/test/application/use-cases/transition-change.spec.ts`.
  - _Status_: **FULLY IMPLEMENTED**.

---

## Direct Dependencies & Global Conformance

### 1. Direct Dependency Chain Analysis

- `core:workflow-model` ↔ `core:workflow-topology`: Bidirectionally aligned. `WorkflowTopology` accepts `Schema` and `ApprovalGates`, enforcing declarations parsed by `buildSchema`.
- `core:check-registry` ↔ `core:transition-checks`: Clean layered contracts. `CheckRegistry` manages definitions, bindings, and governance locks; `transition-checks` consumes them for runtime matching and dynamic effective binding resolution.
- `core:transition-checks` ↔ `core:workflow-topology`: Perfectly synchronized. `TransitionChange` uses topology for legal transitions, forward step resolution, and intermediate bypassed step detection.

### 2. Global Specs Conformance (`default:_global/*`)

- **`default:_global/architecture` (Hexagonal Architecture & DDD)**:
  - _Domain Purity_: `WorkflowTopology`, `CheckRegistry`, `Schema`, `buildSchema`, `resolveEffectiveBindings`, `runTasksEmpty`, and `deepMergeConfig` are completely pure domain services and entities. Zero I/O, zero filesystem imports, zero network calls.
  - _Ports & Adapters_: Application use cases (`TransitionChange`, `WorkflowTasksEmptyCheck`) interact strictly through defined ports (`CountTasks`, `ChangeRepository`, `SchemaProvider`, `ActorResolver`).
  - _Manual Dependency Injection_: No reflection or IoC container; dependencies wired explicitly in composition resolver.
- **`default:_global/conventions` (Coding Conventions)**:
  - ESM-only module imports with `.js` extensions.
  - Strict TypeScript types, readonly arrays, and immutable value objects.
- **`default:_global/error-handling-conventions` (Error Conventions)**:
  - Strongly typed domain errors extending `SpecdError`: `SchemaValidationError`, `UnknownCheckError`, `DuplicateCheckBindingError`, `DuplicateCheckError`, `InvalidCheckKindError`, `InvalidPluginNameError`, `CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`, `CheckDisableForbiddenError`, `InvalidStateTransitionError`.
- **`default:_global/testing` (Testing Conventions)**:
  - Full unit test coverage with pure domain fixtures and in-memory application fakes.
  - Entire `@specd/core` suite passes 2,970 / 2,970 tests across 236 test files (100% passing).

---

## Discrepancies Summary

**No discrepancies detected.**
Implementation and specifications are in 100% alignment across domain models, application use cases, check governance, and execution semantics.

---

## Test Coverage Matrix

| Test Suite File                                                            | Layer          | Requirements Covered                                                                                           |      Tests Passing       |
| :------------------------------------------------------------------------- | :------------- | :------------------------------------------------------------------------------------------------------------- | :----------------------: |
| `packages/core/test/domain/services/workflow-topology.spec.ts`             | Domain         | Ordered pipeline, reachability, legal transitions, bypass detection, forward progression, step enablement      |         21 / 21          |
| `packages/core/test/domain/services/check-registry.spec.ts`                | Domain         | Check catalog, built-in immutability, plugin namespacing, step-skip coordinate uniqueness, two-tier governance |         17 / 17          |
| `packages/core/test/domain/services/transition-checks.spec.ts`             | Domain         | Progress axis classification, step-skip matching, effective binding composition, check labels                  |         36 / 36          |
| `packages/core/test/domain/services/deep-merge-config.spec.ts`             | Domain         | Cascaded config hierarchy deep merging                                                                         |          7 / 7           |
| `packages/core/test/domain/entities/schema.spec.ts`                        | Domain         | Schema entity workflow step model & optional/disabled properties                                               |         25 / 25          |
| `packages/core/test/domain/services/build-schema.spec.ts`                  | Domain         | Schema build validations, unknown checks, coordinate uniqueness, governance locks                              |        45+ / 45+         |
| `packages/core/test/application/use-cases/transition-change.spec.ts`       | Application    | Runtime transition enforcement, step-skip check execution, sovereign schema usage, progress bus                |        118 / 118         |
| `packages/core/test/application/checks/workflow-tasks-empty.spec.ts`       | Application    | `workflow.tasksEmpty` predicate check execution and task count caching                                         |          6 / 6           |
| `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts` | Composition    | Production wiring of built-in checks, step-skip bindings, and custom plugin check isolation                    |          9 / 9           |
| **Entire @specd/core Package**                                             | **All Layers** | **Complete package test suite**                                                                                | **2,970 / 2,970 (100%)** |
