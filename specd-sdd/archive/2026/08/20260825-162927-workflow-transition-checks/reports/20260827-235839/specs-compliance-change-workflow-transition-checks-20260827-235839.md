# Specs-compliance report — change `workflow-transition-checks`

- **Mode:** change (`--change workflow-transition-checks`)
- **Timestamp:** 20260827-235839
- **Verification:** full (scenarios + this audit)
- **Graph:** `graph index` worker failed during verify; audits used spec-preview + source/tests. `graph search` worked for some symbols.

## Executive summary

Scenario verification against merged verify artifacts **passed** (core/cli/skills suites covering the change: 507 + 122 core tests, 131 CLI tests, 10 skills tests). Implementing post-hooks (`pnpm test|lint|typecheck`) had already passed.

The audit found **issues**. Highest-severity:

1. **HIGH — production GetStatus overlap I/O** — `resolveGetStatusDeps` calls `resolveWorkflowCheckRegistry(resolver)` without `includeOverlapDetection: true`. Kernel `spec.overlap` then defaults to never blocked. Unit tests inject a failing check, so they pass while `change status` on an `archivable` change with live peer overlap can omit `OVERLAP_CONFLICT`. Archive execute still detects overlap. Spec (`core:get-status` archivable archive predicates) wants the live overlap on status.
2. **HIGH / spec drift — lifecycle-engine verify vs spec.md** — auditors flagged merged engine **verify** still expecting `OVERLAP_CONFLICT` from invalidation history while **spec.md** + code treat that as review-only. Confirm whether the merged `verify.md` scenario was actually rewritten in this change’s delta (the delta file may already be updated; auditor may have read an unmerged leftover). Treat as **update specs** if verify still contradicts spec.md.
3. **MEDIUM — Input contract** still documents `to: ChangeState` only vs `to: 'next'`.
4. **CLI test layout leftovers** — `packages/cli/test/commands/change.spec.ts` still exists beside mirrored `change/*.spec.ts`. No dedicated CLI tests for `--allow-out-of-scope` / `--allow-overlap`.
5. **Test gaps** — collect-all vs `failFastOn: 'protocol.edge'`; extra `'next'` rejection states (`pending-spec-approval`, `pending-signoff`, `archiving`); storage persist/`state` wording.

Neither spec nor code is assumed the source of truth. Recorte 26 **happy path in unit tests is implemented**; Kernel wiring for live overlap on GetStatus is the main code vs spec miss.

## Recommended reviewer actions

- **Fix implementation** if status of `archivable` must show live `OVERLAP_CONFLICT`: pass `includeOverlapDetection: true` (or share ArchiveChange’s registry) into `resolveGetStatusDeps`.
- **Update specs** if GetStatus must stay cheap (no `list()` on every status): document the exception and drop/adjust the GetStatus archivable-overlap requirement and its injected-only test.
- **Update specs** for leftover Input-contract / Purpose wording and any stale verify scenarios.

## Partial reports (verbatim)

---

## File: \_partial-core-lifecycle.md

# Spec-compliance partial: core lifecycle batch

