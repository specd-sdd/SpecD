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
