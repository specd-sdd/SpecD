# Spec compliance audit — core use cases (`workflow-transition-checks`)

**Mode:** change-scoped, read-only  
**Change:** `workflow-transition-checks` (state `verifying`)  
**Repo:** `/Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux`  
**CLI:** `node packages/cli/dist/index.js`  
**Specs:** merged via `changes spec-preview workflow-transition-checks <specId>`  
**Graph:** `stale: false`, `contentFresh: true`, `lastIndexedAt: 2026-08-27T08:44:02.754Z`  
**Globals checked:** `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`  
**Code/specs:** not modified (this file only)

**Assigned specs**

- `core:transition-change`
- `core:get-status`
- `core:archive-change`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `core:validate-artifacts`
- `core:get-artifact-instruction`
- `core:config` (approval-gate / pending-hop delta + related Approvals requirements only)

**Focus lens:** stay-in-ready/done, no snapshot bag, GetStatus from checks, archive after-persist collect, bindings not RunStepHooks on ArchiveChange, empty `checksByTarget` for instruction/validate DAG.

Primary surfaces (graph):

| Symbol                             | File                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `TransitionChange`                 | `packages/core/src/application/use-cases/transition-change.ts:109`      |
| `GetStatus`                        | `packages/core/src/application/use-cases/get-status.ts:281`             |
| `ArchiveChange`                    | `packages/core/src/application/use-cases/archive-change.ts:275`         |
| `ApproveSpec`                      | `packages/core/src/application/use-cases/approve-spec.ts:30`            |
| `ApproveSignoff`                   | `packages/core/src/application/use-cases/approve-signoff.ts:30`         |
| `ValidateArtifacts`                | `packages/core/src/application/use-cases/validate-artifacts.ts:114`     |
| `GetArtifactInstruction`           | `packages/core/src/application/use-cases/get-artifact-instruction.ts`   |
| `createHookPre` / `createHookPost` | `packages/core/src/application/checks/hook-effect.ts:187`               |
| `executeChecksByLegalTargets`      | `packages/core/src/application/services/execute-matching-predicates.ts` |
| `matchingEffects`                  | `packages/core/src/application/services/execute-hook-effect.ts:23`      |
| `resolveTransitionChangeDeps`      | `packages/core/src/composition/use-cases/transition-change.ts:44`       |
| `resolveArchiveChangeDeps`         | `packages/core/src/composition/use-cases/archive-change.ts:121`         |

`gatherPredicateSnapshots` / `PredicateSnapshots` / `emptyPredicateSnapshots`: **absent** from `packages/core/src` (graph + search). Domain test asserts they are not exported.

---

## Focus findings (executive)

| Focus                                               | Verdict                                            | Evidence                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stay in `ready` / `done`                            | **Implemented**                                    | `TransitionChange` persists `requestedTarget` with no pending-hop rewrite. `approval.spec` / `approval.signoff` map to `InvalidStateTransitionError` `{ type: 'approval-required' }` before `mutate`. `ApproveSpec` / `ApproveSignoff` record consent without transitioning on bound `from` states. Config Approvals delta documents in-place checks. |
| No snapshot bag                                     | **Implemented**                                    | Checks execute with `CheckExecutionContext` (change, schema, attempt, approvals, optional skip). Each check owns I/O via `create*` ports. No gatherer type.                                                                                                                                                                                           |
| GetStatus from checks                               | **Implemented**                                    | `executeChecksByLegalTargets` then `LifecycleEngine.evaluate(..., { checksByTarget })`. Task counts painted from `workflow.taskCompletion` details, not a second `CountTasks` on the use case.                                                                                                                                                        |
| Archive after-persist collect                       | **Implemented**                                    | `ARCHIVE_BINDING_SPECS` `hook.post`: `phase: 'after-persist'`, `onFailure: 'collect'`. After `archiveRepository.archive()`, `matchingEffects(..., 'after-persist')`; fail → `postHookFailures` when `hookFailureMode === 'fail-soft'`.                                                                                                                |
| Bindings not `RunStepHooks` on ArchiveChange        | **Mostly implemented; leftover constructor param** | Instance field is `_archiveBindings` only. Effects run via `check.execute`. `RunStepHooks` remains a **positional constructor argument** used only for `defaultArchiveBindings` fallback. Composition still puts `runStepHooks` on `ArchiveChangeDeps`. Spec also still lists it under Ports/factory (internal spec contradiction).                   |
| Empty `checksByTarget` for instruction/validate DAG | **Implemented**                                    | Both call `evaluate(change, schema, { checksByTarget: {} })`. Tests spy that options object.                                                                                                                                                                                                                                                          |

