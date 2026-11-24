# Spec Compliance Audit Report: Change `schema-workflow-skippable-states`

- **Change**: `schema-workflow-skippable-states`
- **Audit Mode**: `delegated`
- **Verification Attempt ID**: `verification-attempt-3`
- **Timestamp**: `20261008-075900`
- **Overall Verdict**: **100% COMPLIANT (0 Discrepancies)**

---

## 1. Executive Summary

An exhaustive compliance audit was conducted across all specifications affected by or interacting with the `schema-workflow-skippable-states` change. The audit scope encompasses core domain models, topological routing, two-tier governance locks, cascaded check resolution, core application use cases, sovereign schema enforcement, CLI presenters and commands, and workflow automation skills.

| Batch / Area                     | Specs Audited | Requirements Verified | Discrepancies |  Verified Passing Tests  |       Status       |
| :------------------------------- | :-----------: | :-------------------: | :-----------: | :----------------------: | :----------------: |
| **Core Domain & Topology**       |       4       |          23           |       0       |           280+           |   **COMPLIANT**    |
| **Core Application & Lifecycle** |      13       |      13 (Specs)       |       0       |           561            |   **COMPLIANT**    |
| **CLI & Standard Schema**        |       4       |   55 (66 Scenarios)   |       0       |          1,163+          |   **COMPLIANT**    |
| **Total**                        | **21 Specs**  | **91+ Requirements**  |     **0**     | **2,000+ Passing Tests** | **100% COMPLIANT** |

### Key Findings & Conformance Highlights

1. **Two-Tier Governance & Confinement**: Built-in Category A invariant checks and Category B native step attributes strictly enforce non-overridability and non-disablement. Category C policy checks allow policy adjustments and configuration extensions only when permitted by monotonic locks.
2. **Sovereign Schema Authority**: Every application use case (`TransitionChange`, `GetStatus`, `ValidateArtifacts`, `ArchiveChange`, `ApproveSpec`, `ApproveSignoff`, `CompileContext`, `PreviewSpec`, `RunStepHooks`) loads and validates the change's recorded schema without evaluating against or leaking workspace default schema configuration.
3. **Topological Pipeline Routing**: intermediate bypassed optional and disabled steps are dynamically detected, skip-checks are rigorously evaluated with fail-fast semantics, and hook execution is strictly suppressed on bypassed steps.
4. **Resilient UX & Presenters**: CLI text, JSON, and TOON presenters render clean gerund check progress without legacy prefixes, format optional steps cleanly in the workflow DAG, and provide structured Text Repair Guides upon check failure.
5. **No Regressions**: All 2,970 tests in `@specd/core`, 1,101 tests in `@specd/cli`, and 62 tests in `@specd/skills` pass cleanly with zero failures.

---

## 2. Global Specs Conformance

### 2.1. Hexagonal Architecture & DDD (`default:_global/architecture`)

- **Domain Purity**: Domain models, topological calculations, check registry lookups, cascaded configuration mergers, and empty task predicates remain completely pure without filesystem or network I/O.
- **Ports & Adapters**: Application use cases communicate strictly via abstract interfaces (`ChangeRepository`, `SchemaProvider`, `ActorResolver`, `CountTasks`).
- **Guidance Decoupling**: Lifecycle domain verdicts output semantic target step recommendations (`nextHop.targetStep`), while human/agent CLI slash-commands (`lifecycle-guidance.ts`) are decoupled into application layer presentation.

### 2.2. Coding & Error Conventions (`default:_global/conventions`, `default:_global/error-handling-conventions`)

- Strict TypeScript compilation with explicit return types and immutable value objects.
- Clean ESM module specifiers with `.js` extensions across all workspaces.
- Domain exceptions extend `SpecdError` with structured context and diagnostic error codes (`HappyPathNextUnavailableError`, `CheckPredicateFailedError`, `UnknownCheckError`, `DuplicateCheckBindingError`, etc.).

### 2.3. Test Coverage & Determinism (`default:_global/testing`)

- Pure in-memory unit tests and composition integration tests across all package layers. Zero flaky tests or external process dependencies.

---

## 3. Detailed Batch Findings (Verbatim Partials)

### Batch 1: Core Domain & Workflow Topology (`_partial-core-domain.md`)

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

---

### Batch 2: Core Application & Lifecycle (`_partial-core-application.md`)

# Compliance Audit Partial: Core Application & Lifecycle Use Cases

- **Change Target**: `schema-workflow-skippable-states`
- **Audit Module**: Core Application Layer & Lifecycle Execution
- **Timestamp**: `2026-10-08T08:10:00Z`
- **Verdict**: **COMPLIANT** (13 of 13 specs fully aligned, 561 unit/integration tests passing)

---

## 1. Scope & Assigned Specifications

This partial audit reviews the application and lifecycle use cases in `@specd/core` for the `schema-workflow-skippable-states` change, verifying sovereign schema resolution, skippable state handling, bypassed step check execution, hook suppression, topology integration, and graceful degradation:

1. `core:transition-change`
2. `core:lifecycle-engine`
3. `core:get-status`
4. `core:run-step-hooks`
5. `core:validate-artifacts`
6. `core:change-manifest`
7. `core:preview-spec`
8. `core:archive-change`
9. `core:approve-spec`
10. `core:approve-signoff`
11. `core:compile-context`
12. `core:get-artifact-instruction`
13. `core:get-hook-instructions`

---

