# Specs-compliance — change `workflow-transition-checks`

- **Mode:** specific change (re-audit after sealed archive `dependsOn`, new-spec extract, GetStatus overlap, TransitionChange reload, CLI test layout, validate-artifacts permissive)
- **Date:** 2026-08-28 13:45 (`TIMESTAMP=20260828-134518`)
- **State at audit:** `designing` (`specs` drifted-pending-review: `core:transition-change`; verify/design/tasks pending-review)
- **Graph:** `graph index --force` failed (`graph-index worker exited unexpectedly`) after schema 5 vs 9. Subagents still ran `graph search` successfully for key symbols; otherwise Read/Grep.
- **Read-only:** no source or spec files were modified for this audit.

## Executive verdict

The two previous **must-fix HIGHs from recorte-26 / 12:17** on this change’s core path are **closed**:

1. **TransitionChange stale `Change` after refresh** — reloads after `RefreshImplementationTracking`; test mutates tracked files inside the refresh stub.
2. **Archive `resolveInitialPersistedDependsOn` bypass** — `resolveSealedArchiveDependsOn` is plan → lock → on-disk `resolveInitial` (no `explicitDependsOn`) → new-spec merge-extract / `[]`. `metadata.json` is not a fallback. Archive `deps.consistent` uses the same sealed set.

**ValidateArtifacts H1 (strict vs permissive)** is **closed by spec correction**: partial extract bags use `permissiveSpecMetadataSchema`; `strictSpecMetadataSchema` remains write-only. Named test matches.

**CLI leftover HIGH** (artifact-drift tests in `change.spec.ts`) is **closed**. Tests live in `change/status.spec.ts`.

The remaining **HIGH** is **H2 drift ownership**: policy-aware baseline drift is still specified on `ValidateArtifacts` and still implemented in `FsChangeRepository.get()` (`SYSTEM_ACTOR`). That is a spec-vs-spec / layering issue, not a regression of the sealed-dependsOn work.

## Recorte / follow-up checklist

| Item                                               | Verdict                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| GetStatus `includeOverlapDetection: true`          | **Compliant** (composition test is a source-string guard — INFO)          |
| Live `OVERLAP_CONFLICT` only in `archivable`       | **Compliant**                                                             |
| Invalidation overlap → review `/specd-design`      | **Compliant**                                                             |
| `to: 'next'` + reject pending/archivable/archiving | **Compliant**                                                             |
| `allowOutOfScope` skips links, not open files      | **Compliant** + TransitionChange tests                                    |
| TransitionChange reload after refresh              | **Fixed**                                                                 |
| Archive sealed `dependsOn` + hasher                | **Fixed**                                                                 |
| New spec lock gets extract `dependsOn`             | **Compliant** + tests                                                     |
| ValidateArtifacts permissive extract               | **Fixed** (spec + code + named test)                                      |
| Leftover CLI drift tests in `change.spec.ts`       | **Fixed** (file still duplicates non-drift status/transition tests — LOW) |
| Policy-aware drift on ValidateArtifacts            | **Still HIGH (H2)**                                                       |

## Highest-priority findings

Must-fix if you want validate-artifacts as written:

1. **HIGH — H2 drift ownership** (`_partial-rest`). Either implement baseline drift in `ValidateArtifacts` and stop duplicating it on `get()`, or move the requirement to `core:storage` and drop those validate-artifacts verify scenarios.

Next (this change’s remaining quality, not execute/status divergence):

2. **MEDIUM — lock-without-plan keep-lock** has no verify scenario / test (`_partial-archive-hooks` D3). Highest leftover regression risk for sealed `dependsOn`.
3. **MEDIUM — `graph.excludePaths` ignored** when materializing implementation links.
4. **MEDIUM — `LifecycleEngine.bypassFlags` never applied** (checks already `skip`; dead option).
5. **MEDIUM — lifecycle-engine verify.md** still expects `OVERLAP_CONFLICT` from history (contradicts spec.md LE-4).
6. **MEDIUM — CLI** prints any Core `OVERLAP_CONFLICT` blocker (tests mock empty blockers).
7. **MEDIUM — hasher vs contentHasher**, `templates:` vs `templateExpander`, rules `text` vs `instruction`.

## Aggregate counts (from partials; some overlap)

| Batch          | Compliant (approx)               | HIGH | MEDIUM | Notes                        |
| -------------- | -------------------------------- | ---- | ------ | ---------------------------- |
| core-lifecycle | 55 / 61                          | 0    | 2      | Prior HIGH reload closed     |
| archive-hooks  | sealed 11/12 + hooks/gates match | 0    | 2      | D3 test gap; excludePaths    |
| cli            | 46 / 47                          | 0    | 2      | Prior drift-test HIGH closed |
| rest           | ~22 confirmed / ~55 reviewed     | 1    | 7      | H2 only remaining HIGH       |

Partial files (source of truth for detail) remain in this directory:

- `_partial-core-lifecycle.md`
- `_partial-archive-hooks.md`
- `_partial-cli.md`
- `_partial-rest.md`

## Suggested next work

1. Decide H2: storage-owned drift vs ValidateArtifacts-owned drift; one owner.
2. Add archive test: lock exists, no `specDependsOn`, extract differs → lock kept, `resolveInitial` not called, `deps.consistent` fails against **lock**.
3. Implement or descope `graph.excludePaths` on archive materialization.
4. Repair lifecycle-engine verify _Overlap conflict detection from history_.
5. Optional: required `ContentHasher` on `ArchiveChange` ctor; `createDepsConsistent` archive vs ready unit test; permissive Zod unit tests.

---

## Detailed findings

The four partial reports follow verbatim.

### Partial: core-lifecycle

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

### Partial: archive-hooks

# Partial Compliance Report — Archive & Hooks

**Change:** `workflow-transition-checks`  
**Mode:** assigned-spec batch (read-only)  
**Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`  
**Graph:** `graph search "resolveSealedArchiveDependsOn"` succeeded (index usable for this symbol); no `index --force` in this pass.  
**Previous HIGH D1 (re-verify):** Archive sealed `dependsOn` allegedly used a private fallback (manifest → lock → `metadata.json` → extract) instead of `resolveInitialPersistedDependsOn` for lock-less on-disk specs.

---

## 1. Requirements

### 1.1 `core:archive-change` — spec-lock sealed `dependsOn` (FOCUS)

Merged spec (Purpose + spec-lock requirement) requires this **sealed** precedence for one archive attempt, matching the auditor’s intended list:

1. If `change.specDependsOn` has an entry for the spec → that publication-plan snapshot is the sealed set. **Do not** call `resolveInitialPersistedDependsOn()`. `explicitDependsOn` MUST NOT be used as a passthrough for the plan.
2. Else if a lock exists → sealed set is the lock’s `dependsOn` (re-archive with no snapshot keeps the sidecar).
3. Else if `SpecRepository.get` finds the spec on disk → call `resolveInitialPersistedDependsOn()` **without** `explicitDependsOn` (legacy / never-initialized canonical spec). ContentHasher is injected so this call can run.
4. Else (new spec, `get` returns null) → merge-extract `dependsOn` from artifacts being published, or `[]` when extract yields nothing. **Do not** call `resolveInitialPersistedDependsOn()`.

Further constraints:

- Merge-extract is the `deps.consistent` **guard** against the sealed set. It MUST NOT replace a lock or an on-disk `resolveInitialPersistedDependsOn()` result.
- Cached `metadata.json` MUST NOT be a fallback source for the sealed set.
- When no lock exists, base is `{ kind: 'initial', schema: <effective identity>, dependsOn: <sealed set> }`.
- Patch via shared `applyPersistedSpecStatePatch`; persist via `SpecRepository.publish({ persistedState, ... })` only — no separate `writePersistedState()` from the use case.
- Archive `deps.consistent` persisted facts MUST be this **sealed** set, not enter-ready manifest-only (`change.specDependsOn`). Enter-ready remains extract vs `change.specDependsOn`.
- Same runner: `runDepsConsistent`.
- MUST NOT register `archive.publication` on the binding table; remaining merge/publish preflight stays inside `ArchiveChange`.
- Extracted vs sealed mismatch → `ArchiveDependencyMismatchError` via `deps.consistent`.
- `ContentHasher` injected; hexagonal: no `NodeContentHasher` in the application use case.
- Verify scenarios (spec-lock): first archive with plan; re-archive refreshes `dependsOn` from plan; **No-lock → resolveInitial without explicitDependsOn / no metadata.json / no merge-extract as sealed**; publication plan skips resolveInitial; new spec extracted; new spec empty `[]`.

### 1.2 `core:archive-change` — related archive operation (assigned look-ats)

- `allowOverlap` / `allowOutOfScope` on input; overlap skippable; impl.linksInScope skippable.
- `skipHookPhases`: `'pre' | 'post' | 'all'`.
- Effects selected by binding **phase** (`before-persist` / `after-persist`), not by `check.id`.
- Default bindings: `hook.pre` abort / before-persist; `hook.post` collect / after-persist.
- Shared runners with enter-ready / implementing for overlap, readOnly, deps, impl files/links.

### 1.3 `core:hook-execution-model`

- `instruction:` never executed; `run:` via `RunStepHooks` as constructor dep of hook checks.
- `ArchiveChange` MUST NOT branch on `hook.pre` / `hook.post` ids for timing, failure policy, skip mapping, or launching `RunStepHooks`.
- `skipHookPhases` selects by binding phase **plus** archive selectors `pre`/`post`/`all`.
- Pre fail-fast (no file mods); post `collect` continues; `onFailure` from binding.

### 1.4 `core:workflow-model` (archive slice)

- Archiving is deterministic `ArchiveChange`, not agent-interactive.
- Archive `run:` hooks are operation `archive`, not a lifecycle `along`.
- Auto-execute operation-archive effects according to binding `phase` / `onFailure`.

### 1.5 `core:change` (gate/drain slice only)

- `pending-spec-approval` / `pending-signoff` remain drain states.
- New transitions MUST NOT enter `pending-spec-approval` from `ready` or `pending-signoff` from `done`.
- `VALID_TRANSITIONS['ready']` = `implementing`, `designing` only.
- `VALID_TRANSITIONS['done']` includes `archivable`, `designing`, `implementing`, `verifying` (no `pending-signoff`).
- Drain: `pending-spec-approval` → `spec-approved` | `designing`; `pending-signoff` → `signed-off` | `designing`.

### 1.6 `core:approve-spec` / `core:approve-signoff`

- Gate baked at construction; first step, no I/O if disabled.
- Happy path: record event, stay in `ready` / `done`; do not transition into pending or `spec-approved` / `signed-off`.
- Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`.
- Config factory via `resolveApprove*Deps` including `contentHasher`.