---

## Spec: `core:transition-change`

### Requirements summary

Merged spec centralizes hops on composed `transitionBindings`. Approval is a predicate on the requested delivery edge. Effective persist target is the requested target (no pending rewrite). Predicates then `before-persist` effects (`hook.post` then `hook.pre` via matcher + phase), then `ChangeRepository.mutate`. `RunStepHooks` / `CountTasks` are not use-case ports.

### Implementation status (requirement-level)

| Requirement                                                        | Status          | Notes                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------- |
| Input contract                                                     | **implemented** | `TransitionChangeInput`: `name`, `to`, optional `skipHookPhases`, `refreshImplementationTrackingBefore`, `allowOutOfScope`. No gate flags on input.                                                                                                    |
| Approval gates baked at construction                               | **implemented** | `approvals: ApprovalGates` ctor; `resolveTransitionChangeDeps` uses `resolver.config.approvals`.                                                                                                                                                       |
| Change must exist                                                  | **implemented** | `ChangeNotFoundError` when `get` is null.                                                                                                                                                                                                              |
| Optional pre-transition implementation tracking refresh            | **implemented** | Refresh unless `refreshImplementationTrackingBefore === false`.                                                                                                                                                                                        |
| Spec approval is a check not a pending hop                         | **implemented** | No rewrite to `pending-spec-approval`. Failed `approval.spec` → `approval-required` / `gate: 'spec'` before persist.                                                                                                                                   |
| Signoff is a check not a pending hop                               | **implemented** | Same for `done` → `archivable` / `approval.signoff`.                                                                                                                                                                                                   |
| Human-approval pending states produce explicit transition failures | **implemented** | `_assertDrainAndGateTargets` allows drain `pending-*` → designing / historic approve-forward; `gate-not-required` when targeting pending/approved states with gates off. Protocol edge rejects `ready → pending-spec-approval` (`change-state` tests). |
| Direct transition when gates are inactive                          | **implemented** | `effectiveTarget = requestedTarget`; persist after green predicates.                                                                                                                                                                                   |
| Workflow requires enforcement                                      | **implemented** | `workflow.requires` via matching predicates; map fail to `incomplete-artifact` using check details + `findBlockingParent`. Progress from evaluation, not a second walk after green execute (fail path emits then throws).                              |
| Task completion check during requires enforcement                  | **implemented** | Mapped from `workflow.taskCompletion` details; `CountTasks` not a use-case port.                                                                                                                                                                       |
| Artifact validation clearing on verifying → implementing           | **implemented** | No artifact downgrade on that hop (only designing invalidation + skill-hop signoff invalidate).                                                                                                                                                        |
| Skill-aligned backward hop invalidation                            | **implemented** | `invalidateSignoff` for done/signed-off/archivable → implementing/verifying; `along` excludes `hook.post` (`along: 'forward'` on binding).                                                                                                             |
| Transition to designing from any state                             | **implemented** | `invalidate` inside mutate when not already designing/drafting.                                                                                                                                                                                        |
| Transition from archiving to archivable                            | **implemented** | `exceptAlong: ['recovery']` on requires/task/hook.pre; `hook.post` forward-only.                                                                                                                                                                       |
| Pre-hook / Post-hook execution                                     | **implemented** | `matchingEffects(..., 'before-persist')` then `executeCheckWithProgress`; skip via `ctx.skipHookPhases` inside `HookEffectCheck`, not `check.id` switch to launch `RunStepHooks`.                                                                      |
| Transition delegation                                              | **implemented** | `freshChange.transition(effectiveTarget, actor)` (or invalidate path for designing).                                                                                                                                                                   |
| Transition event                                                   | **implemented** | `{ type: 'transitioned', from, to }` after mutate.                                                                                                                                                                                                     |
| Persistence                                                        | **implemented** | `changes.mutate`.                                                                                                                                                                                                                                      |
| Result type                                                        | **implemented** | `{ change }` only; no `postHookFailures` (transition abort).                                                                                                                                                                                           |
| Progress callback                                                  | **partial**     | Requires/task/transitioned match. Hook progress is **generic check bus** (`check-start` / `check-progress` with `detail: 'hook-start'                                                                                                                  | 'hook-done'`), not `{ type: 'hook-start', phase: 'pre' | 'post' }` as written in this spec. |
| Dependencies                                                       | **implemented** | No `RunStepHooks` / `CountTasks` / `ImplementationDetector` on the class.                                                                                                                                                                              |
| Config-based factory / `resolveTransitionChangeDeps`               | **implemented** | Bindings from `resolveWorkflowCheckRegistry`; does not put `runStepHooks` on deps.                                                                                                                                                                     |

