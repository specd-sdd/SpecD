# Specs-compliance audit — change `workflow-transition-checks`

- **Timestamp:** 20260828-163121
- **Mode:** `--change workflow-transition-checks` (re-audit after H1 / M1–M6 fixes)
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **State at audit:** `designing`; review `artifact-drift` on several spec deltas
- **Read-only.** No code or spec files were modified.
- **Graph:** `graph index` worker exited unexpectedly (`CLI_ERROR` / exit 3). Subagents used `graph search` where it still resolved, then Read/Grep.

**Scope:** 20 change specs + project-wide globals (architecture, testing, conventions, spec-layout) + depth-1 consistency. CLI: `node packages/cli/dist/index.js`. Specs via `changes spec-preview`.

---

## Executive summary

**Unique HIGH: 0. Unique MEDIUM: 0.** Prior H1 and M1–M6 from `20260828-144106` are **CLOSED**. H2 (baseline drift ownership) did not regress.

| Prior ID | Status                 | What closed it                                                                                           |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **H1**   | CLOSED                 | `INCOMPLETE_ARTIFACT` for missing and in-progress; no `MISSING_ARTIFACT` in production core              |
| **H2**   | CLOSED (no regression) | Load-time `FsChangeRepository.get` + `SYSTEM_ACTOR`; ValidateArtifacts consent hashes only               |
| **M1**   | CLOSED                 | GetStatus overlay: `/specd-archive`, `targetStep` `archivable`, reason names overlap / `--allow-overlap` |
| **M2**   | CLOSED                 | `invalidate()` is the designing hop; no second `transition('designing')`                                 |
| **M3**   | CLOSED                 | Archive factory: `archiveBindings` / `materializeMetadata` / `contentHasher`                             |
| **M4**   | CLOSED                 | Consent scan is `schema.artifacts()` even with `artifactId`                                              |
| **M5**   | CLOSED                 | One `evaluate` + in-memory `markVerdictComplete`                                                         |
| **M6**   | CLOSED                 | Hop skills do not list `OVERLAP_CONFLICT` as a typical blocker                                           |

**Residual:** LOW wording, verify leftovers, and missing `it()` titles. Highest-value test gaps (not product bugs): GetStatus `overlapDetail` merge/scan; CLI `taskCompletionCheck` DAG, status `[drift]`, JSON transition `failure` stream, `SpecOverlapError`; storage missing-on-disk + `validatedHash`; factory composition tests for ValidateArtifacts / GetArtifactInstruction.

In-place gates, archive-as-operation overlap, and skill copy stay aligned with code.

### Batch rollup (partial self-counts)

| Batch                 | HIGH | MEDIUM | Notes                             |
| --------------------- | ---: | -----: | --------------------------------- |
| core-lifecycle        |    0 |      0 | H1/M1/M2 closed; ~6 unique LOW    |
| core-archive-validate |    0 |      0 | H2/M3/M4/M5 closed; LOW leftovers |
| core-gates            |    0 |      0 | No regression; LOW wording/tests  |
| cli                   |    0 |      0 | 47 reqs implemented; 7 LOW        |
| skills-globals        |    0 |      0 | M6 closed; 3 LOW                  |

---

## How to use this report

Partials are the source of evidence. Do not sum batch LOWs as unique product defects.

---

## Detailed findings (verbatim partials)

---

### Source: \_partial-core-lifecycle.md

# Partial audit: core lifecycle specs (`workflow-transition-checks`)

Read-only. Change `workflow-transition-checks`. Sources: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>` (merged spec.md + verify.md), `node packages/cli/dist/index.js specs show default:_global/architecture`, implementation under `packages/core`. Graph: `graph search "GetStatus" --symbols` succeeded (`core:src/application/use-cases/get-status.ts` class ~285). Index rebuild was reported failed (worker crash); further walks used Read/Grep after locating files. No code or spec files were modified.

**Scope:** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:change`, `core:workflow-model`, plus depth-1 consistency vs `core:transition-checks` and `default:_global/architecture`.

---

## Previously OPEN re-check (audit `20260828-144106`)

| Item                                                                                                                                                                                                                                              | Status                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** GetStatus Identifies blockers used `MISSING_ARTIFACT` for missing **and** in-progress; `workflow.requires` emits `INCOMPLETE_ARTIFACT`; engine “three dimensions” wanted `MISSING_ARTIFACT`. Product: keep `INCOMPLETE_ARTIFACT` for both. | **CLOSED**                 | Merged `core:get-status` Identifies blockers: `INCOMPLETE_ARTIFACT` for `missing` or `in-progress`; “no separate `MISSING_ARTIFACT`”. Merged `core:lifecycle-engine` mandatory codes: same; verify “Engine unifies three validation dimensions” THEN `INCOMPLETE_ARTIFACT` AND does not emit `MISSING_ARTIFACT`. Code: `workflow-requires.ts:45-50` `fail(..., 'INCOMPLETE_ARTIFACT', ...)`; engine fallback `_artifactBlockers` `lifecycle-engine.ts:643-653` uses `INCOMPLETE_ARTIFACT` for missing and in-progress; tests `lifecycle-engine.spec.ts:905-916`, `922-934`, `get-status.spec.ts:954`. Production `packages/core/src` has **no** `MISSING_ARTIFACT` emitter.                                                                                                                  |
| **M1** Archivable live `OVERLAP_CONFLICT` still advertised nextAction “Ready to archive” / `/specd-archive` as if clean.                                                                                                                          | **CLOSED**                 | Spec: Identifies blockers — when public blockers include `OVERLAP_CONFLICT`, `command` stays `/specd-archive`, `targetStep` stays `archivable`, `reason` MUST NOT be `Ready to archive`, MUST name overlap and `--allow-overlap`; `availableTransitions` MAY still list `archiving`. Code: `GetStatus._nextActionAfterArchiveOverlap` `get-status.ts:774-791` (called `get-status.ts:520`). Test `get-status.spec.ts:1022-1051` asserts command, targetStep `archivable`, reason not `Ready to archive`, `/overlap/i` and `--allow-overlap`. Engine `_nextAction` still returns reason `'Ready to archive'` / `targetStep: 'archiving'` (`lifecycle-engine.ts:949-963`) because archive predicates are **not** hop rows; overlay is GetStatus’s job. Overlap remains an operation predicate. |
| **M2** TransitionChange spec said `change.transition('designing')` after invalidate; code uses invalidate’s embedded `transitioned`.                                                                                                              | **CLOSED**                 | Spec “Transition to designing from any state”: invalidate **is** the hop; MUST NOT call `transition('designing')` after invalidate (`spec.md` merged). Verify: implementing→designing AND `transition` is not called; designing→designing / drafting→designing **do** call `transition`. Code: `transition-change.ts:264-291` `if (!invalidated) freshChange.transition(...)`. Entity: `change.ts:688-729` invalidate appends `transitioned` to designing. Test: `does not call transition after invalidate when returning to designing` `transition-change.spec.ts:2180-2191` spies `transition` not called.                                                                                                                                                                                |
| **Previously CLOSED — bypassFlags omit skippable**                                                                                                                                                                                                | **CLOSED (no regression)** | `_blockersFromFailedChecks` `lifecycle-engine.ts:775-799` returns `[]` when skippable and `isBypassFlagActive`. Test `omits skippable OVERLAP_CONFLICT when bypassFlags include allow-overlap` accepts `allow-overlap` and `--allow-overlap`. Caveat unchanged: GetStatus does not pass `bypassFlags` into `evaluate`; archive predicates run with `allowOverlap: false` (`get-status.ts:464-476`). Omit-on-bypass is the engine `evaluate` contract.                                                                                                                                                                                                                                                                                                                                        |
| **Previously CLOSED — historical spec-overlap-conflict is review not OVERLAP_CONFLICT**                                                                                                                                                           | **CLOSED (no regression)** | Engine `_reviewBlockers` does not emit `OVERLAP_CONFLICT` for `review.reason === 'spec-overlap-conflict'`. GetStatus test `given invalidation overlap…` `get-status.spec.ts:981`. Engine verify + nextAction `/specd-design`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Previously CLOSED — live overlap blocker only when archivable**                                                                                                                                                                                 | **CLOSED (no regression)** | Archive predicates only if `change.state === 'archivable'` (`get-status.ts:464`). Test `does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable` `get-status.spec.ts:1054-1067`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Previously CLOSED — TransitionChange reload after refresh; allowOutOfScope only forward exit implementing / linksInScope only**                                                                                                                 | **CLOSED (no regression)** | Reload: `transition-change.ts:173-180`. Test `evaluates impl.filesResolved against post-refresh tracked files`. Bindings: `check-bindings.ts:49-55` `from: implementing`, `along: forward`. Tests: skip links with `allowOutOfScope: true`; still fail open files; fail links without flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## Spec: core:lifecycle-engine

### Requirements Summary

Nine requirements (merged spec):

1. **Centralized validation logic** — Sole interpreter; one transition-attempt evaluation per `core:transition-checks`; predicates only; no effects, snapshot bag, `check.run` fallback, or I/O. Optional pure `projectArtifacts`.
2. **Effective artifact status** — DAG mapping (`drifted-pending-review` / `pending-review` sticky; `complete` + unready parent → `pending-parent-artifact-review`; else persisted). Public API is `evaluate`, not `computeEffectiveStatus`.
3. **Canonical-state-only** — Ignore `complete-with-drift` / `hasDrift` as lifecycle states.
4. **Machine-readable blockers** — `code`, `message`, `isSkippable`, optional `bypassFlag` / `affectedArtifacts` / `label` / `checkId`. Active bypass **omits** skippable blockers (no `warnings`). Mandatory codes: `INCOMPLETE_ARTIFACT` (missing **or** in-progress; no `MISSING_ARTIFACT`), `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT` (live archive overlap only), `INVALID_TRANSITION`, `APPROVAL_REQUIRED`.
5. **Available steps and next action** — One predicate evaluation. No approval rewrite (`_resolveTarget` identity). `validTransitions` = protocol; `availableTransitions` = predicates pass/skip; `availableSteps` = schema extras rows; `isReady` from `workflow.requires` when present (no dual-write codes); `isPermitted` = protocol. Happy-path `nextAction` matrix; historical overlap → `/specd-design`.
6. **Archiving escape** — `archivable` + `designing` available; recovery hop skips requires/taskCompletion.
7. **Review summary** — Drift vs overlap diagnostics.
8. **Shared consumers** — GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction; not CompileContext. Empty `checksByTarget` for DAG-only consumers.
9. **Next artifact** — `artifactDag().topologicalOrder()`; null if all complete/skipped.

Dependencies: `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`, `core:transition-checks`.

### Implementation Status

**Implemented** in `packages/core/src/domain/services/lifecycle-engine.ts` (`evaluate` ~148+).

- Projects injected `checksByTarget`; `availableTransitions` = targets whose injected rows have no `fail`.
- `projectArtifacts` / `_effectiveStatus` implement mapping including parent-review recursion.
- Canonical `complete` despite `hasDrift`; `missing` wins over drift diagnostic.
- `_blockersFromFailedChecks` skippable + `bypassFlag` for `OVERLAP_CONFLICT` and `impl.linksInScope` only; omits when bypass active.
- `_reviewBlockers` does **not** emit `OVERLAP_CONFLICT` for historical invalidation.
- `_resolveTarget` is identity (no pending rewrite).
- Recovery: `archiving` → `archivable` skips requires walk in `transitionBlockers` (`lifecycle-engine.ts:223-224`, `605-607`).
- `_nextAction` matches happy-path matrix (designing/ready, verifying/done, done skill hops not nextAction, archivable `/specd-archive` with engine reason `'Ready to archive'` when `archiving` is available, restore failure → designing).
- `_nextArtifact` uses `schema.artifactDag().topologicalOrder()`.
- Fallback `_artifactBlockers` uses `INCOMPLETE_ARTIFACT` when `workflow.requires` results are absent (`lifecycle-engine.ts:613-654`).
- Consumers: GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction call `evaluate`. CompileContext composition test asserts no LifecycleEngine on deps.

### Discrepancies

1. **LOW — Architecture vs class-shaped engine (spec-wrong vs code-wrong)**
   - **Architecture (`default:_global/architecture`):** stateless domain services MUST be plain exported functions, not classes (`specs/_global/architecture/spec.md:35-37`, constraints `:89`).
   - **This change’s spec / code:** `LifecycleEngine` is a class with optional debug callback. Change specs explicitly require that class.
   - **Both:** Accepted capability override unless architecture is tightened to allow injectable domain interpreters.

2. **LOW — `availableSteps.blockingArtifacts` still independently walks DAG (`code-wrong` if “no second walk” is literal; `spec-incomplete` if extras-row metadata is allowed)**
   - Spec: `isReady` MUST be projected from `workflow.requires` when those results are present — MUST NOT independently re-walk `requires` to emit a **second blocker code** (`lifecycle-engine` spec ~87).
   - Code: `isReady` uses the check when `evaluationChecks` exist (`lifecycle-engine.ts:191-197`). `blockingArtifacts` is **always** filtered from DAG status (`:184-187`). Step `blockers` are emptied when checks are present (`:214-217`). Unlikely to dual-write codes on `verdict.blockers`, but the extras row can disagree with check `details`.

H1 (MISSING vs INCOMPLETE) and prior engine MEDIUM (overlap vs engine `nextAction`) are **not** current discrepancies: product + specs assign overlay to GetStatus; engine never sees archive rows.

### Test Coverage

`packages/core/test/domain/services/lifecycle-engine.spec.ts`: parent-review, no pending rewrite, overlap not OVERLAP_CONFLICT, bypass omit, complete-with-drift, missing+hasDrift, topo next artifact, archiving escapes, incomplete/complete tasks vs verifying, nextAction matrix (designing/ready, verifying/done, archivable, done skill hops), impl bypassFlag split, omitted implementing extras row, INCOMPLETE not MISSING / no dual-write, injected checks without I/O.

Related: `validate-artifacts.spec.ts` empty `checksByTarget`; `get-artifact-instruction.spec.ts`; `compile-context` “does not resolve LifecycleEngine”.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                 | Nearest `it()`                                                                                                       | Gap                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Engine unifies three validation dimensions                      | `given a change in designing with a missing required artifact… INCOMPLETE_ARTIFACT` (`lifecycle-engine.spec.ts:905`) | **Covered** (prior gap closed)                          |
| Requested-target blockers do not dual-write MISSING_ARTIFACT    | `given requestedTarget requires fail…` (`:922`)                                                                      | Covered                                                 |
| Detailed affected artifacts for drift                           | none asserting `affectedArtifacts` filename/spec on `ARTIFACT_DRIFT`                                                 | Missing                                                 |
| All artifacts complete yields null next artifact                | none in engine spec (`nextArtifact` asserted for incomplete DAG / drafted GetStatus `toBeNull`)                      | Missing in engine tests                                 |
| Consumers rely on one shared lifecycle verdict                  | split across use-case tests                                                                                          | Cross-cutting gap                                       |
| TransitionChange does not re-walk requires after green evaluate | `does not CountTasks a second time after a green evaluate`                                                           | Partial; no “no second effective-status walk” assertion |
| CompileContext is not an evaluate consumer                      | `does not resolve LifecycleEngine through resolveCompileContextDeps`                                                 | Close; no execute-path “does not call evaluate”         |
| Engine projects CheckResults without I/O                        | injected-check tests                                                                                                 | Close                                                   |
| availableSteps is lookup rows not protocol membership           | omitted implementing extras row                                                                                      | Close                                                   |

### Spec Dependency Chain

- **vs `core:transition-checks`:** Check projection, no `MISSING_ARTIFACT`, archive as operation (engine `nextAction` for archivable is hop-shaped; live overlap is GetStatus) — **aligned**.
- **vs `core:get-status`:** Identifies blockers + overlay — **aligned** (H1/M1).
- **vs `default:_global/architecture`:** I/O-free domain **holds**; class vs function **tension** (discrepancy 1).
- **vs `core:change`:** Entity owns persisted hashes/history; engine owns DAG effective status — aligned.

### Counts

- Requirements: **9**
- Implemented: **9**
- Discrepancies: **2 LOW**
- Missing tests: **5** remaining title gaps (2 prior H1 gaps closed)

---

## Spec: core:get-status

### Requirements Summary

Seventeen requirements: input (`name`, refresh, `ifModifiedSince`); result shape (change vs draftView, artifacts, review, blockers, nextAction); revision short-circuit (no refresh); drafted read-only DAG via `projectArtifacts`, empty transitions; implementation projection; refresh then project from **reloaded** persisted change; displayStatus `complete-with-drift`; taskCompletion from check CountTasks once; execute **all** matching predicates per legal hop (no protocol fail-fast); **archive predicates only when `archivable`**, live `OVERLAP_CONFLICT` only from those, historical overlap is review; constructor deps including archive bindings, no sibling CountTasks/detector; config factory via `resolveGetStatusDeps`; one artifact row per schema type; review priority (drift > overlap > pending-review) + unhandled overlap scan; blockers `INCOMPLETE_ARTIFACT` for missing/in-progress; failed predicate `label`/`checkId`; overlap nextAction overlay (M1); schema miss degrades; composition resolver.

### Implementation Status

**Implemented** in `get-status.ts` (~285–821) + composition `createGetStatus` / `resolveGetStatusDeps`.

- Resolution: `get` then `getDraft`; no `getDiscarded`.
- `ifModifiedSince` before refresh; then refresh; **always `get` again** (`get-status.ts:352-361`).
- Draft: `projectArtifacts`, empty `availableTransitions` / `availableSteps`, `command: null`; review stub (`required: false`).
- `executeChecksByLegalTargets` then `evaluate`; archive `executeMatchingPredicates` only if `archivable` with `allowOverlap`/`allowOutOfScope` false.
- `_mergeBlockers` flattens hop fails + archive fails; copies `label`/`checkId`; overlap `bypassFlag`; links-in-scope only for out-of-scope flag; filesResolved no bypass (`get-status.ts:724-760`).
- `_nextActionAfterArchiveOverlap` (`:774-791`) implements M1.
- Review from engine `_deriveReview` (same scan/priority); overlapDetail projected (`:801-819`).
- Schema catch degrades lifecycle fields; check execute is outside that catch (only after schema success).
- `taskCompletionFromChecks` reuses passMemo counts.
- `resolveGetStatusDeps` uses registry with `includeOverlapDetection: true` (I/O only when archivable).

