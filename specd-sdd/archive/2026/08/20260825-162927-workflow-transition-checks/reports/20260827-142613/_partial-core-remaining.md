# Partial audit: core remaining (product-axis leftovers)

Mode: change audit (read-only). Change `workflow-transition-checks`. Specs via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`.

Graph: `graph search` returned `GRAPH_BUSY` (index in progress). User noted graph may be stale. Navigation used spec-preview plus targeted source/test reads. No reindex.

**Product-axis leftovers checked (this batch):** snapshot bag; `archive.publication` as `CheckId`; pending hops; `RunStepHooks` on `ArchiveChange`; `Change.effectiveStatus()`.

**Verdict:** those leftovers are **gone from production code**. Remaining notes are drain-state protocol (required), a test-helper positional `RunStepHooks`, one stale archive-flow paragraph in `core:hook-execution-model`, and unmerged workspace `specs/` text for `schema-format` / out-of-change `core:storage`.

Assigned specs: `core:transition-checks`, `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:validate-artifacts`, `core:get-artifact-instruction`.

Not in this batch: `core:archive-change` (still inspected for the RunStepHooks leftover), `core:schema-format` (inspected via spec-preview for `Change.effectiveStatus()`).

---

## Leftover lens (cross-spec)

| Leftover                                                                                     | Production code                                                                                                                                                                                                                                                                                                                                                                                                                  | Merged assigned specs                                                                                                                                                                                         | Tests                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot bag (`PredicateSnapshots` / `gatherPredicateSnapshots` / `emptyPredicateSnapshots`) | **Absent.** No type, no gather file, no public/domain export. `LifecycleEngineOptions` has `checksByTarget` only (no `snapshots`).                                                                                                                                                                                                                                                                                               | Forbids bag; engine must not accept a snapshot struct.                                                                                                                                                        | `transition-checks.spec.ts` 382–388: module does not export those names. `workflow-check-factories.spec.ts`: protocol execute without a bag. |
| `archive.publication` as `CheckId`                                                           | **Absent.** `CheckId` union + `CHECK_LABELS` (`transition-checks.ts` 20–57) have no publication id. `ARCHIVE_BINDING_SPECS` (`check-bindings.ts` 84–94) lists nameMatch, archivable, overlap, workspace, deps, impl.\*, hooks only. Comment: “Publication is not a check.” Merge/publish stays inside `ArchiveChange` (`PreparedArchivePublication`, `ArchivePreflightError` path).                                              | MUST NOT be a `CheckId` or registered check.                                                                                                                                                                  | `transition-checks.spec.ts` 390–391: archive binding ids do not contain `archive.publication`.                                               |
| Pending hops (new work)                                                                      | **No rewrite.** `_resolveTarget` is identity (`lifecycle-engine.ts` 310–311). `VALID_TRANSITIONS['ready']` = implementing/designing only; `done` has no `pending-signoff` (`change-state.ts` 30–39). `TransitionChange` persists requested target; `_assertDrainAndGateTargets` only allows drain from already-pending states. Failed `approval.spec` / `approval.signoff` throw `approval-required` and leave `ready` / `done`. | Stay-in-ready/done; MUST NOT rewrite implementing→pending-spec-approval or archivable→pending-signoff. Drain from in-flight pending states remains.                                                           | `transition-change.spec.ts` 275–289 stay in ready; 333+ stay in done; 392–417 drain only.                                                    |
| `RunStepHooks` on `ArchiveChange`                                                            | **Gone.** Constructor (`archive-change.ts` 218–244) takes `archiveBindings`, not `RunStepHooks`. No `_runStepHooks` field. `ArchiveChangeDeps` / `resolveArchiveChangeDeps` inject `archiveBindings` only. Effects: `matchingEffects` + `check.execute`.                                                                                                                                                                         | Assigned `hook-execution-model` / `transition-change`: use cases MUST NOT launch `RunStepHooks` by check id. Archive ctor requirement lives on `core:archive-change` (out of batch); code matches that delta. | `archive-change.spec.ts` 168–180: `'runStepHooks' in uc` and `'_runStepHooks' in uc` are false.                                              |
| `Change.effectiveStatus()`                                                                   | **Absent on the entity.** `packages/core/src/domain/entities/change.ts` has no `effectiveStatus`. DAG status is `LifecycleEngine._effectiveStatus` / `projectArtifacts` (`lifecycle-engine.ts` 288–298, 328+).                                                                                                                                                                                                                   | `core:workflow-model` merged: never from `change.effectiveStatus()` (entity has no such method). Other assigned specs talk about artifact `effectiveStatus` fields / maps, not a Change method.               | Engine/GetStatus tests assert projected `effectiveStatus`. No test that `Change` lacks the method (**gap**).                                 |

**Drain (not a leftover hop):** pending states remain `ChangeState` values. Engine `_isStepPermitted` still special-cases `pending-spec-approval` / `pending-signoff` when extras checks are missing (`lifecycle-engine.ts` 319–324). `nextAction` still recommends approve for those drain states (851–857, 903–909). `ApproveSpec` / `ApproveSignoff` still drain-transition when already pending. Specs require this.

---

## Spec: `core:transition-checks`

### Requirements Summary (leftover-relevant)

Self-sufficient `Check.execute`; no `PredicateSnapshots` / gatherer; `archive.publication` not a `CheckId`; no pending rewrite; effects call `RunStepHooks` from hook-check constructors, not use-case id switches; projections from predicate results.

### Implementation Status

| Area                    | Status      | Evidence                                                                                                                                                          |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No snapshot bag         | Implemented | No gather module; `CheckExecutionContext` has `effectiveStatusByArtifact` map from `projectArtifacts`, not a closed bag type. Domain `run` takes per-check facts. |
| `archive.publication`   | Implemented | Not in `CheckId` / `CHECK_LABELS` / `ARCHIVE_BINDING_SPECS`.                                                                                                      |
| No pending rewrite      | Implemented | Matcher + bindings: `approval.spec` `from=ready` `along=forward`; signoff `done→archivable`. Spec text: MUST NOT match hop into pending.                          |
| Hooks via check execute | Implemented | `hook-effect.ts` `HookEffectCheck` holds `RunStepHooks`.                                                                                                          |

### Discrepancies

None on this leftover axis.

### Test Coverage

Absence of snapshot exports; absence of `archive.publication` on archive bindings; classifyAlong for drain pending→approved as `forward` (historic states, not new parking).

### Missing Tests

- No compile-time/runtime assertion that `'archive.publication'` is not assignable to `CheckId` beyond string-not-in-list.
- Direct `buildAxis` splice vs tail-append still only covered via `classifyAlong` (prior gap; not leftover-axis).

### Spec Dependency Chain

Consistent with `core:change` (no pending enter from ready/done) and `core:workflow-model` (no `Change.effectiveStatus()`).

### Counts

| Metric                            | Count |
| --------------------------------- | ----- |
| pass (leftover-axis requirements) | 4     |
| fail (discrepancies)              | 0     |
| gaps (missing tests)              | 2     |
| critical                          | 0     |
| major                             | 0     |
| minor                             | 0     |
| LOW                               | 0     |

---

## Spec: `core:lifecycle-engine`

### Requirements Summary (leftover-relevant)

Project from caller `CheckResult`s; no snapshot bag; no `check.run` fallback; `_resolveTarget` identity; nextAction must not recommend pending hops for new work; DAG-only consumers pass empty `checksByTarget`.

### Implementation Status

| Area                     | Status      | Evidence                                                                                                                                              |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| No bag / no run fallback | Implemented | `evaluate` uses `options.checksByTarget` (`lifecycle-engine.ts` 129–154). Missing injected target → skip from `availableTransitions`, no `check.run`. |
| Identity resolve         | Implemented | `_resolveTarget` returns `requestedTarget`.                                                                                                           |
| nextAction new work      | Implemented | `ready` + missing spec approval → `specd changes approve spec` (not pending hop). Drain copy remains when `state === 'pending-spec-approval'`.        |
| DAG helper               | Implemented | `projectArtifacts` / `_effectiveStatus` on the engine, not `Change`.                                                                                  |

### Discrepancies

None that restore a pending hop or snapshot bag.

`_isStepPermitted` pending keys: drain/empty-injection fallback. Spec allows drain. Not counted as fail.

### Test Coverage

Engine specs cover extras vs protocol, incomplete tasks, dual-write INCOMPLETE vs MISSING. Drain nextAction is implicit via status integration.

### Missing Tests

- Engine unit that `evaluate` options type has no `snapshots` field.
- `_isStepPermitted` documented as drain-only.

### Spec Dependency Chain

Consistent with `core:transition-checks` and `core:change`. Merged `core:schema-format` (preview, out of batch) now names engine DAG, not `Change.effectiveStatus()`.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 4     |
| fail     | 0     |
| gaps     | 2     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:get-status`

