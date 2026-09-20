# Proposal: workflow-transition-checks

## Motivation

Status, repair guides, and `change transition` disagree about whether a move is allowed: the engine can advertise `verifying` and keep recommending `/specd-implement` while execute fails on tasks, and spec dependency mismatches only appear at archive after the whole workflow. We need one evaluation of “can this change go from A to B?” before later UX (dry-run, more checks) is built on a second model.

## Current behaviour

`LifecycleEngine.evaluate` knows `VALID_TRANSITIONS`, artifact `requires`, approval routing, review blockers, and `_nextAction`. It does not apply `requiresTaskCompletion` when computing `availableTransitions`. `_nextAction` in `implementing` always recommends `/specd-implement`. `GetStatus` runs `CountTasks` after evaluate and only paints `taskCompletion` on artifacts. `TransitionChange` evaluates, then repeats requires/task enforcement and throws `InvalidStateTransitionError`.

`ArchiveChange` already has a stack of product guards that never appear in transition evaluation. Today they only run at archive (too late for anything knowable in design):

| Today (archive)                        | Error                                                      | Knowable at enter-`ready`?                 |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Schema name vs `change.schemaName`     | `SchemaMismatchError`                                      | Yes (config vs change)                     |
| `assertArchivable`                     | `InvalidStateTransitionError`                              | No — protocol of the **archive** operation |
| Spec overlap with other active changes | `SpecOverlapError` (`--allow-overlap`)                     | Partial (can appear later)                 |
| Spec in `readOnly` workspace           | `ReadOnlyWorkspaceError`                                   | **Yes — same tax as deps**                 |
| Extract vs persisted `dependsOn`       | `ArchiveDependencyMismatchError`                           | **Yes**                                    |
| Tracked impl files still `open`        | `ArchiveImplementationStateError`                          | No — after implementing                    |
| Out-of-scope impl sidecar              | `ArchiveImplementationStateError` (`--allow-out-of-scope`) | No — archive plan                          |
| Other publication preflight            | `ArchivePreflightError` / `ArchiveArtifactMissingError`    | No — merge/publish                         |

The first proposal only lifted `deps.consistent` to `ready` and deferred the rest. That misses **`workspace.readOnly`**: a change can take a readOnly spec in design, pass implement/verify/done, and fail only at archive.

**This branch is the new engine, not a patch on `main`.** GetStatus / TransitionChange / ArchiveChange `execute` matching predicates, then `evaluate`. `ValidateArtifacts` / `GetArtifactInstruction` call `evaluate` with **empty** `checksByTarget` — they only need DAG `projectArtifacts` / `nextArtifact`, not hop predicates. That is correct; they MUST NOT run `executeChecksByLegalTargets`. Snapshot-bag leftovers MUST stay gone.

## Proposed solution

Introduce a **single transition-attempt evaluation**: enumerate candidate edges (graph, or a requested target), attach an ordered list of **workflow checks**, run them, set `allowed` when no blocking check failed. `validTransitions`, `availableTransitions`, and `nextAction` are projections of that result. Execute maps the first blocking failure to existing `InvalidStateTransitionError` reasons. Status and repair guide consume the same evaluation.

Checks share one result shape (`pass` | `fail` | `skip`) and stable ids. They are not three output buckets (schema/task/platform).

Binding is **not** a mix of unrelated tables. Every **transition** check declares **`from → to`** plus a **direction** (`along`). Sugar is derived from that, not the other way around.

**Direction (`along`)** — whether the attempt is progress, retry, or redesign. `from = *` / `to = *` without `along` is too blunt (would treat `ready → designing` like `ready → implementing`).

| `along`    | Meaning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| `forward`  | `to` is **posterior** to `from` on the progress axis                                       |
| `backward` | `to` is **anterior** on that axis (retry: `verifying → implementing`, plus new hops below) |
| `redesign` | `to = designing` (universal return; not “previous step”)                                   |
| `recovery` | archive rollback (`archiving → archivable` only today)                                     |
| `any`      | no direction filter                                                                        |

**Progress axis:** `schema.workflow[]` **declaration order** of lookup rows. Each `step` names an existing `ChangeState`; the row attaches `requires` / `requiresTaskCompletion` / `hooks` only. It does **not** add states, **not** remove states from `VALID_TRANSITIONS`, and **not** lock consecutive occupancy. An omitted step still has a legal hop when the protocol allows it (`workflowStep(x) === null` means no extras). For `along`, listed names keep `workflow[]` order. Missing delivery states (`AXIS_FALLBACK`: ready, implementing, verifying, done, archivable, archiving) MUST be **spliced** into that axis by canonical fallback index — not pushed after later listed steps. Tail-append inverts retry (`verifying → implementing` would look `forward`). `drafting`/`designing` are not in `AXIS_FALLBACK`. Unknown `workflow[].step` strings MUST NOT occupy axis slots. `designing` is not “the previous workflow step”; it is `redesign`. Gate states (`pending-spec-approval`, `pending-signoff`, …) inherit the direction of the delivery state they stand in for (`implementing`, `archivable`).