---

## 2. Implementation

### 2.1 Sealed resolver (previous HIGH D1)

`packages/core/src/application/services/resolve-sealed-archive-depends-on.ts` (`resolveSealedArchiveDependsOn`, lines 43–78):

```
manifest = change.specDependsOn.get(specId)
  if defined → return copy; no resolveInitial
if persistedDependsOn !== null → return lock dependsOn
onDisk = specRepo.get(capPath)
  if null → extractedDependsOn copy or []
  if hasher undefined → throw (lock-less on-disk requires ContentHasher)
  else resolveInitialPersistedDependsOn(..., no explicitDependsOn)
```

This matches the intended sealed list. Merge-extract is **only** the last branch. `metadata.json` is not read. `explicitDependsOn` is never passed (archive-change.spec asserts `explicitDependsOn === undefined` on the no-lock spy).

`resolveInitialPersistedDependsOn` (`packages/core/src/application/use-cases/resolve-initial-persisted-depends-on.ts`) reads **canonical spec-scoped artifacts** via `specRepo.artifact` (schema `scope === 'spec'`), then `extractMetadataFromSpecArtifacts`. It does not read `metadata.json`. If `get` is null it throws `SpecNotFoundError` — which is why new specs must not call it (sealed helper avoids that).

### 2.2 Archive publication preflight

`ArchiveChange._prepareSpecPublicationPreflight` (`archive-change.ts` ~837–853) calls `resolveSealedArchiveDependsOn` with:

- `persistedDependsOn` from `specRepo.readPersistedState` (`spec-lock.json`, not metadata)
- `extractedDependsOn` from merge-extract of **prepared** artifacts (`_buildFinalSpecArtifactsForExtraction`)

`readPersistedState` in fs adapter (`spec-repository.ts:518–521`) uses `_readSpecLock` only.

Use case never calls `writePersistedState`; it calls `publish(..., { persistedState })` when sidecar is active (`archive-change.ts:438–444`).

### 2.3 Archive `deps.consistent` facts

`createDepsConsistent` (`deps-consistent.ts:59–68`):

- Always loads `loadReadyPredicateFacts` for **extracted** maps (change-dir / canonical fallback via `extractDependsOnForSpec`).
- If `ctx.attempt.scope === 'archive'`, **replaces** persisted map with `loadArchiveSealedDependsOnBySpecId`.
- Else uses enter-ready manifest-only `facts.persistedDependsOnBySpecId` (`ready-predicate-facts.ts:73–76`).
- Invokes `run` from `domain/checks/deps-consistent.js`, which is `runDepsConsistent`.

`loadArchiveSealedDependsOnBySpecId` (`ready-predicate-facts.ts:109–158`) uses the **same** `resolveSealedArchiveDependsOn` (plan → lock → resolveInitial / extract). Hasher comes from `ReadyPredicateFactsDeps.hasher`.

Second evaluation: `_assertArchiveDepsConsistent` (`archive-change.ts:1126–1154`) builds maps from preflight `finalDependsOn` + extract when `sidecarActive`, then `runDepsConsistent` re-exported from `evaluate-transition-predicates.ts` (same domain function: `export { runDepsConsistent } from '../checks/deps-consistent.js'`).

Named-check failure maps to `ArchiveDependencyMismatchError` in `throwMappedArchiveFailure` (`archive-change.ts:1311–1329`).

### 2.4 Hasher / hexagonal wiring

- Application `ArchiveChange` takes `ContentHasher | undefined`; composition `resolveArchiveChangeDeps` sets `contentHasher: resolver.getContentHasher()` and passes it as the last ctor arg (`composition/use-cases/archive-change.ts:149, 204`).
- `resolveWorkflowCheckRegistry` sets `readyFacts.hasher: resolver.getContentHasher()` (`workflow-check-registry.ts:29–35`) so archive `deps.consistent` can call resolveInitial.
- `NodeContentHasher` is constructed in `composition-resolver.ts` (~640), not in `application/use-cases/archive-change.ts`.
- Test helper `newArchiveChange` always passes `makeContentHasher()` (`helpers.ts:981`). Test `makeArchiveBindings` also sets `readyFacts.hasher`.

### 2.5 Bindings, overlap, hooks, publication check

`ARCHIVE_BINDING_SPECS` (`check-bindings.ts:84–94`): `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`, `hook.pre` (before-persist, abort), `hook.post` (after-persist, collect). **No** `archive.publication`. Domain test asserts absence (`transition-checks.spec.ts:390–391`).

`ArchiveChange.execute`:

- Passes `allowOverlap` / `allowOutOfScope` into `buildCheckExecutionContext`.
- Predicates via `executeMatchingPredicates`.
- Effects via `matchingEffects(..., 'before-persist' | 'after-persist')` — selection by **binding.phase**, not `check.id` (ids only appear in debug logs).
- `skipHookPhases` copied onto effect context; skip implemented in `HookEffectCheck.execute` (`hook-effect.ts:133–149`) using archive selectors `all` / `pre` / `post` mapped to the check’s RunStepHooks phase (`pre`/`post`), not by branching in the use case on `hook.pre`/`hook.post`.
- `onFailure` via `hookFailureMode(binding.onFailure)` (`execute-hook-effect.ts`).
- `RunStepHooks` is a ctor dep of `createHookPre` / `createHookPost`, not launched from `ArchiveChange` by check id.

### 2.6 Gate/drain

`VALID_TRANSITIONS` (`change-state.ts:30–43`) matches the change-spec slice.

`ApproveSpec` / `ApproveSignoff`: gate first; record on `ready`/`done` without transitioning; drain pending → approved/signed-off; factories `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` include `contentHasher`.

---

## 3. Discrepancies (D1… numbered)

### D1 — previous HIGH (private fallback / metadata.json) — **RESOLVED (INFO residual)**

- **Severity:** INFO (re-verify of former HIGH)
- **Evidence:** `resolve-sealed-archive-depends-on.ts:46–77`; `resolve-initial-persisted-depends-on.ts:71–86`; `ready-predicate-facts.ts:139–153`; `archive-change.ts:825–853`; fs `readPersistedState` → spec-lock only.
- **Spec:** plan → lock → on-disk resolveInitial → new-spec extract/`[]`; no `metadata.json`.
- **Code:** implements that list. Manifest is only step 1 (`specDependsOn`). Lock is `persistedDependsOn !== null`. Extract is last. No metadata sidecar in this path.
- **Verdict:** **Code matches merged spec.** Former “manifest → lock → metadata.json → extract” private fallback is **gone**.

### D2 — Verify.md duplicate empty heading for No-lock scenario

- **Severity:** INFO
- **File:** merged `core:archive-change` verify (preview ~1082–1084): two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings, first empty.
- **Spec-wrong vs code-wrong:** **spec-wrong** (hygiene). Code/tests implement the second, filled scenario.
- **Fix:** delete the empty duplicate heading in the change delta.

### D3 — Lock-without-plan keep-lock has requirement text but no verify scenario