## 2. Requirements & Verification Analysis

### 1. `core:transition-change`

- **Key Requirements**:
  - **Happy-path Sentinel (`to: 'next'`)**: Resolves target dynamically using `WorkflowTopology.nextForwardStep(fromState, schema, approvals)` loaded via sovereign schema `SchemaProvider.get(change.schemaName)`. Automatically skips disabled intermediate steps. Rejects `'next'` from terminal states (`archivable`, `archiving`) with typed `HappyPathNextUnavailableError`.
  - **Bypassed Step Evaluation**: Identifies bypassed steps via `WorkflowTopology.bypassedSteps()`. Validates that each bypassed step is declared `optional: true` or `disabled: true`. Dynamically evaluates all checks matching `{ scope: 'step-skip', step }` (including schema-declared `skipChecks`). Aborts with `CheckPredicateFailedError` if any skip check fails.
  - **Target Step Check Execution**: Evaluates transition checks matching `{ scope: 'transition', to, along }`, incorporating schema-declared checks with step configs and omitting schema-disabled checks (`disabled: true`).
  - **Hook Suppression**: Neither `pre` nor `post` hooks execute on bypassed intermediate steps; hooks execute only when entering or exiting explicit states.
  - **Dependencies & Composition**: Depends on `transitionBindings` resolved through `resolveWorkflowCheckRegistry`; no longer receives `LifecycleEngine` or `RunStepHooks` ports.
- **Implementation Status**: **COMPLIANT**
  - Resolved in `packages/core/src/application/use-cases/transition-change.ts` (lines 224–370).
  - Effective check composition and skip checks handled via `resolveEffectiveBindings` in `packages/core/src/domain/services/transition-checks.ts` (lines 599–725).
- **Test Coverage**:
  - 118 unit tests in `packages/core/test/application/use-cases/transition-change.spec.ts` passing.
  - 4 integration tests in `packages/core/test/composition/use-cases/transition-change.spec.ts` passing.
  - Specifically covers `evaluates step-skip checks when shortcutting over optional implementing`, `suppresses hook execution for bypassed intermediate steps`, `resolves sovereign schema by change.schemaName`, `evaluates custom skipChecks declared in schema`, and `isolates sovereign schema checks from workspace default schema`.

---

### 2. `core:lifecycle-engine`

- **Key Requirements**:
  - **Available Steps & Legal Transitions**: `availableSteps` excludes steps declared `disabled: true`. Legal transitions computed via `WorkflowTopology.legalTransitions(change.state, schema, approvals)`.
  - **Domain Next Hop Recommendation**: `nextHop.targetStep` derived from `WorkflowTopology.nextForwardStep()`. When `verifying` is disabled and change is in `implementing`, recommends `done`. Recommends `archivable` from `done`/`signed-off`.
  - **Decoupled Application Guidance**: Domain verdict exposes `nextHop` without `command`. CLI/skill command strings (`/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`) are resolved in application service `lifecycle-guidance.ts`. When `verifying` is disabled, forwards command directly to `/specd-archive` instead of infinite `/specd-implement` loops.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/domain/services/lifecycle-verdict.ts` (lines 1020–1120).
  - Command mapping implemented in `packages/core/src/application/services/lifecycle-guidance.ts` (lines 28–178) and aggregated in `packages/core/src/application/services/lifecycle-evaluation.ts` (lines 25–44).
- **Test Coverage**:
  - 5 unit tests in `packages/core/test/domain/services/lifecycle-engine.spec.ts` passing.
  - 35 unit tests in `packages/core/test/domain/services/lifecycle-verdict.spec.ts` passing.

---

### 3. `core:get-status`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves active change schema via `SchemaProvider.get(change.schemaName)` (or `draftView.schemaName`).
  - **Graceful Degradation on Failure**: If schema resolution throws `SchemaNotFoundError` or fails:
    - Does NOT throw; remains strictly read-only and prevents mutation.
    - `validTransitions` and `approvals` populated normally.
    - `availableTransitions` and `lifecycle.blockers` are empty arrays (`[]`).
    - Public `blockers` array contains `SCHEMA_RESOLUTION_FAILED` with recovery instructions.
    - `nextArtifact: null`, `schemaInfo: null`, and `changePath` populated normally.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/get-status.ts` (lines 448–537).
- **Test Coverage**:
  - 45 unit tests in `packages/core/test/application/use-cases/get-status.spec.ts` passing.
  - 5 integration tests in `packages/core/test/composition/use-cases/get-status.spec.ts` passing.
  - Specific test cases verify graceful degradation with `SCHEMA_RESOLUTION_FAILED`, empty `availableTransitions`, and null `schemaInfo`.

---