**Today’s graph (`VALID_TRANSITIONS`) before this change.** Non-`designing` reversals are only `verifying → implementing` and `archiving → archivable` (recovery). `archivable` cannot go to verifying/implementing until the extension below.

| from → to                                        | `along`          | Notes                                                                      |
| ------------------------------------------------ | ---------------- | -------------------------------------------------------------------------- |
| almost every state → `designing`                 | `redesign`       | Universal return; invalidates approvals                                    |
| `designing → ready`                              | `forward`        |                                                                            |
| `designing → designing`                          | `any` / re-enter | Not progress, not redesign-from-later                                      |
| `ready → implementing` / `pending-spec-approval` | `forward`        | Gate hop inherits implementing                                             |
| `pending-spec-approval → spec-approved`          | `forward`        | Human approve, not `change transition`                                     |
| `spec-approved → implementing`                   | `forward`        |                                                                            |
| `implementing → verifying`                       | `forward`        |                                                                            |
| **`verifying → implementing`**                   | **`backward`**   | Retry implementation; only delivery retry today                            |
| `verifying → done`                               | `forward`        |                                                                            |
| `done → archivable` / `pending-signoff`          | `forward`        | Gate hop inherits archivable                                               |
| `pending-signoff → signed-off`                   | `forward`        | Human approve                                                              |
| `signed-off → archivable`                        | `forward`        |                                                                            |
| `archivable → archiving`                         | `forward`        | Start archive op                                                           |
| **`archivable → designing`**                     | **`redesign`**   | Only non-archive exit from archivable **before this change**               |
| **`archiving → archivable`**                     | **`recovery`**   | Failed-archive rollback; **not** workflow retry. No `requires` on this hop |
| `archiving → designing`                          | `redesign`       |                                                                            |

`along` therefore has five values: `forward`, `backward`, `redesign`, `recovery`, `any`. Do not treat `recovery` as `backward`.

**This change extends `VALID_TRANSITIONS` with skill-aligned backward hops** (the original exploration’s real ask — not “any state → any previous”). Today `done` / `archivable` / `signed-off` can only leave to archive-forward or `designing`, so a late implementation bug forces a full redesign. Retry must land on states the **implement** / **verify** skills already own (`implementing`, `verifying`).

New legal edges (all `along = backward`):

```text
done          → implementing, verifying
signed-off    → implementing, verifying
archivable    → implementing, verifying
```

Already legal and unchanged: `verifying → implementing` (backward). Unchanged: `archiving` only `archivable` (recovery) and `designing` (redesign) — no jump out of an in-flight archive. Unchanged: `pending-spec-approval` / `pending-signoff` only approve-forward or `designing` (do not skip a human gate via retry).

**Not** added: `archivable → done`, `done → ready`, any hop to `ready`/`designing` besides existing redesign. Those are not skill-aligned retries.

**Invalidation on these hops** (same spirit as today’s `verifying → implementing`): MUST NOT mass-invalidate artifacts (not a redesign). MUST invalidate **signoff** if present so a later `along = forward` to `archivable` requires approve again. MUST NOT invalidate **spec** approval unless artifacts actually change.

**nextAction:** `target` is the **next lifecycle hop** to move toward (not “which skill you’re in”). `command` is the skill/CLI that performs that hop’s work. Happy path from `done`/`signed-off`/`archivable` remains forward to archive/signoff — backward hops stay in `availableTransitions` but MUST NOT become default `nextAction`. Workflow skill templates (`.tpl` under `packages/skills/templates`) MUST teach stay-in-`ready`/`done` + human `approve`, not parking hops.

The check bindings above do **not** list each new pair: `approval.spec` stays `from=ready along=forward`; `impl.*` stays `from=implementing along=forward`; `approval.signoff` stays `from=done along=forward`. A `done → implementing` hop does not re-run spec approval (from is not `ready`). Redesign to `designing` does not re-run `impl.*`.

If config/schema later drops `implementing`, `ready → verifying` is still `along = forward`. `approval.spec` MUST be `from = ready`, `to = *`, `along = forward` so every delivery hop from `ready` is gated. `ready → designing` is `redesign` and MUST NOT match.

| Sugar              | Means                                                  |
| ------------------ | ------------------------------------------------------ |
| `onEnter(S)`       | `to = S`, `from = *`, `along = any` (unless specified) |
| `onExit(S, along)` | `from = S`, `to = *`, `along` as given                 |
| `onEdge(A, B)`     | exact pair; `along` implied by the axis                |

