# Specs compliance — change `workflow-transition-checks`

- **Timestamp:** 20260827-171139
- **Mode:** change
- **Verification:** scenarios passed (core 2478 tests, CLI 903, skills template-workflow 49; implementing→verifying hop; code checks for `projectArtifacts`, no `Change.effectiveStatus`, overlap skip, ArchiveChange bindings)
- **Graph:** stale false, indexed 2026-08-27T15:08:18.609Z, ref 2948f1a2
- **Critical:** 0
- **Major (unique):** persist/load coerce of `pending-parent-artifact-review` vs spec reject; skippable blockers vs `bypassFlags` / GetStatus not passing overlap bypass
- **Medium:** CountTasks cache on long-lived Kernel (F1); CLI test path mirroring (D1)

## Executive summary

Lifecycle UX deltas (checks, engine projection, stay-in-state approvals, CLI review header, `--next` adapter table, check progress bus, archive post collect / no `RunStepHooks` ctor) are implemented. Remaining issues are storage hygiene, status vs archive overlap bypass, MCP-lived task-count cache, and CLI test layout.

## Detailed findings

The following sections are the batch partials verbatim.

---

# Partial: core-engine

# Spec-compliance audit — core engine batch

- **Mode:** change (`workflow-transition-checks`)
- **Scope:** `core:transition-checks`, `core:lifecycle-engine`, `core:change`, `core:workflow-model`, `core:schema-format`, `core:storage`
- **Globals checked:** `default:_global/architecture`, `default:_global/conventions`
- **Graph:** `stale: false` (indexed `2026-08-27T15:08:18.609Z`, ref `2948f1a2`)
- **Evidence:** `changes spec-preview` (delta-merged), `graph search` / `graph impact`, then Read of implementation and tests
- **Stance:** neither spec nor code is always truth; each finding lists both interpretations

---

## Cross-cutting delta focus (this change)

These five contracts are the change’s load-bearing deltas. Summary first; per-spec sections repeat evidence.

### 1. Shared checks (identity, ABI, bindings, no snapshot bag)

**Implemented.** Closed `CheckId` union and `CHECK_LABELS` gerunds live in `packages/core/src/domain/services/transition-checks.ts`. Application checks `extend WorkflowCheck` with `create*` factories in `packages/core/src/application/checks/`. One binding table: `TRANSITION_BINDING_SPECS` / `ARCHIVE_BINDING_SPECS` in `check-bindings.ts`, materialized by `applyBindingSpecs` in production via `createWorkflowCheckRegistry`. `archive.publication` is not a `CheckId`. Domain modules export `run(facts)` plus stub `Check` objects; kernel composition uses application `create*`. No `PredicateSnapshots` / `gatherPredicateSnapshots`.

### 2. Engine projection from `CheckResult`s (`projectArtifacts`, no second availability algorithm)

**Mostly implemented.** `LifecycleEngine.evaluate` consumes caller-supplied `checksByTarget` and sets `availableTransitions` from “no predicate `fail`”. `projectArtifacts` is a public instance method (pure DAG walk, no I/O). `GetStatus` / `TransitionChange` call `projectArtifacts` then `check.execute` then `evaluate`. `ValidateArtifacts` calls `evaluate` with `checksByTarget: {}`. Engine does not fall back to `check.run` against a snapshot bag. Residual: when `checksByTarget[target]` is missing, `availableSteps` / `transitionBlockers` still independently re-walk `requires` (allowed by spec for empty `checksByTarget`; risky if a caller forgets to inject hops).

### 3. No `Change.effectiveStatus()`

**Implemented in domain.** `Change` has no `effectiveStatus` method (graph + `change.ts` grep). Cascade is `LifecycleEngine._effectiveStatus` / `projectArtifacts`. Schema-format and storage specs state the same. Load-time file status remains hash-derived on `FsChangeRepository`.

### 4. Overlap omit from `blockers` when `allowOverlap` / `--allow-overlap`

**Split path — mostly implemented, one contract gap.**

- **Check path:** `runSpecOverlap` returns `skip` when `facts.allowOverlap` is true (`domain/checks/spec-overlap.ts`). Archive `spec.overlap` therefore does not fail, so it cannot project an `OVERLAP_CONFLICT` blocker.
- **Engine review path:** `_reviewBlockers` omits history-derived `OVERLAP_CONFLICT` when `bypassFlags` contains `'allow-overlap'` (tested in `lifecycle-engine.spec.ts`).
- **Gap:** `_blockersFromFailedChecks` never consults `bypassFlags`. If a failed `OVERLAP_CONFLICT` `CheckResult` is injected while bypass is active, the blocker remains. Spec says skippable blockers MUST be omitted when the matching bypass is in engine input. Code assumes checks already skipped.
- **GetStatus** never passes `bypassFlags` or `allowOverlap` into `evaluate` / `executeChecksByLegalTargets`. Review `OVERLAP_CONFLICT` always stays on status. Archive can skip. That split may be intended (status warns; archive `--allow-overlap` proceeds) but it is not spelled as such in the engine spec.

### 5. Axis fallback (`AXIS_FALLBACK` splice, not tail-append)

**Implemented and tested.** `buildAxis` inserts missing `ready | implementing | verifying | done | archivable | archiving` at the first listed slot whose fallback index is `>=` the omitted state’s index. `drafting` / `designing` are not in `AXIS_FALLBACK`. Non-`ChangeState` strings are filtered (`step in VALID_TRANSITIONS`). Tests cover omitted `implementing` (forward `ready → verifying`, backward `verifying → implementing`), omitted `ready` (`ready → implementing` still forward), and unknown `reviewing` not occupying a slot.

---

## Global consistency (`architecture` / `conventions`)

| Topic                                                                 | Verdict                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers                                                                | Checks: domain `run` + application `WorkflowCheck` + composition registry. Domain does not import application. Matches hexagonal split.                                                                                                                                                               |
| Pure functions vs `LifecycleEngine` class                             | **Spec-vs-spec.** Architecture: stateless domain services SHALL be plain functions. Lifecycle-engine spec: a `LifecycleEngine` class with `evaluate` / `projectArtifacts`. Implementation follows the more specific change spec (class + optional debug logger). Not scored as an implementation bug. |
| Ports / DI                                                            | `createWorkflowCheckRegistry(deps)` is manual DI. Hook I/O via `RunStepHooks` port.                                                                                                                                                                                                                   |
| `createX` factories                                                   | Present for each check and the registry.                                                                                                                                                                                                                                                              |
| Conventions: kebab-case, tests under `test/`, named exports, no `any` | Matches for this batch.                                                                                                                                                                                                                                                                               |
| Conventions: JSDoc on public symbols                                  | `lifecycle-engine.ts` starts with `/* eslint-disable jsdoc/require-jsdoc */` for private helpers. Public methods still have JSDoc. **Low** vs conventions, not vs change specs.                                                                                                                       |
| Errors                                                                | Check fails reuse domain codes (`INVALID_TRANSITION`, `INCOMPLETE_ARTIFACT`, `APPROVAL_REQUIRED`, `OVERLAP_CONFLICT`, `IMPLEMENTATION_STATE`, `HOOK_FAILED`). Hook abort throws `HookFailedError`.                                                                                                    |

No circular workspace deps observed in this batch.

---

# Spec: `core:transition-checks`

## Requirements Summary

1. **Check identity and result** — stable `id`, gerund `label` (no `Executing:`), `kind`, `outcome` pass/fail/skip, `code`/`message` on fail, optional `details`. `archive.publication` is not a check. `instruction:` hooks are not checks.
2. **Check ABI** — `Check` + abstract `WorkflowCheck` with pass/fail/skip; `create<Name>(deps)` only the ports that `execute` uses; no snapshot bag; `CheckExecutionContext` is host-only; skip hooks via binding phase + selectors, not `check.id` in the use-case loop.
3. **One file per check** — `id`/`kind` on the class; applicability not on the check.
4. **Applicability `from`/`to`/`along`** — wildcards; `along` ∈ forward/backward/redesign/recovery/any; `AXIS_FALLBACK` splice; omitted workflow row does not leave `VALID_TRANSITIONS`; unknown strings are not axis slots.
5. **Archive is an operation** — not a fake edge; `approval.signoff` not bound to archive.
6. **Binding phase / onFailure** — effects declare `before-persist`/`after-persist` and `abort`/`collect`; use cases iterate matching bindings by phase.
7. **Predicate vs effect** — predicates decide `allowed`; effects ignored by status; `--skip-hooks` skips effects only.
8. **Evaluation of an attempt** — classify `along`; `protocol.edge` first fail-fast; no rewrite to pending; `ApproveSpec`/`ApproveSignoff` stay separate.
9. **Registry bindings** — impl checks only forward exit-`implementing`; approvals on delivery edges; compact impl fail messages; `IMPLEMENTATION_STATE` skippable only for `impl.linksInScope`.
10. **Projections** — `availableTransitions` / `nextAction` from the same evaluation (detailed on lifecycle-engine).
11. **No shared snapshot bag** — one binding table; publication not registered; TransitionChange does not launch hooks by id.
12. **Actionable fail diagnostics** — deps extracted vs persisted; impl text is count + ≤3 examples.
13. **Generic check progress bus** — `check-start` / `check-progress` / `check-done`; no `Executing:` prefix.

## Implementation Status

**Implemented** for the contracts above, with production execute on application `create*` (`packages/core/src/application/checks/*`, `workflow-check-registry.ts`). Matcher/classify in `transition-checks.ts`. Predicate runner `executeMatchingPredicates` (`failFast` used by `TransitionChange`). Effects selected by `matchingEffects(..., phase)` in `TransitionChange` / `ArchiveChange`. Skip selectors implemented inside `HookEffectCheck.execute` (`all`, `target.pre`, `source.post`, archive `pre`/`post`), not by comparing `check.id` in the use-case loop.

Domain stub `Check.execute` bodies exist (`domain/checks/*.ts`) and `TRANSITION_BINDINGS` materializes them for matcher tests. Spec **allows** stubs and **forbids** them as the production path. Production composition uses `createWorkflowCheckRegistry` (`composition/use-cases/workflow-check-registry.ts`). **Compliant** if hosts never pass `TRANSITION_BINDINGS` into use cases (they do not).

## Discrepancies

### Major

None that break the shared status/execute contract for built-in ids.

### Minor

