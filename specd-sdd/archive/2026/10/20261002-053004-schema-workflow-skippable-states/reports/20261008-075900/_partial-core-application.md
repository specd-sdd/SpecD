# Compliance Audit Partial: Core Application & Lifecycle Use Cases

- **Change Target**: `schema-workflow-skippable-states`
- **Audit Module**: Core Application Layer & Lifecycle Execution
- **Timestamp**: `2026-10-08T08:10:00Z`
- **Verdict**: **COMPLIANT** (13 of 13 specs fully aligned, 561 unit/integration tests passing)

---

## 1. Scope & Assigned Specifications

This partial audit reviews the application and lifecycle use cases in `@specd/core` for the `schema-workflow-skippable-states` change, verifying sovereign schema resolution, skippable state handling, bypassed step check execution, hook suppression, topology integration, and graceful degradation:

1. [`core:transition-change`](packages/core/src/application/use-cases/transition-change.ts)
2. [`core:lifecycle-engine`](packages/core/src/domain/services/lifecycle-engine.ts)
3. [`core:get-status`](packages/core/src/application/use-cases/get-status.ts)
4. [`core:run-step-hooks`](packages/core/src/application/use-cases/run-step-hooks.ts)
5. [`core:validate-artifacts`](packages/core/src/application/use-cases/validate-artifacts.ts)
6. [`core:change-manifest`](packages/core/src/infrastructure/fs/manifest-change-loader.ts)
7. [`core:preview-spec`](packages/core/src/application/use-cases/preview-spec.ts)
8. [`core:archive-change`](packages/core/src/application/use-cases/archive-change.ts)
9. [`core:approve-spec`](packages/core/src/application/use-cases/approve-spec.ts)
10. [`core:approve-signoff`](packages/core/src/application/use-cases/approve-signoff.ts)
11. [`core:compile-context`](packages/core/src/application/use-cases/compile-context.ts)
12. [`core:get-artifact-instruction`](packages/core/src/application/use-cases/get-artifact-instruction.ts)
13. [`core:get-hook-instructions`](packages/core/src/application/use-cases/get-hook-instructions.ts)

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
  - Resolved in [`packages/core/src/application/use-cases/transition-change.ts`](packages/core/src/application/use-cases/transition-change.ts#L224-L370).
  - Effective check composition and skip checks handled via `resolveEffectiveBindings` in [`packages/core/src/domain/services/transition-checks.ts`](packages/core/src/domain/services/transition-checks.ts#L599-L725).
- **Test Coverage**:
  - 118 unit tests in [`packages/core/test/application/use-cases/transition-change.spec.ts`](packages/core/test/application/use-cases/transition-change.spec.ts) passing.
  - 4 integration tests in [`packages/core/test/composition/use-cases/transition-change.spec.ts`](packages/core/test/composition/use-cases/transition-change.spec.ts) passing.
  - Specifically covers `evaluates step-skip checks when shortcutting over optional implementing`, `suppresses hook execution for bypassed intermediate steps`, `resolves sovereign schema by change.schemaName`, `evaluates custom skipChecks declared in schema`, and `isolates sovereign schema checks from workspace default schema`.

---

### 2. `core:lifecycle-engine`

- **Key Requirements**:
  - **Available Steps & Legal Transitions**: `availableSteps` excludes steps declared `disabled: true`. Legal transitions computed via `WorkflowTopology.legalTransitions(change.state, schema, approvals)`.
  - **Domain Next Hop Recommendation**: `nextHop.targetStep` derived from `WorkflowTopology.nextForwardStep()`. When `verifying` is disabled and change is in `implementing`, recommends `done`. Recommends `archivable` from `done`/`signed-off`.
  - **Decoupled Application Guidance**: Domain verdict exposes `nextHop` without `command`. CLI/skill command strings (`/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`) are resolved in application service [`lifecycle-guidance.ts`](packages/core/src/application/services/lifecycle-guidance.ts). When `verifying` is disabled, forwards command directly to `/specd-archive` instead of infinite `/specd-implement` loops.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/domain/services/lifecycle-verdict.ts`](packages/core/src/domain/services/lifecycle-verdict.ts#L1020-L1120).
  - Command mapping implemented in [`packages/core/src/application/services/lifecycle-guidance.ts`](packages/core/src/application/services/lifecycle-guidance.ts#L28-L178) and aggregated in [`packages/core/src/application/services/lifecycle-evaluation.ts`](packages/core/src/application/services/lifecycle-evaluation.ts#L25-L44).
- **Test Coverage**:
  - 5 unit tests in [`packages/core/test/domain/services/lifecycle-engine.spec.ts`](packages/core/test/domain/services/lifecycle-engine.spec.ts) passing.
  - 35 unit tests in [`packages/core/test/domain/services/lifecycle-verdict.spec.ts`](packages/core/test/domain/services/lifecycle-verdict.spec.ts) passing.

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
  - Implemented in [`packages/core/src/application/use-cases/get-status.ts`](packages/core/src/application/use-cases/get-status.ts#L448-L537).
- **Test Coverage**:
  - 45 unit tests in [`packages/core/test/application/use-cases/get-status.spec.ts`](packages/core/test/application/use-cases/get-status.spec.ts) passing.
  - 5 integration tests in [`packages/core/test/composition/use-cases/get-status.spec.ts`](packages/core/test/composition/use-cases/get-status.spec.ts) passing.
  - Specific test cases verify graceful degradation with `SCHEMA_RESOLUTION_FAILED`, empty `availableTransitions`, and null `schemaInfo`.

---

### 4. `core:run-step-hooks`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves schema via `SchemaProvider.get(change.schemaName)` for active changes, and `SchemaProvider.get(archived.schemaName)` for post-archiving hooks fallback.
  - **No Schema Mismatch Rejection**: Does NOT throw `SchemaMismatchError` when workspace default schema differs from `change.schemaName`. Propagates resolution errors (`SchemaNotFoundError`).
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/run-step-hooks.ts`](packages/core/src/application/use-cases/run-step-hooks.ts#L114-L157).
- **Test Coverage**:
  - 35 unit tests in [`packages/core/test/application/use-cases/run-step-hooks.spec.ts`](packages/core/test/application/use-cases/run-step-hooks.spec.ts) passing.
  - Test case: `resolves schema by change.schemaName`.

---

### 5. `core:validate-artifacts`

- **Key Requirements**:
  - **Sovereign Authority**: Obtains schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError`.
  - Artifact DAG, rules, required sections, and delta validations execute against sovereign schema definition.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/validate-artifacts.ts`](packages/core/src/application/use-cases/validate-artifacts.ts#L176).
- **Test Coverage**:
  - 70 unit tests in [`packages/core/test/application/use-cases/validate-artifacts.spec.ts`](packages/core/test/application/use-cases/validate-artifacts.spec.ts) passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 6. `core:change-manifest`

- **Key Requirements**:
  - **Sovereign Schema Authority**: Root `schema` object (`schema.name` and `schema.version`) in `manifest.json` is the definitive source of truth hydrated into `Change` domain entity.
  - **Tolerant Loading on Mismatch**: When loaded and workspace default schema name differs from manifest recorded schema, repository does NOT reject load with `SchemaMismatchError`. The change hydrates with its recorded schema identity.
  - **Version Bumps**: Version mismatches emit advisory warnings rather than breaking change operations.
- **Implementation Status**: **COMPLIANT**
  - Hydration implemented in [`packages/core/src/infrastructure/fs/manifest-change-loader.ts`](packages/core/src/infrastructure/fs/manifest-change-loader.ts) and [`packages/core/src/infrastructure/fs/manifest.ts`](packages/core/src/infrastructure/fs/manifest.ts).
- **Test Coverage**:
  - 13 unit tests in [`packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts`](packages/core/test/infrastructure/fs/manifest-change-loader.spec.ts) passing.

---

### 7. `core:preview-spec`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError` when workspace default schema differs.
  - Uses sovereign schema for parser lookups, delta formats, and templates.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/preview-spec.ts`](packages/core/src/application/use-cases/preview-spec.ts#L102).
- **Test Coverage**:
  - 14 unit tests in [`packages/core/test/application/use-cases/preview-spec.spec.ts`](packages/core/test/application/use-cases/preview-spec.spec.ts) passing.
  - Test case: `resolves schema by change.schemaName`.

---

### 8. `core:archive-change`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(loadedChange.schemaName)` without throwing `SchemaMismatchError` when workspace default schema differs.
  - **Deferred Overlap Scanning**: Does NOT invoke `list()` / `get()` on peer changes before predicates return. Peer overlap scanning executes only upon `spec.overlap` check failure or when `allowOverlap: true` invalidation is triggered.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/archive-change.ts`](packages/core/src/application/use-cases/archive-change.ts#L282-L338).
- **Test Coverage**:
  - 81 unit tests in [`packages/core/test/application/use-cases/archive-change.spec.ts`](packages/core/test/application/use-cases/archive-change.spec.ts) passing.
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
  - Implemented in [`packages/core/src/application/use-cases/approve-spec.ts`](packages/core/src/application/use-cases/approve-spec.ts#L74-L85).
- **Test Coverage**:
  - 15 unit tests in [`packages/core/test/application/use-cases/approve-spec.spec.ts`](packages/core/test/application/use-cases/approve-spec.spec.ts) passing.
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
  - Implemented in [`packages/core/src/application/use-cases/approve-signoff.ts`](packages/core/src/application/use-cases/approve-signoff.ts#L86-L98).
- **Test Coverage**:
  - 19 unit tests in [`packages/core/test/application/use-cases/approve-signoff.spec.ts`](packages/core/test/application/use-cases/approve-signoff.spec.ts) passing.
  - Test case: `resolves schema by change.schemaName and succeeds`.

---

### 11. `core:compile-context`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Resolves change schema via `SchemaProvider.get(change.schemaName)`. Does NOT throw `SchemaMismatchError` when workspace default schema differs.
  - Governs contextual templates and metadata materialization based on sovereign schema.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/compile-context.ts`](packages/core/src/application/use-cases/compile-context.ts#L271).
- **Test Coverage**:
  - 82 unit tests in [`packages/core/test/application/use-cases/compile-context.spec.ts`](packages/core/test/application/use-cases/compile-context.spec.ts) passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 12. `core:get-artifact-instruction`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(change.schemaName)`. Does NOT throw `SchemaMismatchError`.
  - Resolves artifact types, rules, and instruction templates defined by sovereign schema.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/get-artifact-instruction.ts`](packages/core/src/application/use-cases/get-artifact-instruction.ts#L89).
- **Test Coverage**:
  - 14 unit tests in [`packages/core/test/application/use-cases/get-artifact-instruction.spec.ts`](packages/core/test/application/use-cases/get-artifact-instruction.spec.ts) passing.
  - Test case: `resolves sovereign schema by change.schemaName`.

---

### 13. `core:get-hook-instructions`

- **Key Requirements**:
  - **Sovereign Schema Resolution**: Obtains schema via `SchemaProvider.get(schemaName)`. Does NOT throw `SchemaMismatchError`.
  - Returns instructions defined in sovereign schema for specified step and phase.
- **Implementation Status**: **COMPLIANT**
  - Implemented in [`packages/core/src/application/use-cases/get-hook-instructions.ts`](packages/core/src/application/use-cases/get-hook-instructions.ts#L94).
- **Test Coverage**:
  - 6 unit tests in [`packages/core/test/application/use-cases/get-hook-instructions.spec.ts`](packages/core/test/application/use-cases/get-hook-instructions.spec.ts) passing.

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
