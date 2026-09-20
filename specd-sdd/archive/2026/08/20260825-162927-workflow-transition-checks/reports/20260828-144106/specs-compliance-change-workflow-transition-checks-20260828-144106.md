# Specs-compliance audit — change `workflow-transition-checks`

- **Timestamp:** 20260828-144106
- **Mode:** `--change workflow-transition-checks` (continuation of the prior change audit)
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **State at audit:** `designing`; review `artifact-drift` on specs (`core:transition-change`, `core:config`, `core:storage`, …)
- **Read-only.** No code or spec files were modified.
- **Graph:** `graph index` worker exited unexpectedly (`CLI_ERROR` / exit 3). Subagents used `graph search` where it still resolved, then Read/Grep.

**Scope:** 20 change specs + project-wide globals (architecture, testing, conventions, spec-layout) + depth-1 consistency on those specs. CLI: `node packages/cli/dist/index.js`. Specs via `changes spec-preview`.

---

## Executive summary

**H2 (baseline artifact-drift dual ownership) is CLOSED.** Delta-applied `core:storage` and `core:validate-artifacts` match CODE WINS: load-time `FsChangeRepository.get` + `SYSTEM_ACTOR`; ValidateArtifacts only consent hashes after `get()`. Skills do not teach ValidateArtifacts as the drift owner. Residual hexagonal note is INFO, not HIGH.

**Previous executive MEDIUMs are CLOSED:** engine `bypassFlags`; historical overlap is review not `OVERLAP_CONFLICT`; GetStatus live overlap only when `archivable`; TransitionChange reload + `allowOutOfScope` scope; lock-without-plan; `excludePathsFor`; CLI overlap text filter; `contentHasher` / `templateExpander` / `instruction`; DAG `hasTasks || taskCompletionCheck`; in-place gates / no happy-path pending.

### Unique open findings

| Sev        | ID  | Finding                                                                                                                                                                                                                                                    | Spec-wrong vs code-wrong                                                                                                                     |
| ---------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | H1  | GetStatus “Identifies blockers” still assigns `MISSING_ARTIFACT` to missing **and** in-progress. `workflow.requires` always emits `INCOMPLETE_ARTIFACT`. Engine verify “three dimensions” still wants `MISSING_ARTIFACT`; a newer test forbids dual-write. | Prefer aligning Identifies blockers + stale verify with check projection (`INCOMPLETE_ARTIFACT`), unless product wants distinct codes again. |
| **MEDIUM** | M1  | Live `OVERLAP_CONFLICT` on archivable status does not remove `/specd-archive` from `nextAction` / `availableTransitions`. Archive still fails without `--allow-overlap`.                                                                                   | Spec: overlap is an operation blocker, not a hop. Code: status can advertise archive that execute rejects.                                   |
| **MEDIUM** | M2  | TransitionChange designing: spec says `change.transition('designing')` after invalidate; code relies on `invalidate()`’s embedded `transitioned`.                                                                                                          | Prefer spec-wrong (entity already landed designing).                                                                                         |
| **MEDIUM** | M3  | `core:archive-change` factory **spec.md** still lists `runStepHooks` / `regenerateMetadata`; verify + composition use `archiveBindings` / `materializeMetadata` / `contentHasher`.                                                                         | Spec drift in one requirement block.                                                                                                         |
| **MEDIUM** | M4  | ValidateArtifacts approval/signoff hash scan is global (`schema.artifacts()`), not scoped to `--artifact`. Bypass vs approval clauses still tension.                                                                                                       | Code = global consent; spec ambiguous.                                                                                                       |
| **MEDIUM** | M5  | Same-execute DAG “recompute” is in-memory `markVerdictComplete`, not persist+re-evaluate.                                                                                                                                                                  | Spec vs pragmatic patch.                                                                                                                     |
| **MEDIUM** | M6  | Skill templates still list `OVERLAP_CONFLICT` as a typical blocker on design/implement/verify/new. Can conflate overlap **invalidation** with live archive overlap.                                                                                        | Skills spec silent; LE/status specs are clear.                                                                                               |

**LOW:** many wording/test-title/help/composition-test gaps. See partials.

**Gates/hooks/CLI assigned specs:** 0 HIGH, 0 MEDIUM on CLI; 0 HIGH/MEDIUM on approve/config/hooks (LOW only).

### Closed since `20260828-134518`

H2; engine bypassFlags; overlap history verify; lock-without-plan; archive excludePaths; CLI `OVERLAP_CONFLICT` text; naming; DAG hasTasks; config pending happy-path wording.

### Test gaps worth doing (not all are product bugs)

- GetStatus `overlapDetail` merge/scan/empty
- CLI: `taskCompletionCheck`-only DAG; text `[drift]` / `complete-with-drift`; JSON transition `failure` complete; `SpecOverlapError`
- Skills: assertion that hop skills do not treat invalidation overlap as `--allow-overlap`
- Storage: missing-on-disk with `validatedHash` → `SYSTEM_ACTOR` invalidate
- Factory composition tests for ValidateArtifacts / GetArtifactInstruction `contentHasher` / `templateExpander`

### Batch rollup (partial self-counts; unique issues fewer)

| Batch                 | HIGH |                                      MEDIUM | Notes                    |
| --------------------- | ---: | ------------------------------------------: | ------------------------ |
| core-lifecycle        |    1 | 3 listed (H1 also as engine MEDIUM; M1; M2) | 4 previously OPEN closed |
| core-archive-validate |    0 |                                   3 (M3–M5) | H2 closed                |
| core-gates            |    0 |                                           0 | In-place gates pass      |
| cli                   |    0 |                                           0 | Prior 3 MEDIUMs closed   |
| skills-globals        |    0 |                                      1 (M6) | H2 not reopened          |

---

## How to use this report

Partials are the source of evidence. Do not treat unique HIGH/MEDIUM as 1+3+1 double-count of H1.

---

## Detailed findings (verbatim partials)

---

### Source: \_partial-core-lifecycle.md

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

---

### Source: \_partial-core-archive-validate.md

# Spec compliance partial — core archive / validate / storage / instruction / schema-format

**Change:** `workflow-transition-checks`  
**Mode:** change (delta-applied via `changes spec-preview`)  
**Read-only.** No code or spec files modified.  
**Graph:** `graph search "ValidateArtifacts"` returned symbols; index may still be stale. Implementation checks used Read/Grep after graph locate.

**Product decision (H2):** CODE WINS — `FsChangeRepository.get` owns baseline `validatedHash` vs disk invalidation with `SYSTEM_ACTOR`. `ValidateArtifacts` does **not** own baseline drift; it only compares approval/signoff `artifactHashes` after `get()`.

---

## Critical re-checks (previous findings)

### H2 — Dual ownership of baseline artifact-drift — **CLOSED**

**Delta-applied specs agree (CODE WINS):**