### Requirements Summary (leftover-relevant)

Execute matching predicates then project; MUST NOT gather a global snapshot bag; drafts use `projectArtifacts` / empty hop checks, not hop `evaluate`.

### Implementation Status

| Area   | Status      | Evidence                                                                                                                                                              |
| ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No bag | Implemented | `executeChecksByLegalTargets` + `projectArtifacts` map (`get-status.ts` 443–455). No `CountTasks` on the use case. Task paint from `workflow.taskCompletion` details. |
| Drafts | Implemented | `_buildDraftedResult` uses `projectArtifacts` only; `checksByTarget: {}`; empty `availableTransitions` / `availableSteps` (`593–657`).                                |

### Discrepancies

None.

### Test Coverage

GetStatus tests cascade `effectiveStatus`; domain module tests bag absence. Spec verify “does not pass a global snapshot bag” is behavioural (no bag argument exists).

### Missing Tests

- GetStatus test named “no PredicateSnapshots argument” (vacuous).
- Draft path spy that `executeChecksByLegalTargets` is not called.

### Spec Dependency Chain

Consistent with lifecycle-engine + transition-checks.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 2     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:transition-change`

### Requirements Summary (leftover-relevant)

No pending rewrite; persist requested target; MUST NOT take `RunStepHooks` / `CountTasks` as use-case ports; hook `execute` calls `RunStepHooks`; no snapshot bag.

### Implementation Status

| Area        | Status      | Evidence                                                                                                                                             |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constructor | Implemented | Ports: changes, actor, schema, refresh, approvals, lifecycle, `transitionBindings` (`transition-change.ts` 129–137). `TransitionChangeDeps` matches. |
| No rewrite  | Implemented | Input JSDoc + execute uses `requestedTarget`. Tests stay in ready/done.                                                                              |
| Drain       | Implemented | `_assertDrainAndGateTargets`; tests drain pending→approved.                                                                                          |
| Effects     | Implemented | `matchingEffects` + `executeCheckWithProgress`; no `check.id === 'hook.*'` launch.                                                                   |

### Discrepancies

None in production.

Merged verify still expects `RunStepHooks.execute` with `{ step, phase }` — still true via `HookEffectCheck`, not the use case.

### Test Coverage

Stay-in-ready/done; drain; factory without RunStepHooks on the use case (verify delta).

### Missing Tests

None leftover-critical.

### Spec Dependency Chain

Consistent with `core:change` VALID_TRANSITIONS and `core:hook-execution-model` (no id switch).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 4     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:workflow-model`