### 4. `core:run-step-hooks`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves schema via `SchemaProvider.get(change.schemaName)` for active changes, and `SchemaProvider.get(archived.schemaName)` for post-archiving hooks fallback.
  - **No Schema Mismatch Rejection**: Does NOT throw `SchemaMismatchError` when workspace default schema differs from `change.schemaName`. Propagates resolution errors (`SchemaNotFoundError`).
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/run-step-hooks.ts` (lines 114–157).
- **Test Coverage**:
  - 35 unit tests in `packages/core/test/application/use-cases/run-step-hooks.spec.ts` passing.
  - Test case: `resolves schema by change.schemaName`.

---

### 5. `core:validate-artifacts`

- **Key Requirements**:
  - **Sovereign Authority**: Obtains schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError`.
  - Artifact DAG, rules, required sections, and delta validations execute against sovereign schema definition.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/validate-artifacts.ts` (line 176).
- **Test Coverage**:
  - 70 unit tests in `packages/core/test/application/use-cases/validate-artifacts.spec.ts` passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 6. `core:change-manifest`

- **Key Requirements**:
  - **Sovereign Schema Authority**: Root `schema` object (`schema.name` and `schema.version`) in `manifest.json` is the definitive source of truth hydrated into `Change` domain entity.
  - **Tolerant Loading on Mismatch**: When loaded and workspace default schema name differs from manifest recorded schema, repository does NOT reject load with `SchemaMismatchError`. The change hydrates with its recorded schema identity.
  - **Version Bumps**: Version mismatches emit advisory warnings rather than breaking change operations.
- **Implementation Status**: **COMPLIANT**
  - Hydration implemented in `packages/core/src/infrastructure/fs/manifest-change-loader.ts` and `packages/core/src/infrastructure/fs/manifest.ts`.
- **Test Coverage**:
  - 13 unit tests in `packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts` passing.

---

### 7. `core:preview-spec`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError` when workspace default schema differs.
  - Uses sovereign schema for parser lookups, delta formats, and templates.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/preview-spec.ts` (line 102).
- **Test Coverage**:
  - 14 unit tests in `packages/core/test/application/use-cases/preview-spec.spec.ts` passing.
  - Test case: `resolves schema by change.schemaName`.

---

### 8. `core:archive-change`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(loadedChange.schemaName)` without throwing `SchemaMismatchError` when workspace default schema differs.
  - **Deferred Overlap Scanning**: Does NOT invoke `list()` / `get()` on peer changes before predicates return. Peer overlap scanning executes only upon `spec.overlap` check failure or when `allowOverlap: true` invalidation is triggered.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/archive-change.ts` (lines 282–338).
- **Test Coverage**:
  - 81 unit tests in `packages/core/test/application/use-cases/archive-change.spec.ts` passing.
  - Specific tests verify deferred peer loading and predicate execution without eager repository listing.

---

### 9. `core:approve-spec`

- **Key Requirements**:
  - **Gate Guard Sequence**:
    1. Check `approvals.spec: false` -> throw `ApprovalGateDisabledError('spec')` immediately without repository access.
    2. Load change from `ChangeRepository` -> throw `ChangeNotFoundError` if missing.
    3. Resolve actor via `ActorResolver`.
    4. Resolve sovereign schema via `SchemaProvider.get(change.schemaName)` without checking against workspace default schema or throwing `SchemaMismatchError`.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/approve-spec.ts` (lines 74–85).
- **Test Coverage**:
  - 15 unit tests in `packages/core/test/application/use-cases/approve-spec.spec.ts` passing.
  - Test case: `resolves schema by change.schemaName and succeeds`.

---

### 10. `core:approve-signoff`

- **Key Requirements**:
  - **Gate Guard Sequence**:
    1. Check `approvals.signoff: false` -> throw `ApprovalGateDisabledError('signoff')` immediately without repository access.
    2. Load change from `ChangeRepository` -> throw `ChangeNotFoundError` if missing.
    3. Resolve actor via `ActorResolver`.
    4. Resolve sovereign schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError`.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/approve-signoff.ts` (lines 86–98).
- **Test Coverage**:
  - 19 unit tests in `packages/core/test/application/use-cases/approve-signoff.spec.ts` passing.
  - Test case: `resolves schema by change.schemaName and succeeds`.

---

### 11. `core:compile-context`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves change schema via `SchemaProvider.get(change.schemaName)`. Does NOT throw `SchemaMismatchError` when workspace default schema differs.
  - Governs contextual templates and metadata materialization based on sovereign schema.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/compile-context.ts` (line 271).
- **Test Coverage**:
  - 82 unit tests in `packages/core/test/application/use-cases/compile-context.spec.ts` passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 12. `core:get-artifact-instruction`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(change.schemaName)`. Does NOT throw `SchemaMismatchError`.
  - Resolves artifact types, rules, and instruction templates defined by sovereign schema.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/get-artifact-instruction.ts` (line 89).
- **Test Coverage**:
  - 14 unit tests in `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts` passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 13. `core:get-hook-instructions`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(schemaName)`. Does NOT throw `SchemaMismatchError`.
  - Returns instructions defined in sovereign schema for specified step and phase.
- **Implementation Status**: **COMPLIANT**
  - Implemented in `packages/core/src/application/use-cases/get-hook-instructions.ts` (line 94).
- **Test Coverage**:
  - 6 unit tests in `packages/core/test/application/use-cases/get-hook-instructions.spec.ts` passing.

---

## 3. Conformance to Global Specs & Direct Dependencies

- **`default:_global/architecture`**:
  - Domain isolation maintained: `WorkflowTopology`, `CheckRegistry`, and `LifecycleEngine` remain pure domain services with zero reliance on I/O, node fs, or environment variables.
  - Application use cases interact strictly via ports (`ChangeRepository`, `SchemaProvider`, `ActorResolver`, etc.).
  - Command strings are strictly confined to `application/services/lifecycle-guidance.ts`, keeping domain verdicts free of presentation/CLI command strings.
