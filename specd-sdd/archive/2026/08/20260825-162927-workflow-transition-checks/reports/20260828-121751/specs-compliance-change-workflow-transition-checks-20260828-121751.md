# Specs-compliance — change `workflow-transition-checks`

- **Mode:** specific change (re-audit after GetStatus overlap wiring, `'next'` rejects, fail-fast tests, CLI `--allow-out-of-scope`)
- **Date:** 2026-08-28 12:17 (`TIMESTAMP=20260828-121751`)
- **State at audit:** `designing` (verify/design/tasks pending-review from earlier spec edits)
- **Graph:** `graph index --force` failed (`graph-index worker exited unexpectedly`) after deleting incompatible schema-5 SQLite. Subagents used `graph search` where it worked; otherwise Read/Grep.
- **Read-only:** no source or spec files were modified for this audit.

## Executive verdict

The previous **HIGH** (GetStatus archive overlap I/O not wired) is **fixed**: `resolveGetStatusDeps` calls `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })`, and archive predicates still run only when `state === 'archivable'`. Designing live overlap is not `OVERLAP_CONFLICT`.

A new **HIGH** on the same theme: **`TransitionChange` does not reload the `Change` after `RefreshImplementationTracking`**, so `impl.filesResolved` / `impl.linksInScope` can run on a stale snapshot while GetStatus reloads. That can make status show a blocker that transition does not enforce.

CLI recorte-26 (`--next`, `--allow-out-of-scope` forward/omit, archive allow flags, status overlap review) is **compliant**. Remaining CLI HIGH is test-layout: leftover `packages/cli/test/commands/change.spec.ts` still holds the only `artifact-drift` status tests.

## Recorte 26 / follow-up checklist

| Item                                                 | Verdict                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| GetStatus `includeOverlapDetection: true`            | **Fixed** (no composition regression test — M-1)                 |
| Live `OVERLAP_CONFLICT` only in `archivable`         | **Compliant**                                                    |
| Invalidation overlap → review `/specd-design`        | **Compliant**                                                    |
| `to: 'next'` + four reject states                    | **Compliant** (Input contract section still stale)               |
| `failFastOn: 'protocol.edge'` vs collect-all         | **Compliant** + tests                                            |
| CLI `--next` not a local table                       | **Compliant**                                                    |
| CLI transition/archive `--allow-out-of-scope`        | **Compliant** + matching tests                                   |
| `allowOutOfScope` does not skip `impl.filesResolved` | **Compliant** (archive test; Core transition test still missing) |
| Leftover `change.spec.ts`                            | **Still open** (migrate drift tests before delete)               |

## Highest-priority findings (do not treat all HIGHs as equal)

Must-fix for this change’s contract:

1. **HIGH — TransitionChange stale `Change` after refresh** (`_partial-core-lifecycle` D-3). Reload after refresh like GetStatus.
2. **MEDIUM — `includeOverlapDetection` unguarded in composition tests** (previous HIGH can regress silently).
3. **MEDIUM — production `spec.overlap` drops peer names** (generic `OVERLAP_CONFLICT` message).
4. **MEDIUM — Input contract never updated** for `'next'` / `allowOutOfScope`.

Likely pre-existing / out of recorte-26 core path (still reported):

5. **HIGH — Archive `resolveInitialPersistedDependsOn` bypass** (`_partial-archive-hooks` D1).
6. **HIGH — ValidateArtifacts uses `permissiveSpecMetadataSchema`** (`_partial-rest` H1).
7. **HIGH — drift materialization requirement vs `FsChangeRepository`** (`_partial-rest` H2).
8. **HIGH — leftover CLI `change.spec.ts` + unmigrated drift tests** (`_partial-cli` D1/D2).

## Aggregate counts (from partials; some overlap)

| Batch          | Compliant reqs (approx)        | HIGH | MEDIUM | Notes                                |
| -------------- | ------------------------------ | ---- | ------ | ------------------------------------ |
| core-lifecycle | 52 / 61                        | 1    | 6      | D-3 is the new behavioural gap       |
| archive-hooks  | 61 / 71                        | 1    | 2      | spec-lock initial dependsOn          |
| cli            | 47 / 47                        | 2    | 1      | HIGHs are test layout, not CLI flags |
| rest           | 16 confirmed / 34 spot-checked | 3    | 6      | validate-artifacts / eslint          |

Partial files (source of truth for detail) remain in this directory:

- `_partial-core-lifecycle.md`
- `_partial-archive-hooks.md`
- `_partial-cli.md`
- `_partial-rest.md`

## Suggested next work (this change)

1. Reload `Change` in `TransitionChange` after refresh; add test (open file after refresh fails `implementing → verifying`).
2. Pass `peers` from composed `detectOverlap` into `formatOverlapMessage`.
3. Delta `Requirement: Input contract` for `to: ChangeState \| 'next'` and `allowOutOfScope`.
4. Composition test that `createGetStatus(config)` reports live overlap when archivable.
5. Migrate `artifact-drift` tests from `change.spec.ts` into `change/status.spec.ts`, then delete the leftover file.

---

## Detailed findings

The four partial reports follow verbatim.

### Partial: core-lifecycle

# Spec-Compliance Audit — core lifecycle partial

- **Change:** `workflow-transition-checks`
- **Scope (change-owned, via `changes spec-preview`):** `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:lifecycle-engine`
- **Cross-check:** `default:_global/architecture` (read from `specs/_global/architecture/spec.md`)
- **Date:** 2026-08-28 12:17
- **Mode:** read-only. No code or spec files modified.

## Tooling notes

`specd graph` worked (index reported fresh, `2026-08-28T10:20:40Z`). `graph search "HAPPY_PATH_NEXT" --symbols` resolved the declaration and public-barrel re-exports correctly. No `SCHEMA_INCOMPATIBLE` / worker crash. Grep/Read were used as a secondary pass for exact line evidence and for test-file enumeration.

`specd specs show default:_global/architecture --depth 1` failed — `--depth` is not an option on that command (`error: unknown option '--depth'`). The architecture spec was read directly instead; its `Spec Dependencies` section is `_none — this is a global constraint spec_`, so depth-1 has no additional nodes to expand.

Merged spec text for `core:get-status` and `core:transition-change` exceeds the 20k shell-output limit, so those were read as `--artifact specs` plus the raw delta YAML for the truncated middle sections. `core:transition-checks` is a **new** change-owned spec (full file at `specd-sdd/changes/.../specs/core/transition-checks/spec.md`), not a delta.

---

## 1. Requirements Summary

### `core:transition-checks` (new spec)

| #     | Requirement                               | Substance                                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-1  | Check identity and result                 | Stable `id`, mandatory gerund `label`, `kind`, `outcome`, `code`/`message` on fail, optional `details`. `archive.publication` MUST NOT be a `CheckId`.                                                                                                          |
| TC-2  | Check ABI create and WorkflowCheck        | `Check` / `WorkflowCheck` / `create<Name>(deps)`; no `PredicateSnapshots`, no `needs`, no `gatherPredicateSnapshots`; `CheckExecutionContext` is host-only + `passMemo` + `onCheckProgress`.                                                                    |
| TC-3  | One implementation file per check         | `id`/`kind` on the class; applicability lives on bindings.                                                                                                                                                                                                      |
| TC-4  | Applicability from/to/along               | `along` ∈ forward/backward/redesign/recovery/any; axis from `schema.workflow[]` with `AXIS_FALLBACK` splice.                                                                                                                                                    |
| TC-5  | Archive is an operation not an edge       | `approval.signoff` MUST NOT bind to `archive`.                                                                                                                                                                                                                  |
| TC-6  | Binding pipeline phase and failure policy | `phase` (before/after-persist) + `onFailure` (abort/collect) on the binding row.                                                                                                                                                                                |
| TC-7  | Predicate versus effect                   | Predicates decide `allowed`; effects are `run:` hooks; `--skip-hooks` skips effects only.                                                                                                                                                                       |
| TC-8  | Evaluation of a transition attempt        | `protocol.edge` fail-fast on TransitionChange, collect-all on GetStatus.                                                                                                                                                                                        |
| TC-9  | Registry bindings for this capability     | Exact binding table (see §3, D-8).                                                                                                                                                                                                                              |
| TC-10 | Actionable fail diagnostics               | `deps.consistent` shows extracted vs persisted; **`spec.overlap` MUST name overlapping change(s) and spec id(s) when known**; `workspace.readOnly` names spec ids; `impl.*` compact summary only. `--allow-out-of-scope` attaches only for `impl.linksInScope`. |
| TC-11 | Generic check progress bus                | `check-start` / `check-progress` / `check-done`; no `Executing:` prefix; GetStatus MUST NOT stream.                                                                                                                                                             |
| TC-12 | Projections                               | `validTransitions` / `availableTransitions` / `nextAction` from the same evaluation.                                                                                                                                                                            |
| TC-13 | No shared snapshot bag                    | Applicability declared once; engine projects from supplied `CheckResult`s.                                                                                                                                                                                      |

### `core:lifecycle-engine`

| #    | Requirement                                   | Substance                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1 | Centralized validation logic                  | One evaluation; engine projects from caller-supplied `CheckResult`s; I/O-free; no snapshot bag; no `check.run` fallback.                                                                                                                          |
| LE-2 | Effective artifact status computation         | DAG cascade → `pending-parent-artifact-review`.                                                                                                                                                                                                   |
| LE-3 | Canonical-state-only interpretation           | `complete-with-drift` / `hasDrift` are display-only.                                                                                                                                                                                              |
| LE-4 | Machine-readable blockers                     | `code`, `message`, `isSkippable`, optional `bypassFlag`, optional `affectedArtifacts`. **Active bypass MUST omit the blocker.** `OVERLAP_CONFLICT` only from live archive `spec.overlap`, never from `review.reason === 'spec-overlap-conflict'`. |
| LE-5 | Available steps and next action               | `_resolveTarget` MUST NOT rewrite gates; happy-path `nextAction` matrix; backward hops available but not default.                                                                                                                                 |
| LE-6 | Archiving escape transitions                  | `archiving → archivable` is `recovery`; no `requires` / `taskCompletion` blockers on it.                                                                                                                                                          |
| LE-7 | Review summary integration                    | Drift + overlap reported as blocking diagnostics.                                                                                                                                                                                                 |
| LE-8 | Shared lifecycle interpretation for consumers | `ValidateArtifacts` / `GetArtifactInstruction` use empty `checksByTarget`.                                                                                                                                                                        |
| LE-9 | Next artifact topological order               | `artifactDag().topologicalOrder()`, not declaration order.                                                                                                                                                                                        |

### `core:get-status`

| #     | Requirement                                             | Substance                                                                                                                                                                                    |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GS-1  | Accepts a change name as input                          | `name`, `refreshImplementationTracking?`, `ifModifiedSince?`.                                                                                                                                |
| GS-2  | Returns the change and its artifact statuses            | `change`/`draftView`/`unchanged`/`artifactStatuses`/`specDependsOn`/`review`/`blockers`/`nextAction`; `get` then `getDraft`; never `getDiscarded`.                                           |
| GS-3  | Revision evaluation                                     | HTTP-304-style short-circuit; MUST NOT invoke refresh.                                                                                                                                       |
| GS-4  | Drafted change read-only status                         | `projectArtifacts` cascade; empty `availableTransitions`.                                                                                                                                    |
| GS-5  | Implementation status projection                        | Tracked files + links.                                                                                                                                                                       |
| GS-6  | Optional pre-read refresh                               | Active only; skipped on 304; never calls `ImplementationDetector`.                                                                                                                           |
| GS-7  | Drift-aware display status                              | `hasDrift` + `displayStatus` + aggregation precedence.                                                                                                                                       |
| GS-8  | Task completion counts                                  | From `workflow.taskCompletion` details; never a second `CountTasks` call.                                                                                                                    |
| GS-9  | Execute matching predicates then project                | Collect-all (no fail-fast). **Archive-scope predicates only when `state === 'archivable'`, with `allowOverlap`/`allowOutOfScope` false.** `passMemo` per pass, not per instance.             |
| GS-10 | Throws ChangeNotFoundError                              | —                                                                                                                                                                                            |
| GS-11 | Reports effective status for every artifact             | One entry per `schema.artifacts()` type.                                                                                                                                                     |
| GS-12 | Returns lifecycle context                               | Review priority ladder (drift → overlap → review-required → none); reverse history scan stopping at first non-`designing` `transitioned`.                                                    |
| GS-13 | Identifies blockers                                     | Failed predicates surface with `code`, `label`, `checkId`; `--allow-out-of-scope` only for `impl.linksInScope`; `review.reason === 'spec-overlap-conflict'` MUST NOT add `OVERLAP_CONFLICT`. |
| GS-14 | Graceful degradation when schema fails                  | Degrade, don't throw.                                                                                                                                                                        |
| GS-15 | Config factory delegates through `resolveGetStatusDeps` | Must resolve `transitionBindings` **and** `archiveBindings` from `resolveWorkflowCheckRegistry`.                                                                                             |

### `core:transition-change`

| #           | Requirement                                                    | Substance                                                                                                                                                              |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TX-1        | Input contract                                                 | `name`, `to`, `skipHookPhases?`, `refreshImplementationTrackingBefore?`. Approval flags MUST NOT be per-invocation.                                                    |
| TX-2        | Approval gates baked at construction                           | `ApprovalGates` on the constructor.                                                                                                                                    |
| TX-3        | Change must exist                                              | —                                                                                                                                                                      |
| TX-4        | Optional pre-transition refresh                                | **"Lifecycle rules MUST be evaluated against tracked implementation state after any refresh."**                                                                        |
| TX-5        | Spec approval is a check not a pending hop                     | No rewrite to `pending-spec-approval`.                                                                                                                                 |
| TX-6        | Signoff is a check not a pending hop                           | No rewrite to `pending-signoff`.                                                                                                                                       |
| TX-7        | Pending states produce explicit failures                       | Drain-only.                                                                                                                                                            |
| TX-8        | Direct transition when gates inactive                          | —                                                                                                                                                                      |
| TX-9        | Workflow requires enforcement                                  | Map the failed predicate; no re-walk.                                                                                                                                  |
| TX-10       | Task completion during requires enforcement                    | `missing-task-capability` / `incomplete-tasks`; no second `CountTasks`.                                                                                                |
| TX-11       | Artifact validation clearing verifying→implementing            | No downgrade.                                                                                                                                                          |
| TX-12       | Skill-aligned backward hop invalidation                        | Invalidate signoff only; no `source.post`.                                                                                                                             |
| TX-13       | Transition to designing from any state                         | Invalidate approvals + downgrade unless already `designing`/`drafting`.                                                                                                |
| TX-14       | Transition from archiving to archivable                        | `along = recovery`; no `requires` / `taskCompletion` / archive effects.                                                                                                |
| TX-15/17    | Pre- and post-hook execution                                   | Iterate bindings by `phase`; never switch on `check.id`.                                                                                                               |
| TX-16/18/19 | Delegation / event / persistence                               | `change.transition` inside `ChangeRepository.mutate`.                                                                                                                  |
| TX-20       | Result type                                                    | `{ change }` only.                                                                                                                                                     |
| TX-21       | Progress callback                                              | Generic check bus + `requires-check` / `task-completion-failed` / `transitioned`.                                                                                      |
| TX-22       | Dependencies                                                   | No `RunStepHooks` / `CountTasks` as use-case ports.                                                                                                                    |
| TX-23       | **`to: 'next'` is the happy-path next state**                  | Sentinel accepted; typed `SpecdError` rejection for at least `pending-spec-approval`, `pending-signoff`, `archivable`, `archiving`; `protocol.edge` fail-fast applies. |
| TX-24       | Config factory delegates through `resolveTransitionChangeDeps` | No `runStepHooks` on the use case.                                                                                                                                     |

---

## 2. Implementation Status

### Recorte-26 focus item 1 — GetStatus overlap — **COMPLIANT** (previous HIGH resolved)

