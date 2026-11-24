# Spec-compliance partial: use cases (`workflow-transition-checks`)

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`
- **Source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Research:** graph search (`evaluateLifecycle`, `evaluateLifecycleVerdict`, `GetStatus`, `TransitionChange`, `resolveGetStatusDeps`, `createEvaluateLifecycle`) then working-tree reads. `graph stats`: `stale: false`, `contentFresh: true` at index `2948f1a2`. `graph impact --file` with `core:src/application/use-cases/*.ts` returned `no indexed file matches` (path form); implementations were confirmed by `graph search` locations + file reads. Treat graph as possibly lagging uncommitted tree; this audit used the working tree.

---

## Focus checklist (assigned)

| Focus                                                                                                               | Verdict                      | Evidence                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GetStatus / TransitionChange import `evaluateLifecycle` as module functions; no ctor lifecycle field                | **Pass (code)**              | `get-status.ts` import `evaluateLifecycle` from `../services/lifecycle-evaluation.js`; ctor fields: `_changes`, `_schemaProvider`, `_approvals`, `_refresh`, `_transitionBindings`, `_archiveBindings`. `transition-change.ts` same import; ctor has no lifecycle field. Graph: `createEvaluateLifecycle` **0 symbols**. |
| DAG consumers ValidateArtifacts / GetArtifactInstruction use `evaluateLifecycleVerdict` with empty `checksByTarget` | **Pass (code)**              | `validate-artifacts.ts` `:220–222` `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })`. `get-artifact-instruction.ts` `:97–99` same. Tests spy `checksByTarget: {}`.                                                                                                                                      |
| Factories MUST NOT inject `LifecycleEngine`                                                                         | **Pass (production wiring)** | `resolveGetStatusDeps`, `resolveTransitionChangeDeps`, `resolveValidateArtifactsDeps`, `resolveGetArtifactInstructionDeps` return ports/bindings only. No `lifecycle` key. Composition package has no `LifecycleEngine` / `createEvaluateLifecycle`.                                                                     |
| GetStatus schema catch: only `SchemaNotFoundError` degrades; other errors propagate                                 | **Pass (code + test)**       | Active and drafted paths: `if (!(err instanceof SchemaNotFoundError)) throw err`. Test `rethrows unexpected schema provider errors` (`disk exploded`). `schema: null` helper throws `SchemaNotFoundError` and degrades.                                                                                                  |
| Drafted status: `nextAction.command` null; empty `availableTransitions`                                             | **Pass (code)**              | `_buildDraftedResult`: `availableTransitions: []`, `nextAction.command: null`. Core test asserts empty transitions, **not** `command === null`. CLI `status.spec.ts` asserts `parsed.nextAction.command` is `null`.                                                                                                      |
| `to: 'next'` happy-path in Core, not CLI routing table                                                              | **Pass (code)**              | `TransitionChange.execute` maps `input.to === 'next'` via `HAPPY_PATH_NEXT[fromState]` / `HappyPathNextUnavailableError`. CLI `transition.ts` passes `to: 'next'` into `kernel.changes.transition.execute`. `validateRequestedTarget` only checks mutual exclusion / valid state names — no happy-path table.            |
| No `createEvaluateLifecycle()`                                                                                      | **Pass**                     | Graph search empty; grep of `packages/` source empty (hits only in a prior report).                                                                                                                                                                                                                                      |

---

## `core:get-status`

### Requirements Summary

| ID    | Requirement                                        | Spec intent (preview)                                                                                                                                                                        |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GS-01 | Accepts a change name as input                     | `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                          |
| GS-02 | Returns the change and its artifact statuses       | Active `change` vs `draftView`; no `getDiscarded`; drafted: empty transitions; no mutate commands                                                                                            |
| GS-03 | Revision evaluation                                | `ifModifiedSince` 304-style short-circuit                                                                                                                                                    |
| GS-04 | Drafted change read-only status                    | DAG via `projectArtifacts` / empty checks; empty `availableTransitions`; `nextAction.command` must not recommend transition/validate                                                         |
| GS-05 | Implementation status projection                   | Tracked files + links                                                                                                                                                                        |
| GS-06 | Optional pre-read refresh                          | Default true for **active** only; skip on 304, draft, or `false`                                                                                                                             |
| GS-07 | Drift-aware display status                         | File/artifact `displayStatus`                                                                                                                                                                |
| GS-08 | Task completion counts                             | From `workflow.taskCompletion` details; no second `CountTasks`; no global snapshot bag                                                                                                       |
| GS-09 | Execute matching predicates then project           | `executeChecksByLegalTargets`; archive predicates when `archivable`; `evaluateLifecycle` for `nextAction.command`                                                                            |
| GS-10 | Throws `ChangeNotFoundError`                       | Unknown name                                                                                                                                                                                 |
| GS-11 | Constructor dependencies                           | Repos, schema, approvals, refresh, `transitionBindings`, `archiveBindings`. **MUST NOT** ctor-inject `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`. **Import** `evaluateLifecycle`. |
| GS-12 | Config factory preserves bootstrap                 | Same status path as canonical                                                                                                                                                                |
| GS-13 | Reports effective status for every schema artifact | Full path: one entry per `schema.artifacts()`                                                                                                                                                |
| GS-14 | Returns lifecycle context                          | Review priority, overlap scan, check-derived `availableTransitions` / `availableSteps`                                                                                                       |
| GS-15 | Identifies blockers                                | Check codes, overlap rules, archive `OVERLAP_CONFLICT`                                                                                                                                       |
| GS-16 | Graceful degradation when schema resolution fails  | **Constraints:** only `SchemaNotFoundError` degrades; other `SchemaProvider.get()` errors propagate                                                                                          |
| GS-17 | `createGetStatus` via `resolveGetStatusDeps`       | No `lifecycle` / `LifecycleEngine` / `evaluateLifecycle` on deps                                                                                                                             |

### Implementation Status

| ID    | Status                               | Notes                                                                                                                         |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| GS-01 | **implemented**                      | `GetStatusInput` matches.                                                                                                     |
| GS-02 | **implemented**                      | `get` then `getDraft`; no `getDiscarded` in this class.                                                                       |
| GS-03 | **implemented**                      | `_buildUnchangedResult`.                                                                                                      |
| GS-04 | **implemented**                      | `projectArtifacts` (not hop `evaluateLifecycle`); empty transitions; `command: null`.                                         |
| GS-05 | **implemented**                      | `projectImplementationTracking`; drafts return empty tracking.                                                                |
| GS-06 | **implemented**                      | Refresh after 304 check; skip drafts.                                                                                         |
| GS-07 | **implemented**                      | `displayStatus()` + `aggregateDisplayStatus`.                                                                                 |
| GS-08 | **implemented**                      | `taskCompletionFromChecks` after `executeChecksByLegalTargets`.                                                               |
| GS-09 | **implemented**                      | Then `evaluateLifecycle(change, schema, { approvals, checksByTarget: checksByTargetMap })`.                                   |
| GS-10 | **implemented**                      |                                                                                                                               |
| GS-11 | **implemented (code)**               | Matches spec.md constructor. Spec.md still _names_ `LifecycleEngine` as the projector in other paragraphs.                    |
| GS-12 | **implemented**                      | Config form: `createCompositionResolver` → `resolveGetStatusDeps` → canonical `createGetStatus(deps)`.                        |
| GS-13 | **implemented**                      | Schema loop; 304 empty array; schema-miss uses persisted `change.artifacts` only.                                             |
| GS-14 | **implemented**                      | `_projectReview`, overlap helpers.                                                                                            |
| GS-15 | **implemented**                      | `_mergeBlockers`, `_nextActionAfterArchiveOverlap`.                                                                           |
| GS-16 | **implemented (code = Constraints)** | Requirement body says “if `get()` throws” without qualifying `SchemaNotFoundError`; Constraints + verify + code are narrower. |
| GS-17 | **implemented**                      | `GetStatusDeps` has no lifecycle field.                                                                                       |

### Discrepancies

1. **LifecycleEngine leftover wording in spec.md / verify.md vs module-function constructor**
   - **Kind:** `spec-wrong`
   - **Severity:** medium (docs/verify vs code; constructor section already correct)
   - **Spec:** GS-09/GS-13/GS-14/GS-15 and Purpose still say “LifecycleEngine MUST project / derive / MAY obtain from LifecycleEngine”; drafted GS-04 cites `LifecycleEngine.evaluate`; verify “uses LifecycleEngine to derive…”.
   - **Code:** I/O-free projection is `evaluateLifecycle` → `evaluateLifecycleVerdict` + `resolveLifecycleNextAction`. No `class LifecycleEngine` in `packages/core`.
   - **Why spec may be wrong:** Constructor + factory requirements already forbid injecting an engine; leftover class name from the pre-function design.
   - **Why code may be wrong:** Only if the product still intended a ctor-injected engine — contradicted by GS-11/GS-17 and `core:transition-checks` “no engine class”. **CODE WINS** for wiring.

2. **Graceful-degradation requirement body vs Constraints**
   - **Kind:** `spec-wrong` (internal)
   - **Severity:** low
   - **Spec:** Requirement GS-16: any throw from `SchemaProvider.get()` degrades silently. Constraints + verify scenario: only `SchemaNotFoundError`.
   - **Code:** instanceof `SchemaNotFoundError` only.
   - **CODE WINS** vs the unqualified requirement sentence.

3. **Drafted schema miss vs `schemaInfo: null`**
   - **Kind:** `both` (underspecified)
   - **Severity:** low
   - **Code:** drafted catch still fills `schemaInfo` from `draftView.schemaName` / version, `artifacts: []`. Active catch sets `schemaInfo: null`.
   - **Spec:** GS-16 `schemaInfo MUST be null` is not scoped to active-only.

4. **Composition tests still put `lifecycle` on `GetStatusDeps` literals**
   - **Kind:** `code-wrong` (tests)
   - **Severity:** low
   - **Evidence:** `packages/core/test/composition/use-cases/get-status.spec.ts` includes `lifecycle: {} as never` while `GetStatusDeps` has no such field. Runtime ignores the extra key. Spec: MUST NOT resolve `lifecycle`. Tests do not assert absence.

### Test Coverage

| Area                                                                                                                      | Coverage                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Not found / discarded                                                                                                     | Present (`ChangeNotFoundError`)                                                                                 |
| Refresh default / skip / draft                                                                                            | Present                                                                                                         |
| Schema miss degrade + rethrow other errors                                                                                | Present (`schema issues`)                                                                                       |
| Drafted empty `availableTransitions` / `availableSteps`; DAG `pending-parent-artifact-review` without `evaluateLifecycle` | Present                                                                                                         |
| Task completion / no second CountTasks / `evaluateLifecycle` spy                                                          | Present                                                                                                         |
| Archive overlap `nextAction`                                                                                              | Present                                                                                                         |
| 304 / `ifModifiedSince`                                                                                                   | Present (file has revision tests)                                                                               |
| Constructor “without LifecycleEngine”                                                                                     | **Not a dedicated ctor-shape test**; `makeGetStatus` simply does not pass one                                   |
| Drafted `nextAction.command === null`                                                                                     | **Missing in core** `get-status.spec.ts`; **present in CLI** `packages/cli/test/commands/change/status.spec.ts` |
| `resolveGetStatusDeps` does not resolve lifecycle                                                                         | **Missing** (only overlap `includeOverlapDetection` source string test)                                         |

### Missing Tests

- Core: drafted `nextAction.command` is `null` (and is not a transition/validate command).
- Core: `GetStatus` constructor / `GetStatusDeps` keys exclude `lifecycle` / `evaluateLifecycle`.
- Core: `resolveGetStatusDeps` return object `not.toHaveProperty('lifecycle')` (pattern exists for `compile-context`).
- Verify leftover “uses LifecycleEngine” should be rewritten to `evaluateLifecycle` so tests can be named against the real API.

### Spec Dependency Chain

- Direct (preview): `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- Drafted view: `core:drafted-change-view` (linked from GS-04).
- Consistency: GS-11/GS-17 align with `core:transition-checks` function-based evaluation. Remaining `LifecycleEngine` nouns in GetStatus spec.md conflict with those same sections.

---

## `core:transition-change`

### Requirements Summary

| ID          | Requirement                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01       | Input contract (`to: ChangeState \| 'next'`, skip hooks, refresh, `allowOutOfScope`; no per-call approval flags)                      |
| TC-02       | Approval gates baked at construction                                                                                                  |
| TC-03       | Change must exist                                                                                                                     |
| TC-04       | Optional pre-transition refresh                                                                                                       |
| TC-05–TC-08 | Approval as checks not pending hops; pending drain; direct persist when gates inactive                                                |
| TC-09       | Workflow requires via matching predicates / `evaluateLifecycle` projection                                                            |
| TC-10       | Task completion via `workflow.taskCompletion`                                                                                         |
| TC-11       | `verifying → implementing` does not clear validated artifacts                                                                         |
| TC-12       | Skill-aligned backward hop (signoff invalidate; no mass artifact downgrade)                                                           |
| TC-13       | Transition to designing / invalidate rules                                                                                            |
| TC-14       | `archiving → archivable` recovery                                                                                                     |
| TC-15–TC-16 | Pre/post hook effects via bindings, not `RunStepHooks` as UC port                                                                     |
| TC-17       | Delegate to `change.transition` (except invalidate-is-the-hop)                                                                        |
| TC-18       | `transitioned` progress                                                                                                               |
| TC-19       | Persistence via `mutate`                                                                                                              |
| TC-20       | Result `{ change }`                                                                                                                   |
| TC-21       | Progress callback                                                                                                                     |
| TC-22       | Dependencies: no ctor `LifecycleEngine` / `RunStepHooks` / `CountTasks`; import `evaluateLifecycle`                                   |
| TC-23       | **`to: 'next'` is Core happy-path (`HAPPY_PATH_NEXT`), not `GetStatus.nextAction.targetStep`; typed `HappyPathNextUnavailableError`** |
| TC-24       | Shared runner errors propagate                                                                                                        |
| TC-25       | `resolveTransitionChangeDeps` without lifecycle / `runStepHooks` on UC                                                                |

### Implementation Status

| ID          | Status                 | Notes                                                                                                                                  |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01–TC-08 | **implemented**        | `ApprovalGates` on ctor; `TransitionChangeInput` has no gate flags.                                                                    |
| TC-09       | **implemented**        | `executeMatchingPredicates` + `evaluateLifecycle(..., { requestedTarget, checksByTarget: { [requestedTarget]: evaluation.checks } })`. |
| TC-10       | **implemented**        | Fail mapping + `task-completion-failed` progress (see `_mapFailedPredicate` / `_emitFailureProgress`).                                 |
| TC-11–TC-14 | **implemented**        | Mutate callback: designing invalidate; signoff invalidate on skill hops; `transition` otherwise.                                       |
| TC-15–TC-16 | **implemented**        | `matchingEffects` + `executeCheckWithProgress`; skip selectors.                                                                        |
| TC-17–TC-21 | **implemented**        |                                                                                                                                        |
| TC-22       | **implemented (code)** | Module import; ctor: changes, actor, schemaProvider, refresh, approvals, transitionBindings.                                           |
| TC-23       | **implemented**        | `HAPPY_PATH_NEXT` in `change-state.ts`; CLI does not resolve hops.                                                                     |
| TC-24       | **implemented**        | Typed errors imported; mapping throws those types.                                                                                     |
| TC-25       | **implemented**        | `resolveTransitionChangeDeps` uses `resolveWorkflowCheckRegistry` without overlap flag (unlike GetStatus).                             |

### Discrepancies

1. **Purpose / Constraints / several verify scenarios still name `LifecycleEngine`**
   - **Kind:** `spec-wrong`
   - **Severity:** medium
   - **Spec:** Purpose “delegating … to LifecycleEngine”; Constraints “interpretation is centralized through LifecycleEngine”; verify GIVEN “LifecycleEngine reports…”.
   - **Code:** `evaluateLifecycle` module function; no ctor engine. TC-22/TC-25 already forbid ctor injection.
   - **CODE WINS** for composition.

2. **Composition tests still include `lifecycle: {} as never` on `TransitionChangeDeps`**
   - **Kind:** `code-wrong` (tests)
   - **Severity:** low
   - Same pattern as GetStatus factory tests.

### Test Coverage

| Area                                                                                 | Coverage                                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `to: 'next'` implementing → verifying                                                | Present                                                        |
| `to: 'next'` rejected: archivable, pending-spec-approval, pending-signoff, archiving | Present (`HappyPathNextUnavailableError`)                      |
| Schema miss throws (does not skip checks)                                            | Present                                                        |
| Approval / requires / tasks / hooks / mutate                                         | Broad file `transition-change.spec.ts`                         |
| Domain `HAPPY_PATH_NEXT` map                                                         | `change-state.spec.ts`                                         |
| CLI passes `to: 'next'` through                                                      | `packages/cli/test/commands/change/transition.spec.ts`         |
| Ctor / deps exclude `LifecycleEngine`                                                | Verify scenario exists; no explicit “property names” assertion |
| `resolveTransitionChangeDeps` has no lifecycle                                       | **Missing**                                                    |

### Missing Tests

- `resolveTransitionChangeDeps` / `TransitionChangeDeps` `not.toHaveProperty('lifecycle')`.
- CLI negative: CLI must not map `--next` to a concrete `ChangeState` before calling Core (today implied by `to: 'next'` expectation).

### Spec Dependency Chain

- Direct: `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- TC-23 explicitly **not** `GetStatus.nextAction` — matches `HAPPY_PATH_NEXT` comment in `change-state.ts`.

---

## `core:validate-artifacts`

### Requirements Summary

Focus-relevant plus constructor/factory/DAG (full spec also covers delta, cross-artifact, metadata, persist, etc.).

| ID              | Requirement                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VA-ctor         | Ports: changes, listWorkspaces, schemaProvider, parsers, actor, hasher, extractorTransforms, workspaceRoutes. DAG via **imported** `evaluateLifecycleVerdict`, not ctor engine. |
| VA-input        | Optional `specPath` for `scope: change`                                                                                                                                         |
| VA-schema-guard | `SchemaMismatchError`                                                                                                                                                           |
| VA-required     | Missing required artifacts → result failure, not throw                                                                                                                          |
| VA-deps         | Dependency order via verdict; one `evaluateLifecycleVerdict` per execute; `markVerdictComplete` in-memory                                                                       |
| VA-topo         | `artifactDag().topologicalOrder()` when no single filter                                                                                                                        |
| VA-factory      | `resolveValidateArtifactsDeps`; MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                                                |
| VA-DAG          | Empty `checksByTarget`; no hop predicates; no `gatherPredicateSnapshots`                                                                                                        |
| VA-exists       | `ChangeNotFoundError` if `get` null                                                                                                                                             |

(Other requirements: complete/skip bypass, approval hash scan, per-file/delta/structural/cross-artifact/metadata/hash/result/save/dependsOn — audited as **implemented in the same class**; not re-listed line-by-line here unless they conflict with DAG/engine focus.)

### Implementation Status

| Area                                                    | Status                             | Notes                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Constructor                                             | **implemented**                    | Optional defaults `extractorTransforms = new Map()`, `workspaceRoutes = []` (not in spec signature).                                     |
| `evaluateLifecycleVerdict(..., { checksByTarget: {} })` | **implemented**                    | Once at execute start.                                                                                                                   |
| `markVerdictComplete`                                   | **implemented**                    | In-memory patch of `artifactVerdicts`.                                                                                                   |
| Topological order                                       | **implemented**                    | When `artifactId` omitted.                                                                                                               |
| Factory                                                 | **implemented**                    | No lifecycle in `ValidateArtifactsDeps`.                                                                                                 |
| Schema miss                                             | **throws** (not GetStatus degrade) | Matches “schema cannot be resolved” as error for this UC. Tests: `throws SchemaNotFoundError`.                                           |
| Hop predicates / snapshot gather                        | **absent**                         | No `executeChecksByLegalTargets` in this file; `gatherPredicateSnapshots` not in source (asserted false in `transition-checks.spec.ts`). |

### Discrepancies

1. **verify.md still requires constructor `LifecycleEngine`**
   - **Kind:** `spec-wrong` (verify vs spec.md **and** vs code)
   - **Severity:** **high** for a literal verify audit
   - **verify:** “ValidateArtifacts is constructed with LifecycleEngine” / “constructor receives a LifecycleEngine dependency”.
   - **spec.md Ports and constructor + VA-factory:** no engine; `evaluateLifecycleVerdict` module function; factory MUST NOT resolve lifecycle.
   - **Code:** no engine ctor arg.
   - **CODE + spec.md WIN**; verify.md is stale and **contradicts** the change’s own spec.md.

2. **Optional ctor defaults not in spec type snippet**
   - **Kind:** `spec-wrong` (minor) or acceptable implementation convenience
   - **Severity:** low
   - Spec shows eight required constructor params; code defaults last two.

### Test Coverage

| Area                                                     | Coverage                                                  |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Empty `checksByTarget`                                   | Present (`evaluates lifecycle with empty checksByTarget`) |
| Dependency-blocked failures                              | Present (`Dependency order check`)                        |
| Schema mismatch / not found / unknown artifact           | Present                                                   |
| Factory `resolveValidateArtifactsDeps` without lifecycle | **No dedicated composition test file** for this UC        |
| “Constructed without LifecycleEngine”                    | **Missing**; verify still says **with**                   |

### Missing Tests

- Composition: `resolveValidateArtifactsDeps` has no `lifecycle`.
- Constructor arity / property names exclude engine (to lock verify.md once it is flipped).
- Explicit “does not call `executeChecksByLegalTargets` / hop predicates” (currently implied by empty `checksByTarget` spy).

### Spec Dependency Chain

- Direct: `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, `core:spec-id-format`, `core:schema-format`, plus composition-resolver (factory).
- DAG requirement points at `core:lifecycle-engine` `projectArtifacts` / topological order.
- **Internal spec vs verify contradiction** on `LifecycleEngine` ctor is the main dependency-chain defect.

---

## `core:get-artifact-instruction`

### Requirements Summary

| ID               | Requirement                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GAI-ctor         | changes, specs map, schemaProvider, parsers, expander; auto-select via `evaluateLifecycleVerdict` empty checks; **no** `LifecycleEngine` ctor |
| GAI-input        | `name`; optional `artifactId`; omit → `nextArtifact`; all complete/skipped → `ArtifactNotFoundError`                                          |
| GAI-lookup       | `ChangeNotFoundError`                                                                                                                         |
| GAI-schema-guard | `SchemaMismatchError`                                                                                                                         |
| GAI-artifact     | `ArtifactNotFoundError`                                                                                                                       |
| GAI-instruction  | rules / instruction / template / delta / outlines                                                                                             |
| GAI-result       | Result shape                                                                                                                                  |
| GAI-factory      | `resolveGetArtifactInstructionDeps`; MUST NOT resolve lifecycle                                                                               |
| GAI-DAG          | `evaluateLifecycleVerdict` empty `checksByTarget`; no hop predicates; no snapshot bag                                                         |

### Implementation Status

| ID                            | Status          | Notes                                                                                                                              |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GAI-ctor                      | **implemented** | Five ctor args; import `evaluateLifecycleVerdict`.                                                                                 |
| GAI-input                     | **implemented** | `resolvedId = input.artifactId ?? lifecycle.nextArtifact`; null → `ArtifactNotFoundError('(auto)', ...)`.                          |
| GAI-lookup / guard / artifact | **implemented** |                                                                                                                                    |
| GAI-instruction / result      | **implemented** | Template vars `{ change: { name, path } }` only.                                                                                   |
| GAI-factory                   | **implemented** |                                                                                                                                    |
| GAI-DAG                       | **implemented** | Always evaluates verdict (including when `artifactId` is explicit) with `{}` checks — extra DAG call, still empty checks, no hops. |

### Discrepancies

1. **verify.md Input scenarios still name `LifecycleEngine.nextArtifact` / `LifecycleEngine.evaluate`**
   - **Kind:** `spec-wrong`
   - **Severity:** low–medium
   - **spec.md** already says `evaluateLifecycleVerdict` / empty `checksByTarget`.
   - **verify** “Omitted artifactId uses engine-derived readiness” still GIVEN `LifecycleEngine.nextArtifact`.
   - **Code** uses `lifecycle.nextArtifact` from `evaluateLifecycleVerdict`.
   - **CODE + spec.md WIN**.

2. **Always calling `evaluateLifecycleVerdict` even when `artifactId` is set**
   - **Kind:** none (compliant) or tiny over-work
   - Spec: MUST use verdict when resolving next **or** required readiness. Calling it always with empty checks is allowed; it does not run hop predicates.

### Test Coverage

| Area                                              | Coverage                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `evaluateLifecycleVerdict` + `checksByTarget: {}` | Present (on a path **with** explicit `artifactId`)                          |
| Change / schema / artifact errors                 | Present                                                                     |
| Template expansion / no workspace key             | Present                                                                     |
| Omitted `artifactId` → `nextArtifact`             | Should be in file; spy currently on explicit-id template test               |
| Constructor without engine                        | **No dedicated test** (verify scenario exists as “without LifecycleEngine”) |
| Factory deps                                      | **No composition test file**                                                |

### Missing Tests

- Omitted `artifactId` asserts spy `nextArtifact` / returned `artifactId`.
- `resolveGetArtifactInstructionDeps` has no `lifecycle`.
- All-artifacts-complete auto-id throws `ArtifactNotFoundError`.

### Spec Dependency Chain

- Direct: `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks` (no `gatherPredicateSnapshots`).
- Aligns with ValidateArtifacts DAG path (empty checks, no GetStatus hop collection).

---

## Factories (all four)

| Helper                              | Resolves                                                                                                           | Injects `LifecycleEngine`? |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `resolveGetStatusDeps`              | changes, schemaProvider, approvals, refresh, transitionBindings, archiveBindings (`includeOverlapDetection: true`) | **No**                     |
| `resolveTransitionChangeDeps`       | changes, actor, schemaProvider, refresh, approvals, transitionBindings                                             | **No**                     |
| `resolveValidateArtifactsDeps`      | changes, listWorkspaces, schemaProvider, parsers, actor, contentHasher, extractorTransforms, workspaceRoutes       | **No**                     |
| `resolveGetArtifactInstructionDeps` | changes, specs, schemaProvider, parsers, templateExpander                                                          | **No**                     |

Config overloads all: `createCompositionResolver` → `resolve*Deps` → canonical `create*(deps)`. No inline fs wiring in these four files.

Stale tests: GetStatus and TransitionChange composition specs still **author** a `lifecycle` field on deps objects.

---

## Spec Dependency Chain (batch)

```
core:transition-checks ──► GetStatus (hop predicates + evaluateLifecycle)
                       ──► TransitionChange (fail-fast protocol.edge + evaluateLifecycle)
                       ──► ValidateArtifacts / GetArtifactInstruction (DAG only: empty checksByTarget)

core:lifecycle-engine ──► evaluateLifecycleVerdict / projectArtifacts (all four conceptually)
                      ──► evaluateLifecycle (GetStatus, TransitionChange) = verdict + guidance

core:composition-resolver ──► all four factories

core:count-tasks ──► inside workflow.taskCompletion (GetStatus / TransitionChange), not UC ctor
```

Contradiction to resolve in the change artifacts: **verify.md ValidateArtifacts “constructed with LifecycleEngine”** vs **spec.md + all four factories + working tree**.

---

## Summary counts

| Spec                            |                            Requirements (spec.md headings) | Implemented (code vs spec.md intent) |     Partial | Missing in code |                                            Discrepancies | Missing tests (material) |
| ------------------------------- | ---------------------------------------------------------: | -----------------------------------: | ----------: | --------------: | -------------------------------------------------------: | -----------------------: |
| `core:get-status`               |                                                         17 |                          17 (wiring) |           0 |               0 |                                                        4 |                        3 |
| `core:transition-change`        |                                                         25 |                          25 (wiring) |           0 |               0 |                                                        2 |                        2 |
| `core:validate-artifacts`       | 24+ (DAG/factory subset audited in depth; rest same class) |          DAG/factory **implemented** | 0 for focus |     0 for focus |                                                        2 |                        3 |
| `core:get-artifact-instruction` |                                                         10 |                                   10 |           0 |               0 |                                                1 wording |                        3 |
| **Batch**                       |                                                          — |         Focus items **pass in code** |           — |               — | **9** (mostly `spec-wrong` / stale verify / stale tests) |                   **11** |

| Kind         |                                                                                                                                Count |
| ------------ | -----------------------------------------------------------------------------------------------------------------------------------: |
| `spec-wrong` | 6 (LifecycleEngine leftover in GetStatus/TransitionChange/GAI verify; ValidateArtifacts verify ctor; GetStatus GS-16 vs Constraints) |
| `code-wrong` |                                                      2 (composition tests extra `lifecycle` property × GetStatus + TransitionChange) |
| `both`       |                                                                                              1 (drafted `schemaInfo` on schema miss) |

**createEvaluateLifecycle:** not present in graph or source. Current spec.md factory sections do **not** require it (prior 20260828 audit is outdated vs this preview).

**Overall:** Implementation of the four use cases and four `resolve*Deps` helpers matches the **updated spec.md constructor/factory/DAG rules**. Highest-severity remaining issue is **VerifyArtifacts verify.md still requiring a `LifecycleEngine` constructor dependency**, which would fail a literal verify run and contradicts the same change’s spec.md. GetStatus/TransitionChange code correctly import `evaluateLifecycle`; DAG UCs correctly call `evaluateLifecycleVerdict` with `checksByTarget: {}`. CLI `--next` is a pass-through to Core `HAPPY_PATH_NEXT`.
