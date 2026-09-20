# Change completeness audit: workflow-transition-checks

- **State:** `designing`
- **Description:** Evaluate each lifecycle transition as an ordered list of workflow checks (protocol, schema-derived, core binding) so status, nextAction, and execute share one contract, including dependency consistency at ready.
- **Specs in change:** 20
- `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`

## core:lifecycle-engine

- **Title:** "Lifecycle Engine"
- **Spec source:** specs/core/lifecycle-engine/spec.md
- **Sections parsed:** 13
- **Impl scope:** Scoped to primary class LifecycleEngine in packages/core/src/domain/services/lifecycle-engine.ts

### Part A — Primary class ownership & constructor

#### `LifecycleEngine` (Spec lock)

- Context: `spec-lock.json > core:src/domain/services/lifecycle-engine.ts`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Spec ID 'core:lifecycle-engine' matches symbol domain and workspace 'core', but lacks formal AST constructor block
- ⚠️ No formal constructor block in effective spec AST (behavioral / spec-lock link)
  > Referenced symbols (9): `TransitionChange`, `GetStatus`, `Schema`, `Change`, `Spec`, `ValidateArtifacts`, `GetArtifactInstruction`, `CompileContext`, `InvalidStateTransitionError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ No explicit throw statements found in primary class.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ No explicit primary-class Input/Result interfaces.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 15 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ No explicit disk/db mutation calls detected in primary class (read-only use case).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:get-status

- **Title:** "GetStatus"
- **Spec source:** specs/core/get-status/spec.md
- **Sections parsed:** 22
- **Impl scope:** Scoped to primary class GetStatus in packages/core/src/application/use-cases/get-status.ts

### Part A — Primary class ownership & constructor

#### `GetStatus` (Contract AST)

- Context: `GetStatus > Requirements > Requirement: Constructor dependencies`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares constructor ports in Prose/List under: "GetStatus > Requirements > Requirement: Config-based factory delegates through resolveGetStatusDeps [Prose / List Inferred]"
- Constructor conformance: **100%** (7/7 params)
- ✅ Fully conformant
  > Referenced symbols (11): `Change`, `ChangeRepository`, `ChangeNotFoundError`, `GetDiscarded`, `RefreshImplementationTracking`, `LifecycleEngine`, `CountTasks`, `OverlapEntry`, `Schema`, `Spec`, `SchemaNotFoundError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |   75% | WARN   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'refreshImplementationTracking' is documented in spec.md / verify.md.
- ✅ Interface field 'ifModifiedSince' is documented in spec.md / verify.md.
- ✅ Interface field 'change' is documented in spec.md / verify.md.
- ✅ Interface field 'draftView' is documented in spec.md / verify.md.
- ✅ Interface field 'unchanged' is documented in spec.md / verify.md.
- ✅ Interface field 'artifactStatuses' is documented in spec.md / verify.md.
- ✅ Interface field 'specDependsOn' is documented in spec.md / verify.md.
- ✅ Interface field 'lifecycle' is documented in spec.md / verify.md.
- ✅ Interface field 'implementationTracking' is documented in spec.md / verify.md.
- ✅ Interface field 'review' is documented in spec.md / verify.md.
- ✅ Interface field 'blockers' is documented in spec.md / verify.md.
- ✅ Interface field 'nextAction' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (75%, WARN)
- ✅ Boolean 'refreshImplementationTracking' has symmetric verification (both true and false/absent cases verified).
- ⚠️ Boolean 'unchanged' documents 'true' case, but lacks explicit 'false/absent' scenario.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 26 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ No explicit disk/db mutation calls detected in primary class (read-only use case).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ Primary class has 2 try/catch recovery blocks, and verify.md tests fallback/degradation scenarios.

### Summary

- Primary class conformance: **1/1**
- **Architectural completeness index:** 96%

---

## core:transition-change