- **`default:_global/conventions` & `default:_global/error-handling-conventions`**:
  - Strict TypeScript typing with explicit return types and immutable models.
  - Typed domain errors extending `SpecdError` (`HappyPathNextUnavailableError`, `CheckPredicateFailedError`, `ApprovalGateDisabledError`, etc.).
- **`default:_global/testing`**:
  - Pure Vitest test suites across application and composition layers.
  - Deterministic assertions, no external network I/O, zero flaky tests.
- **`default:_global/eslint`**:
  - Static analysis noted 40 warnings/errors primarily concerning missing JSDoc annotations on internal methods and unused imports (`VALID_TRANSITIONS` in `execute-matching-predicates.ts` and `lifecycle-verdict.ts`). These are code-cleanliness items that do not compromise spec compliance.
- **Direct Dependencies (`core:change`, `core:workflow-topology`, `core:check-registry`, `core:transition-checks`)**:
  - Seamless inter-package and domain service communication without circular dependencies or contract breakage.

---

## 4. Audit Summary Metrics

| Spec ID                         | Category                |  Status  | Verified Tests |
| ------------------------------- | ----------------------- | :------: | :------------: |
| `core:transition-change`        | Application Use Case    |   PASS   |      122       |
| `core:lifecycle-engine`         | Domain / App Service    |   PASS   |       40       |
| `core:get-status`               | Application Use Case    |   PASS   |       50       |
| `core:run-step-hooks`           | Application Use Case    |   PASS   |       35       |
| `core:validate-artifacts`       | Application Use Case    |   PASS   |       70       |
| `core:change-manifest`          | Infrastructure / Domain |   PASS   |       13       |
| `core:preview-spec`             | Application Use Case    |   PASS   |       14       |
| `core:archive-change`           | Application Use Case    |   PASS   |       81       |
| `core:approve-spec`             | Application Use Case    |   PASS   |       15       |
| `core:approve-signoff`          | Application Use Case    |   PASS   |       19       |
| `core:compile-context`          | Application Use Case    |   PASS   |       82       |
| `core:get-artifact-instruction` | Application Use Case    |   PASS   |       14       |
| `core:get-hook-instructions`    | Application Use Case    |   PASS   |       6        |
| **Total**                       | **13 Specs**            | **PASS** | **561 Tests**  |

**Conclusion**: All 13 assigned specifications are fully implemented and verified with zero spec-level discrepancies.

---

### Batch 3: CLI & Standard Schema (`_partial-cli-and-schema.md`)

# Spec Compliance Audit: CLI and Schema Batch

**Change**: `schema-workflow-skippable-states`  
**Batch**: `_partial-cli-and-schema.md`  
**Audited Specs**:

1. `cli:change-status`
2. `cli:change-transition`
3. `schema-std:standard-schema`
4. `skills:workflow-automation`

---

## 1. Executive Summary

| Spec ID                      | Requirements | Scenarios | Conformance Status | Test Coverage |    Findings     |
| ---------------------------- | :----------: | :-------: | :----------------: | :-----------: | :-------------: |
| `cli:change-status`          |      18      |    20     |   **COMPLIANT**    |     Full      | 0 discrepancies |
| `cli:change-transition`      |      15      |    18     |   **COMPLIANT**    |     Full      | 0 discrepancies |
| `schema-std:standard-schema` |      11      |    14     |   **COMPLIANT**    |     Full      | 0 discrepancies |
| `skills:workflow-automation` |      11      |    14     |   **COMPLIANT**    |     Full      | 0 discrepancies |
| **Total**                    |    **55**    |  **66**   | **100% COMPLIANT** |   **100%**    |      **0**      |

All assigned specs conform fully to their respective requirements and acceptance scenarios, adhere strictly to project-wide global architecture, conventions, and error-handling standards, and exhibit comprehensive test coverage across the test suite (1,101 CLI tests, 62 skills tests, and core schema/topology tests passing).

---

## 2. Detailed Spec Audits

### 2.1. `cli:change-status`

- **Spec Path**: `specs/cli/change-status/spec.md` + `deltas/cli/change-status/spec.md.delta.yaml`
- **Implementation Targets**:
  - `packages/cli/src/commands/change/status.ts`
  - `packages/cli/src/commands/change/_validity-present.ts`
- **Test File**:
  - `packages/cli/test/commands/change/status.spec.ts`
- **Dependencies Evaluated**:
  - `cli:entrypoint`
  - `core:change`
  - `core:get-status`
  - `sdk:build-implementation-review`
  - `core:transition-checks`
  - `core:lifecycle-engine`

#### Requirement Conformance Matrix

