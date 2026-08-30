# Spec-compliance partial: use cases (`core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`)

**Mode:** change `workflow-transition-checks`  
**Scope:** spec-preview of the four assigned specs vs working-tree implementation (read-only).  
**Graph:** `graph stats` reported `stale: false`. `graph search` located `evaluateLifecycle` (`packages/core/src/application/services/lifecycle-evaluation.ts:20`), `evaluateLifecycleVerdict` (`packages/core/src/domain/services/lifecycle-verdict.ts:142`), and all four `resolve*Deps` helpers. `graph impact --symbol evaluateLifecycle` / `evaluateLifecycleVerdict` did **not** list the use-case callers (affected files were engine tests / `workflow-requires.ts` / evaluation+guidance only). Implementation claims below are from **working-tree source**, not graph adjacency.  
**CLI:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`

---

## Requirements Summary

Focus contracts from this audit (must hold on all four specs):

| Contract                                                                                                                                   | Spec (preview)                                                                                                | Code                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle` as a module function; MUST NOT ctor-inject `LifecycleEngine` / `evaluateLifecycle` | GetStatus constructor + `resolveGetStatusDeps`; TransitionChange Dependencies + `resolveTransitionChangeDeps` | `import { evaluateLifecycle } from '../services/lifecycle-evaluation.js'`; constructors take repos, schema, approvals, refresh, bindings only |
| ValidateArtifacts / GetArtifactInstruction call `evaluateLifecycleVerdict` with empty `checksByTarget`; no hop predicates                  | VA “DAG lifecycle from engine evaluate”; GAI “Effective status from DAG evaluate”                             | `evaluateLifecycleVerdict(change, schema, { checksByTarget: {} })`                                                                            |
| `resolve*Deps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                            | All four factory requirements                                                                                 | Helpers return ports/bindings only; no `lifecycle` key                                                                                        |
| Schema miss: only `SchemaNotFoundError` degrades on GetStatus                                                                              | GetStatus Constraints                                                                                         | `catch` rethrows unless `instanceof SchemaNotFoundError`                                                                                      |
| Drafted status: empty `availableTransitions`; `nextAction.command` null                                                                    | GetStatus drafted requirement                                                                                 | `_buildDraftedResult`: `availableTransitions: []`, `command: null`                                                                            |
| Transition `--next` / `to: 'next'` is Core `HAPPY_PATH_NEXT`                                                                               | TransitionChange “to next is the happy-path next state”                                                       | `HAPPY_PATH_NEXT[fromState]` then same predicate path; CLI passes `{ to: 'next' }`                                                            |
| No second requires/task walk after green evaluate                                                                                          | TransitionChange workflow requires + task completion constraints                                              | Failures map from `CheckResult` details; green path does not re-`execute` requires/task checks                                                |

### `core:get-status` (17 `### Requirement` blocks)

1. **Accepts a change name as input** — `name`, optional `refreshImplementationTracking`, optional `ifModifiedSince`.
2. **Returns the change and its artifact statuses** — active `change` vs `draftView`; no `getDiscarded`; drafted must not expose mutable Change or mutating transitions.
3. **Revision evaluation for conditional status queries** — HTTP-304-style short-circuit.
4. **Drafted change read-only status** — DAG via same cascade as `evaluateLifecycleVerdict` empty checks (`projectArtifacts`); empty `availableTransitions`; `nextAction.command` must not recommend transition/validate.
5. **Implementation status projection** — tracked files + links.
6. **Optional pre-read implementation tracking refresh** — default on for active; skip for draft / `false` / unchanged short-circuit.
7. **Drift-aware display status** — `hasDrift` / `displayStatus` including `complete-with-drift`.
8. **Reports task completion counts** — paint from `workflow.taskCompletion` details; no second `CountTasks`; no global snapshot bag.
9. **Execute matching predicates then project** — all matching predicates per hop; archive predicates when `archivable`; then `evaluateLifecycle` for public `nextAction.command`.
10. **Throws ChangeNotFoundError** — never `null`.
11. **Constructor dependencies** — repos, schema, approvals, refresh, `transitionBindings`, `archiveBindings`; import `evaluateLifecycle`.
12. **Config-based factory preserves complete repository bootstrap**.
13. **Reports effective status for every artifact** — schema types via `evaluateLifecycle` / `projectArtifacts`.
14. **Returns lifecycle context** — review priority, overlap scan, check-derived `availableTransitions` / `availableSteps`.
15. **Identifies blockers** — review + predicate codes; overlap rules for `OVERLAP_CONFLICT`.
16. **Graceful degradation when schema resolution fails** — `SchemaNotFoundError` only.
17. **Config-based factory delegates through `resolveGetStatusDeps`** — no `lifecycle` / `LifecycleEngine` / `evaluateLifecycle` on deps.

