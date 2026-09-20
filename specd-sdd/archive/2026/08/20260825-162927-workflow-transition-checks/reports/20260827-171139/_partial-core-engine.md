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