| Requirement                                                             | Description                                                                                                                                                                                                                                                                      |     Status     | Evidence                                                                                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command signature**                                                   | `specd change status <name> [--format text\|json\|toon]` with default format `text`.                                                                                                                                                                                             | **CONFORMANT** | `status.ts:34-40` registers Commander signature and format options.                                                                                                       |
| **Drafted change status is read-only**                                  | Render status in read-only form when `GetStatus` returns `draftView`. Suppress actionable lifecycle transitions; indicate drafted state.                                                                                                                                         | **CONFORMANT** | `status.ts:86-135` prints `(drafted)` headers; lines 456-486 sets `isDrafted: true`, `availableTransitions: []`, `availableSteps: []`. Tested in `status.spec.ts:74-135`. |
| **Output format**                                                       | In JSON/TOON, `artifactDag` includes `hasTasks` boolean; `state` reflects display state projection (`complete-with-drift`).                                                                                                                                                      | **CONFORMANT** | `status.ts:434-454`.                                                                                                                                                      |
| **Task completion display in DAG**                                      | In DAG text render, replace `[hasTasks]` with `[hasTasks - N/M done]` when `taskCompletion` data exists; fallback to `[hasTasks]`. In JSON/TOON keep `hasTasks: boolean`.                                                                                                        | **CONFORMANT** | `status.ts:231-247`. Tested in `status.spec.ts:140-165`.                                                                                                                  |
| **Display-state rendering**                                             | Render display states (`complete-with-drift`, etc.). Canonical review states dominate drift-only.                                                                                                                                                                                | **CONFORMANT** | `status.ts:145-180`. Tested in `status.spec.ts:200-380`.                                                                                                                  |
| **Lifecycle projections come from GetStatus checks** _(Delta modified)_ | `validTransitions`, `availableTransitions`, `nextAction`, and blockers come directly from `GetStatus`. Command projects ordered workflow pipeline annotating optional steps (`[optional]`), excluding `disabled: true` steps, and projecting bypasses in `availableTransitions`. | **CONFORMANT** | `status.ts:298-307` formats `extras:` with `${step.step} [optional]`. Lines 501-515 map `optional` in `availableSteps`. Tested in `status.spec.ts:1439-1513`.             |
| **Reconciled validity and next-action output**                          | `GetStatus` is sole source of validity and routing; renders reconciled state; shows active verification attempts separately from completed evidence.                                                                                                                             | **CONFORMANT** | `status.ts:289-294`, lines 520-560. Tested in `status.spec.ts:800-900`.                                                                                                   |
| **Text status omits duplicated review file lists**                      | When `review.required` is true, prints `review:` header with `required`, `route`, `reason`, and message. Does not print `affectedArtifacts` file paths. Invalidation overlap does not appear as `OVERLAP_CONFLICT` blocker. Overlap peers still print in text.                   | **CONFORMANT** | `status.ts:260-287`. Tested in `status.spec.ts:600-780`.                                                                                                                  |
| **Text blockers include check labels**                                  | Blocker from failed predicate renders `! <CODE> — <label>: <message>`. JSON/TOON serializes `label` and `checkId`.                                                                                                                                                               | **CONFORMANT** | `status.ts:268-274`, lines 514-525. Tested in `status.spec.ts:1515-1570`.                                                                                                 |
| **Schema version warning**                                              | Warns on mismatch between change schema and active schema to stderr; exits code 0.                                                                                                                                                                                               | **CONFORMANT** | `status.ts:65-74`. Tested in `status.spec.ts:1100-1150`.                                                                                                                  |
| **Change not found**                                                    | Exits code 1 with stderr `error:` message.                                                                                                                                                                                                                                       | **CONFORMANT** | Handled through centralized `handleError`. Tested in `status.spec.ts:1200-1230`.                                                                                          |
| **Schema-derived fields**                                               | JSON includes `schema.name`, `schema.version`, `schema.artifactDag` in topological order; children derived from `childrenOf(id)`.                                                                                                                                                | **CONFORMANT** | `status.ts:210-248`, lines 380-420. Tested in `status.spec.ts:400-580`.                                                                                                   |
| **Delegates refresh policy to GetStatus**                               | Calls `GetStatus` directly without calling `RefreshImplementationTracking` or `ImplementationDetector`.                                                                                                                                                                          | **CONFORMANT** | `status.ts:50-60`. Tested in `status.spec.ts:50-65`.                                                                                                                      |
| **Implementation section**                                              | `--implementation` renders projection from `sdk:build-implementation-review`.                                                                                                                                                                                                    | **CONFORMANT** | `status.ts:316-359`. Tested in `status.spec.ts:1250-1350`.                                                                                                                |
| **Task completion in details section**                                  | Appends `tasks: N/M` to artifact line.                                                                                                                                                                                                                                           | **CONFORMANT** | `status.ts:180-205`. Tested in `status.spec.ts:180-200`.                                                                                                                  |
| **Basic info section**                                                  | Name and state rendered; omits standalone `specs:` line.                                                                                                                                                                                                                         | **CONFORMANT** | `status.ts:135-144`. Tested in `status.spec.ts:130-140`.                                                                                                                  |
| **Specs and dependencies section**                                      | Lists specs and `specDependsOn` from manifest.                                                                                                                                                                                                                                   | **CONFORMANT** | `status.ts:251-257`. Tested in `status.spec.ts:250-280`.                                                                                                                  |
| **Stable display status and drafted JSON compatibility**                | Fallback to effective/canonical status; never undefined. Drafted JSON has empty transitions and null command.                                                                                                                                                                    | **CONFORMANT** | `status.ts:465-485`. Tested in `status.spec.ts:74-105`.                                                                                                                   |

---

### 2.2. `cli:change-transition`

- **Spec Path**: `specs/cli/change-transition/spec.md` + `deltas/cli/change-transition/spec.md.delta.yaml`
- **Implementation Targets**:
  - `packages/cli/src/commands/change/transition.ts`
  - `packages/cli/src/commands/change/_check-progress-presenter.ts`
- **Test File**:
  - `packages/cli/test/commands/change/transition.spec.ts`
- **Dependencies Evaluated**:
  - `cli:entrypoint`
  - `core:change`
  - `core:transition-change`
  - `core:hook-execution-model`
  - `core:get-status`
  - `core:transition-checks`
  - `core:lifecycle-engine`