- `core:storage` › Artifact status derivation: when `artifactTypes.length > 0`, load detects baseline drift vs `validatedHash` and calls `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat that comparison. Consent-hash drift stays on the use case.
- `core:validate-artifacts` › Policy-aware drift materialization: MUST NOT compare disk to `validatedHash`, MUST NOT mark `hasDrift` for that reason, MUST NOT invalidate for baseline mismatch. Load via `ChangeRepository.get` first. Approval/signoff scan uses `ActorResolver`, not `SYSTEM_ACTOR`.
- Verify scenarios: _ValidateArtifacts does not own baseline validatedHash drift_; _Consent-hash drift still invalidates once…_; storage _Hash mismatch on load invalidates with artifact-drift_ (`SYSTEM_ACTOR`).

**Code matches:**

- `packages/core/src/infrastructure/fs/change-repository.ts` (~1523–1574): grouped `invalidate(..., SYSTEM_ACTOR, ...)` after hash/status derivation.
- `packages/core/src/application/use-cases/validate-artifacts.ts` (~168–169 `get()`, ~300–336): scan only if `activeSpecApproval` or `activeSignoff`; hashes vs `artifactHashes`; skip `missing`/`skipped`; no `validatedHash` baseline compare.

**Tests match:** `change-repository.spec.ts` _Hash mismatch on load invalidates with artifact-drift_ (`by === SYSTEM_ACTOR`); _Uninitialized repository_ bypass; `validate-artifacts.spec.ts` _does not own baseline…_ (`mutate` not called); _Consent-hash drift still invalidates once…_.

**Residual (not H2):** hexagonal “use case owns policy” vs adapter calling the entity (`M7` below) is an architecture-taste leftover. Storage + validate-artifacts no longer contradict each other.

**Verdict:** H2 **closed** in specs **and** code+tests.

---

### Previous MEDIUM — Lock without plan keeps lock `dependsOn` — **CLOSED** (small test/spec hygiene leftover)

**Spec (preview):** _Lock without a plan keeps lock dependsOn_ — existing lock, no `change.specDependsOn` entry, extract differs → sealed set is lock; `resolveInitialPersistedDependsOn` not called; `deps.consistent` fails against that lock list.

**Code:** `resolveSealedArchiveDependsOn` (`resolve-sealed-archive-depends-on.ts`): plan → `persistedDependsOn !== null` (lock) → on-disk `resolveInitial` → new-spec extract/`[]`. `loadArchiveSealedDependsOnBySpecId` uses the same helper for archive `deps.consistent`.

**Test:** `archive-change.spec.ts` _Lock without a plan keeps lock dependsOn_ (~760–859): lock `['core:from-lock']`, extract `core:from-extract`, no plan → `ArchiveDependencyMismatchError`, `resolveInitial` spy not called.

**Leftover LOW:** test does not assert `expectedDeps === ['core:from-lock']` vs `actualDeps` extract. Error ctor still documents “change metadata” rather than “sealed/lock set”. Verify has a **duplicate empty** heading for _No-lock spec resolves initial dependsOn…_ immediately before the real scenario.

---

### Previous MEDIUM — `graph.excludePaths` skipped at archive materialization — **CLOSED**

**Spec:** ignore confirmed links whose raw path falls under the **target workspace** `graph.excludePaths`.

**Code:** `_materializeImplementationLinks` uses `this._listWorkspaces.excludePathsFor(workspace)` then `isExcludedByPrefix`. `ProjectWorkspace` has **no** `graph` field (`list-workspaces.ts` execute payload: name, prefix, codeRoot, isExternal, ownership, specRepo). `excludePathsFor` merges `config.graph.excludePaths` + `workspace.graph.excludePaths`.

**Test:** _Excluded path is ignored during sidecar materialization_ (`archive-change.spec.ts` ~3361) via `makeListWorkspaces(..., { excludePaths: ['node_modules'] })`. `list-workspaces.spec.ts` _excludePathsFor merges project and workspace prefixes_.

**Leftover LOW:** archive test only plants **project-level** `excludePaths`, not workspace-local-only. Spec wording “target workspace `graph.excludePaths`” is still satisfied because `excludePathsFor` includes workspace-local prefixes.

---

### Previous MEDIUM — Factory naming `contentHasher` vs ctor `hasher` — **CLOSED**

Delta-applied `core:validate-artifacts`: deps list `contentHasher`; “The constructor parameter remains `hasher`.” Code: `ValidateArtifactsDeps.contentHasher`, ctor param `hasher`, factory passes `contentHasher` into that slot. Guard `'contentHasher' in value`.

---

### Previous MEDIUM — `templateExpander` vs verify `templates` — **CLOSED**

Delta-applied verify factory scenario lists `templateExpander: TemplateExpander`. Code: `GetArtifactInstructionDeps.templateExpander`. Residual LOW: **ctor** parameter is still named `templates` (spec snippet says `expander`).

---

### Previous MEDIUM — `rules.pre` `instruction` not `text` — **CLOSED**

Delta-applied get-artifact-instruction spec+verify use `{ id, instruction }`. `core:schema-format` constraints: `{ id, instruction }`. Code: `r.instruction`. Test: _expands pre and post rule instructions_.

---

# Spec: `core:archive-change`

## Requirements Summary

Archive is operation-`archive` checks (`archiveBindings`), not `RunStepHooks` on the use case. Workspace lookup via `ListWorkspaces`. Sealed `dependsOn`: plan → lock → lock-less on-disk `resolveInitialPersistedDependsOn()` (no `explicitDependsOn`) → new-spec merge-extract/`[]`. `ContentHasher` required for lock-less on-disk. Implementation links: normalize, skip `excludePathsFor`, fail outside `codeRoot`. Predicates share runners with enter-ready / exit-implementing. Publication preflight stays inside the use case (no `archive.publication` binding).

## Implementation Status

**Mostly implemented.** `ArchiveChange` ctor takes `archiveBindings`, `ListWorkspaces`, `contentHasher`. Composition: `resolveArchiveChangeDeps` sets `archiveBindings` from `resolveWorkflowCheckRegistry`, `materializeMetadata`, `contentHasher`; no `runStepHooks` on deps. Sealed dependsOn + `excludePathsFor` as above.

## Discrepancies

### MEDIUM — Factory requirement in spec.md still lists `runStepHooks` / `regenerateMetadata`

**Where:** preview spec.md › _Config-based factory delegates through resolveArchiveChangeDeps_ still lists `runStepHooks: RunStepHooks` and `regenerateMetadata: RegenerateSpecMetadata`. Adjacent requirements and **verify** say `archiveBindings`, `materializeMetadata`, `contentHasher`, and MUST NOT resolve `runStepHooks` onto the use case. Second verify scenario still says `regenerateMetadata: RegenerateSpecMetadata` while the first lists `materializeMetadata`.

**Interpretation A (spec drift):** factory bullet list was not updated when ports moved to bindings + `MaterializeSpecMetadata`. Code + composition tests are the intended contract.

**Interpretation B (implementation bug):** factory should still inject `RunStepHooks` / `RegenerateSpecMetadata` on the use case — contradicted by the same spec’s _Archive bindings not RunStepHooks_ and by code.

**Evidence:** `composition/use-cases/archive-change.ts` `ArchiveChangeDeps`; `test/composition/use-cases/archive-change.spec.ts`.

### LOW — Duplicate empty verify heading for no-lock `resolveInitial`

Two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings; first has no GIVEN/WHEN/THEN.

### LOW — Lock-without-plan test does not assert error payload is lock vs extract

Throws `ArchiveDependencyMismatchError` only. Spec AND of `deps.consistent` vs **lock list** is implied, not asserted via `expectedDeps`.

### LOW — `ArchiveChange` ctor still types `hasher?` / several ports optional

Spec still shows optional `extractorTransforms?`, `projectRoot?`, `hasher?`. Runtime throws if hasher missing on lock-less on-disk. No test that omitted hasher throws.

## Test Coverage

| Requirement                                                                                | Status                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Sealed dependsOn plan / no-lock resolveInitial / new spec extract/`[]` / lock without plan | Covered in `archive-change.spec.ts`                       |
| `deps.consistent` mismatch → `ArchiveDependencyMismatchError`                              | Covered (plan vs extract and lock vs extract)             |
| Excluded path skipped                                                                      | Covered (project-level exclude)                           |
| Factory `archiveBindings` + `contentHasher`                                                | Composition factory tests                                 |
| Shared archive bindings / hooks / overlap / readOnly                                       | Existing archive-change tests (this change’s check table) |

## Missing Tests (titles)

- Workspace-local `graph.excludePaths` only (no project-level list) skipped at sidecar materialization
- Lock without plan: `ArchiveDependencyMismatchError.expectedDeps` is the lock list
- Lock-less on-disk archive without `ContentHasher` throws
- `metadata.json` `dependsOn` must not become the sealed set when lock or resolveInitial applies
- Factory spec.md `runStepHooks` list is not a composition contract (or delete that list)

## Spec Dependency issues

Depends on `core:storage`, `core:validate-artifacts`, `core:schema-format`, `core:initialize-persisted-spec-state`, `core:transition-checks`. Factory spec.md contradicts its own bindings requirement and `core:composition-resolver` style used by siblings. `ArchiveDependencyMismatchError` comment still says “change metadata” vs sealed lock/plan.

## Counts (`core:archive-change`)

- Requirements reviewed: 28
- Confirmed: 24
- Discrepancies: 1 MEDIUM, 3 LOW
- Missing tests: 5 titles

---

# Spec: `core:validate-artifacts`

## Requirements Summary

Ctor: `ChangeRepository`, `ListWorkspaces`, schema, parsers, actor, `hasher` (ContentHasher), extractors, routes, `LifecycleEngine`. DAG via `evaluate` with empty `checksByTarget`. Baseline drift is **not** this use case. Consent-hash drift after `get()`. `markComplete` only here. Metadata extract uses permissive schema. Factory deps field `contentHasher`.

## Implementation Status

**Implemented for this change’s deltas** (ListWorkspaces, empty `checksByTarget`, baseline not owned, consent-hash invalidate, `contentHasher` deps). Broader validate behavior (delta preview, metadata, bypass) pre-existed.

## Discrepancies

### H2 — **CLOSED** (see critical re-check)

### MEDIUM — Approval/signoff hash scan is not scoped to `artifactId` (prior M4, still open)

**Spec tension:** complete-file bypass says do not re-read complete files for structure; approval requirement still scans non-missing/non-skipped files including `complete` when gates are active. Scan loops `schema.artifacts()` before `artifactTypesToValidate`. `--artifact verify` can invalidate because `proposal` consent-hash drifted.

**A:** spec intends global consent integrity on every validate. **B:** spec intends scan only files this invocation validates. Code follows A. Bypass vs approval clauses still conflict if read as “never re-read complete files.”

### MEDIUM — Same-pass DAG “recompute” is an in-memory verdict patch (prior M5)

`evaluate` once; `markVerdictComplete` patches `effectiveStatus: 'complete'`. Recursive `pending-parent-artifact-review` cascade is not re-run. Spec “persisted completion” is not a second persist+evaluate.

**A:** in-memory patch is enough for child-in-same-execute. **B:** spec wants engine re-evaluate after persist.

### LOW — Leftover verify heading _Missing file can still carry hasDrift…_

Preview still has that heading with the **new** GIVEN/THEN (no invalidate). Also has _ValidateArtifacts does not compare missing files…_. Duplicate/stale title.

### LOW — No composition tests for `resolveValidateArtifactsDeps`

`packages/core/test/composition/use-cases/` has no `validate-artifacts.spec.ts`. Factory `contentHasher` guard is unasserted (unlike archive).

## Test Coverage

| Requirement                               | Status                                          |
| ----------------------------------------- | ----------------------------------------------- |
| Empty `checksByTarget`                    | `evaluates lifecycle with empty checksByTarget` |
| Does not own baseline drift               | Covered                                         |
| Missing file / no consent → no invalidate | Covered                                         |
| Consent-hash invalidate once              | Covered                                         |
| ListWorkspaces ctor                       | Used throughout tests                           |
| Factory `contentHasher`                   | **Not** composition-tested                      |

## Missing Tests (titles)

- `createValidateArtifacts` config form derives deps through `resolveValidateArtifactsDeps` including `contentHasher`
- Approval drift scan with `--artifact` does not invalidate unselected artifacts **or** a verify scenario that explicitly requires global scan
- Consent-hash mismatch uses `ActorResolver` identity (not `SYSTEM_ACTOR`)

## Spec Dependency issues

Depends on `core:storage` — **aligned** after CODE WINS. Depends on `core:schema-format` / `core:lifecycle-engine` for DAG (no `Change.effectiveStatus()`). Architecture spec vs load-time invalidate is storage’s concern, not a validate dual-owner bug.

## Counts (`core:validate-artifacts`)

- Requirements reviewed: 22
- Confirmed: 18
- Discrepancies: 0 HIGH, 2 MEDIUM (M4/M5 residual), 2 LOW
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

**Implemented.** `evaluate(..., { checksByTarget: {} })`. Rules via `r.instruction`. Factory `templateExpander`.

## Discrepancies

### LOW — Template resolution: spec says `SchemaRegistry` file read; code expands `ArtifactType.template`

Spec: if template **path**, read via `SchemaRegistry`. Code: `artifactType.template` is already file content (resolved at schema load). Tests pass inline template strings.

**A:** spec over-specifies I/O that belongs to schema resolve. **B:** use case should still read the path at execute time.

### LOW — Ctor parameter name `templates` vs spec `expander` vs deps `templateExpander`

Same pattern as hasher/`contentHasher`, but get-artifact-instruction spec ctor block uses `expander`. Code: `templates`. Not a type-guard bug (guard is `templateExpander` on deps).

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

Depends on `core:schema-format` for `{ id, instruction }` — **aligned**. `core:template-variables` (no singular workspace) matches `{ change: { name, path } }`.

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

**Implemented** for change deltas: `buildSchema` rejects `step: reviewing`; engine cascade in `lifecycle-engine.ts`; `RuleEntry.instruction` in `build-schema.ts`.

## Discrepancies

### LOW — `graph.excludePaths` is **not** this spec

Archive materialization exclusion is config/`ListWorkspaces`, not schema-format. No schema-format contradiction.

No remaining `text` vs `instruction` on **artifact rules** in delta-applied constraints.

Hook YAML in some tests still uses `type: 'instruction', text: 'lint'` (hook entries, not `rules.pre`). Out of this change’s rules.pre MEDIUM; flag only if a full schema-format audit is required.

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

# Batch summary

| Spec                            | HIGH | MEDIUM                              | LOW | H2 / prior MEDIUMs                                        |
| ------------------------------- | ---- | ----------------------------------- | --- | --------------------------------------------------------- |
| `core:archive-change`           | 0    | 1 (stale factory list)              | 3   | Lock-without-plan **closed**; excludePaths **closed**     |
| `core:validate-artifacts`       | 0    | 2 (M4 scan scope, M5 in-memory DAG) | 2   | H2 **closed**; hasher naming **closed**                   |
| `core:storage`                  | 0    | 0                                   | 2   | H2 **closed** (owner is get())                            |
| `core:get-artifact-instruction` | 0    | 0                                   | 3   | templateExpander **closed**; rules.instruction **closed** |
| `core:schema-format`            | 0    | 0                                   | 1   | rules.instruction **closed**                              |

**Totals this batch:** HIGH **0** · MEDIUM **3** · LOW **11**

**H2:** closed in delta-applied specs **and** code+tests. Specs no longer assign baseline drift to both layers.

---

### Source: \_partial-core-gates.md

# Spec-Compliance Audit — core gates partial

- **Change:** `workflow-transition-checks`
- **Scope (change-owned, via `changes spec-preview`):** `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:hook-execution-model`
- **Re-check (binding):** `approvals.spec` / `approvals.signoff` are in-place checks, not pending hops. New-work happy path MUST NOT enter `pending-*`. Drain from already-pending remains legal. `change transition` targeting `pending-*` is not `nextAction`.
- **Date:** 2026-08-28
- **Mode:** read-only. No source or spec files modified. This file is the audit artifact.

## Tooling / graph status

`node packages/cli/dist/index.js graph search "ApproveSpec" --symbols --format toon` and `ApproveSignoff` resolved:

- `packages/core/src/application/use-cases/approve-spec.ts` (class ~line 30)
- `packages/core/src/application/use-cases/approve-signoff.ts` (class ~line 30)

Further file:line evidence used Read/Grep. Merged spec text came from `changes spec-preview workflow-transition-checks <specId> --format text`.

---

## Re-check verdict (cross-cutting)

| Claim                                                     | Status        | Evidence                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place spec gate, not a pending hop                     | **COMPLIANT** | `approval.spec` binds `from=ready`, `to=*`, `along=forward` (`check-bindings.ts:57-60`). `ApproveSpec` records consent and does **not** `transition` when state is in `boundFromStates('approval.spec')`. `VALID_TRANSITIONS.ready` is `['implementing','designing']` — no `pending-spec-approval`.                                                                              |
| In-place signoff gate, not a pending hop                  | **COMPLIANT** | `approval.signoff` binds `from=done`, `to=archivable`, `along=forward` (`check-bindings.ts:61-65`). `ApproveSignoff` does not `transition` from `done`. `VALID_TRANSITIONS.done` has no `pending-signoff`.                                                                                                                                                                       |
| New work MUST NOT enter `pending-*`                       | **COMPLIANT** | Happy-path table omits pending (`change-state.ts:30-42`, tests `change-state.spec.ts:101-103`). Engine `_resolveTarget` is identity (`lifecycle-engine.ts:335-337`). Transition tests stay in `ready`/`done` and throw `approval-required` (`transition-change.spec.ts:378-392`, `436+`).                                                                                        |
| Drain from already-pending remains legal                  | **COMPLIANT** | `pending-spec-approval → spec-approved` / `pending-signoff → signed-off` in `VALID_TRANSITIONS`. `ApproveSpec`/`ApproveSignoff` drain via `transition` only when already pending. `TransitionChange` drain tests exist (`transition-change.spec.ts:495-512`). `--next` from pending is unavailable (`HAPPY_PATH_NEXT` omits those states; `happyPathNextMessage` explains wait). |
| `change transition` targeting pending is not `nextAction` | **COMPLIANT** | With gate on and no consent, `LifecycleEngine._nextAction` returns `targetStep: 'ready'` / `'done'` and `command: 'specd changes approve spec                                                                                                                                                                                                                                    | signoff'` (`lifecycle-engine.ts:824-847`, test `lifecycle-engine.spec.ts:266-281`). From already-pending, `nextAction.command`is still **approve**, not`change transition … pending-\*` (`lifecycle-engine.ts:876-934`). `HAPPY_PATH_NEXT` has no pending keys. |

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

**Verify.md (change deltas):** ready stays `ready`; drain pending → `spec-approved`; drafting → `InvalidStateTransitionError`; mutate from ready returns `ready`; factory uses `contentHasher`.

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
- **Verdict:** treat as spec ambiguity. Prefer code.

### LOW — Verify scenario still uses drain as the “enabled gate” example

- **Spec verify (baked gate):** GIVEN pending, THEN `spec-approved`.
- **Does not contradict** drain legality or ready happy path (separate scenarios). Factory scenario does not exercise the new in-place path.

No HIGH/MEDIUM implementation bugs found for AS-4/AS-5 vs in-place model.

## Test Coverage

| Scenario                                 | Coverage                                     |
| ---------------------------------------- | -------------------------------------------- |
| Gate disabled, no repo I/O               | `approve-spec.spec.ts:201-221`               |
| Change not found                         | `:288-305`                                   |
| Ready stays ready + consent              | `:71-91`                                     |
| Drain → `spec-approved`                  | `:116-134`                                   |
| Drafting → `InvalidStateTransitionError` | `:243-262`                                   |
| Schema mismatch before mutate            | `:265-285`                                   |
| Mutate called                            | `:178-198` (**drain fixture only**)          |
| Factory returns instance                 | `composition/use-cases/approve-spec.spec.ts` |

## Missing Tests

| Gap                                                                          | Severity | Maps to                                                                                                               |
| ---------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| Mutate spy + returned state `ready` on in-place path                         | LOW      | AS-5 verify                                                                                                           |
| Cleanup applied to one artifact type, not another                            | MEDIUM   | AS-3 verify (logic exists in `compute-artifact-hash.ts` + `pre-hash-cleanup`; **not** asserted through `ApproveSpec`) |
| `artifact() === null` omitted from hash map                                  | LOW      | AS-3                                                                                                                  |
| `SchemaProvider.get()` throw before hash                                     | LOW      | AS-3 / AS-1                                                                                                           |
| `createApproveSpec(config)` calls `resolveApproveSpecDeps` / `contentHasher` | LOW      | AS-8 (composition test only checks `instanceof`)                                                                      |

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

Same as ApproveSpec: hashes inside `mutate`. Spec-wording vs stronger code. Prefer code.

### LOW — Test describe lag

`approve-signoff.spec.ts:242` describe still says “not in pending-signoff” while the assertion is “not in done **or** pending”. Fixture is drafting (`makeChange`). Behaviour matches verify; description is stale (test-only, not production).

No HIGH/MEDIUM in-place vs pending-hop bugs.

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

Same shape as ApproveSpec: ready-equivalent persist-from-`done` mutate spy; cleanup/null-skip/schema-throw through this use case; factory `resolveApproveSignoffDeps` / `contentHasher`.

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

**Other requirements (not in this delta; 23 sections):** file location, privacy, env overrides, actor, local override, cascade, schema ref, invalidation, workspaces, workspace/project graph, storage, named adapters, config path, template variables, schema plugins/overrides, context selection/mode/instructions, logging, LLM optimization, plugins, config writer, startup validation, legacy warnings.

This batch **fully audited Approvals**. Other config requirements were not re-proven line-by-line; no contradiction with the in-place gate model was found in the loader defaults path.

## Implementation Status (Approvals)

| ID                                   | Status      | Notes                                                                                                                                                                                                       |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFG-APR-1 Parse + defaults           | Implemented | `config-loader.ts:616` `data.approvals?.spec ?? false` (same for signoff). Zod optional booleans (`config-schema.ts:258-263`). `SpecdConfig.approvals` required on resolved config (`specd-config.ts:220`). |
| CFG-APR-2 Forward leave of ready     | Implemented | Binding + `approval.spec` check; engine `effectiveTarget` stays `implementing` while `availableTransitions` omits it and `APPROVAL_REQUIRED` (`lifecycle-engine.spec.ts:266-281`).                          |
| CFG-APR-3 Redesign exempt            | Implemented | `along=forward` only on `approval.spec`; redesign is not forward. Test: designing + gate on → nextAction is `/specd-design`, not approve (`lifecycle-engine.spec.ts:284-292`).                              |
| CFG-APR-4 Signoff in-place           | Implemented | Binding `done → archivable`; transition tests stay in `done`.                                                                                                                                               |
| CFG-APR-5 No happy-path pending      | Implemented | See re-check table.                                                                                                                                                                                         |
| CFG-APR-6 nextAction not pending hop | Implemented | Approve commands; `targetStep` is current wait state (`ready`/`done`) or drain `spec-approved`/`signed-off` with **approve** command, never `change transition` to pending.                                 |

## Discrepancies

### LOW — Config-loader tests do not encode default-false or “no pending hop”

- **Spec verify:** omitted `approvals.spec` / `approvals.signoff` default `false`; “spec gate on does not require pending-spec-approval in the graph”.
- **Tests:** `config-loader.spec.ts:961-973` and `:1836-1854` only assert **explicit** `{ spec: true, signoff: false }`. Defaults are implemented in loader but **not** asserted. Graph/nextAction semantics are tested in `lifecycle-engine.spec.ts` / `transition-change.spec.ts`, not under config-loader.
- **spec-wrong:** no.
- **code-wrong:** no (defaults exist).
- **Verdict:** test gap on the config spec’s own verify file, not a loader bug.

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
| Requirements in spec (all sections)                 | 24                                     |
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
| H-6        | Implemented                | `hookFailureMode(binding.onFailure)` (`transition-change.ts:328-329`). Archive post `collect` (`ARCHIVE_BINDING_SPECS`).                                                                                                                                               |
| H-7        | Implemented                | Entity has no HookRunner; tests assert auto-run via use case.                                                                                                                                                                                                          |
| H-8        | Implemented                | Types `HookPhaseSelector` / `ArchiveHookPhaseSelector`. `source.pre` / `target.post` are no-ops in `HookEffectCheck`. Predicates still run (`skipHookPhases` only read by hook **effects**).                                                                           |
| H-9 / H-10 | Implemented                | Pre/post fail tests in `transition-change.spec.ts` / `archive-change.spec.ts`. Source.post fail does not persist (`:1506-1561`).                                                                                                                                       |
| H-11       | Implemented (pre-existing) | Schema merge + RunStepHooks order; not re-proven in this delta.                                                                                                                                                                                                        |
| H-12       | Implemented                | Production variables `name`+`path` only (`run-step-hooks.ts:196-197`). Test `does not inject a singular workspace` (`run-step-hooks.spec.ts:662+`).                                                                                                                    |

## Discrepancies

### LOW — NodeHookRunner fixture still passes `workspace`

- **Spec H-12:** `HookVariables` never contains `workspace` under `change`.
- **Production:** compliant.
- **Test:** `hook-runner.spec.ts:80` still passes `workspace: 'default'` because `TemplateVariables` is a loose `Record`. Expander **would** substitute `{{change.workspace}}` if a caller stuffed the key.
- **spec-wrong:** no.
- **code-wrong:** only if a caller injects workspace; `RunStepHooks` does not.
- **Verdict:** test-fixture drift / type too wide; not a happy-path product bug.

### INFO — `skipHookPhases` on predicate context

Passed into `executeMatchingPredicates` (`transition-change.ts:213`) but only `HookEffectCheck` reads it. Predicates ignore it → effects-only skip holds.

No HIGH/MEDIUM vs this change’s hook deltas.

## Test Coverage

| Scenario                                   | Coverage                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Skip all / target.pre / source.post        | `transition-change.spec.ts:1347+`, `:1564+`, `:1699+`                      |
| source.pre / target.post no-op             | `:1607-1690`                                                               |
| Redesign/backward omit hook.post           | `matching-effects.spec.ts:33-54`; along in transition-change               |
| Recovery omits hook.pre and hook.post      | `matching-effects.spec.ts:56-66`                                           |
| Source.post fail, state stays implementing | `transition-change.spec.ts:1506-1561`                                      |
| Archive skip pre/post/all                  | `archive-change.spec.ts:1837-2012`                                         |
| Archive post collect                       | matching-effects archive after-persist + archive-change post-failure tests |
| Instruction skipped                        | `run-step-hooks.spec.ts` instruction filter; GetHookInstructions tests     |
| Template no workspace                      | `run-step-hooks.spec.ts:662+`; `template-expander.spec.ts` uses name/path  |
| skip-hooks does not skip predicates        | `transition-change.spec.ts:2396` tasks still fail with skip all            |

## Missing Tests

| Gap                                                                                                                                                     | Severity |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `{{change.workspace}}` left unexpanded **and** production bag has no key (hook-runner unit uses a bag **with** workspace)                               | LOW      |
| Hook ordering schema-before-project through TransitionChange (likely covered in RunStepHooks / merge tests, not this delta’s verify file)               | LOW      |
| External hook abort vs collect on archive vs transition in one test (policy is binding-level; `matching-effects.spec.ts:68-80` covers archive policies) | LOW      |

## Spec Dependency issues

Delta depends on `core:transition-checks` for shared matcher. **Consistent:** effects use same `from`/`to`/`along` as predicates; `instruction:` is not a CheckId.

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

| Spec                        | Reqs audited                              | HIGH | MEDIUM | LOW | In-place / pending re-check                      |
| --------------------------- | ----------------------------------------- | ---- | ------ | --- | ------------------------------------------------ |
| `core:approve-spec`         | 8                                         | 0    | 0      | 2   | Pass: ready stays ready; drain legal             |
| `core:approve-signoff`      | 8                                         | 0    | 0      | 2   | Pass: done stays done; drain legal               |
| `core:config`               | 1 section (Approvals) + 23 not re-counted | 0    | 0      | 1   | Pass: flags describe checks not hops             |
| `core:hook-execution-model` | 12                                        | 0    | 0      | 1   | N/A (hooks); skip/along/post-before-persist pass |

**Totals this batch:** HIGH 0, MEDIUM 0, LOW 6 (several are test/wording, not product leaks).

**Strongest residual risk:** Approve\* artifact-hash cleanup / null-skip / schema-throw are specified on the use case but tested only in shared helpers or sibling use cases — not a pending-hop regression.

**In-place gate re-check:** no finding that new work is routed into `pending-spec-approval` or `pending-signoff`, or that `nextAction` recommends `change transition` **to** those states.

---

### Source: \_partial-cli.md

# Spec-compliance partial: CLI change commands

- **Mode:** change `workflow-transition-checks` (assigned specs only)
- **Auditor:** read-only; graph `stale: false` (`lastIndexedAt` 2026-08-28T12:41:48Z, `currentRef` 2948f1a2)
- **Sources:** `specd changes spec-preview workflow-transition-checks` for `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`
- **Code:** `packages/cli/src/commands/change/{status,transition,approve,archive}.ts`, `_check-progress-presenter.ts`, `_implementation-tracking.ts`; tests under `packages/cli/test/commands/change/`
- **Neither spec nor code is treated as sole truth.** Each finding lists spec-drift vs implementation-bug interpretations.

---

## Previous MEDIUM re-check

### 1. Text status MUST NOT print `OVERLAP_CONFLICT` when `review.reason` is `spec-overlap-conflict`; live archivable overlap MAY print it

**Status: resolved (implementation + tests).**

- Spec (`cli:change-status`): invalidation overlap must not appear as a text `OVERLAP_CONFLICT` blocker line; live overlap may still print it.
- Code (`status.ts`): text blockers are `blockers.filter(code !== 'OVERLAP_CONFLICT')` **only when** `review?.reason === 'spec-overlap-conflict'`. Otherwise all blockers, including `OVERLAP_CONFLICT`, are printed with optional gerund labels.
- JSON/TOON still serializes the unfiltered `blockers` array (spec only forbids the **text** line).
- Tests in `packages/cli/test/commands/change/status.spec.ts`:
  - `hides OVERLAP_CONFLICT in text when review reason is spec-overlap-conflict`
  - `prints live OVERLAP_CONFLICT when review is not spec-overlap-conflict` (archivable change, `review.reason` null)
  - overlap-peer scenario also `expect(out).not.toContain('OVERLAP_CONFLICT')`

**Residual (LOW, not a regression of the MEDIUM):** if Core ever attached `review.reason: 'spec-overlap-conflict'` **and** a live `OVERLAP_CONFLICT` blocker in the same payload, text would hide **all** `OVERLAP_CONFLICT` lines. Spec does not describe that combination; Core is expected not to mix them.

### 2. Text DAG `hasTasks` aligned with JSON (`hasTasks || taskCompletionCheck`)

**Status: resolved (implementation).**

- Spec schema-derived fields: `hasTasks` is true when explicit `hasTasks: true` **or** `taskCompletionCheck` is declared.
- Spec task-completion DAG wording still says “when a schema artifact type has `hasTasks: true`”; jointly with schema-derived fields, JSON and text must use the same boolean.
- Code uses the same expression in three places (`renderDag`, JSON `artifactDag`, nested `schema.artifactDag`):
  `artifact.hasTasks === true || artifact.taskCompletionCheck !== undefined`
- **Coverage gap (missing test, not a code mismatch):** CLI tests only drive `hasTasks: true` on schema artifacts. There is no `it()` that sets `hasTasks: false` + `taskCompletionCheck` and asserts both JSON `hasTasks: true` and text `[hasTasks]`.

### 3. Artifact-drift CLI tests live in `packages/cli/test/commands/change/status.spec.ts`

**Status: resolved.**

- `describe('artifact-drift review rendering')` in that file (not a stray core/SDK file).
- Tests: omits duplicated review file paths under `review:`; JSON still includes `review.affectedArtifacts` with filename and absolute path.
- **Coverage gap:** the text scenario in verify.md also requires `[drift]` on details rows. The mock files omit `hasDrift: true`, so the test never asserts `[drift]`. Implementation does append ` [drift]` when `file.hasDrift` is true.

---

## Spec: `cli:change-status`

### Requirements Summary

| Requirement                          | Intent                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                    | `specd change status <name> [--format text\|json\|toon]`                                                                                                        |
| Drafted status is read-only          | No mutating transitions; mark drafted; MAY show artifacts                                                                                                       |
| Output format                        | JSON/TOON `artifactDag[].hasTasks`; `state` is display projection (e.g. `complete-with-drift`)                                                                  |
| Task completion display in DAG       | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` remains boolean                                                                               |
| Display-state rendering              | Text prefers display state; JSON has canonical + display                                                                                                        |
| Lifecycle projections from GetStatus | No local `VALID_TRANSITIONS` re-filter                                                                                                                          |
| Text omits duplicated review files   | `review:` header without file lists; overlap peers still printed; no invalidation `OVERLAP_CONFLICT` line                                                       |
| Text blockers include check labels   | `! CODE — label: message`                                                                                                                                       |
| Schema version warning               | stderr warning vs `lifecycle.schemaInfo`; skip if null; exit 0                                                                                                  |
| Change not found                     | exit 1, `error:`                                                                                                                                                |
| Schema-derived fields                | Nested `schema.artifactDag` via `artifactDag()` / `childrenOf`; `hasTasks` OR `taskCompletionCheck`; text DAG display status; convergent nodes once; cached DAG |
| Delegates refresh to GetStatus       | No direct refresh / detector                                                                                                                                    |
| Implementation section               | `--implementation` uses SDK `buildImplementationReview`                                                                                                         |
| Task completion in details           | `tasks: N/M`                                                                                                                                                    |
| Basic info                           | name/state; no standalone `specs:` list                                                                                                                         |
| Specs and dependencies               | text section + JSON `specDependsOn`                                                                                                                             |