- **Change:** `workflow-transition-checks`
- **Batch:** `core-lifecycle`
- **Mode:** change (merged via `changes spec-preview`)
- **Specs:** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:change`
- **Focus:** recorte 26 (overlap split, `passMemo`, `to: 'next'`, collect-all vs `failFastOn`, engine-derived `pending-parent-artifact-review`)
- **Graph:** `specd graph search` worked for `CountTasks` and related symbols; index may still be stale for newer files. Implementation and tests were read directly for recorte 26.
- **Constraint:** read-only; no source or spec edits.

Neither spec nor code is treated as sole source of truth. Each discrepancy lists both interpretations.

---

## Recorte 26 — cross-spec verdict

| Intent                                                                                                               | Code                                                                                                                                                                    | Tests                                            | Verdict                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Invalidation overlap is **review** (`spec-overlap-conflict`), not `OVERLAP_CONFLICT`                                 | `LifecycleEngine._reviewBlockers` returns `[]` for that reason; GetStatus asserts no `OVERLAP_CONFLICT`                                                                 | `lifecycle-engine.spec.ts`, `get-status.spec.ts` | **Pass** vs `spec.md`; **fail vs `lifecycle-engine` verify.md** (stale scenario still expects `OVERLAP_CONFLICT` from history) |
| Archivable GetStatus runs **archive predicates**; live overlap is skippable `--allow-overlap`                        | `GetStatus` runs `executeMatchingPredicates` on `_archiveBindings` when `state === 'archivable'` with `allowOverlap: false`; merge sets `bypassFlag: '--allow-overlap'` | `get-status.spec.ts` live-overlap case           | **Pass**                                                                                                                       |
| `CountTasks` memoized on **per-execute `passMemo`**, not Kernel-lived instance                                       | `GetStatus`/`TransitionChange` allocate `new Map` per `execute`; `WorkflowTaskCompletionCheck` reads/writes `ctx.passMemo` only                                         | GetStatus recounts on second execute             | **Pass**                                                                                                                       |
| `to: 'next'` / `HAPPY_PATH_NEXT` / `HappyPathNextUnavailableError`                                                   | `TransitionChangeInput.to` is `ChangeState \| 'next'`; identity map in `change-state.ts`; typed error `HAPPY_PATH_NEXT_UNAVAILABLE`                                     | implementing→verifying; reject archivable        | **Pass** (spec **Input contract** still says `to` is `ChangeState` only)                                                       |
| GetStatus **collect-all**; TransitionChange **`failFastOn: 'protocol.edge'`**                                        | `executeChecksByLegalTargets` does not pass fail-fast; `TransitionChange` passes `{ failFastOn: 'protocol.edge' }`                                                      | No unit test of `failFastOn` / collect-all       | **Code pass**; **test gap**                                                                                                    |
| `pending-parent-artifact-review` engine-derived; `ArtifactFile` rejects persist token; wire coerced to `in-progress` | Engine `_effectiveStatus`; `ArtifactFile` throws `InvalidChangeError`; repo coerce + `persistableArtifactStatus`                                                        | domain + repo tests                              | **Pass**                                                                                                                       |

---

## `core:lifecycle-engine`

### Requirements Summary

Merged spec (`spec.md`) requires:

1. **Centralized validation** — sole interpreter; project from caller `CheckResult`s; no I/O; no snapshot bag; `TransitionChange` fail-fasts `protocol.edge`; `GetStatus` collects every matching predicate.
2. **Effective artifact status** — DAG cascade; `complete` + incomplete/review upstream → `pending-parent-artifact-review`; public API is `evaluate` / `projectArtifacts`, not `computeEffectiveStatus`.
3. **Canonical-state-only** — ignore `complete-with-drift` / `hasDrift` as lifecycle states.
4. **Machine-readable blockers** — structured `Blocker`; skippable + active bypass **omits** from `blockers` (no `warnings`); `OVERLAP_CONFLICT` is **live archive `spec.overlap`**, not invalidation `review.reason === 'spec-overlap-conflict'`.
5. **Available steps / nextAction** — from one predicate evaluation; **no** rewrite of `implementing`→`pending-spec-approval`; happy-path matrix; overlap victim → `/specd-design`, not `--allow-overlap`.
6. **Archiving escapes** — `archiving` exposes `archivable` + `designing`; recovery hop skips `requires` / taskCompletion.
7. **Review summary integration** — detect Drift and Overlap as blocking diagnostics (wording is looser than the blocker-code rule).
8. **Shared consumers** — GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction; no second gate after green execute; CompileContext not an evaluate consumer.
9. **Next artifact** — `schema.artifactDag().topologicalOrder()`, not declaration order.

### Implementation Status

| Requirement                                  | Status                             | Evidence                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Centralized validation / project from checks | **Implemented**                    | `LifecycleEngine.evaluate` takes `checksByTarget`; `projectArtifacts` is I/O-free                                                                                                                                                          |
| Fail-fast vs collect-all                     | **Delegated to callers** (correct) | Engine does not execute checks; `TransitionChange` uses `failFastOn`; GetStatus uses `executeChecksByLegalTargets` without fail-fast                                                                                                       |
| Effective status / parent review             | **Implemented**                    | `_effectiveStatus` returns `pending-parent-artifact-review`                                                                                                                                                                                |
| Canonical-state-only                         | **Implemented**                    | Engine uses persisted `artifact.status`, not displayStatus                                                                                                                                                                                 |
| OVERLAP_CONFLICT split                       | **Implemented (spec.md)**          | `_reviewBlockers` comment + empty return for overlap-invalidation; skippable `OVERLAP_CONFLICT` from failed checks with `--allow-overlap`                                                                                                  |
| No approval rewrite                          | **Implemented**                    | `_resolveTarget` is identity                                                                                                                                                                                                               |
| Next artifact DAG order                      | **Implemented**                    | `_nextArtifact` walks `artifactDag().topologicalOrder()`                                                                                                                                                                                   |
| Bypass omits skippable blockers              | **Partially in engine**            | `bypassFlags` on `LifecycleEngineOptions`; GetStatus does **not** pass bypass into evaluate for archive overlap — it hardcodes `allowOverlap: false` and projects `bypassFlag` on the public blocker (status snapshot, not execute bypass) |

### Discrepancies (severity)

#### 1. HIGH — `verify.md` still requires `OVERLAP_CONFLICT` from invalidation history

Merged **verify** scenario _Overlap conflict detection from history_:

- GIVEN recent `invalidated` with `cause: 'spec-overlap-conflict'`
- THEN evaluate identifies an **`OVERLAP_CONFLICT` blocker**

Merged **spec.md** _Machine-readable blockers_:

- `OVERLAP_CONFLICT` MUST NOT be emitted only because `review.reason` is `'spec-overlap-conflict'`

**Code** (`_reviewBlockers`) emits no overlap blocker for that reason; tests assert absence.

- **Spec (verify) might be wrong:** recorte 26 / spec.md / tests treat victim overlap as review + `/specd-design`. Verify was not updated.
- **Code might be wrong:** if verify is still the intended contract, engine under-reports `OVERLAP_CONFLICT`.
- **Evidence:** `packages/core/src/domain/services/lifecycle-engine.ts` (~538–539); `packages/core/test/domain/services/lifecycle-engine.spec.ts` (`does not project OVERLAP_CONFLICT from review invalidation overlap`).

#### 2. MEDIUM — _Review summary integration_ vs overlap split

Requirement still says the engine MUST report **Overlap** (conflicts with specs targeted by other archived changes) as **blocking diagnostics**. Recorte 26 says that path is review, not `OVERLAP_CONFLICT`. Live overlap is archive `spec.overlap` on **GetStatus when archivable**, which the engine only sees if those `CheckResult`s are injected.

- **Spec might be wrong:** leftover wording from the pre-split overlap model.
- **Code might be wrong:** engine does not synthesize overlap blockers from history at all (only review).

#### 3. LOW — `_resolveTarget` leftover

Identity function remains. Not a behaviour bug; dead routing name vs “MUST NOT rewrite”.

- **Spec might be wrong:** n/a
- **Code might be wrong:** only as leftover API smell, not a requirement miss

### Test Coverage

Covered: parent-review cascade; no OVERLAP_CONFLICT from invalidation; skippable overlap from checks; `availableSteps` vs omitted workflow rows; dual-write `INCOMPLETE_ARTIFACT` vs `MISSING_ARTIFACT`; nextAction matrix cases in engine tests; recovery `archiving → archivable`.

### Missing Tests

- Engine `bypassFlags` containing `allow-overlap` **omits** an injected `OVERLAP_CONFLICT` (spec: skippable + active bypass must not remain in `blockers`).
- No test that binds the **stale verify** history scenario to current spec.md (would currently fail verify as written).
- `protocol.edge` fail-fast is not an engine test (engine does not run checks).

### Spec vs global architecture

**Conformant.** `LifecycleEngine` is a stateless domain service (`domain/services/`), I/O-free, projecting from values. Check execution lives in application (`execute-matching-predicates.ts`, `create*` checks). Matches _Pure functions / domain services_ and _Domain layer is pure_.

`CheckExecutionContext.passMemo` is an ephemeral `Map` on a domain type; it does not perform I/O. Acceptable vs architecture.

---

## `core:get-status`

### Requirements Summary

Key merged rules: load by name (active then draft, never discarded); optional refresh + `ifModifiedSince`; DAG effective status including drafted `projectArtifacts`; task counts from `workflow.taskCompletion` / one CountTasks pass; **collect every matching predicate (no `protocol.edge` fail-fast)**; when `archivable`, run **all archive-scope predicates** with `allowOverlap`/`allowOutOfScope` false; live overlap MAY appear as `OVERLAP_CONFLICT` + `--allow-overlap`; invalidation overlap MUST NOT; `passMemo` per execute, not instance cache; no `CountTasks` constructor sibling; review priority including `spec-overlap-conflict` → `/specd-design`; merge failed hop predicates onto public `blockers`; schema miss degrades lifecycle without throwing.

### Implementation Status

| Requirement                                             | Status          | Evidence                                                    |
| ------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| Input / resolution / draft read-only                    | **Implemented** | `get` then `getDraft`; drafted `availableTransitions` empty |
| Refresh + ifModifiedSince                               | **Implemented** | `_buildUnchangedResult` skips evaluation                    |
| Execute predicates then project                         | **Implemented** | `executeChecksByLegalTargets` + `lifecycle.evaluate`        |
| Archivable archive predicates                           | **Implemented** | `change.state === 'archivable'` + `scope: 'archive'`        |
| Overlap split                                           | **Implemented** | tests for victim vs live overlap                            |
| passMemo / no CountTasks on ctor                        | **Implemented** | ctor: bindings only; `new Map` per execute                  |
| Task paint from check details                           | **Implemented** | `taskCompletionFromChecks`                                  |
| Review priority + overlapDetail                         | **Implemented** | engine `_deriveReview` + `_projectReview`                   |
| Blocker merge (approval, incomplete, impl bypass split) | **Implemented** | `_mergeBlockers`                                            |
| Schema degradation                                      | **Implemented** | try/catch around `schemaProvider.get()`                     |

### Discrepancies (severity)

#### 1. MEDIUM — Purpose vs engine-derived parent status

Purpose: an artifact whose hashes match **may still show `in-progress`** if dependencies are not complete.

Engine + _Reports effective status_ + `core:change`: parent-blocked **complete** files report **`pending-parent-artifact-review`**. Incomplete non-review deps still map to `in-progress` in `_effectiveStatus`.

- **Spec might be wrong:** purpose paragraph not updated for recorte 26 token.
- **Code might be wrong:** if purpose is still the public contract, GetStatus over-reports a derived token.

Drafted path uses `projectArtifacts` and a test named “without calling evaluate” — **matches** spec (“same DAG cascade as evaluate with empty `checksByTarget` (`projectArtifacts`)”).

#### 2. MEDIUM — _Identifies blockers_ still assigns `MISSING_ARTIFACT` to `in-progress`

Text: `MISSING_ARTIFACT` for each required artifact in `missing` **or `in-progress`**. Adjacent sentence then lists `INCOMPLETE_ARTIFACT` from failed predicates.

Code / engine verify _Requested-target blockers do not dual-write MISSING_ARTIFACT_ use `INCOMPLETE_ARTIFACT` for failed `workflow.requires`.

- **Spec might be wrong:** stale merge of old GetStatus blocker list with check-projected codes.
- **Code might be wrong:** if the first bullet is still binding, in-progress requires are under-coded as `MISSING_ARTIFACT`.

#### 3. LOW — Public `Blocker` has `bypassFlag` but not `isSkippable`

Engine `LifecycleBlocker` has `isSkippable`. GetStatus `Blocker` only exposes `bypassFlag` for overlap / out-of-scope.

GetStatus spec does not require `isSkippable` on the public type. Engine spec does for engine blockers. Status clients infer skippable from `bypassFlag`.

- **Spec might be wrong:** two Blocker shapes without an explicit projection rule.
- **Code might be wrong:** if agents must read `isSkippable` from GetStatus JSON.

### Test Coverage

Strong for recorte 26: invalidation overlap without `OVERLAP_CONFLICT`; archivable live overlap skippable; CountTasks once per execute then recount on second execute; incomplete tasks hide `verifying`; `APPROVAL_REQUIRED` merged; drafted parent-review; impl.filesResolved without `--allow-out-of-scope`.

### Missing Tests

- **Collect-all:** illegal hop still runs predicates after failed `protocol.edge` (no `failFastOn` on GetStatus).
- Archive predicates **exclude** `hook.pre` / `hook.post` effects (spec: predicates only).
- Schema-resolution catch does **not** swallow check `execute` failures (constraint).

### Spec vs global architecture

**Conformant.** Application use case; I/O via ports (`ChangeRepository`, `SchemaProvider`) and composed checks; DAG interpretation delegated to `LifecycleEngine`. Does not take `CountTasks` as a sibling gatherer. Matches _Application layer uses ports only_ and _Manual DI_.

---

## `core:transition-change`

### Requirements Summary

Use case owns persist, redesign invalidation, hooks via effect `execute`; predicates via shared matcher; no pending-state routing; map failed predicates to existing errors; `to` is `ChangeState` **or** `'next'` (later requirement); `'next'` uses happy-path table, **not** `GetStatus.nextAction`; reject `'next'` at pending/archivable/archiving with typed `SpecdError`; `protocol.edge` fail-fast on execute; GetStatus still collect-all; no `CountTasks`/`RunStepHooks` on the use-case constructor.

### Implementation Status

| Requirement                           | Status                        | Evidence                                                                                                   |
| ------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Input `to: ChangeState \| 'next'`     | **Implemented in types/code** | `TransitionChangeInput`                                                                                    |
| HAPPY_PATH_NEXT                       | **Implemented**               | `change-state.ts` (drafting→designing through signed-off→archivable; omits pending, archivable, archiving) |
| HappyPathNextUnavailableError         | **Implemented**               | `HAPPY_PATH_NEXT_UNAVAILABLE`                                                                              |
| failFastOn protocol.edge              | **Implemented**               | `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })`                                          |
| passMemo per execute                  | **Implemented**               | `new Map` before predicates                                                                                |
| No CountTasks/RunStepHooks on ctor    | **Implemented**               | bindings only                                                                                              |
| Approval as check, stay in ready/done | **Implemented**               | `_mapFailedPredicate`                                                                                      |
| Recovery `archiving → archivable`     | **Implemented**               | along classification + binding table                                                                       |
| allowOutOfScope                       | **Implemented**               | input flag → ctx                                                                                           |

### Discrepancies (severity)

#### 1. MEDIUM — _Input contract_ vs _to next is the happy-path next state_

First requirement: `to` (ChangeState, **required**). Later requirement: MUST accept `'next'`. Verify scenarios cover `'next'`. Code implements the later rule.

- **Spec might be wrong:** Input contract not updated after recorte 26.
- **Code might be wrong:** if Input contract is still binding, `'next'` is an illegal widening.

#### 2. MEDIUM — leftover “routing” language

Purpose still says the use case delegates **approval-gate routing** to `LifecycleEngine`. Constraints: “Approval-gate routing is configuration-driven… centralized through LifecycleEngine”. Spec also says `_resolveTarget` MUST NOT rewrite targets.

Code: `effectiveTarget = requestedTarget`; `_resolveTarget` identity.

- **Spec might be wrong:** purpose/constraints not fully recorte-aligned.
- **Code might be wrong:** if routing is still required (contradicted by other requirements).

#### 3. LOW — _Workflow requires enforcement_ “after resolving the effective target”

Leftover routing phrasing. Behaviour is requested-target evaluation.

### Test Coverage

Covered: `to: 'next'` from implementing → verifying; reject from archivable with `HappyPathNextUnavailableError`; no second CountTasks after green evaluate; gates, hooks, redesign, recovery (broader file).

### Missing Tests

- `'next'` rejected from `pending-spec-approval`, `pending-signoff`, `archiving` (spec “including at least”).
- Assert error **code** `HAPPY_PATH_NEXT_UNAVAILABLE` (not only class).
- **`failFastOn: 'protocol.edge'`:** later predicates not executed when protocol fails (recorte 26).
- `'next'` must not use `nextAction.targetStep` (e.g. ready + missing spec approval: next is still `implementing`, not stay-on-ready).

### Spec vs global architecture

**Conformant.** Application use case; entity `change.transition` owns state machine; engine projects; effects via check `execute` + ports. Matches _Rich domain entities_ and _use cases do not duplicate entity invariants_ for the persist hop. Predicate-to-error mapping is application, allowed by `core:transition-checks`.

---

## `core:transition-checks`

### Requirements Summary

Shared check ABI (`Check` / `WorkflowCheck` / `create*`); no snapshot bag; `passMemo` once per `executeChecksByLegalTargets` / TransitionChange pass; `workflow.taskCompletion` memoizes CountTasks on `passMemo`; evaluation step 2: **TransitionChange fail-fast `protocol.edge`; GetStatus collect-all**; registry bindings including archive `spec.overlap` skippable `--allow-overlap`; projections from predicate results; one binding table.

### Implementation Status

| Requirement                 | Status                          | Evidence                                                                                                      |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Check ABI / per-file checks | **Implemented**                 | `application/checks/*`, `createWorkflowCheckRegistry`                                                         |
| passMemo                    | **Implemented**                 | `CheckExecutionContext`, `buildCheckExecutionContext`, task-completion check                                  |
| Collect-all vs fail-fast    | **Implemented in host options** | `failFast` / `failFastOn` on `executeMatchingPredicates`; GetStatus omits; TransitionChange sets `failFastOn` |
| No PredicateSnapshots       | **Implemented**                 | domain test asserts exports absent                                                                            |
| Archive vs edge             | **Implemented**                 | `ARCHIVE_BINDING_SPECS` vs transition table                                                                   |
| Labels / progress bus       | **Implemented**                 | `CHECK_LABELS`, `executeCheckWithProgress`                                                                    |
| Impl skippable split        | **Implemented**                 | engine + GetStatus merge by check id                                                                          |

### Discrepancies (severity)

#### 1. MEDIUM — Registry row vs evaluation step 2

Registry: `protocol.edge` — every transition attempt **(fail-fast)**.

Evaluation: On TransitionChange execute, fail-fast if it fails. On **GetStatus, collect it with every other matching predicate (no fail-fast)**.

Code follows **evaluation**, not the registry parenthetical.

- **Spec might be wrong:** registry “fail-fast” is leftover shorthand and should be execute-only.
- **Code might be wrong:** if registry is binding, GetStatus should fail-fast (would hide repair-guide “full why”).

#### 2. LOW — `protocol.edge` domain stub vs production execute

Spec: domain MAY export `run` + stub Check; MUST NOT be the production execute path. Application `createProtocolEdge` is the production path; registry applies domain **binding specs** once. Conformant if hosts inject application registry (TransitionChange constraint says MUST NOT default to `TRANSITION_BINDINGS`).

### Test Coverage

Binding applicability, along classification, no snapshot types, labels, impl compact messages, approval bindings — covered in `transition-checks.spec.ts` and factory tests. Task-completion passMemo behaviour covered indirectly via GetStatus recount test.

### Missing Tests

- **`executeMatchingPredicates` `failFastOn: 'protocol.edge'`** vs default collect-all (no dedicated `execute-matching-predicates` spec file found).
- `passMemo` shared across legal **targets** in one GetStatus pass (CountTasks called once for many hops) — GetStatus tests assert once per execute vs evaluate, which is related but not explicit multi-target memo.

### Spec vs global architecture

**Conformant.** Domain: matcher, `classifyAlong`, pure `run` helpers. Application: `WorkflowCheck` subclasses with ports. Matches _Pure functions for stateless domain services_ and _Application layer uses ports only_. Check I/O is not in `LifecycleEngine`.

---

## `core:change`

### Requirements Summary (this batch)

Deep audit targeted recorte 26 **Artifacts** + **Lifecycle interpretation authority**. Other change requirements (identity, history, gates, drafting, policy invalidation, drift) were not re-proved line-by-line; no recorte-26 contradiction found except notes below.

**Artifacts (recorte 26):** persistable file states exclude `pending-parent-artifact-review`. That token is engine-derived. `ArtifactFile` MUST reject constructing it. Load/save MUST coerce wire/legacy `pending-parent-artifact-review` to `in-progress` (not throw). Aggregate persisted `ChangeArtifact.state` MUST NOT store the token.

**Lifecycle interpretation authority:** DAG / requires / parent-block / availability belong to `LifecycleEngine`, not the entity.

### Implementation Status

| Requirement                        | Status          | Evidence                                                                 |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------ |
| ArtifactFile rejects derived token | **Implemented** | constructor throws `InvalidChangeError`                                  |
| Wire coerce on load                | **Implemented** | `change-repository.ts` before `new ArtifactFile`                         |
| Persist coerce                     | **Implemented** | `persistableArtifactStatus`                                              |
| Zod still accepts token on wire    | **Compatible**  | `manifest.ts` enum includes token so legacy manifests parse, then coerce |
| Engine-only parent review          | **Implemented** | entity aggregate recompute does not emit parent-review                   |

### Discrepancies (severity)

#### 1. LOW — Spec wording “sanea”

Merged artifacts requirement: “Load/save MUST **sanea** (coerce)…”. Typo / mixed language; behaviour is coerce.

- **Spec might be wrong:** editorial.
- **Code might be wrong:** n/a if coerce is the intent.

#### 2. LOW — `ArtifactStatus` union vs persistable set

`artifact-status.ts` includes `pending-parent-artifact-review` and documents `in-progress` as also covering “dependency is not complete”. Union is required for engine projection; file persist rejects the token. Comment overlap is confusing, not a persist bug.

- **Spec might be wrong:** should split persistable vs effective unions (spec already says engine-derived).
- **Code might be wrong:** single union makes it easier to pass the token into `ArtifactFile` (defended by throw).

#### 3. LOW — `ChangeArtifact` constructor does not reject the token

Spec requires ArtifactFile reject and persist MUST NOT store aggregate parent-review. Constructor can theoretically be given `status: 'pending-parent-artifact-review'` then `_recomputeStatus()` from files. Save still coerces.

- **Spec might be wrong:** aggregate reject not required if recompute + persist coerce suffice.
- **Code might be wrong:** in-memory aggregate could briefly hold a non-persistable token if recompute does not run / files incomplete.

### Test Coverage

`artifact-file.spec.ts` reject persist token; `change-repository.spec.ts` get-then-save coerce. Engine tests cover derived status. `HAPPY_PATH_NEXT` mapping in `change-state.spec.ts`.

### Missing Tests

- `ChangeArtifact` / `invalidate` never persist parent-review without going through repo coerce (entity-level).
- Constructing `ChangeArtifact` with aggregate status token (if that should throw).

### Spec vs global architecture

**Conformant.** Entity owns persistable invariants (`ArtifactFile` throw). Schema DAG interpretation is **not** on `Change` — matches _Rich domain entities_ and _Lifecycle interpretation authority_. Coerce at FS adapter matches _YAML/JSON validated at infrastructure boundary_ (legacy token accepted then sanitized).

---

## Spec-internal conflicts (change artifacts, not just code)

| Location                                                                     | Conflict                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `lifecycle-engine` spec.md vs verify.md                                      | Overlap-from-history → no `OVERLAP_CONFLICT` vs THEN `OVERLAP_CONFLICT` |
| `lifecycle-engine` _Review summary integration_ vs _Mandatory Blocker Codes_ | Report overlap as blockers vs overlap-from-archive-only                 |
| `transition-change` Input contract vs _to next_                              | `ChangeState` only vs `ChangeState \| 'next'`                           |
| `transition-checks` registry `(fail-fast)` vs evaluation step 2              | Always fail-fast vs GetStatus collect-all                               |
| `get-status` Purpose vs effective-status / `core:change`                     | Parent block as `in-progress` vs `pending-parent-artifact-review`       |
| `get-status` Identifies blockers                                             | `MISSING_ARTIFACT` for in-progress vs check `INCOMPLETE_ARTIFACT`       |

These are **spec-might-be-wrong** relative to recorte 26 and current tests, unless product intent reverted.

---

## Per-spec counts

Counts are **requirement-level** for this batch (merged spec `### Requirement` headings). Fail = discrepancy that can change behaviour or verify outcomes. Gap = missing tests for a stated recorte-26 or evaluation rule. Pass = remaining requirements aligned with code as inspected.

| Spec                                                                            | Requirements (approx.) |   Pass |              Fail |    Gap |
| ------------------------------------------------------------------------------- | ---------------------: | -----: | ----------------: | -----: |
| `core:lifecycle-engine`                                                         |                      9 |      7 |                 2 |      2 |
| `core:get-status`                                                               |                     18 |     16 |                 2 |      2 |
| `core:transition-change`                                                        |                     22 |     20 |                 2 |      3 |
| `core:transition-checks`                                                        |                     15 |     14 |                 1 |      2 |
| `core:change` (deep: Artifacts + interpretation; others not re-counted as fail) |          2 deep + note | 2 deep | 1 (wording/union) |      1 |
| **Total (this file)**                                                           |                      — | **59** |             **8** | **10** |

`core:change` non-recorte requirements: **not scored** as pass/fail in the total (would inflate pass). Treat as **out of deep scope** except Artifacts / interpretation authority.

---

## Batch summary

Recorte 26 is **implemented in core** for overlap split, `passMemo`, `'next'`, fail-fast vs collect-all hosts, and engine-derived parent-review with file-level reject + wire coerce.

Remaining work is mostly **spec/verify hygiene** (stale `OVERLAP_CONFLICT` verify scenario; Input contract; registry fail-fast wording; GetStatus purpose/blocker bullets) and **tests** for `failFastOn` / collect-all and extra `'next'` rejection states.

**Recommended owner (auditor, not a change):** prefer treating **spec.md + tests + recorte 26** as intended; update **verify.md** _Overlap conflict detection from history_ so it does not demand `OVERLAP_CONFLICT` from invalidation events.

---

## File: \_partial-archive-hooks.md

# Spec compliance — archive / hooks batch

**Change:** `workflow-transition-checks`  
**Mode:** spec-preview (merged deltas)  
**Specs:** `core:archive-change`, `core:hook-execution-model`, `core:workflow-model`, `core:validate-artifacts`, `core:get-artifact-instruction`  
**Focus:** `skipHookPhases` `source.pre` / `target.post` no-ops; archive `--allow-overlap` / `--allow-out-of-scope`; `archiveBindings` vs GetStatus; `hook.pre` / `hook.post` as effects; `ValidateArtifacts` ctor `ListWorkspaces`  
**Graph:** indexed `current` at audit time (`knownStaleSinceLastIndex: false`). Implementation paths confirmed via graph search + file read. No source/spec edits.

---

## Requirements Summary

### `core:archive-change` (32 unique requirements)

| ID          | Requirement                                                                                                              | Intent                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01       | Ports and constructor                                                                                                    | Inject `ChangeRepository`, `ListWorkspaces`, `ArchiveRepository`, **`archiveBindings`**, actor, parsers, schema, materialize metadata, extractors, routes, project root, batch snapshot. No `RunStepHooks` / `HookRunner` on the use case. Workspace lookup via `ListWorkspaces`. |
| AC-02       | Archive bindings not RunStepHooks                                                                                        | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`. No ctor fallback that builds default bindings from `RunStepHooks`. `RunStepHooks` lives on `createHookPre` / `createHookPost` only.                                                       |
| AC-03       | Input                                                                                                                    | `skipHookPhases` (`pre` / `post` / `all`), `allowOverlap` (default false), `allowOutOfScope` skippable `impl.linksInScope` only — **MUST NOT** bypass `impl.filesResolved`.                                                                                                       |
| AC-04       | Schema name guard                                                                                                        | `schema.nameMatch` on operation `archive` before archivable guard, hooks, or writes.                                                                                                                                                                                              |
| AC-05       | ArchivedChange construction                                                                                              | `ArchiveRepository.archive(change, { actor })`; result includes that entity.                                                                                                                                                                                                      |
| AC-06       | Archivable guard                                                                                                         | `archive.archivable` / `assertArchivable()`; not a lifecycle `from→to`; `approval.signoff` not bound. Retry from `archiving` allowed.                                                                                                                                             |
| AC-07       | Deferred transition to archiving                                                                                         | Stay `archivable` through overlap, readOnly, pre-hooks, preflight; mutate to `archiving` after snapshots, before first `publish()`.                                                                                                                                               |
| AC-08       | ReadOnly workspace guard                                                                                                 | Same runner as enter-`ready`; before hooks/writes.                                                                                                                                                                                                                                |
| AC-09       | Overlap guard                                                                                                            | `spec.overlap` skippable with `allowOverlap` / `--allow-overlap`; archive-only (not enter-`ready`). On allow: invalidate peers.                                                                                                                                                   |
| AC-10       | Pre-archive hooks                                                                                                        | Operation-`archive` **effects** with `phase = before-persist`; select by binding phase not `check.id === 'hook.pre'`; `onFailure` abort; skip via `pre`/`all`. Skip never drops predicates.                                                                                       |
| AC-11–AC-20 | Tracked files, preflight, staged commit, snapshots, restore, orphans, rollback, debug logging, delta merge, archive repo | Atomic multi-spec archive contract (unchanged by this change’s check-table work except logging of skipped hook phases).                                                                                                                                                           |
| AC-21       | Post-archive hooks                                                                                                       | Effects with `phase = after-persist`, `onFailure = collect`.                                                                                                                                                                                                                      |
| AC-22–AC-24 | Spec metadata, spec-lock, result shape                                                                                   | Post-commit materialization + `postHookFailures` / `invalidatedChanges`.                                                                                                                                                                                                          |
| AC-25       | Typed errors                                                                                                             | `SpecOverlapError`, `HookFailedError`, `ArchiveImplementationStateError`, etc.                                                                                                                                                                                                    |
| AC-26       | Archive checks share runners                                                                                             | Registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`; no `archive.publication` check.                                                                                     |
| AC-27       | Tracked implementation review                                                                                            | Same `impl.filesResolved` runner as forward exit from `implementing`.                                                                                                                                                                                                             |
| AC-28       | Implementation materialization                                                                                           | Sidecar `spec-lock` writes.                                                                                                                                                                                                                                                       |
| AC-29       | Out-of-scope sidecar update guard                                                                                        | Default fail; `--allow-out-of-scope` allows; same skippable flag on exit-implementing.                                                                                                                                                                                            |
| AC-30       | Config factory                                                                                                           | `resolveArchiveChangeDeps` → canonical ctor; `archiveBindings` from registry; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                           |

### `core:hook-execution-model` (14 unique requirements)

| ID        | Requirement                          | Intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HEM-01    | Two hook types                       | `instruction:` query-only; `run:` via `HookRunner`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| HEM-02–03 | External hooks                       | Explicit `external:` type; same pre/post failure semantics as `run:`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| HEM-04    | instruction hooks are passive        | `TransitionChange` / `ArchiveChange` / `RunStepHooks` skip them; not predicates/effects.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| HEM-05    | Default execution                    | After predicates pass, execute matching **effects**. Slot/failure from **binding** (`phase`, `onFailure`), not check id. Transition: both `hook.pre` and `hook.post` are `before-persist` / `abort`. Archive: `hook.pre` abort/before-persist; `hook.post` collect/after-persist. No private always-source.post path. `skipHookPhases` selects by binding phase **plus** skip selectors. Transition skip **MUST NOT** rely on `binding.phase` alone (`source.pre` / `target.post` no-ops on this table). |
| HEM-06    | Two execution modes                  | Standalone `RunStepHooks` fail-fast pre / fail-soft post; use cases apply binding `onFailure`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| HEM-07    | Change entity does not execute hooks | Application layer only; default path still auto-runs effects.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| HEM-08    | Manual skipHooks                     | Transition: `source.pre`, `source.post`, `target.pre`, `target.post`, `all`. Archive: `pre`, `post`, `all`. Predicates still run.                                                                                                                                                                                                                                                                                                                                                                        |
| HEM-09–11 | Pre/post failure + ordering          | Fail-fast abort before persist; archive post collect; schema then project order.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| HEM-12    | Template variables                   | `change.name` / `change.path` / `project.root`; no `change.workspace`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### `core:workflow-model` (11 unique requirements)

| ID    | Requirement                  | Intent                                                                                                                                                                                                       |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WM-01 | Step names = domain states   | `workflow[]` configures extras; unknown step rejected at `buildSchema`.                                                                                                                                      |
| WM-02 | Step semantics               | Designing / implementing / verifying / archiving roles; drift → designing.                                                                                                                                   |
| WM-03 | Requires-based gating        | `workflow.requires` with `to = effective`; **GetStatus and TransitionChange share evaluation**.                                                                                                              |
| WM-04 | Task completion gating       | `workflow.taskCompletion` via `CountTasks`; not engine file walks.                                                                                                                                           |
| WM-05 | Step availability            | Engine projections of predicate `CheckResult`s; CompileContext must not evaluate hops.                                                                                                                       |
| WM-06 | Workflow array order         | Display + progress axis for `along`; designing = redesign; archiving→archivable = recovery.                                                                                                                  |
| WM-07 | Step-to-state mapping        | Step name IS state name.                                                                                                                                                                                     |
| WM-08 | Hook execution at boundaries | `run:` are **effects** with same matcher as predicates; post `along = forward` only; instruction not in pipeline. Transition effects **before persist**. Archive hooks are operation `archive`, not `along`. |
| WM-09 | Two execution modes          | One pipeline: predicates then matching effects; `skipHookPhases` is not a second engine.                                                                                                                     |
| WM-10 | Requires are artifact IDs    | Not step names.                                                                                                                                                                                              |
| WM-11 | (implicit from deps)         | Transition-checks table is source of matcher/`along`.                                                                                                                                                        |

### `core:validate-artifacts` (27 unique requirements)

| ID          | Requirement                                                                                                                                                                                 | Intent                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VA-01       | Ports and constructor                                                                                                                                                                       | `ChangeRepository`, **`ListWorkspaces`** (not `ReadonlyMap<SpecRepository>`), schema, parsers, actor, hasher, extractors, routes, **`LifecycleEngine`**. |
| VA-02–VA-23 | Input, schema guard, required/deps, topo order, bypass complete, approval/drift, per-file, expected paths, delta/no-op, structural, cross-artifact, metadata, hash, result, save, dependsOn | Existing validation chokepoint (mostly unchanged).                                                                                                       |
| VA-24       | Config factory                                                                                                                                                                              | `resolveValidateArtifactsDeps` must include `listWorkspaces` + `lifecycle`; no inline fs wiring.                                                         |
| VA-25       | DAG lifecycle from engine evaluate                                                                                                                                                          | `LifecycleEngine.evaluate` with **empty `checksByTarget`**. No hop predicates. No `gatherPredicateSnapshots`.                                            |

### `core:get-artifact-instruction` (10 unique requirements)

| ID        | Requirement                                                                     | Intent                                                                               |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GAI-01    | Ports and constructor                                                           | Changes, **spec repo map**, schema, parsers, expander, **`LifecycleEngine`**.        |
| GAI-02    | Input                                                                           | Optional `artifactId`; else `LifecycleEngine.nextArtifact`.                          |
| GAI-03–07 | Lookup, schema guard, artifact resolution, instruction resolution, result shape | Read-only instruction payload; `change` vars = `name`+`path` only.                   |
| GAI-08    | Config factory                                                                  | `resolveGetArtifactInstructionDeps` includes `lifecycle`.                            |
| GAI-09    | Effective status from DAG evaluate                                              | `evaluate(..., { checksByTarget: {} })`. Not GetStatus hop path. Not a snapshot bag. |

---

## Implementation Status

### Focus: `skipHookPhases` `source.pre` / `target.post` no-ops

**Implemented.** `HookPhaseSelector` includes all four dotted selectors plus `all`. Skip is applied inside `HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts`):

- `all` skips both phases
- transition `pre` skips only on `target.pre`
- transition `post` skips only on `source.post`
- archive uses `pre` / `post`

`source.pre` and `target.post` are accepted in the type/CLI set but never tested in that skip table, so matching `hook.pre` / `hook.post` still run. That matches HEM-05/HEM-08 scenarios (“no-op on this table”) because both transition hook effects share `phase = before-persist` and skip must not key off `binding.phase` alone.

`TransitionChange` does not branch on check id to launch `RunStepHooks`; it loops `matchingEffects(..., 'before-persist', along)` then `check.execute`.

**Tests:** `packages/core/test/application/use-cases/transition-change.spec.ts` — `skipHookPhases source.pre does not skip hook.pre or hook.post`, `target.post does not skip…`, `source.post skips only post hooks`. CLI maps comma selectors including `source.pre`/`target.post` (`packages/cli/src/commands/change/transition.ts`, `cli/test/commands/change/transition.spec.ts`).

### Focus: archive `--allow-overlap` / `--allow-out-of-scope`

**Implemented on use case + CLI wiring.**

- `ArchiveChangeInput.allowOverlap` / `allowOutOfScope` default false; passed into `buildCheckExecutionContext`.
- Domain `spec.overlap` skips when `allowOverlap`; else fails `OVERLAP_CONFLICT`.
- Domain `impl.linksInScope` skips when `allowOutOfScope`.
- Domain `impl.filesResolved` does **not** read `allowOutOfScope` (AC-03 / AC-27).
- On `allowOverlap === true`, use case still lists peers via `detectSpecOverlap` and invalidates (`spec-overlap-conflict`) — AC-09.
- CLI `change archive`: `--allow-overlap`, `--allow-out-of-scope`, `--skip-hooks pre|post|all` map onto the use case (`packages/cli/src/commands/change/archive.ts`).

**Tests:** `archive-change.spec.ts` covers overlap throw, `allowOverlap` proceed+invalidate, `allowOutOfScope` sidecar path. CLI tests cover `--skip-hooks` only — **not** the two allow flags (see Missing Tests).

### Focus: `archiveBindings` vs GetStatus

**Partial / split composition.**

Same **spec table** `ARCHIVE_BINDING_SPECS` is applied for both use cases (`check-bindings.ts`: nameMatch → archivable → overlap → readOnly → deps → filesResolved → linksInScope → hook.pre effect → hook.post effect).

Same **predicate filter**: `executeMatchingPredicates` uses `matchingPredicates` (`!isEffectCheck`), so GetStatus never waits on `hook.pre`/`hook.post`. GetStatus runs archive predicates only when `change.state === 'archivable'`, with `allowOverlap: false` and `allowOutOfScope: false`, then merges failures (overlap → `bypassFlag: '--allow-overlap'`).

**Production wiring diverges:**

| Path                       | Registry call                                                               | `spec.overlap` detector                            |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `resolveArchiveChangeDeps` | `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })` | Real `ChangeRepository.list` + `detectSpecOverlap` |
| `resolveGetStatusDeps`     | `resolveWorkflowCheckRegistry(resolver)` (flag omitted)                     | Default `() => ({ blocked: false })`               |

Comment on `CreateWorkflowCheckRegistryDeps` documents this: “GetStatus / TransitionChange do not bind this check” — meaning the **I/O port** is omitted, not that `spec.overlap` is absent from the table. The check still **runs** on GetStatus but cannot fail.

Unit tests that assert live `OVERLAP_CONFLICT` on GetStatus **inject** a failing `archiveBindings` row (`get-status.spec.ts` “given archivable live overlap”). Default `makeGetStatus` uses the same no-detector registry as production GetStatus.

**Evidence of execute vs status disagree:** Archive unit tests with `makeArchiveBindings` (which **does** pass `detectSpecOverlap`) fail overlapping archives. Kernel `specd change status` on an `archivable` overlapping change would report `spec.overlap` pass and no `OVERLAP_CONFLICT`.

This is the main discrepancy in this batch (see Discrepancies). ArchiveChange itself matches AC-02/AC-09/AC-26. GetStatus’s **injected type** `archiveBindings` matches the design; the **composed instances** do not share overlap I/O with ArchiveChange.

### Focus: `hook.pre` / `hook.post` as effects, not predicates

**Implemented.**

- Domain stubs: `kind: 'effect'`; `execute` returns skip (status never waits).
- Application: `HookEffectCheck.kind === 'effect'`; `createHookPre` / `createHookPost` take `RunStepHooks`.
- Bindings: `phase` + `onFailure` on the spec rows (transition both `before-persist`/`abort`; archive post `after-persist`/`collect`).
- `isEffectCheck` excludes them from predicate evaluation (`execute-matching-predicates.ts`, `evaluate-transition-predicates.ts`).
- Use cases launch via `matchingEffects` by **pipeline phase**, not `check.id` switch (`archive-change.ts` comments: “binding phase; not check id”).
- `instruction:` never appears as a Check id.

**Tests:** constructor “does not store RunStepHooks on the instance”; hook delegation via `makeArchiveBindings` → `createHook*`; transition skip/no-op tests; `transition-checks` matcher tests for along/forward/recovery.

### Focus: `ValidateArtifacts` ctor `ListWorkspaces`

**Implemented.** Second constructor argument is `ListWorkspaces`. `ValidateArtifactsDeps` / `resolveValidateArtifactsDeps` resolve `listWorkspaces: resolver.getListWorkspaces()`. No spec-repo map on the use case.

`execute` calls `this._lifecycle.evaluate(change, schema, { checksByTarget: {} })`.

**Tests:** every `new ValidateArtifacts(...)` in `validate-artifacts.spec.ts` passes `makeListWorkspaces(...)`. Dedicated scenario “evaluates lifecycle with empty checksByTarget”. No composition-package test file for `createValidateArtifacts`. No test that **asserts** “not a ReadonlyMap” by type/shape (covered only by TypeScript + helper usage).

### `core:get-artifact-instruction`

**Implemented** for this change’s deltas: `LifecycleEngine` ctor dep; config factory `resolveGetArtifactInstructionDeps` includes `lifecycle`; `evaluate` with `checksByTarget: {}`; `nextArtifact` auto-select; contextual vars `{ change: { name, path } }` only.

Still uses `ReadonlyMap<string, SpecRepository>` as specified (unlike ValidateArtifacts/ArchiveChange). Default `lifecycle = new LifecycleEngine(...)` on the class is extra vs the spec snippet (optional convenience; composition always injects).

**Tests:** `get-artifact-instruction.spec.ts` asserts `checksByTarget: {}`. No `packages/core/test/composition/use-cases/get-artifact-instruction.spec.ts`.

### `core:workflow-model` (non-hook)

**Implemented** for gating/hooks/axis as far as this batch’s files: requires/taskCompletion as named checks; `along` via `classifyAlong`/`exceptAlong`; archive not a hop; CompileContext not in these files (other batch). Status vs execute share **transition** bindings; they do **not** share overlap I/O (above).

---

## Discrepancies

Present both readings. Neither spec nor code is assumed correct.

### D1. GetStatus `archiveBindings` omit overlap detection (HIGH)

**Spec (this change):**

- `core:archive-change` AC-09/AC-26: evaluate `spec.overlap` on archive.
- `core:workflow-model` WM-03: status and execute share evaluation for requires (spirit: one contract).
- Sister spec `core:get-status` (same change, not in this file’s exclusive list) requires GetStatus, when `state === 'archivable'`, to run archive-scope predicates with `allowOverlap: false` so **live** `spec.overlap` can surface `OVERLAP_CONFLICT` + `--allow-overlap`.

**Code:**

- `GetStatus` **does** execute `this._archiveBindings` predicates in `archivable`.
- `resolveGetStatusDeps` does **not** pass `includeOverlapDetection: true`.
- `createSpecOverlap` then uses `() => ({ blocked: false })`.
- `resolveArchiveChangeDeps` **does** wire the real detector.

**If spec is right:** production status lies (green overlap) while `change archive` throws `SpecOverlapError`. Fix: share overlap-wired `archiveBindings` (or always pass `includeOverlapDetection: true` into the GetStatus registry).

**If code is right:** GetStatus should not pay for `list()` of all changes on every status of `archivable`. Then `core:get-status` / tasks 26.2 / GetStatus unit test that injects a failing overlap check are over-specified; default registry comment should be elevated into archive-change/get-status specs as an explicit exception.

**Evidence:** `packages/core/src/composition/use-cases/get-status.ts` vs `archive-change.ts`; `workflow-check-registry.ts` default detector; `get-status.spec.ts` live-overlap test only works with **injected** bindings.

### D2. Dual overlap listing inside `ArchiveChange.execute` (LOW / design smell)

**Spec:** overlap check uses `ChangeRepository.list` + `detectSpecOverlap`; `allowOverlap` then invalidates peers.

**Code:** predicates already run `spec.overlap` (when detector is wired). Execute **also** lists changes and calls `detectSpecOverlap` for `relevantOverlap` used in `throwMappedArchiveFailure` and invalidation.

**If spec is right:** acceptable as long as both use the same algorithm (they do in composition tests / `makeArchiveBindings`).

**If code is right:** could drop the private list and read peers from check `details` to avoid drift. Not a functional fail today when both paths share the repo.

### D3. CLI `--allow-out-of-scope` help vs AC-03 (LOW, copy)

**Spec:** skippable `impl.linksInScope` only; MUST NOT bypass `impl.filesResolved`.

**Code:** flags map correctly; `impl.filesResolved` ignores the flag.

**Help text** (`archive.ts`): “allow archive-time implementation sidecar updates outside the current change scope” — accurate for links-in-scope, silent on files-resolved. Spec-correct behavior; help could mention open tracked files still block.

**If spec is right:** help is incomplete, not a runner bug.  
**If help is the product contract:** would incorrectly imply all implementation guards are bypassed — they are not.

### D4. Optional `LifecycleEngine` defaults on ValidateArtifacts / GetArtifactInstruction (LOW)

**Spec snippets** show `lifecycle` as a required constructor parameter.

**Code:** default `new LifecycleEngine(Logger.debug.bind(Logger))` on both classes.

**If spec is right:** defaults hide missing composition (tests/kernel still inject).  
**If code is right:** spec TypeScript block should mark the parameter optional. Composition factories always pass the engine.

### D5. No contradiction found on effect-vs-predicate or skip no-ops

Hook kinds, `matchingEffects` vs `matchingPredicates`, skip selector table, and archive `phase`/`onFailure` match HEM-05 / WM-08 / AC-10 / AC-21. Not a discrepancy.

---

## Test Coverage

| Area                                                          | Status                                                                               | Where                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `source.pre` / `target.post` no-ops                           | Covered                                                                              | `transition-change.spec.ts`                              |
| `source.post` / `target.pre` skip                             | Covered                                                                              | same + CLI transition `--skip-hooks`                     |
| Archive skip `pre`/`post`/`all`                               | Covered (use case + CLI)                                                             | `archive-change.spec.ts`, `cli/.../archive.spec.ts`      |
| `allowOverlap` execute + invalidate                           | Covered                                                                              | `archive-change.spec.ts`                                 |
| `allowOutOfScope` execute                                     | Covered                                                                              | `archive-change.spec.ts`                                 |
| `impl.filesResolved` not skipped by allowOutOfScope           | Indirect (separate fail tests); no explicit “allowOutOfScope still fails open files” | archive / transition impl tests                          |
| Archive ctor no `RunStepHooks`                                | Covered                                                                              | `archive-change.spec.ts` constructor                     |
| `ArchiveChangeDeps` has `archiveBindings`, no `runStepHooks`  | Covered (shape)                                                                      | `composition/use-cases/archive-change.spec.ts`           |
| Hook effects kind + RunStepHooks on createHook\*              | Covered via bindings helpers                                                         | `helpers.ts` `makeArchiveBindings`, hook execution tests |
| GetStatus archive predicates + overlap **when bindings fail** | Covered                                                                              | `get-status.spec.ts` injected `archiveBindings`          |
| GetStatus **default/composed** overlap I/O                    | **Not covered** (would currently fail D1)                                            | —                                                        |
| ValidateArtifacts `ListWorkspaces` + empty `checksByTarget`   | Covered (usage + evaluate spy)                                                       | `validate-artifacts.spec.ts`                             |
| ValidateArtifacts factory `resolveValidateArtifactsDeps`      | **No composition spec file**                                                         | application tests only                                   |
| GetArtifactInstruction empty `checksByTarget`                 | Covered                                                                              | `get-artifact-instruction.spec.ts`                       |
| GetArtifactInstruction composition factory                    | **No composition spec file**                                                         | —                                                        |
| CLI `--allow-overlap` / `--allow-out-of-scope` argv → input   | **Missing**                                                                          | `cli/test/commands/change/archive.spec.ts`               |
| Workflow `along` / recovery omit hooks                        | Covered in transition-checks / transition-change (other + this)                      | matcher + “recovery omits hook” HEM scenarios            |

Broader archive atomicity (snapshots, restore, orphans) remains covered in `archive-change.spec.ts` / `archive-change-batch-restore.spec.ts` — treated as **still implemented**, not re-audited line-by-line in this focus pass.

---

## Missing Tests

1. **Composition: GetStatus live overlap** — two archivable-or-active peers sharing a specId; `createGetStatus(config)` / `resolveGetStatusDeps`; expect `blockers` `OVERLAP_CONFLICT` and `--allow-overlap`. Today this would document D1 (fail) or lock the noop detector (if spec is revised).
2. **CLI archive `--allow-overlap`** — assert `kernel.changes.archive.execute` received `{ allowOverlap: true }`.
3. **CLI archive `--allow-out-of-scope`** — assert `{ allowOutOfScope: true }`.
4. **`allowOutOfScope` does not skip `impl.filesResolved`** — open tracked file + `allowOutOfScope: true` still throws `ArchiveImplementationStateError` / filesResolved fail.
5. **Dedicated VA constructor contract** — assemble `createValidateArtifacts` / ctor and assert deps include `listWorkspaces` and do not include a spec-repo map field (verify.md “Constructor receives ListWorkspaces”).
6. **`createGetArtifactInstruction` composition** — deps include `lifecycle`; evaluate path not hop predicates (parity with validate-artifacts composition tests if added).
7. **Shared registry instance** — one `resolveWorkflowCheckRegistry(..., { includeOverlapDetection: true })` fed to both GetStatus and ArchiveChange (guards D1 regressions).

---

## Spec Dependency Chain (depth 1, this batch)

- `core:archive-change` → change, schema-format, delta-format, validate-artifacts, storage, run-step-hooks, hook-execution-model, template-variables, spec-metadata, content-extraction, architecture, workspace, spec-id-format, spec-overlap, logging, spec-lock, error-handling, regenerate-spec-metadata, spec-optimization, initialize-persisted-spec-state, composition-resolver, **transition-checks**
- `core:hook-execution-model` → workflow-model, schema-format, hook-runner-port, transition-change, archive-change, run-step-hooks, get-hook-instructions, config, cli transition/archive, **transition-checks**
- `core:workflow-model` → change, schema-format, build-schema, compile-context, get-status, transition-change, archive-change, hook-execution-model
- `core:validate-artifacts` → change, change-layout, change-manifest, lifecycle-engine, delta-format, selector-model, storage, architecture, spec-id-format, schema-format, composition-resolver, **transition-checks**
- `core:get-artifact-instruction` → delta-format, change, schema-merge, template-variables, lifecycle-engine, schema-format, composition-resolver, **transition-checks**

Consistency: change specs treat hooks as effects and skip as selector-based; that matches `core:transition-checks` binding specs. The GetStatus overlap I/O split is the only material cross-use-case contradiction.

---

## Summary counts

| Spec                          | Requirements | Implemented | Partial | Missing |                    Discrepancies | Covered |   Gaps |
| ----------------------------- | -----------: | ----------: | ------: | ------: | -------------------------------: | ------: | -----: |
| core:archive-change           |           32 |          30 |       2 |       0 | 2 (D1 composition, D2 dual list) |      28 |      4 |
| core:hook-execution-model     |           14 |          14 |       0 |       0 |                                0 |      13 |      1 |
| core:workflow-model           |           11 |          10 |       1 |       0 | 1 (status/execute overlap share) |       9 |      2 |
| core:validate-artifacts       |           27 |          27 |       0 |       0 |              1 (D4 default ctor) |      25 |      2 |
| core:get-artifact-instruction |           10 |          10 |       0 |       0 |              1 (D4 default ctor) |       8 |      2 |
| **Total**                     |       **94** |      **91** |   **3** |   **0** |             **5 unique (D1–D5)** |  **83** | **11** |

Focus outcomes: skip no-ops **pass**; allow flags **pass** in core (CLI tests missing); hooks-as-effects **pass**; ValidateArtifacts `ListWorkspaces` **pass**; archiveBindings vs GetStatus **fail in production composition** (D1).

---

## File: \_partial-cli.md

# Spec-compliance audit — CLI batch (`workflow-transition-checks`)

- **Change:** `workflow-transition-checks` (state: verifying)
- **Specs:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive` (merged via `changes spec-preview`)
- **Focus (recorte 26):** `--next` → `to: 'next'` (no CLI `HAPPY_PATH` table); text `review.message` + overlap peers; no `OVERLAP_CONFLICT` on invalidation; tests at `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts`; archive `--allow-out-of-scope`
- **Code:** `packages/cli/src/commands/change/{status,transition,archive,approve}.ts`
- **Graph:** treated as possibly stale; navigation used CLI sources/tests + spec-preview (not graph-only)
- **Read-only:** no source or spec edits

---

## Requirements Summary

### Recorte 26 (binding for this batch)

| ID    | Requirement                                                                                                                                                                                                                                           | Spec                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R26-1 | `--next` calls `TransitionChange.execute` with `to: 'next'`. CLI MUST NOT keep a from→to table and MUST NOT use `GetStatus.nextAction` as that resolution. Core owns `HAPPY_PATH_NEXT`.                                                               | `cli:change-transition` Next-transition resolution                 |
| R26-2 | Text status: `review:` header with `required` / `route` / `reason` / human `message` when Core supplies it. MUST NOT print `affectedArtifacts` paths under `review:`.                                                                                 | `cli:change-status` Text status omits duplicated review file lists |
| R26-3 | Invalidation overlap: print overlap peers (`overlapDetail`); MUST NOT show `OVERLAP_CONFLICT` as a blocker line for that invalidation path. JSON/TOON still serialize full `review` including `overlapDetail`. `--help` schema lists `overlapDetail`. | same + overlap verify scenario                                     |
| R26-4 | CLI tests live at `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts` mirroring `src/commands/change/*.ts` (`default:_global/testing`).                                                                                   | global testing + recorte 26                                        |
| R26-5 | `specd changes archive` / `change archive` signature lists `--allow-out-of-scope` and forwards it for `impl.linksInScope`.                                                                                                                            | `cli:change-archive` Command signature                             |

### `cli:change-status` (16 requirements)

1. Command signature (`status <name> [--format]`)
2. Drafted change status is read-only (`isDrafted`, no mutating transitions)
3. Output format (`hasTasks` on DAG; drift-aware `state`)
4. Task completion display in DAG (`[hasTasks - N/M done]` / fallback)
5. Display-state rendering (`complete-with-drift` vs canonical)
6. Lifecycle projections come from GetStatus checks (no local `VALID_TRANSITIONS` filter)
7. Text status omits duplicated review file lists (R26-2/3)
8. Text blockers include check labels (`! CODE — label: message`)
9. Schema version warning (stderr, exit 0; skip if `schemaInfo` null)
10. Change not found (exit 1, `error:`)
11. Schema-derived fields (`schema.artifactDag`, `childrenOf`, no duplicate convergent nodes)
12. Delegates refresh policy to GetStatus (no direct refresh/detector)
13. Implementation section (`--implementation` via SDK projection)
14. Task completion in details (`tasks: N/M`)
15. Basic info (name/state; no standalone `specs:` list)
16. Specs and dependencies (`specDependsOn`)

### `cli:change-transition` (14 requirements)

1. Command signature (`<step>` xor `--next`, `--skip-hooks`, `--format`)
2. Next-transition resolution (R26-1; Core reject → exit 1 + `error:`)
3. Delegates refresh to TransitionChange (`GetStatus` with `refreshImplementationTracking: false`)
4. Approval-gate routing (no gate flags; no rewrite to pending states)
5. Hook execution (`skipHookPhases` mapping)
6. Progress output (generic check bus; `stream: "change-transition"`; no `hook-progress`)
7. Transition hook observability
8. Shared hook progress presentation (distinct stream from `run-hooks`)
9. Output on success (text confirm; JSON/TOON terminal `complete`)
10. Post-hook failure (exit 2, `error:`, not a post-transition warning)
11. Invalid transition error (Repair Guide on stderr; JSON failure `complete` record)
12. Incomplete tasks error (exit 1, artifact named)
13. Check progress rendering (gerund labels, no `Executing:`)
14. Unsatisfied requires error

### `cli:change-approve` (7 requirements)

1. Command signatures (`spec` / `signoff`, `--reason` required)
2. Delegates gate state to kernel (`kernel.changes.approve*`, no gate flags)
3. Artifact hash computation (CLI MUST NOT compute/pass hashes)
4. Approve spec behaviour (stay in `ready`; drain `pending-spec-approval`; bound-from help)
5. Approve signoff behaviour (stay in `done`; drain `pending-signoff`)
6. Output on success (text / JSON `{ result, gate, name }`)
7. Error cases (missing reason, wrong state, not found)

### `cli:change-archive` (10 requirements)

1. Command signature (`changes archive` canonical, `change` alias; `--skip-hooks`, `--allow-overlap`, `--allow-out-of-scope`)
2. Prerequisites (`archivable` or exit 1 naming current state)
3. Behaviour (delegate `ArchiveChange`)
4. Hook execution (archive phase selectors)
5. Check progress rendering (same generic bus)
6. Post-archive hooks (exit 2 on post failures)
7. Output on success (path; omit empty invalidation section)
8. Output on success (extended) (`--allow-overlap` invalidation list)
9. JSON output on success (`stream: "change-archive"` complete; no extra unwrapped object)
10. Error cases (not found, not archivable, merge failure)

**Totals:** 47 requirements (16 + 14 + 7 + 10) plus 5 recorte-26 focus items (overlapping the tables above).

---

## Implementation Status

| Req                                         | Status                                            | Evidence                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R26-1 `--next` → `'next'`                   | **Compliant**                                     | `transition.ts`: `requestedTarget = opts.next === true ? 'next' : step`. `execute({ name, to: requestedTarget, skipHookPhases })`. No `HAPPY_PATH`, `resolveNextTarget`, or from→to switch in CLI. Tests assert `to: 'next'` for drafting/ready/signed-off and for Core `HappyPathNextUnavailableError` paths. |
| R26-2 `review.message`                      | **Compliant**                                     | `status.ts` prints `message:` when non-empty. Header always prints `required` / `route` / `reason`. No `affectedArtifacts` paths under `review:`.                                                                                                                                                              |
| R26-3 overlap / no `OVERLAP_CONFLICT`       | **Compliant**                                     | Overlap peers rendered from `review.overlapDetail` only when `reason === 'spec-overlap-conflict'`. CLI does not synthesize `OVERLAP_CONFLICT` blockers. JSON includes `review.overlapDetail` and `message`. `--help` schema lists `overlapDetail` next to `affectedArtifacts`.                                 |
| R26-4 test path mirror                      | **Partial**                                       | Dedicated files exist and cover recorte-26 behaviour. Leftover `packages/cli/test/commands/change.spec.ts` still hosts `describe('change status')` and `describe('change transition')` (including the artifact-drift omit-paths scenario). That violates one-file-per-src mirroring.                           |
| R26-5 `--allow-out-of-scope`                | **Compliant (code)** / **Partial (verify+tests)** | Option registered and forwarded as `allowOutOfScope: true` on `ArchiveChange.execute`. Help copy differs from spec (see D2). No CLI test; archive `verify.md` delta never added a scenario.                                                                                                                    |
| Status: drafted read-only                   | **Compliant**                                     | Draft branch: `(drafted)` header, `transitions: (none — change is drafted)`, JSON `isDrafted: true`.                                                                                                                                                                                                           |
| Status: projections from GetStatus          | **Compliant**                                     | Renders `lifecycle.availableTransitions` and `nextAction` as returned. No second `VALID_TRANSITIONS` filter.                                                                                                                                                                                                   |
| Status: blockers with labels                | **Compliant**                                     | `! ${code} — ${label}: ${message}` when `label` present. JSON maps `label` / `checkId` / `bypassFlag`.                                                                                                                                                                                                         |
| Status: refresh policy                      | **Compliant**                                     | Single `kernel.changes.status.execute({ name })`. Tests assert `refreshImplementationTracking.execute` not called.                                                                                                                                                                                             |
| Status: DAG / display / tasks / deps        | **Compliant**                                     | `renderDag` uses `displayStatus`, `childrenOf`, visited-set (no duplicate nodes), task tags. Details `tasks: N/M`. Specs section present; no standalone `specs:` line.                                                                                                                                         |
| Status: `getActiveSchema`                   | **Tension**                                       | DAG requirement needs `schema.artifactDag()`. Constraints forbid “another use case to recompute **lifecycle** data”. Call is for DAG shape, not availability. See D4.                                                                                                                                          |
| Transition: skip-hooks / progress / repair  | **Compliant**                                     | Check presenter `streamName: 'change-transition'`. Repair Guide on stderr from GetStatus. `HookFailedError` not in `isRepairGuideError` → exit 2 via `handleError`. Pre/post GetStatus uses `refreshImplementationTracking: false`.                                                                            |
| Transition: approval rewrite                | **Compliant**                                     | Passes user `to` / `'next'` unchanged. No pending-state rewrite.                                                                                                                                                                                                                                               |
| Transition: JSON failure stream             | **Partial**                                       | Repair-guide errors emit structured `complete` + `result: "failure"`. `HappyPathNextUnavailableError` is not a repair-guide error; JSON `--next` failure likely goes through `handleError` (not asserted).                                                                                                     |
| Approve: kernel routing / output            | **Compliant**                                     | `kernel.changes.approveSpec/Signoff.execute({ name, reason })`. Help uses bound-from language (`ready` / `done` + drain). Text/JSON success shapes match.                                                                                                                                                      |
| Archive: hooks / JSON stream / invalidation | **Compliant**                                     | Check bus `change-archive`. Text path + optional invalidated section. JSON single terminal `complete` record. Post-hook failures exit 2 before success print. `SpecOverlapError` custom stderr + `--allow-overlap` hint.                                                                                       |
| Archive: `changes` vs `change`              | **Compliant**                                     | `program.command('changes').alias('change')` then `registerChangeArchive`.                                                                                                                                                                                                                                     |

---

## Discrepancies

Neither spec nor code is automatically truth. Each item presents both readings.

### D1 — Medium — Recorte 26 test layout incomplete

**Spec (`default:_global/testing` + recorte 26):** tests live under `test/` mirroring `src/`. Recorte 26 names `packages/cli/test/commands/change/{status,transition,archive,approve}.spec.ts`.

**Code:** those four files exist and are the primary recorte-26 coverage. `packages/cli/test/commands/change.spec.ts` still imports `registerChangeStatus` / `registerChangeTransition` and keeps overlapping suites (JSON schema object, not-found, **artifact-drift text omit paths**, JSON `affectedArtifacts`, missing-step, invalid transition).

- **If spec is truth:** finish the split; move remaining status/transition cases into the mirrored files (or drop duplicates). Artifact-drift coverage currently lives only in the leftover file.
- **If code is truth:** recorte 26 is “at least these files exist”; leftover file is historical. Global testing still prefers one mirror file per source.

### D2 — Low — Archive `--allow-out-of-scope` help vs spec; verify gap

**Spec:** “permits archiving when implementation links resolve outside the change scope (`impl.linksInScope`)”.

**Code (`archive.ts` option description):** “allow archive-time implementation sidecar updates outside the current change scope”.

Forwarding `allowOutOfScope: true` matches Core skippable `impl.linksInScope`. Help implies sidecar mutation more than the predicate skip.

- **If spec is truth:** align Commander help (and any skill copy) to `impl.linksInScope`.
- **If code is truth:** spec/help should mention sidecar updates if that is the user-visible effect of the bypass.

**Also:** `cli:change-archive` **spec.md** lists the flag; **verify.md** (change delta) does not add a WHEN/THEN for it. Spec/verify drift inside the change.

### D3 — Low — Spec-gate / signoff-gate verify scenarios vs CLI unit tests

**Verify (`cli:change-transition`):** `transition … implementing` with spec gate on → exit 1, stay in `ready`; signoff analog for `archivable`.

**CLI tests:** mock `transition.execute` **success** and assert the CLI requested `implementing` / `archivable` / `to: 'next'` without pending names. Stay-in-state is Core, not CLI.

- **If spec is truth:** CLI-only tests cannot satisfy “exits with code 1”; need a kernel mock rejection (or integration). The **no pending rewrite** half is covered.
- **If code is truth:** those scenarios belong on `core:transition-change`; CLI spec should say “CLI must not rewrite targets; Core returns stay-in-state”.

### D4 — Low — `getActiveSchema` vs “no other use case for lifecycle”

**Constraint:** CLI MUST NOT call SchemaRegistry / config show / another use case to **recompute lifecycle data**.

**DAG requirement:** use resolved `Schema.artifactDag()`.

**Code:** `kernel.specs.getActiveSchema.execute()` to pick cached DAG vs `ArtifactDag.from(schemaInfo.artifacts)`.

Lifecycle lists still come from GetStatus. Ambiguous whether `getActiveSchema` is forbidden.

- **If spec is truth (strict):** pass DAG only from `lifecycle.schemaInfo` / GetStatus.
- **If DAG paragraph is truth:** the call is required for `childrenOf` parity.

### D5 — Low — JSON `--next` rejection stream

**Spec (Invalid transition):** JSON/TOON failures emit `stream: "change-transition"` `complete` with `result: "failure"`, `blockers`, `nextAction`.

**Code:** that path is only `isRepairGuideError` (`InvalidStateTransitionError`, `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`). `HappyPathNextUnavailableError` falls through to `handleError`.

- **If spec is truth for all failures:** `--next` JSON should be a stream complete record.
- **If spec is truth only for repair-guide errors:** `--next` text `error:` (tested) is enough; document JSON `--next` as `handleError` shape.

### D6 — Info — Archive prerequisites “naming the current state”

**Spec:** not `archivable` → exit 1 and `error:` **naming the current state**.

**Code:** delegates to Core; test mocks `InvalidStateTransitionError('done', 'archivable')` and only asserts `/error:/`. Message content is Core’s, not CLI-composed.

Not a CLI bug if Core messages include the state.

---

## Test Coverage

### Recorte 26

| Focus                                        | Covered?          | Where                                                                                                                                            |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--next` passes `to: 'next'`                 | **Yes**           | `transition.spec.ts`: drafting `--next`, ready `--next`, signed-off `--next`, pending/archivable refusals all `objectContaining({ to: 'next' })` |
| No local HAPPY_PATH table                    | **Yes (source)**  | No symbol in CLI src. Tests would not catch a reintroduced table except via `to` assertion                                                       |
| `review.message` printed                     | **Yes**           | `status.spec.ts` overlap case expects `message:  Conflict detected…`; JSON `parsed.review.message`                                               |
| Overlap peers                                | **Yes**           | `overlap:` bullets for beta/alpha                                                                                                                |
| No `OVERLAP_CONFLICT` on invalidation        | **Yes**           | `expect(out).not.toContain('OVERLAP_CONFLICT')` with empty `blockers: []`                                                                        |
| No `affectedArtifacts` paths under `review:` | **Yes** (overlap) | asserts absolute path absent. **Drift omit** is in `change.spec.ts`, not `status.spec.ts`                                                        |
| `--help` lists `overlapDetail`               | **No test**       | Present in `status.ts` `addHelpText`                                                                                                             |
| Tests in mirrored files                      | **Partial**       | Four files exist; leftover `change.spec.ts` still tests status/transition                                                                        |
| `--allow-out-of-scope` forwarded             | **No test**       | Implemented in `archive.ts` only                                                                                                                 |

### `cli:change-status` vs `status.spec.ts`

| Scenario family                                                  | Coverage                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Drafted JSON/text                                                | Yes                                                                             |
| Missing name / not found                                         | Yes                                                                             |
| Basic info, specs and dependencies, no `specs:`                  | Yes                                                                             |
| Available transitions passthrough / omit empty                   | Yes (does not prove CLI would not _add_ `verifying` from `VALID_TRANSITIONS`)   |
| Blockers without labels                                          | Yes (`MISSING_ARTIFACT`)                                                        |
| Blockers **with** gerund label                                   | **Missing** in status tests (label shape tested on **transition** repair guide) |
| Schema mismatch warning                                          | Yes                                                                             |
| JSON lifecycle + artifactDag `childrenOf` + hasTasks/drift state | Yes                                                                             |
| DAG tree + details `tasks: N/M`                                  | Yes                                                                             |
| Overlap header + peers + JSON overlapDetail                      | Yes                                                                             |
| Implementation `--implementation` / omit default                 | Yes                                                                             |
| artifact-review-required omit paths + `message`                  | **Missing** in `status.spec.ts`                                                 |
| artifact-drift omit paths + `[drift]`                            | **Only** `change.spec.ts`                                                       |
| nextAction `/specd-verify` not overwritten                       | **Missing**                                                                     |
| Convergent DAG node once                                         | **Missing** (visited-set in code)                                               |
| `schemaInfo === null` skips warning                              | **Missing**                                                                     |
| JSON `blockers[].label`                                          | **Missing** (code maps it)                                                      |

### `cli:change-transition` vs `transition.spec.ts`

| Scenario family                                                   | Coverage                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Missing step / mutual exclusion / `--next`                        | Yes                                                                             |
| No pending rewrite on explicit step / `--next`                    | Yes (success mocks)                                                             |
| Signed-off `--next` → Core `'next'`                               | Yes                                                                             |
| Core `--next` refusals + explanatory stderr                       | Yes (pending-spec, pending-signoff, archivable)                                 |
| HookFailedError exit 2, no repair guide, check-bus `✗`            | Yes                                                                             |
| Text success; JSON NDJSON `change-transition` not `hook-progress` | Yes                                                                             |
| Predicate gerund progress, no `Executing:`                        | Yes                                                                             |
| Repair Guide stderr; refresh false twice                          | Yes                                                                             |
| Repair recommends `/specd-verify`                                 | Yes                                                                             |
| Approval-required signoff message                                 | Yes                                                                             |
| skip-hooks `all` / default empty / comma phases                   | Yes                                                                             |
| Incomplete tasks → exit 1 + repair                                | Yes (does not assert artifact name in CLI-composed text beyond Core error)      |
| JSON structured **failure** complete record                       | **Missing**                                                                     |
| skip `target.pre` only vs `source.post` only (separate tests)     | Partial (comma-separated covered; not isolated pre vs post)                     |
| Unsatisfied requires surfaced                                     | Implicit via repair-guide missing artifact; no dedicated requires-progress test |
| Gate exit-1 stay-in-ready                                         | **Missing** as CLI mock-failure (D3)                                            |

### `cli:change-approve` vs `approve.spec.ts`

| Scenario family                        | Coverage                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Success text/JSON spec + signoff       | Yes                                                                                |
| Stay-in-ready / stay-in-done messaging | Yes (stdout has no pending hop)                                                    |
| Drain from pending-\*                  | Yes (CLI still calls execute; does not print “moved to pending”)                   |
| Missing `--reason` / unknown sub-verb  | Yes                                                                                |
| Not found / wrong state                | Yes (wrong state via `ApprovalGateDisabledError`, not designing-state typed error) |
| Execute `{ name, reason }` only        | Yes                                                                                |
| `kernel.specs.approve*` never called   | **Not asserted** (mock kernel likely unused)                                       |
| CLI did not pass hashes                | Implicit (call shape)                                                              |

### `cli:change-archive` vs `archive.spec.ts`

| Scenario family                                         | Coverage                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Text path; JSON stream complete; no second object       | Yes                                                         |
| Invalidated N changes text + JSON                       | Yes                                                         |
| Post-hook exit 2, no success line                       | Yes                                                         |
| Not found / missing name / not archivable               | Yes                                                         |
| skip-hooks all/pre/post/pre,post/default empty          | Yes                                                         |
| Check progress gerund + hook.pre lines, no `Executing:` | Yes                                                         |
| `--allow-overlap` forwarded                             | **Missing** (no `allowOverlap` in CLI tests at all)         |
| `--allow-out-of-scope` forwarded                        | **Missing**                                                 |
| `SpecOverlapError` stderr + hint                        | **Missing**                                                 |
| Singular alias vs `changes archive`                     | Not in this file; wiring is `changes` + alias at entrypoint |
| Merge/parse failure descriptive error                   | **Missing** (delegated to `handleError`)                    |

---

## Missing Tests

Priority for recorte 26 close-out:

1. **`archive.spec.ts`:** `--allow-out-of-scope` → `execute` input includes `allowOutOfScope: true`; omitted flag does not set it.
2. **`archive.spec.ts`:** `--allow-overlap` → `allowOverlap: true`; `SpecOverlapError` prints overlap list and `--allow-overlap` hint.
3. **`status.spec.ts`:** move or duplicate artifact-drift omit-paths (and JSON `affectedArtifacts`) from `change.spec.ts`; add `artifact-review-required` + `review.message` without reprinting paths.
4. **`status.spec.ts`:** text+JSON blocker with `label` / `checkId` (`DEPS_INCONSISTENT — Checking spec dependencies`).
5. **`status.spec.ts`:** `nextAction.command === '/specd-verify'` is printed as-is (CLI does not substitute `/specd-implement`); `availableTransitions` omitting `verifying` while `validTransitions` includes it (CLI does not merge).
6. **`status.spec.ts` or `--help` parse:** help JSON schema mentions `overlapDetail`.
7. **`transition.spec.ts`:** JSON mode repair-guide failure emits terminal `{ stream: "change-transition", event: { type: "complete", result: { result: "failure", blockers, nextAction } } }`.
8. **`transition.spec.ts` (optional):** JSON `--next` + `HappyPathNextUnavailableError` documents actual `handleError` vs stream contract (D5).
9. **Finish D1:** stop testing status/transition from `test/commands/change.spec.ts` once mirrored files own those cases.

Lower priority (pre-existing vs recorte 26): convergent DAG once; `schemaInfo` null skips warning; isolated `--skip-hooks target.pre` vs `source.post`; approve `kernel.specs.*` not invoked; archive merge-error message.

---

## Spec dependency chain (depth 1, change-declared)

| Spec                    | Depends on                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:change-status`     | `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`                              |
| `cli:change-transition` | `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`, `core:transition-checks`          |
| `cli:change-approve`    | `cli:entrypoint`, `core:change`, `core:transition-checks`                                                                                    |
| `cli:change-archive`    | `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks` |

**Conformance to globals:** recorte 26 removed the CLI happy-path table, which previously conflicted with `default:_global/architecture` (domain logic in adapters). Current CLI `--next` forwarding is consistent with that constraint. Remaining global tension is **test file mirroring** (D1), not transition routing.

No contradiction found between these four CLI specs and `core:transition-checks` on: `'next'` resolution in Core, invalidation as `review` not `OVERLAP_CONFLICT`, archive `--allow-out-of-scope` for `impl.linksInScope`.

---

## Summary counts

| Metric                     | Count                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Specs in this partial      | 4                                                                                                                     |
| Requirements reviewed      | 47 (+ 5 recorte-26 focus rows)                                                                                        |
| Compliant                  | 42                                                                                                                    |
| Partial                    | 5 (R26-4 layout; R26-5 verify/tests; JSON `--next` failure stream; spec-gate CLI tests; `getActiveSchema` constraint) |
| Missing implementation     | 0                                                                                                                     |
| Discrepancies              | 6 (D1–D6)                                                                                                             |
| Missing tests (actionable) | 9 listed                                                                                                              |

**Recorte 26 score:** implementation of `--next`, review header/message/overlap, and `--allow-out-of-scope` **matches the change specs**. Gaps are **verify/test completeness** (archive flags, status scenarios still in `change.spec.ts`) and **help-text wording** for `--allow-out-of-scope`.

---

## File: \_partial-remaining.md

# Partial audit: remaining specs (recorte 26)

**Batch:** remaining (`skills:skill-templates-source`, `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:schema-format`, `core:storage`)  
**Mode:** change (`workflow-transition-checks`) via `changes spec-preview`  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** not re-indexed this batch (parent: may be stale). Navigation via spec-preview + targeted reads.  
**CLI:** `node packages/cli/dist/index.js`  
**Workspace:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`  
**Do not treat as source of truth:** implementation vs previewed spec vs `default:_global/architecture` (no delta of architecture in this change).

**Recorte 26 focus:**

- storage/change saneo: wire `pending-parent-artifact-review` → `in-progress` on load/save; Zod MUST accept the wire token; `ArtifactFile` still rejects in memory
- ApproveSpec describe titles not pending-centric if spec says so
- skill templates stay-in-state; archive `--skip-hooks pre`

---

## Method

- Spec content: `changes spec-preview workflow-transition-checks <specId> --format text`
- Architecture: `specs show default:_global/architecture --format text` (baseline, no change delta)
- Deltas: `deltas/core/{storage,schema-format,approve-spec,approve-signoff,config}` and `deltas/skills/skill-templates-source`
- Implementation:
  - `packages/core/src/infrastructure/fs/manifest.ts` (`artifactStatusSchema`)
  - `packages/core/src/infrastructure/fs/change-repository.ts` (load coerce ~1422, `persistableArtifactStatus` ~1700)
  - `packages/core/src/domain/value-objects/artifact-file.ts`
  - `packages/core/src/domain/entities/change-artifact.ts`
  - `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`
  - `packages/core/src/composition/use-cases/approve-spec.ts`, `approve-signoff.ts`
  - `packages/core/src/infrastructure/fs/config-loader.ts` (`approvals` defaults)
  - `packages/core/src/domain/services/build-schema.ts` / `build-schema.spec.ts`
  - `packages/skills/templates/skills/*/SKILL.md.tpl`, `templates/shared/shared.md.tpl`
- Tests: `change-repository.spec.ts`, `artifact-file.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, composition factory specs, `template-workflow.spec.ts`, `config-loader.spec.ts`, `lifecycle-engine.spec.ts`