- **Title:** "TransitionChange"
- **Spec source:** specs/core/transition-change/spec.md
- **Sections parsed:** 29
- **Impl scope:** Scoped to primary class TransitionChange in packages/core/src/application/use-cases/transition-change.ts

### Part A — Primary class ownership & constructor

#### `TransitionChange` (Contract AST)

- Context: `TransitionChange > Requirements > Requirement: Config-based factory delegates through resolveTransitionChangeDeps`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares constructor ports in Prose/List under: "TransitionChange > Requirements > Requirement: Config-based factory delegates through resolveTransitionChangeDeps [Prose / List Inferred]"
- Constructor conformance: **100%** (7/7 params)
- ✅ Fully conformant
  > Referenced symbols (18): `LifecycleEngine`, `Change`, `ChangeRepository`, `ChangeNotFoundError`, `RefreshImplementationTracking`, `Spec`, `InvalidStateTransitionError`, `ApproveSpec`, `CountTasks`, `ArchiveChange`, `RunStepHooks`, `HookFailedError`, `GetStatus`, `SpecdError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`, `HappyPathNextUnavailableError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'HappyPathNextUnavailableError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'InvalidStateTransitionError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveDependencyMismatchError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ReadOnlyWorkspaceError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveImplementationStateError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'to' is documented in spec.md / verify.md.
- ✅ Interface field 'skipHookPhases' is documented in spec.md / verify.md.
- ✅ Interface field 'refreshImplementationTrackingBefore' is documented in spec.md / verify.md.
- ✅ Interface field 'allowOutOfScope' is documented in spec.md / verify.md.
- ✅ Interface field 'change' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ Boolean 'refreshImplementationTrackingBefore' has symmetric verification (both true and false/absent cases verified).
- ✅ Boolean 'allowOutOfScope' has symmetric verification (both true and false/absent cases verified).
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 26 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 1 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **1/1**
- **Architectural completeness index:** 100%

---

## core:workflow-model

- **Title:** "Workflow Model"
- **Spec source:** specs/core/workflow-model/spec.md
- **Sections parsed:** 15
- **Impl scope:** Primary class 'WorkflowModel' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'WorkflowModel' not found in code symbol index.
  > Referenced symbols (14): `GetStatus`, `TransitionChange`, `CompileContext`, `Change`, `SchemaValidationError`, `ArchiveChange`, `InvalidStateTransitionError`, `ArtifactType`, `ChangeArtifact`, `ArtifactFile`, `ChangeRepository`, `LifecycleEngine`, `CountTasks`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'WorkflowModel' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 24 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:archive-change

- **Title:** "ArchiveChange"
- **Spec source:** specs/core/archive-change/spec.md
- **Sections parsed:** 36
- **Impl scope:** Scoped to primary class ArchiveChange in packages/core/src/application/use-cases/archive-change.ts

### Part A — Primary class ownership & constructor

#### `ArchiveChange` (Contract AST)

- Context: `ArchiveChange > Requirements > Requirement: Ports and constructor`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares formal TypeScript AST contract in section: "ArchiveChange > Requirements > Requirement: Ports and constructor"
- Constructor conformance: **100%** (13/13 params)
- ✅ Fully conformant
  > Referenced symbols (31): `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, `MaterializeSpecMetadata`, `ContentHasher`, `RunStepHooks`, `SpecRepository`, `Spec`, `Schema`, `SchemaMismatchError`, `InvalidStateTransitionError`, `Change`, `ReadOnlyWorkspaceError`, `SpecOverlapError`, `HookFailedError`, `ArtifactFile`, `FsArchiveBatchSnapshot`, `Delta`, `DeltaApplicationError`, `FsArchiveRepository`, `GenerateSpecMetadata`, `UpdatePersistedSpecSchema`, `SpecdError`, `ChangeNotFoundError`, `ArchiveDependencyMismatchError`, `ArchiveArtifactMissingError`, `ArchiveImplementationStateError`, `ParserNotRegisteredError`, `ArchiveBatchRestoreError`, `GetStatus`, `TransitionChange`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |   25% | FAIL   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveArtifactMissingError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ParserNotRegisteredError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveImplementationStateError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveBatchRestoreError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArchiveDependencyMismatchError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'skipHookPhases' is documented in spec.md / verify.md.