- **Severity:** MEDIUM (spec completeness + tests; see §4)
- **Spec:** “Else if a lock exists, the sealed set is the lock's `dependsOn` (re-archive with no snapshot keeps the sidecar).”
- **Verify.md:** has re-archive **with** `specDependsOn` refresh; **no** scenario “lock exists, no `specDependsOn` entry, extract differs, lock wins / resolveInitial not called / extract not sealed.”
- **Code:** `resolve-sealed-archive-depends-on.ts:50–52` implements keep-lock.
- **Spec-wrong vs code-wrong:** **spec incomplete** (requirement without scenario). Code is aligned with the requirement paragraph.
- **Fix:** add verify scenario + test (see §4). Not an implementation bug.

### D4 — Dual extract pipelines for `deps.consistent` vs sidecar preflight

- **Severity:** INFO
- **Files:** `deps-consistent.ts:60–68` + `ready-predicate-facts.ts:173–224` vs `archive-change.ts:_buildFinalSpecArtifactsForExtraction` + `_assertArchiveDepsConsistent`.
- **Spec:** named archive `deps.consistent` persisted facts = sealed set; extract vs sealed; remaining sidecar consistency also compares extract of prepared merged artifacts to sealed set **inside** `ArchiveChange`.
- **Code:** both use `runDepsConsistent` and sealed persisted. **Extract sources differ:** named check uses `extractDependsOnForSpec` (change tracked files + delta merge + canonical fallback); preflight uses staged publication writes. Safer if they disagree (preflight can still fail). Risk: named check could fail first on change-dir extract while sealed/preflight extract would agree, or the reverse.
- **Spec-wrong vs code-wrong:** **neither clearly wrong** — spec allows both the named check and in-use-case preflight. Worth documenting that extract must be the same merge-extract of artifacts being published if operators expect one comparison.
- **Fix (optional):** feed named-check extract from the same prepared artifact set, or drop `_assertArchiveDepsConsistent` if the named check is defined to be that comparison (would require running predicates after plan prepare — larger sequencing change).

### D5 — `ArchiveChange` hasher is optional on the application constructor

- **Severity:** INFO
- **File:** `archive-change.ts:202, 234` (`hasher?: ContentHasher`); throw at `resolve-sealed-archive-depends-on.ts:58–59` if missing on lock-less on-disk.
- **Spec:** “ContentHasher is injected”.
- **Code:** composition **does** inject (`archive-change.ts` composition + tests). Application type still allows omitting it.
- **Spec-wrong vs code-wrong:** **mild code looseness**. Not a production wiring bug.
- **Fix:** make hasher required on `ArchiveChange` ctor to match `ArchiveChangeDeps.contentHasher`.

### D6 — `graph.excludePaths` not applied when materializing implementation links

- **Severity:** MEDIUM (out of spec-lock FOCUS but in assigned `archive-change`)
- **File:** `archive-change.ts:_materializeImplementationLinks` ~1189–1204 (comments: skip exclusion check).
- **Spec:** “Excluded path is ignored during sidecar materialization” — confirmed link under `graph.excludePaths` is skipped without failing archive.
- **Code:** no `excludePaths` filter; links are always materialized if inside `codeRoot`.
- **Spec-wrong vs code-wrong:** **code-wrong** if the merged spec is intended; alternatively spec-wrong if this iteration deferred graphConfig on `ProjectWorkspace` (comments argue that).
- **Fix:** either implement skip using project graph config, or amend spec/verify to “not in this iteration.”

### D7 — Weak “same runner” assertion in mismatch test

- **Severity:** INFO (tests, not runtime)
- **File:** `archive-change.spec.ts:889–906` — spies `transitionPredicates.runDepsConsistent` then `expect(typeof runDepsConsistent).toBe('function')` without `toHaveBeenCalled()`.
- **Spec:** “the same runner is `runDepsConsistent`.”
- **Code:** both paths call it; test does not prove the spy.
- **Spec-wrong vs code-wrong:** **test-wrong** (coverage), implementation OK.

### Compliant (no discrepancy)

| Area                                                                                      | Status              |
| ----------------------------------------------------------------------------------------- | ------------------- |
| Sealed precedence vs merged spec                                                          | Match (D1 resolved) |
| `explicitDependsOn` unused for plan                                                       | Match               |
| `metadata.json` not a sealed fallback                                                     | Match               |
| Merge-extract does not replace lock / resolveInitial                                      | Match               |
| Archive `deps.consistent` persisted = sealed (`loadArchiveSealedDependsOnBySpecId`)       | Match               |
| Enter-ready persisted = `specDependsOn` only                                              | Match               |
| Shared `runDepsConsistent` identity (domain `deps-consistent.ts`; re-export; `run` alias) | Match               |
| `archive.publication` absent                                                              | Match               |
| `allowOverlap` / `allowOutOfScope` on attempt context                                     | Match               |
| Effect timing by `matchingEffects(..., phase)`                                            | Match               |
| `skipHookPhases` pre/post/all in hook check                                               | Match               |
| `NodeContentHasher` not imported by archive use case                                      | Match               |
| Registry hasher for archive deps                                                          | Match               |
| `VALID_TRANSITIONS` ready/done/drain                                                      | Match               |
| ApproveSpec/Signoff stay in ready/done; drain pending                                     | Match               |

---

## 4. Test coverage / missing tests

### 4.1 Sealed dependsOn (FOCUS) — present

| Scenario                                                                  | Test                                     | Notes                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| No-lock on-disk → resolveInitial, no `explicitDependsOn`                  | `archive-change.spec.ts:450–548`         | Spy + lock `dependsOn` equals extract from disk content                      |
| Publication plan skips resolveInitial                                     | `:550–610`                               | `setSpecDependsOn` → lock is plan list; spy not called                       |
| New spec extracted                                                        | `:612–704`                               | empty repo; spy not called; lock = extract                                   |
| New spec empty `[]`                                                       | `:706–758`                               | no metadataExtraction; spy not called; `dependsOn: []`                       |
| Re-archive with plan refreshes dependsOn, keeps schema                    | `:760–820`                               |                                                                              |
| Extract vs sealed mismatch → `ArchiveDependencyMismatchError`, no publish | `:822–912`                               | uses **plan vs extract**; does not prove lock/resolveInitial sealed mismatch |
| Batch later-spec preflight blocks earlier publish                         | `:914+`                                  |                                                                              |
| `archive.publication` absent                                              | `transition-checks.spec.ts:390–391`      |                                                                              |
| `createArchiveChange` resolves `contentHasher`                            | `composition/.../archive-change.spec.ts` |                                                                              |

### 4.2 Missing / weak (FOCUS)

1. **Lock exists, no `specDependsOn` entry:** lock `dependsOn` kept; `resolveInitial` **not** called; merge-extract **not** written even if artifacts disagree (then `deps.consistent` should fail comparing extract to **lock**, not to extract). **No test.** Highest remaining gap for D1 regression.
2. **Lock exists, extract agrees with lock, no plan:** archive succeeds; lock unchanged except implementation/schema rules. **No dedicated test.**
3. **`metadata.json` present with different `dependsOn`:** sealed must ignore it (spec AND “does not read cached metadata.json”). **No test** that plants `metadata.json` and asserts lock/resolveInitial win.
4. **Named archive `deps.consistent` uses sealed facts vs enter-ready manifest:** unit test of `createDepsConsistent` with `scope: 'archive'` vs `to: 'ready'` not found in this batch (logic is in `deps-consistent.ts` + `loadArchiveSealedDependsOnBySpecId`). **Missing check-level test.**
5. **Same `runDepsConsistent` identity:** spy `toHaveBeenCalled()` not asserted (D7).
6. **Hasher required:** no test that lock-less on-disk throws if hasher omitted (ctor still optional).
7. **No isolated `resolve-sealed-archive-depends-on` spec file** under `packages/core/test` (Glob `**/*sealed*` empty) — coverage is only via `ArchiveChange` integration tests.

### 4.3 Hooks / flags (assigned look-ats) — present

- `skipHookPhases` all / pre / post: `archive-change.spec.ts` ~1735–1910.
- `allowOverlap` proceed + invalidate: ~2955–3070.
- `allowOutOfScope` publish vs fail: ~3152–3250.
- `matchingEffects` archive before/after persist: `matching-effects.spec.ts`.

### 4.4 Gate/drain — present

- `change-state.spec.ts`: `VALID_TRANSITIONS['ready']`, no `ready → pending-spec-approval`.
- `approve-spec.spec.ts` / `approve-signoff.spec.ts`: stay in ready/done; drain pending.
- `transition-change.spec.ts`: reject targeting pending; drain hops.

### 4.5 Hook-execution / workflow-model archive slice

Covered by archive hook tests + matchingEffects. Transition skip selectors (`source.pre` no-op) live in `transition-change.spec.ts` (out of this file’s FOCUS but related).