---

## Recorte 26 focus (executive)

| Focus                                                    | Verdict                                    | Evidence                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire `pending-parent-artifact-review` saneo on load/save | **Compliant** (with intra-spec tension D1) | Load: `if (status === 'pending-parent-artifact-review') status = 'in-progress'` before `new ArtifactFile`. Save: `persistableArtifactStatus` remaps artifact and file `state`. Test `given wire pending-parent-artifact-review, when get then save, then status is in-progress`. |
| Zod accepts the wire token                               | **Compliant**                              | `artifactStatusSchema` includes `'pending-parent-artifact-review'`. Without that, the integration test would fail at parse, not at coerce. No isolated Zod unit test (MT3).                                                                                                      |
| `ArtifactFile` rejects token in memory                   | **Compliant**                              | Constructor throws `InvalidChangeError`. `artifact-file.spec.ts` `rejects persist of pending-parent-artifact-review`.                                                                                                                                                            |
| ApproveSpec describe titles not pending-centric          | **Compliant**                              | Happy-path `describe('given the spec approval gate is enabled and change is in ready')`. Drain is explicitly labelled `(drain)`. Signoff mirrors `…change is in done`.                                                                                                           |
| Skill templates stay-in-state                            | **Compliant**                              | Templates + `template-workflow.spec.ts`: stay in `ready`/`done`; no happy-path `pending-*`; new-skill drain-only rows; entry skill does not teach signoff.                                                                                                                       |
| Archive `--skip-hooks pre`                               | **Compliant**                              | Archive examples use `--skip-hooks pre`; test forbids `archive <name> --skip-hooks all` and post `run-hooks … --phase post`; still requires `hook-instruction … --phase post`.                                                                                                   |