### `core:transition-change` (25 `### Requirement` blocks)

Input (`to: ChangeState | 'next'`), baked approvals, existence, refresh, approval-as-check (no pending rewrite), pending drain, direct persist target, workflow requires (map failed predicate, no second algorithm), task completion via check (no second `CountTasks`), verifying→implementing retry, skill-aligned backward invalidation, designing hop via `invalidate`, archiving→archivable recovery, pre/post hook effects, entity `transition`, persist via `mutate`, result `{ change }`, progress bus, constructor deps (no `LifecycleEngine` / `RunStepHooks` / `CountTasks`), **`to: 'next'` = `HAPPY_PATH_NEXT`**, shared runner errors, `resolveTransitionChangeDeps`.

### `core:validate-artifacts` (focus + remaining)

Constructor without engine; `evaluateLifecycleVerdict` empty `checksByTarget`; one evaluate per execute + in-memory `markVerdictComplete`; topological traversal; `resolveValidateArtifactsDeps` without `lifecycle`. Remaining spec (structural/delta/cross-artifact/hash/`mutate`) is out of the focus contract except where it contradicts DAG/hop split.

### `core:get-artifact-instruction` (9 `### Requirement` blocks)

Ports without engine; input + auto `nextArtifact`; lookup/guards; instruction/delta shape; `resolveGetArtifactInstructionDeps`; DAG via `evaluateLifecycleVerdict` empty checks (no hop predicates, no snapshot bag).

---

## Implementation Status

### Wiring (all four) — **implemented**

| Helper                              | File                                                                        | Resolves                                                                                                     | `lifecycle` / `LifecycleEngine`? |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `resolveGetStatusDeps`              | `packages/core/src/composition/use-cases/get-status.ts:39-50`               | changes, schemaProvider, approvals, refresh, `transitionBindings`, `archiveBindings`                         | No                               |
| `resolveTransitionChangeDeps`       | `packages/core/src/composition/use-cases/transition-change.ts:41-50`        | changes, actor, schemaProvider, refresh, approvals, `transitionBindings`                                     | No                               |
| `resolveValidateArtifactsDeps`      | `packages/core/src/composition/use-cases/validate-artifacts.ts:38-53`       | changes, listWorkspaces, schemaProvider, parsers, actor, contentHasher, extractorTransforms, workspaceRoutes | No                               |
| `resolveGetArtifactInstructionDeps` | `packages/core/src/composition/use-cases/get-artifact-instruction.ts:37-48` | changes, specs, schemaProvider, parsers, templateExpander                                                    | No                               |

Config factories all `createCompositionResolver` → `resolve*Deps` → canonical `create*(deps)`.

### GetStatus — **implemented** (focus)

- Constructor: `GetStatus` (`get-status.ts:307-321`) does not take `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`.
- Full path: `executeChecksByLegalTargets` then `evaluateLifecycle(change, schema, { approvals, checksByTarget })` (`get-status.ts:457-484`).
- Task paint: `taskCompletionFromChecks` from check details; no second `CountTasks`.
- Schema miss: only `SchemaNotFoundError` degrades (`get-status.ts:395-400`); other errors rethrown (`get-status.spec.ts` “disk exploded”).
- Drafted: `projectArtifacts` (same DAG cascade; spec names this explicitly); empty `availableTransitions` / `availableSteps`; `nextAction.command: null` (`get-status.ts:673-714`). Does **not** run hop `evaluateLifecycle` (test spies this).
- Unchanged short-circuit: empty artifactStatuses / blockers; no refresh.

### TransitionChange — **implemented** (focus)