---

## 5. Summary counts

| Spec                                                      | Requirements sampled | Match |                                        Discrepancies |                                  Missing/weak tests |
| --------------------------------------------------------- | -------------------: | ----: | ---------------------------------------------------: | --------------------------------------------------: |
| `core:archive-change` (spec-lock + deps.consistent FOCUS) | 12 sealed/deps rules |    11 | D2 INFO, D3 MEDIUM (spec), D4 INFO, D5 INFO, D7 INFO |                                       6 gaps (§4.2) |
| `core:archive-change` (hooks/flags/impl extras)           |                    8 |     7 |                           D6 MEDIUM (`excludePaths`) | excludePaths scenario untested (code skips feature) |
| `core:hook-execution-model` (archive)                     |                    8 |     8 |                                                    0 |                     adequate for archive skip/phase |
| `core:workflow-model` (archive slice)                     |                    3 |     3 |                                                    0 |                                                   — |
| `core:change` (gate/drain / VALID_TRANSITIONS)            |                    5 |     5 |                                                    0 |                                             covered |
| `core:approve-spec`                                       |                    8 |     8 |                                                    0 |                                             covered |
| `core:approve-signoff`                                    |                    8 |     8 |                                                    0 |                                             covered |

**Severity totals (this batch):** HIGH **0** · MEDIUM **2** (D3 spec/test gap; D6 excludePaths) · INFO **4** (D1 resolved residual, D2, D4, D5, D7 — D1 counted as INFO residual)

**Critical re-verify:** former HIGH D1 **does not reproduce**. Sealed precedence in `resolveSealedArchiveDependsOn` matches the merged spec and the intended 1–4 list. `metadata.json` is not a fallback. Archive `deps.consistent` persisted facts go through `loadArchiveSealedDependsOnBySpecId` → same helper. `runDepsConsistent` is shared. Hasher is injected at composition; `NodeContentHasher` stays out of the application use case.

**Highest leftover risk:** no test that a **lock without a publication-plan snapshot** is kept (and that extract/`metadata.json` cannot replace it) — regression of D1 could land again without that case.

### Partial: cli

# Partial Compliance Report — CLI

Audit scope: change `workflow-transition-checks`, specs `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`.

Graph: one `graph search` succeeded (index present; prior instruction said unavailable). Navigation still used Read/Grep on `packages/cli/src/commands/change/` and `packages/cli/test/commands/change/`. Spec content from `changes spec-preview`. No source or spec files were modified.

---

## 1. Requirements

### cli:change-status (16 requirements)

| Requirement                             | Intent                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Command signature                       | `change status <name> [--format text\|json\|toon]`; optional `--implementation`                                              |
| Drafted change status is read-only      | Render `draftView` without mutating transitions; mark drafted                                                                |
| Output format                           | JSON/TOON `artifactDag[].hasTasks`; DAG `state` is display projection                                                        |
| Task completion display in DAG          | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                                             |
| Display-state rendering                 | `complete-with-drift`; JSON has canonical + display                                                                          |
| Lifecycle projections from GetStatus    | Pass through `availableTransitions` / `nextAction`; no local `VALID_TRANSITIONS` filter                                      |
| Text omits duplicated review file lists | `review:` header without `affectedArtifacts` paths; overlap peers still printed; no `OVERLAP_CONFLICT` line                  |
| Text blockers include check labels      | `! CODE — label: message` when `label` present                                                                               |
| Schema version warning                  | stderr warning from `lifecycle.schemaInfo`; skip if null; exit 0                                                             |
| Change not found                        | exit 1, `error:`                                                                                                             |
| Schema-derived fields                   | nested `schema.artifactDag` via `childrenOf`/`topologicalOrder`; text DAG uses roots/children; no duplicate convergent nodes |
| Delegates refresh to GetStatus          | no direct Refresh/ImplementationDetector                                                                                     |
| Implementation section                  | `--implementation` via `sdk:build-implementation-review`                                                                     |
| Task completion in details              | `tasks: N/M`                                                                                                                 |
| Basic info                              | name + state; no standalone `specs:` list                                                                                    |
| Specs and dependencies                  | text section + JSON `specDependsOn`                                                                                          |

### cli:change-transition (14 requirements)

| Requirement                   | Intent                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Command signature             | `<name> <step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope`; formats      |
| Next-transition resolution    | `to: 'next'` to Core; no CLI from→to table; Core rejection → exit 1 + explanation |
| Delegates refresh             | pre/post GetStatus with `refreshImplementationTracking: false`                    |
| Approval-gate routing         | no gate flags; do not rewrite implementing/archivable to pending states           |
| Hook execution                | map `--skip-hooks` to `skipHookPhases`                                            |
| Progress output               | generic check bus; stream `change-transition`; never `hook-progress`              |
| Transition hook observability | progress visible before hook failure                                              |
| Shared hook progress          | transition uses check presenter                                                   |
| Output on success             | text confirmation; JSON terminal `complete` record                                |
| Post-hook failure             | exit 2, `error:`; no post-transition warning state                                |
| Invalid transition error      | exit 1; Repair Guide on stderr; HookFailedError is exit 2 without guide           |
| Incomplete tasks              | exit 1 naming artifact                                                            |
| Check progress rendering      | gerund `(id)` then ✓/✗; no `Executing:`                                           |
| Unsatisfied requires          | surface requires blocker; repair from GetStatus                                   |

### cli:change-approve (7 requirements)

| Requirement               | Intent                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Command signatures        | `approve spec\|signoff <name> --reason`                                       |
| Delegates gate state      | `{ name, reason }` only; `kernel.changes.approve*` not `kernel.specs.*`       |
| Artifact hash computation | CLI never computes/passes hashes                                              |
| Approve spec behaviour    | valid from `ready` (drain `pending-spec-approval`); no printed hop to pending |
| Approve signoff behaviour | valid from `done` (drain `pending-signoff`); bound-`from` help                |
| Output on success         | `approved <gate> for <name>` / JSON `{ result, gate, name }`                  |
| Error cases               | missing reason, wrong state, not found → exit 1                               |

### cli:change-archive (10 requirements)

| Requirement                  | Intent                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Command signature            | `changes archive` + `change` alias; `--skip-hooks pre\|post\|all`; `--allow-overlap`; `--allow-out-of-scope` |
| Prerequisites                | must be `archivable`; else exit 1 naming state                                                               |
| Behaviour                    | delegate `ArchiveChange`                                                                                     |
| Hook execution               | skip-hooks → archive phase set                                                                               |
| Check progress rendering     | same gerund bus as transition; stream `change-archive`                                                       |
| Post-archive hooks           | failures → exit 2                                                                                            |
| Output on success            | archive path; omit invalidated section when empty                                                            |
| Output on success (extended) | invalidated list when overlap occurred                                                                       |
| JSON output on success       | NDJSON `stream: change-archive` complete record only                                                         |
| Error cases                  | not found / not archivable / merge fail → exit 1                                                             |

---

## 2. Implementation

### Shared wiring

`packages/cli/src/index.ts` registers all four commands on `program.command('changes').alias('change')`, so singular `change` and plural `changes` share handlers.

### `status.ts`

- Calls `kernel.changes.status.execute({ name })` only (default refresh). No `RefreshImplementationTracking` / `ImplementationDetector` in CLI src.
- Draft path: `(drafted)` in text, `isDrafted: true` in JSON, `transitions: (none — change is drafted)`.
- Active text: DAG from `getActiveSchema` + `schema.artifactDag()` when not `raw`, else `ArtifactDag.from(schemaInfo.artifacts)`.
- Display status used for DAG symbols and details lines; JSON `artifactDag[].state` uses `displayStatus`.
- Review header prints `required` / `route` / `reason` / `message`; never dumps `affectedArtifacts` paths. Overlap peers rendered in `overlap:` when `reason === 'spec-overlap-conflict'` and `overlapDetail.length > 0`.
- Blockers: `! CODE — label: message` when `label` is set.
- `--help` JSON schema lists `review.overlapDetail` beside `affectedArtifacts`.
- `--implementation` uses `enrichImplementationTracking` → `buildImplementationReview` (SDK), not extra graph matching.

### `transition.ts`

- `--next` sets `to: 'next'`. `CHANGE_STATES` is argument validation only (known state names), not a from→to routing table. No `GetStatus.nextAction` used to pick the hop.
- `--allow-out-of-scope` spreads `allowOutOfScope: true` only when the flag is set; omitted otherwise. Help text says it applies to `impl.linksInScope`.
- Execute input has `skipHookPhases`; no approval flags.
- Pre-transition and repair GetStatus both use `refreshImplementationTracking: false`.
- Progress via `createCheckProgressPresenter({ streamName: 'change-transition' })`.
- Repair guide on `InvalidStateTransitionError` / workspace / archive-impl errors. `HookFailedError` falls through to `handleError` (exit 2). `HappyPathNextUnavailableError` also uses `handleError` (exit 1) so Core’s explanation is printed.