---

## Requirements Summary

### skills:skill-templates-source (18 requirements)

Change deltas add four requirements; the rest are unchanged template-contract rules.

| #   | Requirement                                                   | Normative gist (preview)                                                                                                         |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Template source location                                      | `.tpl` under `packages/skills/templates`; install drops suffix                                                                   |
| K2  | Template migration                                            | Migrated tree complete; obsolete metadata skill absent                                                                           |
| K3  | Template metadata contract                                    | kind + requirements; capability catalogue                                                                                        |
| K4  | Capability-aware install-time rendering                       | Branch on capabilities; `sharedFolder` vars; no absolute shared paths                                                            |
| K5  | Graph impact terminology                                      | dependents vs downstream; `--file`                                                                                               |
| K6  | Graph search snippet guidance                                 | `--snippet` opt-in                                                                                                               |
| K7  | Frontmatter source                                            | Canonical contracts                                                                                                              |
| K8  | Frontmatter injection                                         | Filter by runtime; shared files get none                                                                                         |
| K9  | Agent frontmatter matrix                                      | Known runtime fields                                                                                                             |
| K10 | Why no frontmatter in skills package                          | Value-driven metadata                                                                                                            |
| K11 | Implementation tracking instructions                          | add + review-state before archive                                                                                                |
| K12 | Metadata self-healing                                         | No metadata-status scans; generate-metadata forced-rebuild only                                                                  |
| K13 | Optimizer agent gating                                        | `project status` gate                                                                                                            |
| K14 | Agent-facing command roles                                    | show/context/metadata roles; archive diagnostics                                                                                 |
| K15 | **In-place approval gates in workflow templates**             | Stay-in-`ready`/`done`; no `change transition` into pending; drain-only mentions; no `source.post` on backward/redesign/recovery |
| K16 | **Implementation tracking in verify and implement templates** | Shared cookbook; verify drains open files; implement zero-open before `/specd-verify`                                            |
| K17 | **Archive skill skips only pre hooks**                        | `changes archive --skip-hooks pre` not `all`; no post `run-hooks`; MAY `hook-instruction` post                                   |
| K18 | **Design skill review scope without review file lists**       | Do not list files under text `review:`; scope from `artifacts (details):` / `affectedArtifacts`                                  |