### Discrepancies

1. **LOW — Public `Blocker` omits `isSkippable` (spec-incomplete vs engine contract)**
   - Engine `LifecycleBlocker.isSkippable` is not copied in `_mergeBlockers` (`get-status.ts:730-737`). Skipability is implied by `bypassFlag`. GetStatus spec does not require `isSkippable` on the public type.
   - **Spec-wrong (GetStatus)** if agents need the boolean without inferring from flag. **Code-correct** vs GetStatus spec.

2. **LOW — Drafted review is always a stub**  
   Spec requires DAG effective status for drafts, not a full review summary (`get-status.ts:697-703`). Files in `pending-review` on a draft will not set `review.required`. **Spec-wrong** if inspection should show review; **code-correct** if drafted path is DAG-only as written.

H1 and M1 are **CLOSED** (see re-check table). Previously CLOSED historical/live-overlap/refresh items did not regress.

### Test Coverage

`get-status.spec.ts`: not-found, artifacts, refresh default/opt-out/draft skip, schema fail, CountTasks inside check + recount, incomplete tasks hide verifying, impl bypass split + gerund label, DAG cascade, displayStatus, review drift/review codes, drafted empty transitions + DAG parent-review without hop evaluate, ifModifiedSince, INCOMPLETE_ARTIFACT / APPROVAL_REQUIRED merge, invalidation overlap without OVERLAP_CONFLICT, archivable live overlap **including nextAction overlay**, non-archivable no overlap I/O, wired overlap I/O when archivable.

Composition `createGetStatus` from config/deps.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                           | Nearest `it()`                                                                       | Gap                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Archivable live overlap does not advertise Ready to archive               | `given archivable live overlap…` (`get-status.spec.ts:1022`) also asserts nextAction | **Covered** (M1)   |
| Overlap detail merges multiple unhandled invalidations                    | none asserting `overlapDetail.length`                                                | Missing            |
| Overlap scan stops at forward transition boundary                         | none                                                                                 | Missing            |
| Review overlapDetail is empty for non-overlap reasons                     | none                                                                                 | Missing            |
| No invalidation event produces empty overlapDetail                        | none                                                                                 | Missing            |
| Review reason is spec-overlap-conflict with single unhandled invalidation | `given invalidation overlap…` (no overlapDetail parse assert)                        | Partial            |
| GetStatus does not invoke detector directly                               | none                                                                                 | Missing            |
| refreshImplementationTracking defaults to enabled                         | `refreshes active changes by default`                                                | Close              |
| Constructor composes create-star checks / archiveBindings                 | composition wiring; constructor verify omits archiveBindings in scenario text        | Indirect           |
| Config-wired status path preserves schema-driven artifact-state           | none vs two repos                                                                    | Missing            |
| CountTasks memo is per evaluation pass                                    | `recounts CountTasks on a second execute`                                            | Close              |
| Status exposes check rows                                                 | lifecycle.checksByTarget used internally                                             | No dedicated title |

### Spec Dependency Chain

- **vs lifecycle-engine:** Review scan in engine; GetStatus projects paths + archive overlay — **aligned**.
- **vs transition-checks:** Collect-all predicates, no fail-fast — aligned. Archive operation rows only in archivable — aligned. `nextAction` overlay is GetStatus-owned; engine projections remain hop-only — aligned with “archive is not an edge”.
- **vs change:** Discarded not loaded; draft via `getDraft` — aligned.
- **vs architecture:** Read-only use case; I/O through ports and check factories — aligned.

### Counts

- Requirements: **17**
- Implemented: **17**
- Discrepancies: **2 LOW** (0 HIGH, 0 MEDIUM)
- Missing tests: **8** remaining important title gaps (M1 scenario covered)

---

## Spec: core:transition-change

### Requirements Summary

Twenty-two requirements: input (`name`, `to` including `'next'`, `skipHookPhases`, refresh, `allowOutOfScope` for **forward exit implementing** `impl.linksInScope` only); baked approvals; existence; refresh then evaluate against **post-refresh** tracking; approval as checks not pending hops; drain pending states; direct persist when predicates pass; map failed predicates (no second requires walk); taskCompletion via check/`CountTasks`; verifying→implementing retry without clearing validated artifacts; skill-hop signoff invalidation; designing invalidation **is** the hop (M2); archiving→archivable recovery; effects via bindings not `check.id` switch; `mutate`; result `{ change }`; progress bus (generic + `requires-check` / `task-completion-failed`); deps without detector/`RunStepHooks`/`CountTasks` on the use case; `'next'` via `HAPPY_PATH_NEXT`; config factory through `resolveTransitionChangeDeps`.

Constraints: schema miss throws; omitted workflow step skips requires/tasks but not protocol; `allowOutOfScope` for links only; redesign must not run impl checks. Purpose/Constraints still mention “approval-gate routing” through LifecycleEngine.

### Implementation Status

**Implemented** in `packages/core/src/application/use-cases/transition-change.ts` + composition `createTransitionChange` / `resolveTransitionChangeDeps`.

- Reload after refresh before predicates (`:173-180`).
- `allowOutOfScope` on `CheckExecutionContext`; impl bindings `along: forward` from `implementing`.
- `executeMatchingPredicates` with `failFastOn: 'protocol.edge'` (`:218`).
- `evaluate` with `checksByTarget: { [requestedTarget]: evaluation.checks }` then `_mapFailedPredicate` (switch on failed **id**, allowed by transition-checks).
- Effects via `matchingEffects(..., 'before-persist', along)` then `_executeEffect`; skip via `ctx.skipHookPhases` inside hook check, not use-case `check.id === 'hook.pre'`. Residual `check.id` appears only when mapping failed **predicates** and emitting progress (`:485`, `_mapFailedPredicate`).
- Designing: `invalidate(...)` inside `mutate`; no `transition()` after invalidate (`:264-291`). Skill hops `invalidateSignoff`.
- `'next'` uses `HAPPY_PATH_NEXT`; `HappyPathNextUnavailableError` for pending/archivable/archiving.
- Schema `get()` not swallowed (throws).
- Composition injects `transitionBindings` from registry, not domain `TRANSITION_BINDINGS`.

### Discrepancies

1. **LOW — Stale “approval-gate routing” wording (spec-wrong)**  
   Purpose still says routing is centralized through LifecycleEngine. Constraints: “Approval-gate routing is configuration-driven… interpretation is centralized through `LifecycleEngine`.” Code and later requirements: requested target is the persist target; `_resolveTarget` is identity. **Spec-wrong** (docs drift). Code matches the newer “no rewrite” rules.

2. **LOW — `allowOutOfScope` is passed on every attempt (spec-incomplete)**  
   Flag is on context even for redesign/recovery. Bindings do not match impl checks except forward exit implementing, so behavior is correct. Spec says the flag “MAY include `allowOutOfScope` for `impl.linksInScope`” rather than “MUST NOT be passed”. Not a behavioral bug.

