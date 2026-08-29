# Partial: core lifecycle / transition-checks / get-status / transition-change

> **Verdicts:** this file is evidence. Corrected verdicts (this branch **is** the new engine; the snapshot bag is unfinished work, not a private helper / later change) live in `specs-compliance-change-workflow-transition-checks-20260826-152050.md`.

**Mode:** Specific Change `--change workflow-transition-checks`  
**Assigned specs:** `core:lifecycle-engine`, `core:transition-checks`, `core:get-status`, `core:transition-change`  
**CLI:** `node packages/cli/dist/index.js` (merged via `changes spec-preview`)  
**Graph:** `stale: false` (`lastIndexedAt` 2026-08-26T13:21:13Z)  
**Read-only:** yes — no spec or source edits

**Primary implementation surfaces (graph):**

| Symbol                                     | File                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `LifecycleEngine`                          | `packages/core/src/domain/services/lifecycle-engine.ts`               |
| `evaluateTransitionPredicates`             | `packages/core/src/domain/services/evaluate-transition-predicates.ts` |
| `TRANSITION_BINDINGS` / `ARCHIVE_BINDINGS` | `packages/core/src/domain/services/check-bindings.ts`                 |
| `createWorkflowCheckRegistry`              | `packages/core/src/application/checks/workflow-check-registry.ts`     |
| `GetStatus`                                | `packages/core/src/application/use-cases/get-status.ts`               |
| `TransitionChange`                         | `packages/core/src/application/use-cases/transition-change.ts`        |
| `WorkflowCheck`                            | `packages/core/src/application/checks/workflow-check.ts`              |
| `PredicateSnapshots`                       | `packages/core/src/domain/services/transition-checks.ts`              |

Globals checked: `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`.

---

## core:lifecycle-engine

### Requirements Summary

- Sole authority for workflow interpretation; project **predicates only** from `CheckResult`s; no `run:` effects; no global snapshot bag; no engine I/O.
- Effective artifact status via mapping rules + recursive parent-review; public API centered on `evaluate` (no separate public `computeEffectiveStatus`).
- Canonical states only (`complete-with-drift` / `hasDrift` are display-only).
- Machine-readable blockers with mandatory codes including `MISSING_ARTIFACT`, `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`; skippable bypasses honored.
- `validTransitions` / `availableTransitions` / `nextAction` from **one** predicate evaluation of candidate edges; no approval rewrite of requested target; impl checks only on **forward** exit-`implementing`.
- Happy-path `nextAction` matrix (design/ready/implement/verify/done/archivable/archiving).
- `archiving → archivable` is `along = recovery`; skip `requires` / taskCompletion.
- Shared consumers (`GetStatus`, `TransitionChange`, `ValidateArtifacts`, `GetArtifactInstruction`, `CompileContext`) must not reimplement DAG interpretation; `GetStatus` / `TransitionChange` must not re-walk requires after a green predicate `execute`.
- Next artifact from `schema.artifactDag().topologicalOrder()`.

### Implementation Status

| Requirement                               | Status                               | Evidence                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predicate projection via `checksByTarget` | Partial                              | `evaluate` prefers injected `CheckResult`s; if missing, falls back to `evaluateTransitionPredicates` + `PredicateSnapshots` (`lifecycle-engine.ts` ~151–177).                                                                                                                             |
| No engine I/O                             | Compliant when callers inject checks | Domain fallback still runs `check.run` against snapshots, not `execute`.                                                                                                                                                                                                                  |
| Effective status mapping + recursion      | Compliant                            | `_effectiveStatus` / `_findBlockingParent`.                                                                                                                                                                                                                                               |
| Canonical-state-only                      | Compliant                            | Uses persisted `artifact.status`, not `displayStatus`.                                                                                                                                                                                                                                    |
| Blocker codes + file grouping             | Partial                              | `_artifactBlockers` / `_reviewBlockers` / `_blockersFromFailedChecks`; `IMPLEMENTATION_STATE` skippable only for `impl.linksInScope`.                                                                                                                                                     |
| No approval rewrite                       | Compliant                            | `_resolveTarget` returns requested target.                                                                                                                                                                                                                                                |
| Availability from checks                  | Partial                              | `availableTransitions` from check fail/pass; `availableSteps` still re-derives `blockingArtifacts` from DAG walk (`~180–212`). `_requestedTargetBlockers` **re-walks** `workflowStep.requires` even when `requestedChecks` exist (`~611–620`).                                            |
| Happy-path nextAction                     | Mostly compliant                     | `_nextAction` matches matrix for designing/implementing/verifying/done/archivable. Approval hops read `change.activeSpecApproval` / `activeSignoff` rather than check outcomes (`~829–837`, `909–920`). Archiving uses `commitStarted` only (`~947–963`), not “restore did not complete”. |
| Recovery skips requires                   | Compliant                            | Bindings `exceptAlong: ['recovery']`; `transitionBlockers` skip `archiving → archivable`.                                                                                                                                                                                                 |
| Next artifact DAG order                   | Compliant                            | `_nextArtifact` uses `schema.artifactDag().topologicalOrder()`.                                                                                                                                                                                                                           |
| Shared consumers                          | Partial                              | GetStatus/TransitionChange call `evaluate`; `ValidateArtifacts` and `GetArtifactInstruction` still call `gatherPredicateSnapshots`.                                                                                                                                                       |
| No public computeEffectiveStatus          | Gap                                  | Public `projectArtifacts(...)` is the same idea; GetStatus and TransitionChange call it **before** `evaluate`.                                                                                                                                                                            |