### Implementation Status

| Requirement                  | Status      | Evidence                                                                                                                                                        |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature            | Implemented | `registerChangeStatus`: `status <name>`, `--format`, `--implementation`                                                                                         |
| Drafted read-only            | Implemented | `draftView` branch: `(drafted)`, `transitions: (none — change is drafted)`, JSON `isDrafted: true`                                                              |
| Output format / DAG hasTasks | Implemented | JSON `artifactDag` maps `displayStatus`; `hasTasks` OR `taskCompletionCheck`                                                                                    |
| DAG task tags                | Implemented | `renderDag` taskTag                                                                                                                                             |
| Display-state                | Implemented | Text details use `a.displayStatus`; DAG uses `displayStatus ?? effectiveStatus`; JSON artifacts have `state` + `displayStatus`                                  |
| GetStatus projections        | Implemented | Prints `lifecycle.availableTransitions` / `nextAction` as returned                                                                                              |
| Review / overlap text        | Implemented | Review header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; overlap filter as above                                                       |
| Blocker labels               | Implemented | `b.label` branch                                                                                                                                                |
| Schema warning               | Implemented | Compare `change.schemaName@version` to `lifecycle.schemaInfo`; skip if null                                                                                     |
| Not found                    | Implemented | `handleError` / `ChangeNotFoundError`                                                                                                                           |
| Schema-derived DAG           | Implemented | `getActiveSchema` + `schema.artifactDag()` when not raw; else `ArtifactDag.from(schemaInfo.artifacts)`; `visited` set for convergent ids (omit, no “see above”) |
| Refresh policy               | Implemented | `status.execute({ name })` only; tests assert refresh not called                                                                                                |
| Implementation section       | Implemented | `enrichImplementationTracking` → `buildImplementationReview`                                                                                                    |
| Details tasks                | Implemented | `tasks: complete/total`                                                                                                                                         |
| Basic info / specs section   | Implemented | No standalone `specs:`; `specs and dependencies:` after DAG                                                                                                     |