- Constructor: no engine (`transition-change.ts:129-143`).
- `to === 'next'`: `HAPPY_PATH_NEXT[fromState]` or `HappyPathNextUnavailableError` (`transition-change.ts:182-187`). Table omits `pending-spec-approval`, `pending-signoff`, `archivable`, `archiving` (`change-state.ts:49-58`). CLI `change transition --next` passes `{ to: 'next' }` (`packages/cli/src/commands/change/transition.ts` + CLI tests).
- Predicates: `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` then `evaluateLifecycle` for projection (`transition-change.ts:202-223`).
- Fail mapping: `_mapFailedPredicate` from check `id`/`details`; `findBlockingParent` only to fill `blockedBy` on incomplete-artifact — not a second `workflow.requires.execute`.
- Progress: `_emitRequiresProgress` walks schema `requires` against **already computed** verdict artifacts after evaluate (progress contract, not a second gate).
- Schema miss: `await this._schemaProvider.get()` with no degrade catch (throws), matching “MUST throw”.

### ValidateArtifacts — **implemented** (focus)

- Constructor: 8 ports, no engine (`validate-artifacts.ts:136-145`). Optional hasher/routes defaults do not add lifecycle.
- `evaluateLifecycleVerdict(..., { checksByTarget: {} })` once at start (`validate-artifacts.ts:220-222`); `markVerdictComplete` patches in-memory map; no hop `executeChecksByLegalTargets`.
- Preview **verify.md** scenario is now **“constructed without LifecycleEngine”** (prior HIGH closed).

### GetArtifactInstruction — **implemented** (focus)

- Constructor: 5 ports, no engine (`get-artifact-instruction.ts:66-72`).
- Always calls `evaluateLifecycleVerdict(..., { checksByTarget: {} })` then `nextArtifact` when `artifactId` omitted (`get-artifact-instruction.ts:97-100`). Extra call when `artifactId` is explicit is DAG-only (empty checks), not hop predicates.

### Prior HIGH re-verify

| Prior finding                                                                     | Status now                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ValidateArtifacts verify required constructor `LifecycleEngine`                   | **Closed (spec).** Preview verify: “ValidateArtifacts is constructed without LifecycleEngine” + DAG from `evaluateLifecycleVerdict` empty checks. Code matches.                                                                                                                                                |
| GetStatus / TransitionChange / GAI leftover `LifecycleEngine.evaluate` in preview | **Mostly closed.** GetStatus verify uses `evaluateLifecycle`. GAI verify uses `evaluateLifecycleVerdict` / `nextArtifact`. **TransitionChange verify still has two scenarios** (“Pending spec approval / signoff blocks…”) whose THEN line is “the `LifecycleEngine` identifies an approval-required blocker”. |
| Composition tests leftover `lifecycle: {} as never`                               | **Closed.** `packages/core/test/composition/use-cases/get-status.spec.ts` and `transition-change.spec.ts` stub ports/`transitionBindings` only; no `lifecycle` key. Repo-wide grep for `lifecycle: { as never` in `packages/core` is empty.                                                                    |

---

## Discrepancies

### 1. medium | spec-wrong | TransitionChange verify still names `LifecycleEngine` as the identifier of approval blockers

- **Evidence (spec):** preview `core:transition-change` verify — “Pending spec approval blocks normal forward transition” and “Pending signoff blocks normal forward transition”: **THEN** `the LifecycleEngine identifies an approval-required blocker`.
- **Evidence (code):** those hops fail via `approval.spec` / `approval.signoff` checks + `_mapFailedPredicate`; `evaluateLifecycle` is a module function; there is no `LifecycleEngine` class in `packages/core` (graph search and source).
- **Option A (preferred):** rewrite THEN to “predicate evaluation / `evaluateLifecycle` projects `approval-required`” so verify matches spec.md Dependencies.
- **Option B:** restore a class named `LifecycleEngine` (rejected by this change’s constructor rules).
- **Impact:** literal verify wording vs implementation; tests already assert `InvalidStateTransitionError` + `approval-required` without an engine type.

### 2. low | spec-wrong | Debug logs still say “lifecycle engine”

- **Evidence:** `GetStatus projected lifecycle engine verdict`, `TransitionChange projected lifecycle engine routing`, `ValidateArtifacts projected lifecycle engine dependency state`, `GetArtifactInstruction auto-selected next artifact from lifecycle engine`.
- **Code-wrong alternative:** logs are not the spec contract; no functional mismatch.
- **Fix:** rename logs to `evaluateLifecycle` / `evaluateLifecycleVerdict` if agents grep for “engine class”.