### Discrepancies

#### LE-1 — HIGH — Snapshot bag + domain `run` fallback remain on `LifecycleEngine`

- **Spec:** Engine MUST project from `CheckResult`s; MUST NOT take a global snapshot bag; matching checks perform I/O in `execute`.
- **Code:** `LifecycleEngineOptions.snapshots?: PredicateSnapshots`; missing `checksByTarget[target]` still calls `evaluateTransitionPredicates({ snapshots, ... })` which invokes `binding.check.run(runInput)`.
- **Tests:** `lifecycle-engine.spec.ts` still injects `emptyPredicateSnapshots()` as the default evaluate helper.
- **Interpretation (corrected):** Unfinished engine of **this** change. Delete snapshot evaluate from the engine. Do not keep a test-only bag ABI. Domain `run` takes that check’s facts only.

#### LE-2 — HIGH — Engine still independently re-walks `requires` for blockers / step readiness

- **Spec:** Unify validation into one transition-attempt evaluation; GetStatus/TransitionChange MUST NOT re-walk requires after green `execute`. Engine should project `isReady` from `workflow.requires` check results.
- **Code:** `availableSteps` computes `blockingArtifacts` from effective statuses regardless of checks; `_requestedTargetBlockers` appends `_artifactBlockers` for every `workflowStep.requires` id after `_blockersFromFailedChecks`.
- **Effect:** Dual algorithms (check `INCOMPLETE_ARTIFACT` vs engine `MISSING_ARTIFACT` / `INCOMPLETE_ARTIFACT` / `PENDING_PARENT_REVIEW`) can disagree on **code** for the same artifact (`workflow-requires.ts` always fails with `INCOMPLETE_ARTIFACT` even when `status === 'missing'`).
- **Interpretation:** Code still has a second status walk. Spec is the intended source of truth for this change; engine should project requires blockers from the failed check (and its `details.status`) only.

#### LE-3 — MEDIUM — Public `projectArtifacts` is a second lifecycle API

- **Spec:** Callers MUST NOT depend on a separate public `computeEffectiveStatus(...)` API; statuses come back from `evaluate`.
- **Code:** `LifecycleEngine.projectArtifacts` is public; `GetStatus._buildActiveResult` and `TransitionChange.execute` call it to fill `effectiveStatusByArtifact` on `CheckExecutionContext` **before** `evaluate`.
- **Interpretation (corrected):** Not the snapshot bag. Spec should **allow** this pure DAG helper (or fold it into the engine as a named pure function) so `workflow.requires` has statuses before `execute`.

#### LE-4 — MEDIUM — `nextAction` still uses parallel if-ladders for approvals and archiving restore

- **Spec:** `nextAction` SHALL be derived only from predicate evaluation plus change-level review blockers. Archiving: recommend designing when latest `archive-failed` has `commitStarted: true` **and batch restore did not complete**.
- **Code:** Ready/done approval branches inspect `change.activeSpecApproval` / `activeSignoff` and constructor `approvals`, not `approval.*` check rows. Archiving branch keys only on `commitStarted` (`ArchiveFailedEvent` has no restore-complete flag).
- **Interpretation:** Usually equivalent for gates; restore condition is under-specified in the entity vs over-specified in the spec. Could be spec drift (no restore field) or incomplete engine logic.

#### LE-5 — MEDIUM — Shared-consumer requirement still broken for validate/instruction

- **Spec:** `ValidateArtifacts` and `GetArtifactInstruction` MUST obtain DAG-aware answers from `LifecycleEngine.evaluate`.
- **Code:** Both still import and await `gatherPredicateSnapshots` (`validate-artifacts.ts`, `get-artifact-instruction.ts`).
- **Interpretation (corrected):** Implement. Same evaluate path as GetStatus/TransitionChange. Gathering snapshots here is the `main` engine, not a side consumer.

#### LE-6 — LOW — Spec vs verify on `isPermitted`