Direct deps (preview): `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`.

### core:approve-spec (8 requirements)

| #   | Requirement                             | Normative gist                                                                                                                                                        |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Gate guard                              | `approvals.spec: false` → `ApprovalGateDisabledError` before I/O                                                                                                      |
| P2  | Change lookup                           | Missing name → `ChangeNotFoundError`                                                                                                                                  |
| P3  | Artifact hash computation               | Schema once from `SchemaProvider.get()`; skip missing/skipped; skip null load; cleanup then hash; keys `type:key`                                                     |
| P4  | Approval recording and state transition | `recordSpecApproval`; stay in bound `from` (`ready`); MUST NOT transition to pending or `spec-approved` on that path; drain `pending-spec-approval` → `spec-approved` |
| P5  | Persistence and return value            | `mutate`; no pending/`spec-approved` hop from bound from; return updated `Change`                                                                                     |
| P6  | Input contract                          | `name` + `reason` only                                                                                                                                                |
| P7  | Approval gate baked at construction     | `approvals: ApprovalGates`; not per-call flags                                                                                                                        |
| P8  | Config-based factory                    | `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`; `contentHasher`                                                                                       |

Direct deps: `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

### core:approve-signoff (8 requirements)

Symmetric to ApproveSpec: stay in `done`; drain `pending-signoff` → `signed-off`; `resolveApproveSignoffDeps`.

### core:config (25 requirements)

Unchanged except **Approvals**: `approvals.spec` / `approvals.signoff` are in-place checks; new work MUST NOT enter pending via `change transition`; redesign `ready → designing` MUST NOT require spec gate; verify scenario “Spec gate on does not require pending-spec-approval in the graph”.

Other requirements (location, privacy, env, local override, cascade, schema ref, invalidation, workspaces, graph, storage, named adapters, configPath, templates, plugins, overrides, context, contextMode, instructions, logging, LLM, plugin declarations, ConfigWriter, startup validation, legacy warnings) are not delta’d in this change.

Direct deps: `core:vcs-adapter-port`, `default:_global/architecture`, `core:transition-checks`.

### core:schema-format (22 requirements)

Delta focus:

| #   | Requirement                       | Delta gist                                                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Schema file structure             | `workflow` is lookup rows on existing Change states, not a state-machine definition                                                         |
| F2  | Schema kind field                 | schema vs plugin                                                                                                                            |
| F3  | Schema extends                    | chains, cycles                                                                                                                              |
| F4  | Array entry identity              | unique ids                                                                                                                                  |
| F5  | Artifact definition               | `requires` cascade via `LifecycleEngine.projectArtifacts`; no `Change.effectiveStatus()`; review parents → `pending-parent-artifact-review` |
| F6  | Schema artifact DAG API           | `artifactDag()`                                                                                                                             |
| F7  | Canonical artifact DAG derivation |                                                                                                                                             |
| F8  | preHashCleanup                    |                                                                                                                                             |
| F9  | taskCompletionCheck               |                                                                                                                                             |
| F10 | Template resolution               |                                                                                                                                             |
| F11 | Validation rules                  |                                                                                                                                             |
| F12 | Delta validation rules            |                                                                                                                                             |
| F13 | Cross-artifact validation rules   |                                                                                                                                             |
| F14 | Per-spec approval                 |                                                                                                                                             |
| F15 | Metadata extraction               |                                                                                                                                             |
| F16 | Artifact scope                    |                                                                                                                                             |
| F17 | Workflow                          | lookup + axis; omitted step does not delete protocol state; unknown `step` → `SchemaValidationError` at `buildSchema`                       |
| F18 | Explicit external hook entries    |                                                                                                                                             |
| F19 | Schema plugin kind                |                                                                                                                                             |
| F20 | Schema resolution                 |                                                                                                                                             |
| F21 | Schema validation on load         |                                                                                                                                             |
| F22 | verify.md format                  |                                                                                                                                             |

### core:storage (21 requirements)

Delta: **Artifact dependency cascade** only.

| #      | Requirement                                                                                                                                       | Notes                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | Change directory naming                                                                                                                           | Unchanged                                                                                                                                               |
| T2     | Change directory listing order                                                                                                                    | Unchanged                                                                                                                                               |
| T3     | Artifact status derivation                                                                                                                        | Status derived from hash/file; **“must not be stored directly in the manifest”** — conflicts with T4 + actual `state` field (D1)                        |
| T4     | **Artifact dependency cascade**                                                                                                                   | Engine owns cascade; load/save MUST rewrite file token `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` MUST NOT accept token in memory |
| T5–T21 | ValidateArtifacts sole complete path, archive pattern, indexes, manifest format, confinement, staged archive, logging, locks, fs-cache, gitignore | Unchanged this recorte                                                                                                                                  |

Direct deps: architecture, `core:change`, `core:change-manifest`, logging, `core:lifecycle-engine`, `core:schema-format`.

---

## Implementation Status

### Recorte 26 (this batch)

| Area                        | Status                | Notes                                                                                                              |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Zod wire token              | Implemented           | `packages/core/src/infrastructure/fs/manifest.ts` `artifactStatusSchema` includes `pending-parent-artifact-review` |
| Load coerce                 | Implemented           | `change-repository.ts` ~1422–1424, before `ArtifactFile` construction                                              |
| Save coerce                 | Implemented           | `persistableArtifactStatus` on file `state` and aggregate `artifact.status`                                        |
| ArtifactFile reject         | Implemented           | Constructor `InvalidChangeError`                                                                                   |
| ApproveSpec stay-in-ready   | Implemented           | `recordSpecApproval` then `transition` only if `pending-spec-approval`                                             |
| ApproveSignoff stay-in-done | Implemented           | Symmetric                                                                                                          |
| boundFromStates             | Implemented           | Use cases read engine bindings; drafting throws `InvalidStateTransitionError`                                      |
| Composition factories       | Implemented           | `resolveApprove*Deps` + `contentHasher`; config form via `createCompositionResolver`                               |
| Skill stay-in-state copy    | Implemented           | design/implement/verify/new/archive/entry/shared                                                                   |
| Archive skip pre            | Implemented           | `--skip-hooks pre` examples; post `hook-instruction` only                                                          |
| schema-format unknown step  | Implemented           | `build-schema.spec.ts` rejects `step: reviewing`                                                                   |
| schema-format cascade copy  | Implemented in engine | `lifecycle-engine.ts` `_effectiveStatus`; not on `Change`                                                          |
| config approvals defaults   | Implemented           | `config-loader.ts` `?? false`                                                                                      |

### Unchanged requirements in these specs

Treated as **implemented / not re-litigated** except where they contradict the delta (D1) or architecture (below). Storage T3 vs T4 is the only material intra-spec clash in this batch.

### Architecture alignment (no architecture delta)

| Architecture rule                                                  | This batch                                                                                  | Verdict                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain layer is pure                                               | Coerce lives in fs repository; `ArtifactFile` throw is domain                               | **Aligned**                                                                                                                                                                                                                     |
| YAML/JSON validated at infrastructure boundary then domain objects | Zod accepts wire token; coerce **before** `new ArtifactFile`                                | **Aligned** with recorte 26. If Zod rejected the token, load would throw — that would violate storage T4.                                                                                                                       |
| Rich domain entities own transitions                               | `Change.transition` still entity-enforced; stay-in-place approvals do not call `transition` | **Aligned**. `recordSpecApproval` / `recordSignoff` append history with **no** state guard (policy is in the use case + `boundFromStates`). That is application policy from `core:transition-checks`, not a missing entity hop. |
| Use cases do not duplicate entity invariants                       | From-state for approve is **not** an entity invariant today                                 | **Not a contradiction**. Moving the guard onto `Change` would be a design choice, not required by the change specs.                                                                                                             |
| Workflow is not the protocol machine                               | schema-format F1/F17 + Change `VALID_TRANSITIONS`                                           | **Aligned** with architecture (entity owns the machine).                                                                                                                                                                        |
| Adapter packages contain no business logic                         | Skills templates encode agent procedure                                                     | Skills are **not** listed as adapter packages in architecture (`cli`/`mcp`/`plugin-*`). **No contradiction.**                                                                                                                   |
| No `Change.effectiveStatus()`                                      | Grep: no method on `Change`; engine `projectArtifacts`                                      | **Aligned**                                                                                                                                                                                                                     |

---

## Discrepancies

Neither side assumed true. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `core:storage` T3 vs T4 (and vs code)

**Spec A (T3 Artifact status derivation, unchanged):** artifact status `missing` / `in-progress` / `complete` / `skipped` **must be derived at load** and **must not be stored directly in the manifest**. Manifest stores only `validatedHash`.

**Spec B (T4 Artifact dependency cascade, this change):** if a **persisted file token** is `pending-parent-artifact-review`, load/save MUST rewrite it to `in-progress`. That presupposes a persisted `state` token.

**Code:** `manifest.json` files and artifacts have `state`; Zod validates it; serialize writes `state: persistableArtifactStatus(...)`.

**Interpretations:**

1. **Spec T3 is stale; T4 + code are right** (compatibility `state` plus hash derivation). Recorte 26 / design.md / `core:change` saneo text support this.
2. **T3 is right; T4 and code are wrong** — drop `state` from the wire; never persist status; then saneo is unnecessary.
3. **Both partially right** — derive when hash/file disagree; keep `state` only as a legacy hint that must be coerced.

**Architecture:** validating JSON at the fs boundary then constructing domain objects **favors T4+code** (coerce then `ArtifactFile`). Architecture does **not** require “never persist status.” T3 is the outlier vs architecture + this change.

**This change does not delta T3**, so the contradiction is inherited and newly sharpened by T4.

### D2 — Low — `core:storage` verify.md omits saneo scenario

**Spec.md T4** requires load/save rewrite. **verify.md** cascade scenarios only cover engine `projectArtifacts` (upstream edited / skipped) — **no** WHEN wire token THEN `in-progress` scenario. Code test exists (`change-repository.spec.ts`).

**Interpretations:** verify artifact lag vs spec.md (spec incomplete); or saneo is implementation-only and should not be in storage verify (then spec.md T4 over-specifies storage verify).

### D3 — Low — `ChangeArtifact` JSDoc vs `ArtifactFile` invariant

**Code:** `_recomputeStatus` JSDoc still ranks `pending-parent-artifact-review` among **file** states. There is **no** `if (states.some === 'pending-parent-artifact-review')` branch; `ArtifactFile` cannot hold the token, so aggregate cannot recompute it from files.

**Interpretations:** comment drift (code/spec T4 right); or aggregate should still accept the token in memory (spec T4 / ArtifactFile reject would be wrong).

### D4 — Low — ApproveSpec/ApproveSignoff persist spy only on drain path

**verify.md (this change):** Persistence GIVEN successful approval **from `ready` / `done`**, THEN `mutate` was called AND returned state is `ready` / `done`.

**Code tests:** ready/done tests assert `result.state` and active approval. `mutate` spy lives under pending drain describes only.

**Interpretations:** implementation is fine, tests incomplete (likely); or persist-from-ready is unproven if the fake repo’s `execute` path skipped `mutate` (the fake `makeChangeRepository` typically implements `mutate` — residual risk is coverage, not a demonstrated bug).

### D5 — Low — `core:config` verify scenario is not a config-loader assertion

**verify:** GIVEN `approvals.spec: true`, WHEN ready evaluated for `implementing`, THEN wait is `approval.spec` AND config MUST NOT be documented as requiring a pending hop.

**config-loader tests:** parse booleans only. Graph/wait behavior is `LifecycleEngine` / `approval.spec` check (other specs). “MUST NOT be documented” is docs/skill copy, not YAML load.

**Interpretations:** scenario belongs on `core:transition-checks` / `core:config` docs (spec placement); or config package should own a documentation contract test (missing test).

### D6 — Low — schema-format “omitted workflow step” has no dedicated resolve test

**verify:** GIVEN `workflow[]` omits `implementing`, WHEN schema resolved, THEN `implementing` remains a valid Change lifecycle state AND workflow only attaches extras to listed steps.

**Code:** `ChangeState` union always includes `implementing`. `build-schema.spec.ts` rejects unknown `reviewing`. Engine test: omit implementing → no extras row. No `buildSchema` test whose `workflow` array lacks `implementing` and then asserts `isValidTransition(..., 'implementing')` still true.

**Interpretations:** scenario is protocol-true by construction (no test needed); or verify wants an explicit schema fixture (missing test).

### D7 — Info — ApproveSpec hashes inside `mutate`

**spec P5:** “After computing artifact hashes, the use case MUST record the approval through `mutate`.” **Code:** hashes computed **inside** the mutate callback on `freshChange`. Safer for serialization; wording implies hash-then-mutate.

**Interpretations:** spec prose order vs implementation order; both intend one serialized mutation. Not counted as a defect unless a reviewer wants literal sequencing.

---

## Test Coverage

| Requirement / recorte 26 item     | Tests                                                               | Adequacy                                                                     |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Zod accepts wire token            | Implicit in change-repository load test (parse would throw first)   | Partial — no `artifactStatusSchema.parse` unit                               |
| Load/save coerce                  | `change-repository.spec.ts` get-then-save                           | Adequate                                                                     |
| ArtifactFile reject               | `artifact-file.spec.ts`                                             | Adequate                                                                     |
| Engine cascade pending-parent     | `lifecycle-engine.spec.ts`; get-status drafted dependents           | Adequate (engine spec, not storage verify)                                   |
| ApproveSpec ready stay            | `approve-spec.spec.ts` `records consent and stays in ready`         | Adequate for state; persist spy gap (D4)                                     |
| ApproveSpec drain                 | pending describe + `spec-approved`                                  | Adequate                                                                     |
| ApproveSpec gate/lookup/mismatch  | disabled, not-found, schema mismatch                                | Adequate                                                                     |
| ApproveSpec factory               | `composition/use-cases/approve-spec.spec.ts`                        | Partial — does not assert `resolveApproveSpecDeps` / `contentHasher` by name |
| ApproveSignoff                    | symmetric                                                           | Same as spec                                                                 |
| Config approvals defaults/enabled | `config-loader.spec.ts` `parses approvals booleans`                 | Adequate for YAML; D5 for graph wait                                         |
| Unknown workflow step             | `build-schema.spec.ts` `reviewing`                                  | Adequate                                                                     |
| Omitted workflow step             | engine extras-row test only                                         | Partial (D6)                                                                 |
| Skill stay-in-state               | `template-workflow.spec.ts` `does not teach pending parking…`       | Adequate                                                                     |
| Archive skip pre                  | `archive skips only pre hooks…`                                     | Adequate                                                                     |
| Design review header              | `design skill does not treat the text review header as a file list` | Adequate                                                                     |
| Impl tracking templates           | `verify drains open…`                                               | Adequate                                                                     |

---

## Missing Tests

1. **storage verify.md scenario** for wire `pending-parent-artifact-review` → load/save `in-progress` (behavior already tested in code).
2. **Isolated Zod test** that `artifactStatusSchema` / `manifestArtifactFileSchema` **accept** `pending-parent-artifact-review` and **reject** unknown tokens (proves recorte 26 “do not throw on wire JSON” at the schema, not only via repository).
3. **ApproveSpec / ApproveSignoff** `mutate` spy on the **ready / done** happy path (verify Persistence).
4. **config** contract that enabled `approvals.spec` does not imply a pending hop — only if the scenario stays on `core:config` (otherwise move the scenario).
5. **schema-format** fixture: `workflow[]` without `implementing` still resolves; `implementing` remains `ChangeState` / protocol-legal.
6. **Factory** tests that config `createApproveSpec(config)` goes through `resolveApproveSpecDeps` and `contentHasher` (verify factory scenario is currently only “returns instance”).

---

## Spec Dependency Chain

```
default:_global/architecture          (no delta; constraint baseline)
        ↑