### 3. low | both (wording vs draft path) | Drafted GetStatus uses `projectArtifacts`, not `evaluateLifecycleVerdict`

- **Spec:** “compute artifact effective statuses via the same DAG cascade as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`)”.
- **Code:** drafted path calls `projectArtifacts` only and **must not** call hop `evaluateLifecycle` (tested).
- **If read strictly as “must invoke `evaluateLifecycleVerdict`”:** code would be incomplete; **if read as the parenthetical `projectArtifacts`:** code is correct.
- **Recommendation:** keep code; leave spec parenthetical as the authority. Not a HIGH.

No **high** code-wrong findings on the assigned focus contracts.

---

## Test Coverage

| Area                                                                         | Coverage                | Notes                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GetStatus ctor / no engine                                                   | Indirect                | `makeGetStatus` / `new GetStatus(...)` never pass an engine; verify scenario has no property-name assertion                                                                  |
| GetStatus `evaluateLifecycle` after checks                                   | **Yes**                 | `get-status.spec.ts` CountTasks-before-evaluate; spy `checksByTarget`                                                                                                        |
| GetStatus SchemaNotFoundError degrade vs other errors                        | **Yes**                 | `schema: null` → empty availableTransitions; `Error('disk exploded')` rethrown                                                                                               |
| GetStatus drafted empty transitions                                          | **Yes**                 | `projects read-only views with empty transitions`; DAG cascade without `evaluateLifecycle`                                                                                   |
| GetStatus drafted `nextAction.command === null`                              | **No dedicated expect** | Command is implemented; not asserted in the drafted test                                                                                                                     |
| GetStatus `resolveGetStatusDeps`                                             | Partial                 | Composition smoke + source contains `includeOverlapDetection: true`; no key-absence test for `lifecycle`                                                                     |
| TransitionChange `to: 'next'` / `HAPPY_PATH_NEXT`                            | **Yes**                 | `transition-change.spec.ts` + `change-state.spec.ts` + CLI `--next` → `{ to: 'next' }`                                                                                       |
| TransitionChange no second CountTasks                                        | **Yes**                 | scenarios around task-completion check ownership                                                                                                                             |
| TransitionChange schema miss throws                                          | **Yes**                 | `throws SchemaNotFoundError instead of skipping checks`                                                                                                                      |
| VA empty `checksByTarget`                                                    | **Yes**                 | `validate-artifacts.spec.ts` spy `evaluateLifecycleVerdict`                                                                                                                  |
| VA ctor without engine                                                       | Indirect                | constructor call sites; no “does not receive LifecycleEngine” type test                                                                                                      |
| GAI empty `checksByTarget`                                                   | **Yes**                 | `get-artifact-instruction.spec.ts` spy                                                                                                                                       |
| Composition `lifecycle: {} as never`                                         | **N/A (removed)**       | GetStatus/TransitionChange composition tests use bindings arrays                                                                                                             |
| `createValidateArtifacts` / `createGetArtifactInstruction` composition smoke | **Missing files**       | No `packages/core/test/composition/use-cases/validate-artifacts.spec.ts` or `get-artifact-instruction.spec.ts`; only kernel barrel names in `barrel-kernel-coverage.spec.ts` |

---

## Missing Tests

1. Drafted GetStatus: `expect(result.nextAction.command).toBeNull()` (and optionally that command is not a transition/validate string).
2. Composition factory smoke for `createValidateArtifacts` and `createGetArtifactInstruction` (mirror get-status/transition-change: config form, deps form, reject deps+options; deps objects must **not** include `lifecycle`).
3. Negative source or type-level test: `GetStatusDeps` / `TransitionChangeDeps` keys exclude `lifecycle` (today guaranteed by interfaces; a regression of `lifecycle: {} as never` would be a type error).
4. TransitionChange verify scenarios for pending gates: rename expected collaborator so tests/docs do not imply a `LifecycleEngine` instance (test gap is documentation, not missing failure assertions).
5. Optional: GetStatus constructor unit that `GetStatus.length === 6` / no 7th engine arg (brittle; composition types already encode this).

---

## Spec Dependency Chain

Depth-1 from preview **Spec Dependencies** (change specs vs globals / siblings):

| Spec                            | Direct dependencies (preview)                                                                                                                                                                           | Consistency with focus contracts                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:get-status`               | change, kernel, transition-change, schema-format, config, lifecycle-engine, refresh-implementation-tracking, composition-resolver, count-tasks, transition-checks                                       | Aligns: hop predicates then `evaluateLifecycle`; CountTasks inside check. Drafted path uses `projectArtifacts` as allowed by lifecycle-engine DAG split.                                                                              |
| `core:transition-change`        | change, run-step-hooks, hook-execution-model, workflow-model, `default:_global/architecture`, lifecycle-engine, refresh-implementation-tracking, composition-resolver, count-tasks, transition-checks   | Aligns: fail-fast `protocol.edge`; Core `HAPPY_PATH_NEXT`; architecture remains package-agnostic (no `LifecycleEngine` in global architecture). **Verify leftover engine name** contradicts lifecycle-engine “functions not a class”. |
| `core:validate-artifacts`       | change, change-layout, change-manifest, lifecycle-engine, delta-format, selector-model, storage, architecture, spec-id-format, schema-format, composition-resolver, transition-checks (no snapshot bag) | Aligns: empty `checksByTarget`; no hop predicates. Spec.md and verify.md **now agree** on no ctor engine (prior contradiction closed).                                                                                                |
| `core:get-artifact-instruction` | delta-format, change, schema-merge, template-variables, lifecycle-engine, schema-format, composition-resolver, transition-checks (no `gatherPredicateSnapshots`)                                        | Aligns with empty-checks DAG. Verify auto-select uses `evaluateLifecycleVerdict`, not `LifecycleEngine.nextArtifact`.                                                                                                                 |