`impl.filesResolved` / `impl.linksInScope`: `from = implementing`, `to = *`, `along = forward` only. Redesign (`* → designing`) MUST NOT be blocked by open tracked files or out-of-scope links — return to designing is always legal when the protocol edge allows it. Archive still binds the same runners. `ready → verifying` does not match (`from` is not `implementing`).

The evaluator takes the candidate edge, classifies `along`, then attaches every check whose `from`/`to`/`along` match (plus schema rows for `to = effective`). Authoring may use sugar; the stored contract is the triple.

**`archive` is not a lifecycle `from→to`.** It is a separate operation key. `approval.signoff` is `from = done`, `to = archivable`, `along = forward`, **not** archive and **not** `pending-signoff`. `archive.archivable` on the archive operation is “already in archivable/archiving”, not signoff.

Evaluation order on each attempt: `protocol.edge` (fail-fast), then every matching check in **registry order**, with schema `requires` / `taskCompletion` treated as checks whose `to` is the **requested** target. No approval routing rewrite. Archive evaluation uses the operation key, not a fake lifecycle edge.

**Approval gates are checks.** They replace pending parking states as the wait. Skip when the gate is off.

- **Spec (`approval.spec`)** — `from = ready`, `to = *`, `along = forward`. Gate off → `skip`. Gate on + no recorded spec approval → `fail` `APPROVAL_REQUIRED`; the change **stays in `ready`**. `ApproveSpec` records consent without transitioning to `pending-spec-approval`. Redesign (`ready → designing`) does not match `forward`. Not `along = any`.
- **Signoff (`approval.signoff`)** — `from = done`, `to = archivable`, `along = forward`. Not `ArchiveChange`. `done → designing` is `redesign` and MUST NOT require signoff. `ApproveSignoff` records consent while staying in `done`.

`LifecycleEngine` MUST NOT rewrite `implementing` → `pending-spec-approval` or `archivable` → `pending-signoff`. `ready`’s `VALID_TRANSITIONS` MUST NOT include `pending-spec-approval`; `done` MUST NOT include `pending-signoff`. Existing changes already in pending-\* MAY still leave those states (drain). New work never enters them via `TransitionChange`.

A later omitted `implementing` step is still gated: `ready → verifying` is `along = forward` from `ready`, so `to = *` already matches. Do not move spec approval onto `onEnter(verifying)`.

Canonical example — **do not put implementation integrity on enter-`verifying`:**

- `impl.filesResolved` and `impl.linksInScope` belong on **`onExit(implementing)`**.
- Normal path `implementing → verifying` runs them when leaving implementation.
- Shortcut `ready → verifying` (no implementation) never exits `implementing`, so those checks MUST NOT run. If they were `onEnter(verifying)`, they would always fire and block spec-only/skip paths.

Same pattern as deps: fail when leaving the phase that produced the facts, plus archive as a second binding.

Core bindings **populated** in this change:

```text
to=ready, from=*, along=any:
  deps.consistent, workspace.readOnly

from=implementing, to=*, along=forward:
  impl.filesResolved, impl.linksInScope

from=ready, to=*, along=forward:
  approval.spec                         # skip if spec gate off; pass if spec approval recorded

from=done, to=archivable, along=forward:
  approval.signoff                      # skip if signoff gate off; pass if signoff recorded

operation archive:
  schema.nameMatch, archive.archivable, spec.overlap,
  workspace.readOnly, deps.consistent,
  impl.filesResolved, impl.linksInScope
  hook.pre  (effect, phase=before-persist, onFailure=abort)
  hook.post (effect, phase=after-persist, onFailure=collect)
```

Same runners: `deps.consistent` / `workspace.readOnly` at `onEnter ready` and archive (hard). `impl.*` at `onExit(implementing, forward)` and archive (open/out-of-scope impl fails at `implementing → verifying` and archive, **not** on redesign). `approval.spec` / `approval.signoff` are delivery-edge checks, not pending hops. Archive wraps remaining current guards (`allowOverlap` / `allowOutOfScope` stay skippable). **`archive.publication` is not a registry check.** Merge/publish preflight stays inside `ArchiveChange` after predicates allow the operation (knowable only at archive, not a “may I transition?” predicate).

**`IMPLEMENTATION_STATE` text output:** when `format=text` (status / repair / transition failure), open tracked files **and** out-of-scope links MUST summarize as a count plus at most three paths/examples. If more than three, label `examples:` (not the full list). Full inventory stays in structured `details` and/or CLI listing — not blocker prose. `DEPS_INCONSISTENT` and `READ_ONLY_WORKSPACE` keep full id lists in the message (small, no alternate listing command).