### `approve.ts`

- `kernel.changes.approveSpec.execute({ name, reason })` and `approveSignoff` with the same shape.
- Help: spec gate “in ready (pending-spec-approval remains valid for drain)”; signoff “in done (pending-signoff remains valid for drain)”.

### `archive.ts`

- Forwards `skipHookPhases`, `allowOverlap`, `allowOutOfScope` only when flags are set.
- Check presenter stream `change-archive`.
- Post-hook failures: `cliError(..., 2)` before success output.
- Text invalidated section only if `invalidatedChanges.length > 0`.
- JSON: single terminal `{ stream: 'change-archive', event: { type: 'complete', result } }`.
- `SpecOverlapError` suggests `--allow-overlap`.

---

## 3. Discrepancies

### Re-verify previous HIGH — leftover artifact-drift tests

**Resolved (no longer HIGH).**

- `packages/cli/test/commands/change/status.spec.ts` owns `describe('artifact-drift review rendering')` (text omits review file paths; JSON keeps `affectedArtifacts`).
- `packages/cli/test/commands/change.spec.ts` has **zero** `artifact-drift` matches.
- The leftover file still exists because it also covers list/create/draft/discard **and** still duplicates a subset of status/transition tests (missing name, JSON schema, invalid transition, hook fail). That is duplication, not the prior HIGH (drift tests left in the monolith).

**Spec vs code:** leftover deletion was an expected test-layout cleanup, not a product spec. Code/spec for drift rendering live in `status.ts` + `status.spec.ts`.

### `--next` is not a local table — compliant

`requestedTarget = opts.next === true ? 'next' : step`. Tests assert `to: 'next'` for ready, signed-off, and failure states. CLI does not map pending-signoff locally.

### `HAPPY_PATH_NEXT` / pending-signoff — compliant

`--next` from `pending-signoff` mocks `HappyPathNextUnavailableError('pending-signoff')` and expects stderr `/waiting for human signoff/`, plus pending-spec-approval and archivable. Matches “when Core rejects `to: 'next'` … explanatory `error:`”.

### `--allow-out-of-scope` — compliant (transition + archive)

Transition and archive both optional-spread `allowOutOfScope: true`. Tests: forwarded when set, omitted when unset. Transition help correctly limits the flag to `impl.linksInScope` (does not claim `impl.filesResolved` bypass).

### Archive allow flags — compliant

`--allow-overlap` and `--allow-out-of-scope` registered and forwarded. Tests cover both plus omit-by-default.

### Status overlap review — mostly compliant; one residual risk

**Implemented:** overlap peers in `overlap:`; no paths under `review:`; JSON serializes full `review` including `overlapDetail`; help lists `overlapDetail`.

**MEDIUM — CLI does not filter `OVERLAP_CONFLICT` blockers.** Spec: “Invalidation overlap MUST NOT appear as a `OVERLAP_CONFLICT` blocker line.” Implementation prints every `GetStatus.blockers` entry. Tests mock `blockers: []` and assert `not.toContain('OVERLAP_CONFLICT')`, so they pass even if Core still emits that code.

- If spec is right: CLI should drop/relabel that code in text.
- If Core no longer emits it: spec is belt-and-suspenders; CLI is fine as a pass-through.

### Display-state / `[drift]` in text — test and possible render gap

Details append `[drift]` only when `file.hasDrift` is true. Artifact-drift tests do **not** set `hasDrift` on files and do **not** assert `[drift]`. JSON `complete-with-drift` is covered; **text** “prefers complete-with-drift” and “DAG uses display status for drift” have no dedicated tests.

DAG `hasTasks` tag uses `artifact.hasTasks` only; nested JSON `schema.artifactDag` uses `hasTasks === true || taskCompletionCheck !== undefined`. Custom schemas with only `taskCompletionCheck` can disagree between text DAG tags and JSON.

**MEDIUM** if schemas exist with `taskCompletionCheck` without `hasTasks: true`. **LOW** if schema-std always sets `hasTasks`.

### Other LOW

| Item                                    | Spec                                         | Code                                                                | Notes                                                                                            |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Status `--help` schema object           | nested `schema` includes `artifactDag`       | help shows `schema: { name, version }` plus top-level `artifactDag` | Runtime JSON overwrites `schema` with `schemaPayload` (includes `artifactDag`). Help drift only. |
| Repair Guide first line                 | example `error: cannot transition to <step>` | `error: ${err.message}`                                             | Meaning preserved; wording not canonical.                                                        |
| Approve execute shape vs `kernel.specs` | MUST NOT call `kernel.specs.approve*`        | Handler only calls `kernel.changes.*`                               | No test asserts `kernel.specs` unused.                                                           |
| Incomplete-tasks stderr names artifact  | MUST name blocking artifact                  | Relies on Core error + GetStatus blocker message                    | Test only checks `error:` + repair guide, not artifact id.                                       |

No contradictions found between these CLI change specs and the CLI-level constraints (pass-through GetStatus / TransitionChange / ArchiveChange). Global architecture “CLI does not recompute lifecycle” holds.

---

## 4. Test coverage

### Layout vs verify scenario titles

Dedicated files:

- `packages/cli/test/commands/change/status.spec.ts`
- `packages/cli/test/commands/change/transition.spec.ts`
- `packages/cli/test/commands/change/approve.spec.ts`
- `packages/cli/test/commands/change/archive.spec.ts`

**Most `it()` titles do not match verify.md scenario titles.** Examples: verify “JSON output includes hasTasks in artifactDag” vs test “JSON output includes hasTasks and drift-aware state in artifactDag”; verify “fails clearly…” not used except `--next failures` describe. Coverage is by behaviour, not by title mapping. Agents grepping scenario titles will miss tests.

### cli:change-status

| Scenario (verify)                            | Coverage                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Drafted JSON/text                            | Covered (`isDrafted`, `(drafted)`, no transition commands)                         |
| hasTasks + drift-aware JSON DAG state        | Covered (combined test)                                                            |
| DAG task counts / fallback `[hasTasks]`      | Partial (counts when data present; no explicit fallback-only case)                 |
| Text complete-with-drift                     | **Missing**                                                                        |
| JSON canonical + display                     | Partial (display on DAG state; file canonical+display not asserted together)       |
| Incomplete tasks omit `verifying`            | **Missing** (pass-through; no CLI test)                                            |
| nextAction verify vs implement               | Not in status tests (covered in transition repair guide)                           |
| Artifact-review / drift omit file lists      | Drift covered; artifact-review-required not separate                               |
| Overlap peers in text + JSON `overlapDetail` | Covered                                                                            |
| DEPS_INCONSISTENT + label                    | **Missing** (blockers without `label` only)                                        |
| Schema mismatch warning                      | Covered                                                                            |
| Unknown change                               | Covered                                                                            |
| schema.artifactDag / childrenOf              | Covered                                                                            |
| Text DAG roots/children                      | Partial (simple tree)                                                              |
| Convergent `design` once                     | **Missing**                                                                        |
| No refresh / detector                        | Covered (`refreshImplementationTracking.execute` not called)                       |
| Details `tasks: N/M`                         | Covered                                                                            |
| No standalone `specs:`                       | Covered                                                                            |
| specDependsOn text + JSON                    | Partial (section present; exact `core:a: core:c` / `(none)` fixture not dedicated) |
| `--implementation` SDK projection            | Covered in status + implementation-tracking specs                                  |

### cli:change-transition

| Scenario                                                                          | Coverage                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `--next` → `to: 'next'`                                                           | Covered                                                                                      |
| `--allow-out-of-scope` on/off                                                     | Covered                                                                                      |
| No approval flags / no pending rewrite                                            | Covered                                                                                      |
| HAPPY_PATH next failures (pending-spec-approval, **pending-signoff**, archivable) | Covered                                                                                      |
| Hook fail exit 2, no repair guide, check bus ✗                                    | Covered                                                                                      |
| JSON complete ok/failure stream                                                   | Success covered; structured failure record present in handler, light test coverage vs verify |
| Repair guide on stderr / verify skill                                             | Covered                                                                                      |
| Incomplete tasks                                                                  | Covered (exit 1); “status omitted verifying first” **missing**                               |
| Gerund progress, no `Executing:`                                                  | Covered                                                                                      |
| `--skip-hooks` all / comma-separated                                              | Covered; target.pre vs source.post isolation **not** asserted at CLI (delegated)             |
| stream ≠ `hook-progress`                                                          | Covered                                                                                      |

### cli:change-approve

Signatures, JSON, missing `--reason`, unknown sub-verb, not found, wrong state, execute `{ name, reason }`, stay-in-ready/done messaging: **covered**. Drain pending states: covered as “still allows”. Hashes-from-disk: **implicit** (CLI never passes hashes). `kernel.specs.*` unused: **not asserted**.