### Requirements Summary (leftover-relevant)

`workflow[]` extras lookup; taskCompletion check; step availability from engine CheckResults + `projectArtifacts` — never `change.effectiveStatus()`.

### Implementation Status

| Area                         | Status      | Evidence                                                                                           |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| No Change.effectiveStatus    | Implemented | Constraint line in merged spec (~110). Code: engine only.                                          |
| effectiveStatus as DAG field | Implemented | `workflow.requires` / task checks consume `ctx.effectiveStatusByArtifact` from `projectArtifacts`. |

### Discrepancies

None vs merged preview.

### Test Coverage

Engine/GetStatus cascade. No `Change` method-absence test.

### Missing Tests

Lock that `Change` has no `effectiveStatus` (would freeze schema-format/storage workspace leftovers as wrong).

### Spec Dependency Chain

Merged preview **consistent** with engine. Workspace `specs/core/schema-format/spec.md` still says “used to compute `Change.effectiveStatus()`” until archive (delta already rewrites this in spec-preview). `specs/core/storage/spec.md` still requires `Change.effectiveStatus(type)` and is **not** in this change — cross-spec leftover (see batch summary).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:change`

### Requirements Summary (leftover-relevant)

Pending states remain drain-only; new transitions MUST NOT enter pending from ready/done; stay-in-ready/done for approvals.

### Implementation Status

| Area              | Status      | Evidence                                         |
| ----------------- | ----------- | ------------------------------------------------ |
| VALID_TRANSITIONS | Implemented | `change-state.ts` 30–40 as specified.            |
| Entity API        | Implemented | No `effectiveStatus` method. State from history. |

### Discrepancies

None.

### Test Coverage

`change-state.spec.ts`: `ready` → `pending-spec-approval` false; `done` → `pending-signoff` false; drain edges true.

### Missing Tests

None leftover-critical.

### Spec Dependency Chain

Consistent with transition-checks / config.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:hook-execution-model`