**`change status` text `review:`:** when `review.required` is true, text MUST print a `review:` header with `required` / `route` / `reason`. `artifacts (details):` already shows `pending-review` / `[drift]` and relative paths, so text MUST NOT reprint those files under `review:`. Exception: `spec-overlap-conflict` overlap peers (archived change + spec ids) are **not** in artifacts details, so text MUST still print those overlap lines. JSON/TOON keep the full `review` object.

Each check id lives in its **own implementation file** (`id` + `run`). The engine registry binds those checks to `from` / `to` / `along` or operation `archive`. A check MUST NOT declare where it applies.

Do **not** bind `impl.*` to `to = verifying`. Do not bind `approval.signoff` to the archive operation. Do not bind `approval.spec` with `along = any` (that would include redesign). Overlap stays archive-only in this change.

**Hooks are the same applicability, different kind.** A failing `run:` hook already aborts the transition (`HookFailedError`) — it is a gate, not a side show. If hooks keep a private “always source.post on any exit”, we have two models again.

**Pipeline phase and failure policy live on the binding row, not in the use case.** The use case only opens named slots around persist (`before-persist`, `after-persist`). Which effects fill a slot, and whether a failure aborts or is collected, MUST come from the table. Execute MUST NOT branch on `check.id === 'hook.pre'` / `'hook.post'` to pick timing or fail-soft.

| Binding field | Values                              | Role                                       |
| ------------- | ----------------------------------- | ------------------------------------------ |
| `phase`       | `before-persist` \| `after-persist` | Which use-case slot runs this effect       |
| `onFailure`   | `abort` \| `collect`                | Abort the operation vs record and continue |

Default for predicates and for transition effects: `phase = before-persist`, `onFailure = abort`. Archive `hook.post`: `phase = after-persist`, `onFailure = collect` (today’s fail-soft `postHookFailures`). Archive `hook.pre`: `before-persist`, `abort`. Transition `hook.post` stays `before-persist` (it still runs before `mutate`; `along = forward` is the direction filter, not “after persist”).

Two kinds share `from` / `to` / `along` (and the archive operation):

| Kind          | Role                                                                            | Status `allowed`                       | Execute                                                           |
| ------------- | ------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| **predicate** | pure-enough pass/fail/skip (protocol, requires, tasks, deps, approval, impl, …) | counts                                 | must pass before effects                                          |
| **effect**    | `run:` hook (side effects; may fail)                                            | does **not** count (unknown until run) | run matching effects after predicates; failure aborts, no persist |

`instruction:` hooks stay agent guidance, not predicates or effects in this pipeline.

Schema default bindings (this change — direction-aware without a special-case in `TransitionChange`):

- **pre / `run:`** — `to = that step`, `from = *`, `along = any` (entering the step, including redesign into `designing`).
- **post / `run:`** — `from = that step`, `to = *`, **`along = forward` only**. Completing a phase, not aborting it. `implementing → designing` / `implementing → verifying` retry the other way: **no** `implementing.post`. `archiving → archivable` is `recovery`: **no** `archiving.post`.
- Archive `run:` pre/post stay on **operation `archive`**, not on `along`. Bindings MUST set `phase` / `onFailure` (`hook.pre` → before-persist/abort; `hook.post` → after-persist/collect).

`--skip-hooks` / `--skip-hooks all` skips **effects**, never predicates. Skills that skip hooks and run them manually MUST use the same `along` filter (shared.md / templates). Dry-run later = predicates only.

**Check ABI.** `interface Check` + abstract `WorkflowCheck` in application. Each check has a named `create*(deps)` that returns a class instance compatible with `WorkflowCheck` (core checks `extend WorkflowCheck`). `deps` are only that check’s ports (`CountTasks`, `RunStepHooks`, extract, …). `execute(ctx)` is self-sufficient. No `PredicateSnapshots`, no closed `needs` catalog. Bindings own applicability + `phase` / `onFailure`. Use cases call `registry.predicates(attempt)` / `registry.effects(attempt, slot)` then `check.execute(ctx)`. They MUST NOT `switch` on `CheckId` to gather facts or launch hooks. Matcher / `classifyAlong` stay domain-pure. `LifecycleEngine` projects `allowed` / `availableTransitions` / `nextAction` from predicate `CheckResult`s; it does not take a snapshot bag. Plugins later use the same ABI; this change does not ship plugins. There is **no** pending routing.

