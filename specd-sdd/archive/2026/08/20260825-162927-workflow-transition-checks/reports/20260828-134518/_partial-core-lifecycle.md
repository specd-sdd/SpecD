# Spec-Compliance Audit — core lifecycle partial

- **Change:** `workflow-transition-checks`
- **Scope (change-owned, via `changes spec-preview`):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:transition-checks`
- **Depth-1 consistency:** `default:_global/architecture` (hexagonal, domain purity / no I/O in domain)
- **Date:** 2026-08-28
- **Mode:** read-only. No source or spec files modified. This file is the audit artifact.

## Tooling / graph status

`graph index --force` is reported failed (schema 5 vs 9, then worker crash). This pass did **not** reindex.

`node packages/cli/dist/index.js graph search "TransitionChange" --symbols --format toon` **succeeded** and resolved `packages/core/src/application/use-cases/transition-change.ts` (class at line 110). Further file:line evidence used Read/Grep. Audit is **not** blocked on a fresh index.

Merged spec text came from `changes spec-preview workflow-transition-checks <specId> --format text`. Architecture was read via `specs show default:_global/architecture`.

---

## Re-verify of 20260828-121751 findings

| Prior ID         | Claim (12:17)                                                                    | Status now                           | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH D-3         | `TransitionChange` did not reload `Change` after `RefreshImplementationTracking` | **FIXED**                            | `transition-change.ts:173-180` reloads after refresh. Test `evaluates impl.filesResolved against post-refresh tracked files` at `transition-change.spec.ts:2580-2596` mutates the repo inside the refresh stub and expects `ArchiveImplementationStateError`.                                                                                                                      |
| MEDIUM M-1       | `includeOverlapDetection` unguarded in composition GetStatus tests               | **PARTIALLY FIXED (INFO remainder)** | Flag still set at `composition/use-cases/get-status.ts:45`. New test `wires includeOverlapDetection for archive predicates` (`composition/use-cases/get-status.spec.ts:108-114`) asserts source text contains `includeOverlapDetection: true` — brittle but would fail if the argument were deleted. Peer wiring is exercised for real in `workflow-check-registry.spec.ts:61-78`. |
| MEDIUM D-4       | `spec.overlap` drops peer names                                                  | **FIXED**                            | `workflow-check-registry.ts:53-61` returns `peers: detection.peers` via `specOverlapDetectionForChange`. Domain `formatOverlapMessage` (`domain/checks/spec-overlap.ts:34-48`) names `changeName (specIds)`. Registry test asserts `beta (core:core/config)` and `details.peers`.                                                                                                  |
| MEDIUM D-1 / D-2 | Input contract omitted `'next'` / `allowOutOfScope`                              | **FIXED (spec)**                     | Merged `Requirement: Input contract` lists `to` as `ChangeState \| 'next'` and `allowOutOfScope`. Code `transition-change.ts:50,66-70`. Verify scenario `Input accepts transition controls without approval flags`. Core tests `skips impl.linksInScope when allowOutOfScope is true` / `still fails open tracked files` (`transition-change.spec.ts:2599-2624`).                  |
| Item 5           | Live `OVERLAP_CONFLICT` only when archivable                                     | **STILL COMPLIANT**                  | `get-status.ts:464-478` runs archive predicates only if `state === 'archivable'`, with `allowOverlap`/`allowOutOfScope` false. Engine `_reviewBlockers` returns `[]` for `spec-overlap-conflict` (`lifecycle-engine.ts:538-539`). Tests `get-status.spec.ts:1049` (spy not called) and `:1022` / `:1064` (archivable skippable overlap).                                           |
| Item 6           | `HAPPY_PATH_NEXT` / `pending-signoff`                                            | **FIXED in table test**              | `change-state.spec.ts:76-77` asserts `pending-spec-approval` and `pending-signoff` are `undefined`. Use-case rejection `rejects from pending-signoff` at `transition-change.spec.ts:226`. Table `change-state.ts:49-58` still omits those four states.                                                                                                                             |

---

## 1. Requirements (list per spec)

### `core:transition-checks`

| ID    | Requirement                 | Substance                                                                                                                                                                                                |
| ----- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-1  | Check identity and result   | Stable `id`, gerund `label`, `kind`, `outcome`, fail `code`/`message`, optional `details`. `archive.publication` MUST NOT be a `CheckId`.                                                                |
| TC-2  | Check ABI / WorkflowCheck   | `Check` / `WorkflowCheck` / `create<Name>(deps)`; no snapshot bag / `needs`; `CheckExecutionContext` is host + `passMemo` + `onCheckProgress`. Domain `run(facts)` is not the production `execute` path. |
| TC-3  | One file per check          | `id`/`kind` on the class; applicability on bindings.                                                                                                                                                     |
| TC-4  | Applicability from/to/along | `along` ∈ forward/backward/redesign/recovery/any; axis from `workflow[]` + `AXIS_FALLBACK` splice.                                                                                                       |
| TC-5  | Archive is an operation     | Not a fake edge; `approval.signoff` MUST NOT bind to `archive`.                                                                                                                                          |
| TC-6  | Binding phase / onFailure   | Effects: `before-persist`/`after-persist`, `abort`/`collect`.                                                                                                                                            |
| TC-7  | Predicate vs effect         | Predicates decide `allowed`; `--skip-hooks` skips effects only.                                                                                                                                          |
| TC-8  | Evaluation of an attempt    | `protocol.edge` fail-fast on TransitionChange; collect-all on GetStatus. No pending routing rewrite.                                                                                                     |
| TC-9  | Registry bindings           | Exact table (enter-ready, forward exit-impl, approval edges, archive set).                                                                                                                               |
| TC-10 | Actionable fail diagnostics | `deps.consistent` extracted vs persisted; **`spec.overlap` MUST name peers and spec ids when known**; `impl.*` compact; `--allow-out-of-scope` only for `impl.linksInScope`.                             |
| TC-11 | Generic progress bus        | `check-start` / `check-progress` / `check-done`; no `Executing:`; GetStatus MUST NOT stream.                                                                                                             |
| TC-12 | Projections                 | `validTransitions` / `availableTransitions` / `nextAction` from the same evaluation.                                                                                                                     |
| TC-13 | No shared snapshot bag      | Applicability declared once; engine projects supplied `CheckResult`s.                                                                                                                                    |

### `core:lifecycle-engine`

| ID   | Requirement                  | Substance                                                                                                                                                                                                                               |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1 | Centralized validation       | One evaluation; project caller `CheckResult`s; I/O-free; no snapshot bag; no `check.run` fallback.                                                                                                                                      |
| LE-2 | Effective artifact status    | DAG cascade → `pending-parent-artifact-review`.                                                                                                                                                                                         |
| LE-3 | Canonical-state-only         | `complete-with-drift` / `hasDrift` are display-only.                                                                                                                                                                                    |
| LE-4 | Machine-readable blockers    | `code`, `message`, `isSkippable`, optional `bypassFlag`/`affectedArtifacts`. **Active bypass MUST omit the blocker.** `OVERLAP_CONFLICT` only from live archive `spec.overlap`, never from `review.reason === 'spec-overlap-conflict'`. |
| LE-5 | Available steps / nextAction | `_resolveTarget` MUST NOT rewrite gates; happy-path matrix; backward hops available but not default.                                                                                                                                    |
| LE-6 | Archiving escape             | `archiving → archivable` is `recovery`; no `requires` / `taskCompletion` on that hop.                                                                                                                                                   |
| LE-7 | Review summary integration   | Drift + overlap as diagnostics (wording looser than LE-4’s blocker-code split).                                                                                                                                                         |
| LE-8 | Shared consumers             | GetStatus / TransitionChange / ValidateArtifacts / GetArtifactInstruction; empty `checksByTarget` for validate/instruction; CompileContext MUST NOT be required to call `evaluate`.                                                     |
| LE-9 | Next artifact DAG order      | `artifactDag().topologicalOrder()`, not declaration order.                                                                                                                                                                              |

### `core:get-status`

| ID    | Requirement                          | Substance                                                                                                                                      |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GS-1  | Input                                | `name`, `refreshImplementationTracking?`, `ifModifiedSince?`.                                                                                  |
| GS-2  | Result shape                         | `change`/`draftView`/`unchanged`/`artifactStatuses`/…; `get` then `getDraft`; never `getDiscarded`.                                            |
| GS-3  | Revision evaluation                  | HTTP-304-style; MUST NOT refresh.                                                                                                              |
| GS-4  | Drafted read-only                    | `projectArtifacts` cascade; empty `availableTransitions`.                                                                                      |
| GS-5  | Implementation projection            | Tracked files + links.                                                                                                                         |
| GS-6  | Optional pre-read refresh            | Active only; skipped on 304; reload after refresh; never `ImplementationDetector`.                                                             |
| GS-7  | Drift-aware display                  | `hasDrift` + `displayStatus` + aggregation precedence.                                                                                         |
| GS-8  | Task counts                          | From `workflow.taskCompletion` details; no second `CountTasks`.                                                                                |
| GS-9  | Execute predicates then project      | Collect-all. **Archive-scope predicates only when `state === 'archivable'`**, `allowOverlap`/`allowOutOfScope` false. `passMemo` per pass.     |
| GS-10 | `ChangeNotFoundError`                | Not `null`.                                                                                                                                    |
| GS-11 | One status entry per schema artifact | Full path; empty when `unchanged`.                                                                                                             |
| GS-12 | Lifecycle / review                   | Priority ladder drift → overlap invalidation → review-required; reverse history scan.                                                          |
| GS-13 | Blockers                             | Failed predicates with `label`/`checkId`; `--allow-out-of-scope` only for `impl.linksInScope`; victim overlap MUST NOT add `OVERLAP_CONFLICT`. |
| GS-14 | Schema failure degrades              | Wrap only `SchemaProvider.get()`.                                                                                                              |
| GS-15 | Config factory                       | `resolveGetStatusDeps` → `createGetStatus(deps)`; `transitionBindings` + `archiveBindings` from `resolveWorkflowCheckRegistry`.                |

### `core:transition-change`

| ID          | Requirement                         | Substance                                                                                                                                             |
| ----------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TX-1        | Input contract                      | `name`, `to: ChangeState \| 'next'`, `skipHookPhases?`, `refreshImplementationTrackingBefore?`, `allowOutOfScope?`. No per-invocation approval flags. |
| TX-2        | Approval gates baked                | Constructor `ApprovalGates`.                                                                                                                          |
| TX-3        | Change must exist                   | `ChangeNotFoundError`.                                                                                                                                |
| TX-4        | Optional pre-transition refresh     | Refresh then **evaluate against post-refresh tracked state**.                                                                                         |
| TX-5 / TX-6 | Spec/signoff are checks             | No rewrite to pending hops.                                                                                                                           |
| TX-7        | Pending states drain-only           | Explicit failures except redesign / historic drain.                                                                                                   |
| TX-8        | Direct persist when predicates pass | No effective-target rewrite.                                                                                                                          |
| TX-9        | Requires enforcement                | Map failed predicate; no re-walk.                                                                                                                     |
| TX-10       | Task completion                     | `missing-task-capability` / `incomplete-tasks`; no second `CountTasks`.                                                                               |
| TX-11       | verifying→implementing              | No downgrade.                                                                                                                                         |
| TX-12       | Skill-aligned backward hop          | Invalidate signoff only; no `source.post`.                                                                                                            |
| TX-13       | Transition to designing             | Invalidate + downgrade unless already designing/drafting.                                                                                             |
| TX-14       | archiving→archivable                | `along = recovery`; no archive effects / requires.                                                                                                    |
| TX-15/17    | Pre/post hooks                      | Iterate bindings by `phase`; never switch on `check.id`.                                                                                              |
| TX-16/18/19 | Delegate / event / persist          | `change.transition` inside `mutate`.                                                                                                                  |
| TX-20       | Result `{ change }`                 | No `postHookFailures`.                                                                                                                                |
| TX-21       | Progress                            | Generic check bus + `requires-check` / `task-completion-failed` / `transitioned`.                                                                     |
| TX-22       | Dependencies                        | No `RunStepHooks` / `CountTasks` as use-case ports.                                                                                                   |
| TX-23       | `to: 'next'`                        | Happy-path table; typed `SpecdError` for pending/archivable/archiving; then same execute path.                                                        |
| TX-24       | Config factory                      | `resolveTransitionChangeDeps`; no `runStepHooks` on the use case.                                                                                     |

### `default:_global/architecture` (depth-1)

| ID     | Constraint checked here                                                                          |
| ------ | ------------------------------------------------------------------------------------------------ |
| ARCH-D | Domain layer is pure — no `fs`/`net`/`child_process`.                                            |
| ARCH-A | Application uses ports only.                                                                     |
| ARCH-C | Composition is the only layer that imports infrastructure; config factories share resolver path. |
| ARCH-P | Stateless domain ops as plain functions (tension with `LifecycleEngine` class — see D-6/D-10).   |

---

## 2. Implementation status

### Prior HIGH/MEDIUM items (this change’s recorte focus)

| Area                                         | Status | Evidence                                                                                                                                                |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TX-4 post-refresh reload                     | ✅     | `transition-change.ts:168-180`: `let change`; after `_refresh.execute`, `change = reloaded`. Predicates at `:205-218` use that instance.                |
| GetStatus post-refresh reload                | ✅     | `get-status.ts:352-361` (unchanged pattern).                                                                                                            |
| `includeOverlapDetection: true` on GetStatus | ✅     | `composition/use-cases/get-status.ts:43-45`.                                                                                                            |
| `spec.overlap` peer names                    | ✅     | `workflow-check-registry.ts:41-61` + `detect-spec-overlap.ts:70-99` + `domain/checks/spec-overlap.ts:34-70`.                                            |
| Input `'next'` + `allowOutOfScope`           | ✅     | Spec merged; types and threading `transition-change.ts:50,66-70,184-212`.                                                                               |
| Live `OVERLAP_CONFLICT` only archivable      | ✅     | `get-status.ts:464-478`; victim path `_reviewBlockers` empty (`lifecycle-engine.ts:538-539`).                                                           |
| `HAPPY_PATH_NEXT`                            | ✅     | `change-state.ts:49-58`; `HappyPathNextUnavailableError`; resolve before `transitionAttemptFor` (`transition-change.ts:185-199`).                       |
| `protocol.edge` fail-fast vs collect-all     | ✅     | TransitionChange `{ failFastOn: 'protocol.edge' }` (`transition-change.ts:218`). GetStatus `executeChecksByLegalTargets` / archive pass omit fail-fast. |

### Other verified-compliant areas

| Area                                                                          | Status | Evidence                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binding table TC-9                                                            | ✅     | `domain/services/check-bindings.ts:28-94`. `approval.signoff` exact `done→archivable` forward. `impl.*` `from: implementing`, `along: forward`. Archive set includes `spec.overlap`; no `archive.publication` in src. |
| Hook skip by phase + identity                                                 | ✅     | Transition iterates `matchingEffects(..., 'before-persist', along)` not `check.id`. Archive `hook.post` `after-persist`/`collect`.                                                                                    |
| Engine I/O-free                                                               | ✅     | `lifecycle-engine.ts` imports domain types only; no `node:fs`. `availableTransitions` from injected checks (`:160-169`).                                                                                              |
| `isReady` from `workflow.requires` when present                               | ✅     | `:182-188`; `_requestedTargetBlockers` skips artifact re-walk when `hasRequiresResult` (`:599-611`) — prevents dual `MISSING_ARTIFACT` vs `INCOMPLETE_ARTIFACT`.                                                      |
| GetStatus 304 before refresh                                                  | ✅     | `:345-350` then refresh `:352`.                                                                                                                                                                                       |
| Schema catch wraps only `get()`                                               | ✅     | `:397-444`; check execute is after.                                                                                                                                                                                   |
| `nextAction` done/signed-off → `/specd-verify`; archivable → `/specd-archive` | ✅     | `:916-947`. Archivable now **gates** on `availableTransitions.includes('archiving')` (`:933-947`) — prior D-8 fixed.                                                                                                  |
| Approval nextAction from binding table                                        | ✅     | `boundFromStates('approval.spec'\|'approval.signoff')` `:804,817`.                                                                                                                                                    |
| TransitionChange schema miss throws                                           | ✅     | `:196` no try/catch around `_schemaProvider.get()`.                                                                                                                                                                   |
| No `RunStepHooks`/`CountTasks` on UC constructors                             | ✅     | `transition-change.ts:130-138`, `get-status.ts:307-315`.                                                                                                                                                              |
| No `PredicateSnapshots` / `gatherPredicateSnapshots`                          | ✅     | Grep `packages/core/src` — no hits.                                                                                                                                                                                   |
| ValidateArtifacts / GetArtifactInstruction empty `checksByTarget`             | ✅     | `validate-artifacts.ts:225`, `get-artifact-instruction.ts:104`.                                                                                                                                                       |
| CompileContext does not call `evaluate`                                       | ✅     | No `LifecycleEngine` / `.evaluate(` in `compile-context.ts`.                                                                                                                                                          |
| Domain purity (lifecycle symbols)                                             | ✅     | Grep `packages/core/src/domain` for `node:fs` / `child_process` / `net` — no hits. Overlap detection `detectSpecOverlap` is a pure function. Check I/O lives in application `create*` + composition closures.         |
| Config factories through resolver                                             | ✅     | `createGetStatusFromNormalized` → `createCompositionResolver` + `resolveGetStatusDeps`.                                                                                                                               |

---

## 3. Discrepancies (D-n numbered)

### D-1 — `LifecycleEngine.bypassFlags` accepted but never applied — **MEDIUM**

- **Spec (LE-4):** “If a blocker is skippable and the corresponding bypass is active in the engine's input, the engine MUST omit that blocker from `blockers`.”
- **Code:** `LifecycleEngineOptions.bypassFlags` (`lifecycle-engine.ts:48`), materialized `:146`, logged `:274`. `_blockersFromFailedChecks` (`:766-783`) never filters on the set. Nothing removes an `isSkippable` blocker because of engine input.

**Interpretation 1 (spec right / code incomplete):** Callers passing `bypassFlags: ['allow-overlap']` get the same `blockers` as without the flag (plus a debug log). Dead API on a domain service.

**Interpretation 2 (code right / spec over-specified):** Checks already `skip` when `ctx.allowOverlap` / `ctx.allowOutOfScope` is set (`domain/checks/spec-overlap.ts:59-61`, `impl-links-in-scope.ts:25`), so a bypassed check never produces a failed `CheckResult`. Engine-level omit is redundant. GetStatus **intentionally** runs archive overlap with `allowOverlap: false` (`get-status.ts:472`) so status always shows live overlap.

**Assessment:** Observable happy path is Interpretation 2. The option remains a trap. Either filter `_blockersFromFailedChecks` or drop `bypassFlags` from `LifecycleEngineOptions` and reword LE-4 to “omit because the check `skip`s.”

### D-2 — Merged `lifecycle-engine` verify still demands `OVERLAP_CONFLICT` from history — **MEDIUM** (spec-internal; code matches spec.md)

- **Merged spec.md LE-4:** `OVERLAP_CONFLICT` MUST NOT be emitted only because `review.reason` is `'spec-overlap-conflict'`.
- **Merged verify.md** scenario _Overlap conflict detection from history_ (preview): GIVEN invalidated `spec-overlap-conflict`, THEN `OVERLAP_CONFLICT` blocker **and** overlapping archived-change details.
- **LE-7 spec.md** still says report Overlap “as part of the blocking diagnostics” (looser).
- **Code:** `_reviewBlockers` returns `[]` for that reason (`lifecycle-engine.ts:538-539`). GetStatus tests assert **no** `OVERLAP_CONFLICT` on the victim path (`get-status.spec.ts:981` area).

**Interpretation 1 (spec.md + recorte-26 + tests are truth):** verify.md is stale; the scenario should assert review + `/specd-design`, not `OVERLAP_CONFLICT`.

**Interpretation 2 (verify.md is truth):** engine/GetStatus are wrong and should project `OVERLAP_CONFLICT` from history again — which would re-break the victim/live split this change exists to create.

**Assessment:** Treat spec.md + tests as intended. Flag verify.md (and LE-7’s “blocking diagnostics” wording) for repair. **Code is compliant with LE-4.**

### D-3 — `_resolveTarget` is an identity function — **INFO**

- **Spec (LE-5):** MUST NOT rewrite `implementing`→`pending-spec-approval` or `archivable`→`pending-signoff`.
- **Code:** `private _resolveTarget(requestedTarget: ChangeState): ChangeState { return requestedTarget }` (`lifecycle-engine.ts:325-327`), still called `:340,552,580`. `_isStepPermitted` `:340` is `this._resolveTarget(step) === step && isValidTransition(...)`.

Literally compliant. Residue from removed routing. `TransitionChange` purpose paragraph still says it delegates “approval-gate routing” to `LifecycleEngine` while TX-5/6 forbid rewrite — same class of leftover wording.

### D-4 — Archive overlap listing still duplicated in `ArchiveChange` — **INFO**

Composition `detectOverlap` now keeps peers (D-4 from 12:17 is fixed). `ArchiveChange.execute` still `list()` + N× `get()` + `detectSpecOverlap` + filter (`archive-change.ts:276-287`) to feed `throwMappedArchiveFailure` and invalidation (`:310-313`).

**Interpretation 1:** application-layer duplication can drift from the check’s `details.peers` again.

**Interpretation 2:** invalidation needs the `OverlapEntry` report, not only check `details`; duplication is justified.

Architecture: I/O is in application via `ChangeRepository` port, not domain. Composition closure is a port implementation for the check — hexagonal-correct.

### D-5 — `core:get-status` references `core:drafted-change-view` without declaring the dependency — **INFO**

GS-4: result MUST satisfy `core:drafted-change-view`. Spec Dependencies list does not include it. Spec-layout hygiene. Same class: `get-status` does not declare `default:_global/architecture` while GS-15 is a composition-wiring requirement.

### D-6 — `LifecycleEngine` is a class; architecture prefers plain functions — **INFO**

Architecture: “Domain operations that are stateless and have no I/O are implemented as plain exported functions … not as classes.” `LifecycleEngine` is a class with an optional `_debug` callback. The change’s own spec names `LifecycleEngine.evaluate` as the public contract. **Change spec wins locally**; note the global tension. `projectArtifacts` as an instance method is the approved pure helper.

### D-7 — Public GetStatus `Blocker` has no `isSkippable` — **INFO**

LE-4 requires `isSkippable` on engine blockers (`LifecycleBlocker` has it). GS-13 says skippable + `bypassFlag` for `impl.linksInScope` / overlap. Public `Blocker` (`get-status.ts:189-200`) has `bypassFlag` only. Tests assert `bypassFlag`, not `isSkippable`. Delivery can infer skippable from `bypassFlag` presence.

**Interpretation 1:** public DTO should mirror engine `isSkippable`.

**Interpretation 2:** `bypassFlag` is the skippable signal for status JSON/text.

### D-8 — GS-13 “MISSING_ARTIFACT for missing **or in-progress**” vs check codes — **INFO** (spec stale vs code)

GS-13 still lists `MISSING_ARTIFACT` for requires that are `missing` **or** `in-progress`. Failed hop predicates MUST appear as `INCOMPLETE_ARTIFACT` (and tests assert that). Engine `workflow.requires` fail codes distinguish missing vs in-progress. When `hasRequiresResult`, engine does not also emit `MISSING_ARTIFACT` for the same artifact (LE-1 verify scenario). GS-13’s first “Missing Artifacts” bullet is a leftover of the pre-check walk.

### Previously closed (not re-opened)

- **D-3 (12:17 HIGH) reload** — closed; see re-verify table.
- **D-4 (12:17) peer drop** — closed.
- **D-1/D-2 (12:17) input contract** — closed.
- **D-8 (12:17) archivable nextAction ungated** — closed (`lifecycle-engine.ts:933-947`).

---

## 4. Test coverage / missing tests

| Requirement                            | Coverage                                                       | Location                                           |
| -------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| GS-9 overlap I/O only when archivable  | ✅ spy not called                                              | `get-status.spec.ts:1049`                          |
| GS-9 archivable live overlap           | ✅ blocker + `--allow-overlap`                                 | `:1064`                                            |
| GS-13 skippable overlap                | ✅                                                             | `:1022`                                            |
| GS-13 victim no `OVERLAP_CONFLICT`     | ✅ review + `/specd-design`                                    | `:981`                                             |
| GS-13 impl bypass narrowing            | ✅                                                             | `:490`, `:546`                                     |
| GS-13 gerund `label`                   | ✅                                                             | `:602`                                             |
| GS-3 304 branches                      | ✅                                                             | `:875+`                                            |
| GS-6 refresh gating                    | ✅                                                             | `:251+`                                            |
| GS-8 passMemo per pass                 | ✅                                                             | `:368`, `:419`                                     |
| GS-12 tasks hide verifying             | ✅                                                             | `:439`                                             |
| GS-4 drafted                           | ✅                                                             | `:777+`                                            |
| GS-14 schema degrade                   | ✅                                                             | `:289`                                             |
| TX-23 `'next'`                         | ✅ implementing→verifying; reject archivable/pending/archiving | `transition-change.spec.ts:184-255`                |
| TX-23 table omits pending-signoff      | ✅                                                             | `change-state.spec.ts:72-79`                       |
| TX-4 post-refresh predicates           | ✅ **new**                                                     | `transition-change.spec.ts:2580`                   |
| TX-1 `allowOutOfScope`                 | ✅ skip links; still fail open files; fail without flag        | `:2599-2637`                                       |
| TC-8 fail-fast vs collect-all          | ✅                                                             | `execute-matching-predicates.spec.ts:43,74`        |
| TC-10 overlap peers in composition     | ✅                                                             | `workflow-check-registry.spec.ts:61-78`            |
| TC-10 omit overlap I/O when flag off   | ✅                                                             | `:80-90`                                           |
| LE-5 archivable nextAction gate        | ✅ (code); dedicated engine test still thin                    | `lifecycle-engine.ts:933-947`                      |
| LE-4 engine `bypassFlags` omit         | ❌                                                             | none                                               |
| GS-15 `includeOverlapDetection`        | ⚠️ source-string only                                          | `composition/use-cases/get-status.spec.ts:108-114` |
| LE-7 verify history→`OVERLAP_CONFLICT` | ❌ (and **must not** be implemented)                           | contradicts LE-4                                   |

### Missing / weak tests

| ID  | Severity | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | **INFO** | GetStatus composition overlap wiring is a `readFileSync` substring check, not an execute against two overlapping archivable fixtures. Deleting the flag fails the string test; renaming the option to a helper would false-fail. Registry test covers the detector, not `resolveGetStatusDeps` end-to-end.                                                                                                                                                        |
| M-2 | —        | **Closed.** Post-refresh `impl.filesResolved` is covered.                                                                                                                                                                                                                                                                                                                                                                                                         |
| M-3 | —        | **Closed.** `allowOutOfScope` on TransitionChange has positive and negative tests.                                                                                                                                                                                                                                                                                                                                                                                |
| M-4 | —        | **Closed.** Peer message + `details.peers` asserted in registry spec.                                                                                                                                                                                                                                                                                                                                                                                             |
| M-5 | **INFO** | No test that `evaluate({ bypassFlags })` omits a skippable injected fail. Would document D-1 either way.                                                                                                                                                                                                                                                                                                                                                          |
| M-6 | —        | **Closed.** `pending-signoff` is in the table test.                                                                                                                                                                                                                                                                                                                                                                                                               |
| M-7 | **INFO** | No dedicated engine test that `archivable` + failed hop predicates keep `nextAction.targetStep === 'archivable'` while still recommending `/specd-archive`. Live overlap is archive-scope, so it does **not** remove `archiving` from `availableTransitions`; nextAction can still be archive while `OVERLAP_CONFLICT` is on public blockers — consistent with skippable `--allow-overlap`, but unstated in LE-5’s “when hop is in availableTransitions” preface. |

---

## 5. Spec dependency chain notes

```
default:_global/architecture
        ▲
core:transition-checks
        ▲
core:lifecycle-engine
        ▲
core:get-status ──► core:transition-change
```

Declared edges (merged Spec Dependencies):

| Spec                     | Depends on                                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-checks` | `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`                                                                                                                                                                           |
| `core:lifecycle-engine`  | `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`, `core:transition-checks`                                                                                                                                                 |
| `core:transition-change` | `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks` |
| `core:get-status`        | `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`                              |

Observations:

- Acyclic and layered to match code: domain matcher/bindings → engine project → use cases execute checks.
- `get-status → transition-change` is declared (shared `CheckResult` shape / `'next'` blast radius). `HAPPY_PATH_NEXT` is public (`src/public.ts`).
- `get-status` does not declare architecture or `drafted-change-view` (D-5).
- **Architecture depth-1:** domain of these specs is I/O-free. Application checks take ports. Composition `detectOverlap` uses `ChangeRepository` (port) not `FsChangeRepository`. Config factories go through `createCompositionResolver`. No hexagonal violation in the assigned files. The remaining smell is application `ArchiveChange` repeating overlap discovery (D-4 INFO), not domain I/O.

---

## 6. Summary counts

| Metric               | Count                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements audited | 61 (13 TC + 9 LE + 15 GS + 24 TX) + architecture depth-1                                                                                                                                                         |
| **Compliant**        | 55                                                                                                                                                                                                               |
| **HIGH**             | **0**                                                                                                                                                                                                            |
| **MEDIUM**           | **2** — D-1 (`bypassFlags` dead), D-2 (verify.md vs LE-4 overlap)                                                                                                                                                |
| **INFO**             | **6** — D-3 identity `_resolveTarget`, D-4 archive overlap duplicate, D-5 undeclared deps, D-6 engine class vs pure-fn rule, D-7 public `isSkippable`, D-8 GS-13 MISSING wording; plus M-1/M-5/M-7 coverage nits |

### Recorte-26 / 12:17 verdict

1. **Reload after refresh:** **fixed** in code and tests. Prior HIGH is closed.
2. **`includeOverlapDetection`:** still wired; composition GetStatus test is a source-string guard (INFO), registry test covers peers.
3. **`spec.overlap` peer names:** **fixed** and tested.
4. **Input contract `'next'` / `allowOutOfScope`:** **fixed** in merged spec, types, verify, and core tests.
5. **Live `OVERLAP_CONFLICT` only in `archivable`:** still compliant.
6. **`HAPPY_PATH_NEXT` / `pending-signoff`:** table test now includes `pending-signoff`.

Open MEDIUM work is documentation/API residue (`bypassFlags`, verify.md history scenario), not the execute/status divergence that motivated the change.