- ✅ Interface field 'allowOverlap' is documented in spec.md / verify.md.
- ✅ Interface field 'allowOutOfScope' is documented in spec.md / verify.md.
- ✅ Interface field 'archivedChange' is documented in spec.md / verify.md.
- ✅ Interface field 'archiveDirPath' is documented in spec.md / verify.md.
- ✅ Interface field 'postHookFailures' is documented in spec.md / verify.md.
- ✅ Interface field 'staleMetadataSpecPaths' is documented in spec.md / verify.md.
- ✅ Interface field 'invalidatedChanges' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (25%, FAIL)
- ⚠️ Boolean 'allowOverlap' documents 'true' case, but lacks explicit 'false/absent' scenario.
- ⚠️ Boolean 'allowOutOfScope' lacks explicit scenario toggle verification.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 56 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 8 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ Primary class has 9 try/catch recovery blocks, and verify.md tests fallback/degradation scenarios.

### Summary

- Primary class conformance: **1/1**
- **Architectural completeness index:** 89%

---

## cli:change-status

- **Title:** "Change Status"
- **Spec source:** specs/cli/change-status/spec.md
- **Sections parsed:** 22
- **Impl scope:** Primary class 'ChangeStatus' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'ChangeStatus' not found in code symbol index.
  > Referenced symbols (7): `Change`, `GetStatus`, `Schema`, `ArtifactDag`, `RefreshImplementationTracking`, `LifecycleEngine`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'ChangeStatus' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 15 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## cli:change-transition

- **Title:** "Change Transition"
- **Spec source:** specs/cli/change-transition/spec.md
- **Sections parsed:** 20
- **Impl scope:** Primary class 'ChangeTransition' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'ChangeTransition' not found in code symbol index.
  > Referenced symbols (7): `Change`, `TransitionChange`, `GetStatus`, `RefreshImplementationTracking`, `InvalidStateTransitionError`, `HookFailedError`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'ChangeTransition' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 18 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:transition-checks

- **Title:** "Transition Checks"
- **Spec source:** specs/core/transition-checks/spec.md
- **Sections parsed:** 18
- **Impl scope:** Primary class 'TransitionChecks' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'TransitionChecks' not found in code symbol index.
  > Referenced symbols (15): `ApproveSpec`, `ApproveSignoff`, `WorkflowCheck`, `RunStepHooks`, `Change`, `Schema`, `TransitionChange`, `CountTasks`, `HookFailedError`, `GetStatus`, `ArchiveChange`, `ValidateArtifacts`, `GetArtifactInstruction`, `LifecycleEngine`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'TransitionChecks' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 12 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:change

- **Title:** "Change"
- **Spec source:** specs/core/change/spec.md
- **Sections parsed:** 29
- **Impl scope:** Scoped to primary class Change in packages/core/src/domain/entities/change.ts

### Part A — Primary class ownership & constructor

#### `Change` (Spec lock)