1. **Protocol fail-fast is execute-only.** Spec: evaluate a candidate edge, run `protocol.edge` first fail-fast. `TransitionChange` uses `failFast: true`. `GetStatus` / `executeChecksByLegalTargets` collect every matching predicate. **If spec is truth:** status should stop after `INVALID_TRANSITION` (weaker diagnostics). **If code is truth:** status needs the full predicate set for repair UI; spec should say fail-fast applies to execute only.
2. **`runSpecOverlap` skip-on-`allowOverlap` is untested.** Fail-with-peers is tested; `allowOverlap: true → skip` is not in `transition-checks.spec.ts` (archive use-case tests cover proceed-with-flag, not the check outcome).
3. **`source.pre` / `target.post` as no-ops** are accepted by `HookPhaseSelector` but never asserted. Spec says they MAY be no-ops; still unverified.

### Low

- Closed `CheckId` union vs “runtime ids are stable strings” — spec explicitly allows a closed union that is not the plugin ABI.
- `CheckExecutionContext.skipHookPhases` is a string list; mapping lives on the effect instance’s pre/post identity, which the spec itself requires because both transition hooks share `phase = before-persist`.

## Test Coverage

| Area                            | Tests                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `classifyAlong` / AXIS_FALLBACK | `test/domain/services/transition-checks.spec.ts` (omit implementing/ready, unknown `reviewing`, redesign, recovery) |
| Matcher / impl not on redesign  | same file                                                                                                           |
| Snapshot bag absent             | same file                                                                                                           |
| `archive.publication` absent    | same file                                                                                                           |
| Overlap fail message            | `runSpecOverlap` peers                                                                                              |
| Labels without `Executing:`     | transition-checks + transition-change specs                                                                         |
| Progress bus                    | `test/application/services/execute-check-with-progress.spec.ts`, transition-change progress tests                   |
| Factories / kind                | `test/application/checks/workflow-check-factories.spec.ts`                                                          |
| Archive signoff unbound         | implied by `ARCHIVE_BINDING_SPECS` inspection test                                                                  |

## Missing Tests

- `allowOverlap: true` → `spec.overlap` outcome `skip` (unit).
- `executeMatchingPredicates({ failFast: true })` stops after `protocol.edge` fail and does not invoke later predicates.
- `source.pre` / `target.post` skip selectors are no-ops (do not skip the other phase).
- Domain stub `execute` is not used by `createTransitionChange` / kernel (composition assertion).

## Spec Dependency Chain

- Direct: `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`
- Downstream in this change (not fully audited here): `core:get-status`, `core:transition-change`, `core:archive-change`, CLI/skills

## Counts (`core:transition-checks`)

| Metric                                             | Count         |
| -------------------------------------------------- | ------------- |
| Requirements reviewed                              | 13            |
| Implemented                                        | 13            |
| Partial                                            | 0             |
| Missing                                            | 0             |
| Discrepancies critical / major / minor / low       | 0 / 0 / 3 / 2 |
| Verify scenarios with automated coverage (approx.) | 22+           |
| Verify scenarios missing or only indirect          | 4             |

---

# Spec: `core:lifecycle-engine`

## Requirements Summary

1. **Centralized validation** — sole interpreter; protocol + schema predicates + core-bound predicates; predicates only; no snapshot bag; no `check.run` fallback; `projectArtifacts` is pure and not a second availability algorithm.
2. **Effective artifact status** — mapping rules including parent-review cascade; public contract is `evaluate` (plus this change’s `projectArtifacts`); **no** public `computeEffectiveStatus`.
3. **Canonical-state-only** — `complete-with-drift` / `hasDrift` are not extra lifecycle states.
4. **Machine-readable blockers** — codes listed; skippable + active bypass **omits** the blocker; no `warnings` field.
5. **Available steps and nextAction** — from one predicate evaluation; no pending rewrite; `availableSteps` = schema lookup rows; `isReady` from `workflow.requires` when present (no dual `MISSING` vs `INCOMPLETE` for the same artifact); `isPermitted` is protocol; impl skippable only `impl.linksInScope`.
6. **Happy-path nextAction matrix** — designing/ready/implementing/verifying/done/archivable/archiving including approve CLI not pending hops; backward hops listed but not default nextAction.
7. **Archiving escape** — `archivable` + `designing`; incomplete restore → designing; recovery skips requires.
8. **Review summary** — overlap from unhandled `invalidated` history.
9. **Shared consumers** — GetStatus, TransitionChange, ValidateArtifacts, GetArtifactInstruction call `evaluate`; CompileContext must not.
10. **Next artifact** — DAG topological order, not declaration order.

## Implementation Status

**Implemented** in `packages/core/src/domain/services/lifecycle-engine.ts`.

- `_resolveTarget` is identity (no pending rewrite).
- `availableTransitions` from injected checks with no `fail`.
- `availableSteps` from `schema.workflow()` declaration order (omitted `implementing` row absent; still in `validTransitions`).
- `isReady` uses failed `workflow.requires` when checks exist; else blockingArtifacts walk.
- Dual-write guard: if any `workflow.requires` result exists, `_requestedTargetBlockers` does **not** also walk artifacts for `MISSING_ARTIFACT`. `workflow.requires` itself always fails with `INCOMPLETE_ARTIFACT` even when effective status is `missing` (`domain/checks/workflow-requires.ts`). Test `does not dual-write MISSING_ARTIFACT` passes via that check code.
- `projectArtifacts` + private `_effectiveStatus` match mapping rules (complete + parent review → `pending-parent-artifact-review`; incomplete parent → `in-progress`).
- Canonical complete+hasDrift treated as complete (`treats complete-with-drift as complete` test).
- `_nextArtifact` uses `schema.artifactDag().topologicalOrder()`.
- `ValidateArtifacts` uses empty `checksByTarget`. `CompileContext` has no `.evaluate(` call.

## Discrepancies

### Major

1. **Skippable check-projected blockers are not omitted via `bypassFlags`.**  
   Spec (Machine-readable blockers): if skippable and bypass active in engine input, omit from `blockers`.  
   Code: `_reviewBlockers` honors `allow-overlap`; `_blockersFromFailedChecks` always emits `OVERLAP_CONFLICT` / skippable `IMPLEMENTATION_STATE` from failed checks. Bypass is assumed to have happened inside `check.execute` (`allowOverlap` / `allowOutOfScope` on `CheckExecutionContext`).  
   **If spec is truth:** engine should filter `_blockersFromFailedChecks` against `bypassFlags` (`allow-overlap`, `allow-out-of-scope`). **If code is truth:** spec should say omit happens because the check `skip`s, and engine bypass is only for **review-history** overlap, not check results.  
   `GetStatus` never sets `bypassFlags`, so review overlap always remains on status even when an operator would archive with `--allow-overlap`.

### Minor

2. **`availableSteps.blockingArtifacts` still independently re-walks `requires` when checks are present.** `isReady` follows the check; `blockingArtifacts` can still disagree with check `details` if a check used a different artifact set. Spec’s dual-code prohibition is about blocker **codes**, not this extra array.
3. **Fallback availability when `checksByTarget[target]` is undefined** still uses `_isStepPermitted` + requires walk. Spec says engine MUST NOT fall back to `check.run` when missing; it does not forbid a local walk. Callers that forget injection get a **second** algorithm. `evaluate` helper in unit tests always injects domain checks, masking this in tests.
4. **Happy-path `archiving` nextAction command** is `'specd change archive'` on the retry path vs `/specd-archive` for `archivable`. Spec allows “equivalent archive skill/CLI entry”; mixed strings are a UX inconsistency (low/minor).
5. **`nextAction` for `ready` with spec gate** uses `boundFromStates('approval.spec')` and recorded approval, **before** consulting `availableTransitions`. Matches “recommend approve not pending”. If `approval.spec` were bound to a different `from` later, nextAction follows bindings (good). Untested mismatch if checks fail for another reason while gate is on.

### Low

- File-level `/* eslint-disable jsdoc/require-jsdoc */` vs conventions.
- `LifecycleEngine` is a class (see global consistency).

## Test Coverage

Strong in `test/domain/services/lifecycle-engine.spec.ts`: parent-review cascade, overlap bypass on review blockers, complete-with-drift, omitted implementing extras row, no dual `MISSING_ARTIFACT`, injected CheckResults without I/O, incomplete tasks hide verifying, archiving recovery skips requires, nextAction matrix samples.

## Missing Tests

- Engine `bypassFlags` + **injected failed** `OVERLAP_CONFLICT` check (the gap above).
- `bypassFlags` including out-of-scope vs `impl.filesResolved` (must **not** omit) vs `impl.linksInScope` (must omit if spec’s engine-omit rule is taken literally).
- `ValidateArtifacts` empty `checksByTarget` still returns `projectArtifacts` / `nextArtifact` (covered at use-case layer? not in this file).
- Next-artifact prefers DAG `specs` over `design` (schema-std fixture) — verify scenario exists; confirm a dedicated engine unit test (not seen in the slice read).
- CompileContext non-consumer is absence-of-call; no explicit “does not import evaluate” test.

## Spec Dependency Chain

- `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`, `core:transition-checks`

## Counts (`core:lifecycle-engine`)

| Metric                                       | Count                      |
| -------------------------------------------- | -------------------------- |
| Requirements reviewed                        | 10                         |
| Implemented                                  | 9                          |
| Partial                                      | 1 (blocker omit vs bypass) |
| Missing                                      | 0                          |
| Discrepancies critical / major / minor / low | 0 / 1 / 4 / 2              |
| Verify scenarios with coverage (approx.)     | 18                         |
| Verify scenarios missing / weak              | 5                          |

---

# Spec: `core:change`

## Requirements Summary (delta-relevant subset)

This spec is large; this audit concentrates on lifecycle + artifact status deltas for this change.

- Lifecycle graph; gates stay in `ready`/`done`; drain-only pending states; `VALID_TRANSITIONS['ready']` = implementing + designing; `done` includes archivable/designing/implementing/verifying.
- Skill-aligned backward hops; signoff invalidation; no spec-approval invalidation unless files change.
- Archiving escapes only `archivable` and `designing`.
- `implementing → verifying` gated by `workflow.taskCompletion` (not a Change method).
- Implementation tracking states (`open`/`resolved`/`ignored`/`removed`).
- Spec/signoff gates via checks, not pending parking.
- Artifacts: persistable file states listed; **`pending-parent-artifact-review` is engine-derived only**; load/save **MUST reject** that value on files; aggregate persisted state MUST NOT store it.
- No `Change.effectiveStatus()` (stated via sibling specs; Change owns persisted aggregate only).

## Implementation Status