**Partial notes (not counted as HIGH/MEDIUM mismatches):**

- Draft JSON omits `artifactDag` / nested `schema.artifactDag`. Spec allows MAY for artifact inspection on drafts; JSON draft payload is thinner than active JSON.
- Nested JSON `schema` object **overwrites** the earlier `{ name: change.schemaName, version: change.schemaVersion }` with `schemaInfo` name/version + `artifactDag`. Recorded vs active mismatch is only on stderr warning.

### Discrepancies

**HIGH:** none.

**MEDIUM:** none remaining from the previous trio.

**LOW:**

1. **Help JSON schema vs emitted JSON (`cli:entrypoint` + change-status).** Help documents `schema: { name: string, version: number }` and top-level `artifactDag`, but when `schemaInfo` is present the emitted `schema` object also includes `artifactDag`, `optional`, `output`, `children`.
   - Spec drift: help example is abbreviated.
   - Implementation: richer nested schema is what `Schema-derived fields` requires.
   - Prefer: extend help to match nested `schema.artifactDag`.

2. **Draft `nextAction` is not CLI-stripped.** Spec says MUST NOT print actionable mutating transitions. CLI prints Core’s `nextAction.command` as-is (tests mock `command: null`). If Core ever sent a transition command for a draft, CLI would print it.
   - Spec vs Core contract; CLI is a projector.