### Constraints vs code

- Failed predicates map to existing reasons via `_mapFailedPredicate` (`protocol.edge`, requires, tasks, approval, deps, readOnly, impl.\*).
- Schema miss: `schemaProvider.get()` is not swallowed (throws).
- Enter-ready / exit-implementing share registry runners with archive (same `create*` ids). Redesign `along` is not `forward`, so `impl.*` bindings (`along: 'forward'`) do not match — **compliant**.

### Purpose vs requirements (spec-internal)

Purpose still says the use case delegates **approval-gate routing** to `LifecycleEngine` while requirements forbid target rewrite. Engine is still used for projection (`evaluate` with `checksByTarget: { [requestedTarget]: evaluation.checks }`) and artifact DAG (`projectArtifacts`). **Routing rewrite is gone; purpose text is stale.**

### Discrepancies

1. **Progress event shape (spec vs code)**
   - Spec: `{ type: 'hook-start', phase: 'pre'|'post', hookId, command }` and matching `hook-done`.
   - Code: `CheckProgressEvent` nested under TransitionChange’s `onProgress`.
   - **Either:** spec should adopt the generic check bus (likely, given `core:transition-checks`), **or** TransitionChange should re-emit the old first-class hook events. Tests do not assert `type: 'hook-start'` with `phase`.

2. **Spec purpose / constraint “approval-gate routing”** vs “no effective-target rewrite” — **spec-internal**, code follows the latter.

### Test coverage

| Area                                                      | Coverage                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Stay in ready / approval-required                         | `packages/core/test/application/use-cases/transition-change.spec.ts` (`stays in ready and throws approval-required...`) |
| Stay in done / signoff                                    | same file (`stays in done...`)                                                                                          |
| Drain pending hops                                        | same file                                                                                                               |
| Hooks via `RunStepHooks` in check, not use-case id switch | hook describe block spies `RunStepHooks.execute`                                                                        |
| Factory without `RunStepHooks` on use case                | composition test + ctor shape                                                                                           |

### Missing / weak tests

- No assertion that `onProgress` receives `{ type: 'hook-start', phase }` as specified (would fail today).
- No explicit “does not rewrite `to` to `pending-spec-approval`” persist spy beyond remaining in `ready` (outcome-equivalent).

### Spec dependency chain