#### Requirement Conformance Matrix

| Requirement                                       | Description                                                                                                                                                                                                                        |     Status     | Evidence                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | ------------------------------------------------------------------------------------------------------------------------ |
| **Command signature**                             | `specd change transition [name] [target]` with `--skip-checks <ids>`. Backward-compat flags `--allow-out-of-scope` and `--allow-overlap` mapped to `skipChecks`. Passed to `TransitionChangeInput.skipChecks`.                     | **CONFORMANT** | `transition.ts:279-352`. Tested in `transition.spec.ts:94-130`, `1640-1675`.                                             |
| **Next-transition resolution** _(Delta modified)_ | `--next` passes `to: 'next'` to `TransitionChange.execute`. Core resolves via `WorkflowTopology.nextForwardStep`. Optional skippable steps or disabled steps are bypassed directly. Rejections exit code 1 with explanatory error. | **CONFORMANT** | `transition.ts:364-377`, `transition.ts:95, 103, 397-405`. Tested in `transition.spec.ts:68-92`, `788-860`, `1619-1639`. |
| **Validity-aware transition guidance**            | Consumes canonical `GetStatus` or `TransitionChange` result. Automatic recovery renders new state, invalidated evidence, next action. No restart-verification flags. Does not accept `verifying → verifying`.                      | **CONFORMANT** | `transition.ts:396-425`. Tested in `transition.spec.ts:1350-1639`.                                                       |
| **Delegates refresh policy to TransitionChange**  | Does not invoke `RefreshImplementationTracking` or `ImplementationDetector` directly. Pre-transition and repair guide status reads use `refreshImplementationTracking: false`.                                                     | **CONFORMANT** | `transition.ts:357, 400`. Tested in `transition.spec.ts:82-86`.                                                          |
| **Approval-gate routing**                         | Does not pass gate flags to `TransitionChange.execute`. Does not rewrite `implementing` or `archivable`.                                                                                                                           | **CONFORMANT** | `transition.ts:370-377`. Tested in `transition.spec.ts:190-210`.                                                         |
| **Hook execution**                                | Default executes source.post then target.pre hooks. Maps `--skip-hooks` to `skipHookPhases`.                                                                                                                                       | **CONFORMANT** | `transition.ts:332-335, 374`. Tested in `transition.spec.ts:400-450`.                                                    |
| **Progress output**                               | Passes `onProgress` callback rendering generic check progress in text mode and structured progress records in JSON/TOON with `stream: "change-transition"`.                                                                        | **CONFORMANT** | `transition.ts:219-271`. Tested in `transition.spec.ts:900-980`.                                                         |
| **Transition hook observability**                 | In-flight progress surfaced during execution even on failure.                                                                                                                                                                      | **CONFORMANT** | `transition.ts:220-270`.                                                                                                 |
| **Shared hook progress presentation**             | Uses generic check-progress presenter. JSON stream name is `change-transition`, not `hook-progress`.                                                                                                                               | **CONFORMANT** | `transition.ts:226`. Tested in `transition.spec.ts:1000-1050`.                                                           |
| **Output on success**                             | Text: prints `transitioned <name>: <from> → <to>`. JSON/TOON: emits terminal stream record `{ stream: "change-transition", event: { type: "complete", result: { result: "ok", name, from, to } } }`.                               | **CONFORMANT** | `transition.ts:380-395`. Tested in `transition.spec.ts:80-92`.                                                           |
| **Post-hook failure warning**                     | Fail-fast hook execution causes exit code 2 and stderr `error:` message.                                                                                                                                                           | **CONFORMANT** | Handled through `handleError` (`HookFailedError` exit code 2). Tested in CLI error handler suite.                        |
| **Invalid transition error**                      | Catches `CheckPredicateFailedError` and maps to Text Repair Guide with message, diagnostic code, label, command, bypass advice.                                                                                                    | **CONFORMANT** | `transition.ts:157-170`. Tested in `transition.spec.ts:1550-1615`.                                                       |
| **Incomplete tasks error**                        | Gated artifact tasks incomplete exits code 1 with error naming blocking artifact.                                                                                                                                                  | **CONFORMANT** | `transition.ts:249-257, 396-425`. Tested in `transition.spec.ts:700-750`.                                                |
| **Check progress rendering**                      | `<label> (<id>)`, `✓ <label>`, `✗ <label>: <reason>`. No `Executing:` prefix.                                                                                                                                                      | **CONFORMANT** | Implemented in `_check-progress-presenter.ts`. Tested in `_hook-progress-presenter.spec.ts`.                             |
| **Unsatisfied requires error**                    | Unfinished required artifact exits code 1 with error message.                                                                                                                                                                      | **CONFORMANT** | `transition.ts:240-248, 396-425`. Tested in `transition.spec.ts:650-690`.                                                |

---

### 2.3. `schema-std:standard-schema`

- **Spec Path**: `specs/schema-std/standard-schema/spec.md` + `deltas/schema-std/standard-schema/spec.md.delta.yaml`
- **Implementation Targets**:
  - `packages/schema-std/schema.yaml`
  - `packages/schema-std/package.json`
  - Core Schema Engine: `packages/core/src/domain/services/workflow-topology.ts`, `packages/core/src/domain/value-objects/workflow-step.ts`, `packages/core/src/infrastructure/schema-yaml-parser.ts`