- **Spec text:** `isPermitted` is protocol **plus matching predicates**.
- **Verify:** “Engine unifies three validation dimensions” expects `isPermitted` **true** when artifacts are missing (protocol-only).
- **Code:** Matches verify (`isPermitted` = protocol.edge not fail when checks injected).
- **Interpretation:** Internal spec/verify contradiction. Code follows verify. Fix spec wording.

### Test Coverage

Covered reasonably: recursive parent-review, canonical complete-with-drift, overlap review, next artifact DAG, archiving exposes archivable/designing, recovery skips requires, approval.spec fail, IMPLEMENTATION_STATE skippable split in `_blockersFromFailedChecks`, happy-path nextAction for implementing/verifying/done/archivable.

Gaps: engine-without-snapshots (I/O-free projection only); restore-complete vs `commitStarted`; consumers ValidateArtifacts/GetArtifactInstruction not using evaluate; `MISSING_ARTIFACT` vs check `INCOMPLETE_ARTIFACT` for missing requires.

### Missing Tests

- Evaluate with **only** `checksByTarget` and assert `options.snapshots` unused / `check.run` not called.
- Missing required artifact: blocker **code** from projection equals check code (or spec-mandated `MISSING_ARTIFACT`).
- Archiving nextAction when `commitStarted: true` but restore succeeded (if that state is representable).

---

## core:transition-checks

### Requirements Summary

- Check identity (`id`, gerund `label`, `kind`, `execute`); no `Executing:` prefix; no instruction hooks as checks.
- ABI: `Check` + `WorkflowCheck` + `create*` factories; no snapshot bag / `needs` on the base; applicability on **bindings**.
- One implementation file per check id; `kind` declared on the class.
- `along` classification including `recovery` ≠ `backward`; archive is an operation.
- Effect `phase` / `onFailure` on bindings; execute must not choose slot/fail-soft by `check.id === hook.pre/post`.
- Registry bindings listed (including operation `archive` + `archive.publication`).
- Compact `IMPLEMENTATION_STATE` text; `--allow-out-of-scope` only for `impl.linksInScope`.
- Generic check progress bus; projections from the same evaluation.
- **No** `PredicateSnapshots` / closed `needs` ABI; ids remain open strings.

### Implementation Status

| Requirement                    | Status                  | Evidence                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labels / kinds / factories     | Compliant               | `CHECK_LABELS`; `create*` in `application/checks/*`; `WorkflowCheck`.                                                                                                                                                                                               |
| Bindings `from`/`to`/`along`   | Compliant               | Application registry + domain `check-bindings.ts` (duplicated). Impl `along: forward` only; approval.spec exact edges; recovery exceptAlong on requires/tasks/hook.pre.                                                                                             |
| Archive operation              | Partial                 | `ARCHIVE_BINDINGS` has schema/archivable/overlap/readOnly/deps/impl/hooks. **`archive.publication` is not bound** (comment: stays in ArchiveChange).                                                                                                                |
| Compact impl messages          | Compliant               | `formatOpenTrackedFilesMessage`; tests in `transition-checks.spec.ts`.                                                                                                                                                                                              |
| IMPLEMENTATION_STATE bypass    | Compliant at projection | Engine `_blockersFromFailedChecks` and GetStatus `_mergeBlockers` key off `check.id === 'impl.linksInScope'`.                                                                                                                                                       |
| Progress bus                   | Compliant               | `executeCheckWithProgress`; hook effect maps `RunStepHooks` onto `check-progress`.                                                                                                                                                                                  |
| No snapshot ABI                | **Non-compliant**       | `PredicateSnapshots`, `emptyPredicateSnapshots`, `Check.run`, `CheckRunInput.snapshots`, `gatherPredicateSnapshots`.                                                                                                                                                |
| Open check id ABI              | Partial                 | `CheckId` is a **closed union** of built-in ids.                                                                                                                                                                                                                    |
| No switch on CheckId for hooks | Partial                 | `TransitionChange` skips non-hook effects via `checkId !== 'hook.pre' && checkId !== 'hook.post'`; `shouldExecuteHookEffect` branches on those ids for skip flags; `hookEffectStep` / `executeHookEffect` still take `Extract<CheckId, 'hook.pre' \| 'hook.post'>`. |
| One file per check             | Compliant               | Domain + application pairs; `archive.publication` domain file exists (`domain/checks/archive-publication.ts`) but is not registered.                                                                                                                                |
| Dual binding tables            | Risk                    | Domain `TRANSITION_BINDINGS` vs `createWorkflowCheckRegistry` copy the same rows.                                                                                                                                                                                   |

### Discrepancies

#### TC-1 — HIGH — Forbidden `PredicateSnapshots` ABI is still first-class