Depends on `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.

**Consistency:** Aligns with `core:config` Approvals delta and `core:approve-spec` stay-in-ready. Aligns with `core:hook-execution-model` (transition effects `before-persist` / `abort`). Conflicts with leftover “routing” wording in its own Purpose.

### Summary counts (`core:transition-change`)

- Requirements reviewed: 22
- Implemented: 21
- Partial: 1 (progress callback shape)
- Missing: 0
- Spec-internal stale wording: 1 (Purpose routing)
- Test gaps: 1 (legacy hook-start shape)

---

## Spec: `core:get-status`

### Requirements summary

Status is predicate-execute-then-project. No global snapshot bag. No `CountTasks` on the use case. Drafts use DAG-only (`projectArtifacts` / empty hop checks). Full path uses `executeChecksByLegalTargets` + engine projection.

### Implementation status

| Requirement                                           | Status                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepts a change name as input                        | **implemented**                                                                                                           | `name`, `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                                                                                                                                                                                                    |
| Returns the change and artifact statuses              | **implemented**                                                                                                           | Active `change` vs `draftView`; no `getDiscarded`                                                                                                                                                                                                                                                                                                             |
| Revision evaluation                                   | **implemented**                                                                                                           | Short-circuit skips refresh and full evaluate; empty artifactStatuses; `checksByTarget: {}`                                                                                                                                                                                                                                                                   |
| Drafted change read-only status                       | **implemented**                                                                                                           | `projectArtifacts` (spec allows this as the empty-`checksByTarget` DAG cascade). `availableTransitions: []`, `nextAction.command: null`                                                                                                                                                                                                                       |
| Implementation status projection                      | **implemented**                                                                                                           | `projectImplementationTracking`                                                                                                                                                                                                                                                                                                                               |
| Optional pre-read refresh                             | **implemented**                                                                                                           | After 304-style short-circuit; not for drafts                                                                                                                                                                                                                                                                                                                 |
| Drift-aware display status                            | **implemented**                                                                                                           | File + aggregate precedence                                                                                                                                                                                                                                                                                                                                   |
| Reports task completion from checks                   | **implemented**                                                                                                           | `taskCompletionFromChecks(checksByTargetMap)` reads `workflow.taskCompletion` `details.byArtifact`. No `CountTasks` field on `GetStatus`. Order: `projectArtifacts` (DAG statuses for check ctx) → `executeChecksByLegalTargets` (CountTasks inside check) → `evaluate`. This is **not** “engine then CountTasks only to paint”; paint is from check details. |
| Execute matching predicates then project              | **implemented**                                                                                                           | `executeChecksByLegalTargets` then `evaluate({ checksByTarget })`. Engine stays I/O-free. Result exposes `lifecycle.checksByTarget` and `lifecycle.checks`.                                                                                                                                                                                                   |
| Throws ChangeNotFoundError                            | **implemented**                                                                                                           |                                                                                                                                                                                                                                                                                                                                                               |
| Constructor dependencies                              | **implemented**                                                                                                           | `transitionBindings`; no `CountTasks`                                                                                                                                                                                                                                                                                                                         |
| Config-based factory bootstrap                        | **implemented** (composition; not re-audited line-by-line)                                                                |                                                                                                                                                                                                                                                                                                                                                               |
| Reports effective status for every artifact           | **implemented with nuance**                                                                                               | Full path iterates **schema artifact types**, filling missing as `missing`. Spec says “exactly one entry per artifact in the change's artifact map”. Extra schema types not on the change still appear. Likely longstanding; not introduced as snapshot-bag work.                                                                                             |
| Returns lifecycle context / blockers / nextAction     | **implemented**                                                                                                           | `_mergeBlockers` flattens failed predicates from all legal targets                                                                                                                                                                                                                                                                                            |
| Identifies blockers                                   | **implemented**                                                                                                           |                                                                                                                                                                                                                                                                                                                                                               |
| Graceful degradation when schema resolution fails     | **implemented**                                                                                                           | catch around `schemaProvider.get()`; persisted statuses only                                                                                                                                                                                                                                                                                                  |
| Config-based factory delegates `resolveGetStatusDeps` | **assumed implemented** via composition pattern matching TransitionChange; not opened in this pass beyond GetStatus class |

### Discrepancies

1. **Artifact list vs change map** (see table): possible spec vs code mismatch if a change has a subset of schema artifacts. Prefer clarifying spec to “one row per schema artifact type (missing if absent)” if that is the intended CLI contract.

2. **GetStatus tests** never mention snapshot bags or `executeChecksByLegalTargets` by name. Behaviour is covered indirectly (`availableTransitions` omit verifying when tasks incomplete). Domain module tests the absence of snapshot exports.

### Test coverage

- Draft empty transitions: `get-status.spec.ts` (`availableTransitions` `[]`)
- Task gating on status: `omits verifying from availableTransitions when implementing tasks are incomplete`
- Draft parent-review cascade without hop evaluate: `projects pending-parent-artifact-review for drafted dependents without calling evaluate`

### Missing tests

- Spy that `evaluate` is called with the map from `executeChecksByLegalTargets` (not `{}`) on the **active** path.
- Spy that `CountTasks` is not constructed on `GetStatus`.
- Explicit “no snapshot bag argument” (would be vacuously true).

### Spec dependency chain

Depends on change, kernel, transition-change, schema-format, config, lifecycle-engine, refresh, composition-resolver, count-tasks, transition-checks.

**Consistency with globals:** Application use case orchestrates I/O checks; domain engine projects — matches architecture. Tests in `test/application/use-cases/` — conventions.

### Summary counts (`core:get-status`)

- Requirements reviewed: 18 (this spec’s requirement headings in preview)
- Implemented: 16–17
- Partial / nuance: 1 (artifact row population vs “change map”)
- Missing: 0
- Test gaps: 2 (direct spies for check-then-project / no CountTasks on ctor)

---

## Spec: `core:archive-change`

### Requirements summary (focus + related)

Archive is an operation-scope check table. Predicates then `before-persist` effects (`abort`), persist/publish/archive, then `after-persist` effects (`collect`). Bindings injected; `RunStepHooks` belongs on hook checks.

### Implementation status

