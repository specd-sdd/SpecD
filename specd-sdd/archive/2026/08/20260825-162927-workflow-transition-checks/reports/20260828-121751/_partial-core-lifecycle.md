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