### cli:change-archive

Missing name, skip-hooks all/pre/post/combo, allow flags, gerund progress, post-hook exit 2, archive path, invalidated text/JSON, JSON stream complete, not found, not archivable: **covered**. Singular alias: parent alias, not a dedicated archive test. Successful merge into permanent specs: **not** a CLI-unit assertion (delegates to use case).

### Leftover `change.spec.ts`

Still contains `describe('change status')` and `describe('change transition')` overlapping the dedicated files. **Not** artifact-drift. Relocate remaining status/transition cases or delete those describes to finish the layout cleanup.

---

## 5. Summary counts

| Spec                  | Requirements | Implemented |                                                             Partial / risk |      Spec drift |                                                                 Missing tests (verify scenarios) |
| --------------------- | -----------: | ----------: | -------------------------------------------------------------------------: | --------------: | -----------------------------------------------------------------------------------------------: |
| cli:change-status     |           16 |          15 | 1 (OVERLAP_CONFLICT pass-through; DAG `hasTasks` vs `taskCompletionCheck`) | 1 (help schema) | 5 (text drift display, DAG convergent, blocker labels, verifying omitted, `[hasTasks]` fallback) |
| cli:change-transition |           14 |          14 |                                                                          0 |               0 |                                          2 (status-before-verifying; skip-hooks phase isolation) |
| cli:change-approve    |            7 |           7 |                                                                          0 |               0 |                                              2 (`kernel.specs` unused; hashes owned by use case) |
| cli:change-archive    |           10 |          10 |                                                                          0 |               0 |                                                                     1 (singular alias dedicated) |

**Previous HIGH (leftover artifact-drift tests in `change.spec.ts`): RESOLVED.**

**Open findings:** 0 HIGH, 2 MEDIUM (status `OVERLAP_CONFLICT` not filtered; DAG `hasTasks` / text `[drift]` coverage), 3 LOW (leftover duplicate tests, help-schema drift, verify-title mismatch).

**Focus items from the audit brief:** `--next` not a local table — pass; `--allow-out-of-scope` — pass; archive allow flags — pass; status overlap review — pass with MEDIUM filter caveat; HAPPY_PATH_NEXT pending-signoff — pass; test files exist per command but titles do not match verify scenarios; leftover monolith still duplicates non-drift status/transition tests.

### Partial: rest

# Partial Compliance Report — rest

- **Change:** `workflow-transition-checks` (`20260825-162927-workflow-transition-checks`)
- **Slice:** assigned specs besides core lifecycle/CLI/archive (FOCUS `core:validate-artifacts`)
- **Mode:** read-only; graph search succeeded once (`ValidateArtifacts` class at `packages/core/src/application/use-cases/validate-artifacts.ts:114`)
- **Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`
- **Date:** 2026-08-28

Assigned specs: `core:validate-artifacts` (FOCUS), `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `core:config`, `skills:skill-templates-source`. Globals spot-checked: `default:_global/architecture`, `conventions`, `testing`, `eslint`.

Prior findings re-verified: **H1** (metadata schema), **H2** (drift materialization vs `FsChangeRepository`).

---

## 1. Requirements

### 1.1 `core:validate-artifacts` (FOCUS) — MetadataExtraction (exhaustive)

Merged spec **Requirement: MetadataExtraction validation** (delta in this change: _MetadataExtraction uses permissive schema for partial per-artifact extract_):

1. After merged preview, if `schema.metadataExtraction()` is defined, call extraction so **only fields sourced from the artifact under validation** are extracted (`extractMetadata(..., artifactType.id)` / `targetArtifactId`).
2. Validate that bag against **`permissiveSpecMetadataSchema`** (shape of fields that are present).
3. If validation fails, record a **validation failure** (not a throw); artifact is **not** `markComplete`.
4. **`strictSpecMetadataSchema` MUST NOT be used here.** It is the write schema for a complete `metadata.json` (persist/archive).
5. Rationale: fields are bound to `field.artifact`. Multi-file specs MAY be validated one artifact at a time. `title` / `description` / `contentHashes` MAY be produced only by an artifact that does not exist yet → extraction is a **partial bag**. Completeness belongs to persist/archive.
6. `transforms` = shared kernel registry; `transformContext` = caller-owned origin bag. Unknown transform or missing/invalid context → validation failure.
7. Extracted metadata is validated **only for the current artifact**, not all artifacts.

Verify scenarios for this requirement:

- _Metadata validation uses shared transform registry and origin context_
- _Unknown transform causes validation failure_
- **`Partial extracted metadata does not require title description or contentHashes`** (explicit: result validated against `permissiveSpecMetadataSchema`; missing those fields do not fail)

Related: **Requirement: MetadataExtraction validation failures are validation failures** (_Invalid extracted metadata prevents completion_).

This change’s delta **corrects** the previous spec text that named `strictSpecMetadataSchema` at step 3.

### 1.2 `core:validate-artifacts` — other change-relevant requirements

| Requirement                        | Intent                                                                                                                                                  |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ports and constructor              | `ListWorkspaces` (not `ReadonlyMap<SpecRepository>`); `LifecycleEngine` for DAG only                                                                    |
| DAG lifecycle from engine evaluate | `evaluate(..., { checksByTarget: {} })`; no hop predicates; no `gatherPredicateSnapshots`                                                               |
| Dependency order                   | Engine effective status; refresh interpretation after each persisted completion in one `execute`                                                        |
| Policy-aware drift materialization | Baseline mismatch (content **and absence**) → focused `Change.invalidate('artifact-drift')` once; policy `none` still sets `hasDrift` without reopening |
| Approval invalidation              | Separate path: approval/signoff hash mismatch; still one invalidate per execute                                                                         |
| Complete/skipped bypass            | Do not re-read/re-validate `complete`/`skipped`; still validate review/drift states; drift detection only for files actually validated                  |
| Config factory                     | `resolveValidateArtifactsDeps` lists `hasher: ContentHasher` then `createValidateArtifacts(deps)`                                                       |
| Save after validation              | `ChangeRepository.mutate`; partial `markComplete` persisted                                                                                             |

### 1.3 `core:get-artifact-instruction`

Constructor includes `LifecycleEngine`. Auto-`artifactId` uses `LifecycleEngine.nextArtifact` / `evaluate` with empty `checksByTarget`. Template vars: `change.name` + `change.path` only. `rulesPre`/`rulesPost` from `rules.pre`/`rules.post` **`text`** (verify: `{ id, text }`). Factory field **`templateExpander`** in spec.md; verify.md still lists **`templates`**.

### 1.4 `core:schema-format` (this change)

`workflow[]` is lookup config on existing Change states, not a machine. Artifact `requires` feeds `LifecycleEngine.projectArtifacts` / `Schema.artifactDag()`. Rules entries: `{ id, instruction }`. Template resolution: _plain text — no interpolation at schema load_ (wording).

### 1.5 `core:storage` (this change)

DAG cascade is **not** `Change.effectiveStatus()`. Load/save rewrite persisted `pending-parent-artifact-review` → `in-progress`. Artifact status derivation + **drift invalidations** only when `artifactTypes.length > 0`. Hash/`validatedHash` status remains repository-owned.

### 1.6 `core:config` (this change)

`approvals.spec` / `approvals.signoff` are **in-place** gates on `ready` / `done`. **New work MUST NOT enter `pending-spec-approval` or `pending-signoff` via `change transition`** (unconditional wording).

### 1.7 `skills:skill-templates-source` (this change)

In-place gates (no happy-path `change transition` into pending). Verify drains `IMPLEMENTATION_STATE`; implement gates `/specd-verify` on zero open files. Archive `--skip-hooks pre` not `all`. Design review scope from DAG details, not `review:` file lists.

### 1.8 Globals (spot-check)

- **architecture:** application uses ports only; composition factories `createX(deps)` + config form through resolver; domain does not import infrastructure; **entities** own invariants; **use cases** orchestrate.
- **conventions:** typed `SpecdError`; no generic `Error` for expected failures; kebab-case; ESM.
- **testing:** every use case / invariant has a unit test with mocked ports; fs adapters have tmpdir integration tests.
- **eslint:** JSDoc on all source methods including private; layer `no-restricted-imports`.

---

## 2. Implementation

### 2.1 Metadata schemas (`parse-metadata.ts`)

Three Zod objects:

