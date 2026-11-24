# Partial Audit: lifecycle-core

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-155309`  
**Graph:** indexed `2026-08-29T13:53:32Z`, fresh  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified

---

## Specs Audited

- `core:lifecycle-engine`
- `core:transition-checks`
- `core:change`
- `core:workflow-model`
- `core:schema-format`
- `core:storage` (lifecycle-intersection: dependency cascade, load-time sanitize, drift ownership)
- Cross-check: `default:_global/architecture`, `default:_global/logging` (preview)

---

## Per-Spec Findings

### `core:lifecycle-engine`

#### Requirements Summary

| ID    | Requirement                         | Essence                                                                                                    |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `lifecycle-verdict.ts`; no `LifecycleEngine` class; domain `nextHop` without `command`. |
| LE-2  | Centralized validation logic        | Project caller-supplied `CheckResult`s only; no I/O, no effects, no snapshot-bag fallback.                 |
| LE-3  | Effective artifact status           | Review/incomplete upstream mapping; parent-review wins over in-progress.                                   |
| LE-4  | Canonical-state-only                | No extra lifecycle states from display drift projections.                                                  |
| LE-5  | Machine-readable blockers           | Standard codes; skippable bypass omits blockers; no `warnings` field.                                      |
| LE-6  | Available steps and domain next hop | Single predicate evaluation; `blockingArtifacts` from check `details` when checks present.                 |
| LE-7  | Archiving escape transitions        | `archiving` exposes `archivable`/`designing`; recovery skips requires.                                     |
| LE-8  | Review summary integration          | Historical overlap → review reason, not `OVERLAP_CONFLICT` blocker.                                        |
| LE-9  | Shared lifecycle interpretation     | Consumers share verdict; `CompileContext` excluded; empty `checksByTarget` still yields DAG answers.       |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command`.                                                         |
| LE-11 | Next artifact topological order     | `topologicalOrder()` + `parentsOf()` dependency readiness.                                                 |
| LE-12 | No LifecycleEngine class            | Compatibility barrel re-exports domain functions only.                                                     |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                                                                                                                         |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1      | **Implemented** | `evaluateLifecycleVerdict` plain function (`lifecycle-verdict.ts:142`). No `LifecycleEngine` class in src/dist. `public-api.spec.ts` asserts absence. Domain `nextHop` fields: `targetStep`/`actionType`/`reason` (`99-103`).    |
| LE-2      | **Implemented** | Filters `availableTransitions` from `checksByTarget` outcomes (`159-172`). No `PredicateSnapshots` / `check.run` fallback.                                                                                                       |
| LE-3      | **Implemented** | `effectiveStatus` (`353-411`) with review-wins logic (`395-407`). Tests cover chains, parent-review, mixed upstream.                                                                                                             |
| LE-4      | **Implemented** | Uses canonical `artifact.status` only in projection.                                                                                                                                                                             |
| LE-5      | **Implemented** | `blockersFromFailedChecks` maps codes; bypass filtering at `815-817`.                                                                                                                                                            |
| LE-6      | **Implemented** | `blockingArtifactIds` (`752-768`): when `evaluationChecks` defined, reads failed `workflow.requires` `details.artifactId`; `availableSteps.blockingArtifacts` uses this (`177`). Test: `blockingArtifacts follow check details`. |
| LE-7–LE-8 | **Implemented** | Archiving skip at `217-218`; overlap review hop tests present.                                                                                                                                                                   |
| LE-9      | **Implemented** | `validate-artifacts.ts:220-221` calls with `checksByTarget: {}`. Spies in get-artifact-instruction / validate-artifacts specs.                                                                                                   |
| LE-10     | **Implemented** | `lifecycle-evaluation.ts` attaches `nextAction` via guidance.                                                                                                                                                                    |
| LE-11     | **Implemented** | `nextArtifact` uses `topologicalOrder()` + `parentsOf()` (`774-788`).                                                                                                                                                            |
| LE-12     | **Implemented** | `lifecycle-engine.ts` re-export barrel only; domain `index` exports from `lifecycle-verdict.js`.                                                                                                                                 |

#### Discrepancies