- **Spec:** “There SHALL be no ABI type that enumerates all check facts (`PredicateSnapshots` or a closed `needs` union).” Use cases MUST NOT gather a global snapshot.
- **Code:** Exported `PredicateSnapshots` + `emptyPredicateSnapshots` in `transition-checks.ts`; `gatherPredicateSnapshots()` still implemented and used by other use cases; every application `execute` rebuilds a snapshot and calls domain `run`.
- **Tests:** Domain specs still drive evaluation through snapshots.
- **Interpretation (corrected):** Unfinished engine of **this** change. The bag must not exist (public or private). Domain `run` takes only that check’s facts. Application `execute` does I/O and calls that `run`. Delete `gatherPredicateSnapshots`.

#### TC-2 — HIGH — `archive.publication` not in the archive binding table

- **Spec:** Operation `archive` SHALL register `archive.publication` (remaining publication preflight).
- **Code:** `ARCHIVE_BINDINGS` / `createWorkflowCheckRegistry` archive list omit it; `evaluateArchivePredicates` comment: “Publication stays in ArchiveChange.” No `createArchivePublication` usage in registry.
- **Interpretation (corrected):** Spec-vs-spec in this change, not an implementation HIGH. `core:archive-change` / proposal: publication stays in the use case (merge/publish). Delta `transition-checks` to drop the binding SHALL. Do not treat an unbound `archive-publication.ts` as missing engine work.

#### TC-3 — HIGH — Effect execution still hardcodes `hook.pre` / `hook.post` ids

- **Spec:** Use case MUST iterate matching bindings for the slot; MUST NOT hardcode those ids to decide timing, failure policy, or to launch hooks. Failure policy comes from `phase` / `onFailure`.
- **Code:** Timing/failure on bindings is correct. `TransitionChange.execute` then **filters** matching effects to only those two ids before `_executeEffect`. `shouldExecuteHookEffect` uses `binding.check.id === 'hook.pre'|'hook.post'` for skipHookPhases. `executeHookEffect` (legacy helper) still maps id → RunStepHooks phase.
- **Interpretation (corrected):** Implement. Iterate matching effects by `phase` / `onFailure`. Do not allowlist `hook.pre`/`hook.post` to launch or skip. The spec does not over-claim.

#### TC-4 — MEDIUM — Closed `CheckId` union vs “ABI MUST remain open”

- **Spec:** Check ids are stable strings; ABI open for later plugins.
- **Code:** `type CheckId = 'protocol.edge' | ... | 'hook.post'`.
- **Interpretation (corrected):** Spec. v1 built-in union. Plugins are out of this change.

#### TC-5 — MEDIUM — Duplicated binding tables (domain vs application)

- **Spec:** Engine declares applicability once.
- **Code:** `check-bindings.ts` and `workflow-check-registry.ts` independently list the same triples.
- **Interpretation:** Drift hazard (already the source of “publication stays in ArchiveChange” comments in one file only). Should be one table.

#### TC-6 — LOW vs architecture — Domain `Check` objects still carry I/O-shaped `execute` via `executeWithHostSnapshots`

- Domain check modules (`domain/checks/*.ts`) export `execute` that expects host snapshots. Architecture: domain layer is pure / no I/O.
- **Interpretation (corrected):** Implement. Domain is `run(facts of this check)` only. Application `create*` owns `execute`. Stubs plus engine `run` fallback are the bag path. Not “acceptable if unused by use cases.”

### Test Coverage

Strong: along classification (redesign vs recovery vs forward), impl not matching enter-verifying or redesign, compact messages, labels, factory ABI, approval.spec not matching `ready → designing`, skip-hooks still runs predicates (transition-change tests), progress bus.

Gaps: no `PredicateSnapshots` type (must become a compile/lint absence); iterating effects by phase not hook ids; one binding table. `archive.publication` in the registry is **not** a gap if publication stays in ArchiveChange (spec delta).

### Missing Tests

- Absence of `PredicateSnapshots` / `gatherPredicateSnapshots` (currently the opposite is tested).
- TransitionChange runs **every** matching effect for the persist slot, selected by `phase`, not hook ids.
- One binding table (domain vs registry must not drift).

---

## core:get-status

### Requirements Summary

- Input: `name`, optional refresh flag, optional `ifModifiedSince`.
- Result: change xor draftView, artifactStatuses, specDependsOn, review, blockers, nextAction, lifecycle context, implementation tracking, unchanged short-circuit.
- Draft: no mutable Change; empty `availableTransitions`; no mutation commands.
- Task counts from `workflow.taskCompletion` / CountTasks **inside that check**; MUST NOT call CountTasks a second time after evaluate; MUST NOT take CountTasks as a global gatherer on GetStatus.
- Execute matching predicates then project; engine I/O-free.
- Constructor: repo, schema, lifecycle, approvals, refresh, composed `create*` checks — **not** CountTasks as a sibling snapshot gatherer.
- Blockers include review codes **and** failed predicates (`INCOMPLETE_TASKS`, `INCOMPLETE_ARTIFACT`, `APPROVAL_REQUIRED`, `INVALID_TRANSITION`, archive codes); IMPLEMENTATION_STATE bypass only for `impl.linksInScope`; failed-check blockers include `label`/`checkId`.
- Schema failure degrades lifecycle fields without throwing.
- Factory via `resolveGetStatusDeps`.