3. **Text DAG without `displayStatus` falls back to `effectiveStatus`.** Spec assumes GetStatus supplies display status. Fallback can hide `complete-with-drift` if Core omits `displayStatus`. Robustness only.

### Test Coverage

Primary file: **`packages/cli/test/commands/change/status.spec.ts`** (correct location for artifact-drift).

Covered well: signature missing name; drafted JSON/text; refresh not called; text sections; blockers; JSON lifecycle; DAG children/`hasTasks`/display state in **JSON**; overlap hide/show `OVERLAP_CONFLICT`; overlap peers; JSON `overlapDetail`; schema mismatch warning; not found; implementation section (mocked SDK adapter); details `tasks: N/M`; artifact-drift review header without paths.

### Missing Tests (verify title vs `it()`)

| Verify scenario (spec-preview)                               | Matching `it()`                                                                                               | Gap                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| DAG fallback `[hasTasks]` when no `taskCompletion`           | —                                                                                                             | Tree test always supplies `taskCompletion`               |
| Text prefers `complete-with-drift`                           | JSON-only `JSON output includes hasTasks and drift-aware state`                                               | No text DAG/details assertion for display status / `[!]` |
| JSON row includes canonical **and** display                  | Partial: `artifactDag.state` is display; `artifacts[].state` vs `displayStatus` not both asserted in one test | Weak                                                     |
| Incomplete tasks omit `verifying` from available transitions | —                                                                                                             | Pass-through; untested at CLI                            |
| `nextAction` implement vs verify follows GetStatus           | — (exists on **transition** repair guide)                                                                     | Status command untested                                  |
| Artifact-review-required (not only artifact-drift)           | Drift/overlap tests are analogous                                                                             | No `reason: 'artifact-review-required'`                  |
| Drift shown with `[drift]` in details                        | Drift test asserts `tasks.md` not path under review                                                           | Missing `hasDrift` / `[drift]`                           |
| `DEPS_INCONSISTENT` — Checking spec dependencies             | Labels only asserted indirectly via overlap blockers                                                          | No dedicated status label test                           |
| JSON `artifactDag` for custom/non-std schema                 | —                                                                                                             | Only generic schemaInfo artifacts                        |
| Text DAG convergent nodes once                               | —                                                                                                             | `visited` untested                                       |
| Schema warning skipped when `schemaInfo` is null             | —                                                                                                             |                                                          |
| JSON `specDependsOn` matches manifest                        | Text specs section only; JSON lifecycle test uses `{}`                                                        | No `expect(parsed.specDependsOn)`                        |
| `hasTasks \|\| taskCompletionCheck` on text+JSON             | —                                                                                                             | Alignment untested                                       |
| `--help` lists `overlapDetail`                               | —                                                                                                             | Help text not snapshotted                                |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:get-status`, `sdk:build-implementation-review`.

- Uses `kernel.specs.getActiveSchema` for cached `artifactDag()`. Change-status forbids calling SchemaRegistry / extra use cases to **recompute lifecycle**; DAG structure is in-scope. No contradiction with `core:get-status` if schemaInfo remains the lifecycle snapshot.
- Implementation tracking goes through SDK review, matching `sdk:build-implementation-review`.
- Entrypoint help-schema completeness: see LOW #1.

### Counts (`cli:change-status`)

| Metric                                      | Count                                     |
| ------------------------------------------- | ----------------------------------------- |
| Requirements                                | 16                                        |
| Implemented                                 | 16                                        |
| Partial                                     | 0 (draft JSON thinner; not a failed MUST) |
| Missing implementation                      | 0                                         |
| HIGH                                        | 0                                         |
| MEDIUM                                      | 0 (3 prior MEDIUMs closed)                |
| LOW                                         | 3                                         |
| Verify scenarios without a dedicated `it()` | 12 (table above)                          |

---

## Spec: `cli:change-transition`

### Requirements Summary

Signature (`<step>` or `--next`, `--skip-hooks`, `--allow-out-of-scope`, `--format`); `--next` → `to: 'next'` (no local routing table); no direct refresh (pre/post GetStatus `refreshImplementationTracking: false`); no approval flags on execute; no rewrite to pending gates; hook skip mapping; generic check-progress bus `stream: "change-transition"` (never `hook-progress`); hook observability; text success confirmation; JSON terminal `complete` with `ok` / `failure`; hook fail exit 2 without repair guide; invalid transition repair guide on **stderr**; incomplete tasks exit 1 naming artifact; gerund progress without `Executing:`; requires blockers via Core.

### Implementation Status

| Area                                                             | Status                                             |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| Signature / `--next` / skip / allowOutOfScope                    | Implemented (`transition.ts`)                      |
| Pre-status refresh false + drafted block                         | Implemented                                        |
| Execute input (no approval flags; allowOutOfScope only if flag)  | Implemented                                        |
| Check presenter `change-transition`                              | Implemented (`_check-progress-presenter.ts`)       |
| Text success `transitioned name: from → to`                      | Implemented                                        |
| JSON complete ok                                                 | Implemented                                        |
| JSON complete failure + blockers/nextAction                      | Implemented                                        |
| Repair guide stderr; HookFailedError → handleError exit 2        | Implemented                                        |
| Progress: requires-check / task-completion-failed / transitioned | Implemented (text on stderr; structured on stdout) |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none.

**LOW:**

1. **Repair-guide example vs actual first line.** Spec example: `error: cannot transition to <step>`. Code: `error: ${err.message}` (e.g. `Cannot transition from 'designing' to 'ready'`). Example is illustrative; Core message is richer. Spec-drift if the example is taken as a literal contract.

2. **JSON `--next` failure `to` field.** Failure record uses `to: requestedTarget` which can be `'next'` rather than a resolved state. Spec lists `from`/`to` on the complete record; Core rejection of `to: 'next'` may never hit the repair-guide JSON path (handleError instead). Edge only.

### Test Coverage

File: `packages/cli/test/commands/change/transition.spec.ts` (plus overlapping cases in `change.spec.ts` for approval flags).

Covered: missing args; `--next` vs step exclusivity; `to: 'next'`; allowOutOfScope on/off; no approval flags; no pending rewrite; hook failure exit 2 without repair guide; hook progress before fail; JSON success stream + no `hook-progress`; gerund progress / no `Executing:`; illegal transition; repair guide; approval-required stderr; `--next` from pending-spec-approval / pending-signoff / archivable; skip-hooks parse; incomplete tasks; repair guide verify skill; ReadOnlyWorkspace / ArchiveDependency / ArchiveImplementation repair guides; refresh false on status calls.

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                                 | Matching `it()`                    | Gap                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Structured **failure** terminal `complete` with `result: "failure"`             | —                                  | Implementation exists; no JSON parse of failure stream                     |
| `--skip-hooks target.pre` vs `source.post` **execution** (hooks skipped vs run) | Only parse `skipHookPhases` set    | Does not prove Core hook behaviour (CLI maps flags only)                   |
| Unsatisfied requires surfaced                                                   | Repair guide uses Core blockers    | No dedicated `requires` event / MISSING requires-only case                 |
| Repair guide not on stdout (JSON mode)                                          | Text mode asserted                 | JSON failure path untested                                                 |
| `--next` rejected from `archiving`                                              | pending/signoff/archivable covered | `archiving` not listed in tests (spec mentions it with pending/archivable) |

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-change`, `core:hook-execution-model`, `core:get-status`.