**Implemented** for protocol: `VALID_TRANSITIONS` in `change-state.ts` matches the delta (ready has no `pending-spec-approval`; done has no `pending-signoff`; archiving only archivable/designing; backward hops from done/signed-off/archivable). `Change.transition` still entity-enforces the table (architecture: rich entity). No `effectiveStatus` on `Change`. `ArtifactFile` constructor **throws** if status is `pending-parent-artifact-review`.

## Discrepancies

### Major

1. **Load/save remap instead of reject `pending-parent-artifact-review`.**  
   Spec: load/save MUST reject that value on files.  
   Code: `FsChangeRepository` **coerces** file status `pending-parent-artifact-review` → `in-progress` on load (`change-repository.ts` ~1422). `persistableArtifactStatus` **coerces** the same on serialize (~1700) instead of throwing. `ArtifactFile` constructor rejects, so a well-formed in-memory entity cannot hold the value; **wire/legacy JSON** is silently rewritten.  
   **If spec is truth:** loading a corrupt manifest should throw (typed `SpecdError`), not downgrade. **If code is truth:** spec should say “reject on entity construction; storage MAY coerce legacy wire values to `in-progress` so old manifests load.” This is this change’s “engine-derived only” delta colliding with storage hygiene.

### Minor

2. **`ChangeArtifact` JSDoc** still describes aggregation precedence including `pending-parent-artifact-review` (`change-artifact.ts`), which cannot appear on files. Comment drift vs “MUST NOT store on aggregate.”
3. **Transition-change tests** still comment `effectiveStatus('tasks')` as if it were a Change API (`transition-change.spec.ts` ~832). Comments only; misleading for the no-method invariant.

### Low

- Pending states remain on `ChangeState` for drain, as specified.

## Test Coverage

- `artifact-file.spec.ts` rejects persist of `pending-parent-artifact-review`.
- Lifecycle tests cover parent-review as **engine** status.
- VALID_TRANSITIONS covered across change / transition-change tests (not re-enumerated here).

## Missing Tests

- `FsChangeRepository` load of a manifest file whose `state` is `pending-parent-artifact-review` **throws** (today it would coerce — this test would document the discrepancy).
- Serialize never writes that token (today it remaps).
- Explicit `expect(Change.prototype.effectiveStatus).toBeUndefined()` or similar (presence tested only by absence).

## Spec Dependency Chain

- `core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`, `core:transition-checks`

## Counts (`core:change`)

| Metric                                       | Count                     |
| -------------------------------------------- | ------------------------- |
| Requirements reviewed (delta-focused)        | 12                        |
| Implemented                                  | 11                        |
| Partial                                      | 1 (parent-review persist) |
| Missing                                      | 0                         |
| Discrepancies critical / major / minor / low | 0 / 1 / 2 / 1             |
| Missing tests                                | 3                         |

---

# Spec: `core:workflow-model`

## Requirements Summary

1. **Step names are lookup keys** onto existing `ChangeState`; omitting a row does not delete protocol membership; unknown `step` → `SchemaValidationError` at `buildSchema`, must not occupy axis.
2. **Step semantics** — designing / implementing / verifying outcomes / archiving deterministic.
3. **Requires-based gating** — evaluated as `workflow.requires` with `to = effective`; shared by status and TransitionChange; skip if empty; skipped optional satisfies.
4. **Task completion gating** — `workflow.taskCompletion` + `CountTasks`; subset of requires; skip missing file / invalid regex; engine must not walk files.
5. **Step availability** — from engine projections; CompileContext MUST NOT evaluate hops.
6. **Workflow array order** — display + progress axis; AXIS_FALLBACK splice; redesign/recovery exceptions.
7. **Step-to-state mapping** — name IS the state.
8. **Hooks** — `run:` effects; pre `to = step`; post `from = step` `along = forward` only; transition post is before-persist.
9. **Two execution modes** — auto-run unless `skipHookPhases`; one pipeline.
10. **Requires are artifact IDs** — not step names.

## Implementation Status

**Implemented.** Bindings: `workflow.requires` / `taskCompletion` on `from=* to=* along=*` except `recovery`. Task check composed with `CountTasks` (`createWorkflowTaskCompletion`). Post hooks `along: forward` only. Transition `hook.post` `phase: before-persist`; archive `hook.post` `after-persist`. `buildSchema` rejects `step: reviewing`. `workflowStep("implementing")` null when omitted; `VALID_TRANSITIONS` still has implementing. CompileContext does not call `evaluate`.

## Discrepancies

### Minor

1. **Status vs execute still differ on fail-fast** (same as transition-checks): shared **predicate bodies**, not shared **short-circuit**. Spec “both reject via `workflow.requires`” is true for legal edges; illegal edges: execute stops at protocol, status still runs later predicates if protocol is `fail` and failFast is off.
2. **“Agent-driven step requires explicit hook invocation”** verify wording vs “without skip flags, matching `run:` still auto-execute.” Code matches the latter. Spec text in verify is slightly contradictory; implementation chose auto-run + skip flags.

### Low

- Verifying semantic outcomes (`implementation-failure` vs `artifact-review-required`) are **agent/skill routing**, not engine classification of `along`. Engine only classifies `verifying → implementing` as `backward` and `→ designing` as `redesign`. Compliant if skills own the choice of `to`.

## Test Coverage

- Axis / omit implementing: `transition-checks.spec.ts`, `lifecycle-engine.spec.ts`, `build-schema.spec.ts` (unknown step).
- Requires / task completion: transition-change and workflow-task-completion tests (use-case batch).
- Post hooks not on redesign: matcher test `implementing → designing` does not match impl **and** post is forward-only in bindings.

## Missing Tests

- Schema whose `workflow[]` lists `designing`+`ready` but not `implementing`: `workflowStep("implementing") === null` **and** `ready → implementing` still protocol-legal (split across files; no single test names both).
- CompileContext explicitly must not call `LifecycleEngine.evaluate` (negative test).

## Spec Dependency Chain

- `core:change`, `core:schema-format`, `core:build-schema`, `core:compile-context`, `core:get-status`, `core:transition-change`, `core:archive-change`, `core:hook-execution-model`
- This change also ties it to `core:transition-checks`

## Counts (`core:workflow-model`)

| Metric                                       | Count         |
| -------------------------------------------- | ------------- |
| Requirements reviewed                        | 10            |
| Implemented                                  | 10            |
| Partial                                      | 0             |
| Missing                                      | 0             |
| Discrepancies critical / major / minor / low | 0 / 0 / 2 / 1 |
| Missing tests                                | 2             |

---

# Spec: `core:schema-format`

## Requirements Summary (delta-relevant)

- Artifact `requires` feed `LifecycleEngine.projectArtifacts` / DAG; **no `Change.effectiveStatus()`**.
- Cascade: incomplete/missing/`in-progress` parent → dependent `in-progress`; review-ish parent → `pending-parent-artifact-review`.
- `workflow[]` order is display + along axis; missing delivery states spliced by canonical fallback; omitted step does not delete protocol state.
- Unknown `workflow[].step` → `SchemaValidationError`; must not become an axis slot.
- Duplicate workflow steps invalid; `requiresTaskCompletion` only `hasTasks: true`.

(Remainder of schema-format — plugins, hooks YAML, deltas — is largely unchanged; not exhaustively re-audited except where this change’s wording landed.)

## Implementation Status

**Implemented.** `buildSchema` rejects unknown steps (`build-schema.spec.ts`). Engine cascade matches schema-format mapping (same `_effectiveStatus`). No `Change.effectiveStatus()`. Axis splice in `buildAxis`, not in schema object (schema only lists declared steps; engine/classifier splices). That split matches “declaration order is listed names; missing delivery states spliced at classify time.”

## Discrepancies

### Low

1. **Defense in depth vs “resolved schemas never contain unknown names.”** `classifyAlong` still filters `step in VALID_TRANSITIONS`, so a buggy bypass of `buildSchema` would not invert along. Spec says TransitionChange is not the rejection site. Filtering in `buildAxis` is extra, not a contradiction.
2. Large pre-existing schema-format surface (merge, plugins, templates) is out of this delta; no claim of full-schema-format coverage.

## Test Coverage

- Unknown step / valid ChangeState / archiving step: `build-schema.spec.ts`.
- Duplicate workflow steps: `schema-registry.spec.ts`.
- Omitted implementing remains protocol: `transition-checks.spec.ts` + engine extras-row test.
- Cascade: `lifecycle-engine.spec.ts`.

## Missing Tests

- Schema-format verify “no `Change.effectiveStatus()` method” is a negative API test — not present as such.
- Explicit test that `schema.workflow()` after omit does not contain `implementing` while `VALID_TRANSITIONS` does (engine test covers evaluate, not `Schema` object isolation).

## Spec Dependency Chain

- `core:delta-format`, `core:selector-model`, `core:content-extraction`, `core:schema-merge`
- Informal dependents: `core:lifecycle-engine`, `core:workflow-model`, `core:storage`

## Counts (`core:schema-format`)

| Metric                                       | Count         |
| -------------------------------------------- | ------------- |
| Requirements reviewed (delta-focused)        | 6             |
| Implemented                                  | 6             |
| Partial                                      | 0             |
| Missing                                      | 0             |
| Discrepancies critical / major / minor / low | 0 / 0 / 0 / 2 |
| Missing tests                                | 2             |

---

# Spec: `core:storage`

## Requirements Summary (delta-relevant)

- Artifact status derived at load from hashes (`skipped` sentinel → missing → complete → in-progress).
- **Artifact dependency cascade owned by `LifecycleEngine.projectArtifacts` / `_effectiveStatus`.** No `Change.effectiveStatus()`.
- Load-time file status remains the four hash states; effective DAG MAY add `pending-parent-artifact-review`.
- ValidateArtifacts sole path to complete; archive pattern/index/locks/fs-cache remain as before this change.

## Implementation Status

**Implemented** for the cascade ownership split: repository `_deriveFileStatus` does not walk artifact `requires` for parent-review. Engine does. Hash precedence still in `FsChangeRepository`.

## Discrepancies

### Major

1. **Same persist remap as `core:change`:** storage silently maps `pending-parent-artifact-review` → `in-progress` on load and save (`persistableArtifactStatus`). Storage spec says that status is engine-derived and load-time derivation is the four hash states — implying the token should not appear on disk. Coercion is a compatibility shim **not specified**. Align spec (“coerce legacy”) or code (reject).

### Low

- Remainder of storage (archive index, gitignore, named factories) is outside the transition-checks delta; not re-audited line-by-line. No evidence this change regressed those requirements.