- Context: `spec-lock.json > core:src/domain/entities/change.ts`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Spec ID 'core:change' matches symbol domain and workspace 'core', but lacks formal AST constructor block
- ⚠️ No formal constructor block in effective spec AST (behavioral / spec-lock link)
  > Referenced symbols (23): `CompileContext`, `ApproveSpec`, `ApproveSignoff`, `Spec`, `TransitionChange`, `GetStatus`, `InvalidStateTransitionError`, `ChangeArtifact`, `ArtifactFile`, `ValidateArtifacts`, `EditChange`, `Schema`, `SchemaMismatchError`, `RestoreChange`, `ChangeRepository`, `DiscardChange`, `GetDraft`, `ChangeNotFoundError`, `DraftedChangeReadOnlyError`, `LifecycleEngine`, `FsChangeRepository`, `SaveChangeArtifact`, `InvalidChangeError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |   50% | FAIL   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (50%, FAIL)

- ✅ Error 'InvalidChangeError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'InvalidStateTransitionError' is documented in spec.md / verify.md scenarios.
- ❌ Error 'HistoricalImplementationGuardError' is thrown in code but NOT documented in spec.md or verify.md!
- ❌ Error 'CorruptedManifestError' is thrown in code but NOT documented in spec.md or verify.md!
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ No explicit primary-class Input/Result interfaces.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 30 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ No explicit disk/db mutation calls detected in primary class (read-only use case).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 93%

---

## skills:skill-templates-source

- **Title:** "skills:skill-templates-source"
- **Spec source:** specs/skills/skill-templates-source/spec.md
- **Sections parsed:** 24
- **Impl scope:** Primary class 'skillsskilltemplatessource' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'skillsskilltemplatessource' not found in code symbol index.
  > Referenced symbols (2): `Spec`, `ArchiveChange`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'skillsskilltemplatessource' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 12 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:hook-execution-model

- **Title:** "Hook Execution Model"
- **Spec source:** specs/core/hook-execution-model/spec.md
- **Sections parsed:** 22
- **Impl scope:** Primary class 'HookExecutionModel' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'HookExecutionModel' not found in code symbol index.
  > Referenced symbols (11): `GetHookInstructions`, `SchemaValidationError`, `TransitionChange`, `ArchiveChange`, `RunStepHooks`, `CompileContext`, `Change`, `HookFailedError`, `Schema`, `Spec`, `HookResult`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'HookExecutionModel' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 33 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:approve-spec

- **Title:** "ApproveSpec"
- **Spec source:** specs/core/approve-spec/spec.md
- **Sections parsed:** 13
- **Impl scope:** Scoped to primary class ApproveSpec in packages/core/src/application/use-cases/approve-spec.ts

### Part A — Primary class ownership & constructor

#### `ApproveSpec` (Contract AST)

- Context: `ApproveSpec > Requirements > Requirement: Config-based factory delegates through resolveApproveSpecDeps`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares constructor ports in Prose/List under: "ApproveSpec > Requirements > Requirement: Config-based factory delegates through resolveApproveSpecDeps [Prose / List Inferred]"
- Constructor conformance: **80%** (4/5 params)
- Missing in spec: `hasher`
- Extra / drifted in spec: `contentHasher`
  > Referenced symbols (11): `ApprovalGateDisabledError`, `ChangeRepository`, `ChangeNotFoundError`, `SchemaNotFoundError`, `SchemaValidationError`, `SchemaMismatchError`, `Change`, `ContentHasher`, `Spec`, `Schema`, `InvalidStateTransitionError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ApprovalGateDisabledError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'SchemaMismatchError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'InvalidStateTransitionError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'reason' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 15 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 1 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:approve-signoff

- **Title:** "ApproveSignoff"
- **Spec source:** specs/core/approve-signoff/spec.md
- **Sections parsed:** 13
- **Impl scope:** Scoped to primary class ApproveSignoff in packages/core/src/application/use-cases/approve-signoff.ts

### Part A — Primary class ownership & constructor

#### `ApproveSignoff` (Contract AST)