### Implementation Status

| Requirement                                     | Status                     | Evidence                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name / get then getDraft / no getDiscarded      | Compliant                  | `execute`; ChangeNotFoundError.                                                                                                                                                                                                                                                                                                    |
| ifModifiedSince short-circuit                   | Compliant                  | `_buildUnchangedResult`; no refresh.                                                                                                                                                                                                                                                                                               |
| Draft empty transitions                         | Compliant                  | `_buildDraftedResult`.                                                                                                                                                                                                                                                                                                             |
| Draft DAG effective status                      | Gap                        | Uses persisted `artifact.status`, not `LifecycleEngine`.                                                                                                                                                                                                                                                                           |
| Refresh default                                 | Compliant                  | Refresh unless `false` or unchanged.                                                                                                                                                                                                                                                                                               |
| Display status / hasDrift                       | Compliant                  | File `displayStatus()` + `aggregateDisplayStatus`.                                                                                                                                                                                                                                                                                 |
| Predicate execute then evaluate                 | Compliant                  | Loop `VALID_TRANSITIONS` → `executeMatchingPredicates` → `evaluate({ checksByTarget })`.                                                                                                                                                                                                                                           |
| TaskCompletion from check, no second CountTasks | **Non-compliant**          | After evaluate, `_countTasks.execute({ change })` paints artifacts (`get-status.ts` ~423–428). Constructor **requires** `countTasks`. `resolveGetStatusDeps` still creates a **second** `CountTasks` instance besides the one inside `createWorkflowTaskCompletion`.                                                               |
| Blockers from failed predicates                 | **Partial**                | `_mergeBlockers` only copies codes in `PREDICATE_BLOCKER_CODES` (`DEPS_INCONSISTENT`, `READ_ONLY_WORKSPACE`, `IMPLEMENTATION_STATE`, `INCOMPLETE_TASKS`). Drops `APPROVAL_REQUIRED`, `INCOMPLETE_ARTIFACT`, `INVALID_TRANSITION`. `evaluate` is called **without** `requestedTarget`, so engine `verdict.blockers` is review-only. |
| IMPLEMENTATION_STATE bypass split               | Compliant                  | `check.id === 'impl.linksInScope'`.                                                                                                                                                                                                                                                                                                |
| Gerund label on predicate blockers              | Compliant for merged codes | label + checkId set.                                                                                                                                                                                                                                                                                                               |
| Schema degrade                                  | Over-broad                 | `try/catch` wraps **all** of schema + predicate execute + CountTasks + evaluate (`~362–465`). Any throw (check I/O, CountTasks) is swallowed like SchemaNotFoundError.                                                                                                                                                             |
| Factory resolveGetStatusDeps                    | Partial                    | Delegates through resolver but still resolves `countTasks` onto GetStatus.                                                                                                                                                                                                                                                         |
| Artifact list vs schema                         | Tension                    | Iterates `schema.artifacts()`, not only `change.artifacts` (conflicts with “MUST NOT include entries for artifacts that do not exist on the change”).                                                                                                                                                                              |

### Discrepancies

#### GS-1 — HIGH — Second `CountTasks` after `evaluate` (spec forbids this)

- **Spec:** Paint `taskCompletion` from the check result / the CountTasks outcome **that check already produced**. MUST NOT invoke CountTasks a second time. MUST NOT call engine first then CountTasks only for painting. Constructor MUST NOT treat CountTasks as a GetStatus gatherer.
- **Code:** `new GetStatus(..., countTasks, transitionBindings)` then `await this._countTasks.execute({ change })` after `lifecycle.evaluate`. Registry checks already called CountTasks inside `workflow.taskCompletion.execute` for every protocol-legal target (and skip when unmatched).
- **Tests:** `delegates task projection to CountTasks for artifact painting` **locks the forbidden design**. `gathers CountTasks before LifecycleEngine.evaluate` no longer even asserts order (`get-status.spec.ts` ~365–412).
- **Interpretation:** Implementation bug relative to this change’s spec. Tests encode the old gather model. Prefer mapping `taskCompletion` from `workflow.taskCompletion` details / cached CountTasks on the check instance.

#### GS-2 — HIGH — Public `blockers` omit requires and approval failures