**In this change:** check contract (`from`/`to`/`along` + archive); binding `phase` / `onFailure`; one file per check; predicates vs effects; schema+protocol predicates; bindings in the table; **no enter-pending via transition**; ApproveSpec/ApproveSignoff record consent in place; **post hooks `along=forward` only**; skill-aligned backward hops; shared evaluation for status/execute; **living documentation** that describes the lifecycle, `VALID_TRANSITIONS`, approval gates, or `change transition` / `change approve` — including that `workflow[]` is lookup+axis, not protocol membership. Skip-implementing (omit a listed row) remains a later graph change, not implied by omission.

**Out of this change (same program later):** skill template entry-state rewrites (`specd-implement` / `specd-verify`); rewriting historical ADRs; `transition --dry-run` / `status --target` UI; skip `implementing` as a missing forward step; overlap-at-ready; `review` as a per-edge check; YAML check-id lists; **any → any previous** (still rejected).

## Specs affected

### New specs

- `core:transition-checks`: Check identity, **mandatory gerund `label`**, one file per check, engine-owned `from` / `to` / `along`, predicate vs effect, archive operation, evaluation, projections, **generic check progress bus**. Does not execute hooks or persist.
  - Depends on: `core:change`, `core:workflow-model`, `core:schema-format`, `default:_global/architecture`

### Modified specs

- `core:change`: Skill-aligned backward hops. `ready` no longer transitions to `pending-spec-approval`; `done` no longer transitions to `pending-signoff`. Spec/signoff gates are recorded facts consumed by checks. Pending-\* remain drain-only. `pending-parent-artifact-review` is engine-derived; `ArtifactFile` rejects it; fs load/save **sanea** the wire token to `in-progress`. History includes `signoff-invalidated`.
- `core:lifecycle-engine`: No approval routing to pending. Hop `availableTransitions` / `nextAction` from predicate CheckResults. DAG `artifacts` / `nextArtifact` / parent-review from `projectArtifacts` even when `checksByTarget` is empty. Failed `approval.spec` when current state is a binding `from` → approve spec command (`boundFromStates`). `CompileContext` is not an `evaluate` consumer. Blocker catalog includes predicate codes (`IMPLEMENTATION_STATE`, `DEPS_INCONSISTENT`, `READ_ONLY_WORKSPACE`, …).
  - Depends on (added): `core:transition-checks`
- `core:get-status`: For each **protocol-legal** candidate target, matching predicates `execute(ctx)`; engine projects hops. When `state === 'archivable'`, also run **all archive predicates** (not hook effects). Drafts SHOULD still DAG-project effective status. No global snapshot gather. `CountTasks` memo is per evaluation pass, not Kernel-lifetime. Factory deps include `transitionBindings` and `archiveBindings`. Review overlap invalidation is `review` + `message`, not an `OVERLAP_CONFLICT` blocker.
  - Depends on (added): `core:transition-checks`
- `core:transition-change`: No `_resolveTarget` pending rewrite. `to` MAY be `'next'`: Core resolves the happy-path next lifecycle state (not `nextAction`). Pending / `archivable` / `archiving` reject `next`. Execute requested target after predicates. Effects selected by matcher + `phase` / `onFailure` (not hook ids). Constructor requires application `create*` bindings (no domain-stub default). `allowOutOfScope` on input. Schema miss throws. `source.post` only `along=forward`. `protocol.edge` fail-fast applies to **execute**, not GetStatus.
  - Depends on (added): `core:transition-checks`
- `core:approve-spec`: From `ready`, record spec approval and **stay in `ready`**. Drain path: still allow `pending-spec-approval` → `spec-approved` for in-flight changes.
  - Depends on (added): `core:transition-checks`
- `core:approve-signoff`: From `done`, record signoff and **stay in `done`**. Drain path for `pending-signoff` → `signed-off`.
  - Depends on (added): `core:transition-checks`
- `cli:change-approve`: Success from states bound as `from` for `approval.spec` / `approval.signoff` (currently `ready` / `done`); drain pending still allowed. Help text uses bound-`from` language, with current states as examples.
  - Depends on (added): `core:transition-checks`
- `core:config`: `approvals.spec` / `approvals.signoff` describe in-place checks, not pending hops.
  - Depends on (added): `core:transition-checks`
- `core:hook-execution-model`: Same matcher; post `along=forward` only; archive post uses `phase=after-persist` + `onFailure=collect`. TransitionChange auto-runs matching `run:` effects unless `skipHookPhases`. Verify MUST NOT say transition runs zero hooks by default.
  - Depends on (added): `core:transition-checks`
- `core:workflow-model`: `requires` / `taskCompletion` as checks; `workflow[]` is a **lookup table** (flags/hooks on existing states) plus display/`along` order — not membership of the state machine. Step availability is engine+predicates, not `change.effectiveStatus()` or persisted-only `requires`. Transition post `run:` is `before-persist`. CompileContext does not evaluate step availability.
  - Depends on (added): none
  - Depends on (removed): none