- Context: `ApproveSignoff > Requirements > Requirement: Config-based factory delegates through resolveApproveSignoffDeps`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares constructor ports in Prose/List under: "ApproveSignoff > Requirements > Requirement: Config-based factory delegates through resolveApproveSignoffDeps [Prose / List Inferred]"
- Constructor conformance: **80%** (4/5 params)
- Missing in spec: `hasher`
- Extra / drifted in spec: `contentHasher`
  > Referenced symbols (11): `ApprovalGateDisabledError`, `ChangeRepository`, `ChangeNotFoundError`, `SchemaNotFoundError`, `SchemaValidationError`, `SchemaMismatchError`, `Change`, `ContentHasher`, `Spec`, `Schema`, `InvalidStateTransitionError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ApprovalGateDisabledError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'SchemaMismatchError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'InvalidStateTransitionError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'reason' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 15 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 1 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## cli:change-approve

- **Title:** "Change Approve"
- **Spec source:** specs/cli/change-approve/spec.md
- **Sections parsed:** 13
- **Impl scope:** Primary class 'ChangeApprove' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'ChangeApprove' not found in code symbol index.
  > Referenced symbols (4): `Change`, `ApproveSpec`, `ApproveSignoff`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'ChangeApprove' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 9 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:config

- **Title:** "Project Configuration"
- **Spec source:** specs/core/config/spec.md
- **Sections parsed:** 40
- **Impl scope:** Primary class 'ProjectConfiguration' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'ProjectConfiguration' not found in code symbol index.
  > Referenced symbols (14): `Schema`, `ConfigValidationError`, `SchemaNotFoundError`, `SchemaValidationError`, `SpecdError`, `SpecRepository`, `CompileContext`, `ConfigLoader`, `StorageDirectoryNotFoundError`, `TemplateExpander`, `ApproveSpec`, `ApproveSignoff`, `Spec`, `FsChangeRepository`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'ProjectConfiguration' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 8 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## cli:change-archive

- **Title:** "Change Archive"
- **Spec source:** specs/cli/change-archive/spec.md
- **Sections parsed:** 16
- **Impl scope:** Primary class 'ChangeArchive' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'ChangeArchive' not found in code symbol index.
  > Referenced symbols (3): `Change`, `ArchiveChange`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'ChangeArchive' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 18 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:validate-artifacts

- **Title:** "ValidateArtifacts"
- **Spec source:** specs/core/validate-artifacts/spec.md
- **Sections parsed:** 30
- **Impl scope:** Scoped to primary class ValidateArtifacts in packages/core/src/application/use-cases/validate-artifacts.ts

### Part A — Primary class ownership & constructor

#### `ValidateArtifacts` (Contract AST)

- Context: `ValidateArtifacts > Requirements > Requirement: Ports and constructor`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares formal TypeScript AST contract in section: "ValidateArtifacts > Requirements > Requirement: Ports and constructor"
- Constructor conformance: **100%** (9/9 params)
- ✅ Fully conformant
  > Referenced symbols (15): `ChangeRepository`, `ListWorkspaces`, `ContentHasher`, `LifecycleEngine`, `SpecRepository`, `Schema`, `SchemaMismatchError`, `Change`, `Delta`, `DeltaApplicationError`, `ChangeArtifact`, `ArchiveChange`, `ChangeNotFoundError`, `Spec`, `SpecNotInChangeError`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'SpecNotInChangeError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'SchemaMismatchError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'specPath' is documented in spec.md / verify.md.
- ✅ Interface field 'artifactId' is documented in spec.md / verify.md.
- ✅ Interface field 'passed' is documented in spec.md / verify.md.
- ✅ Interface field 'failures' is documented in spec.md / verify.md.
- ✅ Interface field 'warnings' is documented in spec.md / verify.md.
- ✅ Interface field 'files' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ Boolean 'passed' has symmetric verification (both true and false/absent cases verified).
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 30 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 1 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ Primary class has 2 try/catch recovery blocks, and verify.md tests fallback/degradation scenarios.

### Summary

- Primary class conformance: **1/1**
- **Architectural completeness index:** 100%

---

## core:get-artifact-instruction

- **Title:** "GetArtifactInstruction"
- **Spec source:** specs/core/get-artifact-instruction/spec.md
- **Sections parsed:** 14
- **Impl scope:** Scoped to primary class GetArtifactInstruction in packages/core/src/application/use-cases/get-artifact-instruction.ts

### Part A — Primary class ownership & constructor

#### `GetArtifactInstruction` (Contract AST)

- Context: `GetArtifactInstruction > Requirements > Requirement: Ports and constructor`
- Role: **PRIMARY OWNER** (HIGH confidence)
- Effective spec declares formal TypeScript AST contract in section: "GetArtifactInstruction > Requirements > Requirement: Ports and constructor"
- Constructor conformance: **100%** (6/6 params)
- ✅ Fully conformant
  > Referenced symbols (15): `CompileContext`, `LifecycleEngine`, `ChangeRepository`, `SpecRepository`, `TemplateExpander`, `ArtifactNotFoundError`, `Change`, `ChangeNotFoundError`, `Schema`, `SchemaMismatchError`, `GetSpecOutline`, `GetStatus`, `Delta`, `ParserNotRegisteredError`, `Spec`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ Error 'ChangeNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'SchemaMismatchError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ArtifactNotFoundError' is documented in spec.md / verify.md scenarios.
- ✅ Error 'ParserNotRegisteredError' is documented in spec.md / verify.md scenarios.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ Interface field 'name' is documented in spec.md / verify.md.
- ✅ Interface field 'artifactId' is documented in spec.md / verify.md.
- ✅ Interface field 'rulesPre' is documented in spec.md / verify.md.
- ✅ Interface field 'instruction' is documented in spec.md / verify.md.
- ✅ Interface field 'template' is documented in spec.md / verify.md.
- ✅ Interface field 'delta' is documented in spec.md / verify.md.
- ✅ Interface field 'formatInstructions' is documented in spec.md / verify.md.
- ✅ Interface field 'domainInstructions' is documented in spec.md / verify.md.
- ✅ Interface field 'availableOutlines' is documented in spec.md / verify.md.
- ✅ Interface field 'rulesPost' is documented in spec.md / verify.md.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 20 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ No explicit disk/db mutation calls detected in primary class (read-only use case).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ No catch-and-fallback recovery blocks detected in primary class.

### Summary

- Primary class conformance: **1/1**
- **Architectural completeness index:** 100%

---

## core:schema-format

- **Title:** "Schema Format"
- **Spec source:** specs/core/schema-format/spec.md
- **Sections parsed:** 29
- **Impl scope:** Primary class 'SchemaFormat' resolved from spec but not found in code index

### Part A — Primary class ownership & constructor

- ⚠️ Primary class 'SchemaFormat' not found in code symbol index.
  > Referenced symbols (22): `Schema`, `Change`, `SchemaValidationError`, `SpecRepository`, `ValidateArtifacts`, `GetArtifactInstruction`, `LifecycleEngine`, `Delta`, `ArtifactDag`, `EditChange`, `InvalidateChange`, `TransitionChange`, `ArchiveChange`, `ChangeRepository`, `CompileContext`, `GetProjectContext`, `Spec`, `SchemaNotFoundError`, `SpecdError`, `ArtifactType`, `GenerateSpecMetadata`, `GetStatus`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

- ⚠️ Primary class 'SchemaFormat' resolved from spec but not found in code index
  | Dimension | Score | Status |
  | --- | ---: | --- |
  | 5. Dependency Graph Alignment | 100% | PASS |

#### Findings

**5. Dependency Graph Alignment** (100%, PASS)

- ✅ Spec declares 12 dependencies in '## Spec Dependencies'.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## core:storage

- **Title:** "Storage"
- **Spec source:** specs/core/storage/spec.md
- **Sections parsed:** 26
- **Impl scope:** Scoped to primary class FsValidationResultCache in packages/core/src/infrastructure/fs/fs-validation-result-cache.ts

### Part A — Primary class ownership & constructor

#### `FsValidationResultCache` (Spec lock)

- Context: `spec-lock.json > core:src/infrastructure/fs/fs-validation-result-cache.ts`
- Role: **PRIMARY OWNER** (MEDIUM confidence)
- Spec explicitly links symbol implementation in spec-lock.json
- ⚠️ No formal constructor block in effective spec AST (behavioral / spec-lock link)
  > Referenced symbols (16): `Change`, `FsChangeRepository`, `ChangeRepository`, `ValidateArtifacts`, `LifecycleEngine`, `ArtifactFile`, `UnsupportedPatternError`, `ArchiveRepository`, `FsArchiveRepository`, `Repository`, `Spec`, `FsChangeIndexCache`, `FsSpecIndexCache`, `FsSpecRepository`, `ValidationResultCache`, `SpecRepository`. Use `--verbose-symbols` to expand.

### Part B — 7-dimensional architectural completeness

| Dimension                          | Score | Status |
| ---------------------------------- | ----: | ------ |
| 1. Error Topology Coverage         |  100% | PASS   |
| 2. Union & Enum Branch Matrix      |  100% | PASS   |
| 3. I/O Interface Field Coverage    |  100% | PASS   |
| 4. Boolean Toggle Symmetry         |  100% | PASS   |
| 5. Dependency Graph Alignment      |  100% | PASS   |
| 6. State Mutation & Side Effects   |  100% | PASS   |
| 7. Fallback & Graceful Degradation |  100% | PASS   |

#### Findings

**1. Error Topology Coverage** (100%, PASS)

- ✅ No explicit throw statements found in primary class.
  **2. Union & Enum Branch Matrix** (100%, PASS)
- ✅ No spec-mentioned multi-value string union inputs in primary-class I/O.
  **3. I/O Interface Field Coverage** (100%, PASS)
- ✅ No explicit primary-class Input/Result interfaces.
  **4. Boolean Toggle Symmetry** (100%, PASS)
- ✅ No spec-mentioned boolean toggle properties.
  **5. Dependency Graph Alignment** (100%, PASS)
- ✅ Spec declares 18 dependencies in '## Spec Dependencies'.
  **6. State Mutation & Side Effects** (100%, PASS)
- ✅ Primary class performs 2 mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).
  **7. Fallback & Graceful Degradation** (100%, PASS)
- ✅ Primary class has 4 try/catch recovery blocks, and verify.md tests fallback/degradation scenarios.

### Summary

- Primary class conformance: **0/1**
- **Architectural completeness index:** 100%

---

## Consolidated summary: workflow-transition-checks

| Spec                            | Completeness | Primary class conformance |
| ------------------------------- | -----------: | ------------------------: |
| `core:lifecycle-engine`         |         100% |                       0/1 |
| `core:get-status`               |          96% |                       1/1 |
| `core:transition-change`        |         100% |                       1/1 |
| `core:workflow-model`           |         100% |                       0/1 |
| `core:archive-change`           |          89% |                       1/1 |
| `cli:change-status`             |         100% |                       0/1 |
| `cli:change-transition`         |         100% |                       0/1 |
| `core:transition-checks`        |         100% |                       0/1 |
| `core:change`                   |          93% |                       0/1 |
| `skills:skill-templates-source` |         100% |                       0/1 |
| `core:hook-execution-model`     |         100% |                       0/1 |
| `core:approve-spec`             |         100% |                       0/1 |
| `core:approve-signoff`          |         100% |                       0/1 |
| `cli:change-approve`            |         100% |                       0/1 |
| `core:config`                   |         100% |                       0/1 |
| `cli:change-archive`            |         100% |                       0/1 |
| `core:validate-artifacts`       |         100% |                       1/1 |
| `core:get-artifact-instruction` |         100% |                       1/1 |
| `core:schema-format`            |         100% |                       0/1 |
| `core:storage`                  |         100% |                       0/1 |

- **Overall change architectural completeness index:** 99%
  npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