- Aligns with Core: CLI does not bake approval routing; refresh owned by TransitionChange.
- Repair guide second GetStatus uses `refreshImplementationTracking: false` as required.
- Change-status “status omitted verifying before failed transition” is a **status** scenario; transition tests do not call the status command. Cross-spec, not a CLI transition bug.

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

`approve spec|signoff <name> --reason` + `--format`; no gate flags on execute; `kernel.changes.approve*` not `kernel.specs.*`; no CLI hashes; spec approval from `ready` (drain `pending-spec-approval`) without printing pending transition; signoff from `done` (drain `pending-signoff`); text `approved <gate> for <name>`; JSON `{ result, gate, name }`; missing `--reason` / unknown sub-verb / wrong state / not found → exit 1.

### Implementation Status

All Implemented in `approve.ts`: `requiredOption('--reason')`; execute `{ name, reason }` only; help uses bound-from language (`ready` / `done` + drain). Does not print `pending-spec-approval` / `moved`.

### Discrepancies

**HIGH / MEDIUM / LOW:** none on the CLI command itself.

Note: tests mock `kernel.changes.status` but the handler never calls status. Harmless; does not violate the spec.

### Test Coverage

File: `packages/cli/test/commands/change/approve.spec.ts`.

Covered: success text/JSON spec and signoff; execute shape `{ name, reason }`; stay in ready/done messaging; drain from pending states; missing reason; unknown sub-verb `review`; not found; wrong state (`ApprovalGateDisabledError`).

### Missing Tests (verify title vs `it()`)

| Verify scenario                                                  | Matching `it()`                                     | Gap                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `approvalsSpec` / `approvalsSignoff` not on input                | Implied by `toHaveBeenCalledWith({ name, reason })` | No explicit `not.toHaveProperty('approvalsSpec')` (transition has this pattern) |
| Routed through `kernel.changes.approveSpec` not `kernel.specs.*` | Uses `kernel.changes.approveSpec.execute`           | No `expect(kernel.specs.approveSpec).not.toHaveBeenCalled()`                    |
| Hashes computed by use case, CLI did not pass hashes             | Call shape has no hash fields                       | No history/hash assertion (Core’s job)                                          |
| Help bound-`from` language                                       | —                                                   | Help strings untested                                                           |

None of these are implementation gaps.

### Spec Dependency issues

Declared: `cli:entrypoint`, `core:change`, `core:transition-checks`.

- Gate enablement baked in kernel matches `core:transition-checks` / change approve Core specs.
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

Canonical `specd changes archive <name>` + singular alias; `--skip-hooks pre|post|all`; `--allow-overlap`; `--allow-out-of-scope`; must be `archivable`; delegate to `ArchiveChange`; check-progress gerund bus; post-hook fail exit 2; text archive path; invalidated section only when non-empty; JSON NDJSON `stream: "change-archive"` complete record (no second unwrapped `{ result: "ok" }`); errors: not found / not archivable / merge fail exit 1.

### Implementation Status

| Area                                                           | Status                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Flags + skip set + optional allow flags                        | Implemented                                                                    |
| Progress presenter `change-archive` (text stderr, JSON stdout) | Implemented                                                                    |
| Text success + invalidated list                                | Implemented                                                                    |
| JSON stream complete only (no extra object)                    | Implemented                                                                    |
| Post-hook failures → `cliError` exit 2 before success print    | Implemented                                                                    |
| SpecOverlapError custom stderr + exit 1                        | Implemented                                                                    |
| Alias                                                          | Implemented at program: `command('changes').alias('change')` in `src/index.ts` |

### Discrepancies

**HIGH:** none.

**MEDIUM:** none vs change-archive MUST lines.

**LOW:**

1. **`SpecOverlapError` bypasses `handleError`.** Always plain stderr + `process.exit(1)`. `--format json` does not emit a structured error object on stdout (unlike other domain errors).
   - `cli:entrypoint`: errors always go to stderr as `error:` (this path complies). Structured JSON extras are a handleError convention, not strictly required by entrypoint “Errors always go to stderr”.
   - Prefer: route through `handleError` for JSON/TOON parity with other commands.

