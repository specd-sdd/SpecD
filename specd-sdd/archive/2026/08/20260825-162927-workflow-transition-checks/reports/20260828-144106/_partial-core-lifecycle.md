# Partial audit: core lifecycle specs (`workflow-transition-checks`)

Read-only. Sources: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`, implementation under `packages/core`, tests under `packages/core/test`. Graph search for `LifecycleEngine` succeeded (`core:src/domain/services/lifecycle-engine.ts` class at line 148). No code or spec files were modified.

**Previously OPEN items (re-check):**

| Item                                                                                    | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LifecycleEngine `bypassFlags` actually omitting skippable blockers                      | **CLOSED** | `_blockersFromFailedChecks` returns `[]` when skippable and `isBypassFlagActive`; test `omits skippable OVERLAP_CONFLICT when bypassFlags include allow-overlap` accepts `allow-overlap` and `--allow-overlap`. Caveat: GetStatus never passes `bypassFlags` (archive predicates run with `allowOverlap: false`); omit-on-bypass is an engine `evaluate` contract, not the status merge path. |
| Historical `spec-overlap-conflict` is review + `/specd-design`, not `OVERLAP_CONFLICT`  | **CLOSED** | `_reviewBlockers` returns `[]` for `review.reason === 'spec-overlap-conflict'`; nextAction uses `/specd-design`. Tests in `lifecycle-engine.spec.ts` and `get-status.spec.ts`.                                                                                                                                                                                                                |
| GetStatus live overlap blocker only in `archivable`                                     | **CLOSED** | Archive predicates (including `spec.overlap`) run only when `change.state === 'archivable'`. Test `does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable`.                                                                                                                                                                                                            |
| TransitionChange reload after refresh; `allowOutOfScope` only forward exit implementing | **CLOSED** | After refresh, `get(name)` reloads before predicates (`transition-change.ts` ~173–180). Test `evaluates impl.filesResolved against post-refresh tracked files`. `impl.linksInScope` / `impl.filesResolved` bind `from: implementing`, `along: forward` only. `allowOutOfScope` skips links, not open files.                                                                                   |

**Graph:** `graph search "LifecycleEngine" --symbols` returned the domain class and public barrels. Further symbol walks used Read/Grep as fallback after locating files.

---

## Spec: core:lifecycle-engine

### Requirements Summary

Nine requirements:

1. **Centralized validation logic** — Sole interpreter; project from caller `CheckResult`s; no effects, no snapshot bag, no `check.run` fallback, no I/O. Optional pure `projectArtifacts`.
2. **Effective artifact status** — DAG mapping (`drifted-pending-review` / `pending-review` sticky; `complete` + unready parent → `pending-parent-artifact-review`; else persisted). Public API is `evaluate`, not a separate `computeEffectiveStatus`.
3. **Canonical-state-only** — Ignore `complete-with-drift` / `hasDrift` as lifecycle states.
4. **Machine-readable blockers** — `code`, `message`, `isSkippable`, optional `bypassFlag` / `affectedArtifacts`. Active bypass **omits** skippable blockers (no `warnings`). Mandatory codes include `MISSING_ARTIFACT`, `INCOMPLETE_ARTIFACT`, `OVERLAP_CONFLICT` (live archive overlap only; not historical review), `INVALID_TRANSITION`, `APPROVAL_REQUIRED`, etc.
5. **Available steps and next action** — One predicate evaluation. No approval rewrite. `validTransitions` = protocol; `availableTransitions` = predicates pass/skip; `availableSteps` = schema extras rows; `isReady` from `workflow.requires` results when present; `isPermitted` = protocol. Happy-path `nextAction` matrix including overlap → `/specd-design` (not `--allow-overlap`).
6. **Archiving escape** — `archivable` + `designing` available; recovery hop skips requires/taskCompletion.
7. **Review summary** — Drift vs overlap diagnostics.
8. **Shared consumers** — GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction; not CompileContext. Empty `checksByTarget` for DAG-only consumers.
9. **Next artifact** — `artifactDag().topologicalOrder()`, not declaration order; null if all complete/skipped.

Dependencies: `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`, `core:transition-checks`.

### Implementation Status

**Implemented** in `packages/core/src/domain/services/lifecycle-engine.ts`.

- `evaluate` projects injected `checksByTarget`; `availableTransitions` = targets whose injected rows have no `fail`.
- `projectArtifacts` / `_effectiveStatus` implement mapping rules including parent-review recursion.
- Canonical `complete` despite `hasDrift`; `missing` wins over drift diagnostic.
- `_blockersFromFailedChecks` sets skippable + `bypassFlag` for `OVERLAP_CONFLICT` and `impl.linksInScope` only; omits when bypass active.
- `_reviewBlockers` does **not** emit `OVERLAP_CONFLICT` for historical invalidation.
- `_resolveTarget` is identity (no pending rewrite).
- Recovery: `archiving` → `archivable` skips requires walk in `transitionBlockers`.
- `_nextAction` matches the happy-path matrix (including overlap `/specd-design`, done skill hops not becoming nextAction, archiving restore failure → designing).
- `_nextArtifact` uses `schema.artifactDag().topologicalOrder()`.
- Consumers: GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction call `evaluate`. CompileContext composition test asserts no LifecycleEngine on deps. `PredicateSnapshots` / `gatherPredicateSnapshots` absent.

### Discrepancies

1. **MEDIUM — `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT` (spec-wrong vs code-wrong)**
   - **Spec-wrong:** verify scenario “Engine unifies three validation dimensions” still requires `MISSING_ARTIFACT` for a missing required artifact. Spec.md also lists `MISSING_ARTIFACT` as mandatory.
   - **Code-wrong (if that verify scenario is binding):** `workflow.requires` `run()` always fails with `INCOMPLETE_ARTIFACT` even when effective status is `missing` (`domain/checks/workflow-requires.ts`). Engine test `given requestedTarget requires fail… does not dual-write MISSING_ARTIFACT` **requires** `INCOMPLETE_ARTIFACT` and forbids `MISSING_ARTIFACT`. When `workflow.requires` results are present, `_requestedTargetBlockers` does not re-walk to emit `MISSING_ARTIFACT`.
   - **Both:** The unification requirement (project from checks; do not dual-write) conflicts with the older three-dimension scenario. Reviewer should treat the check-projection rule as the newer contract and rewrite the unify scenario, **or** restore distinct codes in `workflow.requires`.

2. **MEDIUM — Live archive overlap does not affect engine `availableTransitions` / `nextAction` (spec-incomplete vs liar-context)**
   - **Spec-wrong / incomplete:** `OVERLAP_CONFLICT` is defined as archive `spec.overlap` while `state === 'archivable'`. Archive is an operation, not a lifecycle edge, so overlap is not a transition predicate. `nextAction` for `archivable` is `/specd-archive` whenever `archiving` is in `availableTransitions`.
   - **Code-wrong (if “liar context” in Purpose is binding):** GetStatus merges archive fails into public `blockers` but `evaluate()` never sees archive rows. Status can show `OVERLAP_CONFLICT` **and** recommend `/specd-archive`. ArchiveChange would still fail without `--allow-overlap`.
   - Engine `evaluate` without `requestedTarget` only puts **review** blockers in `verdict.blockers`; hop fails are GetStatus’s merge.

3. **LOW — Architecture vs class-shaped engine**
   - **Spec-wrong (architecture):** `default:_global/architecture` requires stateless domain services as **plain functions**, not classes.
   - **Code / this spec:** `LifecycleEngine` is a class with an optional debug callback. This change’s spec explicitly requires that class. Treat as an accepted override unless architecture is tightened to allow injectable domain services.

4. **LOW — `availableSteps` still independently walks `requires` for `blockingArtifacts`**  
   Even when `evaluationChecks` exist, `blockingArtifacts` is computed from DAG status, not from the check’s `details`. `isReady` uses the check. Step `blockers` are emptied when checks are present (`evaluationChecks !== undefined || isReady`). Unlikely to dual-write codes on `verdict.blockers`, but the step row can disagree with check `details`.

### Test Coverage

`packages/core/test/domain/services/lifecycle-engine.spec.ts` covers: parent-review, no pending rewrite, overlap not OVERLAP_CONFLICT, bypass omit, complete-with-drift, missing+hasDrift, topo next artifact, archiving escapes, incomplete/complete tasks vs verifying, nextAction matrix (designing/ready, verifying/done, archivable, done skill hops), impl bypassFlag split, omitted implementing extras row, no dual-write MISSING, injected checks without I/O.

Related: `validate-artifacts.spec.ts` empty `checksByTarget`; `get-artifact-instruction.spec.ts` same; `compile-context` composition “does not resolve LifecycleEngine”.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                 | Nearest `it()`                                                                 | Gap                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Engine unifies three validation dimensions                      | none; dual-write test asserts opposite code                                    | Missing **or** scenario stale                           |
| Detailed affected artifacts for drift                           | none asserting `affectedArtifacts` filename/spec                               | Missing                                                 |
| All artifacts complete yields null next artifact                | none (`nextArtifact` only asserted for incomplete DAG / drafted)               | Missing                                                 |
| Consumers rely on one shared lifecycle verdict                  | split across use-case tests, no single engine test                             | Cross-cutting gap                                       |
| TransitionChange does not re-walk requires after green evaluate | `does not CountTasks a second time after a green evaluate` (transition-change) | Partial; no “no second effective-status walk” assertion |
| CompileContext is not an evaluate consumer                      | `does not resolve LifecycleEngine through resolveCompileContextDeps`           | Close; no execute-path “does not call evaluate”         |

### Spec Dependency Chain issues

- **vs `core:transition-checks`:** Check projection vs mandatory `MISSING_ARTIFACT` (above). Archive overlap as status blocker vs transition `availableTransitions` (above).
- **vs `core:get-status`:** GetStatus Identifies blockers still says `MISSING_ARTIFACT` for missing **or in-progress**; engine + requires check use `INCOMPLETE_ARTIFACT`.
- **vs `default:_global/architecture`:** Class vs pure-function domain services (above). Engine stays I/O-free (architecture domain purity **holds**).
- **vs `core:change`:** Entity owns persisted hashes/history; engine owns DAG effective status — aligned.

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **9**
- Implemented: **9** (behavior present; two contracts internally conflict)
- Discrepancies: **4** (2 MEDIUM, 2 LOW)
- Missing tests: **6** scenario-title gaps (table)

---

## Spec: core:transition-change

### Requirements Summary

Twenty-two requirements covering: input (`name`, `to` including `'next'`, `skipHookPhases`, refresh, `allowOutOfScope` for **forward exit implementing** `impl.linksInScope` only); baked approvals; existence; refresh then evaluate against **post-refresh** tracking; approval as checks not pending hops; drain pending states; direct persist when predicates pass; map failed predicates (no second requires walk); taskCompletion via check/`CountTasks`; verifying→implementing retry without clearing validated artifacts; skill-hop signoff invalidation; designing invalidation; archiving→archivable recovery; effects via bindings not `check.id` switch; `mutate`; result `{ change }`; progress bus; deps without detector/`RunStepHooks`/`CountTasks` on the use case; `'next'` via `HAPPY_PATH_NEXT`; config factory through `resolveTransitionChangeDeps`.

Constraints: schema miss throws; omitted workflow step skips requires/tasks but not protocol; `allowOutOfScope` for links only; redesign must not run impl checks.

### Implementation Status

**Implemented** in `packages/core/src/application/use-cases/transition-change.ts` + composition `createTransitionChange` / `resolveTransitionChangeDeps`.

- Reload after refresh before predicates (previously OPEN — closed).
- `allowOutOfScope` on `CheckExecutionContext`; impl bindings `along: forward` from `implementing`.
- `executeMatchingPredicates` with `failFastOn: 'protocol.edge'`.
- `evaluate` with `checksByTarget: { [requestedTarget]: evaluation.checks }` then `_mapFailedPredicate` (switch on failed **id**, allowed by transition-checks).
- Effects via `matchingEffects(..., 'before-persist', along)` then `executeCheckWithProgress`; skip via `ctx.skipHookPhases` inside hook check (phase + selector), not use-case `check.id === 'hook.pre'`.
- Designing: `invalidate(...)` inside `mutate`; skill hops `invalidateSignoff`; no second `transition()` after invalidate.
- `'next'` uses `HAPPY_PATH_NEXT`; `HappyPathNextUnavailableError` for pending/archivable/archiving.
- Schema `get()` not swallowed (throws).
- Composition injects `transitionBindings` from registry, not domain `TRANSITION_BINDINGS`.

### Discrepancies

1. **MEDIUM — Designing path: spec requires `change.transition('designing')` after invalidate (spec-wrong vs code-wrong)**
   - **Spec:** After invalidation/downgrade, “Proceed with the transition via `change.transition('designing', actor)`.”
   - **Code:** If invalidate ran, `mutate` **does not** call `transition`. `Change.invalidate` already appends `transitioned` to `designing`; `state` is derived from history, so a second `transition` would be `designing → designing` (extra event).
   - **Spec-wrong:** Should say invalidate’s embedded transition is the persist hop.
   - **Code-wrong:** If the spec wants an explicit `transition()` call for a second history event. Tests expect a single designing landing without double invalidation.

2. **LOW — Stale “approval-gate routing” wording**  
   Purpose and Constraints still say routing is centralized through LifecycleEngine. Code and later requirements: requested target is the persist target; `_resolveTarget` is identity. **Spec-wrong** (docs drift). Code matches the newer “no rewrite” rules.

3. **LOW — `allowOutOfScope` is passed on every attempt**  
   Flag is on context even for redesign/recovery. Bindings do not match impl checks except forward exit implementing, so behavior is correct. Spec says the flag “MUST NOT skip `impl.filesResolved`” (enforced in check, tested) rather than “MUST NOT be passed”.

### Test Coverage

`packages/core/test/application/use-cases/transition-change.spec.ts` is extensive: not-found, schema throw, `'next'`, refresh default/opt-out, **post-refresh tracked files**, approvals stay in ready/done, drain pending, task gating, requires, mutate persist, hooks order/skip/fail-fast, check-start/done bus, designing invalidate vs no-op from designing/drafting, recovery without archive hooks, skill-hop signoff, CountTasks once, skip-hooks still predicates, allowOutOfScope skip links / still fail open files.

Composition: `createTransitionChange` config and deps forms.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                                     | Nearest `it()`                                               | Gap                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| TransitionChange does not invoke detector directly                                  | none named; no detector in constructor                       | Missing explicit assertion                |
| Factory passes config.approvals                                                     | composition instantiates from config                         | Does not assert `approvals` values        |
| createTransitionChange config form derives deps through resolveTransitionChangeDeps | `returns a wired TransitionChange instance from SpecdConfig` | Indirect                                  |
| Recovery does not run archiving.post                                                | `transitions to archivable without running archive hooks`    | Close                                     |
| designing pre-hooks run on redesign                                                 | redesign skip source.post; pre via hook.pre `along *`        | No dedicated “pre runs on redesign” title |

Most other verify scenarios have close `it()` coverage under different titles.

### Spec Dependency Chain issues

- **vs `core:lifecycle-engine`:** TransitionChange maps first failed predicate; does not re-walk requires after green execute — aligned. Does not pass `bypassFlags` into `evaluate` (skip happens in `impl.linksInScope` execute).
- **vs `core:transition-checks`:** fail-fast `protocol.edge`; effects by phase; skip selectors in hook check — aligned.
- **vs `core:change`:** Protocol still via `change.transition` except designing-via-invalidate (discrepancy 1).
- **vs architecture:** Use case uses ports; composition wires adapters. Manual DI. Aligned.
- **vs `core:refresh-implementation-tracking`:** Refresh primitive, not detector — aligned.

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **22**
- Implemented: **22** (designing persist via invalidate rather than `transition()`)
- Discrepancies: **3** (1 MEDIUM, 2 LOW)
- Missing tests: **5** title gaps

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
- Progress: `executeCheckWithProgress`; hook maps RunStepHooks onto `check-progress`.
- No `PredicateSnapshots` / `gatherPredicateSnapshots` / `emptyPredicateSnapshots`.

### Discrepancies

1. **LOW — Predicate bindings omit `phase`/`onFailure` on the row**  
   Spec: “Predicates on both tables default to `phase = before-persist` and `onFailure = abort`.” Stored specs omit those fields on predicates; tests assert they are omitted. Runtime treats missing as abort/before-persist. **Spec-wrong** if “declared on every binding” is literal; **code-correct** if defaults are implicit.

2. **LOW — Domain stub `execute` vs “MUST NOT be the production execute path”**  
   Domain `Check` objects still have `execute` (pure, no I/O). Production use cases compose `create*`. Spec allows domain stub objects. Residual risk if a test/use case accidentally uses `TRANSITION_BINDINGS`. Composition tests use registry. Acceptable.

3. Same **MISSING vs INCOMPLETE** and **archive overlap vs availableTransitions** as lifecycle-engine / GetStatus (cross-spec).

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

### Spec Dependency Chain issues

- Aligns with lifecycle-engine projections and TransitionChange execute slots.
- **vs architecture:** Application checks own I/O ports; domain `run(facts)` is pure. Aligned.
- Sugar `onEnter`/`onExit`/`onEdge` is authoring-only; stored rows are explicit triples — no sugar layer found (not a violation if unused).

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **15**
- Implemented: **15**
- Discrepancies: **3** (all LOW / cross-spec)
- Missing tests: **7** title gaps

---

## Spec: core:get-status

### Requirements Summary

Seventeen requirements: input (`name`, refresh, `ifModifiedSince`); result shape (change vs draftView, artifacts, review, blockers, nextAction); revision short-circuit (no refresh); drafted read-only DAG via `projectArtifacts`, empty transitions; implementation projection; refresh then project from reloaded persisted change; displayStatus `complete-with-drift`; taskCompletion from check CountTasks once; execute **all** matching predicates per legal hop (no protocol fail-fast); **archive predicates only when `archivable`**, live `OVERLAP_CONFLICT` only from those, historical overlap is review; constructor deps including archive bindings, no sibling CountTasks/detector; config factory via `resolveGetStatusDeps`; one artifact row per schema type; review priority (drift > overlap > pending-review) + unhandled overlap scan; blockers from review + failed predicates (no OVERLAP from review.reason); schema miss degrades; composition resolver.

### Implementation Status

**Implemented** in `get-status.ts` + `composition/use-cases/get-status.ts`.

- Resolution: `get` then `getDraft`; no `getDiscarded`.
- `ifModifiedSince` before refresh; then refresh; **always `get` again** for the projection source (covers “after refresh, load persisted state”).
- Draft: `projectArtifacts`, empty `availableTransitions` / `availableSteps`, `command: null`.
- `executeChecksByLegalTargets` then `evaluate`; archive `executeMatchingPredicates` only if `archivable` with `allowOverlap`/`allowOutOfScope` false.
- `_mergeBlockers` flattens all hop fails + archive fails; overlap `bypassFlag`; links-in-scope only for out-of-scope flag; filesResolved no bypass.
- Review from engine `_deriveReview` (same scan/priority).
- Schema catch degrades lifecycle fields; check execute is outside that catch.
- `taskCompletionFromChecks` reuses passMemo counts.
- `resolveGetStatusDeps` uses registry with `includeOverlapDetection: true` (I/O only runs when archivable).

### Discrepancies

1. **HIGH — Identifies blockers: `MISSING_ARTIFACT` for missing **or** in-progress (spec-wrong vs code-wrong)**
   - **Spec-wrong:** Bullet still assigns `MISSING_ARTIFACT` to missing **and** `in-progress`. Same spec’s Execute matching predicates / tests expect `INCOMPLETE_ARTIFACT` (GetStatus test `given incomplete required artifacts… INCOMPLETE_ARTIFACT is included`).
   - **Code-wrong (if Identifies blockers is binding):** Full path never emits `MISSING_ARTIFACT` for a missing required artifact; `workflow.requires` uses `INCOMPLETE_ARTIFACT`.
   - Align Identifies blockers with check codes.

2. **MEDIUM — Live `OVERLAP_CONFLICT` vs `nextAction` `/specd-archive`**  
   Same as lifecycle-engine discrepancy 2. GetStatus test for live overlap asserts blocker + bypassFlag, **not** that `archiving` is omitted from `availableTransitions` or that nextAction changes.
   - **Spec-wrong:** Archive is not a hop; listing overlap only as a blocker may be intended.
   - **Code-wrong:** Purpose of this change is to stop status advertising work execute would reject; `/specd-archive` would reject without `--allow-overlap`.

3. **LOW — Public `Blocker` drops `isSkippable`**  
   Engine `LifecycleBlocker.isSkippable` is not copied in `_mergeBlockers`. Skipability is implied by `bypassFlag`. GetStatus spec does not require `isSkippable` on the public type. **Spec-wrong** vs engine contract; **code-wrong** if agents need the boolean without inferring from flag.

4. **LOW — Drafted review is always a stub (`required: false`)**  
   Spec requires DAG effective status for drafts, not a full review summary. Files in `pending-review` on a draft will not set `review.required`. **Spec-wrong** if inspection should show review; **code-wrong** if “lifecycle projections for inspection” includes review.

5. Previously OPEN items for this spec: **closed** (historical overlap, archivable-only live overlap, refresh reload).

### Test Coverage

`get-status.spec.ts`: not-found, artifacts, refresh default/opt-out/draft skip, schema fail, CountTasks inside check + recount, incomplete tasks hide verifying, impl bypass split, deps label, DAG cascade, displayStatus, review drift/review codes, drafted empty transitions + DAG parent-review without hop evaluate, ifModifiedSince, INCOMPLETE_ARTIFACT / APPROVAL_REQUIRED merge, invalidation overlap without OVERLAP_CONFLICT, archivable live overlap, non-archivable no overlap I/O.

Composition `createGetStatus` from config/deps.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                           | Nearest `it()`                                                | Gap                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| Overlap detail merges multiple unhandled invalidations                    | none asserting `overlapDetail.length`                         | Missing                          |
| Overlap scan stops at forward transition boundary                         | none                                                          | Missing                          |
| Review overlapDetail is empty for non-overlap reasons                     | none                                                          | Missing                          |
| No invalidation event produces empty overlapDetail                        | none                                                          | Missing                          |
| Review reason is spec-overlap-conflict with single unhandled invalidation | `given invalidation overlap…` (no overlapDetail parse assert) | Partial                          |
| GetStatus does not invoke detector directly                               | none                                                          | Missing                          |
| refreshImplementationTracking defaults to enabled                         | `refreshes active changes by default`                         | Close                            |
| Constructor composes create-star checks                                   | composition wiring                                            | Indirect                         |
| Config-wired status path preserves schema-driven artifact-state           | none vs two repos                                             | Missing                          |
| CountTasks memo is per evaluation pass                                    | `recounts CountTasks on a second execute`                     | Close                            |
| Available transitions require persisted complete or skipped state         | incomplete tasks hide verifying                               | Partial (effective vs persisted) |
| Status exposes check rows                                                 | lifecycle.checksByTarget used internally                      | No dedicated title               |
| Open-file / links-in-scope IMPLEMENTATION_STATE                           | titled given/when/then tests                                  | Covered                          |
| Archivable status runs archive predicates                                 | live overlap tests                                            | Covered                          |

### Spec Dependency Chain issues

- **vs lifecycle-engine:** Review scan lives in the engine; GetStatus projects paths. Identifies blockers `MISSING_ARTIFACT` contradicts engine check projection.
- **vs transition-checks:** Collect-all predicates, no fail-fast — aligned. Archive operation rows only in archivable — aligned.
- **vs change:** Discarded not loaded — aligned. Draft via `getDraft` — aligned.
- **vs architecture:** Read-only use case; I/O through ports and check factories — aligned.

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **17**
- Implemented: **17**
- Discrepancies: **4** (1 HIGH, 1 MEDIUM, 2 LOW)
- Missing tests: **11** title gaps (4 overlapDetail/scan are the important ones)

---

## Spec: core:workflow-model

### Requirements Summary

Eleven requirements: `workflow[]` is extras lookup onto `ChangeState` (omit ≠ delete protocol; unknown step fails `buildSchema`); step semantics (design/implement/verify outcomes/archive); requires as `workflow.requires`; taskCompletion via CountTasks in the check; availability from engine projections; workflow order is display **and** progress axis with AXIS_FALLBACK splice; step name IS state name; hooks as effects with matcher (post forward-only, before persist); two execution modes (auto-run unless skip); requires are artifact IDs not step names.

### Implementation Status

**Implemented** across schema build, `classifyAlong`, bindings, TransitionChange, ArchiveChange, GetStatus.

- Unknown steps rejected at schema resolve (not TransitionChange).
- `workflowStep` null when omitted; hops remain on `VALID_TRANSITIONS`.
- Requires/taskCompletion checks; recovery exceptAlong.
- CompileContext does not evaluate availability (composition test).
- Post effects `along: forward` only.
- Archive hooks are operation `archive`, not a fake along.

### Discrepancies

1. **LOW — “implementation-failure” / “artifact-review-required” as workflow routing events**  
   Spec describes verification **outcomes** that route to implementing vs designing. There is no domain enum or automatic router; callers choose `to: implementing` vs `to: designing`. TransitionChange implements the **effects** of those hops (preserve artifacts vs invalidate).
   - **Spec-wrong:** Sounds like an engine-owned outcome type.
   - **Code-wrong:** If a named verification conclusion API was required.

2. **LOW — “Any file drifted-pending-review forces workflow back to designing”**  
   Engine `nextAction` when `review.required` is `/specd-design` with `targetStep` = **current state**, not a forced protocol move. Transition is not automatic.
   - **Spec-wrong:** “forces” vs recommend.
   - **Code-wrong:** If a transition must be applied automatically.

3. Cross-spec MISSING/INCOMPLETE and axis splice are implemented in `classifyAlong` (tests for omitted implementing/ready).

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

### Spec Dependency Chain issues

- **vs transition-checks / lifecycle-engine:** Axis and availability — aligned.
- **vs change:** Protocol table vs content gating — aligned (entity = VALID_TRANSITIONS; checks = tasks/requires).
- **vs architecture:** Semantics live in domain services + checks, not CLI — aligned.

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **11**
- Implemented: **11** (routing outcomes are caller-chosen hops)
- Discrepancies: **2** (LOW)
- Missing tests: **8** homonymous gaps (most covered under other specs)

---

## Spec: core:change

### Requirements Summary

Twenty-one requirements: identity; `updatedAt`; workspaces/specIds/specDependsOn; lifecycle states + VALID_TRANSITIONS (no pending from ready/done; skill hops; archiving escapes); skill-aligned backward hops (signoff only); archiving escapes; implementing/verifying loop; implementation tracking; explicit vs container-only links; historical implementation guard; spec/signoff gates as recorded consent; artifacts/file aggregate; artifact sync; history/events including overlap invalidation; archive outcome history; historical detection; schema version; drafting/discarding; drafted read-only; **lifecycle interpretation authority** (DAG outside the entity); policy-aware invalidation; per-file drift.

This audit focuses on lifecycle/transition-check overlap; identity/tracking/drafting were spot-checked against entity + tests, not every file-link edge.

### Implementation Status

**Implemented** in `packages/core/src/domain/entities/change.ts` + `change-state.ts`.

- `VALID_TRANSITIONS` matches spec tables (`ready` → implementing/designing only; `done` includes archivable/designing/implementing/verifying; `archiving` → archivable/designing; skill hops from done/signed-off/archivable; no `archivable → done`).
- `HAPPY_PATH_NEXT` sibling map; omitted pending/archivable/archiving.
- `state` derived from history (`transitioned` / invalidate-appended `transitioned`).
- `invalidate(..., 'spec-overlap-conflict')` supported; tests `handles spec-overlap-conflict cause`.
- Skill hop: use case invalidates signoff; entity `transition` does not mass-downgrade.
- No DAG effective status on the entity (`pending-parent-artifact-review` is engine-only).
- Gates: entity records approvals; TransitionChange/checks block hops — aligned with “stay in ready/done”.

### Discrepancies

1. **LOW — Entity protocol vs prose “implementing → verifying only valid when tasks complete”**
   - **Spec-wrong:** Lifecycle section says the transition is only valid when tasks complete, while also pointing at `workflow.taskCompletion`.
   - **Code:** `VALID_TRANSITIONS` always allows the pair; the check blocks execute/status. Architecture: entity owns protocol invariants; content gating is a check. Prefer the check sentence.

2. **LOW — `invalidate` embeds `transitioned` to designing**  
   Same as TransitionChange designing path. Entity is the source of that design. Spec “Returning to designing… `change.transition`” vs invalidate-as-transition. Consistent internally.

3. Lifecycle interpretation authority — **aligned** (no `computeEffectiveStatus` on Change).

### Test Coverage

`change.spec.ts` covers identity/timestamps/workspaces, VALID_TRANSITIONS including skill hops and archiving escapes, gates, artifacts, drift, history including overlap cause, implementation tracking, archive-failed, draft/discard, sync. Engine tests cover DAG-not-on-entity.

### Missing Tests (verify scenario title vs `it()` title)

| Verify scenario                                                 | Nearest                                                                                  | Gap                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Dependency-aware lifecycle interpretation is external to Change | engine parent-review tests; no change.spec assertion “entity has no effectiveStatus API” | Missing explicit                          |
| Hop from done invalidates signoff only                          | transition-change `clears signoff on done → implementing`                                | Entity-level scenario covered in use case |
| implementation-failure from done uses backward hop              | classifyAlong + skill hop tests                                                          | Split                                     |

Most lifecycle table scenarios have `it('Valid transition — …')` style coverage in change.spec.

### Spec Dependency Chain issues

- **vs lifecycle-engine:** Entity = facts; engine = DAG — aligned.
- **vs workflow-model / transition-checks:** Content gates are not entity `transition()` throws — aligned with architecture “entity owns state machine, not schema requires”.
- **vs architecture:** Rich entity with invariant `transition()` — aligned.

### Counts: requirements, implemented, discrepancies, missing tests

- Requirements: **21**
- Implemented: **21** (lifecycle/transition-relevant; tracking/drafting assumed in existing entity tests)
- Discrepancies: **2** (LOW)
- Missing tests: **3** named gaps for this assignment’s lifecycle slice

---

## Depth-1: default:\_global/architecture (consistency only)

Relevant rules: hexagonal layers; domain purity (no I/O); use cases via ports; rich entities own state-machine invariants; **stateless domain services as functions not classes**; manual DI; composition layer.

| Check                                                                | Result                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| LifecycleEngine I/O-free                                             | **Pass** — projects CheckResults / DAG from in-memory Change+Schema              |
| Checks I/O in application `create*`                                  | **Pass**                                                                         |
| Entity `VALID_TRANSITIONS` not duplicated as a second protocol table | **Pass** (`protocol.edge` reads the same table)                                  |
| Content gating as checks not entity                                  | **Pass** (tension with change spec prose — see change discrepancy 1)             |
| LifecycleEngine is a class                                           | **Tension** with “plain exported functions” — see lifecycle-engine discrepancy 3 |
| GetStatus/TransitionChange composition via resolver                  | **Pass**                                                                         |
| CompileContext not an evaluate consumer                              | **Pass**                                                                         |

No architecture **HIGH** break. The class-vs-function rule is the only structural conflict, and the change specs explicitly require `LifecycleEngine`.

---

## Batch totals (this partial)

| Spec                   | Requirements | Implemented |                                      Discrepancies | Missing tests (title gaps) |
| ---------------------- | -----------: | ----------: | -------------------------------------------------: | -------------------------: |
| core:lifecycle-engine  |            9 |           9 |                                                  4 |                          6 |
| core:transition-change |           22 |          22 |                                                  3 |                          5 |
| core:transition-checks |           15 |          15 |                                                  3 |                          7 |
| core:get-status        |           17 |          17 |                                                  4 |                         11 |
| core:workflow-model    |           11 |          11 |                                                  2 |                          8 |
| core:change            |           21 |          21 |                                                  2 |                          3 |
| **Sum**                |       **95** |      **95** | **18** (unique issues fewer; several cross-listed) |                     **40** |

**Unique HIGH:** 1 — GetStatus Identifies blockers `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT` check projection.  
**Unique MEDIUM:** 2 — (a) same MISSING/INCOMPLETE split on lifecycle-engine verify; (b) live overlap blocker vs `/specd-archive` nextAction; plus TransitionChange designing `transition()` vs `invalidate`.  
**Previously OPEN (4):** all **CLOSED** in code + tests, with the bypassFlags caveat that GetStatus does not pass engine bypass tokens (skips at check execute / status always `allowOverlap: false`).