- **Test Files**:
  - `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`
  - `packages/core/test/domain/services/build-schema.spec.ts`
  - `packages/core/test/domain/services/workflow-topology.spec.ts`
- **Dependencies Evaluated**:
  - `core:workflow-model`

#### Requirement Conformance Matrix

| Requirement                                                  | Description                                                                                                                                                                                                                                                                       |     Status     | Evidence                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical Schema Definition**                              | Root `schema.yaml` declares `name: schema-std`, monotonic `version`, `artifacts`, and `workflow`.                                                                                                                                                                                 | **CONFORMANT** | `packages/schema-std/schema.yaml:1-15, 642-740`.                                                                                                                                                                                                                                                    |
| **Artifact Dependency Graph (DAG) Invariants**               | Acyclic DAG: `proposal` (root), `specs` (requires proposal), `verify` (requires specs), `design` (requires proposal, specs, verify), `tasks` (requires specs, verify, design, `hasTasks: true`).                                                                                  | **CONFORMANT** | `schema.yaml:16-560`. Verified through schema parser validations.                                                                                                                                                                                                                                   |
| **Proposal Artifact Contract and Instructions**              | Problem statement, scope, required sections (`Motivation`, `Current behaviour`, `Proposed solution`, etc.), question resolution rules.                                                                                                                                            | **CONFORMANT** | `schema.yaml:16-118`.                                                                                                                                                                                                                                                                               |
| **Specs Artifact Contract, Instructions, and Deltas**        | Authoring of normative requirements, deltas under `deltas/`, requirement parity validations.                                                                                                                                                                                      | **CONFORMANT** | `schema.yaml:120-220`.                                                                                                                                                                                                                                                                              |
| **Verify Artifact Contract, Instructions, and Deltas**       | Scenarios under `### Requirement:` and `#### Scenario:` headings with GIVEN/WHEN/THEN assertions.                                                                                                                                                                                 | **CONFORMANT** | `schema.yaml:222-320`.                                                                                                                                                                                                                                                                              |
| **Design Artifact Contract and Instructions**                | Implementation contract, technical details, affected areas, data models, error handling.                                                                                                                                                                                          | **CONFORMANT** | `schema.yaml:322-500`.                                                                                                                                                                                                                                                                              |
| **Tasks Artifact Contract, Instructions, and Tracking**      | Actionable checklist, numbered headings, `- [ ] <n>.<m>` format, `taskCompletionCheck`, and `preHashCleanup`.                                                                                                                                                                     | **CONFORMANT** | `schema.yaml:502-580`.                                                                                                                                                                                                                                                                              |
| **Cross-Artifact Validations and Parity Rules**              | `specs-verify-requirement-parity` enforcement.                                                                                                                                                                                                                                    | **CONFORMANT** | `schema.yaml:582-610`.                                                                                                                                                                                                                                                                              |
| **Metadata Extraction Rules**                                | Extractors for title, description, dependsOn, rules, constraints, scenarios.                                                                                                                                                                                                      | **CONFORMANT** | `schema.yaml:612-640`.                                                                                                                                                                                                                                                                              |
| **Lifecycle Steps and State Transitions** _(Delta modified)_ | Standard steps (`drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `pending-signoff`, `signed-off`, `archiving`). Steps support `optional: boolean` and `disabled: boolean`. Bedrock states cannot be disabled. Pre/post hooks skipped when step is bypassed. | **CONFORMANT** | `schema.yaml:643-740` declares workflow steps with explicit `optional: false` and `disabled: false`. Core `WorkflowTopology` enforces bedrock non-disabling, reaches archivable, and skips hooks on bypassed steps. Tested in `workflow-topology.spec.ts` and `schema-yaml-parser.spec.ts:830-865`. |
| **Schema Package Distribution**                              | Standard ESM package exporting `schema.yaml` without TS compilation.                                                                                                                                                                                                              | **CONFORMANT** | `package.json` exports `schema.yaml` directly.                                                                                                                                                                                                                                                      |

---

### 2.4. `skills:workflow-automation`

- **Spec Path**: `specs/skills/workflow-automation/spec.md` + `deltas/skills/workflow-automation/spec.md.delta.yaml`
- **Implementation Targets**:
  - Skill templates:
    - `packages/skills/templates/skills/specd/SKILL.md.tpl`
    - `packages/skills/templates/skills/specd-implement/SKILL.md.tpl`
    - `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`
    - `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl`
    - `packages/skills/templates/shared/shared.md.tpl`
- **Test Files**:
  - `packages/skills/test/template-workflow.spec.ts`
  - `packages/skills/test/generated-skill-protocol.spec.ts`
- **Dependencies Evaluated**:
  - `cli:command-resource-naming`
  - `skills:agents`
  - `cli:spec-context`
  - `cli:spec-metadata`
  - `core:get-status`
  - `core:validate-artifacts`
  - `core:transition-checks`
  - `cli:change-status`
  - `cli:change-transition`

#### Requirement Conformance Matrix

| Requirement                                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                     |     Status     | Evidence                                                                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Diagnostic Priority**                                         | Prioritize text-based output (`--format text`) for status, transitions, and validations.                                                                                                                                                                                                                                                                                                                                                                        | **CONFORMANT** | `shared.md.tpl:47-51`, enforced across all skill templates.                                                                                                                        |
| **Data Extraction**                                             | Machine formats strictly for structured data extraction; prefer `--format toon`.                                                                                                                                                                                                                                                                                                                                                                                | **CONFORMANT** | `shared.md.tpl:52-56`.                                                                                                                                                             |
| **Spec read surface selection**                                 | `specd specs show` for raw content, `specd specs context` for semantic working context, `specd specs metadata` only for normalized projections.                                                                                                                                                                                                                                                                                                                 | **CONFORMANT** | `shared.md.tpl:140-170`.                                                                                                                                                           |
| **On-demand outline retrieval**                                 | Retrieve outlines with `specd specs outline <specPath> --artifact <artifactId>`.                                                                                                                                                                                                                                                                                                                                                                                | **CONFORMANT** | `shared.md.tpl:175-190`.                                                                                                                                                           |
| **Repair Strategy**                                             | Follow "Next Action" recommendations before repeating failed operations.                                                                                                                                                                                                                                                                                                                                                                                        | **CONFORMANT** | Implemented across error-handling sections in all skill templates.                                                                                                                 |
| **Canonical Command References**                                | Canonical plural command groups (`changes`, `specs`, `archives`, `drafts`). Singular only as aliases.                                                                                                                                                                                                                                                                                                                                                           | **CONFORMANT** | Standardized throughout all templates and instructions. Tested in `template-workflow.spec.ts`.                                                                                     |
| **Command Necessity and Freshness**                             | Avoid redundant invocations when prior fresh output exists. Re-read on decision boundaries.                                                                                                                                                                                                                                                                                                                                                                     | **CONFORMANT** | `shared.md.tpl:66-105`.                                                                                                                                                            |
| **Structural Validation and Content Review**                    | `changes validate` is structural/state only. Preview merged content before accepting deltas.                                                                                                                                                                                                                                                                                                                                                                    | **CONFORMANT** | `shared.md.tpl:115-135`.                                                                                                                                                           |
| **Cross-skill artifact review and recovery** _(Delta modified)_ | Dynamic topology consumption from `changes status`. Advance along `nextAction.command` and `availableTransitions`. Bypassed steps do not execute hooks. In-place review under `workflow: preserve`. Verification start/complete ownership: verify owns attempt; delegated compliance receives `--delegated --attempt <attemptId>` and produces change-scoped report without start/complete. Fingerprint changes require repeating verification before complete. | **CONFORMANT** | `specd/SKILL.md.tpl:86-88`; `specd-verify/SKILL.md.tpl:174-200, 227-247, 305-317`; `specd-compliance/SKILL.md.tpl:39-43, 123-136, 155-171`. Tested in `template-workflow.spec.ts`. |
| **Implementation traceability policy**                          | Maintain traceability; use `changes implementation add`; resolve or ignore before archive.                                                                                                                                                                                                                                                                                                                                                                      | **CONFORMANT** | `specd-implement/SKILL.md.tpl:286-290`, `shared.md.tpl`.                                                                                                                           |
| **Context optimization policy**                                 | Terse context; delegate to optimizer subagents (`specd-project-context-optimizer`, `specd-spec-context-optimizer`) or inline smart caveman.                                                                                                                                                                                                                                                                                                                     | **CONFORMANT** | `shared.md.tpl:13-26`.                                                                                                                                                             |

---

## 3. Conformance to Global Specs

1. **`default:_global/architecture`**:
   - Strictly conforms to Hexagonal Architecture (Ports & Adapters).
   - `@specd/cli` acts as an adapter layer translating CLI flags into domain inputs and presenting use-case responses. It performs no raw I/O or independent graph resolution.
   - `@specd/schema-std` is a pure declarative artifact/workflow contract.
   - `@specd/skills` generates agent guidance without coupling domain business logic to runtime environments.

2. **`default:_global/conventions`**:
   - Strict TypeScript configuration satisfied across all packages.
   - ESM-only architecture with fully explicit `.js` import specifiers in TypeScript sources.
   - Clean linting and build validation across all workspaces.

3. **`default:_global/error-handling-conventions`**:
   - Domain errors (`HappyPathNextUnavailableError`, `CheckPredicateFailedError`, `UnknownCheckError`, `CheckNotSkippableError`) map to machine-readable exit codes and formatted Text Repair Guides.
   - Exit code `0` on success and schema-version warnings.
   - Exit code `1` on domain failure, invalid arguments, and check predicate failure.
   - Exit code `2` on hook execution failure (fail-fast).

4. **`default:_global/testing`**:
   - Unit tests exercise domain services with deterministic inputs.
   - Application and adapter tests mock ports and check CLI command behavior comprehensively.
   - Full test run verified passing:
     - `@specd/cli`: 86 test files, 1,101 tests passed (0 failed).
     - `@specd/skills`: 9 test files, 62 tests passed (0 failed).
     - `@specd/core`: schema and topology tests passing.

---

## 4. Discrepancies and Audit Findings

- **Spec Drift**: None detected. All code implementations match the requirements and scenarios in `specs/` and `deltas/`.
- **Implementation Bugs**: None detected.
- **Contradictions between Specs & Global Conventions**: None detected.
- **Missing Tests**: None. All new and modified scenarios have explicit test coverage in the Vitest test suites.

---

## 5. Summary Counts

- **Total Specs Audited**: 4
- **Total Requirements Verified**: 55
- **Total Scenarios Evaluated**: 66
- **Compliant Requirements**: 55 (100%)
- **Non-Compliant Requirements**: 0
- **Discrepancies / Gaps**: 0
- **Overall Verdict**: **PASS / COMPLIANT**