2. **Prerequisites “naming the current state”.** CLI relies on `InvalidStateTransitionError` / handleError message. Test only checks `/error:/`, not that `done` (or current state) appears. If Core’s message omitted the from-state, CLI would not add it. Spec could be read as a CLI MUST to mention state even when Core is terse.

### Test Coverage

File: `packages/cli/test/commands/change/archive.spec.ts`.

Covered: text path; post-hook exit 2 without success line; JSON complete + `archivePath` / `invalidatedChanges`; NDJSON check-start/done then complete; invalidated text/JSON; not found; missing name; not archivable; skip-hooks all/pre/post/comma; empty skip set; allowOverlap / allowOutOfScope on/off; gerund progress + hook bus, no `Executing:`.

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

- Plural canonical + singular alias matches `cli:command-resource-naming` via parent alias (not a second `archive` registration).
- `--allow-out-of-scope` documented as `impl.linksInScope` — consistent with transition.
- Check-progress labels match `core:transition-checks` gerund bus.
- LOW overlap with entrypoint structured-error path (see above).

### Counts (`cli:change-archive`)

| Metric                 | Count |
| ---------------------- | ----- |
| Requirements           | 11    |
| Implemented            | 11    |
| HIGH                   | 0     |
| MEDIUM                 | 0     |
| LOW                    | 2     |
| Notable missing `it()` | 6     |

---

## Batch summary (CLI assigned specs)

| Spec                    | HIGH  | MEDIUM | LOW   | Impl gaps |
| ----------------------- | ----- | ------ | ----- | --------- |
| `cli:change-status`     | 0     | 0      | 3     | 0         |
| `cli:change-transition` | 0     | 0      | 2     | 0         |
| `cli:change-approve`    | 0     | 0      | 0     | 0         |
| `cli:change-archive`    | 0     | 0      | 2     | 0         |
| **Total**               | **0** | **0**  | **7** | **0**     |

**Previous MEDIUMs:** all three closed in code; remaining work is tests (taskCompletionCheck DAG, `[drift]` tag, JSON failure stream, SpecOverlapError, status label/display-state text).

**Highest-value missing tests (not discrepancies):**

1. `status.spec.ts`: `taskCompletionCheck` without `hasTasks: true` → JSON + text DAG tags.
2. `status.spec.ts`: text `complete-with-drift` / `[drift]`.
3. `transition.spec.ts`: JSON `event.result.result === 'failure'` complete record.
4. `archive.spec.ts`: `SpecOverlapError` stderr + `--allow-overlap` hint.

---

### Source: \_partial-skills-globals.md

# Partial audit: skills + project-wide globals

**Mode:** change `workflow-transition-checks` (spec-preview)  
**Assigned:** `skills:skill-templates-source`; cross-check vs `default:_global/architecture`, `default:_global/testing`, `default:_global/conventions`, `default:_global/spec-layout`  
**Read-only.** Graph: `stale: false` (indexed 2026-08-28). CLI: `node packages/cli/dist/index.js`.  
**Sources:** `changes spec-preview workflow-transition-checks skills:skill-templates-source`; `specs show` for the four globals; template files under `packages/skills/templates/`; `packages/skills/test/template-workflow.spec.ts`; change deltas for `core:storage`, `core:validate-artifacts`, `core:lifecycle-engine`, `cli:change-status`.

**Prior HIGH H2 (baseline drift on ValidateArtifacts vs FsChangeRepository.get):** **not re-opened as HIGH.** Change specs now place baseline `validatedHash` drift + `Change.invalidate('artifact-drift', SYSTEM_ACTOR)` on repository load (`core:storage`); `ValidateArtifacts` MUST NOT repeat that comparison. Code matches (`packages/core/src/infrastructure/fs/change-repository.ts` ~1564; port `ChangeRepository.get` documents auto-invalidate). See Architecture cross-check (INFO).

---

## Area A — `skills:skill-templates-source`

### Requirements

Merged `spec.md` has **18** requirements, **0** `#### Scenario:` headings (layout-compliant). Merged `verify.md` has the same **18** requirement headings and **48** scenarios.

**Unchanged (this change does not rewrite them; still in merged preview):**

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

**Added by this change (delta + matching verify scenarios):**

12. **In-place approval gates** — hop-owning skills + `shared.md.tpl` describe gates as stay-in-`ready`/`done` + human `approve`; MUST NOT teach `change transition` into `pending-spec-approval` / `pending-signoff`; pending names are drain-only; `specd` entry skill is router-only (no signoff/approve copy); archive requires `archivable` and points signoff wait at `/specd-verify` in `done`.
13. **Implementation tracking in verify and implement** — cookbook in `shared.md.tpl`; verify drains `IMPLEMENTATION_STATE` / open files in-skill (no bounce to `/specd-implement`); implement requires zero open tracked files before recommending `/specd-verify`; prefer top-level `--symbol` links.
14. **Archive skill skips only pre hooks** — `changes archive --skip-hooks pre` (not `all`); no post `run-hooks archiving` after success; still fetch post `hook-instruction`.
15. **Design review scope without review file lists** — MAY key off `review: required: yes`; MUST NOT say files are listed under the text `review:` header; first scope is `artifacts (details):` / `affectedArtifacts`.

**Spec Dependencies (merged):** `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks` (in-place `approval.spec` / `approval.signoff`; pending drain-only). Canonical spec-ID labels with relative links — conforms to `default:_global/spec-layout`.

### Implementation

Templates under `packages/skills/templates/` implement the four new requirements:

| Requirement         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place gates      | `shared.md.tpl` ~374–387: never run `changes approve`; stay in `ready`/`done`; pending as drain only. Hook list ~502–506: do not list pending as happy-path intermediates; no `source.post` on `along` backward. `specd-design` ~390–398: stay in `ready`, `approve spec`. `specd-implement` ~42–45: do not `transition implementing` when spec gate unsatisfied. `specd-verify` ~290–293: stay in `done`, `approve signoff`; no `pending-signoff`. `specd-new` table: pending rows labeled **Drain only**. `specd/SKILL.md.tpl`: router; no signoff / `approve spec` / pending. `specd-archive`: must already be `archivable`; signoff wait is `/specd-verify` in `done`. |
| Impl tracking       | `shared.md.tpl` documents `list`/`review`/`add`/`resolve`/`ignore`, resolve vs ignore. Verify drains tracking, points at `shared.md`. Implement: zero open before `/specd-verify`; top-level symbol guidance.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Archive pre-only    | Examples use `--skip-hooks pre`; explicit “Do **not** call `run-hooks … archiving --phase post`”; still `hook-instruction … --phase post`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Design review scope | `specd-design` ~48–50: `pending-review` / `[drift]` under `artifacts (details):`; “Text `review:` only has `required` / `route` / `reason` — not file paths.” Matches `cli:change-status` text contract (header without file lists).                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Pre-existing template contracts (graph `--direction dependents`, `--snippet`, optimizer gates, command roles) remain in templates and in `template-workflow.spec.ts` (older tests).

**Overlap / ValidateArtifacts (explicit audit questions):**