## Test Coverage

- File status derivation tests live in change-repository / storage specs (pre-existing).
- Engine cascade tests cover the moved algorithm.
- ArtifactFile reject test covers entity layer, not fs adapter coercion.

## Missing Tests

- Integration: writing an engine verdict must not persist `pending-parent-artifact-review` on `manifest.json` (today serialize remaps).
- Load of that token: specified reject vs actual coerce.

## Spec Dependency Chain

- `default:_global/architecture`, `core:change`, `core:change-manifest`, `default:_global/logging`, `core:lifecycle-engine`, `core:schema-format`

## Counts (`core:storage`)

| Metric                                       | Count         |
| -------------------------------------------- | ------------- |
| Requirements reviewed (delta-focused)        | 4             |
| Implemented                                  | 3             |
| Partial                                      | 1             |
| Missing                                      | 0             |
| Discrepancies critical / major / minor / low | 0 / 1 / 0 / 1 |
| Missing tests                                | 2             |

---

# Batch roll-up

## Highest-signal findings (neither side assumed true)

1. **Parent-review on the wire:** specs (`change`, `storage`) demand **reject**; fs adapter **coerces** to `in-progress`. Pick one.
2. **Overlap bypass:** check `skip` + review-blocker omit are implemented; engine does **not** re-filter failed check results against `bypassFlags`; GetStatus never supplies those flags.
3. **Fail-fast protocol** is execute-only; status collects all predicates. Spec text is written as one evaluation algorithm.
4. **AXIS_FALLBACK splice, `projectArtifacts`, no `Change.effectiveStatus`, check ABI, one binding table, archive-as-operation, no pending rewrite** — code and this change’s specs agree.

## Totals (this batch)

|                                 |                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Specs                           | 6 (+ 2 globals for consistency)                                                       |
| Requirements reviewed (approx.) | 55                                                                                    |
| Critical discrepancies          | 0                                                                                     |
| Major                           | 3 (blocker omit gap counted once under engine; persist coerce under change + storage) |
| Minor                           | 11                                                                                    |
| Low                             | 9                                                                                     |
| Missing tests (distinct)        | ~18                                                                                   |

**Major unique issues:** (A) persist/load coerce vs reject for `pending-parent-artifact-review`; (B) skippable check blockers vs `bypassFlags` / GetStatus not passing bypass.

## Files primarily inspected

- `packages/core/src/domain/services/transition-checks.ts`
- `packages/core/src/domain/services/check-bindings.ts`
- `packages/core/src/domain/services/evaluate-transition-predicates.ts`
- `packages/core/src/domain/services/lifecycle-engine.ts`
- `packages/core/src/domain/checks/spec-overlap.ts`, `workflow-requires.ts`, `impl-files-resolved.ts`
- `packages/core/src/application/checks/*` (registry, WorkflowCheck, hook-effect, spec-overlap, workflow-requires, impl-files-resolved)
- `packages/core/src/application/services/execute-matching-predicates.ts`
- `packages/core/src/application/use-cases/transition-change.ts`, `get-status.ts`, `validate-artifacts.ts`, `archive-change.ts` (effect slots)
- `packages/core/src/domain/value-objects/change-state.ts`, `artifact-file.ts`
- `packages/core/src/infrastructure/fs/change-repository.ts` (load/serialize)
- Tests: `transition-checks.spec.ts`, `lifecycle-engine.spec.ts`, `build-schema.spec.ts`, `workflow-check-factories.spec.ts`, `artifact-file.spec.ts`

---

# Partial: core-use-cases

# Spec-compliance partial: core use cases

**Auditor:** read-only (this file only).
**Change:** `workflow-transition-checks`
**Mode:** spec-preview deltas vs `packages/core` implementation
**Graph:** fresh (`stale: false`, indexed `2026-08-27T15:08:18.609Z`)
**CLI:** `node packages/cli/dist/index.js`

**Assigned specs**

| Spec ID                         | Implementation entry                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `core:get-status`               | `packages/core/src/application/use-cases/get-status.ts`               |
| `core:transition-change`        | `packages/core/src/application/use-cases/transition-change.ts`        |
| `core:archive-change`           | `packages/core/src/application/use-cases/archive-change.ts`           |
| `core:validate-artifacts`       | `packages/core/src/application/use-cases/validate-artifacts.ts`       |
| `core:get-artifact-instruction` | `packages/core/src/application/use-cases/get-artifact-instruction.ts` |
| `core:hook-execution-model`     | hooks via `createHookPre` / `createHookPost` + use-case effect loops  |

**Graph navigation used:** `graph search` on `GetStatus`, `TransitionChange`, `ArchiveChange`, `ValidateArtifacts`, `MaterializeSpecMetadata`, `executeCheckWithProgress`, `CheckProgressEvent`; `graph impact --file` on the three lifecycle use-case files; spec search for empty `checksByTarget`.

**Neither spec nor code is truth.** Each discrepancy lists both interpretations.

---

## Focus-delta scorecard

| Delta                                                                 | Verdict                         | Evidence                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress bus `check-start` / `check-progress` / `check-done`          | **Mostly implemented**          | `executeCheckWithProgress` emits start/done; `emitHookAsCheckProgress` maps `RunStepHooks` onto `check-progress` `detail`. Tests: `execute-check-with-progress.spec.ts`, `transition-change.spec.ts` (hook.post then hook.pre then `transitioned`). |
| GetStatus schema-complete `artifactStatuses`                          | **Implemented on success path** | `_buildActiveResult` iterates `schema.artifacts()`, not `change.artifacts`. Schema-failure / `unchanged` paths intentionally omit full schema projection.                                                                                           |
| `taskCompletion` from checks (no second CountTasks paint)             | **Implemented for one execute** | `taskCompletionFromChecks` reads `details.byArtifact` from `workflow.taskCompletion`. Domain runner always attaches `byArtifact`. CountTasks omits empty/missing files. **Cache over-scopes across executes** (finding F1).                         |
| TransitionChange `source.post` then `target.pre` before persist       | **Implemented**                 | `TRANSITION_BINDING_SPECS` lists `hook.post` then `hook.pre`, both `phase: before-persist`. `matchingEffects(..., 'before-persist')` preserves registry order. `_changes.mutate` follows the loop. Test asserts event order.                        |
| ArchiveChange no `RunStepHooks` ctor arg                              | **Implemented**                 | Ctor takes `archiveBindings`. `ArchiveChangeDeps` has no `runStepHooks`. Registry composes `createHookPre`/`createHookPost({ runStepHooks })`.                                                                                                      |
| `MaterializeSpecMetadata` post-commit                                 | **Implemented**                 | After `archive()` + `_batchSnapshot.cleanup`, `execute({ specId, policy: 'force' })`; failures → `staleMetadataSpecPaths`.                                                                                                                          |
| Archive post after persist, `collect`                                 | **Implemented**                 | `ARCHIVE_BINDING_SPECS` `hook.post`: `phase: after-persist`, `onFailure: collect`. Fail-soft maps to `postHookFailures`.                                                                                                                            |
| Empty `checksByTarget` for ValidateArtifacts / GetArtifactInstruction | **Implemented**                 | Both call `lifecycle.evaluate(..., { checksByTarget: {} })`. Tests spy `objectContaining({ checksByTarget: {} })`.                                                                                                                                  |

---

## `core:get-status`

### Requirements summary (delta-relevant)

- Input: `name`, optional `refreshImplementationTracking`, `ifModifiedSince`.
- Result: `artifactStatuses` schema-complete on full evaluation; empty when `unchanged`.
- Task counts from `workflow.taskCompletion` details; no global snapshot bag; no CountTasks-after-evaluate paint.
- Predicates via `check.execute` per legal target; engine I/O-free projection.
- Ctor: repo, schema, approvals, refresh, lifecycle, `transitionBindings` from `create*`.
- Factory: `resolveGetStatusDeps` + full repository bootstrap.

### Implementation status

**Aligned**

- Resolution: `get` then `getDraft`; never `getDiscarded`.
- Refresh before load unless `ifModifiedSince` short-circuit or draft / `refreshImplementationTracking === false`.
- `_buildUnchangedResult`: `artifactStatuses: []`, `unchanged: true`, no refresh.
- Success path: `projectArtifacts` → `executeChecksByLegalTargets` → `evaluate(checksByTarget)` → paint statuses from **schema artifact list**.
- `taskCompletionFromChecks` keyed by artifact type id; omitted when check details lack counts (CountTasks skips empty content).
- Schema miss: no throw; empty availableTransitions/blockers; `schemaInfo` null; statuses from attached change artifacts only (degraded path matches verify.md).
- Draft: `projectArtifacts` (spec explicitly allows this as the empty-`checksByTarget` DAG); empty `availableTransitions`.
- Composition: `createGetStatus` / `resolveGetStatusDeps` injects `transitionBindings` from `resolveWorkflowCheckRegistry`; CountTasks is inside `createWorkflowTaskCompletion`, not a GetStatus ctor port.
- Kernel: `createGetStatus(resolveGetStatusDeps(resolver))` uses the same `ChangeRepository` as the rest of the kernel (not a weaker bootstrap).

**Tests present:** `get-status.spec.ts` (CountTasks once and **before** `evaluate`; incomplete tasks hide `verifying`; blocker merge; ifModifiedSince).

### Discrepancies

#### F1 — MEDIUM — `workflow.taskCompletion` CountTasks cache is process-lifetime, not per execute

- **Spec:** GetStatus must not call CountTasks a second time **to paint** after evaluate; one CountTasks outcome may serve every legal target in **that** status evaluation.
- **Code:** `WorkflowTaskCompletionCheck` caches `{ changeName, taskCounts }` on the check instance (`workflow-task-completion.ts`). Kernel holds one `GetStatus` (`composition/kernel.ts` `status = createGetStatus(...)`) for the process. A second `GetStatus.execute` for the same name reuses stale counts.
- **If spec is right:** cache must be scoped to one `executeChecksByLegalTargets` / one TransitionChange attempt (or keyed by `updatedAt` / content), then cleared.
- **If code is right:** spec should say “at most one CountTasks per check instance until change name changes,” and accept stale status on long-lived kernels (MCP). CLI one-shot kernels hide this.
- **Tests:** `get-status.spec.ts` asserts `countTasks.execute` once **within a single execute**, which both interpretations pass. No test for two executes with intervening file edits.

#### F2 — LOW — “one status entry per artifact **attached to the change**” vs schema iteration