**Global specs (`default:_global/architecture`, conventions, testing):** no requirement to inject `LifecycleEngine`. Domain use cases importing application `evaluateLifecycle` (GetStatus/TransitionChange) vs domain `evaluateLifecycleVerdict` (VA/GAI) matches the hop-vs-DAG split in `core:lifecycle-engine` / `core:transition-checks`.

No contradiction found between these four **spec.md** constructor/factory sections and `resolve*Deps` implementations.

---

## Summary counts

| Spec                            | Reqs checked (spec.md `### Requirement`) | Implemented (focus + sampled) | Partial                             | Missing impl | Discrepancies                                  | Missing tests (this batch) |
| ------------------------------- | ---------------------------------------- | ----------------------------- | ----------------------------------- | ------------ | ---------------------------------------------- | -------------------------- |
| `core:get-status`               | 17                                       | 17 focus-aligned              | 0                                   | 0            | 0 high; 1 low (logs / draft wording)           | 1 (drafted `command` null) |
| `core:transition-change`        | 25                                       | 25 focus-aligned              | 0                                   | 0            | 1 medium spec-wrong (verify `LifecycleEngine`) | 0 functional; 1 wording    |
| `core:validate-artifacts`       | 24+ (full spec; 4 focus)                 | Focus 4/4                     | Full VA surface not re-audited here | 0 on focus   | 0 (prior HIGH ctor verify **closed**)          | 1 (composition factory)    |
| `core:get-artifact-instruction` | 9                                        | 9                             | 0                                   | 0            | 0 (prior GAI engine verify **closed**)         | 1 (composition factory)    |

**Totals (this partial):**

- Requirements checked (assigned specs, including non-focus VA headers in preview): **~75**
- Focus contracts verified in code: **all pass**
- Implemented / aligned: **all four use cases + four `resolve*Deps`**
- Partial: **0** on focus
- Missing implementation: **0**
- Discrepancies: **2** (1 medium spec-wrong, 1 low logs/wording); **0 high code-wrong**
- Severity mix: **0 high, 1 medium, 1 low**
- Side: **1 spec-wrong, 0 code-wrong, 1 both (low, optional reading of drafted evaluate)**
- Missing tests called out: **4** (drafted command; two composition smokes; verify rename)

**Prior HIGH disposition:** ValidateArtifacts verify ctor **fixed**; composition `lifecycle: {} as never` **gone**; GetStatus/GAI preview **updated** to functions; TransitionChange pending-gate verify **still** says `LifecycleEngine`.