- `core:schema-format`: `workflow` entries configure named existing lifecycle states; they do not define the sequence of states a change is allowed to occupy. Artifact `requires` feeds the engine DAG (`projectArtifacts`); there is no `Change.effectiveStatus()` API.
  - Depends on (added): none
  - Depends on (removed): none
- `core:archive-change`: Named archive checks; shared runners. Effect slots driven by binding `phase` / `onFailure`, not check id. Same generic check progress bus as transition execute. Publication preflight remains in the use case (not `archive.publication` on the binding table). Constructor/result names match composition (`ListWorkspaces`, `MaterializeSpecMetadata`, `archiveDirPath`). `ArchiveChange` MUST NOT take `RunStepHooks` — production always injects `archiveBindings`; the ctor fallback is dead.
  - Depends on (added): `core:transition-checks`
- `core:validate-artifacts`: DAG-aware answers from `LifecycleEngine.evaluate` with empty `checksByTarget` (`projectArtifacts` only). MUST NOT run hop predicates. MUST NOT `gatherPredicateSnapshots`.
  - Depends on (added): `core:transition-checks`
- `core:get-artifact-instruction`: `nextArtifact` / effective status from the same DAG evaluate (empty `checksByTarget`). MUST NOT gather a global snapshot bag. Constraints MUST NOT say the use case never reads artifact status.
  - Depends on (added): `core:transition-checks`
- `cli:change-status`: Check-derived projections. Text MUST print `review:` with `required` / `route` / `reason` / human `message` when review is required, and MUST NOT duplicate `review.affectedArtifacts` file paths already in `artifacts (details):`. Overlap peers still print. Invalidation overlap MUST NOT appear as `OVERLAP_CONFLICT` in `blockers`. JSON `review` includes `message`. Text blockers from failed predicates MUST show the check gerund `label` next to the code. Drafted status CLI scenarios MUST exist.
  - Depends on (added): `core:transition-checks`
  - Depends on (removed): none
- `cli:change-transition`: No silent route to pending; repair guide from GetStatus on stderr (not stdout). Text/JSON progress uses the generic check bus (`stream: change-transition`), not `hook-progress`. `HookFailedError` is exit 2 on the check bus, not a Repair Guide. `--next` MUST pass `to: 'next'` into `TransitionChange` (Core resolves the happy-path next state). CLI MUST NOT keep a from→to routing table. `run-hooks` keeps `_hook-progress-presenter` until a later change. Verify MUST NOT expect pending hops.
  - Depends on (added): `core:transition-checks`
  - Depends on (removed): none
- `cli:change-archive`: Same generic check progress rendering for archive execute. JSON/TOON success is a `stream: change-archive` `complete` record so stdout stays parseable as NDJSON with progress. Command signature MUST list `--allow-out-of-scope`.
  - Depends on (added): `core:transition-checks`
  - Depends on (removed): none
- `skills:skill-templates-source`: rewrite workflow `.tpl` files so agents stay in `ready`/`done` for approval gates; pending rows are drain-only. Contract tests assert absence of happy-path parking copy.
  - Depends on (added): `core:transition-checks`

## Impact

Packages `@specd/core`, `@specd/cli`, and `@specd/skills` (workflow templates + `template-workflow` contract tests). Existing blocker/error codes stay. No schema-std YAML shape change.

**Living docs (must match the in-place gate model after implementation):** `docs/guide/workflow.md` (must not say the schema “defines which states exist”), `docs/guide/_sections/getting-started/lifecycle.md`, `docs/guide/configuration.md`, `docs/guide/schemas.md` (lifecycle phases vs lookup rows), `docs/config/config-reference.md`, `docs/config/examples/approvals-and-workflow-hooks.md`, `docs/cli/cli-reference.md` (`change approve` / `change transition`), `docs/core/domain-model.md`, `docs/core/use-cases.md`, `docs/core/errors.md`, `docs/core/overview.md` (if it restates the graph), `docs/schemas/schema-format.md` (`workflow[]` as lookup + progress axis; `taskCompletionCheck` gating), `packages/specd/README.md` and root `README.md` if they still describe parking hops. Grep remaining living hits of `pending-spec-approval` / silent routing / “workflow-visible” / “selects which states participate” after those edits. Leave `docs/adr/**` historical.

## Technical context

Agreed with the user (exploration, not the informal Jul 2026 note as law):