### Requirements Summary (leftover-relevant)

Use cases select effects by matcher + `phase`; `RunStepHooks` is a dep of hook checks, not launched by check id; archive pre abort / post collect; skip selectors because transition pre/post share `before-persist`.

### Implementation Status

| Area       | Status      | Evidence                                                                            |
| ---------- | ----------- | ----------------------------------------------------------------------------------- |
| Transition | Implemented | `TransitionChange` matchingEffects `before-persist` only.                           |
| Archive    | Implemented | `ArchiveChange` before-persist then after-persist; no RunStepHooks ctor.            |
| Skip       | Implemented | `hook-effect.ts` selectors `all` / `target.pre` / `source.post` / archive pre/post. |

### Discrepancies

**1. Archive flow diagram still says ArchiveChange runs hooks “via RunStepHooks” (spec-stale, minor)**

- **Merged spec:** numbered “Deterministic step (archiving)” still lists `a. runs pre-archive run: hooks (fail-fast) via RunStepHooks` and `d. ... via RunStepHooks`. Later requirement: hook `execute` SHALL call `RunStepHooks`; use cases MUST NOT launch by check id.
- **Code:** ArchiveChange iterates bindings and `check.execute`. `RunStepHooks` is inside `HookEffectCheck`.
- **Interpretation A (later requirement + code right):** diagram leftover; should say “via matching `hook.pre` / `hook.post` execute”. **Interpretation B (diagram right):** ArchiveChange should take/call `RunStepHooks` again — contradicts this change’s locked product and the later requirement.
- **Severity:** minor (spec-internal). Not an implementation bug.

### Test Coverage

Archive/transition hook spies on `RunStepHooks.execute` through bindings. Constructor unused-field test on ArchiveChange.

### Missing Tests

None beyond archive-change verify “constructor does not accept RunStepHooks” (out of batch; code already matches).

### Spec Dependency Chain

Later hook-execution requirements consistent with archive-change delta. Numbered flow is the leftover.

### Counts

| Metric               | Count                         |
| -------------------- | ----------------------------- |
| pass                 | 3                             |
| fail (discrepancies) | 1 (minor, spec-wrong diagram) |
| gaps                 | 0                             |
| critical             | 0                             |
| major                | 0                             |
| minor                | 1                             |
| LOW                  | 0                             |

---

## Spec: `core:approve-spec`

### Requirements Summary (leftover-relevant)

Happy path stays in `ready`; MUST NOT transition into pending/spec-approved; drain from `pending-spec-approval` allowed.

### Implementation Status

| Area          | Status      | Evidence                                                                                    |
| ------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Stay in ready | Implemented | `recordSpecApproval` without `transition` unless already pending (`approve-spec.ts` 91–98). |
| Drain         | Implemented | `freshChange.state === 'pending-spec-approval'` → `transition('spec-approved')`.            |

### Discrepancies

None. Drain is specified, not a leftover hop.

### Test Coverage

Approve-spec drain + not-in-ready tests.

### Missing Tests

None leftover-critical.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:approve-signoff`

Same pattern as approve-spec for `done` / `pending-signoff` (`approve-signoff.ts` 91–98).

### Discrepancies

None.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:config`

### Requirements Summary (leftover-relevant)

`approvals.spec` / `approvals.signoff`: stay in ready/done; new work MUST NOT enter pending via `change transition`.

### Implementation Status

Gates baked at use-case construction from `SpecdConfig.approvals`. Behaviour enforced in checks + TransitionChange, not by rewriting config.

### Discrepancies

None.

### Test Coverage