core:config ──→ core:transition-checks, architecture
core:schema-format ──→ (lifecycle-engine / change via prose)
core:storage ──→ architecture, change, change-manifest, logging, lifecycle-engine, schema-format
core:approve-spec ──→ change, schema-format, composition, kernel, composition-resolver, transition-checks
core:approve-signoff ──→ (same)
skills:skill-templates-source ──→ skill, spec-optimizations, workflow-automation, transition-checks
```

**Contradiction vs architecture (no architecture delta):** none that reverse hexagonal rules for this recorte. The live clash is **storage T3 vs T4/code**, and T3 is the side that is **less** aligned with architecture’s “validate at boundary, then construct domain.” Stay-in-state approvals and workflow-as-lookup **match** architecture (entity owns `VALID_TRANSITIONS`; schema does not).

---

## Summary counts

| Spec                          | Requirements (preview) | Implemented              | Partial / gaps                            | Discrepancies touching spec |
| ----------------------------- | ---------------------- | ------------------------ | ----------------------------------------- | --------------------------- |
| skills:skill-templates-source | 18                     | 18                       | 0                                         | 0                           |
| core:approve-spec             | 8                      | 8                        | persist spy (D4), hash-inside-mutate (D7) | D4, D7                      |
| core:approve-signoff          | 8                      | 8                        | persist spy (D4)                          | D4                          |
| core:config                   | 25                     | 25 (approvals delta yes) | D5 scenario placement                     | D5                          |
| core:schema-format            | 22                     | 22                       | omitted-step fixture (D6)                 | D6                          |
| core:storage                  | 21                     | 20 + T3/T4 clash         | verify saneo (D2), Zod unit (MT2)         | D1, D2, D3                  |

**Totals for this partial:** requirements checked **102**; recorte-26 focus items **6/6 compliant in code**; discrepancies **7** (1 medium, 5 low, 1 info); missing tests **6**.