| Sub-requirement                                                                           | Status | Evidence                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeOverlapDetection` wired in `resolveGetStatusDeps`                                 | ✅     | `packages/core/src/composition/use-cases/get-status.ts:45` — `resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection: true })`. The previously reported HIGH (missing flag) is fixed. |
| Archive predicates run **only** when `state === 'archivable'`                             | ✅     | `packages/core/src/application/use-cases/get-status.ts:464` guards the whole `executeMatchingPredicates(this._archiveBindings, …)` block.                                                       |
| `allowOverlap` / `allowOutOfScope` false on that pass                                     | ✅     | `get-status.ts:471-473`.                                                                                                                                                                        |
| Effects excluded from the archive pass                                                    | ✅     | `executeMatchingPredicates` filters via `matchingPredicates()` (`execute-matching-predicates.ts:113-117`).                                                                                      |
| `designing` state must not call `detectSpecOverlap` / emit `OVERLAP_CONFLICT`             | ✅     | Same `state === 'archivable'` guard; test at `get-status.spec.ts:1049`.                                                                                                                         |
| `review.reason === 'spec-overlap-conflict'` → review + `/specd-design`, **not** a blocker | ✅     | `lifecycle-engine.ts:538-539` returns `[]` for that reason with an explicit comment; `_nextAction` returns `/specd-design` when `review.required` (`lifecycle-engine.ts:794-801`).              |
| Overlap review `message` is human prose                                                   | ✅     | `reviewMessage()` → `'Conflict detected with archived overlapping specs'` (`lifecycle-engine.ts:20-21`); surfaced as `nextAction.reason` at line 798.                                           |

### Recorte-26 focus item 2 — `to: 'next'` / `HAPPY_PATH_NEXT` — **COMPLIANT**

- `HAPPY_PATH_NEXT` at `packages/core/src/domain/value-objects/change-state.ts:49-58` maps `drafting→designing`, `designing→ready`, `ready→implementing`, `spec-approved→implementing`, `implementing→verifying`, `verifying→done`, `done→archivable`, `signed-off→archivable`. It **omits** `pending-spec-approval`, `pending-signoff`, `archivable`, `archiving` — exactly the four states TX-23 requires rejecting.
- `HappyPathNextUnavailableError extends SpecdError` with code `HAPPY_PATH_NEXT_UNAVAILABLE` (`domain/errors/happy-path-next-unavailable-error.ts`), and `happyPathNextMessage` gives per-state prose. This satisfies "typed `SpecdError` (not a CLI-only table)".
- Resolution site: `transition-change.ts:180-188`, before attempt classification, so `protocol.edge` fail-fast applies to the resolved edge unchanged (TX-23 last paragraph).
- Placement is architecture-clean: the table is a domain value object and the error a domain error — no I/O, satisfying architecture "Domain layer is pure".

### Recorte-26 focus item 3 — `failFastOn: 'protocol.edge'` vs collect-all — **COMPLIANT**

- `TransitionChange`: `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` (`transition-change.ts:213`).
- `GetStatus`: `executeChecksByLegalTargets` calls `executeMatchingPredicates(bindings, ctx)` with **no options** (`execute-matching-predicates.ts:219-231`), and the archivable archive pass likewise omits options (`get-status.ts:465-477`). Collect-all confirmed on both GetStatus paths.
- The shared helper implements the semantics correctly: `break` only when `options.failFast === true || options.failFastOn === result.id` (`execute-matching-predicates.ts:143-148`).

### Recorte-26 focus item 4 — Input contract vs `'next'` — **SPEC-INTERNAL CONTRADICTION** (see D-1)

Code: `readonly to: ChangeState | 'next'` (`transition-change.ts:50`). Merged spec "Requirement: Input contract" still reads `to` (ChangeState, required). The delta YAML never selects that section (verified: `deltas/core/transition-change/spec.md.delta.yaml` touches Approval-gate routing, pending states, requires, task completion, backward hops, hooks, archiving, constraints, factory, dependencies, progress, and _adds_ the `to next` requirement — but not `Input contract`).

### Recorte-26 focus item 5 — `allowOutOfScope` on `TransitionChangeInput` vs `impl.filesResolved` — **COMPLIANT (code), spec placement drift (D-2)**

- Field exists and is optional (`transition-change.ts:66-70`), read at line 189, threaded into the check context at line 207.
- `impl.filesResolved` genuinely ignores it: `application/checks/impl-files-resolved.ts:38-46` calls `runImplFilesResolved({ openTrackedImplementationFiles })` and never reads `ctx.allowOutOfScope`.
- `impl.linksInScope` honours it: `domain/checks/impl-links-in-scope.ts:25` returns skip when `facts.allowOutOfScope`.
- Bypass-flag attachment is correctly narrowed to the check **id**, not the shared `IMPLEMENTATION_STATE` code, in both projection sites: `get-status.ts:750-751` and `lifecycle-engine.ts:771-772`.

### Other verified-compliant areas

| Area                                                                                    | Status | Evidence                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binding table matches TC-9 exactly                                                      | ✅     | `domain/services/check-bindings.ts:28-94`. `approval.signoff` = `from: done, to: archivable, along: forward` only (line 61-65), not bound to `archive`. `impl.*` = `from: implementing, along: forward` only (49-55), so redesign never runs them. `archive.publication` absent from both tables and from `DOMAIN_CHECKS`. |
| Registry order source.post before target.pre                                            | ✅     | `hook.post` (line 66) precedes `hook.pre` (line 72) in `TRANSITION_BINDING_SPECS`; archive `hook.post` is `after-persist` / `collect` (line 93).                                                                                                                                                                           |
| Hook skip uses effect pre/post identity, not `binding.phase` alone                      | ✅     | `application/checks/hook-effect.ts:133-149` branches on `this._phase` + archive scope; the use case never compares `check.id` (`transition-change.ts:250-257` iterates `matchingEffects(..., 'before-persist', along)`).                                                                                                   |
| Effect timing/failure from binding, not id                                              | ✅     | `execute-hook-effect.ts:23-45` (`matchingEffects` / `hookFailureMode`).                                                                                                                                                                                                                                                    |
| `LifecycleEngine` is I/O-free and does not re-run predicates                            | ✅     | No imports of ports/fs; `availableTransitions` derived purely from injected `checksByTarget` (`lifecycle-engine.ts:160-170`).                                                                                                                                                                                              |
| `isReady` projected from `workflow.requires` results when present                       | ✅     | `lifecycle-engine.ts:182-188`.                                                                                                                                                                                                                                                                                             |
| GetStatus 304 short-circuit skips refresh                                               | ✅     | `get-status.ts:345-350` runs before the refresh at 352.                                                                                                                                                                                                                                                                    |
| GetStatus reloads the change after refresh                                              | ✅     | `get-status.ts:356-359`.                                                                                                                                                                                                                                                                                                   |
| Schema-failure degradation wraps only `schemaProvider.get()`                            | ✅     | `get-status.ts:396-444`; check `execute` failures are outside the `catch`.                                                                                                                                                                                                                                                 |
| `nextAction` for `done`/`signed-off` → `/specd-verify`, `archivable` → `/specd-archive` | ✅     | `lifecycle-engine.ts:916-940`, matching LE-5's explicit "MUST NOT recommend the archive CLI while still in done/signed-off".                                                                                                                                                                                               |
| Approval next-action uses binding table, not hardcoded states                           | ✅     | `boundFromStates('approval.spec' \| 'approval.signoff')` at `lifecycle-engine.ts:804, 817` — satisfies TC-13 "applicability declared once".                                                                                                                                                                                |
| `TransitionChange` throws on schema miss                                                | ✅     | `transition-change.ts:191` has no `try/catch`, per the merged Constraints line.                                                                                                                                                                                                                                            |
| No `RunStepHooks` / `CountTasks` on use-case constructors                               | ✅     | `TransitionChange` constructor (`transition-change.ts:130-138`) and `GetStatus` constructor (`get-status.ts:307-315`) take neither.                                                                                                                                                                                        |
| No `PredicateSnapshots` / `gatherPredicateSnapshots` anywhere                           | ✅     | Grep across `packages/core/src` returns no hits.                                                                                                                                                                                                                                                                           |

---

## 3. Discrepancies (spec vs code)

### D-1 — `TransitionChangeInput.to` contract contradicts itself in the merged spec — **MEDIUM**

- **Spec A (`Requirement: Input contract`):** "`to` (ChangeState, required) — the requested target state".
- **Spec B (`Requirement: to next is the happy-path next state`):** "input `to` MUST accept a lifecycle `ChangeState` or the sentinel `'next'`".
- **Code:** `readonly to: ChangeState | 'next'` (`packages/core/src/application/use-cases/transition-change.ts:50`).

**Interpretation 1 — spec is stale, code is right.** The change added TX-23 as a new requirement and simply forgot to re-open `Input contract`. The delta YAML confirms `Input contract` was never selected. Under this reading the code is correct and the _spec_ needs a delta on `Requirement: Input contract`.

**Interpretation 2 — `Input contract` is authoritative and `'next'` belongs at the delivery layer.** TX-23 explicitly forecloses this: "with a typed `SpecdError` (**not a CLI-only table**)". So Interpretation 1 is the intended one.

**Assessment:** real drift, but in the spec direction, not the code direction. The merged `Input contract` bullet list is now the only place a reader learns the shape of `TransitionChangeInput`, and it is wrong on two of five fields.

### D-2 — `allowOutOfScope` is documented only in Constraints, not in `Input contract` — **LOW**

- **Spec:** merged Constraints say "Input MAY include `allowOutOfScope` for `impl.linksInScope` skippable semantics on transition". The `Input contract` requirement does not list it.
- **Code:** `transition-change.ts:66-70` declares it as a first-class optional input field; the CLI exposes `--allow-out-of-scope` on `change transition` (`packages/cli/src/commands/change/transition.ts:204-207, 266`).

**Interpretation 1:** the Constraints line is sufficient authority and `MAY` correctly signals optionality. Then this is documentation-placement noise only.
**Interpretation 2:** an input field that gates a security-relevant bypass belongs in the input-contract requirement so it is discoverable and verifiable. Given `verify.md` scenarios key off requirement headings, the current placement makes the field effectively unverifiable.

Same root cause as D-1: `Requirement: Input contract` was never re-opened by this change.

### D-3 — `TransitionChange` evaluates predicates against the **pre-refresh** change — **HIGH**

- **Spec (TX-4, `Requirement: Optional pre-transition implementation tracking refresh`):** "When `refreshImplementationTrackingBefore` is not `false` … `TransitionChange` MUST invoke `RefreshImplementationTracking.execute({ name })` before lifecycle evaluation, hook execution, and mutation. … **Lifecycle rules MUST be evaluated against tracked implementation state after any refresh.**"
- **Code:**

```164:214:packages/core/src/application/use-cases/transition-change.ts
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    if (input.refreshImplementationTrackingBefore !== false) {
      await this._refresh.execute({ name: input.name })
    }
    // ... `change` is never reloaded; it is passed straight into the check context
    const evaluation = await executeMatchingPredicates(
      this._transitionBindings,
      buildCheckExecutionContext({ change, /* … */ }),
      { failFastOn: 'protocol.edge' },
    )