- **Spec:** Identify MISSING_ARTIFACT for current-step requires; merge failed predicates including `INCOMPLETE_ARTIFACT` and `APPROVAL_REQUIRED`.
- **Code:** No `requestedTarget` on evaluate ⇒ no `_requestedTargetBlockers`. Merge whitelist skips those codes. `get-status.spec.ts` has **zero** assertions on `MISSING_ARTIFACT` / `INCOMPLETE_ARTIFACT` in `result.blockers`.
- **Interpretation:** Agents can see `availableTransitions` omit `ready`/`implementing` while `blockers` stays empty except review/impl/tasks/deps. Spec is right for “machine-readable blockers”; code under-reports. Alternative: spec should say blockers are only current-nextAction hop — still not implemented that way.

#### GS-3 — MEDIUM — Broad try/catch degrades more than schema failure

- **Spec:** Wrap `SchemaProvider.get()`; MUST NOT throw when **schema resolution** fails.
- **Code:** Catch-all around predicate I/O and evaluate.
- **Interpretation:** Implementation too defensive vs spec; hides check failures. Could be intentional UX; then spec should say “any evaluation error degrades”.

#### GS-4 — MEDIUM — Drafted status skips LifecycleEngine

- **Spec:** MAY use an internal Change to compute effective statuses; result MUST still be DAG-aware inspection.
- **Code:** `effectiveStatus: artifact.status` only.
- **Interpretation:** Spec vs incomplete draft path. Parent-review cascade will not show for drafts.

#### GS-5 — LOW — Internal spec contradiction on artifact cardinality

- One requirement: one entry per artifact **attached to the change** / artifact map only.
- Another: schema-driven derivation for every schema artifact type (code follows schema list, including `missing` placeholders).
- **Interpretation:** Spec cleanup; code matches the schema-driven requirement used by verify “effective status for every artifact”.

### Test Coverage

Covered: not-found, refresh default, unchanged short-circuit, incomplete tasks hide verifying, impl bypass split + labels, deps.consistent hides ready, check rows on result, schema degrade fields, overlap review scenarios, factory wiring (including countTasks).

**Tests that contradict the merged spec:** painting via GetStatus-owned CountTasks; order test name leftover.

### Missing Tests

- `result.blockers` contains `APPROVAL_REQUIRED` when spec gate on and no approval (ready).
- `result.blockers` contains `INCOMPLETE_ARTIFACT` or `MISSING_ARTIFACT` when designing and a required artifact is missing.
- `taskCompletion` mapped from check details with CountTasks `execute` call count === 1 for the whole GetStatus (including nested check).
- Draft parent-review cascade.
- Predicate throw is **not** swallowed (or spec updated).

---

## core:transition-change

### Requirements Summary

- Input: `name`, `to`, optional `skipHookPhases`, `refreshImplementationTrackingBefore`; no per-call approval flags; `allowOutOfScope` appears in code (not in merged input-contract list — extra field).
- Approval as checks, not pending hops; gates baked at construction.
- Matching predicates then map first failure to typed errors; no second requires walk; no second CountTasks after green execute.
- Redesign invalidation; skill-hop signoff invalidate without mass artifact downgrade; recovery `archiving → archivable` skips archivable requires and archiving.post.
- Effects via check `execute`; post before persist; skipHookPhases; progress bus + legacy `requires-check` / `transitioned`.
- Persist via `mutate`.
- Constructor/factory: listed deps include `RunStepHooks` and `lifecycle` in merged spec.

### Implementation Status

| Requirement                      | Status                         | Evidence                                                                                                                                                   |
| -------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input / baked approvals          | Compliant                      | `TransitionChangeInput`; `this._approvals`. Extra: `allowOutOfScope`.                                                                                      |
| Refresh default                  | Compliant                      | Unless `false`.                                                                                                                                            |
| No pending rewrite               | Compliant                      | `effectiveTarget = requestedTarget`. Drain-only pending via `_assertDrainAndGateTargets`.                                                                  |
| Predicate execute + map failure  | Compliant                      | `executeMatchingPredicates` failFast; `_mapFailedPredicate` switch on `failed.id`.                                                                         |
| No second CountTasks after green | Compliant for TransitionChange | No direct CountTasks; check owns it. Test `does not CountTasks a second time after a green evaluate`.                                                      |
| Redesign invalidate              | Compliant                      | `invalidate` inside `mutate` when entering designing from non-drafting/designing.                                                                          |
| Skill hop                        | Compliant                      | `invalidateSignoff`; hook.post not bound on backward.                                                                                                      |
| Recovery                         | Compliant                      | exceptAlong recovery; hook.post along forward only.                                                                                                        |
| Effects                          | Partial                        | Binding phase used; then id filter (TC-3). `_executeEffect` calls `check.execute`.                                                                         |
| skipHookPhases                   | Compliant via id mapping       | `shouldExecuteHookEffect` + skip sets.                                                                                                                     |
| Progress                         | Compliant                      | check-start/done plus requires-check / task-completion-failed / transitioned.                                                                              |
| mutate persist                   | Compliant                      |                                                                                                                                                            |
| Constructor RunStepHooks         | **Spec vs code**               | Class takes `transitionBindings`, not `RunStepHooks`. `resolveTransitionChangeDeps` matches **code**, not merged spec list (`runStepHooks: RunStepHooks`). |
| projectArtifacts before evaluate | Same as LE-3                   |                                                                                                                                                            |