| Sev | ID  | Finding                                                                                                    | Evidence                                                                        | Interpretation                                                                                                                                                                                                                                                                            |
| --- | --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOW | L1  | `transitionBlockers` falls back to independent `requires` walk when `checksByTarget[transition]` is absent | `lifecycle-verdict.ts:227-230` calls `blockingArtifactIds(..., undefined, ...)` | **Both acceptable:** Spec LE-6 governs `availableSteps.blockingArtifacts` when checks are present; empty-check callers (e.g. `ValidateArtifacts`) need a DAG-only fallback. **Or spec gap:** if `transitionBlockers` must always mirror predicate results, spec should say so explicitly. |
| LOW | L2  | Test file named `lifecycle-engine.spec.ts`                                                                 | `packages/core/test/domain/services/lifecycle-engine.spec.ts`                   | **code-wrong (cosmetic):** rename to `lifecycle-verdict.spec.ts` for clarity; not a class violation.                                                                                                                                                                                      |
| LOW | L3  | Verify delta selector still targets heading “Available steps and next action”                              | `deltas/core/lifecycle-engine/verify.md.delta.yaml:54,239`                      | **spec-wrong (cosmetic):** selector should match renamed requirement “domain next hop”. Body already uses `targetStep`.                                                                                                                                                                   |

#### Test Coverage

| Requirement / scenario                | Tests                                                                       | Adequacy                              |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| No LifecycleEngine class              | `public-api.spec.ts`                                                        | Adequate                              |
| nextHop without command               | `lifecycle-engine.spec.ts` `describe('evaluateLifecycleVerdict')`           | Adequate                              |
| Effective status / parent-review      | Multiple lifecycle-engine tests + `findBlockingParent`                      | Adequate                              |
| Mixed review + incomplete parents     | `given mixed review and incomplete parents…then parent-review wins`         | Adequate                              |
| blockingArtifacts from check details  | `blockingArtifacts follow check details`                                    | Adequate                              |
| Archiving escape / transitionBlockers | `exposes archiving escape transitions without archivable requires blockers` | Adequate                              |
| nextAction.command                    | `describe('evaluateLifecycle')` cases                                       | Adequate (cross-layer file)           |
| nextArtifact DAG order                | Tests at lines ~368, ~516                                                   | Adequate; no explicit `parentsOf` spy |

**Gaps:** no automated test that domain modules never import `application/logger`; no explicit test that `nextArtifact` calls `parentsOf` (implementation verified by read).

---

### `core:transition-checks`

#### Requirements Summary

| ID   | Requirement               | Essence                                                                                     |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------- |
| TC-1 | Check identity and result | Stable ids, gerund labels, pass/fail/skip, codes on fail.                                   |
| TC-2 | Check ABI                 | `Check`, `WorkflowCheck`, `create()` factories; self-sufficient `execute`; no snapshot bag. |
| TC-3 | Applicability             | Registry bindings with `from`/`to`/`along`; axis splice via `AXIS_FALLBACK`.                |
| TC-4 | Archive operation         | Operation `archive`, not fake edge.                                                         |
| TC-5 | Predicate vs effect       | Predicates → `allowed`; effects by binding `phase`/`onFailure`.                             |
| TC-6 | Evaluation                | No approval routing rewrite; protocol fail-fast on execute.                                 |
| TC-7 | Registry bindings         | Impl checks on forward exit-implementing; approvals on delivery edges.                      |
| TC-8 | Projections               | `availableTransitions` / `nextAction` from same evaluation.                                 |
| TC-9 | Progress bus              | `check-start` / `check-done` / `check-progress` events.                                     |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                      |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TC-1      | **Implemented** | `CHECK_LABELS` gerund map (`transition-checks.ts:42-57`); `CheckResult` shape.                                                |
| TC-2      | **Implemented** | `WorkflowCheck` class (`workflow-check.ts:17`); no `PredicateSnapshots` export (test at `transition-checks.spec.ts:384-388`). |
| TC-3      | **Implemented** | `classifyAlong` tests including recovery, omitted `implementing`, redesign (`transition-checks.spec.ts`).                     |
| TC-4–TC-5 | **Implemented** | Archive bindings in composition tests; effect phase tests in archive-change specs (sibling batch).                            |
| TC-6–TC-8 | **Implemented** | `executeChecksByLegalTargets` + `GetStatus` integration; approval stays in `ready`.                                           |
| TC-9      | **Implemented** | `execute-check-with-progress.spec.ts` (sibling).                                                                              |

#### Discrepancies

_None above LOW._

#### Test Coverage

| Area                             | Tests                                                            | Adequacy |
| -------------------------------- | ---------------------------------------------------------------- | -------- |
| `classifyAlong` / axis           | `transition-checks.spec.ts`                                      | Adequate |
| No snapshot bag                  | Export negative test                                             | Adequate |
| Binding matching (impl/approval) | `execute-matching-predicates.spec.ts`, composition registry spec | Adequate |
| Progress bus scenarios           | `execute-check-with-progress.spec.ts`                            | Adequate |

---

### `core:change`

