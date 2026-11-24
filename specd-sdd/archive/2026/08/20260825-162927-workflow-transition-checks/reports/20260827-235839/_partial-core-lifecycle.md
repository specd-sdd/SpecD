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