| Requirement                                                                                                | Status                                                         | Notes                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor (legacy block)                                                                       | **spec stale vs later requirement**                            | Still documents `RunStepHooks`, `ReadonlyMap` of spec repos, `RegenerateSpecMetadata`. Code: `ListWorkspaces`, `MaterializeSpecMetadata`, optional `archiveBindings`, `runStepHooks` still **required positional** for default registry.                                                                            |
| Archive bindings not RunStepHooks on the use case                                                          | **partial**                                                    | `_archiveBindings` stored. No `_runStepHooks` field. Kernel path: `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` **and** `runStepHooks`. Fallback `defaultArchiveBindings()` in the **use case file** still composes `createWorkflowCheckRegistry` + `CountTasks` if bindings omitted. |
| Input                                                                                                      | **implemented**                                                | `skipHookPhases` `pre`/`post`/`all`, `allowOverlap`, `allowOutOfScope`                                                                                                                                                                                                                                              |
| Schema name guard                                                                                          | **implemented**                                                | Predicate `schema.nameMatch` mapped to `SchemaMismatchError`                                                                                                                                                                                                                                                        |
| Archivable guard                                                                                           | **implemented**                                                | `archive.archivable` wraps `assertArchivable()`; fail mapping calls `assertArchivable()` again (throws `InvalidStateTransitionError`). Hooks not reached.                                                                                                                                                           |
| Deferred transition to archiving                                                                           | **implemented**                                                | mutate after snapshots, before publish loop                                                                                                                                                                                                                                                                         |
| ReadOnly / overlap                                                                                         | **implemented**                                                | Named predicates; overlap skippable via `allowOverlap`                                                                                                                                                                                                                                                              |
| Pre-archive hooks                                                                                          | **implemented**                                                | `matchingEffects(..., 'before-persist')`; skip `all`/`pre` inside hook check                                                                                                                                                                                                                                        |
| Tracked artifact selection / plan / staged commit / batch snapshot / restore / orphan / rollback / logging | **not re-proven line-by-line**                                 | Present in same `execute` (prepare → snapshot → mutate → publish → archive → cleanup). Out of focus except order vs after-persist.                                                                                                                                                                                  |
| Delta merge / archive repo / index / spec metadata / spec-lock / result / typed errors                     | **present in file**; metadata **before** after-persist effects |
| Post-archive hooks / after-persist collect                                                                 | **implemented**                                                | After `archive()` and backup `cleanup` and stale metadata loop: `matchingEffects(..., 'after-persist')`; collect commands into `postHookFailures`                                                                                                                                                                   |
| Archive checks share runners                                                                               | **implemented**                                                | Registry ids match spec list; `archive.publication` absent (domain test)                                                                                                                                                                                                                                            |
| Extra `_assertArchiveDepsConsistent`                                                                       | **compatible**                                                 | Second `runDepsConsistent` on **sidecar `finalDependsOn` vs extract** during preflight — spec allows remaining preflight inside the use case after named predicates. Shares the **runner**, not a second binding-table pass for the same facts.                                                                     |
| Config factory `resolveArchiveChangeDeps`                                                                  | **partial vs newer wording**                                   | Still **must** resolve `runStepHooks` per **this requirement’s list**. Newer “bindings not RunStepHooks” says RunStepHooks is only for `createHook*`. Composition satisfies the **older factory list** and the **inject bindings** clause.                                                                          |

### Discrepancies

1. **Spec-internal:** “Ports and constructor” + factory bullet list still require `RunStepHooks` on `ArchiveChange`; “Archive bindings not RunStepHooks” forbids storing it and says it is only a `createHook*` dep.
   - **Code** keeps the constructor argument for default wiring, does not store it when bindings are passed.
   - **Architecture:** `defaultArchiveBindings` inside `archive-change.ts` is composition logic in the application use case (should live in `composition/` only). Inner domain does not import fs. Mild layering smell, not a snapshot-bag issue.

2. **Verify scenario** “THEN it does not keep an unused `RunStepHooks` instance field” — **true** (no field). Tests do **not** assert this (no `_runStepHooks` / “unused field” test).

3. **Hook progress / skip:** Use case still **invokes** `execute` when skipped; skip is inside the check (`skip.has('post')`). Compliant with “skip MUST NOT rely on check.id”; slightly different from “do not call execute”.

4. **Metadata vs after-persist order:** Spec post-hooks: after `archive()` succeeds. Spec metadata: after `archive()` and backup delete. Code: archive → cleanup → metadata force → after-persist. **Compatible.** If a post-hook must observe metadata files, order is metadata-first.

### Test coverage