- **Spec (result shape):** `artifactStatuses` is one entry per artifact attached to the change.
- **Spec (factory / this change):** statuses must reflect **complete schema-driven** derivation.
- **Code:** success path is `for (const artifactType of schema.artifacts())`. Extra change-only types are dropped; schema types with no change artifact appear as `missing`.
- **If spec result-shape is right:** iterate `change.artifacts` (or union).
- **If schema-complete delta is right (likely):** tighten the result-shape sentence to “one row per schema artifact type.”
- **Tests:** full-status tests assert `artifactStatuses.length > 0` but not “every schema id present when the change has a subset.”

### Test coverage / missing tests

| Requirement                                         | Coverage                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| CountTasks before evaluate, once per execute        | Yes                                                                        |
| `taskCompletion` omitted for empty files            | Indirect (CountTasks unit); GetStatus paint from `byArtifact` not isolated |
| Schema-complete rows for types absent on the change | Missing                                                                    |
| Cross-execute cache freshness                       | Missing                                                                    |
| Progress bus                                        | N/A (GetStatus does not pass `onCheckProgress`)                            |

### Spec dependencies (depth 1)

`core:transition-checks`, `core:lifecycle-engine`, `core:drafted-change-view`, `core:refresh-implementation-tracking`, `core:composition-resolver`. No contradiction found with those beyond F1/F2 wording.

**Counts:** requirements sampled ~14 delta-critical; implemented 12; discrepancies 2; missing tests 2.

---

## `core:transition-change`

### Requirements summary (delta-relevant)

- Predicates via `executeMatchingPredicates`; map first fail to existing errors; no second algorithm.
- Effects: registry `before-persist`, **not** `check.id` switch; `source.post` then `target.pre`; then `mutate`.
- No `RunStepHooks` / `CountTasks` on the use-case ctor.
- Progress: generic check bus + `requires-check` / `task-completion-failed` / `transitioned`.
- No first-class public `hook-start` / `hook-done`.

### Implementation status

**Aligned**

- Ctor: `changes`, `actor`, `schemaProvider`, `refresh`, `approvals`, `lifecycle`, `transitionBindings`.
- `resolveTransitionChangeDeps` does not put `runStepHooks` on the use case.
- `failFast: true` on predicates; `_mapFailedPredicate` covers protocol/requires/tasks/approvals/deps/readOnly/impl.
- Effects: `matchingEffects(bindings, attempt, 'before-persist', along)` then `executeCheckWithProgress(binding.check, ctx)` — no id switch.
- Binding order: `hook.post` (forward) then `hook.pre` (except recovery) in `check-bindings.ts`.
- Skip: `skipHookPhases` on ctx; `HookEffectCheck` matches `all` / `source.post` / `target.pre` — **not** `binding.phase` alone (both effects share `before-persist`).
- Persist only after effects; `HookFailedError` via `throwHookFailed` when `onFailure` abort.
- Progress union includes `CheckProgressEvent`; hooks map to `check-progress` details (`hook-effect.ts`).
- Test: `check-start(hook.post)` → `check-done(hook.post)` → `check-start(hook.pre)` → `check-done(hook.pre)` → `transitioned`.

### Discrepancies

#### F3 — LOW — skipped effects still emit `check-start` / `check-done`

- **Spec:** when `skipHookPhases` includes `all` / `source.post` / `target.pre`, those **run:** effects are skipped.
- **Code:** the use case still iterates matching effects and calls `execute`. Skip is inside `HookEffectCheck.execute` (returns `skip` before `RunStepHooks`). `executeCheckWithProgress` still emits start/done with `outcome: 'skip'`.
- **If spec is right:** omit the effect from the loop when skipped, or do not wrap skip in the bus.
- **If code is right:** spec should say skipped effects still appear on the bus as `check-done` / `skip` so UIs can show “skipped.”
- **Tests:** skip-all still enforces predicates; bus-on-skip not asserted.

#### F4 — INFO — `source.pre` / `target.post` selectors are API-only

- Type and spec list `'source.pre'` and `'target.post'`. No transition effect is `after-persist`. Selectors are no-ops. Acceptable if reserved; otherwise spec over-promises.

### Test coverage / missing tests

| Requirement                                      | Coverage                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Generic bus + hook order before persist          | Yes (`transition-change.spec.ts`)                                     |
| Predicate `check-start`/`check-done` (e.g. deps) | Yes                                                                   |
| `executeCheckWithProgress` throw → done fail     | Yes                                                                   |
| Mid-flight `check-progress` from hooks           | Yes in hook order test (`hook-start` as **detail**, not public type)  |
| Skip-all still rejects incomplete tasks          | Covered in change (skill verify scenarios); confirm in same spec file |

**Counts:** delta-critical ~12; implemented 11; discrepancies 1–2 (F3/F4); missing tests 1.

---

## `core:archive-change` + `core:hook-execution-model` (archive slice)

### Requirements summary (delta-relevant)

- Ctor: `archiveBindings`, **not** `RunStepHooks`.
- Predicates then `before-persist` effects (abort) then persist/publish then `after-persist` (collect).
- Post-commit `MaterializeSpecMetadata` `policy: 'force'`; failures collected.
- Skip by binding phase + archive selectors `pre`/`post`/`all`, not check id.
- `instruction:` never executed (inside `RunStepHooks` / hook check).

### Implementation status

**Aligned**

- Ctor and `createArchiveChangeFromNormalized` pass `archiveBindings` in the 4th slot; no `RunStepHooks`.
- `resolveArchiveChangeDeps`: `archiveBindings: registry.archiveBindings`; `materializeMetadata: createMaterializeSpecMetadata(...)`.
- Predicates: `executeMatchingPredicates(archiveBindings, archiveAttempt)`.
- Before persist: `matchingEffects(..., 'before-persist')` + fail-fast `throwHookFailed`.
- After `archive()` + `cleanup`: materialize loop, then `matchingEffects(..., 'after-persist')` with collect → `postHookFailures`.
- Archive bindings: `hook.pre` before-persist abort; `hook.post` after-persist collect.
- `archive.archivable` calls `change.assertArchivable()` inside the check.

### Discrepancies

#### F5 — LOW — `ActorResolver.identity()` timing vs “after publications”

- **Spec (Archive repository call):** after canonical publications succeed, resolve actor **then** call `archive()`.
- **Code:** `archivingActor = await this._actor.identity()` **before** hooks/preflight (line ~316); same identity used for `archiving` transition and `archive()`.
- **If spec is right:** move identity() to immediately before `this._archive.archive`, and if it throws after publications, run batch restore (spec’s stated reason).
- **If code is right:** fail closed before any write; spec should allow a single identity captured before the archive pipeline.
- **Tests:** unlikely to distinguish timing unless identity is mocked to fail mid-flight.

#### F6 — INFO — overlap detection runs in the use case **and** in `spec.overlap`

- `execute` still calls `detectSpecOverlap` to build `relevantOverlap` for invalidation / `SpecOverlapError` mapping.
- The `spec.overlap` check also detects via composition `detectSpecOverlap`.
- Not a functional break if both agree; spec’s overlap **algorithm** is duplicated. Prefer one owner.

### Test coverage

- Archive CLI `change-archive.spec.ts` asserts `check-start` on the bus.
- Core archive tests should cover postHookFailures collect and no RunStepHooks ctor (composition/type).

**Counts:** delta-critical ~10; implemented 9; discrepancies 2 (F5/F6); missing tests: identity-after-publish, duplicate overlap.

---

## `core:validate-artifacts`

### Requirements summary (delta-relevant)

- DAG via `LifecycleEngine.evaluate` with **empty** `checksByTarget`; no hop predicates; no `gatherPredicateSnapshots`.
- Factory: `listWorkspaces` + `lifecycle` via `resolveValidateArtifactsDeps`.

### Implementation status

**Aligned (focus)**

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

- No `executeMatchingPredicates` / CountTasks on this path.
- `resolveValidateArtifactsDeps` matches the factory verify scenario (`listWorkspaces`, not a spec-repo map on deps).

### Discrepancies

#### F7 — LOW — constructor snippet in spec.md contradicts factory + code

- **Spec “Ports and constructor”** still shows `specs: ReadonlyMap<string, SpecRepository>` and no `ListWorkspaces`.
- **Spec factory + code:** `ListWorkspaces` (same pattern as ArchiveChange).
- **If constructor snippet is right:** code would be wrong (it is not what the factory/verify require).
- **If factory/code are right:** delete/replace the TypeScript constructor block in spec.md (spec drift from this change).

#### F8 — LOW (out of focus but adjacent) — in-invocation DAG update is a local `markVerdictComplete`, not `evaluate` again

- Spec: recompute lifecycle after each persisted completion in one `execute`.
- Code: completions are persisted in **one** `mutate` at the end; during the loop, `markVerdictComplete` patches `effectiveStatus: 'complete'` without re-running `evaluate` (cascade / pending-parent may stay stale for later artifacts).
- Dual: spec wants full engine re-project; code wants cheap local complete flags. Not the empty-`checksByTarget` delta.

### Test coverage

- `validate-artifacts.spec.ts` spies `evaluate(..., { checksByTarget: {} })`.
- Missing: constructor-snippet vs ListWorkspaces (docs); re-evaluate after in-pass completion.

**Counts:** focus requirements 2; implemented 2; spec-internal 1 (F7); adjacent 1 (F8).

---

## `core:get-artifact-instruction`

### Requirements summary (delta-relevant)

- `evaluate` with empty `checksByTarget` for `nextArtifact` / DAG; no hop predicates; no snapshot bag.
- Ctor includes `LifecycleEngine`.
- Factory through `resolveGetArtifactInstructionDeps`.

### Implementation status

**Aligned**

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

- Default `new LifecycleEngine(...)` in ctor is a test convenience; kernel injects `resolver.getLifecycleEngine()`.
- Template vars: `{ change: { name, path } }` only.
- Tests: `get-artifact-instruction.spec.ts` `checksByTarget: {}` spy; omitted `artifactId` uses engine.

### Discrepancies

None on the assigned empty-`checksByTarget` delta.

**Counts:** focus requirements 3; implemented 3; discrepancies 0.

---

## `core:hook-execution-model` (cross-cutting)

### Aligned

- Two hook kinds; `run:` via `RunStepHooks` inside effect checks.
- Transition: both hook effects `before-persist` + `abort`; archive post `after-persist` + `collect`.
- Use cases do not branch on `hook.pre` / `hook.post` **ids** for slot/policy; they filter `matchingEffects(..., phase)`.
- Skip selectors for the two real slots: transition `source.post`/`target.pre`/`all`; archive `pre`/`post`/`all`.
- `Change` entity does not run hooks.