### Discrepancies

#### TR-1 — HIGH — Merged TransitionChange constructor/factory spec still requires `RunStepHooks` on the use case

- **Spec (Dependencies + resolveTransitionChangeDeps):** MUST receive `RunStepHooks`; factory resolves `runStepHooks`.
- **Spec (transition-checks):** MUST NOT launch `RunStepHooks` except by matching effect `execute`; MUST NOT switch on CheckId to launch hooks.
- **Code / composition:** `TransitionChangeDeps` has `transitionBindings` only; hooks are composed in `createHookPre`/`createHookPost`.
- **Verify:** Still says `RunStepHooks.execute` is called with `{ step, phase }` (can pass **through** the effect).
- **Interpretation:** **Cross-spec contradiction.** Code follows `core:transition-checks` ABI. `core:transition-change` constructor/factory requirements were not fully rewritten. Prefer updating transition-change spec/verify to bindings + effect execute; keep the verify scenario as “hooks run with that step/phase”.

#### TR-2 — MEDIUM — `_mapFailedPredicate` switches on `CheckId`

- **Spec (transition-checks):** Core use cases MUST NOT `switch` on `CheckId` to gather facts or launch hooks.
- **Code:** Large `switch (failed.id)` to pick `InvalidStateTransitionError` vs archive-typed errors.
- **Interpretation:** This is error mapping, not gather/launch. Strict reading is a violation; likely spec meant gather/hooks only. Flag as wording vs implementation. If plugins add ids, they fall through to generic `invalid-transition`.

#### TR-3 — MEDIUM — `allowOutOfScope` on `TransitionChangeInput` is unspecified in the input-contract requirement

- **Spec input list:** name, to, skipHookPhases, refreshImplementationTrackingBefore.
- **Code:** optional `allowOutOfScope` (needed for impl.linksInScope skippable semantics on transition).
- **Interpretation:** Spec gap; code matches transition-checks skippable rule. Add the field to the input contract.

#### TR-4 — LOW — `projectArtifacts` + `findBlockingParent` after a failed requires check

- **Spec:** MUST NOT re-walk requires with a different algorithm after green execute. On failure, map the failed predicate (blockedBy from engine parent finder is allowed as diagnostic enrichment).
- **Code:** On requires fail, calls `this._lifecycle.findBlockingParent` (second DAG walk) to fill `blockedBy`.
- **Interpretation:** Acceptable diagnostic if statuses match the check; still a second walk. Prefer putting `blockedBy` on check `details`.

### Test Coverage

Broad and aligned with most verify scenarios: pending hops, approval-required stays in ready/done, incomplete-tasks, incomplete-artifact + blockedBy, redesign invalidate, skill hop, recovery, skipHookPhases, progress bus, mutate, CountTasks not called twice on TransitionChange, compact IMPLEMENTATION_STATE mapping to `ArchiveImplementationStateError`.

Gaps: factory spec still expecting `runStepHooks` on deps (composition tests follow code); extra effects; `allowOutOfScope` documented in spec.

### Missing Tests

- `createTransitionChange` deps shape: `transitionBindings` present, `runStepHooks` absent (locks the ABI the code actually has — only after spec is aligned).
- `allowOutOfScope: true` skips `impl.linksInScope` but not `impl.filesResolved`.

---

## Spec dependency chain & globals

| Constraint                                           | Verdict                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hexagonal layers                                     | Application checks + ports: OK. Domain still exports snapshot `run` and `executeWithHostSnapshots`. `LifecycleEngine` remains a **class** in `domain/services` despite global “stateless domain operations are plain functions” — **pre-existing** pattern this change doubles down on. |
| Application never imports infrastructure             | GetStatus/TransitionChange: OK.                                                                                                                                                                                                                                                         |
| Manual DI / `createX(deps)` + `resolveXDeps`         | GetStatus still threads CountTasks; TransitionChange factory matches code not spec.                                                                                                                                                                                                     |
| Conventions: kebab-case, named exports, no `any`     | OK on inspected files.                                                                                                                                                                                                                                                                  |
| Conventions: errors extend SpecdError                | `WorkflowCheck.run` default throws generic `Error` (`workflow-check.ts` ~58–60) — unused on the execute path.                                                                                                                                                                           |
| Testing: Vitest, `test/` mirror, no snapshots        | OK. Several tests **specify the old snapshot/CountTasks gather model**, so coverage exists but for the **wrong** requirement (GS-1).                                                                                                                                                    |
| `core:transition-checks` vs `core:transition-change` | Constructor/RunStepHooks vs effect-execute ABI — **contradiction** (TR-1).                                                                                                                                                                                                              |
| `core:lifecycle-engine` vs `core:transition-checks`  | Engine still optional-snapshots vs “no snapshot bag”.                                                                                                                                                                                                                                   |
| `core:get-status` vs `core:transition-checks`        | Second CountTasks; blocker whitelist.                                                                                                                                                                                                                                                   |