- Archive hook spies in `archive-change.spec.ts` (`RunStepHooks delegation parameters`, pre fail-fast, post collect).
- `matching-effects.spec.ts`: archive `after-persist` collect without filtering by check id.
- `transition-checks.spec.ts`: archive post `phase`/`onFailure`; no `archive.publication`; no snapshot exports.
- `archive-change-batch-restore.spec.ts`: log lines `after-persist effects started/completed`.
- Composition `createArchiveChange` instantiates; does not assert bindings vs unused `RunStepHooks`.

### Missing tests

- Construct with `archiveBindings` and a sentinel `runStepHooks` that throws if `execute` is called from the use case (only checks should call it).
- Assert class has no `runStepHooks` instance field.

### Spec dependency chain

Heavy (storage, hooks, overlap, lock, …). **Conflict:** leftover Ports constructor vs new bindings requirement. **Aligns** with `core:hook-execution-model` archive slot/collect.

### Summary counts (`core:archive-change`)

- Focus requirements: implemented
- Partial: constructor still takes `RunStepHooks`; spec Ports/factory stale
- Spec-internal contradictions: 1 major (Ports vs bindings)
- Test gaps: unused-field / bindings-only launch of RunStepHooks

---

## Spec: `core:hook-execution-model`

### Requirements (relevant)

| Requirement                                         | Status                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two hook types / instruction passive                | **implemented** (RunStepHooks skips instruction; not re-traced here)                                                                                                                                                                                                                       |
| Default hook execution for transitions and archives | **implemented** — Transition: `before-persist` only; Archive: before-persist then after-persist; `onFailure` from binding; no `check.id` launch of `RunStepHooks` in use cases                                                                                                             |
| Two execution modes                                 | **implemented** — `hookFailureMode`: collect → fail-soft, else fail-fast. Transition post is abort. Archive post collect                                                                                                                                                                   |
| Change entity does not execute hooks                | **implemented** (application checks)                                                                                                                                                                                                                                                       |
| Manual skipHookPhases                               | **implemented** in `HookEffectCheck` (`all`, `target.pre`/`source.post`, archive `pre`/`post`). Selectors `source.pre` / `target.post` are accepted on TransitionChange input but are **no-ops** for default bindings (both effects share `before-persist`). Spec documents them as valid. |
| Pre-hook failure abort                              | **implemented**                                                                                                                                                                                                                                                                            |
| Post-hook failure follows `onFailure`               | **implemented**                                                                                                                                                                                                                                                                            |
| External hooks phase semantics                      | **spec leftover risk:** “post-phase failures are reported without rolling back” matches **archive collect**, not **transition hook.post abort**. Transition is specified correctly in “Default hook execution”. External-hooks subsection is coarser.                                      |

### Discrepancies

- External-hooks “post-phase reported without rollback” vs transition `hook.post` `abort`/`before-persist`: **spec-internal** if read as applying to all hosts. Code applies binding `onFailure` per use case.

### Tests

- `workflow-check-factories.spec.ts`: `createHookPre` uses constructor `RunStepHooks`; protocol edge without snapshot bag.
- Transition/archive use-case hook tests as above.

### Summary counts

- Implemented for this change’s model: yes
- Spec-internal: external post-phase wording vs transition abort

---

## Spec: `core:approve-spec`

### Purpose / requirements

Consent in `ready` without entering `pending-spec-approval` or `spec-approved`. Drain: `pending-spec-approval` → `spec-approved`.

| Requirement                             | Status          |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate guard (disabled → no I/O)          | **implemented** | `ApprovalGateDisabledError` before `get`                                                                                                                                 |
| Change lookup / schema mismatch         | **implemented** |
| Artifact hash computation               | **implemented** | Skip missing/skipped; skip null artifact; cleanup map. **Nuance:** spec “obtain schema once”; `execute` calls `get()` then `_computeArtifactHashes` calls `get()` again. |
| Approval recording and state transition | **implemented** | `recordSpecApproval`; `transition('spec-approved')` **only** if `pending-spec-approval`. Bound `from` from `boundFromStates('approval.spec')` (currently `ready`).       |
| Persistence                             | **implemented** | Hashes computed **inside** `mutate` (stricter than “hash then mutate”; still serialized).                                                                                |
| Input / baked gates / factory           | **implemented** |

**Indexed canonical spec purpose** (graph search on `specs/`, not merged preview) still describes transitioning to `spec-approved` as the happy path. **Merged preview is the SoT for this change** and matches code. After archive, workspace spec must pick up the delta or graph will keep advertising the old purpose.

### Tests