| Schema                         | Role in code                                                                                           | Completeness                                                                                             | Notable field rules                                                                                                                                                                             |
| :----------------------------- | :----------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specMetadataSchema`           | lenient **read** of `metadata.json` (`parseMetadata`)                                                  | all fields optional                                                                                      | passthrough; `contentHashes` unvalidated format                                                                                                                                                 |
| `strictSpecMetadataSchema`     | **write** complete snapshot                                                                            | **`title` + `description` required `min(1)`**; **`contentHashes` required**, nonempty, `sha256:<64 hex>` | keywords hyphen regex; `dependsOn` spec-id; `rules[].rules` nonempty; `constraints` nonempty if present; `scenarios[].then` nonempty; **no `optimizationStatus`**                               |
| `permissiveSpecMetadataSchema` | JSDoc: _Used by ValidateArtifacts to verify extracted metadata is valid (not to enforce completeness)_ | **all completeness fields optional**                                                                     | present strings `min(1)`; `contentHashes` optional **without** nonempty refine; `rules[].rules` not `.nonempty()`; `scenarios` requirement/name **optional**; **includes `optimizationStatus`** |

Consumers of **strict**: `PersistSpecMetadata` (`persist-spec-metadata.ts:33`), `fs-spec-index-cache.ts:223`.  
Consumer of **permissive**: **only** `ValidateArtifacts` (dynamic import in the per-artifact loop).

This matches the **corrected** spec split: permissive = partial extract bag; strict = complete `metadata.json` write.

### 2.2 `ValidateArtifacts` metadata path (`validate-artifacts.ts` ~544–603)

- Runs only if local validation has not already failed.
- Skips unless extraction rules exist for **`artifactType.id`**.
- Calls `extractMetadataFromSpecArtifacts({ ..., targetArtifactId: artifactType.id, artifacts: [current file only] })`.
- `extractMetadata(..., input.targetArtifactId)` filters `field.artifact === targetArtifactId`.
- `permissiveSpecMetadataSchema.safeParse(extracted.metadata)`; failure → `failures[]` + `artifactFailed` → no `markComplete`.
- Transform throws → catch → same failure shape.
- `dependsOn` persisted via `setSpecDependsOn` only after success.

Constructor: `ListWorkspaces`, `LifecycleEngine` (default `new LifecycleEngine(...)` if omitted). `evaluate(change, schema, { checksByTarget: {} })` once at start; `markVerdictComplete` patches local map. Completions + drift invalidate in **one** terminal `mutate()`.

Approval/signoff drift scan: gated on `activeSpecApproval` / `activeSignoff`; skips `missing`/`skipped` files and `artifactContent === null`; hashes vs approval maps. **Does not** implement baseline/absence drift or policy `none`.

### 2.3 `FsChangeRepository` drift (`change-repository.ts` ~1523–1573)

When `artifactTypes.length > 0`, compares derived on-disk status to `validatedHash` for previously validated files; calls `change.invalidate('artifact-drift', SYSTEM_ACTOR, ...)`. This is the implementation of “policy-aware” / absence / complete-hash mismatch **at load**, not in `ValidateArtifacts`.

`pending-parent-artifact-review` coerced to `in-progress` on load (`:1422`) and via `persistableArtifactStatus` on save. `ArtifactFile` rejects the token in memory.

### 2.4 `GetArtifactInstruction`

`evaluate(..., { checksByTarget: {} })`; `nextArtifact` when `artifactId` omitted; `ArtifactNotFoundError('(auto)', ...)` if null. Rules use `r.instruction`. Template: `TemplateExpander.expand(artifactType.template, …)` where `template` is **already resolved file content** (`ArtifactType.template`), not a live `SchemaRegistry` read. Context: `{ change: { name, path } }` only. Factory: `templateExpander` on deps; config path through `resolveGetArtifactInstructionDeps`.

### 2.5 Composition

`resolveValidateArtifactsDeps` field name is **`contentHasher`**, not `hasher`. Guard requires `'contentHasher' in value`. Config branch delegates to `createValidateArtifacts(deps)`.

### 2.6 Skills

Templates and `packages/skills/test/template-workflow.spec.ts` implement in-place gates, drain-only pending rows, verify drain, archive `--skip-hooks pre`, design review wording.

### 2.7 Config vs transition

`TransitionChange` blocks `to: pending-spec-approval` only when **`!approvals.spec`** (and not drain). With `approvals.spec: true`, entering pending via `change transition` remains a permitted hop in engine/CLI.

---

## 3. Discrepancies

### Re-verify H1 — **CLOSED** (spec + code + scenario aligned)

**Previous HIGH:** code used `permissiveSpecMetadataSchema` while spec said `strictSpecMetadataSchema`.

**Current intended (delta + preview):** validate extracted bag with **permissive**; strict is write-only for complete `metadata.json`; multi-file specs may extract partial bags.

**Evidence of alignment:**

- Spec step 3 names `permissiveSpecMetadataSchema`; “MUST NOT” use strict here.
- Code `validate-artifacts.ts:583–585` `safeParse`s `permissiveSpecMetadataSchema`.
- `PersistSpecMetadata` still uses `strictSpecMetadataSchema`.
- Test title **`Partial extracted metadata does not require title description or contentHashes`** (`validate-artifacts.spec.ts:2241`): `artifactId: 'verify'` while `title`/`description` bound to `specs`; expects no `MetadataExtraction` failure and `passed: true`.

**Residual (not a reopen of H1):**

- The test never imports or names `permissiveSpecMetadataSchema`; it would also pass if the use case skipped schema validation entirely for empty bags.
- No test that a **present but invalid** field (empty `title`, bad keyword, bad spec-id `dependsOn`) fails permissive and blocks `markComplete` (_Invalid extracted metadata prevents completion_ is only weakly covered via transform throws).
- No test that **`strictSpecMetadataSchema` is not used** (e.g. spy/import assertion).
- `permissiveSpecMetadataSchema` has **no** `parse-metadata.spec.ts` suite (only `strictSpecMetadataSchema` is unit-tested). Permissive is looser than strict in more than optionality: empty `contentHashes` `{}` passes permissive and fails strict; `rules[].rules` empty array; optional scenario `requirement`/`name`.
- Dynamic `import()` of the schema inside the artifact loop (vs static import at persist/index-cache) hides the dependency from static analysis; behavior is still correct.

**Verdict:** H1 as originally filed is **resolved**. Completeness of _shape_ validation for present fields is **under-tested**, not mis-specified.

---

### Re-verify H2 — **OPEN (HIGH)**

**Requirement still in merged `core:validate-artifacts`:** Policy-aware drift materialization (not removed by this change’s validate-artifacts deltas). Verify: _One invalidate call carries the focused drift payload_; _Policy none preserves complete while still marking drift_; _Missing file can still carry hasDrift without rendering complete-with-drift_.

**`ValidateArtifacts` still:**

- Only scans drift when approval or signoff is **active**.
- Skips absent files (`file.status === 'missing'`, `artifactContent === null`).
- Does not set `hasDrift` itself; `invalidate` only for approval-hash mismatches.
- Combined with complete-file bypass (`trackedFile?.status === 'complete'` → `continue` without re-hash), a complete file with changed content and **gates off** is never compared in this use case.

**`FsChangeRepository._loadChange` still** materializes `artifact-drift` with `SYSTEM_ACTOR` when hashes diverge (including absence vs stored hash). `core:storage` Requirement: Artifact status derivation **does** require repository-side drift invalidation when artifact types are resolved.

**Cross-spec / architecture:**

- `core:validate-artifacts` assigns ownership to the use case; `core:storage` also describes load-time drift invalidation. Two owners, one implementation (fs adapter).
- Architecture: infrastructure adapters should not own lifecycle policy; `Change.invalidate` from the fs loader is domain mutation in the adapter, with a different actor than `ValidateArtifacts` (`ActorResolver` vs `SYSTEM_ACTOR`).
- Either move the requirement to `core:storage` (and delete/narrow validate-artifacts Policy-aware drift + those verify scenarios), or implement baseline drift in `ValidateArtifacts` and stop duplicating it on `get()`.

**Verdict:** H2 **stands**. Code is coherent with **storage** + Change entity policy tests (`change.spec.ts` _policy none does not reopen…_); it does **not** satisfy **validate-artifacts** as written.

---

### HIGH — none other in this slice besides H2

(Previous rest-slice H3 eslint on `lifecycle-engine.ts`: file still has `eslint-disable jsdoc/require-jsdoc` but **now includes a justification**. Global eslint still requires JSDoc on private methods. Downgraded to Low L-eslint; not a validate-artifacts finding.)

---

### M1 — `hasher` vs `contentHasher` (MEDIUM)

Spec + verify: `hasher: ContentHasher`. Deps interface / resolver / type guard: `contentHasher`. Literal spec-shaped deps would fail the guard and be treated as config. Constructor parameter remains `hasher`. Sibling `templateExpander` was renamed in this change; this was not.

### M2 — get-artifact-instruction verify still says `templates:` (MEDIUM)

spec.md factory list: `templateExpander`. Merged verify scenario still: `templates: TemplateExpander`. Code matches spec.md. Internal spec/verify drift introduced by incomplete delta.

### M3 — `rules.pre` `text` vs `instruction` (MEDIUM)

`core:get-artifact-instruction` spec+verify: collect **`text`**. `core:schema-format` (declared dependency) + `RuleEntry` + code: **`instruction`**. Code follows schema-format.

### M4 — Approval drift scan not scoped to the invocation (MEDIUM)

Bypass requirement: drift detection for files **actually validated**; avoid spurious invalidation in batch/`--artifact`. Code loops `schema.artifacts()` before the per-artifact loop, independent of `artifactTypesToValidate`. `--artifact verify` can invalidate because `proposal` drifted. Also re-hashes `complete` files for approval drift, contrary to “do not re-read complete files” (approval clause vs bypass clause conflict inside the same spec).

### M5 — Lifecycle “recompute after persisted completion” is an in-memory patch (MEDIUM)

`evaluate` once; `markVerdictComplete` only sets `complete`. Terminal `mutate` only. Direct `requires` same-pass works (`allows a child artifact to validate in the same execute after parent succeeds`). Recursive `pending-parent-artifact-review` cascade is not re-run. Spec’s “persisted” is literal-unmet.

### M6 — `core:config` unconditional “MUST NOT enter pending via change transition” (MEDIUM)

Config spec: new work MUST NOT enter pending via `change transition`. Implementation: guard only if the corresponding approval flag is **false**. With gates **on**, pending remains a legal target. Skills teach drain-only; CLI still accepts the hop. Possible interpretations: spec over-strong vs `core:transition-checks` (no rewrite of `implementing`→pending); or missing hard reject.

### M7 — Architecture vs storage drift (MEDIUM, related to H2)

Hexagonal architecture: use cases orchestrate ports; adapters persist. Load-time `Change.invalidate` in `FsChangeRepository` is business policy in infrastructure. Not forbidden by `core:storage`, but it contradicts validate-artifacts ownership **and** the spirit of “application layer uses ports only” (the adapter _calls_ the entity, which is allowed, but the _decision_ to invalidate lives in fs).

---

### L1 — No composition tests for `resolveValidateArtifactsDeps` / `resolveGetArtifactInstructionDeps`

`packages/core/test/composition/use-cases/` has no matching spec files. Testing spec: every use case wiring contract should be covered; verify scenarios for factories are unasserted. M1 unguarded.

### L2 — `execute` without `artifactId` and with spec-scoped artifacts requires `specPath`

Throws `SpecNotInChangeError('<specPath required>', ...)`. Several verify scenarios omit `specPath`. Placeholder path vs conventions (machine-readable, actionable).

### L3 — `resolveArtifactValidationFilename` can keep a tracked non-expected path once `validatedHash` is set

Conflicts with “MUST NOT accept a direct file as fallback” / “filename MUST be the expected path”.

### L4 — Dynamic import of `permissiveSpecMetadataSchema`

No spec violation; inconsistent with other consumers; graph-unfriendly.

### L5 — Template interpolation: schema-format “no interpolation” vs GetArtifactInstruction `TemplateExpander` on template content

Compatible if schema-format means load-time only; neither spec says so. Code expands at serve time. `GetArtifactInstruction` spec also says read via `SchemaRegistry`; constructor has no `SchemaRegistry` (content already on `ArtifactType`).

### L6 — Duplicate `findBlockingParent` call

Behavior OK; second call likely redundant.

### L7 — Stale GetArtifactInstruction input comment

Still says auto-resolve by **declaration order**; spec and engine use DAG/`nextArtifact`.

### L8 — Leftover `console.log` in `validate-artifacts.spec.ts` (2455–2456, 2692–2693)

Debug prints in unit tests; not a spec SHALL, but noisy vs testing hygiene.

### L-eslint — `lifecycle-engine.ts` file-level `jsdoc/require-jsdoc` disable

Now justified in-comment. Still blanket vs global eslint verify (private methods). `findBlockingParent` public API sits behind the disable.

---

### Skills / schema-format / storage (this change) — largely compliant

Skill templates + `template-workflow.spec.ts` match in-place gate, drain, archive pre-skip, design review, implementation drain requirements.

Storage cascade + wire coercion + `ArtifactFile` reject: compliant with this change’s storage delta (see §2.3). **Not** a fix for H2.

Schema-format workflow-as-lookup: not re-audited line-by-line against `SchemaRegistry` in this slice; no contradiction found with validate-artifacts DAG language. **Contradiction with get-artifact-instruction `text`** is M3.

---

## 4. Test coverage

### 4.1 MetadataExtraction (FOCUS)

| Scenario                                                  | Coverage                                                                                                    | Notes                                                          |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| Partial bag / no title, description, contentHashes        | **Yes** — `Partial extracted metadata does not require title description or contentHashes`                  | Does not assert schema **name**; empty extract from `verify`   |
| Shared transform registry + origin context                | Partial — transform tests pass custom `Map` into constructor; origin context implicit for `resolveSpecPath` | No assertion that kernel builtin registry is used              |
| Unknown transform → failure                               | **Gap** — no test titled/structured for unregistered transform name                                         | Closest: transform **throws** on bad dependsOn                 |
| Invalid extracted metadata (schema) prevents complete     | **Gap** for Zod shape (empty title, bad keywords)                                                           | Transform rejection covers “extraction failed”                 |
| `strictSpecMetadataSchema` not used on validate           | **Gap**                                                                                                     | persist tests cover strict on write (`parse-metadata.spec.ts`) |
| `permissiveSpecMetadataSchema` unit cases                 | **Gap**                                                                                                     | only strict suite exists                                       |
| dependsOn persist / no sidecar hard-fail / transform drop | **Yes** — several tests in same describe                                                                    | includes leftover `console.log`                                |

### 4.2 Other validate-artifacts (this change)

| Scenario                                           | Coverage                                                                              |
| :------------------------------------------------- | :------------------------------------------------------------------------------------ |
| `evaluate` empty `checksByTarget`                  | Yes (`evaluates lifecycle with empty checksByTarget`)                                 |
| Same-execute parent then child                     | Yes (`allows a child artifact to validate in the same execute after parent succeeds`) |
| Review / `pending-parent-artifact-review` messages | Yes (dependency describe block)                                                       |
| Policy none / hasDrift via **ValidateArtifacts**   | **Gap** (entity tests in `change.spec.ts`; fs in `change-repository.spec.ts`)         |
| Factory `resolveValidateArtifactsDeps`             | **Gap**                                                                               |
| Constructor `ListWorkspaces` vs specs map          | **Gap** (wiring only)                                                                 |

### 4.3 GetArtifactInstruction

Empty `checksByTarget` tested. Factory verify `templates:` vs code untested at composition. Rules `text` vs `instruction` would fail if tests used spec YAML `text` without mapping.

### 4.4 Storage

`given wire pending-parent-artifact-review, when get then save, then status is in-progress` — covers this change’s cascade/coercion. Load-time artifact-drift covered in repository tests, not as ValidateArtifacts.

### 4.5 Config

In-place gates tested on `TransitionChange` / lifecycle (other slices). Unconditional “no transition into pending” **not** asserted when `approvals.spec === true`.

### 4.6 Skills

`template-workflow.spec.ts` asserts exact contracts for this change’s template requirements (keyword-only insufficient — tests use exact phrases). Compliant with skills verify.

### 4.7 Globals

Testing spec “every use case factory/invariant” not met for composition resolvers (L1). Architecture/eslint: composition factories match `createX(deps)` pattern (except hasher naming).

---

## 5. Summary counts

| Severity                | Count | IDs                               |
| :---------------------- | ----: | :-------------------------------- |
| High (open)             |     1 | H2 drift ownership                |
| High (closed this pass) |     1 | H1 metadata schema — **resolved** |
| Medium                  |     7 | M1–M7                             |
| Low                     |     9 | L1–L8 + L-eslint                  |
| Spec/verify internal    |     2 | M2, M3 (also counted as Medium)   |

| Outcome                                                                                                                    | Count |
| :------------------------------------------------------------------------------------------------------------------------- | ----: |
| Requirements reviewed (assigned + globals spot-check)                                                                      |   ~55 |
| Confirmed compliant (incl. H1, storage coercion, skills gates, DAG empty checks, ListWorkspaces ctor, persist uses strict) |    22 |
| Open implementation vs spec                                                                                                |     8 |
| Spec-vs-spec / spec-vs-verify                                                                                              |     4 |
| Test gaps (incl. permissive unit + unknown transform + factory)                                                            |     8 |

**H1:** spec was corrected; code and the named test match **permissive** for partial bags; strict remains write-only. Residual: weak assertions and no permissive unit tests.

**H2:** still **open** — Policy-aware drift remains specified on `ValidateArtifacts` and implemented on `FsChangeRepository` load.

**This slice’s change deltas** (DAG `evaluate`, `ListWorkspaces`, workflow-as-lookup, storage cascade, config in-place gates, skill templates) are largely implemented; leftover naming/verify drift (hasher, templates, rules `text`) and factory-test gaps remain.