```

`RefreshImplementationTracking.execute` mutates through `ChangeRepository.mutate` (`refresh-implementation-tracking.ts:84`), and the fs repository's `mutate` loads a **fresh** `Change` from `_getInternal` (`infrastructure/fs/change-repository.ts:347-358`). The instance held at line 168 is therefore a stale snapshot after line 174. `impl.filesResolved` reads `ctx.change.trackedImplementationFiles` (`application/checks/impl-files-resolved.ts:41`), so the gate on `implementing → verifying` is evaluated against pre-refresh tracked state.

For contrast, `GetStatus` does exactly the right thing — it reloads:

```352:361:packages/core/src/application/use-cases/get-status.ts
    if (input.refreshImplementationTracking !== false) {
      await this._refresh.execute({ name: input.name })
    }

    const refreshedChange = await this._changes.get(input.name)
    if (refreshedChange === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return this._buildActiveResult(refreshedChange)
```

**Interpretation 1 (drift, favoured):** the asymmetry with `GetStatus` in the same change is strong evidence the reload was intended on both paths and was simply not carried over to `TransitionChange`. Practical impact: refresh can newly mark files `open` (`_mergeCandidates`) or resurrect `removed` → `open` (`_existenceSweep`); a transition can therefore pass `impl.filesResolved` on the stale snapshot when the refreshed state would fail it. Status would then show a blocker that `transition` does not enforce — precisely the "status shows steps that execute rejects" inversion this whole change exists to eliminate.

**Interpretation 2 (compliant-by-a-thread):** one could argue "evaluated against tracked implementation state after any refresh" is satisfied because the refresh _ran_ before evaluation, and the eventual persist uses a fresh instance inside `mutate` (line 259). This reading makes the sentence vacuous — the refresh always runs before evaluation temporally — so it fails to give the requirement any content, and does not survive comparison with the `GetStatus` implementation of the same-worded requirement.

**Assessment: HIGH.** Correctness gap on the primary gate this change introduced, and it is not covered by any test (see M-2).

### D-4 — production `spec.overlap` never names the overlapping peers — **MEDIUM**

- **Spec (TC-10, `Requirement: Actionable fail diagnostics`):** "`spec.overlap` — MUST name the overlapping change(s) and overlapping spec id(s) when known."
- **Domain support exists:** `domain/checks/spec-overlap.ts:34-49` (`formatOverlapMessage`) renders `Specs overlap with other active changes: <name> (<specIds>); …` and attaches `details.peers` — but only when `facts.specOverlapPeers` is non-empty.
- **Production wiring never supplies peers:**

```37:59:packages/core/src/composition/use-cases/workflow-check-registry.ts
  if (options.includeOverlapDetection === true) {
    detectOverlap = async (change: Change): Promise<SpecOverlapDetection> => {
      // ...
      const report = detectSpecOverlap([...others, change])
      const relevant = report.entries.filter((entry) =>
        entry.changes.some((peer) => peer.name === change.name),
      )
      return {
        blocked: relevant.length > 0,
        ...(relevant.length > 0
          ? { message: 'Specs overlap with other active changes' }
          : {}),
      }
    }
  }
```

`relevant` already holds the peer changes and the overlapping spec ids, and `SpecOverlapDetection.peers` is declared for exactly this (`application/checks/spec-overlap.ts:18-21`) — but the closure discards them and returns the bare fallback string. This is the only wiring used by **both** `resolveGetStatusDeps` (`composition/use-cases/get-status.ts:45`) and `resolveArchiveChangeDeps` (`composition/use-cases/archive-change.ts:132`), so `formatOverlapMessage`'s peer branch is dead in production.

**Interpretation 1 (drift, favoured):** "when known" is satisfied — the names _are_ known at the point the closure runs; they are deliberately dropped. The user-visible `OVERLAP_CONFLICT` message is therefore no more actionable than the check id, which is the exact failure mode TC-10 was written to prevent ("`label` orients _which check_; `message`/`details` orient _what to fix_").
**Interpretation 2 (compliant):** one could read "when known" as "when the detector chooses to report them", making the empty-peers path legal. That reading makes TC-10 unenforceable for this check, and is contradicted by the sibling bullets (`deps.consistent` "MUST NOT stop at 'disagrees for: \<specId\>' alone"), which set the bar at naming specifics.

**Note:** `ArchiveChange` computes the richer `relevantOverlap` set independently (`application/use-cases/archive-change.ts:278-282`) and passes it to `throwMappedArchiveFailure`, so the _archive error path_ does name peers. Only the check-projected `message` (which is what GetStatus blockers and the repair guide render) is degraded. See also D-7.

### D-5 — `LifecycleEngine.bypassFlags` is accepted but never applied — **MEDIUM**

- **Spec (LE-4, `Requirement: Machine-readable blockers`):** "If a blocker is skippable and the corresponding bypass is active in the engine's input, the engine MUST omit that blocker from `blockers` (it MUST NOT remain as a transition blocker)."
- **Code:** `LifecycleEngineOptions.bypassFlags` is declared (`lifecycle-engine.ts:48`) and materialised (`const bypassFlags = new Set(options.bypassFlags ?? [])`, line 146) — but its only subsequent use is the debug log at line 274. `_blockersFromFailedChecks` (766-784) and `_dedupeBlockers` never filter on it, and nothing removes an `isSkippable` blocker.

**Interpretation 1 (drift, favoured):** the requirement is written as an engine obligation ("the engine MUST omit"), and the option exists precisely to carry the bypass into the engine. As written, passing `bypassFlags: ['allow-overlap']` changes nothing but a log line.
**Interpretation 2 (compliant in practice):** the checks themselves already return `skip` when the bypass is set (`domain/checks/spec-overlap.ts:59-61`, `domain/checks/impl-links-in-scope.ts:25`), so a bypassed check never produces a failed `CheckResult` for the engine to project. Under this reading the engine-level filter is redundant defence and the requirement is satisfied end-to-end.

**Assessment:** Interpretation 2 is defensible for the _observable_ behaviour, which is why this is MEDIUM rather than HIGH. But the option is then dead API surface on a domain service, which conflicts with the architecture spec's "Domain value objects expose behaviour, not structure" intent and leaves a trap for callers who reasonably expect it to work. Either the filter should exist or `bypassFlags` should not be on `LifecycleEngineOptions`.

### D-6 — `_resolveTarget` is a surviving identity function — **LOW**

- **Spec (LE-5):** "`_resolveTarget` MUST NOT rewrite `implementing` to `pending-spec-approval` or `archivable` to `pending-signoff`. The requested target is the target."
- **Code:** `private _resolveTarget(requestedTarget: ChangeState): ChangeState { return requestedTarget }` (`lifecycle-engine.ts:325-327`), still called at lines 340, 552, 580.

Literally compliant — it demonstrably rewrites nothing. But it is now a no-op indirection whose only purpose was the removed routing, and `_isStepPermitted` line 340 reads `this._resolveTarget(step) === step` which is a tautology. Flagging as residue rather than a violation.

### D-7 — overlap peer discovery duplicated across layers — **LOW**

The "list all changes → load each → `detectSpecOverlap` → filter entries touching this change" sequence exists twice, in two different layers:

- `composition/use-cases/workflow-check-registry.ts:38-59` (composition layer, feeds the check)
- `application/use-cases/archive-change.ts:271-282` (application layer, feeds `throwMappedArchiveFailure`)

They have already diverged: the archive copy keeps the overlapping spec ids, the composition copy throws them away (which is the mechanism of D-4). Architecture's "Application layer uses ports only" and TC-13's "Applicability SHALL be declared **once**" both push toward a single application service here. The composition copy also performs repository orchestration (`changes.list()` + N× `changes.get()`) inside a wiring function, which is application-layer work living in `composition/`.

### D-8 — `nextAction` from `archivable` is not gated on availability — **LOW**

- **Spec (LE-5):** the happy-path matrix is prefaced "**when the listed hop is in `availableTransitions`**", and lists "`archivable` → `target: archiving`, `command: /specd-archive`".
- **Code:** `lifecycle-engine.ts:933-940` returns `{ targetStep: 'archiving', command: '/specd-archive' }` unconditionally for `archivable`, with no `availableTransitions.includes('archiving')` guard — unlike every sibling branch (`ready` line 846, `implementing` 874, `verifying` 891, `done`/`signed-off` 917), all of which do check.

Practical effect: an `archivable` change with a live `OVERLAP_CONFLICT` is told to run `/specd-archive`, which will then fail on the same predicate. The blocker is still reported (so the agent is not blind), and `review.required` short-circuits earlier for the victim path — hence LOW, not MEDIUM. But it is the one branch that breaks the matrix's stated precondition.

### D-9 — `core:drafted-change-view` referenced but not declared as a dependency — **LOW**

`core:get-status` GS-4 states "the result MUST satisfy [`core:drafted-change-view`](../drafted-change-view/spec.md)", but `drafted-change-view` does not appear in the spec's `Spec Dependencies` list (which has `change`, `kernel`, `transition-change`, `schema-format`, `config`, `lifecycle-engine`, `refresh-implementation-tracking`, `composition-resolver`, `count-tasks`, `transition-checks`). Per `specs/_global/spec-layout`, a normative cross-reference should be declared. This is a spec-hygiene gap, not a code issue.

---

## 4. Test Coverage

Verified per requirement. `packages/core/test` mirrors `src` layout (`application/`, `domain/`, `composition/`), consistent with the testing spec.

| Requirement                                               | Test                                                                                                                                                                                               | Location                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| GS-9 live overlap only when archivable                    | `does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable` — asserts the `detectSpecOverlap` spy is **not** called                                                            | `core/test/application/use-cases/get-status.spec.ts:1049`                   |
| GS-9 archivable runs wired overlap I/O                    | `runs wired archive overlap I/O when archivable` — spy called, blocker present, `bypassFlag === '--allow-overlap'`                                                                                 | `get-status.spec.ts:1064`                                                   |
| GS-13 archivable overlap is skippable + carries `checkId` | `given archivable live overlap … then OVERLAP_CONFLICT is skippable`                                                                                                                               | `get-status.spec.ts:1022`                                                   |
| GS-13 / LE-4 victim path emits no `OVERLAP_CONFLICT`      | `given invalidation overlap … review is required without OVERLAP_CONFLICT` — also asserts `review.message` prose and `nextAction.command === '/specd-design'`                                      | `get-status.spec.ts:981`                                                    |
| GS-13 `impl.linksInScope` bypass attaches                 | `given failed impl.linksInScope … bypassFlag is --allow-out-of-scope`                                                                                                                              | `get-status.spec.ts:546`                                                    |
| GS-13 `impl.filesResolved` bypass must **not** attach     | `given failed impl.filesResolved … bypassFlag is absent`                                                                                                                                           | `get-status.spec.ts:490`                                                    |
| GS-13 blocker carries gerund `label`                      | `given failed deps.consistent … blocker carries gerund label`                                                                                                                                      | `get-status.spec.ts:602`                                                    |
| GS-13 requires / approval failures reach `blockers`       | `INCOMPLETE_ARTIFACT is included`; `APPROVAL_REQUIRED is included`                                                                                                                                 | `get-status.spec.ts:954, 968`                                               |
| GS-3 revision short-circuit (all four branches)           | matches / exceeds / older / unparseable                                                                                                                                                            | `get-status.spec.ts:875, 897, 919, 935`                                     |
| GS-6 refresh gating                                       | default / disabled / draft-only                                                                                                                                                                    | `get-status.spec.ts:251, 262, 273`                                          |
| GS-8 `passMemo` scoping                                   | `executes CountTasks inside task-completion before LifecycleEngine.evaluate`; `recounts CountTasks on a second execute of the same GetStatus instance` (proves memo is per-pass, not per-instance) | `get-status.spec.ts:368, 419`                                               |
| GS-12 `availableTransitions` respects task completion     | `omits verifying from availableTransitions when implementing tasks are incomplete`                                                                                                                 | `get-status.spec.ts:439`                                                    |
| GS-4 drafted read-only                                    | empty transitions; parent-review cascade without `evaluate`; missing schema artifacts from DAG                                                                                                     | `get-status.spec.ts:777, 798, 841`                                          |
| GS-14 schema degradation                                  | `returns artifacts with missing status when schema provider fails`                                                                                                                                 | `get-status.spec.ts:289`                                                    |
| TX-23 `'next'` happy path                                 | resolves `implementing → verifying`                                                                                                                                                                | `core/test/application/use-cases/transition-change.spec.ts:184`             |
| TX-23 `'next'` rejection (4 states)                       | `rejects from archivable` (189) plus three sibling cases at 217, 233, 252 covering the remaining pending/archiving states                                                                          | `transition-change.spec.ts:189-255`                                         |
| TX-23 / TC-4 `HAPPY_PATH_NEXT` table                      | `HAPPY_PATH_NEXT maps delivery hops and omits pending/archivable`                                                                                                                                  | `core/test/domain/value-objects/change-state.spec.ts:72`                    |
| TC-8 fail-fast asymmetry                                  | `collects every matching fail when failFastOn is omitted (GetStatus path)`; `stops after protocol.edge fail when failFastOn is protocol.edge (TransitionChange path)`                              | `core/test/application/services/execute-matching-predicates.spec.ts:43, 74` |
| TC-11 progress envelope                                   | `execute-check-with-progress.spec.ts`                                                                                                                                                              | `core/test/application/services/`                                           |
| LE-4 bypass narrowing at engine level                     | `given failed impl.linksInScope, when blockers are projected, then bypassFlag is --allow-out-of-scope`                                                                                             | `core/test/domain/services/lifecycle-engine.spec.ts:670`                    |
| TX-6 signoff as check                                     | `routes done → archivable when approvalsSignoff is false`; gate-on-without-consent rejection; gate-on-with-consent success                                                                         | `transition-change.spec.ts:420, 434, 451`                                   |
| TX-14 recovery hop                                        | `transitions to archivable without running archive hooks` (asserts `hooks.execute` not called)                                                                                                     | `transition-change.spec.ts:2268`                                            |
| CLI `--allow-out-of-scope` forwarding                     | flag set / unset / absent                                                                                                                                                                          | `cli/test/commands/change/transition.spec.ts:109, 131, 153`                 |

**Coverage verdict:** recorte-26 items 1, 2 and 3 are well covered, including the negative assertions (spy-not-called, bypass-absent) that make the tests actually load-bearing rather than incidental.

---

## 5. Missing Tests

### M-1 — no regression test for `includeOverlapDetection: true` in `resolveGetStatusDeps` — **MEDIUM**

This is the exact line that was previously reported HIGH. It is fixed (`composition/use-cases/get-status.ts:45`) but **unguarded**.

`core/test/composition/use-cases/get-status.spec.ts` contains only three tests — `returns a wired GetStatus instance from SpecdConfig` (68), `accepts explicit deps without config bootstrap` (75), `rejects deps plus composition options` (90). None inspects the resolved bindings. The two application-level tests that _do_ exercise overlap (`get-status.spec.ts:1049, 1064`) bypass the composition path entirely: their `makeGetStatus` helper calls `createWorkflowCheckRegistry(...)` directly with an injected `detectSpecOverlap` (`get-status.spec.ts:73-85`), so deleting the `{ includeOverlapDetection: true }` argument from `resolveGetStatusDeps` would leave the whole suite green.

Suggested shape: assert that `resolveGetStatusDeps(resolver).archiveBindings` contains a `spec.overlap` binding whose `execute` performs peer detection (or, more directly, that `createGetStatus(config)` on a fixture with two overlapping archivable changes reports `OVERLAP_CONFLICT`).

### M-2 — no test that predicates see post-refresh state on `TransitionChange` — **MEDIUM** (would have caught D-3)

Every `TransitionChange` refresh test stubs the use case with `{ execute } as unknown as RefreshImplementationTracking` returning `{ trackedFiles: [], links: [] }` (`transition-change.spec.ts:54-57, 72-75`). The two existing assertions only check _whether_ refresh was invoked (`refreshes active changes by default`, 259; `skips refresh when explicitly disabled`, 272). Because the stub never mutates the repository, the stale-instance bug at `transition-change.ts:168` is invisible.

Suggested shape: a refresh stub that writes an `open` tracked file into the repository, then assert `implementing → verifying` fails `impl.filesResolved`. `GetStatus` has the mirror-image behaviour (reload at line 356) and equally lacks a test that would notice its removal.

### M-3 — no core-level test for `allowOutOfScope` on `TransitionChange` — **MEDIUM**

Coverage stops at the CLI boundary (`cli/test/commands/change/transition.spec.ts:109-153` asserts the flag reaches the kernel call) and at `ArchiveChange` (`archive-change.spec.ts:2841, 2861, 2904`). There is no test asserting that `TransitionChange.execute({ …, allowOutOfScope: true })` actually causes `impl.linksInScope` to `skip` on an `implementing → verifying` hop, nor the complementary negative that `impl.filesResolved` **still fails** under the same flag. The archive suite has exactly that negative (`still fails open tracked files when allowOutOfScope is true`, 2841); the transition path does not.

### M-4 — no test for the `spec.overlap` peer-naming message — **MEDIUM** (would have caught D-4)

`formatOverlapMessage` (`domain/checks/spec-overlap.ts:34-49`) has no test exercising its non-empty-peers branch, and no test asserts that the composed `detectOverlap` closure populates `peers`. Both the branch and the requirement (TC-10) are currently unverified, which is why the production wiring can drop peers silently.

### M-5 — no test for `bypassFlags` on `LifecycleEngine` — **LOW** (would have caught D-5)

No test passes `bypassFlags` to `evaluate` and asserts a skippable blocker is omitted. The option is untested in either direction.

### M-6 — `HAPPY_PATH_NEXT` table test omits `pending-signoff` — **LOW**

`change-state.spec.ts:72-79` asserts `pending-spec-approval`, `archivable` and `archiving` are `undefined`, but not `pending-signoff` — even though TX-23 names all four explicitly. The use-case-level rejection tests do cover it, so this is a completeness nit on the table test.

### M-7 — no test for `nextAction` availability gating from `archivable` — **LOW** (relates to D-8)

---

## 6. Spec Dependency Chain

```
default:_global/architecture   (leaf — "Spec Dependencies: _none")
        ▲            ▲             ▲
        │            │             │
core:transition-checks ◄──────── core:lifecycle-engine
        ▲   ▲   ▲                     ▲   ▲
        │   │   └──────────────────┐  │   │
        │   └────────────┐         │  │   │
core:get-status ──────► core:transition-change
```

Declared edges (from the merged `Spec Dependencies` sections):

| Spec                     | Depends on                                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:transition-checks` | `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`                                                                                                                                                                           |
| `core:lifecycle-engine`  | `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`, `core:transition-checks`                                                                                                                                                 |
| `core:transition-change` | `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks` |
| `core:get-status`        | `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`                              |

Observations:

- **Acyclic and correctly layered.** `transition-checks` is the new shared root; `lifecycle-engine` sits above it; the two use cases depend on both. This matches the code: `domain/services/transition-checks.ts` ← `domain/services/lifecycle-engine.ts` ← `application/use-cases/{get-status,transition-change}.ts`.
- **`get-status → transition-change` is the one edge worth watching.** It is declared, and it is real (both project from the same `CheckResult` shape), but it means a change to `TransitionChangeInput` — such as D-1's `'next'` — has declared blast radius into `get-status`. The graph agrees: `graph search "HAPPY_PATH_NEXT" --symbols` shows the symbol re-exported through `domain/index.ts`, `domain/value-objects/index.ts`, `src/index.ts` and `src/public.ts`, i.e. it is public API surface.
- **`default:_global/architecture` is a declared dependency of `transition-checks`, `lifecycle-engine` and `transition-change`, but not of `get-status`.** Given `get-status` carries the `resolveGetStatusDeps` composition requirement (GS-15) that is directly governed by architecture's "Composition layer for use-case wiring" requirement, that edge is arguably missing — same class of gap as D-9.
- **Architecture consistency (depth-1) is otherwise clean.** Domain purity holds (`change-state.ts`, `happy-path-next-unavailable-error.ts`, `lifecycle-engine.ts`, `check-bindings.ts` import nothing with I/O); application uses ports only; the config-based factories delegate through `createCompositionResolver` per architecture's "The config-based form MUST delegate through one shared composition-resolver path". The single friction point is D-7 (repository orchestration inside `composition/use-cases/workflow-check-registry.ts`).

---

## 7. Summary

| Metric                             | Count                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Requirements audited               | 61 (13 transition-checks + 9 lifecycle-engine + 15 get-status + 24 transition-change) |
| **Compliant**                      | 52                                                                                    |
| **Drift (spec vs code)**           | 6 — D-3 (HIGH), D-4, D-5 (MEDIUM), D-6, D-7, D-8 (LOW)                                |
| **Contradictions (spec-internal)** | 2 — D-1 (MEDIUM), D-2 (LOW)                                                           |
| **Spec-hygiene gaps**              | 1 — D-9 (LOW)                                                                         |
| **Missing tests**                  | 7 — M-1, M-2, M-3, M-4 (MEDIUM), M-5, M-6, M-7 (LOW)                                  |

### By severity

**HIGH (1)**

- **D-3** — `TransitionChange` evaluates `impl.filesResolved` / `impl.linksInScope` against the pre-refresh `Change` instance, violating TX-4's "Lifecycle rules MUST be evaluated against tracked implementation state after any refresh". `GetStatus` reloads at `get-status.ts:356`; `TransitionChange` does not. Reintroduces the status-vs-execute divergence this change exists to remove. Untested (M-2).

**MEDIUM (6)**

- **D-1** — merged `Requirement: Input contract` still says `to` is `ChangeState`-only, contradicting the added `to next` requirement and the shipped `ChangeState | 'next'` type. Delta never re-opened that section.
- **D-4** — production `spec.overlap` wiring discards peer names and spec ids, so `OVERLAP_CONFLICT` messages are the generic fallback; TC-10's "MUST name the overlapping change(s) and overlapping spec id(s)" is unmet and `formatOverlapMessage`'s peer branch is dead code.
- **D-5** — `LifecycleEngine.bypassFlags` is accepted and logged but never filters blockers, contrary to LE-4's "the engine MUST omit that blocker".
- **M-1** — the previously-HIGH `includeOverlapDetection: true` fix has no regression test; the composition suite would stay green if it were deleted.
- **M-2** — no test asserts post-refresh state reaches transition predicates.
- **M-3 / M-4** — `allowOutOfScope` on `TransitionChange` and the overlap peer message are both unverified.

**LOW (7)** — D-2 (`allowOutOfScope` documented only in Constraints), D-6 (`_resolveTarget` identity residue), D-7 (duplicated overlap discovery across composition and application), D-8 (`archivable` `nextAction` not availability-gated), D-9 (`drafted-change-view` referenced but undeclared), M-5, M-6, M-7.

### Recorte-26 verdict

All five focus items were checked. **Items 1, 2, 3 and 5 are compliant in code, with solid test coverage for 1–3.** The previously reported HIGH (`GetStatus` missing `includeOverlapDetection: true`) is genuinely fixed at `composition/use-cases/get-status.ts:45` — but is now the highest-value untested line in the change (M-1). **Item 4 is confirmed as a real spec-internal contradiction** (D-1): the code is right, the merged `Input contract` requirement is stale on two of five fields.

The one finding that is not a documentation or coverage issue is **D-3**, which is a behavioural gap on the central gate this change introduces.

### Partial: archive-hooks

# Partial Compliance Report — Archive & Hooks

- **Change:** `workflow-transition-checks`
- **Auditor scope:** `core:archive-change`, `core:hook-execution-model`, `core:workflow-model`, `core:change` (gate/drain slice only), `core:approve-spec`, `core:approve-signoff`
- **Mode:** read-only. No source or spec files were modified.
- **Spec source:** merged deltas via `changes spec-preview workflow-transition-checks <specId> --format text`

---

## 1. Requirements

### 1.1 `core:archive-change` (31 requirements)

Ports and constructor; Archive bindings not RunStepHooks on the use case; Input; Schema name guard; ArchivedChange construction; Archivable guard; Deferred transition to archiving; ReadOnly workspace guard; Overlap guard; Pre-archive hooks; Tracked artifact selection at archive time; Prepare archive plan before permanent writes; Staged archive commit and failed-attempt visibility; Batch canonical snapshot before publication; Batch canonical restore on commit failure; Orphan archive backup detection; Lifecycle rollback after failed commit; Archive debug logging; Delta merge and spec sync; Archive repository call; Archive index metadata maintenance; Post-archive hooks; Spec metadata generation; spec-lock sidecar persistence; Result shape; Typed errors for archive failures; Archive checks share runners and wrap remaining preflight; Tracked implementation review guard; Implementation materialization into spec-lock; Out-of-scope sidecar update guard; Config-based factory delegates through `resolveArchiveChangeDeps`.

Key normative statements for the assigned focus areas:

- **Input** — `allowOverlap` (default `false`) skips the overlap check; `allowOutOfScope` (default `false`) gives skippable `impl.linksInScope` semantics and **MUST NOT** bypass `impl.filesResolved`.
- **Archive checks share runners** — archive predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, then `workspace.readOnly` / `deps.consistent` (same runners as enter-`ready`), then `impl.filesResolved` / `impl.linksInScope` (same runners as forward exit from `implementing`). `archive.publication` **MUST NOT** be registered.
- **Pre/Post-archive hooks** — effect selection **MUST** use binding `phase` (`before-persist` / `after-persist`), **not** `check.id === 'hook.pre'`. `hook.pre` is `abort`/`before-persist`; `hook.post` is `collect`/`after-persist`. `skipHookPhases` accepts `'pre' | 'post' | 'all'`; `--skip-hooks` skips effects only, never predicates.
- **Deferred transition** — overlap guard, readOnly guard, pre-archive hooks and full-batch preflight all complete while the change is still in `archivable`; transition to `archiving` happens inside `ChangeRepository.mutate` immediately before the first canonical publish.
- **spec-lock sidecar persistence** — for a lock-less spec, the initial dependency set **MUST** be resolved through the shared `resolveInitialPersistedDependsOn()` service, and archive **MUST NOT** maintain a second artifact/metadata fallback algorithm.
- **Implementation materialization** — normalize to `workspace:path`, persist file- and symbol-level links, **ignore links under the target workspace `graph.excludePaths`**, discard unnormalizable links, and fail archive when a link escapes the workspace `codeRoot`.

### 1.2 `core:hook-execution-model` (12 requirements)

Two hook types; External hooks are explicit workflow entries; External hooks follow workflow phase semantics; `instruction` hooks are passive text; Default hook execution for transitions and archives; Two execution modes for run hooks; Change entity does not execute hooks; Manual hook control with `skipHooks`; Pre-hook failure semantics; Post-hook failure semantics; Hook ordering; Template variable expansion.

Focus statements: both `TransitionChange` and `ArchiveChange` **MUST NOT** branch on `hook.pre` / `hook.post` ids for timing, failure policy, skip mapping, or for launching `RunStepHooks`; `RunStepHooks` **SHALL** be a constructor dep of the hook _checks_. Transition selectors are `source.pre`, `source.post`, `target.pre`, `target.post`, `all`; archive selectors are `pre`, `post`, `all`. Because transition `hook.pre` and `hook.post` share `before-persist`, skip **MUST NOT** rely on `binding.phase` alone.

### 1.3 `core:workflow-model` (10 requirements)

Step names reference domain lifecycle states; Step semantics; Requires-based gating; Task completion gating; Step availability evaluation; Workflow array order is display order and progress axis; Step-to-state mapping; Hook execution at step boundaries; Two execution modes; Step requires reference artifact IDs.

Focus statement: the archiving step's archive `run:` hooks are executed by `ArchiveChange` as operation `archive`, not as a lifecycle `along` value. There is one pipeline — predicates then matching effects — and skills passing `skipHookPhases` must not become a second engine.

### 1.4 `core:change` — gate/drain slice (2 requirements audited)

Spec approval gate; Signoff gate. Both require that `pending-spec-approval` / `pending-signoff` remain **drain-only** parking states for in-flight changes: `VALID_TRANSITIONS['ready']` MUST be `implementing` and `designing` only; `VALID_TRANSITIONS['done']` MUST include `archivable`, `designing`, `implementing`, `verifying` and no `pending-signoff`. Drain hops `pending-spec-approval → {spec-approved, designing}` and `pending-signoff → {signed-off, designing}` remain legal.

### 1.5 `core:approve-spec` / `core:approve-signoff` (8 requirements each)

Gate guard; Change lookup; Artifact hash computation; Approval/Signoff recording and state transition; Persistence and return value; Input contract; Approval gate baked at construction; Config-based factory delegates through `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`.

Focus statement: when the change is in a state bound as `from` for the gate check (`ready` / `done`), the use case **MUST NOT** transition into the pending or approved state; it records the history event and leaves the state alone. Drain from `pending-*` **MAY** still transition to `spec-approved` / `signed-off`.

---

## 2. Implementation

### 2.1 Binding table — compliant

`packages/core/src/domain/services/check-bindings.ts` defines `ARCHIVE_BINDING_SPECS` in exactly the spec's registry order (`schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`, `hook.pre` @ `before-persist`/`abort`, `hook.post` @ `after-persist`/`collect`). No `archive.publication` row exists. `TRANSITION_BINDING_SPECS` binds `impl.filesResolved` and `impl.linksInScope` to `from: 'implementing', to: '*', along: 'forward'`, so redesign (`implementing → designing`, classified `redesign`) does not match — as required.

Shared runners are genuinely shared: `createWorkflowCheckRegistry` (`packages/core/src/application/checks/workflow-check-registry.ts`) instantiates each `create*` check exactly once and `applyBindingSpecs` attaches the same instance to both `TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`. `workspace.readOnly`, `deps.consistent`, `impl.filesResolved` and `impl.linksInScope` are therefore object-identical across transition and archive tables.

`RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost` only. It never reaches `ArchiveChange`.

### 2.2 `allowOverlap` / `allowOutOfScope` skip semantics — compliant

- `runSpecOverlap` (`packages/core/src/domain/checks/spec-overlap.ts:58`) returns `skip('spec.overlap')` when `facts.allowOverlap`.
- `runImplLinksInScope` (`packages/core/src/domain/checks/impl-links-in-scope.ts:24`) returns `skip('impl.linksInScope')` when `facts.allowOutOfScope`.
- `runImplFilesResolved` (`packages/core/src/domain/checks/impl-files-resolved.ts:37`) takes **only** `openTrackedImplementationFiles` — it has no access to `allowOutOfScope` and cannot be skipped by it. The application wrapper `impl-files-resolved.ts` likewise never reads `ctx.allowOutOfScope`. This is the strongest form of the requirement (structurally impossible rather than merely not-wired).
- `buildCheckExecutionContext` normalizes both flags to `false` when absent, matching the documented defaults.

### 2.3 `skipHookPhases` — compliant

`ArchiveChangeInput.skipHookPhases: ReadonlySet<'pre' | 'post' | 'all'>` (`archive-change.ts:63-91`). The selector set is forwarded into the check context (`archive-change.ts:333`, `:538`) and the _check_ performs the skip, not the use-case loop:

`HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts:133-149`) checks `all` first, then branches on `ctx.attempt.scope === 'archive'` to honour `pre` / `post`, and otherwise honours transition selectors `target.pre` / `source.post`. This satisfies "skip MUST NOT rely on `binding.phase` alone" — transition `hook.pre` and `hook.post` share `before-persist` yet are skipped independently via distinct selectors. `source.pre` and `target.post` are correctly no-ops on this table.