#### Requirements Summary

| ID   | Requirement                   | Essence                                                                                                   |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| CH-1 | Lifecycle / VALID_TRANSITIONS | Protocol table; entity owns persisted state.                                                              |
| CH-2 | Artifacts                     | `pending-parent-artifact-review` is **verdict-derived**; not persistable; wire sanitize to `in-progress`. |
| CH-3 | Guidance ownership            | Domain `nextHop`; application attaches `command`.                                                         |
| CH-4 | assertArchivable              | Entity asserts `archivable` or `archiving`.                                                               |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                                                                                                                      |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CH-1 | **Implemented** | `VALID_TRANSITIONS` in change entity; transition validity tests.                                                                                                                                                              |
| CH-2 | **Implemented** | Delta uses “verdict-derived” (`change/spec.md.delta.yaml:181,202`). `ArtifactFile` rejects token (`artifact-file.ts:52-55`). Load/save sanitize (`change-repository.ts:1700-1701`; test `change-repository.spec.ts:664-692`). |
| CH-3 | **Implemented** | Separation in lifecycle-evaluation layer.                                                                                                                                                                                     |
| CH-4 | **Implemented** | `assertArchivable` JSDoc covers archivable or archiving.                                                                                                                                                                      |

#### Discrepancies

| Sev | ID  | Finding                                                               | Evidence                                                       | Interpretation                                                                                  |
| --- | --- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| LOW | L4  | GAI verify delta scenario title still says “engine-derived readiness” | `deltas/core/get-artifact-instruction/verify.md.delta.yaml:93` | **spec-wrong:** rename selector/title to “verdict-derived readiness” for consistency with CH-2. |

#### Test Coverage

| Requirement                     | Tests                                                             | Adequacy |
| ------------------------------- | ----------------------------------------------------------------- | -------- |
| Verdict-derived not persistable | `artifact-file` constructor test; change-repository wire sanitize | Adequate |
| assertArchivable                | Entity tests in `change.spec.ts`                                  | Adequate |

---

### `core:workflow-model`

#### Requirements Summary

| ID   | Requirement                | Essence                                                                   |
| ---- | -------------------------- | ------------------------------------------------------------------------- |
| WM-1 | Step names = ChangeState   | `workflow[]` extras only; omit does not delete protocol.                  |
| WM-2 | Requires / task completion | Shared `workflow.requires` / `workflow.taskCompletion` checks.            |
| WM-3 | Step availability          | From `evaluateLifecycleVerdict`; `CompileContext` must not evaluate hops. |
| WM-4 | Progress axis              | Same `along` classification as transition-checks.                         |

#### Implementation Status

All **Implemented**. Availability flows through verdict projections; task completion delegated to `CountTasks` inside check execute; compile-context exclusion verified in composition spec.

#### Discrepancies

_None._

#### Test Coverage

Requires/task-completion scenarios covered in workflow-requires specs, transition-change composition tests, and lifecycle projection tests. Adequate for this batch.

---

### `core:schema-format`

#### Requirements Summary

| ID   | Requirement               | Essence                                                                  |
| ---- | ------------------------- | ------------------------------------------------------------------------ |
| SF-1 | Artifact requires cascade | Feeds `projectArtifacts`; no `Change.effectiveStatus()`.                 |
| SF-2 | Schema artifact DAG API   | `artifactDag()` with `parentsOf`, `topologicalOrder`, etc.               |
| SF-3 | Canonical DAG derivation  | Next-artifact and upstream walks use `parentsOf` + `topologicalOrder()`. |

#### Implementation Status

| Req  | Status          | Evidence                                                                                                                               |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SF-1 | **Implemented** | Cascade in `projectArtifacts`; no `Change.effectiveStatus()` (grep: 0 matches).                                                        |
| SF-2 | **Implemented** | `ArtifactDag.parentsOf` (`artifact-dag.ts:140-142`); tests in `artifact-dag.spec.ts`.                                                  |
| SF-3 | **Implemented** | `requiresForArtifact` uses `parentsOf` when in schema (`lifecycle-verdict.ts:1010-1018`); `nextArtifact` uses `parentsOf` (`785-788`). |

#### Discrepancies

_None._

#### Test Coverage

`artifact-dag.spec.ts` covers `parentsOf` and topological order. Lifecycle tests cover next-artifact behavior. Adequate.

---

### `core:storage` (lifecycle intersection)

#### Requirements Summary