---

## Findings index (actionable)

| ID          | Sev    | Spec                                   | Summary                                                                    |
| ----------- | ------ | -------------------------------------- | -------------------------------------------------------------------------- |
| GS-1        | HIGH   | get-status                             | Second CountTasks + constructor `countTasks`; tests lock it                |
| GS-2        | HIGH   | get-status                             | `blockers` drop requires/approval codes                                    |
| LE-1 / TC-1 | HIGH   | lifecycle-engine, transition-checks    | `PredicateSnapshots` ABI + engine `run` fallback                           |
| TC-2        | —      | transition-checks vs archive-change    | Unbound publication: **spec delta** (keep in ArchiveChange), not impl HIGH |
| TC-3        | HIGH   | transition-checks                      | Effect loop allowlists hook ids                                            |
| TR-1        | HIGH   | transition-change vs transition-checks | Constructor still specs `RunStepHooks`; code uses bindings                 |
| LE-2        | HIGH   | lifecycle-engine                       | Second requires walk; `MISSING_ARTIFACT` vs check `INCOMPLETE_ARTIFACT`    |
| LE-3 / TR-4 | MEDIUM | lifecycle-engine, transition-change    | Public `projectArtifacts` / parent re-walk                                 |
| LE-4        | MEDIUM | lifecycle-engine                       | nextAction if-ladders; archiving restore not modeled                       |
| LE-5        | MEDIUM | lifecycle-engine                       | ValidateArtifacts / GetArtifactInstruction still gather snapshots          |
| GS-3        | MEDIUM | get-status                             | Catch-all degrade                                                          |
| GS-4        | MEDIUM | get-status                             | Draft skips engine DAG                                                     |
| TC-4        | MEDIUM | transition-checks                      | Closed `CheckId` union                                                     |
| TC-5        | MEDIUM | transition-checks                      | Duplicated binding tables                                                  |
| TR-2        | MEDIUM | transition-checks                      | Switch on CheckId for error mapping                                        |
| TR-3        | MEDIUM | transition-change                      | `allowOutOfScope` unspecified on input                                     |
| LE-6        | LOW    | lifecycle-engine                       | isPermitted spec vs verify                                                 |
| GS-5        | LOW    | get-status                             | Artifact list cardinality wording                                          |
| —           | LOW    | architecture                           | LifecycleEngine class vs pure-function rule (pre-existing)                 |

---

## Per-spec counts

| Spec                   | Reqs reviewed (approx) | Compliant | Partial / gap | Discrepancies   | Missing tests (notable) |
| ---------------------- | ---------------------- | --------- | ------------- | --------------- | ----------------------- |
| core:lifecycle-engine  | 10                     | 5         | 5             | 6 (1H+1H+3M+1L) | 3                       |
| core:transition-checks | 14                     | 8         | 6             | 6 (3H+2M+1L)    | 3                       |
| core:get-status        | 16                     | 9         | 7             | 5 (2H+2M+1L)    | 5                       |
| core:transition-change | 18                     | 13        | 5             | 4 (1H+3M)       | 2                       |

## Batch totals

- **Discrepancies:** 21 (HIGH 8, MEDIUM 10, LOW 3) — LE-1 and TC-1 counted separately (same root cause, two specs).
- **Unique root issues:** 19 if LE-1/TC-1 merged.
- **Missing / misaligned tests:** 13 notable gaps (plus tests that assert **forbidden** CountTasks painting).
- **Cross-spec contradictions:** 3 (`RunStepHooks` constructor vs effect ABI; snapshot bag vs no-bag; `isPermitted` spec vs verify).
- **Global contradictions:** 1 material (stateless domain service as class — pre-existing); 1 minor (`Error` vs `SpecdError` on unused `WorkflowCheck.run`).

**Overall (this batch):** GetStatus/TransitionChange `execute` checks, but the snapshot bag, second CountTasks, second `requires` walk, incomplete blockers, and hook-id effect filter mean the **new engine is not finished**. `archive.publication` unbound is spec-vs-spec (keep in ArchiveChange). `projectArtifacts` is a pure helper to spec, not bag debt. See compiled report for verdicts.