CLI wiring is present and correct: `packages/cli/src/commands/change/archive.ts:57,87-101` maps `--skip-hooks pre,post,all` through `parseCommaSeparatedValues(..., VALID_ARCHIVE_HOOK_PHASES, ...)` and passes `allowOverlap` / `allowOutOfScope` only when the flags are set.

### 2.4 Effect selection by binding phase, not check id — compliant

`archive-change.ts:320` and `:526` iterate `matchingEffects(this._archiveBindings, archiveAttempt, 'before-persist' | 'after-persist')`. `matchingEffects` (`packages/core/src/application/services/execute-hook-effect.ts:23-35`) filters on `isEffectCheck(binding.check) && binding.phase === phase && bindingMatches(...)`. There is no `check.id === 'hook.pre'` comparison anywhere in `ArchiveChange`. Failure policy comes from `hookFailureMode(binding.onFailure)` (`abort → fail-fast`, `collect → fail-soft`), not from the check id.

`TransitionChange._executeEffect` (`transition-change.ts:304-326`) uses the identical shape — one `check.execute(ctx)` call plus `hookFailureMode(binding.onFailure)` — so both use cases share the pipeline.

### 2.5 Overlap detection wiring — compliant

`resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection })` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:20-68`) wires the peer detector only when requested; otherwise `createWorkflowCheckRegistry` substitutes `() => ({ blocked: false })`.

- `packages/core/src/composition/use-cases/archive-change.ts:132` → `{ includeOverlapDetection: true }` ✅ (spec: archive MUST include it)
- `packages/core/src/composition/use-cases/get-status.ts:45` → `{ includeOverlapDetection: true }` ✅
- `packages/core/src/composition/use-cases/transition-change.ts:45` → no option ✅ (overlap stays archive-only and MUST NOT run as an enter-`ready` predicate)

`GetStatus` additionally executes archive predicates only when `change.state === 'archivable'`, with `allowOverlap: false, allowOutOfScope: false` (`get-status.ts:463-478`), matching "GetStatus still only _executes_ archive predicates in `archivable`".

### 2.6 Archive ordering and deferred transition — compliant

`ArchiveChange.execute` order (`archive-change.ts:262-413`): load change → resolve schema → list workspaces → local overlap report → `executeMatchingPredicates(archiveBindings, ...)` → throw on first failing check in registry order via `throwMappedArchiveFailure` → invalidate overlapping peers when `allowOverlap` → resolve actor → `before-persist` effects → `_prepareArchivePlan` → `_prepareArchivePreflight` → `detectOrphans` + per-spec `snapshot` → `mutate` transition to `archiving` → staged publication → `archive.archive()` → `cleanup` → metadata materialization → `after-persist` effects.

`throwMappedArchiveFailure` (`archive-change.ts:1300-1372`) maps each check id back to the historical typed error: `SchemaMismatchError`, `InvalidStateTransitionError` (re-raised via `change.assertArchivable()`), `SpecOverlapError`, `ReadOnlyWorkspaceError` with the exact spec'd message format, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`. `ArchivePreflightError` / `ArchiveArtifactMissingError` stay inside the use case after predicates allow the operation, as required.

### 2.7 Pending states drain-only — compliant

`packages/core/src/domain/value-objects/change-state.ts:30-43`:

```
ready:       ['implementing', 'designing']                           // no pending-spec-approval ✅
done:        ['archivable', 'designing', 'implementing', 'verifying'] // no pending-signoff ✅
archivable:  ['archiving', 'designing', 'implementing', 'verifying']  // no 'ready', no 'done' ✅
archiving:   ['archivable', 'designing']                              // recovery ✅
'pending-spec-approval': ['spec-approved', 'designing']               // drain ✅
'pending-signoff':       ['signed-off', 'designing']                  // drain ✅
```

No entry in `VALID_TRANSITIONS` targets `pending-spec-approval` or `pending-signoff`, so the pending states are structurally unreachable for new work. `HAPPY_PATH_NEXT` routes `ready → implementing` and `done → archivable`, never through a pending state.

### 2.8 No pending rewrite on approve — compliant

`ApproveSpec.execute` (`approve-spec.ts:70-102`) and `ApproveSignoff.execute` (`approve-signoff.ts:70-102`) are structurally identical:

1. gate flag from construction (`ApprovalGateDisabledError` before any repository access);
2. `changes.get(name)` → `ChangeNotFoundError`;
3. actor identity;
4. schema → `SchemaMismatchError`;
5. state guard derived from the engine, not hardcoded: `boundFromStates('approval.spec' | 'approval.signoff')` plus the drain state;
6. inside `mutate`: hash artifacts, `recordSpecApproval` / `recordSignoff`, and transition **only** `if (freshChange.state === 'pending-spec-approval' | 'pending-signoff')`.

There is no code path that writes `pending-*` and none that transitions a `ready` / `done` change to `spec-approved` / `signed-off`. Using `boundFromStates` rather than literal `'ready'` / `'done'` satisfies "`from` states for `approval.spec` come from engine bindings".

### 2.9 External hooks — compliant (indirect)

`RunStepHooks` (`packages/core/src/application/use-cases/run-step-hooks.ts:68-90, 211-214, 294-309`) collects `type: 'run' | 'external'` entries, dispatches `external` entries to `_externalHookRunners.get(hook.externalType)`, and throws `ExternalHookTypeNotRegisteredError` when no runner accepts the type. Because `HookEffectCheck` delegates wholesale to `RunStepHooks`, explicit external hooks inherit archive/transition phase semantics without a second dispatch path — satisfying "the difference is the dispatch backend, not the lifecycle semantics".

---

## 3. Discrepancies

### D1 — HIGH — `spec-lock` initial `dependsOn` bypasses `resolveInitialPersistedDependsOn()`

**Spec:** `core:archive-change` › _spec-lock sidecar persistence_ step 3 — "When no lock exists, resolves the initial dependency set through `resolveInitialPersistedDependsOn()` … It does not maintain a second artifact/metadata fallback algorithm for initial dependency resolution." Verify scenario: _No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn_.

**Implementation:** `archive-change.ts` never imports `resolve-initial-persisted-depends-on.js`. `_resolvePersistedDependsOn` (`archive-change.ts:989-1008`) implements a private four-tier precedence chain — manifest deps → existing sidecar → cached `metadata.json` deps → freshly extracted deps — which is exactly the "second artifact/metadata fallback algorithm" the requirement forbids. Cross-check: `resolveInitialPersistedDependsOn` is consumed only by `initialize-persisted-spec-state.ts`, `update-persisted-spec-deps.ts` and `update-persisted-spec-implementation.ts`.

**Risk:** archive and `InitializePersistedSpecState` can seal different initial `dependsOn` for the same lock-less spec; the divergence is silent and lands in canonical `spec-lock.json`.

### D2 — MEDIUM — `graph.excludePaths` not applied during archive-time link materialization

**Spec:** `core:archive-change` › _Implementation materialization into spec-lock_ — "ignore links whose raw file path falls under the target workspace `graph.excludePaths`". Verify scenario: _Excluded path is ignored during sidecar materialization_.

**Implementation:** `_materializeImplementationLinks` (`archive-change.ts:1183-1233`) resolves the absolute path, converts to a `codeRoot`-relative portable path, and emits the entry. No exclusion filter exists. `excludePaths` is honoured only upstream at tracking time (`refresh-implementation-tracking.ts:86-88` → `vcs-implementation-detector.ts:70-73`), so an excluded path that was confirmed before a config change, or added out-of-band, is materialized into `spec-lock.json`.

**Aggravating factor:** the method body contains an abandoned deliberation left in the source (`archive-change.ts:1208-1216`), including lines such as `// Ah, I need to check if I added it.` and `// "está mal, si ves el proposal, graphConfig no entraba a ProjectWorkspace"`. This is a self-documented unfinished requirement and also violates the repo comment conventions.

### D3 — MEDIUM — `resolveArchiveChangeDeps` requirement text contradicts its own verify and the sibling requirement

**Spec (internal defect):** _Config-based factory delegates through resolveArchiveChangeDeps_ lists `runStepHooks: RunStepHooks` and `regenerateMetadata: RegenerateSpecMetadata` among the MUST-resolve deps. That directly contradicts (a) _Archive bindings not RunStepHooks on the use case_ — "`resolveArchiveChangeDeps` MUST include `archiveBindings` … and MUST NOT list `runStepHooks` on `ArchiveChangeDeps`" — and (b) its own verify scenario, which asserts `archiveBindings`, `materializeMetadata`, and "does not resolve `runStepHooks` onto the use case".

**Implementation:** `resolveArchiveChangeDeps` (`composition/use-cases/archive-change.ts:119-148`) resolves `archiveBindings` + `materializeMetadata` and no `runStepHooks` / `regenerateMetadata`. The code matches the verify file and the binding requirement; the spec.md dep list is stale prose. Fix the spec, not the code.

### D4 — LOW/MEDIUM — Overlap detection runs twice per archive

**Spec:** _Overlap guard_ prescribes one sequence (list → exclude self → `detectSpecOverlap` → filter) as the `spec.overlap` check.

**Implementation:** that sequence exists twice per archive. `ArchiveChange.execute:271-282` performs `changes.list()` plus one `changes.get()` per peer and computes `relevantOverlap` locally; the composed `spec.overlap` check re-runs the identical loop inside `workflow-check-registry.ts:38-59`. The local copy is needed for `SpecOverlapError` entries and peer invalidation, but the result is 2×(1 + N) repository reads and two sources of truth that can disagree under concurrency (a peer created between the two passes blocks the check while the error payload omits it).

### D5 — LOW — `spec.overlap` never receives `specOverlapPeers`, so `GetStatus` messages are non-actionable

**Spec:** `runSpecOverlap` supports `specOverlapPeers` and formats "Specs overlap with other active changes: `<name> (<specIds>)`".

**Implementation:** the composed detector (`workflow-check-registry.ts:53-58`) returns only `{ blocked, message: 'Specs overlap with other active changes' }` and never populates `specOverlapPeers`, so `formatOverlapMessage` always takes the `peers.length === 0` fallback. `ArchiveChange` is unaffected (it throws `SpecOverlapError` built from its local entries), but `GetStatus` blockers in `archivable` cannot name the conflicting change. The peer-formatting code in `spec-overlap.ts:34-49` is currently dead.

### D6 — LOW — Archive debug logging omits several mandated pre-commit entries

**Spec:** _Archive debug logging_ › Pre-commit requires, among others, "archivable guard pass — change name and current state" and "overlap and readOnly guard outcomes — spec IDs checked; overlap entries or readOnly workspaces when relevant".

**Implementation:** the predicate block emits a single aggregate `'ArchiveChange named archive predicates complete'` with `{ change, overlapCount, invalidatedChanges }` (`archive-change.ts:310-314`). There is no per-guard log for the archivable pass (with current state) and no readOnly outcome log with the spec IDs checked. Snapshot / restore / commit / post-commit logging is otherwise present and matches the requirement.

### D7 — LOW — `staleMetadataSpecPaths` returns spec IDs, not spec paths

**Spec:** _Result shape_ — "`staleMetadataSpecPaths` — array of **spec paths** where `metadata.json` generation failed".

**Implementation:** `archive-change.ts:518` pushes `specId` (`workspace:capability/path` form). The preflight already carries `specPath: SpecPath` for each publication, so the intended value is available. Either the field or the spec should be renamed; today the name misdescribes the payload for consumers.

### D8 — LOW — Unnormalizable link fails instead of being discarded

**Spec:** _Implementation materialization into spec-lock_ — "discard links that cannot be normalized into a valid `workspace:path`" _and_ "fail archive when a confirmed link points outside the `codeRoot`".

**Implementation:** an unknown workspace throws `ArchiveImplementationStateError` (`archive-change.ts:1192-1197`). An unknown-workspace link cannot be normalized, so by the letter of the requirement it should be discarded, not fatal. The `codeRoot` escape case (`:1201-1206`) correctly fails. The two bullets are genuinely ambiguous about which one owns "unknown workspace"; recommend disambiguating the spec.

### D9 — INFO — `deps.consistent` evaluated twice with different fact sources

`deps.consistent` runs as an archive predicate through the shared runner (registry order position 5), and again inside preflight via `_assertArchiveDepsConsistent` (`archive-change.ts:1145-1173`), which calls `runDepsConsistent` with `finalDependsOn` rather than the enter-`ready` facts. The second pass is arguably necessary — only preflight knows the sealed sidecar value — but the spec describes `deps.consistent` as a single shared runner, so the double evaluation is undocumented. Not a violation; worth a spec note.

### D10 — INFO — Dead gate branch in `_assertDrainAndGateTargets`

`transition-change.ts:343-363` guards `requestedTarget === 'pending-spec-approval'` / `'pending-signoff'`. Since D-2.7 confirms no `VALID_TRANSITIONS` entry targets those states, `protocol.edge` rejects the hop first and these branches are unreachable. Harmless defensive code; noted only so a future reader does not mistake it for a live pending-entry path.

---

## 4. Tests

### 4.1 `packages/core/test/application/use-cases/archive-change.spec.ts` (2948 lines, ~64 cases)

Directly covering the focus areas:

| Focus                                  | Test                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `RunStepHooks` on use case          | `constructor › does not store RunStepHooks on the instance` (:168)                                                                                                                                                                            |
| `skipHookPhases all`                   | `given archive hook phases are skipped › does not execute hooks` (:1521), plus merge/metadata/`postHookFailures` still-correct cases (:1386, :1430, :1474)                                                                                    |
| `skipHookPhases pre`                   | `skips only pre hooks when skipHookPhases contains pre` (:1548)                                                                                                                                                                               |
| `skipHookPhases post`                  | `skips only post hooks when skipHookPhases contains post` (:1579)                                                                                                                                                                             |
| `allowOverlap` false                   | `overlap guard › throws SpecOverlapError when other changes target the same specs` (:2609)                                                                                                                                                    |
| `allowOverlap` true                    | `proceeds when allowOverlap is true despite overlap` (:2644); `invalidates multiple overlapping changes` (:2688); `returns empty invalidatedChanges when allowOverlap is true but no overlap exists` (:2742)                                  |
| Overlap excludes self                  | `proceeds without flag when no overlap exists` (:2763)                                                                                                                                                                                        |
| `impl.filesResolved` not skippable     | `still fails open tracked files when allowOutOfScope is true` (:2841) — the load-bearing negative test                                                                                                                                        |
| `impl.filesResolved` default           | `fails when tracked implementation files remain open` (:2820)                                                                                                                                                                                 |
| `impl.linksInScope` default / override | `fails when implementation links target specs outside scope without allowOutOfScope` (:2861); `publishes out-of-scope implementation sidecars when allowOutOfScope is true` (:2904)                                                           |
| Deferred transition                    | `keeps change archivable during pre-hooks` (:2551); `transitions to archiving via mutate after preflight and before publication` (:2579)                                                                                                      |
| Pre-hook abort                         | `throws HookFailedError and does not return a result` (:1168); `does not call archive repository when pre-hook fails` (:2493)                                                                                                                 |
| Post-hook collect                      | `collects hook failure without rolling back the archive` (:2319); `collects all failed hook commands` (:2428)                                                                                                                                 |
| `instruction` not executed             | `given an instruction-type pre hook entry is configured › does not invoke the hook runner` (:1365)                                                                                                                                            |
| Hook ordering                          | `runs project-level pre hooks after schema pre hooks` (:1216); `runs project-level post hooks after schema post hooks` (:1243)                                                                                                                |
| `RunStepHooks` params                  | `passes name, step:"archiving", phase:"pre"` (:2378) and `phase:"post"` (:2402)                                                                                                                                                               |
| readOnly guard                         | `throws ReadOnlyWorkspaceError when change contains readOnly specs` (:2786)                                                                                                                                                                   |
| Preflight atomicity                    | `blocks earlier spec publication when a later spec fails preflight` (:603); `completes batch preflight before the first publish starts` (:712)                                                                                                |
| Typed errors / deps                    | `fails archive when extracted dependsOn mismatches final persisted deps` (:511)                                                                                                                                                               |
| Sidecar                                | `writes spec-lock.json on first archive using final persisted dependsOn` (:392); `preserves existing sidecar schema and refreshes dependsOn on re-archive` (:449); `falls back to spec-lock dependsOn when extraction omits dependsOn` (:833) |

### 4.2 `packages/cli/test/commands/change/archive.spec.ts` (19 cases)

`--skip-hooks all` (:230), `pre` (:254), `post` (:277), `pre,post` (:300), default empty set (:331); `--allow-overlap` (:354); `--allow-out-of-scope` (:377); both flags omitted (:400); post-hook exit code 2 (:64); invalidated-change reporting in text (:147) and JSON (:172); check-progress streaming (:112, :425).

### 4.3 `packages/core/test/domain/services/transition-checks.spec.ts`

Archive rows all carry `scope: 'archive'` (:207-209); **shared-runner identity** asserted by object identity — `TRANSITION_BINDINGS.find(deps.consistent).check` `toBe` `ARCHIVE_BINDINGS.find(deps.consistent).check` (:213-216); archive `hook.pre` = `before-persist`/`abort` and `hook.post` = `after-persist`/`collect` (:267-270); `archive.publication` absent from archive bindings (:390-391).

### 4.4 `packages/core/test/application/use-cases/get-status.spec.ts`

`given archivable live overlap, when GetStatus runs archive predicates, then …` asserts blocker code `OVERLAP_CONFLICT` with `checkId === 'spec.overlap'` (:1022-1046); `does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable` (:1049-1061) pins the archivable-only gating.

### 4.5 Approve use cases

`approve-spec.spec.ts` (17 cases) and `approve-signoff.spec.ts` (17 cases) are symmetric and cover the drain-only contract precisely: `records consent and stays in ready` / `stays in done` (:72), drain `transitions the change to spec-approved` / `signed-off` (:116), gate-disabled short-circuit before load (:202/:201), `ApprovalGateDisabledError` code (:224/:223), non-wait-state `InvalidStateTransitionError` (:244/:243), `SchemaMismatchError` before `mutate` (:266/:265), `ChangeNotFoundError` (:289/:288), hashing (:136), persistence through `mutate` (:178/:177).

### 4.6 Other

`packages/core/test/application/checks/workflow-check-factories.spec.ts` verifies `createHookPre` uses `RunStepHooks` from the constructor and `createHookPost.kind === 'effect'`. `packages/core/test/application/use-cases/transition-change.spec.ts:2534-2547` substitutes a failing `workspace.readOnly` binding, exercising the shared runner on the transition side.

---

## 5. Missing Tests

| #   | Gap                                                                                                                                                                                                                                                                                                                               | Tied to                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| M1  | No test asserts a lock-less spec resolves initial `dependsOn` via `resolveInitialPersistedDependsOn()`. Verify scenario _No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn_ is unrepresented — which is why D1 shipped undetected.                                                                 | D1                         |
| M2  | No test for _Excluded path is ignored during sidecar materialization_. A confirmed link under `graph.excludePaths` is never fed to `_materializeImplementationLinks` in any case.                                                                                                                                                 | D2                         |
| M3  | No composition test asserts `resolveArchiveChangeDeps` returns `archiveBindings` and omits `runStepHooks` (grep for `resolveArchiveChangeDeps` in `packages/core/test` and `packages/cli/test` returns nothing). Both verify scenarios under _Config-based factory delegates through resolveArchiveChangeDeps_ are unrepresented. | D3                         |
| M4  | No test asserts `resolveWorkflowCheckRegistry` passes `includeOverlapDetection: true` for archive and _omits_ it for `TransitionChange`. The "overlap MUST NOT run as an enter-`ready` predicate" invariant is currently protected only by reading the composition source.                                                        | §2.5                       |
| M5  | Verify scenario _before-persist slot does not hardcode hook.pre_ has no direct test. Existing tests exercise the default `hook.pre` binding; none registers a second `before-persist` effect with a different id and asserts it also runs. A regression to `check.id === 'hook.pre'` would stay green.                            | §2.4                       |
| M6  | No test for archive `skipHookPhases` receiving an unknown/irrelevant selector (e.g. `target.pre` on an archive attempt) staying a no-op — the mirror of the transition `source.pre` / `target.post` no-op scenarios.                                                                                                              | §2.3                       |
| M7  | Verify scenario _Missing tracked file fails even if an alternate path exists_ has no matching case; the positive twin (_Tracked direct artifact wins over stray delta file_) is covered by :2156.                                                                                                                                 | Tracked artifact selection |
| M8  | No test asserts `spec.overlap` failure messages name the conflicting peers. Adding one would surface D5 immediately.                                                                                                                                                                                                              | D5                         |
| M9  | No test for the _Archive debug logging_ pre-commit entries (archivable guard pass with current state; readOnly/overlap guard outcomes with spec IDs).                                                                                                                                                                             | D6                         |
| M10 | No test pins `staleMetadataSpecPaths` payload shape (spec path vs spec ID).                                                                                                                                                                                                                                                       | D7                         |
| M11 | No test asserts `VALID_TRANSITIONS` has **no** entry targeting `pending-spec-approval` / `pending-signoff`. The drain-only invariant is currently correct but unguarded — a future re-add of `ready → pending-spec-approval` would not fail any test in this slice.                                                               | §2.7                       |
| M12 | No test asserts `ApproveSpec` / `ApproveSignoff` derive their `from` guard from `boundFromStates(...)` rather than literals — i.e. that rebinding `approval.spec` to a different `from` state moves the guard with it.                                                                                                            | §2.8                       |

---

## 6. Counts

| Metric                                 | Count                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs audited                          | 6                                                                                                                                                                                                           |
| Requirements reviewed                  | 71 (archive-change 31, hook-execution-model 12, workflow-model 10, approve-spec 8, approve-signoff 8, change gate/drain slice 2)                                                                            |
| Requirements assessed compliant        | 61                                                                                                                                                                                                          |
| Requirements with discrepancies        | 8 (D1, D2, D3, D4, D5, D6, D7, D8)                                                                                                                                                                          |
| Informational observations             | 2 (D9, D10)                                                                                                                                                                                                 |
| Discrepancies by severity              | HIGH 1, MEDIUM 2, LOW/MEDIUM 1, LOW 4                                                                                                                                                                       |
| Spec-side defects (fix spec, not code) | 2 (D3 stale dep list, D8 ambiguous bullets)                                                                                                                                                                 |
| Existing tests inspected               | ~120 cases across 7 files                                                                                                                                                                                   |
| Missing-test gaps identified           | 12                                                                                                                                                                                                          |
| Focus areas fully compliant            | 5 of 6 — shared runners, `skipHookPhases` pre/post/all, `impl.filesResolved` not skipped by `allowOutOfScope`, pending drain-only / no pending rewrite on approve, archive `includeOverlapDetection` wiring |
| Focus areas with findings              | 1 — `allowOverlap` / `allowOutOfScope` path (D4 duplicate detection, D5 non-actionable peer message)                                                                                                        |

### Files inspected

- `packages/core/src/application/use-cases/archive-change.ts`
- `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`
- `packages/core/src/application/use-cases/transition-change.ts` (effect + drain slices)
- `packages/core/src/application/use-cases/run-step-hooks.ts` (external-hook slice)
- `packages/core/src/application/checks/workflow-check-registry.ts`, `hook-effect.ts`, `impl-links-in-scope.ts`
- `packages/core/src/application/services/execute-matching-predicates.ts`, `execute-hook-effect.ts`
- `packages/core/src/domain/services/check-bindings.ts`
- `packages/core/src/domain/checks/impl-files-resolved.ts`, `impl-links-in-scope.ts`, `spec-overlap.ts`
- `packages/core/src/domain/value-objects/change-state.ts`
- `packages/core/src/composition/use-cases/archive-change.ts`, `workflow-check-registry.ts`, `get-status.ts`, `transition-change.ts`
- `packages/core/src/application/use-cases/get-status.ts` (archive-predicate slice)
- `packages/core/src/application/ports/change-repository.ts` (`mutate` contract)
- `packages/cli/src/commands/change/archive.ts`

### Partial: cli

# Partial Compliance Report — CLI (`cli:change-status`, `cli:change-transition`, `cli:change-archive`, `cli:change-approve`)

- **Change:** `workflow-transition-checks` (`20260825-162927-workflow-transition-checks`)
- **Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`
- **Date:** 2026-08-28 12:17
- **Mode:** read-only spec-compliance audit (no files modified)
- **Spec source:** `node packages/cli/dist/index.js change spec-preview workflow-transition-checks <specId>` (merged spec + verify, deltas applied)
- **Focus:** Recorte 26 + latest (`--next`, `--allow-out-of-scope`, test-file layout, status overlap/review rendering)

---

## 1. Requirements

Merged (post-delta) requirement inventory for the four audited specs.

### `cli:change-status` — 16 requirements

| #   | Requirement                                        | Key MUSTs relevant to this change                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Command signature                                  | `<name>` positional, `--format`                                                                                                                                                                                                                                                                                                                                  |
| 2   | Drafted change status is read-only                 | no mutating transitions, `isDrafted: true`                                                                                                                                                                                                                                                                                                                       |
| 3   | Output format                                      | `artifactDag[].hasTasks`; `state` = drift-aware display projection                                                                                                                                                                                                                                                                                               |
| 4   | Task completion display in DAG                     | `[hasTasks - N/M done]` / fallback `[hasTasks]`                                                                                                                                                                                                                                                                                                                  |
| 5   | Display-state rendering                            | `complete-with-drift`; `missing` unchanged                                                                                                                                                                                                                                                                                                                       |
| 6   | Lifecycle projections come from GetStatus checks   | no local `VALID_TRANSITIONS` re-filter                                                                                                                                                                                                                                                                                                                           |
| 7   | **Text status omits duplicated review file lists** | `review:` header with `required`/`route`/`reason`/`message`; **no** `affectedArtifacts` paths; **invalidation overlap MUST NOT appear as `OVERLAP_CONFLICT` blocker**; overlap peers printed when `reason='spec-overlap-conflict'` and `overlapDetail` non-empty; JSON/TOON serialize full `review` incl. `overlapDetail`; `--help` schema lists `overlapDetail` |
| 8   | Text blockers include check labels                 | `! <CODE> — <label>: <message>`; JSON serializes `label` + `checkId`                                                                                                                                                                                                                                                                                             |
| 9   | Schema version warning                             | compare against `lifecycle.schemaInfo`, skip when `null`                                                                                                                                                                                                                                                                                                         |
| 10  | Change not found                                   | exit 1                                                                                                                                                                                                                                                                                                                                                           |
| 11  | Schema-derived fields                              | `schema.artifactDag` from `schema.artifactDag()`; `childrenOf`; convergent nodes rendered once                                                                                                                                                                                                                                                                   |
| 12  | Delegates refresh policy to GetStatus              | no direct `RefreshImplementationTracking` / `ImplementationDetector`                                                                                                                                                                                                                                                                                             |
| 13  | Implementation section                             | `--implementation` renders `sdk:build-implementation-review` projection                                                                                                                                                                                                                                                                                          |
| 14  | Task completion in details section                 | `tasks: N/M`                                                                                                                                                                                                                                                                                                                                                     |
| 15  | Basic info section                                 | no standalone `specs:` line                                                                                                                                                                                                                                                                                                                                      |
| 16  | Specs and dependencies section                     | `specs and dependencies:` block + `specDependsOn` in JSON                                                                                                                                                                                                                                                                                                        |

### `cli:change-transition` — 14 requirements

| #   | Requirement                                  | Key MUSTs relevant to this change                                                                                                                                                                                                                    |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Command signature**                        | `[step]` optional; **`--next` MUST pass `to: 'next'`**; **`--allow-out-of-scope` MUST pass `allowOutOfScope: true`, applies only to `impl.linksInScope`, MUST NOT bypass `impl.filesResolved`; when omitted the CLI MUST NOT set `allowOutOfScope`** |
| 2   | **Next-transition resolution**               | Core resolves happy path; **CLI MUST NOT maintain a from→to routing table**; MUST NOT use `GetStatus.nextAction` as resolution; Core rejection ⇒ exit 1 + `error:`                                                                                   |
| 3   | Delegates refresh policy to TransitionChange | pre-transition and repair-guide `GetStatus` with `refreshImplementationTracking: false`                                                                                                                                                              |
| 4   | Approval-gate routing                        | no approval flags on execute input; no `implementing→pending-spec-approval` rewrite                                                                                                                                                                  |
| 5   | Hook execution                               | `--skip-hooks` ⇒ `skipHookPhases` set                                                                                                                                                                                                                |
| 6   | Progress output                              | shared check bus; `stream: "change-transition"`; no `hook-progress`                                                                                                                                                                                  |
| 7   | Transition hook observability                | progress surfaced before failure                                                                                                                                                                                                                     |
| 8   | Shared hook progress presentation            | distinct public stream names                                                                                                                                                                                                                         |
| 9   | Output on success                            | text confirmation; structured terminal `complete` record                                                                                                                                                                                             |
| 10  | Post-hook failure warning                    | fail-fast, exit 2                                                                                                                                                                                                                                    |
| 11  | Invalid transition error                     | Repair Guide on **stderr**; `! <CODE> — <label>: <msg>`; `HookFailedError` no guide, exit 2; structured failure `complete` record with `result: "failure"`, `blockers`, `nextAction`; `--next` rejection explains why                                |
| 12  | Incomplete tasks error                       | exit 1 naming blocking artifact                                                                                                                                                                                                                      |
| 13  | Check progress rendering                     | gerund labels, no `Executing:` prefix                                                                                                                                                                                                                |
| 14  | Unsatisfied requires error                   | exit 1                                                                                                                                                                                                                                               |

### `cli:change-archive` — 10 requirements

Command signature (incl. **`--allow-overlap`** and **`--allow-out-of-scope` for `impl.linksInScope`**), Prerequisites, Behaviour, Hook execution, Check progress rendering, Post-archive hooks, Output on success, Output on success (extended), JSON output on success, Error cases.

### `cli:change-approve` — 7 requirements

Command signatures, Delegates gate state to kernel, Artifact hash computation, Approve spec behaviour, Approve signoff behaviour, Output on success, Error cases.

**Total requirements audited: 47.**

---

## 2. Implementation

### 2.1 `--next` → `to: 'next'`, no CLI HAPPY_PATH table — COMPLIANT

`packages/cli/src/commands/change/transition.ts:255-256`

```ts
const requestedTarget: ChangeState | 'next' = opts.next === true ? 'next' : (step as ChangeState)
```

- The value is forwarded verbatim at `transition.ts:261-269`.
- Repo-wide search for a CLI-side routing table returns **zero** hits inside `packages/cli`. `HAPPY_PATH_NEXT` lives only in Core:
  - `packages/core/src/domain/value-objects/change-state.ts:49`
  - consumed at `packages/core/src/application/use-cases/transition-change.ts:181`
  - exported via `packages/core/src/public.ts:455`
- Rejection path: `HappyPathNextUnavailableError` (`packages/core/src/domain/errors/happy-path-next-unavailable-error.ts`) is imported by the CLI test suite and surfaces via `handleError`.
- Mutual exclusion and "either `<step>` or `--next`" validation at `transition.ts:112-128`.
- `GetStatus.nextAction` is used **only** for the repair guide (`transition.ts:88-102`), never for target resolution. Compliant with Req 2.

### 2.2 `transition --allow-out-of-scope` forwarding — COMPLIANT

`packages/cli/src/commands/change/transition.ts:266`

```ts
...(opts.allowOutOfScope === true ? { allowOutOfScope: true } : {}),
```

Conditional spread means the key is **absent** (not `undefined`) when the flag is omitted, satisfying "MUST NOT set `allowOutOfScope` on the execute input".

Help text (`transition.ts:204-207`):
`permit the hop when implementation links resolve outside the change scope (impl.linksInScope)` — names `impl.linksInScope` only, matching the spec. It does not claim to bypass `impl.filesResolved`.

### 2.3 `archive --allow-overlap` / `--allow-out-of-scope` — COMPLIANT

`packages/cli/src/commands/change/archive.ts:57-62` registers both flags; `archive.ts:100-101` forwards both with the same conditional-spread pattern. Help text names `impl.linksInScope`.

### 2.4 Docs vs help vs spec — COMPLIANT

- `docs/cli/cli-reference.md:166` — `--next`: "Resolve the next logical lifecycle target from the current state. Mutually exclusive with `<step>`."
- `docs/cli/cli-reference.md:167` — transition `--allow-out-of-scope`: "…outside the change scope (`impl.linksInScope`). **Does not bypass open tracked files.**"
- `docs/cli/cli-reference.md:577` — archive prose: "The flag does not bypass unresolved tracked files (`impl.filesResolved`)."
- `docs/cli/cli-reference.md:590` — archive flag row: "Does not bypass open tracked files."

Docs, `--help`, and spec agree that the flag is scoped to `impl.linksInScope` only.

### 2.5 `change status` — invalidation overlap rendering — COMPLIANT

- Review header block: `packages/cli/src/commands/change/status.ts:249-258` prints `review:` with `required` / `route` / `reason`, plus `message` only when Core supplies a non-empty string. It never prints `affectedArtifacts` paths.
- Overlap peers: `status.ts:330-342` prints an `overlap:` section only when `review.required && reason === 'spec-overlap-conflict' && overlapDetail.length > 0`, one bullet per peer with archived change name and spec ids.
- No `OVERLAP_CONFLICT` synthesis in the CLI: the blockers section (`status.ts:237-247`) renders `blockers` verbatim from Core; there is **zero** occurrence of the literal `OVERLAP_CONFLICT` anywhere in `packages/cli/src`. Suppression for non-archivable states is enforced in Core (`packages/core/src/application/use-cases/get-status.ts:752`, `packages/core/src/domain/services/lifecycle-engine.ts:773-780`).
- Structured output: `status.ts:450-464` always serializes `review` with `overlapDetail` and `affectedArtifacts`.
- `--help` JSON schema lists `overlapDetail` alongside `affectedArtifacts` (`status.ts:121-125`). Satisfies Req 7 in full.

### 2.6 `change approve` — COMPLIANT

`packages/cli/src/commands/change/approve.ts:40-43` and `:78-81` call `kernel.changes.approveSpec` / `kernel.changes.approveSignoff` with exactly `{ name, reason }`. No gate flags, no hashes. Help text uses bound-`from` language ("a change in ready", "a change in done", with pending states noted as drain-only) per Reqs 4 and 5.

### 2.7 Test suite execution

`npx vitest run test/commands/change.spec.ts test/commands/change/` (in `packages/cli`) — **PASS 174 / FAIL 0**.

---

## 3. Discrepancies

### D1 — HIGH — Leftover `packages/cli/test/commands/change.spec.ts` was not deleted despite task 26.5 being marked complete

`specd-sdd/.../tasks.md:776-779` (task 26.5, marked `[x]`):

> `packages/cli/test/commands/change/`, hook skip tests
> Approach: **merge/delete flat `change-*.spec.ts` duplicates**; assert `source.pre`/`target.post` skip are no-ops

`git status` shows the intended moves happened:

```
RM packages/cli/test/commands/change-approve.spec.ts   -> packages/cli/test/commands/change/approve.spec.ts
RM packages/cli/test/commands/change-archive.spec.ts   -> packages/cli/test/commands/change/archive.spec.ts
RM packages/cli/test/commands/change-status.spec.ts    -> packages/cli/test/commands/change/status.spec.ts
RM packages/cli/test/commands/change-transition.spec.ts-> packages/cli/test/commands/change/transition.spec.ts
 D packages/cli/test/commands/change/change-status.spec.ts
 M packages/cli/test/commands/change.spec.ts