- Templates **do not** mention `ValidateArtifacts`, `validatedHash`, or “run validate to detect baseline drift.” `shared.md.tpl` defines `drifted-pending-review` as disk change after validation — status language, not a use-case owner. **No finding** that skills still expect ValidateArtifacts to own baseline drift.
- Templates **do** list `OVERLAP_CONFLICT` as a typical **blockers:** example (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`, `specd-new`) alongside `ARTIFACT_DRIFT` and `REVIEW_REQUIRED`. They **do not** state that `review.reason === 'spec-overlap-conflict'` (overlap _invalidation_ / victim of another archive) is **not** `OVERLAP_CONFLICT`, nor that that path is `/specd-design` and MUST NOT use `--allow-overlap`. Live archive overlap is correctly handled in `specd-archive` via `SpecOverlapError` + `--allow-overlap`. See Discrepancy D-SK-1.

`ChangeRepository.get` (application port) documents load-time auto-invalidate; `FsChangeRepository` implements it. Skills never instruct agents to call validate for that.

### Discrepancies

**D-SK-1 — MEDIUM — Overlap invalidation vs `OVERLAP_CONFLICT` in skill copy**

- **Change specs (`core:lifecycle-engine`, `cli:change-status`):** live `OVERLAP_CONFLICT` is archive `spec.overlap` when `state === 'archivable'`. Historical/invalidation overlap (`review.reason: spec-overlap-conflict`) MUST NOT emit `OVERLAP_CONFLICT`; next action is `/specd-design`, not `--allow-overlap`.
- **`skills:skill-templates-source`:** does not add a requirement to teach that split. Templates still offer `OVERLAP_CONFLICT` as a generic high-visibility blocker example in **design / implement / verify / new**, where live archive overlap is not the happy path.
- **Interpretation 1 (code + LE/status specs truth):** templates should name `ARTIFACT_DRIFT` / `REVIEW_REQUIRED` / `APPROVAL_REQUIRED` / `IMPLEMENTATION_STATE` for those skills, and reserve `OVERLAP_CONFLICT` (+ `--allow-overlap`) for archive; add one sentence that overlap _invalidation_ is review, not that code.
- **Interpretation 2 (skills spec is silent, examples are harmless):** agents follow `next action:` / `review: required: yes` anyway (design already routes review to `/specd-design`). Residual risk is an agent treating a victim overlap as skippable `OVERLAP_CONFLICT`.
- **Neither side is “the” truth:** skills spec does not contradict LE; templates can still _imply_ the old conflation.

**D-SK-2 — INFO — ValidateArtifacts baseline drift not taught in templates (compliant)**

No template tells agents to use ValidateArtifacts for `validatedHash` / baseline drift. Aligned with `core:validate-artifacts` + `core:storage`. Do not treat as a defect.

**D-SK-3 — LOW — `specd-new` still pairs `OVERLAP_CONFLICT` with early routing**

`specd-new` uses TOON `review.required` (good) but the same example blocker list. Same as D-SK-1, narrower surface.

**D-SK-4 — LOW vs `default:_global/testing` — template contract tests are not `given/when/then` named**

`packages/skills/test/template-workflow.spec.ts` uses imperative titles (`does not teach pending parking…`). Global testing prefers `"given <state>, when <action>, then <outcome>"` for behaviour tests. Assertions themselves match verify scenarios (exact phrases). Spec-or-test: either rename tests or treat workflow-template string contracts as exempt documentation tests.

No hexagonal violation **inside** `@specd/skills` for these requirements (templates are content; rendering remains install-time).

### Tests

`packages/skills/test/template-workflow.spec.ts` (Vitest, `test/` mirroring, `.spec.ts`, no snapshots):

| Verify scenario (new)                                                          | Covered?                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Verify does not route to `pending-signoff`                                     | Yes (`not.toMatch(/pending-signoff/)`, stay in `done`, `approve signoff`) |
| Implement does not hop implementing while spec gate blocks                     | Yes                                                                       |
| Shared stay-in-state not reaches-pending                                       | Yes                                                                       |
| Shared hook list not pending intermediates                                     | Yes (`Do **not**\nlist pending-spec-approval`)                            |
| New-skill drain-only pending rows                                              | Yes (`Drain only:`)                                                       |
| Design stays in ready                                                          | Yes                                                                       |
| specd entry does not teach signoff                                             | Yes                                                                       |
| Archive in-place gates                                                         | Yes (`archivable`, `approve signoff`, no `pending-signoff`)               |
| Shared implementation commands + resolve vs ignore + no catch-all              | Yes                                                                       |
| Verify drains open files, no bounce to implement                               | Yes                                                                       |
| Implement zero-open before verify                                              | Yes                                                                       |
| Archive `--skip-hooks pre` not `all`; no post run-hooks; hook-instruction post | Yes                                                                       |
| Design does not treat `review:` as file list                                   | Yes                                                                       |

**Missing tests**

- No assertion that hop-owning templates do **not** treat overlap invalidation as `OVERLAP_CONFLICT` / `--allow-overlap` (would lock D-SK-1).
- No assertion that templates omit ValidateArtifacts-as-drift-owner (would lock D-SK-2; currently vacuously true).

Older tests still cover optimizer gates, command roles, metadata self-healing (skill spec: keyword-only insufficient for those — existing tests use exact command strings).

### Counts (`skills:skill-templates-source`)

| Metric                                               | Count                                        |
| ---------------------------------------------------- | -------------------------------------------- |
| Requirements (merged spec.md)                        | 18                                           |
| Verify scenarios                                     | 48                                           |
| New requirements this change                         | 4                                            |
| New verify scenarios this change                     | 13                                           |
| Implemented as specified (new + overlap/VA specials) | 4 new reqs implemented; D-SK-1 open          |
| Discrepancies                                        | 1 MEDIUM, 2 LOW, 1 INFO                      |
| Missing tests                                        | 2 (overlap-split; optional VA-owner absence) |

---

## Area B — Cross-check: change specs vs `default:_global/architecture`

### Requirements (global)

Hexagonal layers; domain pure; application uses ports only; rich entities own invariants; YAML validated at infrastructure boundary; adapter **packages** (CLI/MCP/plugins) contain no business logic; composition via `createX(deps)`.

### Implementation / change-spec alignment (baseline drift)

- **`core:storage` (change):** when artifact types are resolved, load MUST detect baseline drift vs `validatedHash` and `Change.invalidate('artifact-drift', SYSTEM_ACTOR, …)` once. `ValidateArtifacts` MUST NOT repeat. Load-time actor is `SYSTEM_ACTOR`, not `ActorResolver`. Entity still applies invalidation policy (`none`, etc.).
- **`core:validate-artifacts` (change):** execute loads via `ChangeRepository.get` first; MUST NOT compare disk to `validatedHash` for baseline drift / `hasDrift` / invalidate. Consent-hash drift stays on the use case.
- **Code:** `FsChangeRepository` ~1564; port JSDoc on `get()` states filesystem-backed auto-invalidate. `ValidateArtifacts` still computes `validatedHash` for `markComplete` only.

This is **hydration on the repository port**, not CLI/MCP business logic. Architecture does **not** forbid a port documenting load-time reconstitution. Previous “policy in fs adapter vs use case” HIGH is **closed by spec alignment** (CODE WINS as instructed).

### Discrepancies

**D-ARCH-1 — INFO — Residual hexagonal tension, not a change-spec contradiction**

Calling `change.invalidate` from the fs adapter is domain mutation at the infrastructure edge. Architecture prefers use cases for application policy. Here the **port contract** owns the policy; fs is the implementation; the entity owns invariants. Change specs **cite** `default:_global/architecture` and still assign this to load. Do **not** escalate to HIGH unless a change spec still says ValidateArtifacts owns baseline `validatedHash` drift — **none does**.

No finding that `skills:skill-templates-source` violates hexagonal rules.

### Tests

Storage/validate-artifacts tests are out of this batch except: skills tests do not (and need not) cover fs `get()` invalidation.

### Counts (architecture cross-check)

| Metric                                            | Count |
| ------------------------------------------------- | ----- |
| Change-spec vs architecture contradictions (HIGH) | 0     |
| INFO residual layering notes                      | 1     |
| Skills-package hexagonal defects                  | 0     |

---

## Area C — Cross-check: `default:_global/testing`

### Requirements

Vitest; `test/` mirror; `.spec.ts`; unit tests mock ports; typed full port mocks; integration tests use temp dirs + cleanup; given/when/then names; no snapshots.

### Implementation

`packages/skills/test/template-workflow.spec.ts` meets runner, location, suffix, no-snapshot. Reads templates from disk (fixture files, not a core port) — acceptable for template contract tests. No `as unknown as Port` in this file.

### Discrepancies

**D-TEST-1 — LOW** — titles are not given/when/then (see D-SK-4). Does not weaken the new scenario coverage.

### Tests

N/A (this area is the test convention itself).

### Counts

| Metric                 | Count |
| ---------------------- | ----- |
| Violations HIGH/MEDIUM | 0     |
| LOW naming             | 1     |

---

## Area D — Cross-check: `default:_global/conventions`

### Requirements

Strict TS, ESM, named exports, kebab-case, no `any`, explicit public return types, SpecdError, lazy list vs get, immutability preference.

### Implementation

This batch’s skill **deltas** are markdown templates + Vitest tests. `template-workflow.spec.ts` uses named imports, kebab-case path, ESM. No new core `any` / default export in assigned files.

### Discrepancies

None in assigned skill artifacts.

### Tests / Counts

0 discrepancies.

---

## Area E — Cross-check: `default:_global/spec-layout`

### Requirements

Paired `spec.md` / `verify.md`; no WHEN/THEN in spec.md; scenarios under matching `### Requirement:` in verify.md; Spec Dependencies with canonical IDs.

### Implementation

`skills:skill-templates-source` merged preview: spec.md has Purpose, Requirements, Spec Dependencies; **no** Scenario headings; verify.md groups all 48 scenarios under the same 18 requirement names, including the four added blocks. Deltas use AST `parent` + `### Requirement:` selectors. Dependency labels are `workspace:path` with relative `href`s.

### Discrepancies

None for this spec. (Other change specs in the same change are out of scope except as cited for overlap/drift.)

### Tests / Counts

0 layout defects for `skills:skill-templates-source`.

---

## Batch summary

| Area                          | HIGH | MEDIUM                               | LOW | INFO                              | Missing tests |
| ----------------------------- | ---- | ------------------------------------ | --- | --------------------------------- | ------------- |
| skills:skill-templates-source | 0    | 1 (D-SK-1 OVERLAP_CONFLICT examples) | 2   | 1 (VA not taught — OK)            | 2             |
| vs architecture               | 0    | 0                                    | 0   | 1 (hydration vs use case; not H2) | —             |
| vs testing                    | 0    | 0                                    | 1   | 0                                 | —             |
| vs conventions                | 0    | 0                                    | 0   | 0                                 | —             |
| vs spec-layout                | 0    | 0                                    | 0   | 0                                 | —             |

**Do not re-open H2.** Change specs + port + `FsChangeRepository.get` agree; ValidateArtifacts does not own baseline drift; skills do not tell agents otherwise.

**Do flag:** workflow templates still **exemplify** `OVERLAP_CONFLICT` on design/implement/verify/new, which can teach agents to treat **overlap invalidation** like live archive overlap. They do **not** tell agents to use ValidateArtifacts for baseline drift.