### Residual

- F3 (bus still fires on skip).
- F4 (unused `source.pre` / `target.post`).
- Transition `hook.pre` `along: '*'` except recovery matches redesign (spec: target.pre including redesign).

---

## Spec vs global constraints

- Hexagonal: I/O in application checks (`create*`), engine I/O-free — **held**.
- `default:_global/testing`: use-case tests exist for the bus, empty `checksByTarget`, CountTasks-once-per-execute.
- `core:transition-checks`: progress event types match `transition-checks.ts` `CheckProgressEvent`.

---

## Summary counts (this batch)

|                            |                                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| Specs audited              | 6                                                                |
| Focus deltas checked       | 8                                                                |
| Focus deltas implemented   | 8 (F1 is a cache-scope defect on an otherwise implemented delta) |
| Findings high              | 0                                                                |
| Findings medium            | 1 (F1)                                                           |
| Findings low               | 6 (F2–F5, F7–F8)                                                 |
| Findings info              | 2 (F4, F6)                                                       |
| Highest risk for reviewers | F1 (stale taskCompletion / gating on long-lived Kernel)          |

### Suggested reviewer actions (do not apply in this audit)

1. Scope `WorkflowTaskCompletionCheck` cache to a single host execute (or include `change.updatedAt`).
2. Fix `core:validate-artifacts` constructor TypeScript to `ListWorkspaces`.
3. Decide whether skipped effects belong on the progress bus.
4. Optionally add GetStatus test: schema type with no change artifact still appears in `artifactStatuses`.

---

# Partial: cli-skills

# Partial audit: CLI + skills + approve/config (assigned batch)

**Batch:** cli-skills  
**Mode:** change (`workflow-transition-checks`) via `changes spec-preview`  
**Auditor:** read-only; neither spec nor code treated as truth  
**Graph:** `stale: false`, `contentFresh: true`, indexed `2026-08-27T15:08:18.609Z`, ref `2948f1a2`, CLI workspace `VCS_UNMODIFIED`  
**CLI:** `node packages/cli/dist/index.js`

**Assigned specs (spec-preview):**

- `cli:change-status`
- `cli:change-transition`
- `cli:change-approve`
- `cli:change-archive`
- `skills:skill-templates-source`
- `core:approve-spec`
- `core:approve-signoff`
- `core:config`

**Focus:** text status review header without file lists; `--next` adapter routing; check progress presenter; stay-in-ready/done approvals; skill templates stay-in-state; archive `--skip-hooks pre`. Also `default:_global/testing` test-path mirroring vs CLI tests under `test/commands/change/`.

**Project-wide specs consulted (depth 1 / globals):** `default:_global/architecture`, `default:_global/testing`, `default:_global/conventions`, `default:_global/spec-layout`. Direct deps noted per spec.

---

## Method