```

But `packages/cli/test/commands/change.spec.ts` (38.8K, 58 tests) survives and still contains duplicate suites for commands that now own dedicated files:

| Describe in `change.spec.ts` | Line    | Canonical file that also covers it            |
| ---------------------------- | ------- | --------------------------------------------- |
| `change list`                | 69      | `test/commands/change-list.spec.ts`           |
| `change create`              | 182     | `test/commands/change-create.spec.ts`         |
| **`change status`**          | **375** | **`test/commands/change/status.spec.ts`**     |
| **`change transition`**      | **642** | **`test/commands/change/transition.spec.ts`** |
| `change draft`               | 900     | `test/commands/change-draft.spec.ts`          |
| `change discard`             | 1034    | `test/commands/change-discard.spec.ts`        |
| `drafts restore`             | 1181    | `test/commands/drafts-restore.spec.ts`        |

Violates `_global:spec-layout` / `_global:testing` mirror-src layout intent and re-introduces the duplication the task set out to remove. Task 26.5 should not be `[x]`.

### D2 — HIGH — Deleting `change.spec.ts` would silently drop the only coverage of two `cli:change-status` verify scenarios

The `artifact-drift` review-rendering tests were **modified by this change** but live in the file slated for deletion. `git diff packages/cli/test/commands/change.spec.ts` (+6 / −2):

```
- it('renders review output with absolute file paths in text mode', …)
+ it('given artifact drift, when text status renders, then omits duplicated review file paths', …)
…
-    expect(out).toContain('/project/.specd/changes/add-login/tasks.md')
+    expect(out).toContain('required: yes')
+    expect(out).toContain('reason:   artifact-drift')
+    expect(out).not.toContain('/project/.specd/changes/add-login/tasks.md')
+    expect(out).toContain('artifacts (details):')
+    expect(out).toContain('tasks.md')
```

`packages/cli/test/commands/change/status.spec.ts` has **no** `artifact-drift` test (its only three `review:` fixtures — lines 650, 705, 745 — are all `spec-overlap-conflict`). So scenarios _"Artifact-review-required does not reprint files under review"_ and _"Drift is shown only in artifacts details"_ would become uncovered the moment D1 is fixed. These tests must be **migrated**, not just deleted.

### D3 — MEDIUM — Task 26.5's "`source.pre`/`target.post` skip are no-ops" assertion was never written

Search for `source.pre` / `target.post` / `no-op` in `test/commands/change/transition.spec.ts` and `test/commands/change.spec.ts` returns **0 matches**. The `--skip-hooks` suite (`transition.spec.ts:723-832`) only covers `all`, the empty default, and the comma pair `target.pre,source.post`. Task 26.5 is marked `[x]` for work that does not exist.

### D4 — LOW — Structured failure `complete` record for transition is implemented but untested

`transition.ts:298-311` emits `result: "failure"` with `blockers` and `nextAction`. No test asserts it (`grep -i failure` on `transition.spec.ts`: 0 matches). Corresponds to verify scenario _"Structured failure result is emitted as terminal complete record"_. See M8.

### D5 — LOW (observation) — Structured failure record reports `to: "next"` rather than the resolved state

`transition.ts:307` uses `to: requestedTarget`. When `--next` is used and Core rejects the hop, the machine-readable record carries the literal string `"next"` instead of a concrete `ChangeState`. The spec text for the failure record only says `to`, so this is not a violation, but it is an inconsistency with the success record (`transition.ts:282`, which uses `result.change.state`) and worth an explicit spec sentence or a normalization.

### D6 — LOW (pre-existing, out of change scope) — `change-artifacts.spec.ts` exists in both directories

`packages/cli/test/commands/change-artifacts.spec.ts` (7.5K) and `packages/cli/test/commands/change/change-artifacts.spec.ts` (6.4K). Neither is touched by this change (last touched by `bbeee9f5` / `3eb460a6`), and the nested copy carries a redundant `change-` prefix inside `change/`. Flagged only because it is the same class of layout debt D1 addresses.

**No discrepancies found for the four Recorte-26 focus items themselves** (`--next` forwarding, `--allow-out-of-scope` forwarding/omission, docs vs help vs spec, status overlap/review rendering). All are implemented exactly as specified.

---

## 4. Tests (present and passing)

### `cli:change-transition` — `packages/cli/test/commands/change/transition.spec.ts` (34.8K)

Focus-item tests **exist and pass**:

| Verify scenario                                                                   | Test                                                                                           | Line                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| Allow-out-of-scope is forwarded to execute                                        | `it('Allow-out-of-scope is forwarded to execute')` → `expect(call.allowOutOfScope).toBe(true)` | 90-114                                        |
| Allow-out-of-scope is omitted by default                                          | `it('Allow-out-of-scope is omitted by default')` → `toBeUndefined()`                           | 116-132                                       |
| Transition execute omits approval flags                                           | asserts `allowOutOfScope` undefined + no `approvals*` keys                                     | 134-157                                       |
| Next flag resolves target without positional step                                 | asserts `to: 'next'`                                                                           | 64-88                                         |
| Next flag cannot be combined with explicit step                                   | `/mutually exclusive/`                                                                         | 51-62                                         |
| Missing arguments                                                                 | `/either <step> or --next is required/`                                                        | 40-49                                         |
| Next from ready → implementing, stays out of pending                              | 207-229                                                                                        |
| Next from signed-off → archivable (`to: 'next'`)                                  | 231-249                                                                                        |
| Next fails in pending-spec-approval / pending-signoff / archivable                | 647 / 672 / 697                                                                                |
| CLI does not keep a from→to next table                                            | `to: 'next'` assertions at 84, 224, 246                                                        |
| Pre-transition + repair-guide `GetStatus` skip refresh                            | `toHaveBeenNthCalledWith(1                                                                     | 2, { refreshImplementationTracking: false })` | 605-612 |
| No direct refresh call                                                            | 78, 604                                                                                        |
| Repair Guide on stderr, not stdout                                                | 596-603                                                                                        |
| Approval-required reason in stderr                                                | `/waiting for human signoff/`                                                                  | 642                                           |
| `HookFailedError` ⇒ exit 2, no repair guide                                       | 253-272                                                                                        |
| Hook progress before failure, `✗` mark, no `Executing:`                           | 274-333                                                                                        |
| Structured success `complete` record + no `hook-progress` stream                  | 403-439                                                                                        |
| Liveness for quiet hook (`still running (5s)`)                                    | 472, 497                                                                                       |
| Predicate gerund label without `Executing:`                                       | 502                                                                                            |
| `--skip-hooks all` / default empty / comma pair                                   | 724 / 752 / 770                                                                                |
| Incomplete tasks; skip-hooks does not bypass task checks                          | 835 / 866                                                                                      |
| Repair guide recommends verify                                                    | 911                                                                                            |
| Typed failures: ReadOnly / ArchiveDependencyMismatch / ArchiveImplementationState | 942 / 980 / 1008                                                                               |

### `cli:change-archive` — `packages/cli/test/commands/change/archive.spec.ts` (16.1K)

Argv tests for both new flags **exist and pass**:

| Verify scenario                                            | Test                                                                                                        | Line    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `--allow-overlap` forwarded                                | `it('passes allowOverlap when --allow-overlap is set')`                                                     | 354     |
| `--allow-out-of-scope` forwarded                           | `it('passes allowOutOfScope when --allow-out-of-scope is set')` → `expect(call.allowOutOfScope).toBe(true)` | 377-398 |
| Both omitted by default                                    | `it('omits allowOverlap and allowOutOfScope when those flags are not set')` → both `toBeUndefined()`        | 400-423 |
| `--skip-hooks` all / pre / post / pre,post / default       | 230 / 254 / 277 / 300 / 331                                                                                 |
| Check progress gerund label, no `Executing:`               | 425                                                                                                         |
| Hook progress on same bus (`Running pre hooks (hook.pre)`) | 478                                                                                                         |
| JSON stream: check-progress then terminal `complete`       | 112                                                                                                         |
| `invalidatedChanges` text + JSON                           | 147 / 172                                                                                                   |
| Post-hook failure ⇒ exit 2                                 | 64                                                                                                          |
| Not found / missing name / not archivable                  | 195 / 207 / 215                                                                                             |

### `cli:change-status` — `packages/cli/test/commands/change/status.spec.ts` (29.2K)

| Verify scenario                                                                | Test                                                                                                                                                            | Line    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Overlap peers in text, review header, no file paths, **no `OVERLAP_CONFLICT`** | `expect(out).not.toContain('OVERLAP_CONFLICT')` at 683; `overlap:` / `archived: beta…` / `archived: alpha…` at 685-687; `message:` at 682; path negative at 684 | 639-688 |
| JSON includes `overlapDetail`                                                  | 690                                                                                                                                                             |
| JSON `overlapDetail` empty for non-overlap reasons                             | 734                                                                                                                                                             |
| Drafted read-only (text + JSON `isDrafted`)                                    | 62 / 89                                                                                                                                                         |
| `complete-with-drift` display projection                                       | 440 / 464                                                                                                                                                       |
| `[hasTasks - 3/10 done]`                                                       | 821                                                                                                                                                             |
| `artifactDag.children` = `childrenOf`                                          | 355                                                                                                                                                             |
| Schema mismatch warning                                                        | 592                                                                                                                                                             |
| Not found                                                                      | 625                                                                                                                                                             |
| `--implementation` projection                                                  | 468 / 519                                                                                                                                                       |
| `specs and dependencies:` header                                               | 166                                                                                                                                                             |

### `cli:change-approve` — `packages/cli/test/commands/change/approve.spec.ts` (10.0K)

All 12 verify scenarios have a matching test (call shape `{ name, reason }`, `kernel.changes.*` routing, ready/done success, drain from pending states, missing `--reason`, unknown sub-verb, not found, JSON output). No gaps.

---

## 5. Missing Tests

Ordered by severity. None of these block the four focus items, but M1/M2 are follow-ups to the D1/D2 cleanup.

| #   | Spec                    | Verify scenario                                                               | Sev  | Note                                                                                                                                                                                                                                        |
| --- | ----------------------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `cli:change-status`     | Artifact-review-required does not reprint files under review                  | HIGH | Only in the to-be-deleted `change.spec.ts:514`; must migrate to `change/status.spec.ts`                                                                                                                                                     |
| M2  | `cli:change-status`     | Drift is shown only in artifacts details                                      | HIGH | Same file, same fate                                                                                                                                                                                                                        |
| M3  | `cli:change-transition` | `--skip-hooks target.pre` skips only pre hooks                                | MED  | Only the comma pair is tested; single-phase argv untested (also task 26.5)                                                                                                                                                                  |
| M4  | `cli:change-transition` | `--skip-hooks source.post` skips only post hooks                              | MED  | Same                                                                                                                                                                                                                                        |
| M5  | `cli:change-status`     | `DEPS_INCONSISTENT` blocker shows `Checking spec dependencies`                | MED  | `status.ts:241` implements `! <CODE> — <label>: <msg>`; the only blocker test (`status.spec.ts:244-268`) uses a label-less `MISSING_ARTIFACT`. No test asserts the em-dash label form, and none asserts JSON `blockers[].label` / `checkId` |
| M6  | `cli:change-transition` | Repair guide renders `! <CODE> — <label>`                                     | MED  | `transition.ts:92` implements it; `transition.spec.ts:600` only asserts the label-less branch                                                                                                                                               |
| M7  | `cli:change-transition` | Next flag advances `designing` to `ready`                                     | LOW  | `drafting→designing`, `ready→implementing`, `signed-off→archivable` covered; `designing→ready` not                                                                                                                                          |
| M8  | `cli:change-transition` | Structured failure result is emitted as terminal complete record              | LOW  | See D4                                                                                                                                                                                                                                      |
| M9  | `cli:change-transition` | Requires blocker is surfaced to the user                                      | LOW  | `requires-check` rendering (`transition.ts:157-165`) has no test                                                                                                                                                                            |
| M10 | `cli:change-transition` | Status omitted `verifying` before the failed transition                       | LOW  | Cross-command scenario; not asserted in `status.spec.ts` either                                                                                                                                                                             |
| M11 | `cli:change-status`     | Incomplete tasks do not list `verifying` as available                         | LOW  | `status.spec.ts:201/223` cover the transitions line generically, not this negative case                                                                                                                                                     |
| M12 | `cli:change-status`     | `nextAction` implements-vs-verify follows GetStatus                           | LOW  | No test asserts `/specd-verify` passthrough                                                                                                                                                                                                 |
| M13 | `cli:change-status`     | Text DAG does not repeat convergent nodes                                     | LOW  | No `(see … above)` / single-render assertion                                                                                                                                                                                                |
| M14 | `cli:change-status`     | Text output shows specs and dependencies (`core:a: core:c`, `core:b: (none)`) | LOW  | Header asserted at 166; the dep/`(none)` rows are not                                                                                                                                                                                       |
| M15 | `cli:change-status`     | JSON output includes `specDependsOn`                                          | LOW  | Fixtures set it; no assertion on the serialized field                                                                                                                                                                                       |
| M16 | `cli:change-status`     | Discarded name is not found via change status                                 | LOW  | Generic not-found covered; discarded-specific not                                                                                                                                                                                           |
| M17 | `cli:change-archive`    | Singular alias invocation (`change archive` ≡ `changes archive`)              | LOW  | Alias registered at `packages/cli/src/index.ts:125-126`; no test in `archive.spec.ts` and no `alias` assertion in `list-commands.spec.ts`                                                                                                   |
| M18 | `cli:change-transition` | Text mode preserves completed hook history                                    | LOW  | Implicit in the presenter's append-only writes; no dedicated assertion                                                                                                                                                                      |
| M19 | —                       | `_check-progress-presenter.ts` has no unit spec                               | LOW  | `_hook-progress-presenter.spec.ts` exists; the newer shared presenter is only covered indirectly through `transition.spec.ts` / `archive.spec.ts`                                                                                           |

---

## 6. Counts

### Requirements

| Spec                    | Requirements | Compliant | Partial | Violated |
| ----------------------- | ------------ | --------- | ------- | -------- |
| `cli:change-status`     | 16           | 16        | 0       | 0        |
| `cli:change-transition` | 14           | 14        | 0       | 0        |
| `cli:change-archive`    | 10           | 10        | 0       | 0        |
| `cli:change-approve`    | 7            | 7         | 0       | 0        |
| **Total**               | **47**       | **47**    | **0**   | **0**    |

### Verify scenarios

| Spec                    | Scenarios | Covered        | Missing                        |
| ----------------------- | --------- | -------------- | ------------------------------ |
| `cli:change-status`     | 36        | 26             | 10 (2 of them at-risk: M1, M2) |
| `cli:change-transition` | 45        | 38             | 7                              |
| `cli:change-archive`    | 17        | 16             | 1                              |
| `cli:change-approve`    | 12        | 12             | 0                              |
| **Total**               | **110**   | **92 (83.6%)** | **18**                         |

### Discrepancies

| Severity  | Count | IDs                                         |
| --------- | ----- | ------------------------------------------- |
| HIGH      | 2     | D1, D2                                      |
| MEDIUM    | 1     | D3                                          |
| LOW       | 3     | D4, D5, D6 (D6 pre-existing / out of scope) |
| **Total** | **6** |                                             |

### Missing tests

| Severity  | Count  |
| --------- | ------ |
| HIGH      | 2      |
| MEDIUM    | 4      |
| LOW       | 13     |
| **Total** | **19** |

### Test execution

`packages/cli` → `vitest run test/commands/change.spec.ts test/commands/change/` → **174 passed, 0 failed**.

### Focus-item verdict

| Focus item                                                                        | Verdict               |
| --------------------------------------------------------------------------------- | --------------------- |
| `--next` → `to: 'next'`, no CLI HAPPY_PATH table                                  | PASS                  |
| `transition --allow-out-of-scope` forwards `allowOutOfScope: true`                | PASS                  |
| Flag omitted ⇒ key absent from execute input                                      | PASS                  |
| Docs / `--help` vs spec (`impl.linksInScope` only)                                | PASS                  |
| Tests for new transition verify scenarios (forwarded / omitted)                   | PASS                  |
| `archive --allow-overlap` / `--allow-out-of-scope` argv tests                     | PASS                  |
| Leftover `change.spec.ts` vs `change/{status,transition,archive,approve}.spec.ts` | **FAIL** (D1, D2, D3) |
| Status: review header/message/overlap peers; no `OVERLAP_CONFLICT` in `designing` | PASS                  |

### Partial: rest

# Spec-Compliance Audit — `workflow-transition-checks` (partial: "rest" slice)

- **Change:** `20260825-162927-workflow-transition-checks`
- **Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`
- **Report slice:** `_partial-rest`
- **Date:** 2026-08-28
- **Mode:** read-only audit (no code or spec files modified)