- One program even if later sliced; do not ship a `_nextAction` patch that the evaluator deletes.
- All gates are workflow **checks**; origin (`schema` vs `core`) is registry metadata, not output arrays.
- Evaluate **transitions first**, then attach checks whose **`from` / `to` / `along`** match. Progress axis = `workflow[]` lookup-row order with missing `AXIS_FALLBACK` states spliced by canonical index (not tail-appended). `along`: forward / backward / redesign / recovery / any. `workflow[]` does not select protocol membership. `availableSteps` is extras-bearing lookup rows only; protocol hops are `validTransitions` / `availableTransitions`.
- **Rejected:** any state → any previous. **Accepted (this change):** skill-aligned backward hops. Pending states are **not** enterable via `change transition`; they are drain-only.
- `approval.spec` = `from=ready`, `to=*`, `along=forward`. `approval.signoff` = `from=done`, `to=archivable`, `along=forward` (not archive, not pending). CLI approve copy uses bound-`from`, with `ready`/`done` as current examples.
- Each check id is one implementation file.
- `deps.consistent` and `workspace.readOnly` belong at `onEnter ready`; `impl.filesResolved` / `impl.linksInScope` belong at `onExit(implementing, forward)`, **not** `onEnter verifying` and **not** redesign. Archive reuses those runners.
- `IMPLEMENTATION_STATE` text messages compact to count + at most three paths (`examples:` when truncated); full paths only in `details.files`.
- `change status` text MUST print `review:` `required` / `route` / `reason` when review is required, and MUST NOT duplicate file paths already in `artifacts (details):`. Overlap peers stay in text. JSON `review` unchanged.
- **Post-verify recorte 26 (locked with the user):** (A) Storage **sanea** wire `pending-parent-artifact-review` → `in-progress` on load/save; `ArtifactFile` still rejects that token in memory. (B) Invalidation overlap is `review.reason` + human `review.message` + `overlap:` peers — **not** a GetStatus `OVERLAP_CONFLICT` blocker. Live overlap among active changes is an archive predicate; GetStatus runs **all archive predicates** (not hook effects) when `state === 'archivable'`, so `OVERLAP_CONFLICT` may appear as a skippable blocker **only then**. (C) `workflow.taskCompletion` caches `CountTasks` on the **evaluation pass memo**, not the Kernel check instance. (`--next`) CLI passes `to: 'next'`; Core resolves the happy-path next state. No CLI from→to table. Not `nextAction`. (1) GetStatus **collects every matching predicate** (repair guide needs the full why); `TransitionChange` **fail-fast** on `protocol.edge`. (3) `cli:change-archive` signature lists `--allow-out-of-scope`. (4) Transition Purpose is stay-in-state, not pending routing. (6) Deduplicate `--next` prose. (7) Tests for `source.pre` / `target.post` no-ops. (8) ValidateArtifacts ctor copy matches `ListWorkspaces`. Do **not** delta `default:_global/architecture`. CLI test files MUST mirror `src/commands/change/<file>.ts`.
- **Check progress UX:** every check MUST declare a human **`label`** in **gerund** form (e.g. `Checking implementation links`, `Running post hooks`) — no `Executing:` prefix. Transition/archive execute expose a **generic progress bus** for all matching checks (predicates and effects): `check-start` → optional `check-progress` stream → `check-done` with `✓`/`✗` and reason. Hooks map `RunStepHooks` events onto that bus; they MUST NOT keep a parallel hook-only progress channel as the public contract. `GetStatus` does not stream live progress (too noisy); structured check rows include `label`. **Blockers projected from failed predicates MUST carry that check’s `label`** so agents see what the code means (e.g. `DEPS_INCONSISTENT` → `Checking spec dependencies`) in text and structured output.
- **Actionable fail diagnostics:** a fail `message` (and structured `details`) MUST say **what is wrong**, not only **which entity failed**. Examples: `deps.consistent` MUST show extracted vs persisted `dependsOn` per mismatched spec (not only the spec id); `spec.overlap` MUST name overlapping peers/specs; `workspace.readOnly` MUST name the read-only specs (and SHOULD name the workspace). **Exception:** `impl.filesResolved` / `impl.linksInScope` keep compact text summaries (count + ≤3 examples) — full inventories stay out of blocker prose and are retrieved via CLI / structured status. Label alone is not enough for deps/overlap/readOnly.
- **`nextAction.target` vs `command`:** `target` = recommended next lifecycle step; `command` = skill/CLI that owns that work. When a skill also closes the exit hop, advance `target` once that hop is in `availableTransitions` — same pattern `implementing` already uses for `verifying`. Matrix: `designing`+`ready` available → `target: ready`, `/specd-design`; `verifying`+`done` available → `target: done`, `/specd-verify`; `done`/`signed-off` (signoff satisfied) → `target: archivable`, `/specd-verify` (not archive CLI); `archivable` → `target: archiving`, `/specd-archive`. Incomplete work keeps `target` on the current work state (`designing` / `verifying` / `implementing`).
- Matcher / `classifyAlong` remain hexagonal-pure. Predicate **I/O lives in `Check.execute`** (application). Domain `run` receives **only that check’s facts**, never a closed `PredicateSnapshots` bag. Effects’ `execute` calls `RunStepHooks`. Do not add a third use case that duplicates GetStatus/TransitionChange.
- **Post-verify compliance (this change):** hop consumers (GetStatus, TransitionChange, ArchiveChange) execute matching predicates then `evaluate`. DAG-only consumers (ValidateArtifacts, GetArtifactInstruction) pass `checksByTarget: {}`. Engine hop `availableTransitions` come from CheckResults; DAG `isReady` / parent-review MAY still use `projectArtifacts` when checks are absent. `skipHookPhases` MUST key off binding `phase` plus skip selectors (`target.pre` / `source.post` / archive `pre`/`post`). Transition `hook.pre` and `hook.post` share `before-persist`, so skip MUST NOT rely on `binding.phase` alone and MUST NOT `switch` on `check.id` in the use-case loop. `TransitionChange` MUST NOT default to domain stub `TRANSITION_BINDINGS` (composition injects `create*`). ArchiveChange MUST NOT accept `RunStepHooks` at all (bindings required; no ctor fallback). `archive.publication` MUST NOT be a `CheckId`. `CheckExecutionContext` includes baked `approvals`. `CompileContext` does not call `evaluate`. Transition `hook.post` is `before-persist`. Schema miss on TransitionChange throws. GetStatus drafts MUST DAG-project via **`projectArtifacts`** (drafts are not a mutable `Change`; they MUST NOT call `evaluate`). `GetStatus.lifecycle` MUST copy engine `availableSteps` (extras-bearing `workflow[]` rows). `pending-parent-artifact-review` is engine-derived, not a persistable file state. `source.pre` / `target.post` selectors MAY be accepted and no-op until a binding uses those slots. Delete snapshot-bag leftovers and unused id-keyed hook helpers (`executeHookEffect` / `shouldExecuteHookEffect`). `CheckId` is a closed union of **registered** checks only. Mapping failed check id → existing error types is allowed; switching on id to gather or launch hooks is not. Archive JSON success MUST be a `stream: change-archive` `complete` record (same as transition); help text and verify scenarios MUST match that stream, not an unwrapped `{ result: "ok" }`. Config Approvals prose MUST say any **forward** leave of `ready` (`to=*`), not only `ready → implementing`. Skill templates `specd` and `specd-archive` MUST mention in-place gates. LifecycleEngine remains a class (debug callback); matcher/`classifyAlong` stay functions. When `requestedTarget` check results include `workflow.requires`, engine `blockers` MUST project from those results and MUST NOT also emit `MISSING_ARTIFACT` from a second `requires` walk. Unknown `workflow[].step` names are rejected at **`buildSchema`** (`SchemaValidationError`); they never reach `TransitionChange`. CLI living docs: Repair Guide on **stderr**; transition check bus `stream: change-transition` (not `hook-progress`). `applyBindingSpecs` throws a `SpecdError`, not a generic `Error`.
- Rejected: empty no-op registry of future ids; listing check ids in schema YAML; treating `instruction:` as a predicate; running `source.post` on backward/redesign/recovery; routing to pending as a substitute for a check; documenting the snapshot bag as a private helper; binding `archive.publication`.
- **Binding table owns pipeline slot and failure policy.** Archive pre/post MUST NOT be sequenced by `id === 'hook.pre'|'hook.post'` in `ArchiveChange`. Use `phase` + `onFailure` on the row. Each check’s `create*` owns that check’s ports. ApproveSpec / ApproveSignoff stay in this change: they read `from` from the table (`boundFromStates`) and stay in `ready` / `done`; drain `pending-*` is not a delivery binding.
- **Docs and skill templates in this change:** living pages and `packages/skills/templates/**/*.tpl` must describe stay-in-`ready`/`done` + `approve` records consent. Do not rewrite ADRs. Do not treat `@specd/skills` domain `fs` as in-scope.

Code anchors today: `VALID_TRANSITIONS` in `packages/core/src/domain/value-objects/change-state.ts`; `LifecycleEngine` `availableTransitions` / `_nextAction` in `packages/core/src/domain/services/lifecycle-engine.ts`; `GetStatus` evaluate-then-CountTasks; `TransitionChange` task loop after evaluate; `ArchiveChange` guards in `packages/core/src/application/use-cases/archive-change.ts` (schema name, archivable, overlap, readOnly, impl open/out-of-scope, deps mismatch, publication preflight).

## Open questions

None for spec/design of this change. Deferred: dry-run UI (predicates only), skip implementing as omitted **forward** step, overlap-at-ready.