- Spec content: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`
- Navigation: `graph stats`, `graph search` (`createCheckProgressPresenter`, `resolveNextTarget`, `ApproveSpec`, `boundFromStates`, `recordSpecApproval`, `skipHookPhases`), `graph impact --file` on CLI command files
- Implementation (after graph locate):
  - `packages/cli/src/commands/change/status.ts`
  - `packages/cli/src/commands/change/transition.ts` (`resolveNextTarget`)
  - `packages/cli/src/commands/change/archive.ts`
  - `packages/cli/src/commands/change/approve.ts`
  - `packages/cli/src/commands/change/_check-progress-presenter.ts`
  - `packages/cli/src/handle-error.ts`
  - `packages/core/src/application/use-cases/approve-spec.ts`
  - `packages/core/src/application/use-cases/approve-signoff.ts`
  - `packages/core/src/composition/use-cases/approve-spec.ts`
  - `packages/skills/templates/skills/*/SKILL.md.tpl`, `templates/shared/shared.md.tpl`
- Tests: `packages/cli/test/commands/change-*.spec.ts`, `packages/cli/test/commands/change/*.spec.ts`, `packages/core/test/application/use-cases/approve-*.spec.ts`, `packages/skills/test/template-workflow.spec.ts`

Graph dependents of `_check-progress-presenter.ts`: `archive.ts`, `transition.ts`, plus tests `change-archive.spec.ts`, `change-transition.spec.ts`, `change/change-transition.spec.ts`, `change.spec.ts`. Not used by `run-hooks` (still `_hook-progress-presenter`).

---

## Focus findings (executive)

| Focus                                        | Verdict                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text status review header without file lists | **Compliant**                          | When `review.required`, text prints `review:` + `required` / `route` / `reason` only. Absolute `affectedArtifacts` paths are not reprinted. Files appear under `artifacts (details):`. Overlap peers print as `overlap:` when `reason === 'spec-overlap-conflict'`. JSON/TOON still serialize full `review` including `overlapDetail` and `affectedArtifacts`. Help schema lists both. Tests: `change/change-status.spec.ts`, `change-status.spec.ts`, `change.spec.ts`. |
| `--next` adapter routing                     | **Compliant** (cross-spec tension, D3) | `resolveNextTarget` implements the documented table including `signed-off → archivable` and stderr refusals for pending/archivable/archiving. CLI then calls `TransitionChange.execute({ name, to, skipHookPhases })`. Spec now labels this **adapter routing**, not a second availability algorithm. Architecture still forbids domain logic in adapters; the change spec carves an explicit exception.                                                                 |
| Check progress presenter                     | **Compliant**                          | Shared `createCheckProgressPresenter`. Text: `<label> (<id>)` then `✓`/`✗`; no `Executing:` prefix. Streams `change-transition` / `change-archive`. Hooks ride the same bus. `HookFailedError` → exit 2 via `handleError`, no Repair Guide.                                                                                                                                                                                                                              |
| Stay-in-ready / stay-in-done approvals       | **Compliant**                          | `ApproveSpec` / `ApproveSignoff` record consent without transitioning from bound `from` states; drain only from pending. CLI help uses bound-`from` language (`ready` / `done`). CLI passes `{ name, reason }` only.                                                                                                                                                                                                                                                     |
| Skill templates stay-in-state                | **Compliant**                          | `template-workflow.spec.ts` asserts no happy-path pending hops; design/implement/verify/archive/entry/shared copy matches `In-place approval gates`. Design must not say files are listed under `review:`.                                                                                                                                                                                                                                                               |
| Archive `--skip-hooks pre`                   | **Compliant**                          | Archive skill examples use `--skip-hooks pre` not `all`; no post `run-hooks`. CLI maps `pre`/`post`/`all` to `skipHookPhases`. Tests: `change-archive.spec.ts` + `template-workflow.spec.ts`.                                                                                                                                                                                                                                                                            |
| `default:_global/testing` path mirroring     | **Discrepancy D1**                     | CLI tests do not mirror `src/commands/change/<file>.ts` → `test/commands/change/<file>.spec.ts`. Split between flat `test/commands/change-*.spec.ts` and nested `test/commands/change/change-*.spec.ts`.                                                                                                                                                                                                                                                                 |

---

## Requirements Summary

### cli:change-status (15 requirements)

| #   | Requirement                                        | Normative gist                                                                                                                                                                |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                                  | `change status <name> [--format text\|json\|toon]`                                                                                                                            |
| S2  | Drafted change status is read-only                 | `draftView`; no mutating transitions; indicate drafted                                                                                                                        |
| S3  | Output format                                      | JSON/TOON `artifactDag.hasTasks`; DAG `state` is display projection                                                                                                           |
| S4  | Task completion display in DAG                     | `[hasTasks - N/M done]` vs fallback `[hasTasks]`                                                                                                                              |
| S5  | Display-state rendering                            | Text prefers display status; JSON has canonical + display                                                                                                                     |
| S6  | Lifecycle projections from GetStatus               | MUST NOT locally re-filter protocol graph / `VALID_TRANSITIONS`                                                                                                               |
| S7  | **Text status omits duplicated review file lists** | Print `review:` header (`required`/`route`/`reason`); MUST NOT print `affectedArtifacts` paths; overlap peers still print; JSON has full `review`; help lists `overlapDetail` |
| S8  | Text blockers include check labels                 | `! <CODE> — <label>: <message>`                                                                                                                                               |
| S9  | Schema version warning                             | Compare recorded vs `lifecycle.schemaInfo`; skip if null                                                                                                                      |
| S10 | Change not found                                   | exit 1 + `error:`                                                                                                                                                             |
| S11 | Schema-derived fields                              | DAG from `schema.artifactDag()`, `childrenOf`                                                                                                                                 |
| S12 | Delegates refresh to GetStatus                     | No direct Refresh/Detector; default refresh unless future opt-out                                                                                                             |
| S13 | Implementation section                             | `--implementation` uses SDK projection                                                                                                                                        |
| S14 | Task completion in details                         | `tasks: N/M`                                                                                                                                                                  |
| S15 | Basic info + specs and dependencies                | name/state; no standalone `specs:` list; `specDependsOn` section                                                                                                              |

### cli:change-transition (14 requirements)

| #   | Requirement                       | Normative gist                                                                                                  |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| T1  | Command signature                 | `<name> <step>` or `--next`; skip-hooks `source.pre`…`all`; format                                              |
| T2  | Next-transition resolution        | Fixed forward map as **adapter routing**; `--next` forbidden on pending/archivable; `signed-off` → `archivable` |
| T3  | Delegates refresh policy          | No direct refresh; pre + repair `GetStatus` with `refreshImplementationTracking: false`                         |
| T4  | Approval-gate routing             | No gate flags on execute; do not rewrite to pending parking states                                              |
| T5  | Hook execution                    | Map `--skip-hooks` → `skipHookPhases`                                                                           |
| T6  | Progress output                   | Shared check bus; JSON/TOON `stream: "change-transition"`; never `hook-progress`                                |
| T7  | Transition hook observability     | Surface hook progress even if later fail                                                                        |
| T8  | Shared hook progress presentation | Check-progress presenter; distinct from `run-hooks`                                                             |
| T9  | Output on success                 | Text confirmation stdout; JSON terminal `complete` with `result/name/from/to`                                   |
| T10 | Post-hook failure                 | Hook fail → exit 2; no Repair Guide                                                                             |
| T11 | Invalid transition error          | Exit 1; Repair Guide **stderr**; label form; JSON failure `complete`                                            |
| T12 | Incomplete tasks error            | Exit 1; skip-hooks must not bypass predicates                                                                   |
| T13 | Check progress rendering          | Gerund `<label> (<id>)` then `✓`/`✗`; no `Executing:`                                                           |
| T14 | Unsatisfied requires error        | Exit 1; repair from GetStatus                                                                                   |

### cli:change-approve (7 requirements)

| #   | Requirement               | Normative gist                                                               |
| --- | ------------------------- | ---------------------------------------------------------------------------- |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` required                             |
| A2  | Delegates gate state      | `kernel.changes.approveSpec` / `approveSignoff` with `{ name, reason }` only |
| A3  | Artifact hash computation | CLI must not compute or pass hashes                                          |
| A4  | Approve spec behaviour    | Stay in `ready` on success; help uses bound-`from` (`ready`)                 |
| A5  | Approve signoff behaviour | Stay in `done` on success; help uses bound-`from` (`done`)                   |
| A6  | Output on success         | Text `approved <gate> for <name>`; JSON `{ result, gate, name }`             |
| A7  | Error cases               | Missing `--reason`, unknown sub-verb, wrong state, missing change → exit 1   |

### cli:change-archive (10 requirements)

| #   | Requirement                  | Normative gist                                                                         |
| --- | ---------------------------- | -------------------------------------------------------------------------------------- |
| R1  | Command signature            | Canonical `changes archive`; alias `change archive`; `--skip-hooks` `pre`/`post`/`all` |
| R2  | Prerequisites                | Must be `archivable`; else exit 1 naming state                                         |
| R3  | Behaviour                    | Delegate merge/move/history to `ArchiveChange`                                         |
| R4  | Hook execution               | Map `--skip-hooks` to archive `skipHookPhases`                                         |
| R5  | Check progress rendering     | Same gerund bus; stream `change-archive`                                               |
| R6  | Post-archive hooks           | Post-hook failures → exit 2                                                            |
| R7  | Output on success            | Path line; omit invalidated when empty; JSON follows R9                                |
| R8  | Output on success (extended) | Invalidated list when overlap                                                          |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"`; terminal `complete`; no second unwrapped object     |
| R10 | Error cases                  | Missing name, not found, not archivable, merge failure → exit 1                        |

### skills:skill-templates-source (focus subset of 18+ requirements)

Full spec also covers template layout, frontmatter, graph terminology, optimizer gating, etc. **This batch deep-audits the change-owned workflow requirements:**

| #   | Requirement                                         | Normative gist                                                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| K1  | In-place approval gates in workflow templates       | Stay-in `ready`/`done`; no `change transition` into pending; entry skill router-only |
| K2  | Implementation tracking in verify/implement         | Verify drains open files; implement zero-open before `/specd-verify`                 |
| K3  | Archive skill skips only pre hooks                  | `--skip-hooks pre`; no post `run-hooks`                                              |
| K4  | Design skill review scope without review file lists | MAY key `review: required: yes`; MUST NOT say files listed under text `review:`      |

Other skills requirements (source location, metadata, frontmatter, graph impact wording) are **spot-checked as pre-existing**; not re-audited line-by-line unless they contradict this change.

### core:approve-spec (8 requirements)

| #   | Requirement                             | Normative gist                                                                               |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| P1  | Gate guard                              | Disabled → `ApprovalGateDisabledError` before repo I/O; then load, actor, schema, name match |
| P2  | Change lookup                           | Missing → `ChangeNotFoundError`                                                              |
| P3  | Artifact hash computation               | Skip missing/skipped/null; cleanup then hash; keys `type:key`                                |
| P4  | Approval recording and state transition | `recordSpecApproval`; stay in bound `from` (`ready`); drain pending → `spec-approved`        |
| P5  | Persistence and return                  | `mutate`; return updated `Change`                                                            |
| P6  | Input contract                          | `{ name, reason }` only; no gate flags                                                       |
| P7  | Approval gate baked at construction     | `approvals: ApprovalGates` from `config.approvals`                                           |
| P8  | Config-based factory                    | `resolveApproveSpecDeps` then canonical `createApproveSpec(deps)`                            |

### core:approve-signoff (8 requirements)

Mirror of approve-spec for `done` / `pending-signoff` / `signed-off` / `recordSignoff` / `resolveApproveSignoffDeps`.

### core:config (many requirements; this change owns Approvals)

| #           | Requirement | Normative gist for this change                                                                                                                                                                        |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-Approvals | Approvals   | `approvals.spec` / `signoff` default false; in-place checks; stay in `ready`/`done`; new work MUST NOT enter pending via `change transition`; redesign `ready → designing` MUST NOT require spec gate |

Other config requirements (location, workspaces, storage, plugins, …) are **out of this change’s delta** except Spec Dependencies now include `core:transition-checks`.

---

## Implementation Status

### cli:change-status — implemented

- `kernel.changes.status.execute({ name })` only (default refresh). Graph: no `RefreshImplementationTracking` on this command path. Tests assert refresh use case is not called (`change-status.spec.ts`).
- Text lifecycle uses `lifecycle.availableTransitions` (~264–266), not a local `VALID_TRANSITIONS` union.
- **S7:** `review.required === true` → header with required/route/reason (~248–254). No loop over `affectedArtifacts`. Overlap block (~326–337) only for `spec-overlap-conflict` + non-empty `overlapDetail`. Details section still prints filenames (~341–357). JSON `review` includes `overlapDetail` and `affectedArtifacts` (~446–458). Help after-text lists `overlapDetail` alongside `affectedArtifacts` (~116–125).
- Blockers: label form `! ${code} — ${label}: ${message}` (~238–243).
- Specs-and-dependencies after DAG, before blockers; no standalone `specs:` list.

### cli:change-transition — implemented

- **T2:** `resolveNextTarget` (`transition.ts` ~159–188): drafting→designing→ready→implementing; spec-approved→implementing; implementing→verifying→done→archivable; signed-off→archivable; pending/archivable/archiving → `cliError` (exit 1).
- Then `kernel.changes.transition.execute({ name, to, skipHookPhases }, onProgress)` — no `approvalsSpec`/`approvalsSignoff`.
- **T3:** First and repair status calls use `refreshImplementationTracking: false`. Tests assert refresh use case not called.
- **T5:** `VALID_HOOK_PHASES` + `parseCommaSeparatedValues`; empty set when flag omitted. Verify now allows `skipHookPhases` (empty) — previous “exactly `{ name, to }`” verify drift is **resolved**.
- **T6–T8/T13:** `createCheckProgressPresenter({ streamName: 'change-transition', stream: text ? stderr : stdout })`. Extra event types (`requires-check`, `transitioned`, `task-completion-failed`) tagged `change-transition`. Tests assert no `Executing:` and no `hook-progress`.
- **T9/T11/T10:** Text success on stdout; repair guide on stderr; `HookFailedError` → `handleError` exit 2.

### cli:change-approve — implemented

- Commander `requiredOption('--reason')`; `kernel.changes.approveSpec.execute({ name, reason })` / `approveSignoff` same shape.
- Help: “change in **ready**” / “change in **done**” with drain language.
- Success copy and JSON object match A6 (not a check stream).

### cli:change-archive — implemented

- Registered on `changes` with `change` alias (`cli:src/index.ts` via graph dependents).
- Archive selectors `pre`/`post`/`all` distinct from transition’s `source.*`/`target.*`.
- Presenter `streamName: 'change-archive'`; JSON terminal `complete` with `archivePath` + `invalidatedChanges`.
- Post-hook failures: `cliError(..., 2)` before success print.
- Extra flag `--allow-out-of-scope` exists in code but is not in this spec’s command-signature list (D2).

### skills:skill-templates-source — implemented (focus)

- `packages/skills/test/template-workflow.spec.ts`: stay-in-`done`/`ready`; no pending parking in verify/design/archive/entry; shared forbids agent `changes approve`; new-skill table drain-only pending rows; archive `--skip-hooks pre` not `all`; design `not.toMatch(/listed under \`review:\`/)`.
- Templates inspected via those tests + `specd-archive/SKILL.md.tpl` (`--skip-hooks pre` on archive invocations).

### core:approve-spec / core:approve-signoff — implemented

- Gate disabled first; `get` not called (`approve-spec.spec.ts`).
- Bound `from` via `boundFromStates('approval.spec'|'approval.signoff')`; stay in that state; drain pending with `transition`.
- Hashes inside `mutate` on fresh change (satisfies “hash then record” and “record on mutate instance”).
- Composition: `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`; kernel uses deps form (`composition/kernel.ts`).

### core:config Approvals — implemented as documentation + engine consumers

- Merged spec-preview Approvals section matches the change delta (in-place checks, no pending hops).
- Behaviour is enforced by lifecycle/transition checks and approve use cases, not by the YAML parser itself. Config loader still parses `approvals.spec` / `approvals.signoff` booleans consumed at kernel construction.

---

## Discrepancies

Neither side assumed correct. Each item lists spec evidence, code evidence, and both interpretations.

### D1 — Medium — `default:_global/testing` test-path mirroring vs CLI tests

**Spec (`default:_global/testing`):** Tests live in `test/` **mirroring `src/`**. A source `src/domain/entities/change.ts` maps to `test/domain/entities/change.spec.ts`. File names match the source file (`change.ts` → `change.spec.ts`). Behaviour tests use `"given <state>, when <action>, then <outcome>"`.

**Code / tests:**

| Source                                             | Expected mirror                                          | Actual                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/commands/change/status.ts`                    | `test/commands/change/status.spec.ts`                    | `test/commands/change-status.spec.ts` **and** `test/commands/change/change-status.spec.ts`         |
| `src/commands/change/transition.ts`                | `test/commands/change/transition.spec.ts`                | `test/commands/change-transition.spec.ts` **and** `test/commands/change/change-transition.spec.ts` |
| `src/commands/change/approve.ts`                   | `test/commands/change/approve.spec.ts`                   | `test/commands/change-approve.spec.ts` **and** `test/commands/change/change-approve.spec.ts`       |
| `src/commands/change/archive.ts`                   | `test/commands/change/archive.spec.ts`                   | `test/commands/change-archive.spec.ts` only (flat)                                                 |
| `src/commands/change/_check-progress-presenter.ts` | `test/commands/change/_check-progress-presenter.spec.ts` | No dedicated file; coverage via command specs                                                      |

- **Spec too strict / historical CLI layout:** The CLI package has long used `test/commands/change-<verb>.spec.ts` next to other top-level command tests. Nested `test/commands/change/` was added for this change’s extra scenarios without relocating the originals.
- **Implementation / process gap:** Duplicate suites for status/transition/approve can drift (same review-header scenarios exist in `change.spec.ts`, `change-status.spec.ts`, and `change/change-status.spec.ts`). Presenter has no file-named unit test.
- **Fix either:** Relax global testing spec for CLI command grouping, **or** consolidate to one mirrored tree (`test/commands/change/<file>.spec.ts`) and delete the duplicate flat files.

This is a **global-spec vs change delivery** finding, not a missing lifecycle behaviour.

### D2 — Low — `cli:change-archive` signature omits `--allow-out-of-scope`

**Spec:** Command signature lists `--skip-hooks`, `--allow-overlap`, `--format` (and alias).  
**Code:** Also registers `--allow-out-of-scope` and forwards `allowOutOfScope` to `ArchiveChange`. Archive skill templates mention `--allow-out-of-scope`.

- **Spec incomplete:** Flag is a real adapter contract owned elsewhere (`core:archive-change` / skills) but not listed on `cli:change-archive` signature.
- **Implementation bug:** Unlikely; tests and skills depend on the flag.
- **Fix either:** Add the flag to the CLI signature requirement, or treat it as owned solely by archive-change and reference it.

### D3 — Low — `default:_global/architecture` vs CLI `--next` table

**Architecture:** Adapter packages translate to use cases; they must not contain domain lifecycle algorithms.  
**cli:change-transition (this change):** The `--next` table is **adapter routing** to a `to` state; it MUST NOT replace `GetStatus.nextAction` or hop predicates. Paragraph is duplicated twice in the merged spec.md (copy-paste).  
**Code:** `resolveNextTarget` switch in `transition.ts` (lifecycle graph in the adapter). `GetStatus.nextAction.command` is a skill command, so it cannot fully replace this table.

- **Spec/architecture tension:** The change documents an exception; architecture was not updated to mention presentation routing tables.
- **Implementation bug:** Not observed; execute still runs hop predicates.
- **Fix either:** Add one sentence to architecture, or move the table behind a core helper that returns a `to` (would still be a mapping). Deduplicate the repeated paragraph in `cli:change-transition` spec.md.

### D4 — Low — `cli:change-transition` Purpose vs Requirements

**Purpose:** “transparently routing through approval gates when enabled”.  
**Requirements T4:** CLI MUST NOT rewrite `implementing`/`archivable` to pending parking states; failed gates stay in `ready`/`done`.

- **Spec drift (purpose leftover):** Agents reading only Purpose could reintroduce pending hops.
- **Implementation:** Matches Requirements, not Purpose.
- **Fix:** Rewrite Purpose to stay-in-state + human approve.

### D5 — Low — ApproveSpec test describe names still pending-centric

**Spec verify:** Wrong-state scenario is “Change is not in ready or pending-spec-approval” / drafting throws.  
**Code tests:** `describe('given the change is not in pending-spec-approval state')` still uses the old title; the fixture is `makeChange` (drafting) and assertion is correct. Happy-path `ready` is covered separately (`records consent and stays in ready`).

- **Test-name drift**, not a behaviour bug.
- **Fix:** Rename describe to match verify (“not in ready or pending-spec-approval”).

### Previously reported, now resolved (not counted as open)

- Verify “Transition execute called with `{ name, to }` only” — current verify **AND** allows `skipHookPhases` (empty when omitted). Matches code.
- Text status omitting the entire `review:` header — current spec **requires** the header without file lists; code and tests match.

---

## Test Coverage

| Area                                                  | Covered?                                                                                                                                      | Where                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7 review header, no absolute paths, files in details | Yes                                                                                                                                           | `test/commands/change/change-status.spec.ts` (`given artifact-review-required…`, drift variant); also `change-status.spec.ts`, `change.spec.ts`    |
| S7 JSON `overlapDetail`                               | Yes                                                                                                                                           | `change-status.spec.ts`                                                                                                                            |
| S7 help lists `overlapDetail`                         | Implementation yes; **no test** that `--help` contains the field                                                                              | —                                                                                                                                                  |
| S6 availableTransitions passthrough                   | Yes                                                                                                                                           | JSON status tests                                                                                                                                  |
| S12 no direct refresh                                 | Yes                                                                                                                                           | `change-status.spec.ts`                                                                                                                            |
| T2 `--next` map + refusals + signed-off               | Yes                                                                                                                                           | `change-transition.spec.ts` (`resolves ready --next…`, `signed-off`, `--next failures`)                                                            |
| T3 refresh false                                      | Yes                                                                                                                                           | same file                                                                                                                                          |
| T4 no pending rewrite on `--next` from ready          | Yes (CLI requests `implementing`; stay-in-ready is a **core** execute outcome; CLI test asserts `to: 'implementing'` without pending routing) | `change-transition.spec.ts`                                                                                                                        |
| T5 skipHookPhases                                     | Yes                                                                                                                                           | `change-transition.spec.ts`                                                                                                                        |
| T6/T13 presenter, no Executing, stream name           | Yes                                                                                                                                           | `change-transition.spec.ts`, `change-archive.spec.ts`; nested `change/change-transition.spec.ts` (repair guide)                                    |
| T10 no repair guide on hook fail                      | Yes (asserted in prior/current transition tests; handleError maps `HookFailedError` to exit 2)                                                | CLI transition tests + `handle-error.ts`                                                                                                           |
| A1–A7                                                 | Yes                                                                                                                                           | `change-approve.spec.ts` + `change/change-approve.spec.ts` (call shape `{ name, reason }`)                                                         |
| Stay-in-ready/done **domain**                         | Yes                                                                                                                                           | `core/test/application/use-cases/approve-spec.spec.ts`, `approve-signoff.spec.ts`                                                                  |
| R4 `--skip-hooks pre`                                 | Yes                                                                                                                                           | `change-archive.spec.ts` (`passes skipHookPhases with pre only`)                                                                                   |
| R5/R9 presenter + JSON stream                         | Yes                                                                                                                                           | `change-archive.spec.ts`                                                                                                                           |
| K1–K4 templates                                       | Yes                                                                                                                                           | `packages/skills/test/template-workflow.spec.ts`                                                                                                   |
| P8 factory deps                                       | Yes                                                                                                                                           | `core/test/composition/use-cases/approve-spec.spec.ts`                                                                                             |
| C-Approvals YAML semantics                            | Indirect                                                                                                                                      | Engine/transition tests (`lifecycle-engine.spec.ts`, `transition-change.spec.ts`); **no dedicated config-loader scenario** quoting “stay in ready” |

CLI command tests mock the kernel (no real fs) — consistent with `default:_global/testing` unit-test rule.

---

## Missing Tests

1. **`--help` JSON schema includes `overlapDetail`** — spec MUST list it; implementation does; no assertion on help text.
2. **Dedicated `_check-progress-presenter.spec.ts`** — gerund/`Executing:`/stream-name covered only via command integration-style CLI tests.
3. **Consolidate duplicate CLI suites** — not a missing scenario, but missing a single source of truth for status/transition/approve tests (see D1).
4. **Config loader test** that `approvals.spec: true` does not imply a pending hop in parsed config (semantics live in engine; optional if considered owned by `core:transition-checks`).
5. **ApproveSpec persist-from-ready mutate spy** — stay-in-ready checks `result.state`; mutate spy is only on the pending drain path. Verify “Persistence and return value” GIVEN successful approval **from ready**.

---

## Spec Dependency Chain

| Spec                            | Declared deps (preview)                                                                              | Consistency with this change                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `cli:change-status`             | entrypoint, core:change, get-status, sdk:build-implementation-review, transition-checks              | Status is a projection adapter; review header aligns with design skill (K4).          |
| `cli:change-transition`         | entrypoint, change, transition-change, hook-execution-model, get-status, transition-checks           | `--next` exception vs architecture (D3). Purpose vs T4 (D4).                          |
| `cli:change-approve`            | entrypoint, change, transition-checks                                                                | Aligns with core approve stay-in-state.                                               |
| `cli:change-archive`            | entrypoint, change, archive-change, hook-execution-model, command-resource-naming, transition-checks | Aligns with skills K3 (`--skip-hooks pre`). Signature vs `--allow-out-of-scope` (D2). |
| `skills:skill-templates-source` | skill, cli:spec-optimizations, workflow-automation, transition-checks                                | Stay-in-state and review-header guidance match CLI S7.                                |
| `core:approve-spec`             | change, schema-format, composition, kernel, composition-resolver, transition-checks                  | `boundFromStates` from engine bindings.                                               |
| `core:approve-signoff`          | same pattern                                                                                         | Symmetric.                                                                            |
| `core:config`                   | vcs-adapter-port, architecture, **transition-checks** (this change)                                  | Approvals section now describes in-place checks; duplicates engine prose by design.   |

No contradiction found between CLI S7 (print review header, not files) and skills K4 (design may key `review: required: yes`, files under details). Earlier audits that treated “no `review:` header” as the contract are **stale** relative to current spec-preview.

---

## Summary counts

| Spec                                                      |   Reqs audited | Implemented | Partial | Missing | Open discrepancies |
| --------------------------------------------------------- | -------------: | ----------: | ------: | ------: | -----------------: |
| cli:change-status                                         |             15 |          15 |       0 |       0 |  0 (layout via D1) |
| cli:change-transition                                     |             14 |          14 |       0 |       0 |             D3, D4 |
| cli:change-approve                                        |              7 |           7 |       0 |       0 |                  0 |
| cli:change-archive                                        |             10 |          10 |       0 |       0 |                 D2 |
| skills:skill-templates-source (focus 4 + spot-check rest) |        4 focus |           4 |       0 |       0 |                  0 |
| core:approve-spec                                         |              8 |           8 |       0 |       0 |    D5 (test names) |
| core:approve-signoff                                      |              8 |           8 |       0 |       0 |                  0 |
| core:config (Approvals)                                   | 1 change-owned |           1 |       0 |       0 |                  0 |
| default:\_global/testing (cross-cut)                      |              1 |           — |       — |       — |                 D1 |

**Open discrepancies:** 5 (D1 medium; D2–D5 low).  
**Focus behaviours:** all **compliant** except testing-path layout (D1), which does not change user-visible CLI/skills contracts.

**Recommendation for parent report:** Treat lifecycle UX (review header, `--next`, presenter, stay-in-state, archive pre-hooks) as spec-compliant. Call out D1 as the only medium process/layout issue in this batch; optionally fix Purpose (D4) and duplicate adapter-routing paragraph before archive.