## Scope

Specs audited via `change spec-preview <change> <specId> --format text` (merged spec + verify,
deltas applied):

| Spec                            | Preview lines | Delta ops in this change                                                                                     |
| :------------------------------ | :------------ | :----------------------------------------------------------------------------------------------------------- |
| `core:config`                   | 1646          | 2 (`approvals.spec` in-place; depend on transition-checks)                                                   |
| `core:validate-artifacts`       | 1013          | 3 (DAG evaluate w/ empty `checksByTarget`; `ListWorkspaces` ports; depend on transition-checks)              |
| `core:get-artifact-instruction` | 256           | 5 (nextArtifact from DAG; purpose; deps; constraints; `templateExpander`)                                    |
| `core:schema-format`            | 1396          | 4 (workflow is lookup config; requires feeds engine DAG)                                                     |
| `core:storage`                  | 577           | 2 (DAG cascade owned by `LifecycleEngine`; depend on lifecycle-engine)                                       |
| `skills:skill-templates-source` | 557           | 5 (in-place gates; impl-tracking drain; archive pre-hooks; design review scope; depend on transition-checks) |

Globals consulted: `default:_global/conventions`, `default:_global/eslint` (both via `specs show`).
`default:_global/architecture` and `default:_global/testing` were referenced only indirectly through
the layer/lint rules already encoded in `eslint.config.js`; a full read of those two was **not**
performed in this slice.

Focus areas requested and covered:

1. Composition wiring — `ValidateArtifacts` / `ListWorkspaces`, `GetArtifactInstruction`.
2. `pending-parent-artifact-review` coercion in storage / change.
3. Skill templates vs pending hops, `--next`, overlap review.

Primary evidence sources: `specd graph search` for symbol resolution, direct file reads for
verification, `eslint --print-config` / `eslint` runs for lint-rule reality checks.

---

## Counts

| Severity                                    |  Count |
| :------------------------------------------ | -----: |
| High                                        |      3 |
| Medium                                      |      6 |
| Low                                         |      6 |
| Observations (no spec requirement violated) |      3 |
| **Total findings**                          | **18** |

| Verification outcome                           | Count |
| :--------------------------------------------- | ----: |
| Requirements spot-checked against code         |    34 |
| Confirmed compliant (see "Verified compliant") |    16 |
| Divergent / unimplemented                      |     9 |
| Spec-internal or cross-spec contradictions     |     4 |
| Test-coverage gaps                             |     2 |

---

## High severity

### H1 — `core:validate-artifacts` uses the permissive metadata schema where the spec mandates the strict one

**Requirement:** MetadataExtraction validation, step 3 — _"Validate the result against
`strictSpecMetadataSchema`."_

**Code:**

```583:593:packages/core/src/application/use-cases/validate-artifacts.ts
              const { permissiveSpecMetadataSchema } =
                await import('../../domain/services/parse-metadata.js')
              const validationResult = permissiveSpecMetadataSchema.safeParse(extracted.metadata)
              if (!validationResult.success) {
                failures.push({
                  artifactId: artifactType.id,
                  description: `MetadataExtraction validation failed: ${validationResult.error.message}`,
                  filename: validationFilename,
                })
                artifactFailed = true
              }
```

Both schemas exist and are exported (`packages/core/src/domain/services/parse-metadata.ts:93` and
`:165`). `strictSpecMetadataSchema` is the one used by `persist-spec-metadata.ts:33` and
`fs-spec-index-cache.ts:223`. `ValidateArtifacts` is the only consumer that reaches for the
permissive variant, so extracted metadata that would be rejected at persistence time can still pass
the validation gate and reach `markComplete`. This directly weakens the verify scenario _"Invalid
extracted metadata prevents completion"_.

**Impact:** an artifact can be marked `complete` with metadata that later fails strict validation
during persistence or index materialization.

---

### H2 — `core:validate-artifacts` "Policy-aware drift materialization" is not implemented in `ValidateArtifacts`

**Requirement:** _"When ValidateArtifacts compares the current file state to the validated baseline,
it SHALL treat any mismatch as drift evidence for that file. This includes changed content and file
absence."_ plus the verify scenarios _"Missing file can still carry hasDrift without rendering
complete-with-drift"_ and _"Policy none preserves complete while still marking drift"_.

**Code:** the only drift path inside `ValidateArtifacts` is gated on an active approval or signoff,
and it explicitly skips absent files:

```304:317:packages/core/src/application/use-cases/validate-artifacts.ts
    if (approval !== undefined || signoff !== undefined) {
      for (const artifactType of schema.artifacts()) {
        const changeArtifact = change.getArtifact(artifactType.id)
        if (
          changeArtifact === null ||
          changeArtifact.status === 'missing' ||
          changeArtifact.status === 'skipped'
        ) {
          continue
        }
        for (const [fileKey, file] of changeArtifact.files) {
          if (file.status === 'missing' || file.status === 'skipped') continue
          const artifactContent = await this._changes.artifact(change, file.filename)
          if (artifactContent === null) continue
```

Consequences:

- **File absence is never drift evidence.** A file that vanishes is filtered out twice (by
  `file.status === 'missing'` and by `artifactContent === null`), so it can never contribute to the
  grouped invalidation payload.
- **No approval, no drift.** With `approvals.spec` and `approvals.signoff` both off (the config
  default per `core:config` Requirement: Approvals), the whole block is skipped. Combined with the
  "Complete and skipped file bypass" requirement — which the code honours at lines 374–391 by
  `continue`-ing before ever reading the file — a persisted-`complete` file with changed content is
  never re-hashed by `ValidateArtifacts`.
- **The policy-`none` scenario is unsatisfiable through this use case:** `hasDrift` is never set by
  `ValidateArtifacts` at all; it is only read back from the manifest.

The behaviour the spec describes does exist, but it lives in the **fs adapter**, not the use case:

```1523:1569:packages/core/src/infrastructure/fs/change-repository.ts
      // Auto-invalidate if any previously validated file drifted from its stored hash.
      const driftedFilesByArtifact = new Map<string, Set<string>>()
      ...
          let drifted = false
          if (file.status === 'complete') {
            const derivedStatus = await this._deriveFileStatus(...)
            drifted = derivedStatus !== 'complete'
          } else {
            drifted = true
          }
      ...
        change.invalidate(
          'artifact-drift',
          SYSTEM_ACTOR,
```