Config verify scenario “Spec gate on does not require pending-spec-approval in the graph” (merged). Domain VALID_TRANSITIONS tests.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 1     |
| fail     | 0     |
| gaps     | 0     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:validate-artifacts`

### Requirements Summary (leftover-relevant)

DAG answers from `evaluate` with empty `checksByTarget`; MUST NOT run hop predicates; `gatherPredicateSnapshots` MUST NOT exist.

### Implementation Status

| Area         | Status      | Evidence                                   |
| ------------ | ----------- | ------------------------------------------ |
| Empty checks | Implemented | `validate-artifacts.ts` 224–226.           |
| No gather    | Implemented | No gather module anywhere under packages/. |

### Discrepancies

None on leftover axis. (Same-execute refresh of lifecycle after `markComplete` is a different requirement; not re-audited here.)

### Test Coverage

Verify “`gatherPredicateSnapshots` is not called”.

### Missing Tests

Spy that `executeChecksByLegalTargets` is not imported/called.

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 2     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Spec: `core:get-artifact-instruction`

### Requirements Summary (leftover-relevant)

`evaluate` with empty `checksByTarget` (`nextArtifact` / `projectArtifacts`); no hop predicates; no snapshot bag.

### Implementation Status

`get-artifact-instruction.ts` 103–106: `evaluate(change, schema, { checksByTarget: {} })`.

### Discrepancies

None.

### Test Coverage

Verify “does not gather a global snapshot bag”.

### Missing Tests

Spy vs hop execute path (same as validate).

### Counts

| Metric   | Count |
| -------- | ----- |
| pass     | 1     |
| fail     | 0     |
| gaps     | 1     |
| critical | 0     |
| major    | 0     |
| minor    | 0     |
| LOW      | 0     |

---

## Adjacent (not assigned, inspected for leftovers)

### `ArchiveChange` constructor / composition

Production: bindings required; no `RunStepHooks` param; no ctor fallback `defaultArchiveBindings`. **Closed.**

Test helper `newArchiveChange` (`helpers.ts` 939–971) still takes `runStepHooks` as the **4th positional** and maps it onto `makeArchiveBindings` → `createHook*`. Comment documents the mapping. This is harness leftover, not the use-case ABI. **LOW / not a product fail.**

### `core:schema-format` (in the change, not this batch)

spec-preview: artifact `requires` feeds `LifecycleEngine.projectArtifacts`; “there is no `Change.effectiveStatus()` method”; verify scenario asserts no such method.

Workspace `specs/core/schema-format/spec.md` line 77 still has the old “used to compute `Change.effectiveStatus()`” until archive. **Expected overlay**, not a merged-spec fail.

### `core:storage` (not in this change)

`specs/core/storage/spec.md` still requires `Change.effectiveStatus(type)` cascade and verify still calls `Change.effectiveStatus('a')`. Code + this change’s engine-as-sole-authority contradict that.

- **Interpretation A:** storage spec leftover; should cite `LifecycleEngine.projectArtifacts`.
- **Interpretation B:** Change should own DAG status — would undo this change.

**Minor, spec-wrong, out of assigned list.** Same product-axis leftover, different spec.

---

## Batch summary

| Metric                                        | Count                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Assigned specs audited                        | 12                                                                                                       |
| Product leftover bugs still in production     | **0**                                                                                                    |
| fail (discrepancies in assigned merged specs) | **1** (hook-execution archive flow diagram)                                                              |
| critical                                      | 0                                                                                                        |
| major                                         | 0                                                                                                        |
| minor                                         | 1 (spec-stale diagram)                                                                                   |
| LOW                                           | 1 (test helper still takes `RunStepHooks` to build bindings)                                             |
| gaps                                          | 9 (mostly naming/absence tests)                                                                          |
| Out-of-batch leftover                         | workspace `core:storage` (+ unarchived `schema-format` file text) still names `Change.effectiveStatus()` |

**Do not recycle as open product bugs:** snapshot bag; `archive.publication` CheckId; new-work pending hops; `RunStepHooks` on `ArchiveChange` ctor/deps/field; `Change.effectiveStatus()` method.

**Still true / allowed:** drain pending states; engine nextAction for those states; publication preflight inside ArchiveChange; `RunStepHooks` on `createHookPre` / `createHookPost` and standalone CLI.