M2 is **CLOSED**. Previously CLOSED refresh-reload / allowOutOfScope scope did not regress.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts`: not-found, schema throw, `'next'`, refresh default/opt-out, **post-refresh tracked files**, approvals stay in ready/done, drain pending, task gating + `task-completion-failed`, requires + `requires-check`, mutate persist, hooks order/skip/fail-fast, check-start/done bus, designing invalidate vs **spy that `transition` is not called**, no-op from designing/drafting, recovery without archive hooks, skill-hop signoff, CountTasks once, skip-hooks still predicates, allowOutOfScope skip links / still fail open files.

Composition: `createTransitionChange` config and deps forms.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                                     | Nearest `it()`                                                          | Gap                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Transition from implementing to designing invalidates (transition not called)       | `does not call transition after invalidate when returning to designing` | **Covered** (M2)                          |
| TransitionChange does not invoke detector directly                                  | none named; no detector in constructor                                  | Missing explicit assertion                |
| Factory passes config.approvals                                                     | composition instantiates from config                                    | Does not assert `approvals` values        |
| createTransitionChange config form derives deps through resolveTransitionChangeDeps | `returns a wired TransitionChange instance from SpecdConfig`            | Indirect                                  |
| Recovery does not run archiving.post                                                | `transitions to archivable without running archive hooks`               | Close                                     |
| designing pre-hooks run on redesign                                                 | redesign skip source.post; pre via hook.pre `along *`                   | No dedicated “pre runs on redesign” title |

### Spec Dependency Chain

- **vs `core:lifecycle-engine`:** Maps first failed predicate; does not re-walk requires after green execute — aligned. Does not pass `bypassFlags` into `evaluate` (skip happens in `impl.linksInScope` execute).
- **vs `core:transition-checks`:** fail-fast `protocol.edge`; effects by phase; skip selectors in hook check — aligned. Predicate id switch for **error mapping** is allowed; effect launch is not by id.
- **vs `core:change`:** Protocol via `change.transition` except designing-via-invalidate — **aligned** (M2).
- **vs architecture:** Use case uses ports; composition wires adapters. Manual DI. Aligned.
- **vs `core:refresh-implementation-tracking`:** Refresh primitive, not detector — aligned.

### Counts

- Requirements: **22**
- Implemented: **22**
- Discrepancies: **2 LOW**
- Missing tests: **5** title gaps (M2 covered)

---

## Spec: core:transition-checks

### Requirements Summary

Fifteen requirements: check identity/labels/results; Check ABI / WorkflowCheck / no snapshot bag / `passMemo`; one file per check; `from`/`to`/`along` + AXIS_FALLBACK splice; archive as operation (no `approval.signoff`, no `archive.publication`); binding `phase`/`onFailure`; predicate vs effect; attempt evaluation (fail-fast protocol on TransitionChange only); registry bindings for this capability (impl forward-exit only, approvals, archive set, compact impl messages, skippable links only); actionable diagnostics; generic progress bus; projections (`availableTransitions` / `nextAction`); no shared snapshot bag.

### Implementation Status

**Implemented.**

- Domain: `transition-checks.ts` (`classifyAlong`, `buildAxis` / `AXIS_FALLBACK`, types, `CHECK_LABELS`), `check-bindings.ts` (`TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS`), per-id `domain/checks/*`.
- Application: `application/checks/*` extending `WorkflowCheck`; `createWorkflowCheckRegistry` maps ids onto one spec table.
- Matcher: impl `from implementing` `along forward`; requires/taskCompletion `exceptAlong: ['recovery']`; approval.spec forward from ready; approval.signoff `done → archivable` forward only; archive rows include overlap, not publication.
- `workflow.taskCompletion` memos CountTasks on `passMemo`.
- Progress: `executeCheckWithProgress`; hook maps RunStepHooks onto `check-progress`. TransitionChange **also** emits `requires-check` / `task-completion-failed` (required by TransitionChange spec).
- No `PredicateSnapshots` / `gatherPredicateSnapshots` / `emptyPredicateSnapshots`.

### Discrepancies

1. **LOW — Predicate bindings omit `phase`/`onFailure` on the row (spec-wrong if literal; code-correct if defaults implicit)**  
   Spec: “Predicates on both tables default to `phase = before-persist` and `onFailure = abort`.” Stored specs omit those fields on predicates (`check-bindings.ts:28-65`); tests assert they are omitted. Runtime treats missing as abort/before-persist.

2. **LOW — Domain stub `execute` vs “MUST NOT be the production execute path”**  
   Domain `Check` objects still have `execute` (pure, no I/O). Production use cases compose `create*`. Spec allows domain stub objects. Residual risk if a test/use case accidentally uses `TRANSITION_BINDINGS`. Composition tests use registry.

Cross-spec H1/M1 are owned by GetStatus/engine specs, not residual MEDIUM here: `INCOMPLETE_ARTIFACT` is the registered requires fail code (`workflow-requires.ts:47`); archive is operation-scoped.

### Test Coverage

`transition-checks.spec.ts`: classifyAlong (redesign, recovery, omitted implementing/ready, unknown step), binding match/non-match (impl, approval, hook.post), labels/kind, archive.publication absent, PredicateSnapshots not exported, compact impl messages, deps.consistent extracted vs persisted, overlap message, applyBindingSpecs missing instance.

Also: `matching-effects.spec.ts`, `workflow-check-registry.spec.ts`, `workflow-check-factories.spec.ts`, `execute-check-with-progress.spec.ts`, transition-change progress/fail-fast, get-status projections, archive-change phase/onFailure.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                          | Nearest coverage                            | Gap                                            |
| -------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Instruction hooks are not checks                         | none titled                                 | Missing                                        |
| CountTasks memo lives on passMemo not the check instance | GetStatus recounts on second execute        | Close; not asserting memo key location         |
| Status allowed ignores effects                           | GetStatus does not run effects              | Implicit                                       |
| Protocol fails fast before other predicates              | TransitionChange failFastOn protocol.edge   | No isolated “other predicates not called” test |
| Hook effect maps onto the same bus                       | transition-change hook check-progress tests | Close                                          |
| One binding table                                        | shared check object reused test             | Close                                          |
| TransitionChange does not launch hooks by id             | no `check.id === 'hook.pre'` in use case    | Implicit (grep-level)                          |

### Spec Dependency Chain

- Aligns with lifecycle-engine projections and TransitionChange execute slots.
- **vs GetStatus:** Collect-all vs fail-fast — aligned. Overlap nextAction overlay is extra GetStatus rule, not a hop projection — aligned with “archive is an operation”.
- **vs architecture:** Application checks own I/O ports; domain `run(facts)` is pure. Aligned.
- Sugar `onEnter`/`onExit`/`onEdge` is authoring-only; stored rows are explicit triples.

### Counts

- Requirements: **15**
- Implemented: **15**
- Discrepancies: **2 LOW**
- Missing tests: **7** title gaps

---

## Spec: core:workflow-model

### Requirements Summary

Eleven requirements: step names are `ChangeState`; step semantics (design/implement/verify outcomes/archive); requires as `workflow.requires`; taskCompletion via CountTasks in the check; availability from engine projections; workflow order is display **and** progress axis with AXIS_FALLBACK splice; step name IS state name; hooks as effects with matcher (post forward-only, before persist); two execution modes (auto-run unless skip); requires are artifact IDs not step names.

### Implementation Status

**Implemented** across schema build, `classifyAlong`, bindings, TransitionChange, ArchiveChange, GetStatus.

- Unknown steps rejected at schema resolve (not TransitionChange).
- `workflowStep` null when omitted; hops remain on `VALID_TRANSITIONS`.
- Requires/taskCompletion checks; recovery exceptAlong.
- CompileContext does not evaluate availability (composition test).
- Post effects `along: forward` only.
- Archive hooks are operation `archive`, not a fake along.

### Discrepancies

1. **LOW — “implementation-failure” / “artifact-review-required” as workflow routing events (spec-wrong vs code-wrong)**  
   Spec describes verification **outcomes** that route to implementing vs designing (`workflow-model` spec ~25-27). There is no domain enum or automatic router; callers choose `to: implementing` vs `to: designing`. TransitionChange implements the **effects** of those hops (preserve artifacts vs invalidate).
   - **Spec-wrong:** Sounds like an engine-owned outcome type.
   - **Code-wrong:** If a named verification conclusion API was required.

2. **LOW — “Any file drifted-pending-review forces workflow back to designing” (spec-wrong vs recommend)**  
   Engine `nextAction` when `review.required` is `/specd-design` with `targetStep` = **current state**, not a forced protocol move (`lifecycle-engine.ts:810-816`). Transition is not automatic.
   - **Spec-wrong:** “forces” vs recommend.
   - **Code-wrong:** If a transition must be applied automatically.

### Test Coverage

Scattered: schema-format / buildSchema (invalid step, requires are artifact IDs), transition-checks classifyAlong, transition-change hooks/tasks/requires, workflow-model verify scenarios without a dedicated `workflow-model.spec.ts`.

### Missing Tests (verify scenario title vs `it()` title)

Many scenario titles have no homonymous `it()`; behavior is covered elsewhere:

- implementation-failure returns to implementing → `preserves artifact validation state…` / change.spec verifying→implementing
- artifact-review-required returns to designing → designing invalidate tests
- drifted file forces redesign → review nextAction `/specd-design`, not an auto-transition
- Status and execute share requires evaluation → complementary GetStatus vs TransitionChange tests, no paired assertion
- Later step available before earlier step → no dedicated availability matrix test
- Agent-driven skipHookPhases vs auto-run → skipHookPhases tests
- Deterministic archive pre-hooks → archive-change tests (out of this file’s assignment but related)

### Spec Dependency Chain

- **vs transition-checks / lifecycle-engine:** Axis and availability — aligned. Requires fail code `INCOMPLETE_ARTIFACT` — aligned with H1.
- **vs change:** Protocol table vs content gating — aligned.
- **vs architecture:** Semantics live in domain services + checks, not CLI — aligned.

### Counts

- Requirements: **11**
- Implemented: **11** (routing outcomes are caller-chosen hops)
- Discrepancies: **2 LOW**
- Missing tests: **7** homonymous gaps (most covered under other specs)

---

## Spec: core:change

### Requirements Summary

Twenty-one requirements: identity; `updatedAt`; workspaces/specIds/specDependsOn; lifecycle states + VALID_TRANSITIONS (no pending from ready/done; skill hops; archiving escapes); skill-aligned backward hops (signoff only); archiving escapes; implementing/verifying loop; implementation tracking; explicit vs container-only links; historical implementation guard; spec/signoff gates as recorded consent; artifacts/file aggregate; artifact sync; history/events including overlap invalidation; archive outcome history; historical detection; schema version; drafting/discarding; drafted read-only; **lifecycle interpretation authority** (DAG outside the entity); policy-aware invalidation; per-file drift.

This audit focuses on lifecycle/transition-check overlap; identity/tracking/drafting were spot-checked against entity + tests, not every file-link edge.

### Implementation Status

**Implemented** in `packages/core/src/domain/entities/change.ts` + `change-state.ts`.

- `VALID_TRANSITIONS` matches spec tables (`change-state.ts:30-42`): `ready` → implementing/designing only; `done` includes archivable/designing/implementing/verifying; `archiving` → archivable/designing; skill hops from done/signed-off/archivable; no `archivable → done`.
- `HAPPY_PATH_NEXT` sibling map; omitted pending/archivable/archiving.
- `state` derived from history (`transitioned` / invalidate-appended `transitioned`).
- `invalidate(..., 'spec-overlap-conflict')` supported; tests `handles spec-overlap-conflict cause`.
- Skill hop: use case invalidates signoff; entity `transition` does not mass-downgrade.
- No DAG effective status on the entity (`pending-parent-artifact-review` is engine-only).
- Gates: entity records approvals; TransitionChange/checks block hops — aligned with “stay in ready/done”.
- Lifecycle prose now attributes `implementing → verifying` task gating to `workflow.taskCompletion` (not entity `transition()` throw) — **aligned** with architecture (prior LOW closed).

### Discrepancies

None at HIGH/MEDIUM for the lifecycle slice. Invalidate-embeds-`transitioned` matches TransitionChange M2 and entity JSDoc (`change.ts:688-690`).

Residual documentation: Purpose-level “Ready to archive” on `done` in the state table (`change` spec ~64) is colloquial vs verify-skill owning `done`→`archivable`. Not counted as a finding; engine/GetStatus matrix is the binding nextAction contract.

### Test Coverage

`change.spec.ts` covers identity/timestamps/workspaces, VALID_TRANSITIONS including skill hops and archiving escapes, gates, artifacts, drift, history including overlap cause, implementation tracking, archive-failed, draft/discard, sync. Engine tests cover DAG-not-on-entity. Invalidate appends `invalidated` and `transitioned`.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                 | Nearest                                                                                  | Gap                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Dependency-aware lifecycle interpretation is external to Change | engine parent-review tests; no change.spec assertion “entity has no effectiveStatus API” | Missing explicit                          |
| Hop from done invalidates signoff only                          | transition-change `clears signoff on done → implementing`                                | Entity-level scenario covered in use case |
| implementation-failure from done uses backward hop              | classifyAlong + skill hop tests                                                          | Split                                     |

Most lifecycle table scenarios have `it('Valid transition — …')` style coverage in change.spec.

### Spec Dependency Chain

- **vs lifecycle-engine:** Entity = facts; engine = DAG — aligned.
- **vs workflow-model / transition-checks:** Content gates are not entity `transition()` throws — aligned.
- **vs architecture:** Rich entity with invariant `transition()` — aligned.
- **vs TransitionChange:** invalidate-as-designing-hop — aligned (M2).

### Counts

- Requirements: **21**
- Implemented: **21** (lifecycle/transition-relevant; tracking/drafting assumed in existing entity tests)
- Discrepancies: **0**
- Missing tests: **3** named gaps for this assignment’s lifecycle slice

---

## Depth-1: `core:transition-checks` (consistency)

| Check                                              | Result                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requires fail code                                 | **Pass** — `INCOMPLETE_ARTIFACT` in check, engine fallback, GetStatus Identifies blockers, engine verify unify scenario                                         |
| Archive is operation not edge                      | **Pass** — GetStatus runs archive predicates only in `archivable`; engine `availableTransitions` may still include `archiving`; overlay does not remove the hop |
| Impl bindings forward exit implementing            | **Pass** — `check-bindings.ts:49-55`; redesign does not match                                                                                                   |
| Approval bindings                                  | **Pass** — spec forward from ready; signoff `done → archivable` forward only; not on archive operation                                                          |
| Fail-fast protocol on TransitionChange only        | **Pass**                                                                                                                                                        |
| No snapshot bag                                    | **Pass**                                                                                                                                                        |
| GetStatus nextAction overlay vs engine projections | **Pass** — extra GetStatus rule; not a hop predicate                                                                                                            |

No contradiction that reopens H1/M1.

---

## Depth-1: `default:_global/architecture` (consistency)

Relevant rules: hexagonal layers; domain purity (no I/O); use cases via ports; rich entities own state-machine invariants; **stateless domain services as functions not classes**; manual DI; composition layer.

| Check                                                                | Result                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| LifecycleEngine I/O-free                                             | **Pass** — projects CheckResults / DAG from in-memory Change+Schema          |
| Checks I/O in application `create*`                                  | **Pass**                                                                     |
| Entity `VALID_TRANSITIONS` not duplicated as a second protocol table | **Pass** (`protocol.edge` reads the same table)                              |
| Content gating as checks not entity                                  | **Pass**                                                                     |
| LifecycleEngine is a class                                           | **Tension** with “plain exported functions” — lifecycle-engine discrepancy 1 |
| GetStatus/TransitionChange composition via resolver                  | **Pass**                                                                     |
| CompileContext not an evaluate consumer                              | **Pass**                                                                     |

No architecture **HIGH** break. The class-vs-function rule is the only structural conflict, and the change specs explicitly require `LifecycleEngine`.

---

## Batch totals (this partial)

| Spec                   | Requirements | Implemented |                  Discrepancies | Missing tests (title gaps) |
| ---------------------- | -----------: | ----------: | -----------------------------: | -------------------------: |
| core:lifecycle-engine  |            9 |           9 |                          2 LOW |                          5 |
| core:get-status        |           17 |          17 |                          2 LOW |                          8 |
| core:transition-change |           22 |          22 |                          2 LOW |                          5 |
| core:transition-checks |           15 |          15 |                          2 LOW |                          7 |
| core:workflow-model    |           11 |          11 |                          2 LOW |                          7 |
| core:change            |           21 |          21 |                              0 |                          3 |
| **Sum**                |       **95** |      **95** | **10 listed (several unique)** |                     **35** |

### Unique severity counts

| Severity   | Unique count | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   |        **0** | Prior H1 closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **MEDIUM** |        **0** | Prior M1 and M2 closed; prior engine MISSING/INCOMPLETE MEDIUM absorbed into H1 product decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **LOW**    |        **6** | (1) architecture class vs function; (2) availableSteps DAG `blockingArtifacts` walk; (3) predicate `phase`/`onFailure` omitted on stored rows; (4) TransitionChange Purpose/Constraints “approval-gate routing”; (5) workflow-model named verification outcomes; (6) workflow-model “forces” redesign. GetStatus `isSkippable` drop and drafted review stub are extra GetStatus-local LOWs not double-counted in the unique six if treating them as documentation/shape nits — they remain listed under GetStatus (2 LOW) but are the same class of residual. Unique **behavioral** LOWs: **6**. Including GetStatus shape nits: **8**. |

**Prior OPEN H1 / M1 / M2: all CLOSED.** Previously CLOSED bypassFlags / historical overlap / archivable-only live overlap / refresh reload + allowOutOfScope: **no regression**.

---

### Source: \_partial-core-archive-validate.md

# Spec compliance partial — core archive / validate / storage / instruction / schema-format

**Change:** `workflow-transition-checks`  
**Mode:** change (delta-applied via `changes spec-preview`)  
**Read-only.** No code or spec files modified.  
**Graph:** `graph search "ValidateArtifacts"` returned symbols (index may still be stale / prior index failed). Implementation checks used Read after graph locate.

**Product decision (H2):** CODE WINS — `FsChangeRepository.get` owns baseline `validatedHash` vs disk invalidation with `SYSTEM_ACTOR`. `ValidateArtifacts` does **not** own baseline drift; it only compares approval/signoff `artifactHashes` after `get()`.

**Re-audit of 144106:** H2 / M3 / M4 / M5 all **CLOSED**. No HIGH. Unique severity this batch: **LOW**.

---

## Previously OPEN table (144106) — re-check

| ID                                          | Prior status (144106)                                               | This audit                 | Evidence                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H2**                                      | CLOSED — confirm no regression                                      | **CLOSED** (no regression) | Specs: storage load owns baseline; validate MUST NOT compare `validatedHash`. Code: `change-repository.ts` ~1523–1574 `invalidate(..., SYSTEM_ACTOR)`; `validate-artifacts.ts` `get()` then consent scan only. Tests: `Hash mismatch on load invalidates with artifact-drift`; `ValidateArtifacts does not own baseline validatedHash drift` (`mutate` not called). |
| **M3**                                      | OPEN — factory spec.md listed `runStepHooks` / `regenerateMetadata` | **CLOSED**                 | Preview spec.md _Config-based factory…_ lists `archiveBindings`, `materializeMetadata`, `contentHasher` and MUST NOT resolve `runStepHooks`/`regenerateMetadata`. `resolveArchiveChangeDeps` matches. First verify scenario matches. Leftover **LOW**: second verify scenario still says `regenerateMetadata: RegenerateSpecMetadata`.                              |
| **M4**                                      | OPEN — consent scan not `--artifact` scoped                         | **CLOSED**                 | Spec: scan iterates `schema.artifacts()`; `artifactId` MUST NOT skip consent; complete-file bypass is structural only. Code: loop `schema.artifacts()` before `artifactTypesToValidate`. Test: `scans consent hashes across all artifacts even when artifactId is set`. Verify: _Consent-hash scan is not scoped to artifactId_.                                    |
| **M5**                                      | OPEN — same-execute DAG recompute vs persist+evaluate               | **CLOSED**                 | Spec: one `evaluate` then `markVerdictComplete` in-memory; MUST NOT persist-and-re-evaluate; MUST NOT re-walk pending-parent cascade. Code: `evaluate` once; patch `effectiveStatus: 'complete'`. Test: parent+child same `execute`, `evaluateSpy` `toHaveBeenCalledTimes(1)`. Verify: _Lifecycle snapshot refreshes after markComplete in same execute_.           |
| Lock-without-plan sealed `dependsOn`        | CLOSED                                                              | **CLOSED**                 | `resolveSealedArchiveDependsOn`: plan → lock → `resolveInitial` → extract/`[]`. Test _Lock without a plan keeps lock dependsOn_ throws `ArchiveDependencyMismatchError`, `resolveInitial` not called.                                                                                                                                                               |
| `graph.excludePaths` at archive materialize | CLOSED                                                              | **CLOSED**                 | `_materializeImplementationLinks` uses `ListWorkspaces.excludePathsFor(workspace)` then `isExcludedByPrefix`. Test _Excluded path is ignored…_ (project-level). `excludePathsFor` merges project + workspace prefixes.                                                                                                                                              |
| `contentHasher` vs ctor `hasher`            | CLOSED                                                              | **CLOSED**                 | Deps field `contentHasher`; ctor param `hasher` on ValidateArtifacts and ArchiveChange. Spec validate factory: “The constructor parameter remains `hasher`.”                                                                                                                                                                                                        |

---

## Critical re-checks

### H2 — Dual ownership of baseline artifact-drift — **CLOSED** (no regression)

**Delta-applied specs agree (CODE WINS):**

- `core:storage` › Artifact status derivation: when `artifactTypes.length > 0`, load detects baseline drift vs `validatedHash` and calls `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat that comparison. Consent-hash drift stays on the use case.
- `core:validate-artifacts` › Policy-aware drift materialization: MUST NOT compare disk to `validatedHash`, MUST NOT mark `hasDrift` for that reason, MUST NOT invalidate for baseline mismatch. Load via `ChangeRepository.get` first. Approval/signoff scan uses `ActorResolver`, not `SYSTEM_ACTOR`.
- Verify: _ValidateArtifacts does not own baseline validatedHash drift_; _Consent-hash drift still invalidates once…_; storage _Hash mismatch on load invalidates with artifact-drift_.

**Code matches:**

- `packages/core/src/infrastructure/fs/change-repository.ts` (~1523–1574): grouped `invalidate(..., SYSTEM_ACTOR, ...)` after hash/status derivation.
- `packages/core/src/application/use-cases/validate-artifacts.ts` (~168–169 `get()`, ~300–336): scan only if `activeSpecApproval` or `activeSignoff`; hashes vs `artifactHashes`; skip `missing`/`skipped`; no `validatedHash` baseline compare. Invalidate in `mutate` uses `actor` from `ActorResolver.identity()`.

**Tests match:** `change-repository.spec.ts` _Hash mismatch on load invalidates with artifact-drift_ (`by === SYSTEM_ACTOR`); `validate-artifacts.spec.ts` _does not own baseline…_ (`mutate` not called).

**Residual (not H2):** hexagonal “use case owns policy” vs adapter calling the entity (LOW below). Storage + validate-artifacts still do not contradict each other.

### M3 — Archive factory ports — **CLOSED**

**Spec (preview spec.md):** `resolveArchiveChangeDeps` MUST resolve `archiveBindings` from `resolveWorkflowCheckRegistry`, `materializeMetadata`, `contentHasher`. MUST NOT resolve `runStepHooks` or `regenerateMetadata` onto `ArchiveChangeDeps`.

**Code:** `packages/core/src/composition/use-cases/archive-change.ts` `ArchiveChangeDeps` + `resolveArchiveChangeDeps`; factory passes `archiveBindings`, `materializeMetadata`, `contentHasher` into ctor (`hasher` slot). Guard includes `'archiveBindings'`, `'materializeMetadata'`, `'contentHasher'`.

**Verify:** first factory scenario matches code. Second scenario _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata…_ still THEN-lists `regenerateMetadata: RegenerateSpecMetadata` — **LOW spec-wrong leftover**, not enough to keep M3 open.

**Interpretation of leftover:** A = delete/replace second scenario with `materializeMetadata` (spec drift). B = composition should still inject `RegenerateSpecMetadata` (contradicted by spec.md + code).

### M4 — Consent scan vs `artifactId` — **CLOSED**

**Spec:** complete-file bypass is structural/delta/`markComplete` only. Approval requirement: iterate every artifact in `schema.artifacts()`; `artifactId` limits structural validation; MUST NOT skip consent for other types; complete files included in consent scan.

**Code:** consent loop `for (const artifactType of schema.artifacts())` independently of `artifactTypesToValidate`.

**Test:** `scans consent hashes across all artifacts even when artifactId is set` — `--artifact proposal` still invalidates when `specs` consent hash mismatches.

**Interpretation A (now the spec):** global consent integrity on every validate. **B** (old reading): scan only files this invocation structurally validates — **rejected by current spec + verify**.

### M5 — Same-execute DAG patch — **CLOSED**

**Spec (Dependency order check):** one `LifecycleEngine.evaluate` at execute start (empty `checksByTarget`); patch in-memory after each successful completion (`markVerdictComplete`); MUST NOT persist-and-re-evaluate between files; patch MUST NOT re-walk recursive `pending-parent-artifact-review` cascade.

**Code:** `evaluate` once; `markVerdictComplete` sets `state`/`effectiveStatus` `'complete'` on the in-memory map; child uses `artifactVerdicts`.

**Test:** both parent and child incomplete at start; `result.passed`; `evaluateSpy` called once.

**Interpretation A (now the spec):** in-memory patch is the contract. **B:** engine re-evaluate after persist — **rejected**.

### Lock without plan / excludePaths / hasher naming — **CLOSED** (hygiene leftovers only)

- Sealed set: `resolve-sealed-archive-depends-on.ts` plan → `persistedDependsOn !== null` (lock) → on-disk `resolveInitial` → new-spec extract/`[]`.
- Exclude: `excludePathsFor` + `isExcludedByPrefix` at `_materializeImplementationLinks`.
- Naming: deps `contentHasher`, ctor `hasher`.

---

# Spec: `core:archive-change`

## Requirements Summary

Archive is operation-`archive` checks (`archiveBindings`), not `RunStepHooks` on the use case. Workspace lookup via `ListWorkspaces`. Sealed `dependsOn`: plan → lock → lock-less on-disk `resolveInitialPersistedDependsOn()` (no `explicitDependsOn`) → new-spec merge-extract/`[]`. `ContentHasher` required for lock-less on-disk. Implementation links: normalize, skip `excludePathsFor`, fail outside `codeRoot`. Predicates share runners with enter-ready / exit-implementing. Publication preflight stays inside the use case (no `archive.publication` binding). Config factory: `resolveArchiveChangeDeps` with `archiveBindings` / `materializeMetadata` / `contentHasher`.

## Implementation Status

**Mostly implemented.** `ArchiveChange` ctor takes `archiveBindings`, `ListWorkspaces`, `contentHasher` (param `hasher`). Composition matches factory spec.md. Sealed dependsOn + `excludePathsFor` as above.

## Discrepancies

### LOW — Verify factory scenario still names `regenerateMetadata`

**Where:** preview verify.md › _resolveArchiveChangeDeps does not resolve GenerateSpecMetadata or SaveSpecMetadata directly_ THEN still `regenerateMetadata: RegenerateSpecMetadata`. Spec.md and first verify scenario require `materializeMetadata`.

**A (spec-wrong):** leftover heading from the port rename. **B (code-wrong):** factory should expose `regenerateMetadata` — contradicted by spec.md and `ArchiveChangeDeps`.

### LOW — Duplicate empty verify heading for no-lock `resolveInitial`

Two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings; first has no GIVEN/WHEN/THEN.

### LOW — Lock-without-plan test does not assert error payload is lock vs extract

Throws `ArchiveDependencyMismatchError` only. Spec AND of `deps.consistent` vs **lock list** is implied, not asserted via `expectedDeps === ['core:from-lock']`. Error class comments still say “change metadata” / “persisted in the change metadata” rather than sealed lock/plan set.

### LOW — `ArchiveChange` ctor still types `hasher?` / several ports optional

Spec still shows optional `extractorTransforms?`, `projectRoot?`, `hasher?`. Runtime needs hasher on lock-less on-disk. No test that omitted hasher throws.

### LOW — Constraints still say hook execution is delegated to `RunStepHooks`

Spec.md Constraints: “Hook execution is delegated to `RunStepHooks` — `ArchiveChange` does not call `HookRunner` directly.” Adjacent requirements say the use case MUST NOT take `RunStepHooks`; I/O lives on `createHookPre`/`createHookPost`. **A:** constraint is leftover wording (hooks still _implemented_ via that use case inside bindings). **B:** ctor should take `RunStepHooks` — contradicted by bindings requirement + code.

## Test Coverage

| Requirement                                                                                | Status                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Sealed dependsOn plan / no-lock resolveInitial / new spec extract/`[]` / lock without plan | Covered in `archive-change.spec.ts`           |
| `deps.consistent` mismatch → `ArchiveDependencyMismatchError`                              | Covered (plan vs extract and lock vs extract) |
| Excluded path skipped                                                                      | Covered (project-level exclude)               |
| Factory `archiveBindings` + `contentHasher`                                                | Composition factory tests                     |
| Shared archive bindings / hooks / overlap / readOnly                                       | Existing archive-change tests                 |

## Missing Tests (titles)

- Workspace-local `graph.excludePaths` only (no project-level list) skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` is the lock list
- Lock-less on-disk archive without `ContentHasher` throws
- `metadata.json` `dependsOn` must not become the sealed set when lock or resolveInitial applies
- Config factory does not put `regenerateMetadata` on `ArchiveChangeDeps` (or rewrite the stale verify scenario)

## Spec Dependency issues

Depends on `core:storage`, `core:validate-artifacts`, `core:schema-format`, `core:initialize-persisted-spec-state`, `core:transition-checks`, `default:_global/architecture`. Factory spec.md now matches composition-resolver style; verify second scenario does not. `ArchiveDependencyMismatchError` docs still say “change metadata” vs sealed lock/plan.

## Counts (`core:archive-change`)

- Requirements reviewed: 28
- Confirmed: 25
- Discrepancies: 0 HIGH, 0 MEDIUM, 5 LOW
- Missing tests: 5 titles

---

# Spec: `core:validate-artifacts`

## Requirements Summary

Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, `hasher` (ContentHasher), extractors, routes, `LifecycleEngine`. DAG via `evaluate` with empty `checksByTarget` once per execute; in-memory `markVerdictComplete`. Baseline drift is **not** this use case. Consent-hash scan after `get()` over `schema.artifacts()` (not `--artifact` scoped). `markComplete` only here. Factory deps field `contentHasher`.

## Implementation Status

**Implemented for this change’s deltas** (ListWorkspaces, empty `checksByTarget`, baseline not owned, global consent scan, one evaluate + in-memory patch, `contentHasher` deps). Broader validate behavior (delta preview, metadata, bypass) pre-existed.

## Discrepancies

### H2 / M4 / M5 — **CLOSED** (see critical re-check)

### LOW — Leftover verify heading _Missing file can still carry hasDrift…_

Preview still has that heading with the **new** GIVEN/THEN (no invalidate). Also has _ValidateArtifacts does not compare missing files…_. Duplicate/stale title.

### LOW — No composition tests for `resolveValidateArtifactsDeps`

`packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` guard is unasserted (unlike archive). Smoke coverage may exist elsewhere; dedicated factory scenario is missing.

### LOW — Consent-hash invalidation actor identity not asserted

Code uses `ActorResolver` identity in `mutate`. Tests assert invalidation happened, not `by !== SYSTEM_ACTOR`. Spec requires ActorResolver not SYSTEM_ACTOR.

## Test Coverage

| Requirement                                   | Status                                          |
| --------------------------------------------- | ----------------------------------------------- |
| Empty `checksByTarget`                        | `evaluates lifecycle with empty checksByTarget` |
| Same-execute parent then child; evaluate once | Covered (`toHaveBeenCalledTimes(1)`)            |
| Does not own baseline drift                   | Covered                                         |
| Missing file / no consent → no invalidate     | Covered                                         |
| Consent-hash invalidate once                  | Covered                                         |
| Consent scan not scoped to `artifactId`       | Covered                                         |
| ListWorkspaces ctor                           | Used throughout tests                           |
| Factory `contentHasher`                       | **Not** composition-tested                      |

## Missing Tests (titles)

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher`
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)
- In-memory `markVerdictComplete` does not re-run pending-parent-artifact-review cascade (spec forbids re-walk)

## Spec Dependency issues

Depends on `core:storage` — **aligned** after CODE WINS. Depends on `core:schema-format` / `core:lifecycle-engine` for DAG (no `Change.effectiveStatus()`). Architecture spec vs load-time invalidate is storage’s concern, not a validate dual-owner bug.

## Counts (`core:validate-artifacts`)

- Requirements reviewed: 22
- Confirmed: 20
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 3 titles

---

# Spec: `core:storage`

## Requirements Summary

Load-time status from `validatedHash` + disk + `preHashCleanup`. Drift invalidation when artifact types resolved: `SYSTEM_ACTOR`, cause `artifact-drift`, skip pending-review / drifted-pending-review / skipped. Uninitialized repo (`artifactTypes.length === 0`) skips derivation/invalidation. Cascade is engine `projectArtifacts`, not `Change.effectiveStatus()`. Wire `pending-parent-artifact-review` rewritten to `in-progress`. `ValidateArtifacts` is sole `markComplete` path (convention). Archive pattern, fs-cache indexes, locks under `configPath`, confinement, staged archive.

## Implementation Status

**Implemented** for this change’s storage deltas (load-time baseline drift, cascade ownership note, wire coercion). Other storage requirements pre-existed and were not re-audited line-by-line (indexes, pattern variables, gitignore).

## Discrepancies

### LOW — Hexagonal layering (prior M7, **not** H2)

Invalidation **decision** lives in `FsChangeRepository` (infrastructure) calling domain `Change.invalidate`. After CODE WINS this is **required** by `core:storage`. `default:_global/architecture` still prefers use cases orchestrating ports.

**A:** adapter may apply persistence-time invariants using the entity. **B:** a dedicated application service should own drift before save. Product decision picks A.

### LOW — Drift when canonical status is not `complete`

Spec: drifted if non-sentinel hash and not already review/skipped, and either complete-but-disk-not-complete **or** canonical status is not complete (including missing after validated file disappeared). Code: if status is `complete`, re-derive; **else `drifted = true`**. Matches the second bullet. Tests emphasize complete→mismatch more than missing-with-hash.

## Test Coverage

| Requirement                                         | Status  |
| --------------------------------------------------- | ------- |
| Hash mismatch → invalidate SYSTEM_ACTOR             | Covered |
| Reload after revalidation does not invalidate twice | Covered |
| Uninitialized skip                                  | Covered |
| Wire pending-parent-artifact-review → in-progress   | Covered |
| Status precedence complete/in-progress/skipped      | Covered |

## Missing Tests (titles)

- Validated file absent on disk (`missing`) with non-sentinel `validatedHash` invalidates once with `SYSTEM_ACTOR` when types resolved
- Policy `none` on load: entity does not reopen but adapter still persists history as specified (if not already in `change.spec.ts` only)

## Spec Dependency issues

Points at `core:lifecycle-engine` / `core:schema-format` for cascade — consistent. Explicitly forbids ValidateArtifacts repeating baseline — consistent with validate-artifacts delta.

## Counts (`core:storage`)

- Requirements reviewed: 18 (change-touched + status/cascade/indexes skim)
- Confirmed: 16
- Discrepancies: 0 HIGH, 0 MEDIUM, 2 LOW
- Missing tests: 2 titles

---

# Spec: `core:get-artifact-instruction`

## Requirements Summary

Read-only instruction assembly. Ctor: changes, specs map, schema, parsers, `TemplateExpander`, `LifecycleEngine`. Auto `artifactId` via `nextArtifact` / `evaluate` empty `checksByTarget`. `rulesPre`/`rulesPost` from `instruction` fields. Template expanded. Factory field `templateExpander`. Template variables: `change.name` + `change.path` only.

## Implementation Status

**Implemented.** `evaluate(..., { checksByTarget: {} })`. Rules via `r.instruction`. Factory `templateExpander`. Auto-select uses `lifecycle.nextArtifact`.

## Discrepancies

### LOW — Template resolution: spec says `SchemaRegistry` file read; code expands `ArtifactType.template`

Spec: if template **path**, read via `SchemaRegistry`. Code: `artifactType.template` is already file content (resolved at schema load). Tests pass inline template strings.

**A:** spec over-specifies I/O that belongs to schema resolve. **B:** use case should still read the path at execute time.

### LOW — Ctor parameter name `templates` vs spec `expander` vs deps `templateExpander`

Same pattern as hasher/`contentHasher`, but get-artifact-instruction spec ctor block uses `expander`. Code: `templates`. Guard is `templateExpander` on deps. JSDoc on execute still says “declaration order” for auto-select; spec requires engine topological `nextArtifact`.

### LOW — No composition factory test file

No `test/composition/use-cases/get-artifact-instruction.spec.ts`.

## Test Coverage

| Requirement                  | Status                        |
| ---------------------------- | ----------------------------- |
| Empty `checksByTarget`       | Spy in template test          |
| Rule `instruction` expansion | Covered                       |
| Template expand / null       | Covered                       |
| Auto-select / all complete   | Existing auto-selection tests |
| Factory `templateExpander`   | Not composition-tested        |

## Missing Tests (titles)

- `createGetArtifactInstruction` config form resolves `templateExpander` through `resolveGetArtifactInstructionDeps`
- Full result scenario with `rules.pre: [{ id, instruction }]` matching verify GIVEN
- Omitted `artifactId` ignores persisted complete when engine reports `pending-parent-artifact-review`

## Spec Dependency issues

Depends on `core:schema-format` for `{ id, instruction }` — **aligned**. `core:template-variables` (no singular workspace) matches `{ change: { name, path } }`. `core:lifecycle-engine` for `nextArtifact`.

## Counts (`core:get-artifact-instruction`)

- Requirements reviewed: 10
- Confirmed: 8
- Discrepancies: 0 HIGH, 0 MEDIUM, 3 LOW
- Missing tests: 3 titles

---

# Spec: `core:schema-format`

## Requirements Summary (this change)

`workflow[]` is lookup config on existing Change states, not a machine that adds/removes hops. Unknown `step` → `SchemaValidationError`. Artifact `requires` feed `LifecycleEngine.projectArtifacts` / `Schema.artifactDag()`; no `Change.effectiveStatus()`. Parent pending-review → dependent `pending-parent-artifact-review`. `rules.pre`/`post`: `{ id, instruction }`.

## Implementation Status

**Implemented** for change deltas: `buildSchema` rejects invalid `step`; engine cascade in `lifecycle-engine.ts`; `RuleEntry.instruction` in `build-schema.ts`.

## Discrepancies

### LOW — `graph.excludePaths` is **not** this spec

Archive materialization exclusion is config/`ListWorkspaces`, not schema-format. No schema-format contradiction.

No remaining `text` vs `instruction` on **artifact rules** in delta-applied constraints.

Hook YAML in some tests still uses `type: 'instruction', text: 'lint'` (hook entries, not `rules.pre`). Out of this change’s rules.pre finding; flag only if a full schema-format audit is required.

## Test Coverage

| Requirement                                  | Status                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Unknown workflow step rejected               | `build-schema.spec.ts` _rejects workflow steps that are not valid ChangeState values_ |
| DAG cascade in-progress                      | `lifecycle-engine.spec.ts` + get-status cascade                                       |
| Parent pending-review cascade                | `lifecycle-engine.spec.ts` (engine tests)                                             |
| Omitted workflow step still a protocol state | Implicit (engine has full protocol); no schema-only test titled as verify             |

## Missing Tests (titles)

- Omitted `workflow[]` step `implementing` remains a valid ChangeState after `buildSchema` (verify scenario)
- Artifact B `requires: [a]`, A `pending-review`, B complete → `projectArtifacts` `pending-parent-artifact-review` (if not already named that way in engine tests)

## Spec Dependency issues

`core:transition-checks` for axis splicing. `core:get-artifact-instruction` now matches rules field names. Storage/archive depend on DAG text — aligned.

## Counts (`core:schema-format`)

- Requirements reviewed: 8 (change-touched)
- Confirmed: 7
- Discrepancies: 0 HIGH, 0 MEDIUM, 1 LOW
- Missing tests: 2 titles

---

# Global: `default:_global/architecture` (depth 1)

Config-based `createX(config)` MUST delegate through shared composition resolver to `createX(deps)`. Archive / validate / get-artifact-instruction factories follow that pattern. Load-time `Change.invalidate` in `FsChangeRepository` remains the CODE WINS exception vs “use cases orchestrate ports” — LOW layering taste, not a dual-owner bug (H2 closed).

---

# Batch summary

| Spec                            | HIGH | MEDIUM | LOW | Prior IDs                                                             |
| ------------------------------- | ---- | ------ | --- | --------------------------------------------------------------------- |
| `core:archive-change`           | 0    | 0      | 5   | M3 **closed**; lock-without-plan **closed**; excludePaths **closed**  |
| `core:validate-artifacts`       | 0    | 0      | 3   | H2 **closed**; M4 **closed**; M5 **closed**; hasher naming **closed** |
| `core:storage`                  | 0    | 0      | 2   | H2 **closed** (owner is get())                                        |
| `core:get-artifact-instruction` | 0    | 0      | 3   | templateExpander **closed**; rules.instruction **closed**             |
| `core:schema-format`            | 0    | 0      | 1   | rules.instruction **closed**                                          |

**Totals this batch:** HIGH **0** · MEDIUM **0** · LOW **14** (some leftovers overlap conceptually; unique severities: HIGH 0, MEDIUM 0, LOW as listed)

**Unique severity:** **LOW**

**H2:** closed, no regression. **M3/M4/M5:** closed in delta-applied specs **and** code+tests.

---

### Source: \_partial-core-gates.md

# Spec-Compliance Audit — core gates partial

- **Change:** `workflow-transition-checks`
- **Scope (change-owned, via `changes spec-preview`):** `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:hook-execution-model`
- **Re-check vs prior `20260828-144106`:** same batch, 0 HIGH / 0 MEDIUM then (LOW only). This pass confirms no regression and no new HIGH/MEDIUM.
- **Focus:** in-place approval gates (`ready`/`done` stay; `pending-*` drain-only; `nextAction` is approve, not `change transition` to pending); config pending happy-path wording; hooks skip by binding `phase` + skip selectors; `TransitionChange` must not default to domain stub `TRANSITION_BINDINGS`; `ArchiveChange` must not accept `RunStepHooks`; `archive.publication` is not a `CheckId`.
- **Date:** 2026-08-28 (report dir `20260828-163121`)
- **Mode:** read-only. No source or spec files modified. This file is the audit artifact.

## Tooling / graph status

`graph index` FAILED (per assignment). Navigation used `graph search` then Read.

`graph search "ApproveChange"` / `skipHookPhases` (stale index) resolved:

- `packages/core/src/application/use-cases/approve-spec.ts` (`ApproveSpec`, class ~line 30)
- `packages/core/src/application/use-cases/approve-signoff.ts` (`ApproveSignoff`, class ~line 30)
- `packages/core/src/application/use-cases/transition-change.ts` (`HookPhaseSelector` ~line 35)
- `packages/core/src/application/use-cases/archive-change.ts` (`ArchiveHookPhaseSelector` ~line 65)

Merged spec text: `changes spec-preview workflow-transition-checks <specId>`.

---

## Re-check verdict (cross-cutting)

| Claim                                                                    | Status        | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place spec gate, not a pending hop                                    | **COMPLIANT** | `approval.spec` binds `from=ready`, `to=*`, `along=forward` (`check-bindings.ts:57-60`). `ApproveSpec` records consent and does **not** `transition` when state is in `boundFromStates('approval.spec')`. `VALID_TRANSITIONS.ready` is `['implementing','designing']` — no `pending-spec-approval`.                                                                                 |
| In-place signoff gate, not a pending hop                                 | **COMPLIANT** | `approval.signoff` binds `from=done`, `to=archivable`, `along=forward` (`check-bindings.ts:61-65`). `ApproveSignoff` does not `transition` from `done`. `VALID_TRANSITIONS.done` has no `pending-signoff`.                                                                                                                                                                          |
| New work MUST NOT enter `pending-*`                                      | **COMPLIANT** | Happy-path table omits pending (`change-state.ts:30-42`, tests `change-state.spec.ts:72-79`). Engine `_resolveTarget` is identity (`lifecycle-engine.ts:335-337`). Transition tests stay in `ready`/`done` and throw `approval-required` (`transition-change.spec.ts:378-392`).                                                                                                     |
| Drain from already-pending remains legal                                 | **COMPLIANT** | `pending-spec-approval → spec-approved` / `pending-signoff → signed-off` in `VALID_TRANSITIONS`. `ApproveSpec`/`ApproveSignoff` drain via `transition` only when already pending. `TransitionChange` drain tests exist (`transition-change.spec.ts:495-512`). `--next` from pending is unavailable (`HAPPY_PATH_NEXT` omits those states).                                          |
| `change transition` targeting pending is not `nextAction`                | **COMPLIANT** | With gate on and no consent, `LifecycleEngine._nextAction` returns `targetStep: 'ready'` / `'done'` and `command: 'specd changes approve spec                                                                                                                                                                                                                                       | signoff'` (`lifecycle-engine.ts:819-847`, test `lifecycle-engine.spec.ts:266-281`). From already-pending, `nextAction.command`is still **approve**, not`change transition … pending-\*` (`lifecycle-engine.ts:871-929`). `HAPPY_PATH_NEXT` has no pending keys. |
| Config wording: no pending happy-path hop                                | **COMPLIANT** | Preview Approvals: “New work MUST NOT enter `pending-spec-approval` / `pending-signoff` as a happy-path hop”; drain legal; `change transition` targeting pending is never next-action. Verify: “config MUST NOT be documented as requiring a pending hop”.                                                                                                                          |
| `skipHookPhases` = binding `phase` + skip selectors                      | **COMPLIANT** | `matchingEffects` filters `binding.phase ===` slot (`execute-hook-effect.ts:29-34`). Skip inside `HookEffectCheck` uses selectors `all` / archive `pre                                                                                                                                                                                                                              | post`/`target.pre`/`source.post` (`hook-effect.ts:133-149`) — **not** `binding.phase`alone. Transition`hook.pre`and`hook.post`share`before-persist` (`check-bindings.ts:66-78`).                                                                                |
| `TransitionChange` does not default to domain stub `TRANSITION_BINDINGS` | **COMPLIANT** | Constructor 7th arg `transitionBindings` is required (`transition-change.ts:130-146`). No default. Composition: `registry.transitionBindings` (`composition/use-cases/transition-change.ts:45-54`). Tests: `createWorkflowCheckRegistry(...).transitionBindings` (`transition-change.spec.ts:84-103`). Domain `TRANSITION_BINDINGS` is fixtures only (`check-bindings.ts:114-121`). |
| `ArchiveChange` does not accept `RunStepHooks`                           | **COMPLIANT** | Constructor takes `archiveBindings`, not `RunStepHooks` (`archive-change.ts:222-236`). Test helper `newArchiveChange` maps the former 4th slot into `makeArchiveBindings({ runStepHooks })` (`helpers.ts:941-982`). Production ctor has no `_runStepHooks` (`archive-change.spec.ts:169-181`).                                                                                      |
| `archive.publication` is not a `CheckId`                                 | **COMPLIANT** | `CheckId` union has no `archive.publication` (`transition-checks.ts:20-34`). `ARCHIVE_BINDING_SPECS` comment: “Publication is not a check” (`check-bindings.ts:81-94`). Test: `transition-checks.spec.ts:390-392`.                                                                                                                                                                  |

**Regression vs 144106:** none. Same LOW wording/test-gap class. No new HIGH/MEDIUM.

---

# Spec: `core:approve-spec`

## Requirements Summary

| ID   | Requirement                             | Substance                                                                                                                                                                                          |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Gate guard                              | Order: disabled gate → `ApprovalGateDisabledError('spec')` with no I/O; load change; actor; `SchemaProvider.get()` (errors propagate); schema name vs `change.schemaName` → `SchemaMismatchError`. |
| AS-2 | Change lookup                           | Missing name → `ChangeNotFoundError`.                                                                                                                                                              |
| AS-3 | Artifact hash computation               | Schema once for cleanup map; skip `missing`/`skipped`; skip `artifact() === null`; cleanup then hash; keys `type:key`.                                                                             |
| AS-4 | Approval recording and state transition | `recordSpecApproval`; MUST NOT `transition('spec-approved'                                                                                                                                         | 'pending-spec-approval')`when state is an`approval.spec` `from`(currently`ready`); MAY drain `pending-spec-approval → spec-approved`. |
| AS-5 | Persistence and return value            | Persist via `ChangeRepository.mutate`; record on fresh instance; same no-pending-hop / drain rules; return mutated `Change`.                                                                       |
| AS-6 | Input contract                          | `{ name, reason }` required readonly; no gate flags on input.                                                                                                                                      |
| AS-7 | Approval gate baked at construction     | `approvals: ApprovalGates`; `execute` uses baked `approvals.spec`.                                                                                                                                 |
| AS-8 | Config-based factory                    | `createApproveSpec(config)` → `resolveApproveSpecDeps` → canonical `createApproveSpec(deps)`; deps include `contentHasher` and `approvals`.                                                        |

**Verify.md (change deltas):** ready stays `ready`; drain pending → `spec-approved`; drafting → `InvalidStateTransitionError`; mutate from ready returns `ready`; factory uses `contentHasher`. Enabled-gate factory scenario still uses drain fixture.

## Implementation Status

| ID   | Status      | Notes                                                                                                                             |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Implemented | `approve-spec.ts:71-84`. Extra: state allow-list (`boundFromStates` ∪ pending) before mutate (`86-89`).                           |
| AS-2 | Implemented | `get` then `ChangeNotFoundError`.                                                                                                 |
| AS-3 | Implemented | `_computeArtifactHashes` `111-127`; runs **inside** mutate on `freshChange`.                                                      |
| AS-4 | Implemented | `recordSpecApproval` always; `transition('spec-approved')` **only if** `freshChange.state === 'pending-spec-approval'` (`96-98`). |
| AS-5 | Implemented | `mutate` then return `updatedChange`.                                                                                             |
| AS-6 | Implemented | `ApproveSpecInput` `15-20`.                                                                                                       |
| AS-7 | Implemented | Constructor 5th arg; factory `resolver.config.approvals`.                                                                         |
| AS-8 | Implemented | `composition/use-cases/approve-spec.ts` `resolveApproveSpecDeps` + config overload.                                               |

## Discrepancies

### LOW — Hash timing vs mutate (spec wording vs code)

- **Spec (AS-5):** “After computing artifact hashes, the use case MUST record the approval through `mutate`.”
- **Code:** hashes are computed **inside** the mutate callback on the fresh entity (`approve-spec.ts:91-99`).
- **spec-wrong (wording):** sequential “hash then mutate” is weaker than hashing the serialized instance; verify persistence scenario only requires mutate + record on fresh change.
- **code-wrong:** no functional bug for in-place consent.
- **Verdict:** treat as spec ambiguity. Prefer code. **Unchanged from 144106.**

### LOW — Verify scenario still uses drain as the “enabled gate” example

- **Spec verify (baked gate):** GIVEN pending, THEN `spec-approved`.
- **Does not contradict** drain legality or ready happy path (separate scenarios). Factory scenario does not exercise the new in-place path.

No HIGH/MEDIUM implementation bugs found for AS-4/AS-5 vs in-place model. **No regression.**

## Test Coverage

| Scenario                                 | Coverage                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Gate disabled, no repo I/O               | `approve-spec.spec.ts:201-221`                                   |
| Change not found                         | `:288-305`                                                       |
| Ready stays ready + consent              | `:71-91`                                                         |
| Drain → `spec-approved`                  | `:116-134`                                                       |
| Drafting → `InvalidStateTransitionError` | `:243-262`                                                       |
| Schema mismatch before mutate            | `:265-285`                                                       |
| Mutate called                            | `:178-198` (**drain fixture only**)                              |
| Factory returns instance                 | `composition/use-cases/approve-spec.spec.ts` (`instanceof` only) |

## Missing Tests

| Gap                                                                          | Severity                              | Maps to                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Mutate spy + returned state `ready` on in-place path                         | LOW                                   | AS-5 verify                                                                                                           |
| Cleanup applied to one artifact type, not another                            | MEDIUM (test gap, not product defect) | AS-3 verify (logic exists in `compute-artifact-hash.ts` + `pre-hash-cleanup`; **not** asserted through `ApproveSpec`) |
| `artifact() === null` omitted from hash map                                  | LOW                                   | AS-3                                                                                                                  |
| `SchemaProvider.get()` throw before hash                                     | LOW                                   | AS-3 / AS-1                                                                                                           |
| `createApproveSpec(config)` calls `resolveApproveSpecDeps` / `contentHasher` | LOW                                   | AS-8 (composition test only checks `instanceof`)                                                                      |

The AS-3 cleanup gap is a **missing test**, not a code/spec discrepancy. It is **not** counted as a MEDIUM discrepancy (same as 144106).

## Spec Dependency issues

Depends on `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`.

- **Consistent:** `from` states for consent come from `boundFromStates('approval.spec')` (engine bindings), matching `core:transition-checks`.
- **Consistent:** no dependency still requiring a hop into `pending-spec-approval` on the happy path.

## Counts (`core:approve-spec`)

| Metric                             | Count       |
| ---------------------------------- | ----------- |
| Requirements                       | 8           |
| Implemented as specified           | 8           |
| Discrepancies HIGH / MEDIUM / LOW  | 0 / 0 / 2   |
| Verify scenarios with direct tests | 10 (of ~15) |
| Missing / weak tests               | 5           |

---

# Spec: `core:approve-signoff`

## Requirements Summary

Mirror of ApproveSpec for signoff: gate `'signoff'`; `recordSignoff`; stay in `approval.signoff` `from` (currently `done`); drain `pending-signoff → signed-off`; same hash/mutate/input/factory pattern.

## Implementation Status

| ID                       | Status      | Notes                                                |
| ------------------------ | ----------- | ---------------------------------------------------- |
| AG-1 Gate guard          | Implemented | `approve-signoff.ts:71-84`                           |
| AG-2 Lookup              | Implemented |                                                      |
| AG-3 Hashes              | Implemented | Inside mutate, same helper                           |
| AG-4 Record + transition | Implemented | `transition('signed-off')` only if pending (`96-98`) |
| AG-5 Persist             | Implemented |                                                      |
| AG-6 Input               | Implemented | `name` + `reason`                                    |
| AG-7 Baked gates         | Implemented |                                                      |
| AG-8 Factory             | Implemented | `resolveApproveSignoffDeps`                          |

## Discrepancies

### LOW — Hash timing vs mutate

Same as ApproveSpec: hashes inside `mutate`. Spec-wording vs stronger code. Prefer code. **Unchanged from 144106.**

### LOW — Test describe lag

`approve-signoff.spec.ts:242` describe still says “not in pending-signoff” while the assertion is “not in done **or** pending”. Fixture is drafting (`makeChange`). Behaviour matches verify; description is stale (test-only, not production).

No HIGH/MEDIUM in-place vs pending-hop bugs. **No regression.**

## Test Coverage

| Scenario              | Coverage                                        |
| --------------------- | ----------------------------------------------- |
| Gate disabled, no I/O | `approve-signoff.spec.ts:200-221`               |
| Not found             | `:287-304`                                      |
| Done stays done       | `:71-91`                                        |
| Drain → `signed-off`  | `:116-134`                                      |
| Invalid state         | `:242-261`                                      |
| Schema mismatch       | `:264-284`                                      |
| Mutate                | `:177-197` (**drain only**)                     |
| Factory               | `composition/use-cases/approve-signoff.spec.ts` |

## Missing Tests

Same shape as ApproveSpec: persist-from-`done` mutate spy; cleanup/null-skip/schema-throw through this use case; factory `resolveApproveSignoffDeps` / `contentHasher`.

## Spec Dependency issues

Same chain including `core:transition-checks`. Bindings `from=done` match `boundFromStates('approval.signoff')`. No spec still requiring happy-path `pending-signoff`.

## Counts (`core:approve-signoff`)

| Metric                             | Count       |
| ---------------------------------- | ----------- |
| Requirements                       | 8           |
| Implemented as specified           | 8           |
| Discrepancies HIGH / MEDIUM / LOW  | 0 / 0 / 2   |
| Verify scenarios with direct tests | 10 (of ~15) |
| Missing / weak tests               | 5           |

---

# Spec: `core:config`

## Requirements Summary

**This change’s delta** rewrites **Requirement: Approvals** and adds dependency on `core:transition-checks`.

**Approvals (delta):**

- YAML `approvals.spec` / `approvals.signoff`, both default `false`.
- **`spec: true`:** in-place wait on `ready`; any **forward** leave of `ready` blocked until `ApproveSpec`; includes `ready → implementing` and `ready → verifying` if `implementing` omitted; **redesign `ready → designing` MUST NOT require the spec gate**; fail `APPROVAL_REQUIRED`; new work MUST NOT enter `pending-spec-approval`; drain from already-pending legal; `change transition` targeting `pending-spec-approval` is never next-action.
- **`signoff: true`:** stay in `done` until `ApproveSignoff`; `done → archivable` gated; no happy-path `pending-signoff`; drain legal; transition targeting `pending-signoff` is never next-action.
- Flags independent.

**Other requirements (not in this delta; remaining sections):** file location, privacy, env overrides, actor, local override, cascade, schema ref, invalidation, workspaces, workspace/project graph, storage, named adapters, config path, template variables, schema plugins/overrides, context selection/mode/instructions, logging, LLM optimization, plugins, config writer, startup validation, legacy warnings.

This batch **fully audited Approvals**. Other config requirements were not re-proven line-by-line; no contradiction with the in-place gate model was found in the loader defaults path.

## Implementation Status (Approvals)

| ID                                   | Status      | Notes                                                                                                                                                                              |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFG-APR-1 Parse + defaults           | Implemented | `config-loader.ts:616` `data.approvals?.spec ?? false` (same for signoff). `SpecdConfig.approvals` required on resolved config (`specd-config.ts:220`).                            |
| CFG-APR-2 Forward leave of ready     | Implemented | Binding + `approval.spec` check; engine `effectiveTarget` stays `implementing` while `availableTransitions` omits it and `APPROVAL_REQUIRED` (`lifecycle-engine.spec.ts:266-281`). |
| CFG-APR-3 Redesign exempt            | Implemented | `along=forward` only on `approval.spec`; redesign is not forward. Test: designing + gate on → nextAction is `/specd-design`, not approve (`lifecycle-engine.spec.ts:284-292`).     |
| CFG-APR-4 Signoff in-place           | Implemented | Binding `done → archivable`; transition tests stay in `done`.                                                                                                                      |
| CFG-APR-5 No happy-path pending      | Implemented | See re-check table. Spec text matches code (no “must hop to pending” wording in preview).                                                                                          |
| CFG-APR-6 nextAction not pending hop | Implemented | Approve commands; `targetStep` is current wait state (`ready`/`done`) or drain `spec-approved`/`signed-off` with **approve** command, never `change transition` to pending.        |

## Discrepancies

### LOW — Config-loader tests do not encode default-false or “no pending hop”

- **Spec verify:** omitted `approvals.spec` / `approvals.signoff` default `false`; “spec gate on does not require pending-spec-approval in the graph”.
- **Tests:** `config-loader.spec.ts:961-973` and `:1836-1854` only assert **explicit** `{ spec: true, signoff: false }`. Defaults are implemented in loader but **not** asserted. Graph/nextAction semantics are tested in `lifecycle-engine.spec.ts` / `transition-change.spec.ts`, not under config-loader.
- **spec-wrong:** no. Product-facing Approvals text is aligned with in-place gates.
- **code-wrong:** no (defaults exist).
- **Verdict:** test gap on the config spec’s own verify file, not a loader bug. **Unchanged from 144106.**

### INFO — Engine still special-cases pending step names when gate is on

`_isStepPermitted` (`lifecycle-engine.ts:344-348`) still treats `pending-spec-approval` / `spec-approved` as permitted **iff** `approvals.spec && isValidTransition`. Combined with `VALID_TRANSITIONS`, **ready cannot enter pending**. Drain from pending remains. Not a happy-path leak; leftover parking-state awareness.

## Test Coverage

| Scenario                                     | Where                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Explicit `approvals.spec: true`              | `config-loader.spec.ts:961-973`                                         |
| Independent flags (spec true, signoff false) | same                                                                    |
| Gate on, wait is check not pending hop       | `lifecycle-engine.spec.ts:266-281`, `transition-change.spec.ts:378-407` |
| Signoff on, stay in done                     | `transition-change.spec.ts:436+`                                        |
| Defaults omitted section                     | **missing in config-loader**                                            |

## Missing Tests

| Gap                                                                                                | Severity                |
| -------------------------------------------------------------------------------------------------- | ----------------------- |
| Load `minimalYaml()` with no `approvals:` → `{ spec: false, signoff: false }`                      | LOW                     |
| `approvals.signoff: true` parsed true (isolated)                                                   | LOW                     |
| Config-level test that `HAPPY_PATH_NEXT` / nextAction never names `pending-*` as transition target | LOW (covered elsewhere) |

## Spec Dependency issues

Delta adds `core:transition-checks` — “approvals are in-place checks, not pending hops”. **Consistent** with bindings and Approve\* use cases.

Other listed deps (`core:vcs-adapter-port`, `default:_global/architecture`) unchanged by this delta; no conflict identified.

**Potential cross-spec note:** `core:config` Approvals text is the product-facing description; mechanical truth lives in `core:transition-checks` + engine. That split is intentional and aligned.

## Counts (`core:config`)

| Metric                                              | Count                                  |
| --------------------------------------------------- | -------------------------------------- |
| Requirements in spec (all sections)                 | ~24                                    |
| Requirements in this change’s delta (fully audited) | 1 (`Approvals`)                        |
| Approvals sub-rules audited                         | 6                                      |
| Implemented (Approvals)                             | 6                                      |
| Discrepancies HIGH / MEDIUM / LOW                   | 0 / 0 / 1                              |
| Missing tests (Approvals verify)                    | 3                                      |
| Other config requirements                           | Not counted as pass/fail in this batch |

---

# Spec: `core:hook-execution-model`

## Requirements Summary

| ID   | Requirement                          | Substance                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ----------- | ------------------ | ---- | ------------------------------------------------------------- |
| H-1  | Two hook types                       | `instruction:` query-only; `run:` via `HookRunner`; XOR keys (schema).                                                                                                                                                                                                                                                                  |
| H-2  | External hooks                       | `external: { type, config }`; not shell `HookRunner`; fail if no runner.                                                                                                                                                                                                                                                                |
| H-3  | External phase semantics             | Same pre fail-fast / post collect-or-abort as `run:`.                                                                                                                                                                                                                                                                                   |
| H-4  | instruction passive                  | `TransitionChange` / `ArchiveChange` / `RunStepHooks` skip instruction; `GetHookInstructions` only; not in CompileContext.                                                                                                                                                                                                              |
| H-5  | Default execution                    | Effects after predicates; slot from binding `phase`/`onFailure`; Transition: `before-persist` for both `hook.pre`/`hook.post`; Archive: pre before persist abort, post after persist collect; no private always-source.post; no check-id branching to launch `RunStepHooks`; skip by phase **and** selectors (shared `before-persist`). |
| H-6  | Two modes                            | Standalone RunStepHooks fail-fast pre / fail-soft post; Transition/Archive use binding `onFailure`; transition `hook.post` is abort before persist.                                                                                                                                                                                     |
| H-7  | Change entity does not execute hooks | Application layer runs matching effects.                                                                                                                                                                                                                                                                                                |
| H-8  | skipHooks                            | Transition selectors `source.pre                                                                                                                                                                                                                                                                                                        | source.post | target.pre | target.post | all`; Archive `pre | post | all`; skips **effects** only; along filter for manual skills. |
| H-9  | Pre-hook failure                     | Transition/Archive throw `HookFailedError`, no persist; standalone CLI exit 2; fail-fast.                                                                                                                                                                                                                                               |
| H-10 | Post-hook failure                    | `abort` vs `collect` from binding.                                                                                                                                                                                                                                                                                                      |
| H-11 | Ordering                             | Schema then project, declaration order.                                                                                                                                                                                                                                                                                                 |
| H-12 | Template expansion                   | `change.name`, `change.path`, `project.root`; **not** `change.workspace`; unknown left; shell-escape.                                                                                                                                                                                                                                   |

**Change deltas:** H-5, H-6, H-7 (rename), H-8 skip no-ops, H-10 transition post before persist, along filters, recovery omit hooks, constraints, numbered flows.

## Implementation Status

| ID         | Status                     | Notes                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| H-1        | Implemented                | `RunStepHooks` filters instruction (`run-step-hooks.ts:211-214`); GetHookInstructions separate.                                                                                                                                                                        |
| H-2 / H-3  | Implemented                | External dispatch `run-step-hooks.ts:294-309`; `ExternalHookTypeNotRegisteredError`.                                                                                                                                                                                   |
| H-4        | Implemented                | Effects call `RunStepHooks` which skips instruction.                                                                                                                                                                                                                   |
| H-5        | Implemented                | `TransitionChange` `matchingEffects(..., 'before-persist')` then persist (`transition-change.ts:255-292`). `ArchiveChange` constructor has **no** `RunStepHooks` (`archive-change.ts:222-236`); effects on bindings. Skip in `HookEffectCheck` by `all` / archive `pre | post`/`target.pre`/`source.post`— **not**`binding.phase` alone (`hook-effect.ts:133-149`). |
| H-6        | Implemented                | `hookFailureMode(binding.onFailure)` (`transition-change.ts` `_executeEffect`). Archive post `collect` (`ARCHIVE_BINDING_SPECS`).                                                                                                                                      |
| H-7        | Implemented                | Entity has no HookRunner; tests assert auto-run via use case.                                                                                                                                                                                                          |
| H-8        | Implemented                | Types `HookPhaseSelector` / `ArchiveHookPhaseSelector`. `source.pre` / `target.post` are no-ops in `HookEffectCheck`. Predicates still run (`skipHookPhases` only read by hook **effects**).                                                                           |
| H-9 / H-10 | Implemented                | Pre/post fail tests in `transition-change.spec.ts` / `archive-change.spec.ts`. Source.post fail does not persist (`:1506-1561`).                                                                                                                                       |
| H-11       | Implemented (pre-existing) | Schema merge + RunStepHooks order; not re-proven in this delta.                                                                                                                                                                                                        |
| H-12       | Implemented                | Production variables `name`+`path` only (`run-step-hooks.ts:196-197`). Test `does not inject a singular workspace` (`run-step-hooks.spec.ts:662+`).                                                                                                                    |

## Discrepancies

### LOW — NodeHookRunner fixture still passes `workspace`

- **Spec H-12:** `HookVariables` never contains `workspace` under `change`.
- **Production:** compliant (`run-step-hooks.ts:196-197`).
- **Test:** `hook-runner.spec.ts:80` still passes `workspace: 'default'` because `TemplateVariables` is a loose `Record`. Expander **would** substitute `{{change.workspace}}` if a caller stuffed the key.
- **spec-wrong:** no.
- **code-wrong:** only if a caller injects workspace; `RunStepHooks` does not.
- **Verdict:** test-fixture drift / type too wide; not a happy-path product bug. **Unchanged from 144106.**

### INFO — `skipHookPhases` on predicate context

Passed into `executeMatchingPredicates` (`transition-change.ts:213`) but only `HookEffectCheck` reads it. Predicates ignore it → effects-only skip holds.

### INFO — Test helper still takes `RunStepHooks` as 4th arg

`newArchiveChange` (`helpers.ts:944-982`) preserves the old call shape and injects hooks via `createHook*` in `makeArchiveBindings`. Production `ArchiveChange` does not accept `RunStepHooks`. Not a spec violation.

No HIGH/MEDIUM vs this change’s hook deltas. **No regression.**

## Test Coverage

| Scenario                                    | Coverage                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Skip all / target.pre / source.post         | `transition-change.spec.ts:1347+`, `:1564+`, `:1699+`                      |
| source.pre / target.post no-op              | `:1607-1690`                                                               |
| Redesign/backward omit hook.post            | `matching-effects.spec.ts:33-54`; along in transition-change               |
| Recovery omits hook.pre and hook.post       | `matching-effects.spec.ts:56-66`                                           |
| Source.post fail, state stays implementing  | `transition-change.spec.ts:1506-1561`                                      |
| Archive skip pre/post/all                   | `archive-change.spec.ts:1837-2012`                                         |
| Archive post collect                        | matching-effects archive after-persist + archive-change post-failure tests |
| Instruction skipped                         | `run-step-hooks.spec.ts` instruction filter; GetHookInstructions tests     |
| Template no workspace                       | `run-step-hooks.spec.ts:662+`; `template-expander.spec.ts` uses name/path  |
| skip-hooks does not skip predicates         | `transition-change.spec.ts` (~2396) tasks still fail with skip all         |
| Archive ctor has no RunStepHooks field      | `archive-change.spec.ts:169-181`                                           |
| archive.publication absent                  | `transition-checks.spec.ts:390-392`                                        |
| Transition bindings from registry, not stub | `transition-change.spec.ts:84-103`                                         |

## Missing Tests

| Gap                                                                                                                                                     | Severity                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `{{change.workspace}}` left unexpanded **and** production bag has no key (hook-runner unit uses a bag **with** workspace)                               | LOW                          |
| Hook ordering schema-before-project through TransitionChange (likely covered in RunStepHooks / merge tests, not this delta’s verify file)               | LOW                          |
| External hook abort vs collect on archive vs transition in one test (policy is binding-level; `matching-effects.spec.ts:68-80` covers archive policies) | LOW                          |
| Direct unit test that `new TransitionChange(...)` without a 7th arg is a TypeScript error (enforced by types; no runtime default to prove)              | LOW (not a gap in behaviour) |

## Spec Dependency issues

Delta depends on `core:transition-checks` for shared matcher. **Consistent:** effects use same `from`/`to`/`along` as predicates; `instruction:` is not a CheckId; `archive.publication` is not a CheckId.

Also depends on `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, CLI skip-hooks specs. Numbered “Default transition with hooks” flow matches code (predicates → before-persist effects → persist; no after-persist on TransitionChange).

`core:config` schemaOverrides for project hooks: not re-audited here; no conflict with in-place approvals.

## Counts (`core:hook-execution-model`)

| Metric                            | Count                                             |
| --------------------------------- | ------------------------------------------------- |
| Requirements                      | 12                                                |
| Implemented as specified          | 12                                                |
| Discrepancies HIGH / MEDIUM / LOW | 0 / 0 / 1                                         |
| Delta verify scenarios with tests | 10+ (matching-effects + transition/archive specs) |
| Missing / weak tests              | 3                                                 |

---

# Batch summary

| Spec                        | Reqs audited                                | HIGH | MEDIUM | LOW | In-place / pending / hooks focus                                                                            |
| --------------------------- | ------------------------------------------- | ---- | ------ | --- | ----------------------------------------------------------------------------------------------------------- |
| `core:approve-spec`         | 8                                           | 0    | 0      | 2   | Pass: ready stays ready; drain legal                                                                        |
| `core:approve-signoff`      | 8                                           | 0    | 0      | 2   | Pass: done stays done; drain legal                                                                          |
| `core:config`               | 1 section (Approvals) + rest not re-counted | 0    | 0      | 1   | Pass: flags describe checks not hops; wording aligned                                                       |
| `core:hook-execution-model` | 12                                          | 0    | 0      | 1   | Pass: skip = slot + selectors; no stub default; no Archive `RunStepHooks`; no `archive.publication` CheckId |

**Totals this batch:** HIGH 0, MEDIUM 0, LOW 6 (test/wording, not product leaks).

**Vs prior 144106:** **no regression.** Same LOW set. **No new HIGH/MEDIUM.**

**Strongest residual risk:** Approve\* artifact-hash cleanup / null-skip / schema-throw are specified on the use case but tested only in shared helpers or sibling use cases — not a pending-hop regression.

**In-place gate re-check:** no finding that new work is routed into `pending-spec-approval` or `pending-signoff`, or that `nextAction` recommends `change transition` **to** those states.

---

### Source: \_partial-cli.md

# Spec-compliance partial: CLI change commands

- **Mode:** change `workflow-transition-checks` (assigned specs only)
- **Auditor:** read-only; graph index reported FAILED by parent — used `specd graph search` (index still served symbols) then `Read`
- **Sources:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks` for `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`, `_implementation-tracking.ts`; tests under `packages/cli/test/commands/change/`
- **Neither spec nor code is treated as sole truth.** Each finding lists spec-drift vs implementation-bug interpretations.

---

## Prior 144106 re-check

Prior CLI batch: **0 HIGH, 0 MEDIUM remaining** (3 MEDIUMs closed). This pass confirms those closures still hold; remaining items are still **LOW** or **missing tests**.

### 1. Hide `OVERLAP_CONFLICT` in text when `review.reason` is `spec-overlap-conflict`

**Status: still resolved (implementation + tests).**

- Spec (`cli:change-status`): invalidation overlap MUST NOT appear as a text `OVERLAP_CONFLICT` blocker line; live overlap MAY still print it.
- Code (`status.ts` ~237–240): `textBlockers = review?.reason === 'spec-overlap-conflict' ? blockers.filter(code !== 'OVERLAP_CONFLICT') : blockers`.
- JSON/TOON still serializes the unfiltered `blockers` array (spec forbids the **text** line only).
- Tests (`status.spec.ts`):
  - `hides OVERLAP_CONFLICT in text when review reason is spec-overlap-conflict`
  - `prints live OVERLAP_CONFLICT when review is not spec-overlap-conflict` (archivable, `review.reason` null)
  - overlap-peer scenario also `expect(out).not.toContain('OVERLAP_CONFLICT')`

**Residual (LOW, not a MEDIUM regression):** if Core attached `review.reason: 'spec-overlap-conflict'` **and** a live `OVERLAP_CONFLICT` blocker, text would hide **all** such lines. Spec does not describe that mix.

### 2. Repair-guide examples: `MISSING_ARTIFACT` → `INCOMPLETE_ARTIFACT`

**Status: spec + tests aligned on `INCOMPLETE_ARTIFACT`. No leftover `MISSING_ARTIFACT` in CLI change tests.**

- Previewed `cli:change-transition` spec: repair-guide codes list `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `INCOMPLETE_TASKS`, `DEPS_INCONSISTENT`. Verify scenario: `! INCOMPLETE_ARTIFACT`.
- Delta `deltas/cli/change-transition/{spec,verify}.md.delta.yaml` uses `INCOMPLETE_ARTIFACT`.
- Tests: `transition.spec.ts` repair-guide mock + assertion use `INCOMPLETE_ARTIFACT`; `status.spec.ts` blocker text uses `INCOMPLETE_ARTIFACT` (message still says “missing”, which is Core copy, not the old code name).
- Repair guide **uses GetStatus `nextAction`**: `writeTextRepairGuide` prints `status.nextAction.{targetStep,command,reason}`; test `recommends verify when GetStatus nextAction is the verify skill` asserts `/specd-verify` and not `/specd-implement`.

### 3. Archive `--allow-overlap` / `--allow-out-of-scope`

**Status: implemented and unit-tested (flag forwarding).**

- Spec command signature documents both flags; `--allow-out-of-scope` is `impl.linksInScope` only.
- Code (`archive.ts`): optional spread of `allowOverlap` / `allowOutOfScope` onto `ArchiveChange.execute`.
- Tests: `passes allowOverlap when --allow-overlap is set`; `passes allowOutOfScope when --allow-out-of-scope is set`; `omits allowOverlap and allowOutOfScope when those flags are not set`.
- **Still missing:** `SpecOverlapError` stderr + `--allow-overlap` hint (implementation exists, no `it()`).

### 4. Other prior closures still hold

- Text DAG `hasTasks` aligned with JSON via `hasTasks === true || taskCompletionCheck !== undefined` in `renderDag`, top-level `artifactDag`, and nested `schema.artifactDag`.
- Artifact-drift CLI tests live in `status.spec.ts` (`describe('artifact-drift review rendering')`).
- **Coverage gaps unchanged:** no `it()` for `taskCompletionCheck` without `hasTasks: true`; drift test still omits `hasDrift: true` so `[drift]` is never asserted on **status**; JSON failure stream and `SpecOverlapError` still untested.

---

## Spec: `cli:change-status`

### Requirements Summary

| #   | Requirement                          | Intent                                                                                                                                                          |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                    | `specd change status <name> [--format text\|json\|toon]`                                                                                                        |
| 2   | Drafted status is read-only          | No mutating transitions; mark drafted; MAY show artifacts                                                                                                       |
| 3   | Output format                        | JSON/TOON `artifactDag[].hasTasks`; `state` is display projection (e.g. `complete-with-drift`)                                                                  |
| 4   | Task completion display in DAG       | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` remains boolean                                                                               |
| 5   | Display-state rendering              | Text prefers display state; JSON has canonical + display                                                                                                        |
| 6   | Lifecycle projections from GetStatus | No local `VALID_TRANSITIONS` re-filter                                                                                                                          |
| 7   | Text omits duplicated review files   | `review:` header without file lists; overlap peers still printed; no invalidation `OVERLAP_CONFLICT` line                                                       |
| 8   | Text blockers include check labels   | `! CODE — label: message`                                                                                                                                       |
| 9   | Schema version warning               | stderr vs `lifecycle.schemaInfo`; skip if null; exit 0                                                                                                          |
| 10  | Change not found                     | exit 1, `error:`                                                                                                                                                |
| 11  | Schema-derived fields                | Nested `schema.artifactDag` via `artifactDag()` / `childrenOf`; `hasTasks` OR `taskCompletionCheck`; text DAG display status; convergent nodes once; cached DAG |
| 12  | Delegates refresh to GetStatus       | No direct refresh / detector                                                                                                                                    |
| 13  | Implementation section               | `--implementation` uses SDK `buildImplementationReview`                                                                                                         |
| 14  | Task completion in details           | `tasks: N/M`                                                                                                                                                    |
| 15  | Basic info                           | name/state; no standalone `specs:` list                                                                                                                         |
| 16  | Specs and dependencies               | text section + JSON `specDependsOn`                                                                                                                             |

### Implementation Status

| Requirement                    | Status      | Evidence                                                                                                                                                |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Command signature            | Implemented | `registerChangeStatus`: `status <name>`, `--format`, `--implementation`                                                                                 |
| 2 Drafted read-only            | Implemented | `draftView` branch: `(drafted)`, `transitions: (none — change is drafted)`, JSON `isDrafted: true`                                                      |
| 3 Output format / DAG hasTasks | Implemented | JSON `artifactDag` maps `displayStatus` into `state`; `hasTasks` OR `taskCompletionCheck`                                                               |
| 4 DAG task tags                | Implemented | `renderDag` `taskTag`                                                                                                                                   |
| 5 Display-state                | Implemented | Details use `a.displayStatus`; DAG uses `displayStatus ?? effectiveStatus`; JSON artifacts have `state` + `displayStatus`                               |
| 6 GetStatus projections        | Implemented | Prints `lifecycle.availableTransitions` / `nextAction` as returned                                                                                      |
| 7 Review / overlap text        | Implemented | Review header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; text filter as above                                                  |
| 8 Blocker labels               | Implemented | `b.label` branch                                                                                                                                        |
| 9 Schema warning               | Implemented | Compare `change.schemaName@version` to `lifecycle.schemaInfo`; skip if null                                                                             |
| 10 Not found                   | Implemented | `handleError` / `ChangeNotFoundError`                                                                                                                   |
| 11 Schema-derived DAG          | Implemented | `getActiveSchema` + `schema.artifactDag()` when not raw and functions exist; else `ArtifactDag.from(schemaInfo.artifacts)`; `visited` set omits repeats |
| 12 Refresh policy              | Implemented | `status.execute({ name })` only; tests assert refresh not called                                                                                        |
| 13 Implementation section      | Implemented | `enrichImplementationTracking` → `buildImplementationReview`                                                                                            |
| 14 Details tasks               | Implemented | `tasks: complete/total`                                                                                                                                 |
| 15–16 Basic info / specs       | Implemented | No standalone `specs:`; `specs and dependencies:` after DAG                                                                                             |

**Partial notes (not HIGH/MEDIUM):**

- Draft JSON omits `artifactDag` / nested `schema.artifactDag`. Spec MAY show artifacts on drafts; payload is thinner than active JSON.
- Nested JSON `schema` **overwrites** `{ name: change.schemaName, version: change.schemaVersion }` with `schemaInfo` + `artifactDag`. Recorded vs active mismatch is only on stderr.
- Default `getActiveSchema` mock in CLI tests has no `artifactDag()`; unit tests mostly hit the `ArtifactDag.from(schemaInfo)` fallback, not the cached-schema branch.

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Help JSON schema vs emitted JSON.** Help documents `schema: { name, version }` and top-level `artifactDag`. When `schemaInfo` is present, emitted `schema` also includes `artifactDag`, `optional`, `output`, `children`. Help `artifacts[].files` omits `hasDrift` / `displayStatus`.
   - Spec-wrong: help example is abbreviated vs Schema-derived fields.
   - Code-wrong: none; nested schema is required.
   - Prefer: extend help to match nested `schema.artifactDag` and file display fields.

2. **Draft `nextAction` is not CLI-stripped.** Spec MUST NOT print actionable mutating transitions. CLI prints Core’s `nextAction.command` as-is (tests mock `command: null`). If Core sent a transition command for a draft, CLI would print it.
   - Spec vs Core contract; CLI is a projector.

3. **Text DAG without `displayStatus` falls back to `effectiveStatus`; details do not.** DAG: `displayStatus ?? effectiveStatus`. Details: always `a.displayStatus` (can print `undefined` if Core omits it). Spec assumes GetStatus supplies display status.
   - Spec-wrong if Core may omit the field.
   - Code-wrong if CLI MUST always show `complete-with-drift` even when Core only sets `hasDrift`.
   - Robustness only unless Core actually omits `displayStatus`.

### Test Coverage

Primary file: **`packages/cli/test/commands/change/status.spec.ts`**.

Covered: missing name; drafted JSON/text; refresh not called; text sections; blockers (`INCOMPLETE_ARTIFACT`); JSON lifecycle; DAG children/`hasTasks`/display state in **JSON**; overlap hide/show `OVERLAP_CONFLICT`; overlap peers; JSON `overlapDetail`; schema mismatch warning; not found; implementation section (mocked SDK adapter); details `tasks: N/M`; artifact-drift review header without paths.

`[drift]` **is** covered for `change artifacts` (`change-artifacts.spec.ts`), **not** for `change status`.

### Missing Tests (verify title vs `it()`)

| Verify scenario (spec-preview)                               | Matching `it()`                                                                                      | Gap                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| DAG fallback `[hasTasks]` when no `taskCompletion`           | —                                                                                                    | Tree test always supplies `taskCompletion`                                         |
| `hasTasks \|\| taskCompletionCheck` on text+JSON             | —                                                                                                    | Schema fixtures use `hasTasks: true` only; **taskCompletionCheck DAG still a gap** |
| Text prefers `complete-with-drift`                           | JSON-only `JSON output includes hasTasks and drift-aware state`                                      | No text DAG/details assertion for display status / `[!]`                           |
| JSON row includes canonical **and** display                  | Partial: `artifactDag.state` is display; `artifacts[].state` vs `displayStatus` not both in one test | Weak                                                                               |
| Incomplete tasks omit `verifying` from available transitions | —                                                                                                    | Pass-through; untested at CLI                                                      |
| `nextAction` implement vs verify follows GetStatus           | exists on **transition** repair guide                                                                | Status command untested                                                            |
| Artifact-review-required (not only artifact-drift)           | Drift/overlap tests are analogous                                                                    | No `reason: 'artifact-review-required'`                                            |
| Drift shown with `[drift]` in details                        | Drift test asserts `tasks.md` not path under review                                                  | Mock files omit `hasDrift`; **`[drift]` tag still a gap on status**                |
| `DEPS_INCONSISTENT` — Checking spec dependencies             | Labels only via overlap blockers                                                                     | No dedicated status label test                                                     |
| JSON `artifactDag` for custom/non-std schema                 | —                                                                                                    | Only generic schemaInfo artifacts                                                  |
| Text DAG convergent nodes once                               | —                                                                                                    | `visited` untested                                                                 |
| Cached `schema.artifactDag()` vs `ArtifactDag.from`          | —                                                                                                    | Mock schema lacks `artifactDag()`                                                  |
| Schema warning skipped when `schemaInfo` is null             | —                                                                                                    |                                                                                    |
| JSON `specDependsOn` matches manifest                        | Text specs section only; JSON lifecycle uses `{}`                                                    | No `expect(parsed.specDependsOn)`                                                  |
| `--help` lists `overlapDetail`                               | Help source includes it                                                                              | Help text not snapshotted                                                          |
| JSON still includes `OVERLAP_CONFLICT` when text hides it    | —                                                                                                    | Spec allows JSON to keep the blocker                                               |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`.

- `kernel.specs.getActiveSchema` is used for cached `artifactDag()`, not to recompute lifecycle. Compatible with `core:get-status` if `schemaInfo` remains the lifecycle snapshot.
- Implementation tracking goes through SDK review.
- Entrypoint help-schema completeness: LOW #1.

### Counts (`cli:change-status`)

| Metric                                      | Count                                     |
| ------------------------------------------- | ----------------------------------------- |
| Requirements                                | 16                                        |
| Implemented                                 | 16                                        |
| Partial                                     | 0 (draft JSON thinner; not a failed MUST) |
| Missing implementation                      | 0                                         |
| HIGH                                        | 0                                         |
| MEDIUM                                      | 0                                         |
| LOW                                         | 3                                         |
| Verify scenarios without a dedicated `it()` | 16 (table above)                          |

---

## Spec: `cli:change-transition`

### Requirements Summary

| #   | Requirement                           | Intent                                                                                  |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Command signature                     | `<step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope`; `--format`                |
| 2   | Next-transition resolution            | `--next` → `to: 'next'` (no local routing table)                                        |
| 3   | Delegates refresh to TransitionChange | Pre/post GetStatus `refreshImplementationTracking: false`                               |
| 4   | Approval-gate routing                 | No approval flags on execute; no rewrite to pending gates                               |
| 5   | Hook execution                        | Map `--skip-hooks` to `skipHookPhases`                                                  |
| 6   | Progress output                       | Generic check-progress bus `stream: "change-transition"` (never `hook-progress`)        |
| 7   | Transition hook observability         | Progress visible even if hook later fails                                               |
| 8   | Shared hook progress presentation     | Distinct stream from `run-hooks`                                                        |
| 9   | Output on success                     | Text confirmation; JSON terminal `complete` with `ok`                                   |
| 10  | Post-hook failure                     | Exit 2; no repair guide                                                                 |
| 11  | Invalid transition error              | Repair guide on stderr; JSON `result: "failure"` stream; labels; GetStatus `nextAction` |
| 12  | Incomplete tasks error                | Exit 1 naming artifact                                                                  |
| 13  | Check progress rendering              | Gerund labels; no `Executing:`                                                          |
| 14  | Unsatisfied requires                  | Surface Core blockers; repair guide from GetStatus                                      |

### Implementation Status

| Area                                                             | Status                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| Signature / `--next` / skip / allowOutOfScope                    | Implemented (`transition.ts`)                            |
| Pre-status refresh false + drafted block                         | Implemented                                              |
| Execute input (no approval flags; allowOutOfScope only if flag)  | Implemented                                              |
| Check presenter `change-transition`                              | Implemented (`_check-progress-presenter.ts`)             |
| Text success `transitioned name: from → to`                      | Implemented                                              |
| JSON complete ok                                                 | Implemented                                              |
| JSON complete failure + blockers/nextAction                      | Implemented (`result: 'failure'`, `to: requestedTarget`) |
| Repair guide stderr; HookFailedError → handleError exit 2        | Implemented                                              |
| Repair guide from GetStatus `nextAction`                         | Implemented (`writeTextRepairGuide`)                     |
| Progress: requires-check / task-completion-failed / transitioned | Implemented                                              |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Repair-guide example vs actual first line.** Spec example: `error: cannot transition to <step>`. Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Tests assert the Core message.
   - Spec-wrong if the example is a literal contract.
   - Code-wrong if the example MUST be the first line.
   - Prefer: treat example as illustrative; spec already says GetStatus drives the guide body.

2. **JSON `--next` failure `to` field.** Failure record uses `to: requestedTarget`, which can be `'next'` rather than a resolved state. Spec lists `from`/`to` on the complete record.
   - Spec-wrong: `to` may mean requested target including `'next'`.
   - Code-wrong: agents expecting a concrete lifecycle state.
   - Edge: Core rejection of `to: 'next'` may go through `handleError` (`HappyPathNextUnavailableError`) instead of the repair-guide JSON path.

### Test Coverage

File: `packages/cli/test/commands/change/transition.spec.ts` (approval-flag overlap also in `change.spec.ts`).

Covered: missing args; `--next` vs step exclusivity; `to: 'next'`; allowOutOfScope on/off; no approval flags; no pending rewrite; hook failure exit 2 without repair guide; hook progress before fail; JSON **success** stream + no `hook-progress`; gerund progress / no `Executing:`; illegal transition; repair guide with **`INCOMPLETE_ARTIFACT`**; approval-required stderr; `--next` from pending-spec-approval / pending-signoff / archivable; skip-hooks parse; incomplete tasks; repair guide verify skill from GetStatus; ReadOnlyWorkspace / ArchiveDependency / ArchiveImplementation repair guides; refresh false on status calls.

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                     | Matching `it()`                        | Gap                                                                        |
| ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Structured **failure** terminal `complete` with `result: "failure"` | JSON success stream only               | **JSON failure stream still a gap** (code writes it)                       |
| Repair guide not on stdout (JSON mode)                              | Text mode asserted                     | JSON failure path untested                                                 |
| `--skip-hooks target.pre` vs `source.post` **execution**            | Parse `skipHookPhases` set             | Does not prove Core hook behaviour (CLI maps flags only)                   |
| Unsatisfied requires surfaced                                       | Repair guide uses Core blockers        | No dedicated `requires` event / requires-only case                         |
| `--next` rejected from `archiving`                                  | pending/signoff/**archivable** covered | `archiving` state not a dedicated `--next` case (spec lists it with those) |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.

- CLI does not bake approval routing; refresh owned by TransitionChange.
- Repair guide second GetStatus uses `refreshImplementationTracking: false`.
- “Status omitted verifying before failed transition” is a **status** scenario; transition tests do not call the status command.

### Counts (`cli:change-transition`)

| Metric                           | Count |
| -------------------------------- | ----- |
| Requirements (spec.md groups)    | 14    |
| Implemented                      | 14    |
| HIGH                             | 0     |
| MEDIUM                           | 0     |
| LOW                              | 2     |
| Notable missing `it()` vs verify | 5     |

---

## Spec: `cli:change-approve`

### Requirements Summary

| #   | Requirement                    | Intent                                                                            |
| --- | ------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Command signatures             | `approve spec\|signoff <name> --reason` + `--format`                              |
| 2   | Delegates gate state to kernel | No gate flags; `kernel.changes.approve*` not `kernel.specs.*`                     |
| 3   | Artifact hash computation      | No CLI hashes                                                                     |
| 4   | Approve spec behaviour         | From `ready` (drain `pending-spec-approval`); no pending print; bound-`from` help |
| 5   | Approve signoff behaviour      | From `done` (drain `pending-signoff`); bound-`from` help                          |
| 6   | Output on success              | Text `approved <gate> for <name>`; JSON `{ result, gate, name }`                  |
| 7   | Error cases                    | Missing `--reason` / unknown sub-verb / wrong state / not found → exit 1          |

### Implementation Status

All Implemented in `approve.ts`: `requiredOption('--reason')`; execute `{ name, reason }` only; help uses bound-from language (`ready` / `done` + drain). Does not print `pending-spec-approval` / `moved`.

Handler never calls `kernel.changes.status`; tests still mock it. Harmless.

### Discrepancies

**HIGH / MEDIUM / LOW:** none on the CLI command itself.

### Test Coverage

File: `packages/cli/test/commands/change/approve.spec.ts`.

Covered: success text/JSON spec and signoff; execute shape `{ name, reason }`; stay in ready/done messaging; drain from pending states; missing reason; unknown sub-verb `review`; not found; wrong state (`ApprovalGateDisabledError`).

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                  | Matching `it()`                                     | Gap                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `approvalsSpec` / `approvalsSignoff` not on input                | Implied by `toHaveBeenCalledWith({ name, reason })` | No explicit `not.toHaveProperty('approvalsSpec')` (transition has this pattern)                       |
| Routed through `kernel.changes.approveSpec` not `kernel.specs.*` | Uses `kernel.changes.approveSpec.execute`           | No `expect(kernel.specs.approveSpec).not.toHaveBeenCalled()` (mock kernel has no `specs.approveSpec`) |
| Hashes computed by use case, CLI did not pass hashes             | Call shape has no hash fields                       | No history/hash assertion (Core’s job)                                                                |
| Help bound-`from` language                                       | —                                                   | Help strings untested                                                                                 |

None of these are implementation gaps.

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-checks`.

- Gate enablement baked in kernel matches `core:transition-checks`.
- No contradiction with global CLI error/format conventions.

### Counts (`cli:change-approve`)

| Metric                   | Count             |
| ------------------------ | ----------------- |
| Requirements             | 7                 |
| Implemented              | 7                 |
| HIGH                     | 0                 |
| MEDIUM                   | 0                 |
| LOW                      | 0                 |
| Missing dedicated `it()` | 4 (coverage nits) |

---

## Spec: `cli:change-archive`

### Requirements Summary

| #   | Requirement                  | Intent                                                                                                               |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature            | Canonical `specd changes archive <name>` + singular alias; `--skip-hooks`; `--allow-overlap`; `--allow-out-of-scope` |
| 2   | Prerequisites                | Must be `archivable`; error names current state                                                                      |
| 3   | Behaviour                    | Delegate to `ArchiveChange` (merge, move, history)                                                                   |
| 4   | Hook execution               | Map skip set                                                                                                         |
| 5   | Check progress rendering     | Gerund bus; no `Executing:`                                                                                          |
| 6   | Post-archive hooks           | Post-hook fail exit 2                                                                                                |
| 7   | Output on success            | Text archive path; invalidated section only when non-empty                                                           |
| 8   | Output on success (extended) | Invalidated list with `--allow-overlap`                                                                              |
| 9   | JSON output on success       | NDJSON `stream: "change-archive"` complete record (no second unwrapped `{ result: "ok" }`)                           |
| 10  | Error cases                  | not found / not archivable / merge fail exit 1                                                                       |

### Implementation Status

| Area                                                             | Status                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Flags + skip set + optional allow flags                          | Implemented                                                                    |
| Progress presenter `change-archive` (text stderr, JSON stdout)   | Implemented                                                                    |
| Text success + invalidated list                                  | Implemented                                                                    |
| JSON stream complete only (no extra object)                      | Implemented                                                                    |
| Post-hook failures → `cliError` exit 2 before success print      | Implemented                                                                    |
| SpecOverlapError custom stderr + `--allow-overlap` hint + exit 1 | Implemented                                                                    |
| Alias                                                            | Implemented at program: `command('changes').alias('change')` in `src/index.ts` |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none vs change-archive MUST lines.

**LOW:**

1. **`SpecOverlapError` bypasses `handleError`.** Always plain stderr + `process.exit(1)`. `--format json` does not emit a structured error object on stdout.
   - Spec-wrong: `Error cases` does not mention overlap; `--allow-overlap` implies overlap is a failure. Entrypoint: errors go to stderr as `error:` (this path complies).
   - Code-wrong: JSON/TOON parity with other domain errors if entrypoint implies `handleError` for all failures.
   - Prefer: document overlap in Error cases; optionally route through `handleError` for JSON.

2. **Prerequisites “naming the current state”.** CLI relies on `InvalidStateTransitionError` / `handleError` message. Test only checks `/error:/`, not that `done` appears. If Core’s message omitted the from-state, CLI would not add it.
   - Spec-wrong: MAY be Core’s message contract.
   - Code-wrong: if CLI MUST mention state even when Core is terse.

### Test Coverage

File: `packages/cli/test/commands/change/archive.spec.ts`.

Covered: text path; post-hook exit 2 without success line; JSON complete + `archivePath` / `invalidatedChanges`; NDJSON check-start/done then complete; invalidated text/JSON; not found; missing name; not archivable; skip-hooks all/pre/post/comma; empty skip set; **allowOverlap / allowOutOfScope on/off**; gerund progress + hook bus, no `Executing:`.

### Missing Tests (verify title vs `it()`)

| Verify scenario                              | Matching `it()`                                                            | Gap                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Singular alias `specd change archive`        | Tests register on `command('change')`                                      | Does not prove `index.ts` `changes` + alias wiring                      |
| Successful archive merges deltas / moves dir | Mocked use case only                                                       | CLI does not re-implement; no FS assertion (correct for CLI unit tests) |
| Omit invalidated section when empty          | `confirms archive in text format` does not assert absence of `invalidated` | Weak                                                                    |
| JSON no second unwrapped object              | JSON tests parse one object or NDJSON lines                                | Implicitly OK; no explicit “only stream records”                        |
| Spec overlap error + `--allow-overlap` hint  | Implementation in `archive.ts`                                             | **No `SpecOverlapError` test**                                          |
| Delta merge conflict/parse error             | —                                                                          | Relies on handleError                                                   |
| Error mentions current state (`done`)        | `exits 1 when change is not in archivable state`                           | Message not asserted                                                    |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `core:transition-checks`.

- Plural canonical + singular alias matches `cli:command-resource-naming` via parent alias.
- `--allow-out-of-scope` documented as `impl.linksInScope` — consistent with transition.
- Check-progress labels match `core:transition-checks` gerund bus.
- LOW overlap with entrypoint structured-error path (see above).

### Counts (`cli:change-archive`)

| Metric                 | Count |
| ---------------------- | ----- |
| Requirements           | 10    |
| Implemented            | 10    |
| HIGH                   | 0     |
| MEDIUM                 | 0     |
| LOW                    | 2     |
| Notable missing `it()` | 7     |

---

## Batch summary (CLI assigned specs)

| Spec                    | Requirements | Implemented | HIGH  | MEDIUM | LOW   | Impl gaps |
| ----------------------- | ------------ | ----------- | ----- | ------ | ----- | --------- |
| `cli:change-status`     | 16           | 16          | 0     | 0      | 3     | 0         |
| `cli:change-transition` | 14           | 14          | 0     | 0      | 2     | 0         |
| `cli:change-approve`    | 7            | 7           | 0     | 0      | 0     | 0         |
| `cli:change-archive`    | 10           | 10          | 0     | 0      | 2     | 0         |
| **Unique totals**       | **47**       | **47**      | **0** | **0**  | **7** | **0**     |

**Prior MEDIUMs:** remain closed. Repair-guide copy is `INCOMPLETE_ARTIFACT` in spec + tests. Overlap text filter and archive skippable flags remain implemented.

**Highest-value missing tests (not discrepancies):**

1. `status.spec.ts`: `taskCompletionCheck` without `hasTasks: true` → JSON + text DAG tags.
2. `status.spec.ts`: text `complete-with-drift` / `[drift]` (`hasDrift: true` on details files).
3. `transition.spec.ts`: JSON `event.result.result === 'failure'` complete record on the `change-transition` stream.
4. `archive.spec.ts`: `SpecOverlapError` stderr + `Use --allow-overlap` hint.

---

### Source: \_partial-skills-globals.md

# Partial audit: skills + project-wide globals

**Mode:** change `workflow-transition-checks` (spec-preview)  
**Assigned:** `skills:skill-templates-source`; cross-check vs `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/spec-layout`  
**Read-only.** Graph index **FAILED** this session; templates and tests read from disk (`packages/skills/templates/…`, `packages/skills/test/template-workflow.spec.ts`). CLI: `node packages/cli/dist/index.js`.  
**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; `specs show` for the four globals.

**Prior MEDIUM M6 (report `20260828-144106`):** **CLOSED.** Hop skills no longer list `OVERLAP_CONFLICT` in the typical `(e.g. …)` blocker parenthetical; they teach `review.reason: spec-overlap-conflict` → `/specd-design`, not `--allow-overlap`. Archive MAY list `OVERLAP_CONFLICT` and `--allow-overlap` for live overlap only. Test `does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills` exists. Change spec now has an explicit requirement for this split (it was silent at 144106).

---

## Area A — `skills:skill-templates-source`

### Requirements Summary

Merged `spec.md` has **19** requirement groups, **0** `#### Scenario:` headings (layout-compliant). Matching `verify.md` headings; overlap block adds two scenarios vs the 144106 18-requirement preview.

**Unchanged (still in merged preview; this change does not rewrite them):**

1. Template source location (`.md.tpl`, `skill.meta.json` / `specd-agent.meta.json`)
2. Template migration tree (`templates/skills|agents|shared`; no `specd-metadata/`)
3. Template metadata contract
4. Capability-aware install-time rendering (Handlebars, `sharedFolder`)
5. Graph impact terminology (dependents / dependencies / `--file`, not `--changes`)
6. Graph search snippet opt-in (`--snippet`)
7. Frontmatter source / injection / agent matrix / why no static frontmatter
8. Implementation tracking instructions (add + archive review of tracked files)
9. Metadata self-healing (no metadata-status scans; `generate-metadata` is forced rebuild only)
10. Optimizer agent gating (`llmOptimizedContext` from `project status`)
11. Agent-facing command roles (`specs show` vs `context` vs `metadata`)

**Added / tightened by this change:**

12. **In-place approval gates** — hop-owning skills + `shared.md.tpl` describe gates as stay-in-`ready`/`done` + human `approve`; MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff`; pending names are drain-only; `specd` entry skill is router-only; archive requires `archivable` and points signoff wait at `/specd-verify` in `done`.
13. **Implementation tracking in verify and implement** — cookbook in `shared.md.tpl` (`list|review|add|resolve|ignore`); verify drains `IMPLEMENTATION_STATE` / open files in-skill (no bounce to `/specd-implement`); implement requires zero open tracked files before recommending `/specd-verify`; prefer top-level `--symbol` links.
14. **Archive skill skips only pre hooks** — `changes archive --skip-hooks pre` (not `all`); no post `run-hooks archiving` after success; still fetch post `hook-instruction`.
15. **Design review scope without review file lists** — MAY key off `review: required: yes`; MUST NOT say files are listed under the text `review:` header; first scope is `artifacts (details):` / `affectedArtifacts`.
16. **Overlap invalidation vs live archive overlap** — `OVERLAP_CONFLICT` is live archive only. `specd-design` / `specd-implement` / `specd-verify` / `specd-new` MUST NOT list it among typical status blockers and MUST NOT teach `--allow-overlap` as the response to `spec-overlap-conflict`. `specd-archive` MAY list `OVERLAP_CONFLICT`; `--allow-overlap` only for live overlap, not invalidation review.

**Spec Dependencies (merged):** `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending drain-only). Canonical spec-ID labels with relative links — conforms to `default:_global/spec-layout`.

### Implementation vs templates

| Requirement                | Status          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place gates             | **Implemented** | `shared.md.tpl`: NEVER run `changes approve`; change **stays** in `ready` or `done`; pending names only as drain. Hook copy: do **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates; MUST NOT run `source.post` on `along` backward. `specd-design`: stay in `ready`, `approve spec`; no `pending-spec-approval`, no `change transition` into pending. `specd-implement`: stay in `ready`; do **not** `transition implementing` when spec gate unsatisfied. `specd-verify`: stay in `done`, `approve signoff`; no `pending-signoff`. `specd-new` `targetStep` table: pending rows **Drain only**; `ready`/`done` suggest human `approve` when gates unsatisfied. `specd/SKILL.md.tpl`: router; no signoff / `approve spec` / pending parking. `specd-archive`: already `archivable`; signoff wait is `/specd-verify` in `done`; no `pending-signoff`. |
| Impl tracking drain        | **Implemented** | `shared.md.tpl` documents `list`, `review`, `add`, `resolve`, `ignore`; resolve vs ignore; top-level `--symbol`; no catch-all. `specd-verify`: drain `IMPLEMENTATION_STATE` / open files via `shared.md`; do **not** redirect to `/specd-implement` solely for open files. `specd-implement`: `implementation list`; zero open before `/specd-verify`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Archive `--skip-hooks pre` | **Implemented** | Archive examples use `--skip-hooks pre`; explicit do **not** `run-hooks … archiving --phase post`; still `hook-instruction … --phase post`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Design review scope        | **Implemented** | First scope: `pending-review` / `[drift]` under `artifacts (details):` / `review.affectedArtifacts`. Text `review:` is `required` / `route` / `reason` — not file paths.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Overlap split (prior M6)   | **Implemented** | Typical `(e.g. …)` on design/implement/verify/new: `ARTIFACT_DRIFT`, `REVIEW_REQUIRED` only — **no** `OVERLAP_CONFLICT`. Body copy: `OVERLAP_CONFLICT` is archive-only; `spec-overlap-conflict` → `/specd-design`, `not \`--allow-overlap\``. Archive typical list includes `OVERLAP_CONFLICT`; `--allow-overlap`only for live overlap;`spec-overlap-conflict`→`/specd-design`, do not use `--allow-overlap`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Hop skills still **mention** `OVERLAP_CONFLICT` in prose as archive-only. That is the required disambiguation, not a typical-blocker listing. Compliant with the new overlap requirement.

Pre-existing contracts (graph `--direction dependents`, `--snippet`, optimizer gates, command roles, metadata self-healing) remain in templates and in older `template-workflow.spec.ts` cases.

**ValidateArtifacts / baseline drift:** templates still do not mention `ValidateArtifacts` or “run validate to detect baseline drift.” `shared.md.tpl` defines `drifted-pending-review` as disk change after validation (status language). No finding that skills still expect ValidateArtifacts to own baseline drift.

### Discrepancies

**Prior M6 / D-SK-1 — MEDIUM — Overlap invalidation vs `OVERLAP_CONFLICT` in typical blocker lists — CLOSED**

- **Then (144106):** design/implement/verify/new listed `OVERLAP_CONFLICT` in the typical blockers parenthetical; skills spec was silent; risk of conflating invalidation (`spec-overlap-conflict`) with live archive overlap.
- **Now:** change spec requires the split; templates and `it('does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills')` match. Not reopened.

**D-SK-2 — INFO — ValidateArtifacts baseline drift not taught in templates (compliant)**

No template tells agents to use ValidateArtifacts for `validatedHash` / baseline drift. Aligned with `core:validate-artifacts` + `core:storage`. Not a defect.

**D-SK-3 — LOW (narrowed) — hop skills still name `OVERLAP_CONFLICT` in body copy**

Not a spec miss: the overlap requirement forbids listing it as a **typical** blocker, not mentioning it to say it is archive-only. Residual agent-confusion risk is low because the same sentences point invalidation at `/specd-design`. Prefer keeping the sentence; do not treat as reopen of M6.

**D-SK-4 — LOW vs `default:_global/testing` — template contract tests are not `given/when/then` named**

`template-workflow.spec.ts` uses imperative titles (`does not teach pending parking…`, `does not treat invalidation overlap…`). Global testing prefers `"given <state>, when <action>, then <outcome>"` for behaviour tests. Assertions themselves match verify scenarios (exact phrases / parenthetical contents). Spec-or-test: rename tests or treat workflow-template string contracts as exempt documentation tests. Unchanged from 144106.

**D-SK-5 — LOW — overlap typical-blocker assertion is first-`(e.g.` match**

The new test uses `template.match(/\(e\.g\.[\s\S]*?\)/)` (first parenthetical). Today the first `(e.g.` on each hop skill **is** the blockers list, so the assertion is true. If an earlier `(e.g.` is added, the test could pass while a later typical-blocker list regresses. Spec-wrong vs test-wrong: tighten the regex to the `blockers:` sentence if this becomes flaky.

No hexagonal violation **inside** `@specd/skills` for these requirements (templates are content; rendering remains install-time). No new LifecycleEngine class-vs-function issue in this batch.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts` (Vitest, `test/`, `.spec.ts`, no snapshots). File reads templates from disk (fixture files, not a core port) — acceptable for template contract tests.

| Verify scenario                                                                                                                  | Covered?                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Verify does not route to `pending-signoff`                                                                                       | Yes (`not.toMatch(/pending-signoff/)`, stay in `done`, `approve signoff`)                                                   |
| Implement does not hop implementing while spec gate blocks                                                                       | Yes                                                                                                                         |
| Shared stay-in-state not reaches-pending                                                                                         | Yes (`**stays** in \`ready\` or \`done\``; no `reaches \`pending-spec-approval\``)                                          |
| Shared hook list not pending intermediates                                                                                       | Yes (`Do **not**\nlist \`pending-spec-approval\``)                                                                          |
| New-skill drain-only pending rows                                                                                                | Yes (`Drain only:`; spec-gate copy on `ready`)                                                                              |
| Design stays in ready                                                                                                            | Yes                                                                                                                         |
| specd entry does not teach signoff                                                                                               | Yes (`not.toMatch(/signoff/)`, `pending-spec-approval`, `approve spec`)                                                     |
| Archive in-place gates                                                                                                           | Yes (`archivable`, `approve signoff`, no `pending-signoff`)                                                                 |
| Shared implementation commands + resolve vs ignore + no catch-all                                                                | Partial — `list`/`resolve`/`ignore`/`add` guidance asserted; **`implementation review` not asserted** (present in template) |
| Verify drains open files, no bounce to implement                                                                                 | Yes                                                                                                                         |
| Implement zero-open before verify                                                                                                | Yes                                                                                                                         |
| Archive `--skip-hooks pre` not `all`; no post run-hooks; hook-instruction post                                                   | Yes                                                                                                                         |
| Design does not treat `review:` as file list                                                                                     | Yes                                                                                                                         |
| Design/implement/verify/new do not list `OVERLAP_CONFLICT` as typical blocker; not `--allow-overlap` for `spec-overlap-conflict` | **Yes** — `does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills`                                           |
| Archive MAY list `OVERLAP_CONFLICT`; `--allow-overlap` live-only; invalidation not `--allow-overlap`                             | **Yes** — same `it()` archive branch                                                                                        |

Older tests still cover optimizer gates, command roles, metadata self-healing (skill spec: keyword-only insufficient — existing tests use exact command strings).

### Missing Tests

| Gap                                                                                             | Severity                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Shared cookbook `specd changes implementation review <name>` not in the implement/verify `it()` | LOW (template has the command; verify requires it) |
| Optional: templates omit ValidateArtifacts-as-drift-owner (vacuously true; still unasserted)    | INFO lock, not required                            |
| Overlap test regex is first `(e.g.` only (see D-SK-5)                                           | LOW robustness                                     |

The 144106 missing test “hop skills do not treat invalidation as `OVERLAP_CONFLICT`” is **no longer missing**.

### Counts (`skills:skill-templates-source`)

| Metric                                                                                    | Count                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Requirements (merged spec.md)                                                             | 19                                                           |
| New/tightened this change (gates, impl drain, archive hooks, review scope, overlap split) | 5                                                            |
| Implemented as specified                                                                  | 5/5 of those                                                 |
| Discrepancies HIGH                                                                        | **0**                                                        |
| Discrepancies MEDIUM                                                                      | **0** (prior M6 closed)                                      |
| Discrepancies LOW                                                                         | **3** (D-SK-3 mention-in-prose; D-SK-4 naming; D-SK-5 regex) |
| INFO                                                                                      | 1 (VA not taught — OK)                                       |
| Missing tests                                                                             | 1 LOW (`review` command) + optional VA absence lock          |

---

## Area B — Cross-check: change specs vs `default:_global/architecture`

### Requirements (global)

Hexagonal layers; domain pure; application uses ports only; rich entities own invariants; **stateless domain operations as plain functions, not classes**; YAML validated at infrastructure boundary; adapter packages contain no business logic; composition via `createX(deps)`.

### Implementation / change-spec alignment

`skills:skill-templates-source` is markdown templates + install-time rendering. It does not introduce a domain `LifecycleEngine` class. Hexagonal **class vs plain functions** notes about `LifecycleEngine` live in core change specs, not this spec. Per assignment: **INFO unless new**. This batch adds **no new** architecture contradiction.

Skills package: templates are content; `@specd/skills` remains a renderer. Adapter-package “no business logic” does not apply as a defect to skill markdown.

**D-ARCH-1 — INFO — Residual hexagonal tension on core load-time invalidate (not skills)**

Calling `change.invalidate` from the fs adapter is domain mutation at the infrastructure edge. Architecture prefers use cases for application policy; here the **port contract** owns load-time reconstitution. Unchanged; **not H2**; **not new**. Do not escalate from this skills batch.

### Counts (architecture)

| Metric                                            | Count |
| ------------------------------------------------- | ----- |
| Change-spec vs architecture contradictions (HIGH) | 0     |
| New hexagonal findings in skills templates        | 0     |
| INFO residual (core hydration; pre-existing)      | 1     |

---

## Area C — Cross-check: `default:_global/testing`

### Requirements

Vitest; `test/` mirror; `.spec.ts`; unit tests mock ports; typed full port mocks; integration temp dirs + cleanup; given/when/then names; no snapshots.

### Implementation

`packages/skills/test/template-workflow.spec.ts` meets runner, location, suffix, no-snapshot. Reads templates from disk — not a port mock. No `as unknown as Port` in this file. No `toMatchSnapshot` / `toMatchInlineSnapshot` under `packages/skills/test`.

### Discrepancies

**D-TEST-1 — LOW** — titles are not given/when/then (same as D-SK-4). Does not weaken scenario coverage, including the new overlap `it()`.

### Counts

| Metric        | Count                                                           |
| ------------- | --------------------------------------------------------------- |
| HIGH / MEDIUM | 0                                                               |
| LOW naming    | 1 (same unique as D-SK-4; do not double-count in unique totals) |

---

## Area D — Cross-check: `default:_global/conventions`

### Requirements

Strict TS, ESM, named exports, kebab-case, no `any`, explicit public return types, SpecdError, lazy list vs get, immutability preference.

### Implementation

Assigned artifacts: markdown templates + Vitest tests. `template-workflow.spec.ts`: named imports, kebab-case path, `"type": "module"` package. No default exports in `packages/skills` source grep for this audit. No new core `any` in assigned files.

### Discrepancies

None in assigned skill artifacts.

### Counts

0.

---

## Area E — Cross-check: `default:_global/spec-layout`

### Requirements

Paired `spec.md` / `verify.md`; no WHEN/THEN in spec.md; scenarios under matching `### Requirement:` in verify.md; Spec Dependencies with canonical IDs.

### Implementation

`skills:skill-templates-source` merged preview: spec.md has Purpose, Requirements, Constraints, Spec Dependencies; **no** Scenario headings. verify.md groups scenarios under the same `### Requirement:` names, including **In-place approval gates**, **Implementation tracking in verify and implement**, **Archive skill skips only pre hooks**, **Design skill review scope**, **Overlap invalidation vs live archive overlap**. Dependency labels are `workspace:path` with relative `href`s. `core:transition-checks` is listed for in-place gates.

### Discrepancies

None for this spec.

### Counts

0 layout defects for `skills:skill-templates-source`.

---

## Unique HIGH / MEDIUM / LOW

Do not double-count D-SK-4 and D-TEST-1.

| ID                | Severity | Status           | Summary                                                                                   |
| ----------------- | -------- | ---------------- | ----------------------------------------------------------------------------------------- |
| M6 / D-SK-1       | MEDIUM   | **CLOSED**       | Typical `OVERLAP_CONFLICT` on hop skills; spec now requires split; templates + test match |
| H2                | HIGH     | **not reopened** | ValidateArtifacts vs load-time drift — skills still do not teach VA as drift owner        |
| D-SK-3            | LOW      | open (residual)  | Body still names `OVERLAP_CONFLICT` as archive-only (compliant teaching)                  |
| D-SK-4 / D-TEST-1 | LOW      | open             | Test titles not given/when/then                                                           |
| D-SK-5            | LOW      | open             | First-`(e.g.` regex brittleness                                                           |
| D-SK-2            | INFO     | n/a              | VA-as-drift-owner absent from templates (good)                                            |
| D-ARCH-1          | INFO     | pre-existing     | LifecycleEngine / fs `invalidate` vs plain-function/hex notes — not new in skills         |

**Unique HIGH:** 0  
**Unique MEDIUM:** 0 (prior M6 closed)  
**Unique LOW:** 3  
**INFO:** 2 (VA OK; hexagonal residual not new)

---

## Batch summary

| Area                          | HIGH | MEDIUM        | LOW                       | INFO              | Missing tests                          |
| ----------------------------- | ---- | ------------- | ------------------------- | ----------------- | -------------------------------------- |
| skills:skill-templates-source | 0    | 0 (M6 closed) | 3                         | 1 (VA not taught) | 1 LOW (`implementation review` assert) |
| vs architecture               | 0    | 0             | 0                         | 1 (not new)       | —                                      |
| vs testing                    | 0    | 0             | 0 unique (same as D-SK-4) | 0                 | —                                      |
| vs conventions                | 0    | 0             | 0                         | 0                 | —                                      |
| vs spec-layout                | 0    | 0             | 0                         | 0                 | —                                      |

**In-place gates / impl tracking:** templates match stay-in-`ready`/`done` (no pending parking happy path); verify drains `IMPLEMENTATION_STATE` in-skill; implement gates `/specd-verify` on zero open tracked files. Tests in `does not teach pending parking as the happy-path wait` and `verify drains open implementation files; implement gates verify on zero open`.

**Prior M6:** CLOSED as specified (typical parenthetical, archive exception, hop-skill test name).