`core:storage` does acknowledge repository-side drift invalidation (Requirement: Artifact status
derivation — _"drift invalidations must only be performed when the repository is fully initialized
with resolved artifact types"_), so this is not an undocumented architecture break. But it means
`core:validate-artifacts` Requirement "Policy-aware drift materialization" describes ownership that
the implementation does not have, and it uses a different actor (`SYSTEM_ACTOR` vs the resolved
`ActorResolver` identity that `ValidateArtifacts` passes at line 735).

**Impact:** the requirement as written is unimplementable by the named component; three verify
scenarios cannot pass against `ValidateArtifacts` in isolation. Either the requirement moves to
`core:storage`, or `ValidateArtifacts` gains a baseline (not approval-scoped) drift comparison.

---

### H3 — `default:_global/eslint` JSDoc enforcement is blanket-disabled on the change's central domain service

**Requirement:** _"All functions, methods, classes, type aliases, and interfaces in source files must
have a JSDoc comment. This includes internal helpers."_ The only exemption in Constraints is
_"Test files (`test/\*\*/_.spec.ts`) are exempt from JSDoc requirements."_ The verify scenario is
explicit: _"WHEN a class method (public or private) has no JSDoc block comment THEN [lint error]"\*.

**Code:** `lifecycle-engine.ts` — the service this whole change is organised around — opts out
file-wide, with no justification comment:

```1:1:packages/core/src/domain/services/lifecycle-engine.ts
/* eslint-disable jsdoc/require-jsdoc */
```

Undocumented members behind that disable include the **public** `findBlockingParent`, which is part
of the contract this change relies on (`ValidateArtifacts` line 349, `TransitionChange` line 394):

```317:323:packages/core/src/domain/services/lifecycle-engine.ts
  findBlockingParent(
    change: ArtifactGraphSource,
    schema: Schema,
    artifactId: string,
  ): { artifactId: string; status: ArtifactStatus } | null {
    return this._findBlockingParent(change, schema, artifactId, new Set())
  }
```

plus `_resolveTarget`, `_isStepPermitted`, `_effectiveStatus`, and `_findBlockingParent`.

I verified the rule is genuinely active for this path (`eslint --print-config` resolves
`jsdoc/require-jsdoc` to `[2, { contexts: [..., "MethodDefinition", ...] }]`), and that
`npx eslint packages/core/src/domain/services/lifecycle-engine.ts` exits clean **only** because of
the file-level disable.

Same pattern, also unjustified, in two other source files:

- `packages/core/src/composition/use-cases/archive-change.ts:1`
- `packages/cli/src/commands/change/spec-preview.ts:1`

For contrast, `packages/core/src/domain/read-only-change-view.ts:56` does the same thing _with_ an
inline rationale (`-- getters mirror {@link Change}; public contract is on view interfaces`), which
is the pattern the other three should follow if the exemption is intentional.

**Impact:** the documented lint contract silently does not hold for the most-read file in this
change. A reviewer running lint gets a false green.

---

## Medium severity

### M1 — `resolveValidateArtifactsDeps` field is `contentHasher`; spec and verify both say `hasher`

**Requirement:** `core:validate-artifacts` Requirement "Config-based factory delegates through
resolveValidateArtifactsDeps" lists `hasher: ContentHasher`. The constructor block in the same
requirement also names the parameter `hasher`. The verify scenario
_"createValidateArtifacts config form derives ValidateArtifactsDeps through
resolveValidateArtifactsDeps"_ repeats `hasher: ContentHasher`.

**Code:** the deps interface and resolver use `contentHasher`:

```22:32:packages/core/src/composition/use-cases/validate-artifacts.ts
export interface ValidateArtifactsDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
  readonly actor: ActorResolver
  readonly contentHasher: ContentHasher
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly lifecycle: LifecycleEngine
}
```

The `isValidateArtifactsDeps` type guard also checks `'contentHasher' in value` (line 150), so an
object built from the spec literally would be routed to the config branch and crash. The class
constructor parameter _is_ `hasher` (line 144), so the divergence is purely at the composition
boundary — which is exactly the boundary the requirement governs.

Worth noting: **this change explicitly fixed the sibling naming issue** for
`GetArtifactInstruction` (delta op description: `'Factory field is templateExpander'`), but left the
parallel `hasher` / `contentHasher` mismatch in `core:validate-artifacts` untouched.

---

### M2 — `core:get-artifact-instruction` verify.md still says `templates:` after spec.md was changed to `templateExpander:`

The change's spec delta deliberately renames the field:

```
specd-sdd/.../deltas/core/get-artifact-instruction/spec.md.delta.yaml:52
  description: 'Factory field is templateExpander'
specd-sdd/.../deltas/core/get-artifact-instruction/spec.md.delta.yaml:65
  - `templateExpander: TemplateExpander`
```

There is **no corresponding op in `verify.md.delta.yaml`**, so the merged verification file still
asserts the old name:

```244:244:/tmp/preview_core_get-artifact-instruction.md
- `templates: TemplateExpander`
```

The code matches spec.md (`templateExpander`, `composition/use-cases/get-artifact-instruction.ts:29`
and `:135`), so verify.md is the stale artifact. This is an internal inconsistency introduced by
this change, and it is the kind of thing `crossArtifactValidations` between `specs` and `verify`
would not catch because both sides are prose inside a scenario bullet list.

---

### M3 — `core:get-artifact-instruction` says rules entries carry `text`; `core:schema-format` and the code say `instruction`

**Requirement (get-artifact-instruction):** _"**`rulesPre`** — if the artifact declares `rules.pre`,
collect all entries' `text` in declaration order."_ The verify scenario repeats it:
`rules.pre: [{ id: "r1", text: "Pre rule" }]`.

**Requirement (schema-format), which owns the shape:**

- _"`pre` (array, optional) — entries injected **before** the instruction. Each entry:
  `{ id: string, instruction: string }`."_
- Constraint: _"`artifact.rules.pre` and `artifact.rules.post` are optional arrays of
  `{ id, instruction }` entries."_

**Code** follows `core:schema-format`:

```129:131:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const rulesPre = (artifactType.rules?.pre ?? []).map((r) =>
      this._templates.expand(r.instruction, contextVars),
    )
```

So the code is right and `core:get-artifact-instruction` (spec **and** verify) is wrong in two
places. Since `core:schema-format` is a declared dependency of `core:get-artifact-instruction`, this
is a dependency-direction contradiction, not merely a typo.

---

### M4 — `ValidateArtifacts` drift scan is not scoped to the current invocation

**Requirement:** Complete and skipped file bypass — _"Approval/signoff drift detection MUST still run
for files that are actually validated in the invocation; bypassing `complete`/`skipped` files reduces
unnecessary drift comparisons and **avoids spurious `artifact-drift` invalidation during batch
validation**."_

**Code:** the drift loop iterates `schema.artifacts()` — the full set — rather than
`artifactTypesToValidate`, and it runs before and independently of the per-artifact loop:

```305:305:packages/core/src/application/use-cases/validate-artifacts.ts
      for (const artifactType of schema.artifacts()) {
```

`artifactTypesToValidate` (line 240) is the invocation-scoped list and is correctly narrowed when
`input.artifactId` is provided, but the drift scan ignores it. So
`validate <change> --artifact verify` can invalidate the change because `proposal` drifted — the
precise "spurious invalidation during batch validation" the requirement is trying to prevent.

The scan also re-reads and re-hashes every non-missing file on every invocation, including
`complete` ones that the bypass requirement is meant to skip.

---

### M5 — "Recompute lifecycle interpretation after each persisted completion" is an in-memory verdict patch, and completions are not persisted mid-pass

**Requirement:** Dependency order check — _"When `ValidateArtifacts` validates more than one artifact
or file in a single `execute` invocation ... it MUST recompute lifecycle/effective-status
interpretation after each persisted completion so dependents processed later in the same invocation
observe parents completed in that pass. It MUST NOT rely on a lifecycle snapshot frozen only at
`execute` start."_

**Code:** the lifecycle is evaluated exactly once (line 224), and completions patch a local map:

```230:238:packages/core/src/application/use-cases/validate-artifacts.ts
    const markVerdictComplete = (artifactId: string): void => {
      const verdict = artifactVerdicts.get(artifactId)
      if (verdict === undefined) return
      artifactVerdicts.set(artifactId, {
        ...verdict,
        state: 'complete',
        effectiveStatus: 'complete',
      })
    }
```

Nothing is persisted until the single terminal `mutate()` at line 727, and
`this._lifecycle.evaluate` is never called a second time.

The direct-`requires` case works (the verify scenario _"Lifecycle snapshot refreshes after
markComplete in same execute"_ would pass), but the **cascade** does not: when `proposal` completes
mid-pass, artifacts that were downgraded to `pending-parent-artifact-review` _because of_ `proposal`
keep that stale effective status, because `_effectiveStatus`'s recursive review propagation
(`lifecycle-engine.ts:366-394`) is not re-run. A three-level DAG (`proposal → specs → verify`)
validated in one pass can therefore still report `verify` as dependency-blocked after `proposal` and
`specs` both succeeded in that same pass.

The wording _"after each **persisted** completion"_ is also literally unmet: nothing is persisted
until the end.

---

### M6 — `core:config` forbids entering `pending-spec-approval` via `change transition`; the guard only fires when the gate is off

**Requirement (`core:config`, Requirement: Approvals):** _"New work MUST NOT enter
`pending-spec-approval` via `change transition`."_ and _"New work MUST NOT enter `pending-signoff`
via `change transition`."_ — both stated unconditionally.

**Code:**

```343:363:packages/core/src/application/use-cases/transition-change.ts
    if (
      (requestedTarget === 'pending-spec-approval' || requestedTarget === 'spec-approved') &&
      !this._approvals.spec &&
      !isSpecDrain
    ) {
      throw new InvalidStateTransitionError(fromState, requestedTarget, {
        type: 'gate-not-required',
        gate: 'spec',
      })
    }
```

The guard is `!this._approvals.spec`. With `approvals.spec: true` — the only configuration where the
gate matters — `specd changes transition <name> pending-spec-approval` from `ready` is still
accepted. `LifecycleEngine._isStepPermitted` agrees (`lifecycle-engine.ts:334-339`: permitted when
`approvals.spec && isValidTransition`). The CLI also still advertises both states as valid positional
steps (`cli:change-transition` delta line 161).

The new `core:transition-checks` spec is narrower — it only says _"`TransitionChange` MUST NOT
**rewrite** `implementing` to `pending-spec-approval`"_ (line 211), which the code does satisfy. So
this is at minimum a spec-vs-spec disagreement about how hard the prohibition is, and at worst a
missing guard. Given `skills:skill-templates-source` invests heavily in teaching agents that pending
states are drain-only, leaving the transition itself reachable is a real hole in the story.

---

## Low severity

### L1 — No composition tests for either resolver named in this change

`core:validate-artifacts` and `core:get-artifact-instruction` each add a verify scenario asserting
the config-based factory derives deps through the named resolver and delegates to the canonical
factory. `packages/core/test/composition/use-cases/` holds 33 `.spec.ts` files, but neither
`validate-artifacts.spec.ts` nor `get-artifact-instruction.spec.ts` is among them. A repo-wide search
confirms `resolveValidateArtifactsDeps` and `resolveGetArtifactInstructionDeps` are referenced only
by `kernel.ts` and their own modules — no test asserts the resolved shape.

This also means the M1 `hasher` / `contentHasher` mismatch has nothing guarding it, and the verify
scenario _"Constructor receives ListWorkspaces / does not take a `ReadonlyMap` of `SpecRepository`"_
is unasserted (`listWorkspaces` does not appear anywhere in
`packages/core/test/application/use-cases/validate-artifacts.spec.ts`).

### L2 — Calling `ValidateArtifacts.execute` with neither `artifactId` nor `specPath` throws

```249:254:packages/core/src/application/use-cases/validate-artifacts.ts
    if (
      input.specPath === undefined &&
      artifactTypesToValidate.some((artifactType) => artifactType.scope === 'spec')
    ) {
      throw new SpecNotInChangeError('<specPath required>', input.name)
    }
```

Several verify scenarios are phrased as _"`ValidateArtifacts.execute` is called without
`artifactId`"_ with no mention of `specPath` (e.g. _"Skipped optional artifact does not cause
failure"_, _"Missing optional artifact does not cause failure"_). Against any schema containing a
spec-scoped artifact, those calls throw before reaching the behaviour under test. Either the
scenarios need `specPath` spelled out, or Requirement: Input needs to state the
`artifactId`-and-`specPath`-both-absent rule, which it currently does not.

Secondary nit: `SpecNotInChangeError('<specPath required>', ...)` fabricates a spec path to express
a missing-argument condition. `default:_global/conventions` Requirement: Error types requires a
machine-readable `code` and Actionable Messaging; a placeholder in the identifier slot works against
both.

### L3 — `resolveArtifactValidationFilename` keeps a legacy direct path that the spec says must not be accepted

```845:857:packages/core/src/application/use-cases/validate-artifacts.ts
function resolveArtifactValidationFilename(
  trackedFile: TrackedValidationFile | undefined,
  expectedFilename: string,
): string {
  if (trackedFile === undefined) return expectedFilename
  if (
    trackedFile.validatedHash === undefined &&
    isDeltaTrackedFilename(trackedFile.filename) !== isDeltaTrackedFilename(expectedFilename)
  ) {
    return expectedFilename
  }
  return trackedFile.filename
}
```

Once `validatedHash` is set, the tracked filename wins even if its representation class disagrees
with the expected one. Requirement: Expected file path validation says _"`ValidateArtifacts` MUST
validate that delta file and MUST NOT accept a direct artifact file at
`specs/<workspace>/<capability-path>/<artifact-filename>` as a fallback"_, and Result shape says
_"`ValidationFileResult.filename` MUST be the expected path used by validation. It MUST NOT report an
alternate file path."_ The escape hatch is deliberate (the doc comment says so) and probably correct
for migration, but it is undocumented in the spec.

### L4 — Dynamic `import()` inside the per-artifact loop

```583:585:packages/core/src/application/use-cases/validate-artifacts.ts
              const { permissiveSpecMetadataSchema } =
                await import('../../domain/services/parse-metadata.js')
```

Every other consumer of that module imports statically (`persist-spec-metadata.ts:4`,
`fs-spec-index-cache.ts:4`). Inside a loop over artifacts this is a per-iteration module-cache
lookup for no benefit, and it hides the dependency from the graph. No spec forbids it outright, so
this is a consistency issue rather than a violation — but it is the same line as H1, so both should
be fixed together.

### L5 — `core:schema-format` and `core:get-artifact-instruction` disagree on template interpolation

`core:schema-format` Requirement: Template resolution: _"Template content is plain text — no
interpolation or placeholder substitution is performed."_

`core:get-artifact-instruction` Requirement: Instruction resolution: _"Template variable expansion
(via `TemplateExpander`) MUST be applied to the template content using the same contextual variables
as `instruction`."_

The code implements the latter (`get-artifact-instruction.ts:140-143`). Both statements can be read
as compatible if you scope schema-format's sentence to _load time_ and get-artifact-instruction's to
_serve time_, but nothing in either spec says so.

Note: I initially suspected the code returned the template _path_ rather than its content. It does
not — `ArtifactType` resolves `template` to file content at load and keeps the path separately in
`templateRef` (`packages/core/src/domain/value-objects/artifact-type.ts:42-45`). No finding there.

### L6 — Duplicate `findBlockingParent` call in the dependency-blocked path

```347:351:packages/core/src/application/use-cases/validate-artifacts.ts
        const blockedByParent =
          blockedDep.status === 'pending-parent-artifact-review'
            ? (this._lifecycle.findBlockingParent(change, schema, artifactType.id) ??
              this._lifecycle.findBlockingParent(change, schema, blockedDep.reqId))
            : null
```

The first call already recurses through `blockedDep.reqId` (`_findBlockingParent` walks `requires`
transitively, `lifecycle-engine.ts:411-419`), so the `??` fallback is unreachable in practice. Each
call re-runs `_effectiveStatus` over the whole DAG with a fresh `visiting` set, so the fallback is a
latent O(n²) path for no behavioural gain. Behaviour is correct — the verify scenario _"Review-
propagation blocker includes recursive parent context"_ passes — so this is cleanup only.

---

## Observations (no spec requirement violated)

### O1 — `--next` exists in the CLI but no skill template teaches it

`specd changes transition <name> --next` is implemented
(`packages/cli/src/commands/change/transition.ts:203`, validated at `:112-128`, spec'd in the
`cli:change-transition` delta lines 126-162: _"the CLI MUST call `TransitionChange.execute` with
`to: 'next'` ... MUST NOT maintain a from→to routing table"_).

A search across `packages/skills/templates/**` returns **zero** occurrences of `--next`. Every
template still writes explicit targets (`transition <name> ready --skip-hooks all`, etc.).

No requirement in `skills:skill-templates-source` mandates teaching `--next`, so this is not a
violation. It is a discoverability gap: the change adds a Core-resolved happy-path hop specifically
to stop agents from hard-coding routing tables, and the agent-facing surface never mentions it.
Worth a follow-up decision — either add it to `shared.md.tpl` or record that it is deliberately
CLI-only.

### O2 — `changes check-overlap` is never referenced by any template

Templates handle overlap reactively: `shared.md.tpl:594-604` tells the agent to stop when
`changes create` / `changes edit` emits a `spec overlap detected` warning, and
`specd-archive/SKILL.md.tpl:147-157` handles `SpecOverlapError` with `--allow-overlap`. The
dedicated `changes check-overlap [name]` command is never suggested as a proactive check.

Again, no requirement demands it. Flagging because the audit brief called out "overlap review" and
the reactive-only posture means an agent only learns about overlap at create/edit/archive time.

### O3 — Drift invalidation is split across two actors

`FsChangeRepository.get()` invalidates with `SYSTEM_ACTOR`
(`change-repository.ts:1566`); `ValidateArtifacts` invalidates with the resolved `ActorResolver`
identity (`validate-artifacts.ts:735`). Both write the same `artifact-drift` cause into history.
Consumers reading change history will see two different attributions for what is conceptually the
same event. Neither `core:storage` nor `core:validate-artifacts` says which actor is canonical.

---

## Verified compliant

These were checked against code and found to match the merged specs. Listed so the next reviewer
does not re-walk them.

**Composition wiring**

1. `ValidateArtifacts` constructor takes `ListWorkspaces`, not a `ReadonlyMap<string, SpecRepository>`
   (`validate-artifacts.ts:138-148`); workspace lookup goes through `execute()` at line 263.
   Satisfies Requirement: Ports and constructor and the verify scenario
   _"Constructor receives ListWorkspaces"_. (Untested — see L1.)
2. `resolveValidateArtifactsDeps` resolves all nine dependencies from the shared
   `CompositionResolver`, and the config branch delegates to the canonical `createValidateArtifacts(deps)`
   rather than reconstructing fs wiring inline (`composition/use-cases/validate-artifacts.ts:40-57`,
   `:131-132`). Only the `hasher` field name diverges (M1).
3. `resolveGetArtifactInstructionDeps` resolves all six dependencies and delegates identically
   (`composition/use-cases/get-artifact-instruction.ts:40-53`, `:117-118`).
4. Both use cases call `LifecycleEngine.evaluate(change, schema, { checksByTarget: {} })`
   (`validate-artifacts.ts:224-226`, `get-artifact-instruction.ts:103-105`). Neither references
   `availableTransitions` or `executeChecksByLegalTargets` — grep returns zero hits in both files.
5. `gatherPredicateSnapshots` does not exist anywhere in `packages/`; the only occurrence is the
   negative assertion `expect('gatherPredicateSnapshots' in mod).toBe(false)` in
   `transition-checks.spec.ts:387`. Satisfies the "no snapshot bag" constraint in both specs.
6. `GetArtifactInstruction` builds `TemplateVariables` from `change.name` and `change.path` only —
   no `change.workspace`, no `change.workspaces[0] ?? 'default'` (`get-artifact-instruction.ts:124-126`).
   Satisfies the verify scenario _"Contextual variables built for expansion have no workspace key"_.
7. `delta.availableOutlines` is a plain `string[]` of spec IDs with no inline outline trees
   (`get-artifact-instruction.ts:162-180`); missing files are silently skipped via `continue`.
8. Auto-resolution uses `lifecycle.nextArtifact` and throws `ArtifactNotFoundError('(auto)', ...)`
   when it is `null` (`get-artifact-instruction.ts:106-109`).

**`pending-parent-artifact-review` coercion**

9. Load coerces the token to `in-progress` at file level
   (`change-repository.ts:1422-1424`) and at artifact level via `persistableArtifactStatus(raw.state ?? 'missing')`
   (`:1442`).
10. Save applies the same coercion to both file `state` (`:1718`) and artifact `state` (`:1727`).
11. `ArtifactFile` rejects the token in memory (`value-objects/artifact-file.ts:52-54`:
    _"pending-parent-artifact-review is engine-derived and cannot be persisted on a file"_).
12. The wire schema still accepts the legacy token so old manifests load
    (`infrastructure/fs/manifest.ts:311`) — which is what makes the "legacy sane" rewrite meaningful.
13. Covered by test: `change-repository.spec.ts:664` —
    _"given wire pending-parent-artifact-review, when get then save, then status ..."_, seeding both
    `artifacts[0].state` and `artifacts[0].files[0].state`.

Together these satisfy `core:storage` Requirement: Artifact dependency cascade in full.

**Skill templates**

14. **Pending hops.** `pending-spec-approval` / `pending-signoff` appear in exactly two templates,
    both correctly framed. `shared.md.tpl:386` — _"MAY appear only as **drain** for in-flight
    changes already in those states — not as the happy-path wait"_; `shared.md.tpl:504` — _"Do
    **not** list `pending-spec-approval` / `pending-signoff` as happy-path intermediates"_;
    `specd-new/SKILL.md.tpl:150,152` — both rows marked `Drain only:` with the matching `approve`
    command. `specd-design`, `specd-verify`, `specd-implement`, `specd-archive` and the `specd`
    router contain **zero** occurrences.
15. **Router purity.** `skills/specd/SKILL.md.tpl` matches neither `signoff` nor `approve` — zero
    hits. Satisfies the verify scenario _"specd entry skill does not teach signoff"_.
16. **Remaining template requirements**, each confirmed by direct grep:
    - `shared.md.tpl:376-389` — _"You MUST NEVER run `changes approve` yourself"_, stay-in-`ready`/`done` framing.
    - `specd-archive/SKILL.md.tpl:139,144,157,163` — `--skip-hooks pre`, never `all`, with the
      rationale _"Pre `run:` / `instruction:` already ran in step 4"_.
    - `specd-verify/SKILL.md.tpl:25-27, 62-64, 312-314` — drains `IMPLEMENTATION_STATE` in-skill,
      points at `shared.md`, explicitly _"Do **not** redirect to `/specd-implement` solely for open files"_.
    - `specd-implement/SKILL.md.tpl:272-274, 316` — requires _"zero open"_ tracked files before
      recommending `/specd-verify`; prefers top-level `--symbol` links (`:153, :169-172`).
    - `specd-design/SKILL.md.tpl:48-50` — review scope from `artifacts (details):` and
      `review.affectedArtifacts`, not a `review:` file list.

    Contract tests back all of these: `packages/skills/test/template-workflow.spec.ts:74, 83-84, 93,
99, 105, 123, 141, 149-151`.

**Other**

- `_dependencyBlockedDescription` (`validate-artifacts.ts:789-816`) distinguishes all four blocker
  classes as the spec requires: `pending-parent-artifact-review` with parent context,
  `pending-review` / `drifted-pending-review` as _"requiring review"_, and `missing` / `in-progress`
  as _"incomplete dependency"_ with the status always included. No generic-wording degradation.
- Artifact traversal uses `schema.artifactDag().topologicalOrder()` when no `artifactId` filter is
  present (`validate-artifacts.ts:243-247`).
- Delta eligibility is decided at artifact-file level: a missing base `verify.md` fails even when
  `spec.md` exists (`validate-artifacts.ts:479-487`). Satisfies Requirement: Delta eligibility uses
  artifact-level base existence.
- No-op delta bypass short-circuits `deltaValidations`, application preview, and structural
  validation, hashing the raw delta content (`validate-artifacts.ts:447-460`).
- Persistence goes through `ChangeRepository.mutate(name, fn)` operating on the fresh instance
  (`validate-artifacts.ts:727-752`). Satisfies Requirement: Save after validation.
- `npx eslint` is clean on `lifecycle-engine.ts`, `validate-artifacts.ts`, and
  `composition/use-cases/get-artifact-instruction.ts` — though see H3 for why that green is partly
  illusory. Layer-boundary `no-restricted-imports` rules are present in `eslint.config.js`
  (lines 125, 143, 163) as `default:_global/eslint` Requirement: Layer boundary enforcement requires.

---

## Suggested triage order

1. **H1** — one-line schema swap; smallest fix with the clearest correctness win.
2. **M1 / M2 / M3** — spec-vs-code naming and cross-spec contradictions. All three are documentation
   edits except M1, which needs a decision on which name is canonical.
3. **H2 / M4 / M5** — the drift and lifecycle-recompute cluster in `ValidateArtifacts`. These
   interact; fixing them piecemeal risks double-invalidation. Decide first whether drift ownership
   stays in `FsChangeRepository` (then move the requirement to `core:storage`) or moves into the use
   case (then implement baseline comparison and absence handling).
4. **H3** — either remove the blanket disables and write the JSDoc, or add rationale comments in the
   `read-only-change-view.ts` style and record the exemption in `default:_global/eslint`.
5. **M6** — needs a product decision before code: is `transition <name> pending-spec-approval` with
   the gate on legal or not? `core:config` and `core:transition-checks` currently disagree.
6. **L1** — add the two composition specs; they would have caught M1.
7. Remaining L2–L6 and O1–O3 as cleanup.

---

## Method notes and limits

- All spec text quoted is the **merged** preview (base + this change's deltas), produced with
  `node packages/cli/dist/index.js change spec-preview workflow-transition-checks <specId> --format text`.
- Symbol locations resolved with `specd graph search --symbols`; the graph was current for every
  lookup performed.
- Lint claims were verified by running `eslint` and `eslint --print-config` against the actual
  files, not inferred from `eslint.config.js` alone. The `--print-config` output required parsing
  through `node` because the shell wrapper truncates large JSON payloads.
- **Not covered in this slice:** full reads of `default:_global/architecture` and
  `default:_global/testing`; the `cli:*` deltas (`change-approve`, `change-archive`, `change-status`,
  `change-transition`) beyond the `--next` cross-reference; `core:lifecycle-engine`,
  `core:transition-change`, `core:get-status`, `core:change`, `core:workflow-model`,
  `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:archive-change`;
  and the new spec `core:transition-checks` itself, which was read only where it bears on M6.
- No test suite was executed. Test-coverage findings (L1) are based on file inventory and symbol
  search, not on a coverage run.