| ID   | Requirement                 | Essence                                                             |
| ---- | --------------------------- | ------------------------------------------------------------------- |
| ST-1 | Artifact dependency cascade | Owned by `projectArtifacts`; no entity method.                      |
| ST-2 | Load-time file status       | Hash-derived; drift at load via repository.                         |
| ST-3 | Legacy sanitize             | Wire `pending-parent-artifact-review` → `in-progress` on load/save. |
| ST-4 | ValidateArtifacts ownership | Baseline drift not repeated in validate use case.                   |

#### Implementation Status

| Req       | Status          | Evidence                                                                                                                |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ST-1      | **Implemented** | Delta aligns with lifecycle-engine (`storage/spec.md.delta.yaml:1-9`).                                                  |
| ST-2–ST-4 | **Implemented** | `change-repository.ts` load drift + `persistableArtifactStatus` (`1694-1701`); validate uses verdict with empty checks. |

#### Discrepancies

_None._

#### Test Coverage

| Requirement                  | Tests                                         | Adequacy           |
| ---------------------------- | --------------------------------------------- | ------------------ |
| Wire sanitize pending-parent | `change-repository.spec.ts:664-692`           | Adequate           |
| Hash derivation              | Multiple change-repository tests              | Adequate           |
| DAG cascade (not repository) | Covered in lifecycle tests, not storage layer | Correct separation |

---

## Cross-Spec Consistency

| Check                                            | Result                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture preview package-agnostic            | **Pass** — no Core symbol names, no `LifecycleEngine` class requirement violated.                                                      |
| Logging ↔ architecture dependency                | **Pass** — logging depends on architecture; architecture `dependsOn: none`.                                                            |
| Change CH-2 ↔ lifecycle LE-3 ↔ storage ST-1/ST-3 | **Pass** — all use “verdict-derived” / `projectArtifacts` vocabulary (prior “engine-derived” wording closed in change delta and code). |
| Workflow-model WM-3 ↔ lifecycle LE-9             | **Pass** — single verdict authority.                                                                                                   |
| Schema-format SF-3 ↔ lifecycle LE-11             | **Pass** — `parentsOf` + `topologicalOrder()` aligned.                                                                                 |
| Transition-checks registry ↔ workflow-model axis | **Pass** — shared `classifyAlong` / `AXIS_FALLBACK`.                                                                                   |
| Residual “engine” in verify selectors            | **Minor drift** — lifecycle verify delta selector (L3), GAI verify scenario title (L4), markdown merge test fixture (L5 below).        |

**L5 (LOW):** `markdown-parser-real-merge.spec.ts:122,148` retains scenario title “engine-derived readiness” in merged fixture text. **spec/test-wrong:** update fixture to “verdict-derived” when touching that merge test.

---

## Prior Audit Context (20260829-142635)

| Prior item                               | Status (this audit)     | Notes                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implementation compliant (0 HIGH/MEDIUM) | **Confirmed**           | No new blocking defects.                                                                                                                                                                         |
| Engine wording (LOW)                     | **Mostly CLOSED**       | `artifact-file.ts`, `change-repository.ts`, change delta line 202, `transition-checks.ts:423` JSDoc, transition-checks spec line 50 all fixed. Residual verify selectors + test fixture (L3–L5). |
| `lifecycle-engine.ts` barrel naming      | **OK (intentional)**    | LE-12 requires compatibility barrel.                                                                                                                                                             |
| `transitionBlockers` fallback            | **Still LOW (L1)**      | Intentional for empty-check callers; document or spec-clarify if stricter parity required.                                                                                                       |
| Optional CLI tests                       | **Partially addressed** | New `JSON output includes from and to fields` (`change.spec.ts:680-733`) extends transition JSON coverage beyond prior `outputs json with new state`.                                            |

---

## Summary Counts

| Severity | Count |
| -------- | ----- |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 5     |

| Metric               | Count |
| -------------------- | ----- |
| Requirements checked | 44    |
| Implemented          | 43    |
| Partial              | 1     |
| Missing              | 0     |

**Partial:** naming hygiene only (L2–L5 cosmetic selectors/fixtures; L1 optional spec clarification for `transitionBlockers` fallback).

**Highest-signal residual (≤10 lines):**  
0 HIGH, 0 MEDIUM. Recent fixes verified: verdict-derived wording in change spec + `ArtifactFile` + repository JSDoc; `blockingArtifactIds` drives `availableSteps.blockingArtifacts`; CLI transition JSON test now asserts `from`/`to` on complete event; transition-checks spec uses “check registry” not “engine”. Remaining LOW: cosmetic filenames/selectors (`lifecycle-engine.spec.ts`, verify delta headings, GAI scenario title, markdown merge fixture), plus optional clarification for `transitionBlockers` when `checksByTarget` is absent per transition.