- `approve-spec.spec.ts`: `records consent and stays in ready`; drain to `spec-approved`; mutate; gate disabled.

### Summary counts

- Implemented: all functional requirements
- Partial: double `SchemaProvider.get()` vs “once”
- Spec vs published index: old purpose until archive

---

## Spec: `core:approve-signoff`

Symmetric to ApproveSpec for `done` / `pending-signoff` / `signed-off`.

| Requirement                            | Status                                       |
| -------------------------------------- | -------------------------------------------- |
| Stay in `done` on happy path           | **implemented**                              |
| Drain `pending-signoff` → `signed-off` | **implemented**                              |
| Gate / hashes / mutate                 | **implemented** (same double `get()` nuance) |

### Tests

- `approve-signoff.spec.ts`: `records consent and stays in done`

### Summary counts

- Implemented: yes
- Same hash/schema-once nuance as ApproveSpec

---

## Spec: `core:validate-artifacts`

### Focus requirement: DAG lifecycle from engine `projectArtifacts` / empty `checksByTarget`

```224:226:packages/core/src/application/use-cases/validate-artifacts.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
```

Does not call `executeChecksByLegalTargets`. No snapshot bag. Other validation pipeline (requires, order, deltas, hashes, save) is pre-existing; not re-audited exhaustively in this batch except that hop predicates are not this use case.

### Tests

- `validate-artifacts.spec.ts`: `evaluates lifecycle with empty checksByTarget`

### Summary (focus)

- Implemented
- Other requirements: treated as out-of-scope except empty-DAG constraint — no contradiction found in the evaluate call site

---

## Spec: `core:get-artifact-instruction`

### Focus: empty `checksByTarget`; not GetStatus hop path

```103:106:packages/core/src/application/use-cases/get-artifact-instruction.ts
    const lifecycle = this._lifecycle.evaluate(change, schema, {
      checksByTarget: {},
    })
    const resolvedId = input.artifactId ?? lifecycle.nextArtifact
```

`nextArtifact` / effective status from DAG evaluate only. No `availableTransitions` evaluation. No snapshot bag.

Default ctor `lifecycle = new LifecycleEngine(Logger.debug.bind(Logger))` is a convenience; composition should still inject. Mild conventions/architecture note (constructing a domain service default), likely pre-existing.

### Tests

- `get-artifact-instruction.spec.ts`: spy `checksByTarget: {}`

### Summary (focus)

- Implemented

---

## Spec: `core:config` (Approvals delta only)

### Delta content

`approvals.spec` / `approvals.signoff` are in-place checks. Stay in `ready` / `done`. New work MUST NOT enter pending hops via `change transition`. Redesign `ready → designing` MUST NOT require spec gate. Spec gate covers any **forward** leave of `ready` (`from=ready`, `to=*`, `along=forward`), including `ready → verifying` when implementing is omitted.

### Code / binding alignment

```57:60:packages/core/src/domain/services/check-bindings.ts
    id: 'approval.spec',
    applicability: [{ scope: 'transition', from: 'ready', to: '*', along: 'forward' }],
```

`approval.signoff`: `from: 'done', to: 'archivable', along: 'forward'` — matches “cannot transition to archivable until signoff”.

### Verify

- Defaults false; enable flags; “Spec gate on does not require pending-spec-approval in the graph”

### Consistency

Matches TransitionChange / ApproveSpec / change-state (`ready → pending-spec-approval` invalid).

### Summary

- Delta **implemented** in bindings + use cases
- Config loader defaults not re-opened; existing Approvals verify scenarios remain the contract

---

## Globals

### `default:_global/architecture`

- **Match:** Domain `LifecycleEngine` / predicate **runners** stay I/O-free; application `create*` checks and use cases perform I/O. GetStatus/TransitionChange/ArchiveChange do not put hook running on the entity.
- **Smell:** `ArchiveChange.defaultArchiveBindings` composes `createWorkflowCheckRegistry` inside the use-case module (composition belongs in `packages/core/src/composition/`). Fallback `process.cwd()` default for `projectRoot` is infra-ish.
- **Match:** YAML/config not parsed in these use cases.

### `default:_global/conventions`

- Use cases: kebab-case files, named exports, tests under `packages/core/test/...` mirroring src, explicit return types on public execute methods.
- `exactOptionalPropertyTypes`: optional `onCheckProgress` / `skipHookPhases` spread with conditionals — compliant pattern.
- ApproveSpec/Signoff `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')` uses `noUncheckedIndexedAccess`-safe fallback.

### `default:_global/testing`

- Vitest; `test/` mirrors `src/`; many `given…, when…, then…` / `it('given…')` names.
- **No snapshots** in these tests; domain test explicitly forbids snapshot-bag **exports**.
- Gap: few tests named after “empty checksByTarget” / “no snapshot bag” on GetStatus itself (Validate/Instruction have spies).

---

## Cross-spec consistency (change artifacts)

| Topic                              | Specs                                                                             | Code                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| Stay in ready/done                 | transition-change, approve-\*, config Approvals                                   | Aligned                                            |
| Pending hops drain-only            | transition-change, approve-\*                                                     | Aligned; `VALID_TRANSITIONS` forbids ready→pending |
| No snapshot bag                    | get-status, validate-artifacts, get-artifact-instruction, transition-checks (dep) | Aligned                                            |
| GetStatus check-then-project       | get-status                                                                        | Aligned                                            |
| Archive after-persist collect      | archive-change, hook-execution-model, check-bindings                              | Aligned                                            |
| RunStepHooks not use-case launcher | transition-change (strict), archive-change (new req vs old Ports)                 | Transition strict; Archive leftover ctor param     |
| Empty checksByTarget DAG           | validate-artifacts, get-artifact-instruction, get-status drafts                   | Aligned                                            |
| Hook progress events               | transition-change lists first-class hook-start; transition-checks generic bus     | Code = generic bus                                 |

**Graph search caveat:** `specd graph search --specs` still scores **archived/workspace** `core:approve-spec` purpose as “transitions to spec-approved”. That is **index of `specs/`**, not `spec-preview`. Do not treat it as this change’s merged contract.

---

## Totals (this batch)

| Spec                          |             Req reviewed (approx.) | Implemented |      Partial | Missing impl |      Spec-internal issues |
| ----------------------------- | ---------------------------------: | ----------: | -----------: | -----------: | ------------------------: |
| core:transition-change        |                                 22 |          21 |            1 |            0 |       1 (Purpose routing) |
| core:get-status               |                                 18 |          16 |            1 |            0 |                         0 |
| core:archive-change           |                          20+ focus |   focus yes | ctor/factory |            0 |     1 (Ports vs bindings) |
| core:hook-execution-model     |                           12 focus |          12 |            0 |            0 | 1 (external post wording) |
| core:approve-spec             |                                  8 |           8 |  schema-once |            0 |  indexed purpose vs delta |
| core:approve-signoff          |                                  8 |           8 |  schema-once |            0 |                      same |
| core:validate-artifacts       | 1 focus (+ rest not fully counted) |           1 |            0 |            0 |                         0 |
| core:get-artifact-instruction |                            1 focus |           1 |            0 |            0 |                         0 |
| core:config Approvals         |                          1 section |           1 |            0 |            0 |                         0 |

**Neither spec nor code is automatically SoT.** Highest-value reviewer choices:

1. Treat **merged preview** Approvals / stay-in-state as correct; finish archive so graph purpose text for ApproveSpec matches.
2. **ArchiveChange:** pick one constructor story — drop unused `RunStepHooks` param when bindings required, **or** keep factory list and relax “createHook\* only”. Move `defaultArchiveBindings` to composition.
3. **Transition progress:** update `core:transition-change` Progress callback to the check bus, **or** re-emit legacy `hook-start`/`hook-done` with `phase`.

---

## Files / tests referenced

- `packages/core/src/application/use-cases/transition-change.ts`
- `packages/core/src/application/use-cases/get-status.ts`
- `packages/core/src/application/use-cases/archive-change.ts`
- `packages/core/src/application/use-cases/approve-spec.ts`
- `packages/core/src/application/use-cases/approve-signoff.ts`
- `packages/core/src/application/use-cases/validate-artifacts.ts`
- `packages/core/src/application/use-cases/get-artifact-instruction.ts`
- `packages/core/src/application/checks/hook-effect.ts`
- `packages/core/src/application/services/execute-matching-predicates.ts`
- `packages/core/src/application/services/execute-hook-effect.ts`
- `packages/core/src/domain/services/check-bindings.ts`
- `packages/core/src/composition/use-cases/transition-change.ts`
- `packages/core/src/composition/use-cases/archive-change.ts`
- Tests: `transition-change.spec.ts`, `get-status.spec.ts`, `archive-change.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, `validate-artifacts.spec.ts`, `get-artifact-instruction.spec.ts`, `transition-checks.spec.ts`, `matching-effects.spec.ts`, `workflow-check-factories.spec.ts`
