# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260829-013719
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state at audit:** designing (`ARTIFACT_DRIFT` / `INCOMPLETE_ARTIFACT`; nextAction `/specd-design`)
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** Reindexed before audit (`filesIndexed: 15` core/cli/skills). `graph stats` after index: `stale: false`, `contentFresh: true` at `2948f1a2`. File-level `graph impact` for many symbols is incomplete (`not_found` / missing use-case callers). **Source claims verified against working-tree files.**
- **Read-only.** Partials in this directory must be kept.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide extras:** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (conformance only). Depth-1 deps noted inside partials.

**Batches:** `_partial-lifecycle-core.md`, `_partial-use-cases.md`, `_partial-archive-hooks.md`, `_partial-cli-skills.md`, `_partial-globals.md`

## Executive summary

Neither spec nor code is assumed true. **Source (TypeScript under `packages/*/src`) matches the change’s focus contract:** checks own hops; no `LifecycleEngine` class; DAG vs hop split; application owns `nextAction.command`.

**Shipped `packages/core/dist` (what the CLI actually runs) is stale.** Live `changes status` still shows `workflow.requires` → `INCOMPLETE_ARTIFACT` for `drifted-pending-review`, and dist still declares/constructs `class LifecycleEngine`. Vitest runs against `src`, so unit tests did not catch this.

### Closed vs prior audit (20260829-010537) — source

| Prior finding                                                           | Now (src / preview)                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH: done/signed-off command `/specd-verify` while hop is `archivable` | **Closed.** Guidance maps to `/specd-archive`.                                                                                                                                                 |
| HIGH: `workflow.requires` always `INCOMPLETE_ARTIFACT`                  | **Closed in src** (status-specific codes + unit tests). **Open in dist/CLI.**                                                                                                                  |
| HIGH: ValidateArtifacts verify ctor `LifecycleEngine`                   | **Closed.** Preview: constructed without; empty `checksByTarget`.                                                                                                                              |
| MEDIUM: leftover `LifecycleEngine` in previews                          | **Mostly closed.** Remaining: schema-format DAG consumer list, transition-checks verify “no check.run”, TransitionChange pending-gate verify THENs, lifecycle-engine verify “Engine …” titles. |
| MEDIUM: domain `LifecycleNextAction.command`                            | **Closed.** Type lives in application `lifecycle-guidance.ts`.                                                                                                                                 |
| MEDIUM: Change auto-gates on `taskCompletionCheck`                      | **Closed.** Aligned with `requiresTaskCompletion`.                                                                                                                                             |
| LOW: drafted CLI JSON leak of `availableTransitions`                    | **Closed** (forced `[]`; tested with Core leak).                                                                                                                                               |
| LOW: composition `lifecycle: {} as never`                               | **Closed.**                                                                                                                                                                                    |
| LOW: dual archive `deps.consistent`                                     | **Still open** (not elevated).                                                                                                                                                                 |
| LOW: Logger `log` vs `info` tests / observability test path             | **Still open.**                                                                                                                                                                                |

### Highest-severity open findings

1. **HIGH — code-wrong (dist vs src):** Rebuild `@specd/core` (and consumers of its dist). Until then CLI evidence is the **old** engine. Source `workflow-requires.ts` maps drift → `ARTIFACT_DRIFT`; dist `chunk-YWV4HXTY.js` still always `INCOMPLETE_ARTIFACT`.
2. **HIGH — code-wrong (dist):** Dist still has `LifecycleEngine` / `LifecycleEngineOptions` / `getLifecycleEngine()`. Source has none. Graph `not_found` is source-index only.
3. **HIGH — spec-wrong (CLI archive):** Preview `cli:change-archive` (and archive skill copy) still say **archivable only**. Core `Change.isArchivable` allows **`archiving`**; CLI does not re-gate. Change deltas did not update the CLI contract.
4. **MEDIUM — spec-wrong:** Leftover `LifecycleEngine` names in schema-format consumers, transition-checks verify, TransitionChange pending-gate verify, lifecycle-engine “Engine” scenario titles.
5. **MEDIUM — code-wrong:** Archive predicates do not fail-fast after `schema.nameMatch` (later I/O still runs).
6. **LOW:** Dual `runDepsConsistent`; overlap I/O before guards; drafted `availableSteps` passthrough; debug logs still say “lifecycle engine”; Logger test gaps.

### Architecture / logging (user constraint)

`default:_global/architecture` preview stays **package-agnostic**. Domain does not import `application/`. Ambient Logger from `observability/` is the documented exception. **0 blocking** vs that constraint.

### What is aligned (source)

- GetStatus / TransitionChange import `evaluateLifecycle`; DAG UCs use `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`.
- All four `resolve*Deps` omit `lifecycle`.
- Schema catch only `SchemaNotFoundError`.
- Draft Core `nextAction.command: null`; CLI drafted JSON forces empty transitions.
- `--next` → Core `to: 'next'` (`HAPPY_PATH_NEXT`).
- Approvals stay in `ready`/`done`.
- Archive operation + `archiveBindings`; hooks `createHookPre` / `createHookPost`.
- Skills: `nextAction.command`, overlap → `/specd-design`, done hop archivable → `/specd-archive`.

## Recommended next steps (not part of this audit)

1. Rebuild core (`pnpm --filter @specd/core build` or workspace build) so CLI matches src.
2. Update `cli:change-archive` (+ archive skill if needed) for `archiving` retry, **or** re-gate CLI to archivable-only.
3. Mechanical leftover `LifecycleEngine` in remaining preview verify/schema-format.
4. Archive `failFastOn: 'schema.nameMatch'` if sequential abort is intended.

---

# Detailed findings (verbatim partials)

---

## Partial file: `_partial-lifecycle-core.md`

# Spec-compliance audit (partial): lifecycle core

- **Mode:** change `workflow-transition-checks`
- **Auditor:** read-only; no spec or source edits
- **Specs (spec-preview, not `specs/` on disk):** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`
- **Depth-1 globals (in the change; previewed):** `default:_global/architecture`, `default:_global/logging`
- **Graph:** `stale: false` (project status `2026-08-28T23:37:14.399Z`). Impact/`LifecycleEngine` used as instructed; incomplete CALLS graphs called out rather than invented.
- **Runtime note:** `node packages/cli/dist/index.js` loads `@specd/core` **`dist/`**, not TypeScript `src/`. Source and dist currently disagree on several lifecycle contracts.

## Graph-first notes

| Query                                                                   | Result                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph search "evaluateLifecycle"`                                      | Exact public binding: `packages/core/src/application/services/lifecycle-evaluation.ts:20`                                                                                                                                                                                     |
| `graph search "evaluateLifecycleVerdict"`                               | Exact: `packages/core/src/domain/services/lifecycle-verdict.ts:142`                                                                                                                                                                                                           |
| `graph search "LifecycleNextAction"`                                    | Exact: `packages/core/src/application/services/lifecycle-guidance.ts:10` (`command` on this type)                                                                                                                                                                             |
| `graph search "projectArtifacts"`                                       | Exact: `lifecycle-verdict.ts:309`                                                                                                                                                                                                                                             |
| `graph search "VALID_TRANSITIONS"`                                      | Exact: `change-state.ts:30`                                                                                                                                                                                                                                                   |
| `graph impact --symbol evaluateLifecycleVerdict --direction dependents` | Direct dependents include `evaluateLifecycle`, `resolveLifecycleNextAction`, tests in `lifecycle-engine.spec.ts`. **Does not list GetStatus / TransitionChange** even though those files import `evaluateLifecycle` (working-tree verified). Treat graph CALLS as incomplete. |
| `graph impact --symbol evaluateLifecycle --direction dependents`        | Returned a noisy, mostly **test-file** dependent list plus a depth-3 hit on `workflow-requires.ts` `code`. **Does not list GetStatus.** Do not invent additional edges.                                                                                                       |
| `graph impact --symbol LifecycleEngine --direction dependents`          | **`error: not_found`**. Indexed **source** has no `LifecycleEngine` class. Dist still does (see discrepancies).                                                                                                                                                               |

Working-tree fallbacks used only where graph said `not_found` or omitted obvious importers.

---

## Prior audit (20260829-010537) — CLOSED vs OPEN

| #   | Prior finding                                                                           | Status now                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH: `done`/`signed-off` `nextAction.command` `/specd-verify` when hop is `archivable` | **CLOSED in source**                                       | `resolveLifecycleCommand` maps `done`/`signed-off` → `/specd-archive` when `nextHop.targetStep === 'archivable'` or `availableTransitions` includes `archivable` (`lifecycle-guidance.ts:74-77`). Domain hop for those states prefers `archivable` (`lifecycle-verdict.ts:926-932`). Tests: `lifecycle-engine.spec.ts:751-768` (done → `/specd-archive`, not implement).                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1b  | Same command when archivable is **blocked**                                             | **CLOSED as specified for “stay on done”**                 | When `archivable` is not available, command is `/specd-verify` (`lifecycle-guidance.ts:74-77`, test `lifecycle-engine.spec.ts:772-821`). Spec projections say happy-path archive, not implement skill; staying on `done` with verify skill is a product choice, not the old “verify while hop is archivable” bug.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | HIGH: `workflow.requires` always `INCOMPLETE_ARTIFACT`                                  | **CLOSED in `src/`; OPEN in shipped `dist/` and live CLI** | Source `requiresFailure` maps `pending-review`→`REVIEW_REQUIRED`, `drifted-pending-review`→`ARTIFACT_DRIFT`, `pending-parent-artifact-review`→`PENDING_PARENT_REVIEW`, else `INCOMPLETE_ARTIFACT` (`workflow-requires.ts:49-74`). Unit tests in `workflow-requires.spec.ts:19-71`. **Live** `changes status workflow-transition-checks` still shows `workflow.requires` fail `INCOMPLETE_ARTIFACT` / `Required artifact 'specs' is 'drifted-pending-review'` for hop `ready`. **`packages/core/dist/chunk-YWV4HXTY.js` `run6` (comment `src/domain/checks/workflow-requires.ts`) still always `fail(..., "INCOMPLETE_ARTIFACT", \`Required artifact '${artifactId}' is '${status}'\`)` at lines 3168-3173.** Mapping exists in source; CLI is not executing that mapping. |
| 3   | MEDIUM: leftover `LifecycleEngine` wording in preview spec/verify                       | **OPEN (spec + barrels + dist)**                           | Preview `core:schema-format` still lists `LifecycleEngine` as a DAG consumer. Preview `core:transition-checks` verify still says `LifecycleEngine.evaluate` must not fall back to `check.run`. Spec title `core:lifecycle-engine` still “Lifecycle Engine”. Source file `lifecycle-engine.ts` is a **re-export barrel** only. **Dist:** `declare class LifecycleEngine` + `LifecycleEngineOptions` in `kernel-CrD0MF05.d.ts:825,922-953`; JS `new LifecycleEngine(...)` at `chunk-YWV4HXTY.js:16459,23084,28229`. Graph `not_found` for the class applies to **source index**, not dist.                                                                                                                                                                                  |
| 4   | MEDIUM: domain owned `LifecycleNextAction.command`                                      | **CLOSED in source**                                       | Domain `LifecycleNextHop` has `targetStep` / `actionType` / `reason` only (`lifecycle-verdict.ts:99-103`). `LifecycleNextAction` extends it with `command` in application (`lifecycle-guidance.ts:9-12`). `evaluateLifecycle` attaches `nextAction` (`lifecycle-evaluation.ts:20-37`). Public export of `LifecycleNextAction` is from application (`public.ts:663-667`).                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | MEDIUM: Change vs workflow-model task gating                                            | **CLOSED (aligned)**                                       | Change: implementing→verifying gated by `workflow.taskCompletion`; `taskCompletionCheck` on an artifact type does **not** by itself gate (`change` preview, Implementation and verification loop). Workflow-model: only `requiresTaskCompletion` content-checks; absent array means no task gating (`workflow-model` Task completion gating). Domain runner skips when `requiresTaskCompletion.length === 0` (`workflow-task-completion.ts:32-37`). `buildSchema` enforces subset-of-`requires` and `hasTasks` (`build-schema.ts:721-736`). Schema-format: `hasTasks` is the capability switch; `requiresTaskCompletion` is when. No auto-gate solely from `taskCompletionCheck`.                                                                                         |
| 6   | Entity archive from `archiving` as well as `archivable`                                 | **CLOSED in source**                                       | `Change.isArchivable` is `state === 'archivable' \|\| state === 'archiving'` (`change.ts:668-671`). `assertArchivable()` uses that getter (`change.ts:1070-1073`). `archive.archivable` check calls `assertArchivable()` (`archive-archivable.ts:18-25`). `VALID_TRANSITIONS.archiving` is `['archivable','designing']` (`change-state.ts:42`). Recovery hop skips `workflow.requires` via `exceptAlong: ['recovery']` (`check-bindings.ts:35-38`; `classifyAlong` `archiving→archivable` → `recovery` at `transition-checks.ts:172-174`).                                                                                                                                                                                                                                |

---

## 1. Requirements Summary

Status is **source working tree** unless marked **dist-stale**. Specs are change **previews**.

### `core:lifecycle-engine`

| Requirement                                                                                                                                                          | Status                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Stateless domain lifecycle verdict (`evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`; no class / `LifecycleEngineOptions`; no `nextHop.command`) | **implemented** in src; **missing** as class-free ABI in **dist**                                              |
| Centralized validation logic (project `CheckResult`s; no I/O; no snapshot bag fallback)                                                                              | **implemented** (src)                                                                                          |
| Effective artifact status / parent-review cascade                                                                                                                    | **implemented** (`effectiveStatus` `lifecycle-verdict.ts:352-406`)                                             |
| Canonical-state-only (ignore display `complete-with-drift` / `hasDrift` as extra states)                                                                             | **implemented** (canonical `artifact.status` only)                                                             |
| Machine-readable blockers (codes including ARTIFACT_DRIFT, REVIEW_REQUIRED, PENDING_PARENT_REVIEW, INCOMPLETE_ARTIFACT for missing/in-progress; no MISSING_ARTIFACT) | **implemented** in src check mapping + projection; **partial** live CLI (codes from stale `workflow.requires`) |
| Available steps / `nextHop` without `command`; no rewrite to pending parking states                                                                                  | **implemented**                                                                                                |
| Archiving escape: `validTransitions` archivable+designing; recovery skips requires; incomplete restore → designing                                                   | **implemented** (src + tests around `lifecycle-engine.spec.ts:825+`)                                           |
| Review summary (overlap → review, not OVERLAP_CONFLICT blocker)                                                                                                      | **implemented** (nextHop overlap branch `lifecycle-verdict.ts:809-814`)                                        |
| Shared consumers: GetStatus/TransitionChange/ValidateArtifacts/GetArtifactInstruction; CompileContext not a hop evaluator                                            | **implemented** (working-tree imports; CompileContext has no `evaluateLifecycle*` import)                      |
| Application lifecycle guidance (`evaluateLifecycle` + `nextAction.command`)                                                                                          | **implemented** (src)                                                                                          |
| Next artifact via `schema.artifactDag().topologicalOrder()`                                                                                                          | **implemented** (`lifecycle-verdict.ts:750-771`)                                                               |

### `core:transition-checks`

| Requirement                                                                                                                                               | Status                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Check identity, gerund `label`, outcomes, no `archive.publication` CheckId                                                                                | **implemented** (no `archive.publication` in src; archive bindings omit it `check-bindings.ts:84-94`) |
| Check ABI: `WorkflowCheck`, `create*`, domain `run` + stub `execute`, no `PredicateSnapshots` / `gatherPredicateSnapshots`                                | **implemented** (those types/functions absent from `packages/core/src`)                               |
| One file per check id; kind on class; applicability on bindings                                                                                           | **implemented**                                                                                       |
| `from`/`to`/`along`; AXIS_FALLBACK splice; redesign/recovery                                                                                              | **implemented** (`AXIS_FALLBACK` `transition-checks.ts:107-114`; `classifyAlong` `167-204`)           |
| Archive is operation not edge; `approval.signoff` not on archive                                                                                          | **implemented** (archive specs vs transition specs)                                                   |
| Effect `phase` / `onFailure`; hooks not selected by `check.id === hook.pre` in the matcher table                                                          | **implemented** at binding level (use-case loop not fully re-audited here)                            |
| Predicates vs effects; skip-hooks skips effects only                                                                                                      | **implemented** (spec+bindings; TransitionChange not fully walked)                                    |
| Evaluation of an attempt (protocol fail-fast on TransitionChange vs collect on GetStatus; no pending routing)                                             | **partial** (architecture present; execute-path fail-fast not line-audited in this batch)             |
| Registry: impl checks forward-exit implementing only; approval.spec on ready→forward                                                                      | **implemented** (`check-bindings.ts:46-64`)                                                           |
| Projections: tasks hide verifying; complete tasks → `/specd-verify`; spec gate → approve command; done lists backward hops but nextAction archive/signoff | **implemented** in guidance + tests                                                                   |
| No snapshot bag; one binding table; TransitionChange `check.execute` for effects                                                                          | **implemented** for bag/table; effect launch not fully re-audited                                     |
| Actionable `deps.consistent` / compact impl messages                                                                                                      | **not fully verified** in this batch (out of assigned file set except bindings)                       |
| Generic check progress bus                                                                                                                                | **not fully verified** in this batch                                                                  |

### `core:change` (lifecycle-relevant subset)

| Requirement                                                                                                                                | Status                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Lifecycle states + `VALID_TRANSITIONS` (ready/done stay; no new pending parking; skill backward hops; archiving only archivable/designing) | **implemented** (`change-state.ts:30-43`)                                            |
| Skill-aligned backward hops (entity still rejects unknown pairs)                                                                           | **implemented** (table includes done/signed-off/archivable → implementing/verifying) |
| Archiving escape transitions                                                                                                               | **implemented**                                                                      |
| Implementation/verification loop + taskCompletion vs `taskCompletionCheck`                                                                 | **implemented** (aligned with workflow-model)                                        |
| Spec/signoff gates in-place (stay ready/done)                                                                                              | **implemented** at protocol table; checks `approval.spec`/`approval.signoff`         |
| Artifacts: persistable states; `pending-parent-artifact-review` engine-only                                                                | **implemented** (entity vs `projectArtifacts`)                                       |
| Lifecycle interpretation authority on verdict functions not entity                                                                         | **implemented**                                                                      |
| `isArchivable` includes `archiving`                                                                                                        | **implemented**                                                                      |

Other Change requirements (identity, history, invalidation policy, drafts, etc.) were not exhaustively re-proven; no contradiction found in the lifecycle slices above.

### `core:workflow-model`

| Requirement                                                                    | Status                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Step names lookup onto ChangeState; omit ≠ delete protocol                     | **implemented**                                                                          |
| Step semantics (designing/implementing/verifying/archiving; drift → designing) | **implemented** as documentation + routing (skills/CLI not in this batch)                |
| Requires-based gating as `workflow.requires` shared by status and execute      | **implemented** in src; **dist-stale** fail **codes**                                    |
| Task completion gating via `requiresTaskCompletion` + CountTasks composition   | **implemented** (`createWorkflowTaskCompletion`)                                         |
| Availability from verdict projections; CompileContext must not evaluate hops   | **implemented** (CompileContext: no evaluate import)                                     |
| Workflow array order = display + axis                                          | **implemented** (`buildAxis`)                                                            |
| Step name IS state name                                                        | **implemented**                                                                          |
| Hooks at boundaries; two execution modes                                       | **partial** (bindings match; ArchiveChange/TransitionChange hook slots not fully walked) |
| Requires are artifact IDs                                                      | **implemented** (schema validation)                                                      |

### `core:schema-format` (lifecycle-relevant)

| Requirement                                                                          | Status                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `workflow[]` extras; `requiresTaskCompletion` + `hasTasks` invariant                 | **implemented** (`buildSchema`)                                                            |
| `artifactDag()` canonical API; next-artifact uses it                                 | **implemented**                                                                            |
| Canonical DAG consumers must not rebuild graphs; list includes **`LifecycleEngine`** | **spec leftover** (name) vs **code** using `evaluateLifecycleVerdict` / `projectArtifacts` |
| `taskCompletionCheck` + `hasTasks` master switch                                     | **implemented** (capability vs when)                                                       |
| Preview verify scenarios still say `evaluateLifecycle` for hop blocking              | **consistent** with application layer (not architecture violation)                         |

### `default:_global/architecture`

| Requirement                                                                                             | Status                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Package-agnostic: no `evaluateLifecycle`, no `packages/core/...`, no `LifecycleEngine` in **this** spec | **implemented** (preview is clean)                                                                                        |
| Domain must not import `application/`                                                                   | **implemented** for `packages/core/src/domain` (no `application/` imports found)                                          |
| Ambient Logger exception                                                                                | **implemented** (`lifecycle-verdict.ts` imports `observability/logger.js`; architecture + logging previews document this) |
| Stateless domain services as functions                                                                  | **implemented** in src (`evaluateLifecycleVerdict`); **violated in dist** (`class LifecycleEngine`)                       |
| Inner never imports outer                                                                               | **implemented** for audited domain lifecycle modules                                                                      |

### `default:_global/logging`

| Requirement                                                             | Status                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Console-compatible Logger; ambient; no-op until wired; not control flow | **implemented** (verdict uses `Logger.debug` diagnostics only, `lifecycle-verdict.ts:273-284,396-401`) |

---

## 2. Implementation Status (file:line evidence)

### Domain vs application split

- Domain functions: `evaluateLifecycleVerdict` `lifecycle-verdict.ts:142-300`; `projectArtifacts` `:309-324`; `findBlockingParent` `:326-332`; `resolveLifecycleNextHop` `:801-984`; `LifecycleNextHop` **without** `command` `:99-103`.
- Application: `evaluateLifecycle` `lifecycle-evaluation.ts:20-37`; `LifecycleNextAction.command` `lifecycle-guidance.ts:9-12`; `resolveLifecycleCommand` `:17-106` including done/signed-off → `/specd-archive` `:74-77`, archivable `:80-81`, archiving retry `specd change archive` vs design on failed restore `:84-95`.
- Barrel (not a class): `lifecycle-engine.ts:1-18` re-exports verdict symbols. `public.ts:662` still imports types from `./domain/services/lifecycle-engine.js`.
- Logger: `lifecycle-verdict.ts:13` `import { Logger } from '../../observability/logger.js'`.

### Protocol and archive

- `VALID_TRANSITIONS` `change-state.ts:30-43` (`archiving: ['archivable', 'designing']`; `done` includes `archivable`, `implementing`, `verifying`).
- Entity archive eligibility: `change.ts:668-671`, `1070-1073`.
- Recovery: `classifyAlong` `transition-checks.ts:172-174`; `exceptAlong: ['recovery']` on requires/taskCompletion `check-bindings.ts:35-45`.

### Requires / tasks

- Source mapping: `workflow-requires.ts:49-74`.
- Dist mapping (stale): `packages/core/dist/chunk-YWV4HXTY.js:3150-3173` always `INCOMPLETE_ARTIFACT`.
- Application execute path uses domain `run`: `application/checks/workflow-requires.ts:39-49`.
- Task gating: `workflow-task-completion.ts:31-37`; CountTasks in `application/checks/workflow-task-completion.ts:54-73`.
- Schema: `build-schema.ts:721-736`.

### Consumers (working tree; graph omitted some)

- `GetStatus` → `evaluateLifecycle` `get-status.ts:18,481`.
- `TransitionChange` → `evaluateLifecycle` `transition-change.ts:14,219`.
- `ValidateArtifacts` → `evaluateLifecycleVerdict` with `checksByTarget: {}` `validate-artifacts.ts:220-222`.
- `GetArtifactInstruction` → `evaluateLifecycleVerdict` `get-artifact-instruction.ts:15,97`.
- `CompileContext`: no `evaluateLifecycle` / `evaluateLifecycleVerdict` import.

### Dist still constructing `LifecycleEngine`

- `packages/core/dist/chunk-YWV4HXTY.js:16457-16460` `getLifecycleEngine()` → `new LifecycleEngine(Logger.debug.bind(Logger))`.
- Additional constructors at `:23084`, `:28229`.
- Types: `packages/core/dist/kernel-CrD0MF05.d.ts:825` `LifecycleEngineOptions`; `:922` `declare class LifecycleEngine`.
- Source composition: **no** `LifecycleEngine` / `getLifecycleEngine` under `packages/core/src`.

### Live CLI vs source (this change)

`changes status workflow-transition-checks` (CLI dist):

- Top-level `blockers[0].code` **ARTIFACT_DRIFT** (review projection).
- `checksByTarget.ready` `workflow.requires` **INCOMPLETE_ARTIFACT** with message interpolating `'drifted-pending-review'` — matches **dist** `run6`, not source `requiresFailure`.
- `nextAction.command` `/specd-design` because `review.required` (guidance `:26-28`) — consistent with both layers.

---

## 3. Discrepancies

### D1 — HIGH — `code-wrong` (shipped dist / live CLI) vs `src` matching spec

**What:** Preview `core:lifecycle-engine` / `core:transition-checks` require `workflow.requires` fail codes by effective status. Source implements that. **Published core dist and therefore `node packages/cli/dist/index.js` do not.**

**Evidence:** source `workflow-requires.ts:53-74`; dist `chunk-YWV4HXTY.js:3168-3173`; live status `INCOMPLETE_ARTIFACT` + `Required artifact 'specs' is 'drifted-pending-review'`.

**Options:** (a) rebuild `@specd/core` (and CLI/SDK if they pin old chunks) so dist matches src; (b) treat dist as SoT and revert src mapping (would re-open the prior HIGH against the preview spec).

### D2 — HIGH — `code-wrong` (dist) / `spec-ok` (src): `LifecycleEngine` class still in dist

**What:** User-enforced and preview lifecycle-engine: there MUST NOT be a `LifecycleEngine` class, `@deprecated` shim, or `LifecycleEngineOptions`. Graph `not_found` on source. Dist still declares and constructs the class (debug port `Logger.debug.bind(Logger)`).

**Evidence:** `kernel-CrD0MF05.d.ts:825,922-925`; `chunk-YWV4HXTY.js:16459`. Source: no class.

**Options:** (a) rebuild dist from current src; (b) if some host still needs the class, that contradicts the preview spec — change the spec, do not keep a silent shim in dist only.

### D3 — MEDIUM — `spec-wrong` (leftover names) while code moved on

**What:** Preview artifacts still name `LifecycleEngine` as if it were the runtime type.

**Evidence:**

- `core:schema-format` Canonical artifact DAG derivation: consumer list includes `LifecycleEngine`.
- `core:transition-checks` verify “No shared snapshot bag”: `LifecycleEngine.evaluate` does not fall back to `check.run`.
- Spec id/title `core:lifecycle-engine` / heading “Lifecycle Engine”.
- Verify `core:lifecycle-engine` still titles “Engine unifies…” / “when `evaluateLifecycle` runs” mixed with `evaluateLifecycleVerdict`.

**Options:** (a) retitle/reword previews to `evaluateLifecycleVerdict` / `evaluateLifecycle`; (b) keep the historical spec id and only fix body/verify; (c) leave names if product wants the old capability id (weaker consistency with architecture “no LifecycleEngine”).

### D4 — LOW — `both`: barrel and test filenames still say `lifecycle-engine`

**Evidence:** `packages/core/src/domain/services/lifecycle-engine.ts`; `packages/core/test/domain/services/lifecycle-engine.spec.ts`; `public.ts:662` import path.

**Options:** rename to `lifecycle-verdict` re-exports only; or keep path for git history.

### D5 — LOW — `spec-wrong`: schema-format DAG consumer list is package-specific and stale

**What:** Global architecture is correctly package-agnostic. `core:schema-format` still lists concrete use cases **and** `LifecycleEngine`.

**Options:** replace with “lifecycle verdict / `projectArtifacts`”; keep use-case names if they remain true.

### D6 — MEDIUM — `spec-wrong` vs `code-ok`: `core:lifecycle-engine` verify still uses “Engine” scenarios

**Evidence:** preview verify “Engine unifies three validation dimensions”, “Engine projects CheckResults”.

**Options:** rename scenarios to verdict/evaluateLifecycle.

### D7 — LOW — graph incompleteness (not a product bug)

**What:** `graph impact evaluateLifecycle` / `evaluateLifecycleVerdict` miss `GetStatus` and `TransitionChange` despite direct imports.

**Options:** reindex/improve CALLS; auditors must use working-tree for use-case wiring.

### D8 — not a discrepancy (closed): domain `command`

Domain `LifecycleNextHop` has no `command`. Application owns `LifecycleNextAction.command`.

### D9 — not a discrepancy (closed): architecture globals

Preview `default:_global/architecture` has no `evaluateLifecycle`, no `packages/core` paths, no `LifecycleEngine`. Domain→application imports: none found under `packages/core/src/domain`.

### D10 — partial / not fully scored: transition-checks progress bus, hook execute loops, deps.consistent message text

Would need GetStatus/TransitionChange/ArchiveChange line-by-line (other batches). Bindings and classifyAlong match the preview for the registry/axis/recovery slices.

---

## 4. Test Coverage / Missing Tests

| Area                                                             | Coverage                                                                          | Gap                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow.requires` fail codes                                   | `workflow-requires.spec.ts` maps all four statuses                                | **No integration test** that `GetStatus`/`changes status` emits `ARTIFACT_DRIFT` on `workflow.requires` (would have caught dist drift) |
| done → `/specd-archive`                                          | `lifecycle-engine.spec.ts:751-768`                                                | None for this bug in src                                                                                                               |
| done + blocked archivable → `/specd-verify`                      | `:772-821`                                                                        | Documented product behavior; not the old HIGH                                                                                          |
| archivable → `/specd-archive`                                    | `:658-692`                                                                        | —                                                                                                                                      |
| archiving recovery vs requires                                   | `:825+`                                                                           | —                                                                                                                                      |
| `LifecycleEngine` class absence                                  | verify scenario “No LifecycleEngine class”; tests call `evaluateLifecycle` helper | **No test that dist/public d.ts does not export the class**                                                                            |
| `requiresTaskCompletion` absent vs `taskCompletionCheck` present | workflow-model scenarios; domain skip when array empty                            | Confirm `build-schema` tests exist (not opened here)                                                                                   |
| CompileContext must not call evaluate                            | no import                                                                         | **No explicit regression test** “CompileContext does not import evaluateLifecycle\*”                                                   |
| Live CLI vs unit                                                 | unit tests run against **src** via Vitest                                         | **dist/CLI not in the same loop**                                                                                                      |

---

## 5. Spec Dependency Chain

| Edge                                                            | Issue                                                                                                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core:lifecycle-engine` → `default:_global/architecture`        | Preview engine spec is package-specific (paths like `domain/services/lifecycle-verdict.ts`). Architecture remains agnostic. **Allowed** (core spec vs global). |
| `core:lifecycle-engine` → `default:_global/logging`             | Domain `Logger.debug` matches ambient exception.                                                                                                               |
| `core:lifecycle-engine` → `core:transition-checks`              | Shared check ids and projections; leftover `LifecycleEngine.evaluate` in **transition-checks verify** contradicts lifecycle-engine “no class”.                 |
| `core:lifecycle-engine` → `core:change` / `core:workflow-model` | Task gating aligned. Archive from `archiving` aligned (`isArchivable`).                                                                                        |
| `core:schema-format` → DAG + `LifecycleEngine` consumer         | **Breaks** the “no LifecycleEngine” rule in a **core** spec (not in global architecture).                                                                      |
| `core:schema-format` verify → `evaluateLifecycle`               | Fine (application).                                                                                                                                            |
| `core:workflow-model` → `core:transition-checks`                | `workflow.requires` / `workflow.taskCompletion` as shared evaluation: **src yes, dist codes no**.                                                              |
| `core:change` “engine-derived” `pending-parent-artifact-review` | Wording still says “engine”; means `projectArtifacts` — cosmetic.                                                                                              |
| Graph COVERS_SYMBOL                                             | `project status` `COVERS_SYMBOL: 0` — specs not linked to symbols in the index; impact cannot prove coverage.                                                  |

---

## 6. Counts

| Metric                                                                                                       | Count                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Requirements checked (named ### Requirement blocks + user-enforced architecture bullets + prior-audit items) | **68**                                                                                             |
| Implemented (src matches preview)                                                                            | **54**                                                                                             |
| Partial (src ok / dist wrong, or use-case path not fully walked)                                             | **9**                                                                                              |
| Missing (src)                                                                                                | **0** for assigned functional splits; **dist still missing** class-free + mapped requires          |
| Discrepancies HIGH                                                                                           | **2** (D1 dist requires codes; D2 dist LifecycleEngine class)                                      |
| Discrepancies MEDIUM                                                                                         | **2** (D3 leftover spec names; D6 verify “Engine” wording)                                         |
| Discrepancies LOW                                                                                            | **3** (D4 filenames; D5 schema-format consumer list; D7 graph)                                     |
| Test gaps (material)                                                                                         | **4** (GetStatus/CLI code mapping; dist class export; CompileContext import guard; dist vs vitest) |

**Neither spec nor code assumed true:** source largely matches the **preview** specs for the assigned lifecycle split; **shipped dist and live CLI** still implement the **previous** `workflow.requires` and `LifecycleEngine` class. Rebuild is required before treating CLI `changes status` as evidence that source is wrong.

---

## Partial file: `_partial-use-cases.md`

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

---

## Partial file: `_partial-archive-hooks.md`

# Spec-compliance partial: archive, hooks, approvals, storage, config

- **Mode:** change `workflow-transition-checks`
- **Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:storage`, `core:config`
- **Sources:** `specd changes spec-preview workflow-transition-checks <specId>` (spec.md + verify.md); graph index `stale: false` (`2948f1a2`); application/domain/composition under `packages/core`
- **Read-only:** no spec or source files were modified
- **Architecture checks:** domain has no `application/` imports; no `class LifecycleEngine`; DAG cascade is `projectArtifacts` + module-local `effectiveStatus` in `lifecycle-verdict.ts`; no `Change.effectiveStatus()`

---

## Requirements Summary

### `core:archive-change`

Archive is an **operation** (`scope: 'archive'`), not a lifecycle hop. Constructor takes `archiveBindings` (`readonly CheckBinding[]`) and **must not** take `RunStepHooks` / `HookRunner` / `projectWorkflowHooks`. Composition: `resolveArchiveChangeDeps` pulls `archiveBindings` from `resolveWorkflowCheckRegistry`; `ArchiveChangeDeps` has no `runStepHooks`.

Guards: `schema.nameMatch` then `archive.archivable` via `assertArchivable()` for **`archivable` and `archiving`** (retry after failed commit). Overlap (`spec.overlap`, skippable `allowOverlap`) and `workspace.readOnly` (same runner as enter-`ready`) before effects. Effects: `matchingEffects(..., 'before-persist')` then persist/publish; `after-persist` for `hook.post` (`collect`). Pre-hooks use workflow step `archiving` while lifecycle state may still be `archivable`. Deferred `transition('archiving')` inside `mutate` after full-batch preflight and snapshots, skipped if already `archiving`. Merge-extract is the sealed-set `deps.consistent` guard in preflight (`runDepsConsistent` → `ArchiveDependencyMismatchError`). Remaining publication checks stay inside the use case, not as `archive.publication` on the table. Config factory delegates through `resolveArchiveChangeDeps`.

### `core:hook-execution-model`

Two hook kinds: `instruction:` (passive, `GetHookInstructions` only) vs `run:` (`HookRunner` / `RunStepHooks`). `TransitionChange` / `ArchiveChange` auto-execute matching **effects** after predicates; slot and `onFailure` come from **bindings**, not check-id branches. `RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost`, not of the lifecycle use cases. Skip via `skipHookPhases` selectors (`target.pre` / `source.post` / archive `pre`/`post` / `all`), **not** `binding.phase` alone (transition `hook.pre` and `hook.post` both `before-persist`). Archive post: `collect` / `after-persist`. Change entity does not run hooks. Template tokens: no `{{change.workspace}}`.

### `core:approve-spec` / `core:approve-signoff`

Gates baked at construction (`ApprovalGates`). Happy path: record history in **`ready` / `done`**, do **not** hop to `pending-*` or `spec-approved` / `signed-off`. Drain from `pending-spec-approval` / `pending-signoff` still transitions. Hashes from disk + schema cleanup; persist via `mutate`. Config factories go through `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`. Bindings: `approval.spec` `from=ready`; `approval.signoff` `from=done` (not archive).

### `core:storage` (change-relevant slice)

Artifact `requires` cascade owned by **`projectArtifacts` / `effectiveStatus`** (see `core:lifecycle-engine` as the verdict module, **not** `LifecycleEngine.projectArtifacts`). **No** `Change.effectiveStatus()`. Load-time file statuses from hashes; rewrite wire `pending-parent-artifact-review` → `in-progress`; `ArtifactFile` rejects that token in memory; DAG may still **report** `pending-parent-artifact-review`. Rest of storage (indexes, archive pattern, locks, staged archive) is background for this change.

### `core:config` (change-relevant slice)

`approvals.spec` / `approvals.signoff` default false. When true: in-place consent on **`ready` / `done`**; no happy-path hops into pending states; drain remains legal. Spec dependency: `core:transition-checks` for in-place checks.

---

## Implementation Status

| Requirement area                         | Status          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hook factories, no factory barrel        | **Implemented** | `application/checks/hook-pre.ts` (`createHookPre`), `hook-post.ts` (`createHookPost`). Shared **class** `HookEffectCheck` in `hook-effect-shared.ts` (not `hook-effect.ts`, not a re-export barrel). Registry: `createWorkflowCheckRegistry` wires both via `RunStepHooks`.                                                                                                                                          |
| Archive bindings, not RunStepHooks on UC | **Implemented** | `ArchiveChange` ctor `archiveBindings` (`archive-change.ts:222–248`). Composition `archiveBindings: registry.archiveBindings`; no `runStepHooks` on `ArchiveChangeDeps`. Test: `'runStepHooks' in uc` is false.                                                                                                                                                                                                      |
| Archive = operation, not hop             | **Implemented** | `ARCHIVE_BINDING_SPECS` all `scope: 'archive'` (`check-bindings.ts:84–94`). `archiveAttempt = { scope: 'archive' }`. `approval.signoff` is transition `done → archivable` only, not archive.                                                                                                                                                                                                                         |
| Archivable **and** archiving             | **Implemented** | `Change.isArchivable`: `archivable \|\| archiving` (`change.ts:669–671`). `assertArchivable` uses that getter. Mutate: `transition('archiving')` only if not already `archiving` (`archive-change.ts:409–413`). Domain tests: `change.spec.ts` both states.                                                                                                                                                          |
| Effect selection by binding phase        | **Implemented** | `matchingEffects` filters `isEffectCheck` + `binding.phase` + `bindingMatches` (`execute-hook-effect.ts`). Archive: `before-persist` then `after-persist`. No `check.id === 'hook.pre'` in the use-case loop.                                                                                                                                                                                                        |
| Skip selectors not phase-alone           | **Implemented** | `HookEffectCheck.execute`: `all` / archive `pre`/`post` / transition `target.pre`/`source.post` (`hook-effect-shared.ts:131–147`).                                                                                                                                                                                                                                                                                   |
| onFailure abort vs collect               | **Implemented** | `hookFailureMode`; archive post `onFailure: 'collect'`; transition hooks `abort`/`before-persist`. Fail-fast throws `HookFailedError`; collect fills `postHookFailures`.                                                                                                                                                                                                                                             |
| Predicates then effects                  | **Implemented** | `executeMatchingPredicates` then `matchingEffects(..., 'before-persist')`. Predicates include schema, archivable, overlap, readOnly, deps, impl.                                                                                                                                                                                                                                                                     |
| Same runners as ready / implementing     | **Implemented** | `createDepsConsistent` / `createWorkspaceReadOnly` shared; archive persisted map from `loadArchiveSealedDependsOnBySpecId`. Impl checks on archive bindings.                                                                                                                                                                                                                                                         |
| Merge-extract deps guard                 | **Implemented** | `_assertArchiveDepsConsistent` → `runDepsConsistent` after publication preflight (`archive-change.ts:784, 1127–1154`).                                                                                                                                                                                                                                                                                               |
| Approve stay in ready/done               | **Implemented** | `ApproveSpec` / `ApproveSignoff`: `recordSpecApproval` / `recordSignoff`; transition only if pending drain. `boundFromStates('approval.spec'\|'approval.signoff')`. Tests: stay `ready`/`done`.                                                                                                                                                                                                                      |
| Approve factories                        | **Implemented** | `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` pass `resolver.config.approvals`; config form delegates to deps form.                                                                                                                                                                                                                                                                                         |
| Config approvals wording                 | **Implemented** | Preview: stay in `ready`/`done`; no happy-path pending hops. Loader: `approvals: { spec, signoff }` required booleans on resolved config.                                                                                                                                                                                                                                                                            |
| Storage DAG naming                       | **Implemented** | Preview: `projectArtifacts` / `effectiveStatus`, no `Change.effectiveStatus()`. Code: `projectArtifacts` in `lifecycle-verdict.ts:309`; `effectiveStatus` is a **function** in the same file, not a Change method. `lifecycle-engine.ts` re-exports only. Fs rewrite `pending-parent-artifact-review` → `in-progress` (`change-repository.ts:1422–1424`); `ArtifactFile` rejects persist (`artifact-file.ts:52–54`). |
| Domain / engine architecture             | **Implemented** | No domain→application imports. No `class LifecycleEngine`.                                                                                                                                                                                                                                                                                                                                                           |
| Instruction vs run                       | **Implemented** | `RunStepHooks` filters instruction; `GetHookInstructions` for text. `hookStep` archive → `'archiving'`.                                                                                                                                                                                                                                                                                                              |
| Overlap I/O vs guard order               | **Partial**     | Detection runs **before** predicate loop (`list` + `detectSpecOverlap` at `archive-change.ts:277–288`). Throw only after `spec.overlap` fails. Extra I/O on schema/state failure.                                                                                                                                                                                                                                    |
| Predicate fail-fast after schema         | **Partial**     | `executeMatchingPredicates` without `failFast` (`archive-change.ts:293–304`). Later predicates (including I/O-backed `deps.consistent`) still execute after `schema.nameMatch` fail. Spec: name match **before** archivable / hooks / file mods.                                                                                                                                                                     |

---

## Discrepancies

### 1. medium | code-wrong | Archive predicates do not fail-fast after `schema.nameMatch`

- **Spec:** Schema name guard MUST run before the archivable guard, hooks, or file modifications. Predicates are evaluated in registry order (`schema.nameMatch`, `archive.archivable`, …).
- **Code:** `ArchiveChange.execute` calls `executeMatchingPredicates` with **default options** (no `failFast` / `failFastOn`). The helper only stops early when those flags are set (`execute-matching-predicates.ts:143–147`). `TransitionChange` uses `{ failFastOn: 'protocol.edge' }`; archive does not.
- **Code-wrong:** After a schema mismatch result, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, and impl predicates still `execute`. `deps.consistent` performs extract/lock I/O. `throwMappedArchiveFailure` later maps the **first** failed check in the collected list, so the user still sees `SchemaMismatchError` if nameMatch failed first — but work already ran.
- **Spec-wrong alternative:** Spec could explicitly require collecting all archive predicate results for progress UI. Unlikely: “before the archivable guard” is sequential abort language.
- **Fix (if code):** `{ failFast: true }` or `failFastOn: 'schema.nameMatch'` on the archive call.

### 2. low | both | Dual `runDepsConsistent` (registry predicate + post-hook preflight)

- **Spec:** Registry includes archive `deps.consistent` (sealed persisted set, same runner as enter-`ready`). Separately: “Merge extraction is the `deps.consistent` guard against the sealed set.” Mismatch SHALL throw `ArchiveDependencyMismatchError` via `deps.consistent`.
- **Code:** (1) `createDepsConsistent` in the predicate loop **before** hooks (`deps-consistent.ts:59–68` + `ARCHIVE_BINDING_SPECS`). (2) `_assertArchiveDepsConsistent` **after** pre-hooks during `_prepareArchivePreflight` (`archive-change.ts:784`).
- **Both:** The change spec describes two slots with different fact sources (sidecar/lock vs merge-extract). Code faithfully dual-runs `runDepsConsistent`. Prior LOW stands: operators/tests can hit the runner twice; spec does not say “exactly once after pre-hooks.”
- **Fix (if spec):** Name “early sealed-set predicate” vs “merge-extract confirmation” as two requirements. **Fix (if code):** Drop one slot if product intent is a single guard.

### 3. low | code-wrong | Overlap scan before schema/archivable predicates

- **Spec:** Overlap after the archivable guard and before pre-archive hooks.
- **Code:** `ChangeRepository.list` + per-change `get` + `detectSpecOverlap` **before** `executeMatchingPredicates` (`archive-change.ts:277–304`). Side effects (invalidation) still wait for `allowOverlap` after predicates pass.
- **Code-wrong:** Unnecessary listing on non-archivable / schema-mismatch changes.
- **Spec-wrong alternative:** Spec could allow prefetching overlap for progress. Current text is sequential.

### 4. low | spec-wrong | Stale “archivable-only” comments vs entity + change spec

- **Change spec / verify:** `assertArchivable()` MUST pass for `archivable` **or** `archiving`.
- **Code:** Getter and tests are correct (`change.ts:669–671`, `change.spec.ts`).
- **Spec-wrong (docs in code):** `assertArchivable` JSDoc still says “in `archivable` state” (`change.ts:1066–1068`). `ArchiveChange.execute` `@throws` still says “not in `archivable` state” (`archive-change.ts:261`). Class purpose comment still “Gated on `archivable` state” (`archive-change.ts:187–188`). Preview **Purpose** line also says “gated on `archivable` state” while Requirements include `archiving`.

### 5. low | spec-wrong | Approve hash-then-mutate wording vs serialized hashes

- **Spec:** Compute hashes, **then** `mutate`; inside mutate, record on the fresh change.
- **Code:** Hashes computed **inside** the mutate callback on `freshChange` (`approve-spec.ts:91–99`, same for signoff). Safer under concurrent writes.
- **Spec-wrong:** Sequence “after computing hashes, MUST record through mutate” implies a pre-lock hash of the first loaded entity. Drain/ready behavior still matches.

**Resolved vs prior audits (not counted as open):**

- `LifecycleEngine.projectArtifacts` in storage preview: **gone**. Current text is `projectArtifacts` / `effectiveStatus` and “no `Change.effectiveStatus()`”.
- `hook-effect.ts` factory barrel: **gone**. Factories are `hook-pre.ts` / `hook-post.ts`.
- Approvals happy-path pending hops: **code and config preview** keep `ready`/`done`.

---

## Test Coverage

| Area                                        | Coverage                          | Notes                                                                                             |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Archive skip `all` / `pre` / `post`         | **Adequate**                      | `archive-change.spec.ts` (~1837–2017); step `'archiving'` for RunStepHooks.                       |
| Archive no RunStepHooks on instance         | **Adequate**                      | ~180–181.                                                                                         |
| Pre/post hook step + phase                  | **Adequate**                      | ~2791–2836.                                                                                       |
| Deferred archiving mutate                   | **Adequate**                      | ~2963–3017.                                                                                       |
| Batch restore / stay archiving              | **Adequate**                      | `archive-change-batch-restore.spec.ts`.                                                           |
| `deps.consistent` mismatch no publish       | **Partial**                       | Spy on `runDepsConsistent` exists (~991) but does not assert **call count** (dual-run).           |
| Hook factories + RunStepHooks               | **Adequate**                      | `workflow-check-factories.spec.ts` (`createHookPre` execute, `createHookPost` kind).              |
| Instruction skip / GetHookInstructions      | **Adequate**                      | `run-step-hooks.spec.ts`, `get-hook-instructions.spec.ts`.                                        |
| Transition hook skip / abort before persist | **Adequate**                      | `transition-change.spec.ts` (out of this file’s primary UC but required by hook-execution-model). |
| Approve ready/done + drain + gate off       | **Adequate**                      | `approve-spec.spec.ts`, `approve-signoff.spec.ts` (no `get` when gate disabled).                  |
| Approve composition factory                 | **Partial**                       | Instance from config/deps; **no** assertion that `resolveApproveSpecDeps` ran.                    |
| Archive composition factory                 | **Partial**                       | Same pattern; no `resolveArchiveChangeDeps` spy.                                                  |
| `assertArchivable` both states              | **Adequate**                      | `change.spec.ts`.                                                                                 |
| Archive **execute** starting in `archiving` | **Missing**                       | No `archive-change.spec.ts` success path from `archiving`.                                        |
| Storage DAG / wire rewrite                  | **Adequate**                      | `lifecycle-engine.spec.ts`, `change-repository.spec.ts`, `artifact-file.spec.ts`.                 |
| Config approvals defaults                   | **Out of this file’s test sweep** | Covered by config package tests historically; preview scenarios exist in `core:config` verify.    |

---

## Missing Tests

1. **`ArchiveChange.execute` when the change is already `archiving`** — preflight, skip second `transition('archiving')`, complete archive (spec retry). Entity-level `assertArchivable` is not enough.
2. **`failFast` after `schema.nameMatch`** — subsequent archive predicates (especially `deps.consistent`) must not run.
3. **`runDepsConsistent` call count / phase** — document whether 1 vs 2 invocations is required (ties to discrepancy 2).
4. **Composition:** `createApproveSpec(config)` / `createApproveSignoff(config)` / `createArchiveChange(config)` invoke `resolve*Deps` (verify.md factory scenarios). Current tests only check `instanceof`.
5. **Negative guard:** no `application/checks/hook-effect.ts` barrel (optional documentation test).
6. **Overlap not listed** when schema mismatch / not archivable (if discrepancy 3 is treated as a bug).

---

## Spec Dependency Chain

```
core:archive-change
  → core:change, schema-format, composition, kernel, composition-resolver,
    transition-checks (archiveBindings / operation archive),
    hook-execution-model (effects),
    (impl / deps / workspace checks shared with enter-ready / exit-implementing)

core:hook-execution-model
  → core:transition-checks, schema-format, template-variables, change
  → TransitionChange + ArchiveChange + RunStepHooks + GetHookInstructions

core:approve-spec
  → core:change, schema-format, composition, kernel, composition-resolver,
    transition-checks (approval.spec from states)

core:approve-signoff
  → same pattern, approval.signoff from states

core:storage (delta)
  → core:lifecycle-engine (projectArtifacts / effectiveStatus),
    core:schema-format, core:change-manifest, core:change

core:config (delta)
  → core:transition-checks (in-place approval checks, not pending hops)
```

Direct depth-1 consistency: change specs match global architecture (no domain→application; no LifecycleEngine class; storage names `projectArtifacts`). Config approvals align with ApproveSpec/Signoff stay-in-place. Archive `approval.signoff` is **not** bound on the archive operation (only `done → archivable` transition) — consistent with “archive is not a hop.”

---

## Counts

| Metric                                                                              | Count               |
| ----------------------------------------------------------------------------------- | ------------------- |
| Specs in this partial                                                               | 6                   |
| Requirements reviewed (grouped rows in Implementation Status)                       | 18                  |
| Implemented                                                                         | 14                  |
| Partial                                                                             | 4                   |
| Missing / not implemented                                                           | 0                   |
| Discrepancies                                                                       | 5 (1 medium, 4 low) |
| Blame: code-wrong                                                                   | 2 (plus 1 both)     |
| Blame: spec-wrong                                                                   | 2 (plus 1 both)     |
| Blame: both                                                                         | 1                   |
| Missing test items                                                                  | 6                   |
| Architecture violations (domain→app, LifecycleEngine class, Change.effectiveStatus) | **0**               |

**Prior LOW (dual `deps.consistent` after archive pre-hooks):** still open as discrepancy 2; not elevated.

**Prior medium (`LifecycleEngine.projectArtifacts` in storage spec):** **closed** in current spec-preview.

---

## Partial file: `_partial-cli-skills.md`

# Spec-compliance audit — CLI + skills (change `workflow-transition-checks`)

**Mode:** change  
**Change:** `workflow-transition-checks`  
**Assigned specs (spec-preview):** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Graph:** `stale: false`, `contentFresh: true` (indexed `2026-08-28T23:37:14.399Z`, ref `2948f1a2`)  
**Read-only:** no code or spec files modified.

Evidence sources: `specd changes spec-preview`, `specd graph search` / `graph impact`, then source under `packages/cli` and `packages/skills/templates`.

---

## Requirements Summary

Unique **spec.md** requirements from spec-preview (verify.md repeats them as scenarios).

### `cli:change-status` (16)

| ID    | Requirement                                      | Intent                                                                                                   |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| CS-1  | Command signature                                | `change status <name> [--format]`                                                                        |
| CS-2  | Drafted change status is read-only               | No mutable transitions; drafted marker; MAY show artifacts                                               |
| CS-3  | Output format                                    | JSON/TOON `hasTasks`; DAG `state` is display projection                                                  |
| CS-4  | Task completion display in DAG                   | `[hasTasks - N/M done]` vs `[hasTasks]` fallback                                                         |
| CS-5  | Display-state rendering                          | Text prefers display; JSON has canonical + display                                                       |
| CS-6  | Lifecycle projections come from GetStatus checks | Pass through check-derived `availableTransitions` / `nextAction`; no local `VALID_TRANSITIONS` re-filter |
| CS-7  | Text status omits duplicated review file lists   | Review header without file paths; overlap peers still print                                              |
| CS-8  | Text blockers include check labels               | `! CODE — label: message`                                                                                |
| CS-9  | Schema version warning                           | stderr; skip if `schemaInfo` null                                                                        |
| CS-10 | Change not found                                 | exit 1, `error:`                                                                                         |
| CS-11 | Schema-derived fields                            | `schema.artifactDag` from `schema.artifactDag()`                                                         |
| CS-12 | Delegates refresh policy to GetStatus            | No direct refresh / detector                                                                             |
| CS-13 | Implementation section                           | SDK projection only                                                                                      |
| CS-14 | Task completion in details                       | `tasks: N/M`                                                                                             |
| CS-15 | Basic info section                               | No standalone `specs:` list                                                                              |
| CS-16 | Specs and dependencies section                   | Text list + JSON `specDependsOn`                                                                         |

**Constraints (binding, not separate headings):** suppress drafted `nextAction.command`; do not second-filter `availableTransitions`. Verify CS-2: JSON `availableTransitions` is empty **or omitted**. Implementation now **forces `[]`** even if Core leaks hops (focus item).

### `cli:change-transition` (15)

| ID    | Requirement                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| CT-1  | Command signature (`--next` → `to: 'next'`; `--allow-out-of-scope`; hook skip phases)                            |
| CT-2  | Next-transition resolution (Core resolves `'next'`; no CLI from→to table; no `GetStatus.nextAction` as resolver) |
| CT-3  | Delegates refresh to TransitionChange                                                                            |
| CT-4  | Approval-gate routing (no gate flags; no rewrite to pending)                                                     |
| CT-5  | Hook execution                                                                                                   |
| CT-6  | Progress output (`stream: "change-transition"`; never `"hook-progress"`)                                         |
| CT-7  | Transition hook observability                                                                                    |
| CT-8  | Shared hook progress presentation                                                                                |
| CT-9  | Output on success                                                                                                |
| CT-10 | Post-hook failure warning (exit 2)                                                                               |
| CT-11 | Invalid transition error + Repair Guide from GetStatus                                                           |
| CT-12 | Incomplete tasks error                                                                                           |
| CT-13 | Check progress rendering (gerund labels; no `Executing:`)                                                        |
| CT-14 | Unsatisfied requires error                                                                                       |
| CT-15 | (covered in CT-5 verify scenarios for `--skip-hooks`)                                                            |

### `cli:change-approve` (7)

AP-1 signatures; AP-2 kernel gates / `kernel.changes.approve*`; AP-3 no CLI hashes; AP-4 spec from `ready` (drain pending); AP-5 signoff from `done`; AP-6 success output; AP-7 errors.

### `cli:change-archive` (10)

AR-1 signature; **AR-2 Prerequisites: `archivable` only**; AR-3 Behaviour (`ArchiveChange`); AR-4 hooks; AR-5 check progress; AR-6 post-archive hooks exit 2; AR-7–AR-9 success text/JSON stream; AR-10 error cases (`archivable` only).

**Focus vs preview:** Core `Change.isArchivable` is `archivable || archiving`. This change’s **CLI deltas do not update AR-2 / AR-10**. Preview still forbids `archiving`.

### `skills:skill-templates-source` (21)

ST-1 location; ST-2 migration (skills list, no `specd-metadata/`); ST-3 metadata JSON; ST-4 Handlebars/capabilities; ST-5 graph impact terms; ST-6 graph search `--snippet`; ST-7–ST-10 frontmatter; ST-11 implementation tracking copy; ST-12 metadata self-healing; ST-13 optimizer gating; ST-14 command roles; ST-15 in-place approval gates; ST-16 impl drain in verify/implement; ST-17 archive `--skip-hooks pre`; ST-18 design review scope; ST-19 overlap vs `OVERLAP_CONFLICT`.

**Focus:** `nextAction.command`; `done`/`signed-off` → `/specd-archive` when hop is `archivable`; invalidation overlap → `/specd-design`; no `LifecycleEngine` constructor language.

---

## Implementation Status

### `cli:change-status` — implemented (focus item closed)

`packages/cli/src/commands/change/status.ts` (`registerChangeStatus`):

- Draft JSON **hard-codes** `availableTransitions: []` (does not copy `lifecycle.availableTransitions`).
- Draft `nextAction` is copied then `command` forced `null`.
- Text: `(drafted)`, `transitions: (none — change is drafted)`, `command: (none)`.
- Active path serializes GetStatus `availableTransitions` / `nextAction` without a `VALID_TRANSITIONS` overlay.
- Review text: header without `affectedArtifacts` paths; `overlap:` from `overlapDetail`; filters `OVERLAP_CONFLICT` when `review.reason === 'spec-overlap-conflict'`.
- Blockers with `label` use `! CODE — label: message`.
- Help JSON schema lists `overlapDetail`.
- Refresh: `kernel.changes.status.execute({ name })` only.

**Partial / leak surface:** drafted JSON still passes `availableSteps: lifecycle.availableSteps ?? []`. `core:get-status` (dependency) requires drafted `availableSteps` empty. CLI spec does not require CLI-side force. If Core leaked extras, JSON would show them. `availableTransitions` leak is explicitly blocked.

### `cli:change-transition` — implemented

`packages/cli/src/commands/change/transition.ts`:

- `--next` sets `to: requestedTarget` where `requestedTarget` is `'next'` (not a local hop map). `CHANGE_STATES` is argument validation only.
- `allowOutOfScope` only when flag set; no `approvalsSpec` / `approvalsSignoff` on execute input.
- Pre-status uses `refreshImplementationTracking: false`.
- Check bus via `_check-progress-presenter`, `stream: "change-transition"`.
- Repair guide from follow-up GetStatus `blockers` + `nextAction`.

### `cli:change-approve` — implemented

`packages/cli/src/commands/change/approve.ts`: `{ name, reason }` only; `kernel.changes.approveSpec` / `approveSignoff`; help text uses `ready` / `done` plus drain language; success `approved <gate> for <name>`.

### `cli:change-archive` — implemented vs Core; **spec-preview lag**

CLI has **no local state gate**; it always calls `kernel.changes.archive.execute`. Core `assertArchivable()` / `isArchivable` allows **`archiving` as well as `archivable`**. Live CLI therefore archives from `archiving` if Core predicates pass.

**Spec-preview AR-2 / Constraints still say only `archivable`.** Change deltas for `cli:change-archive` add progress/JSON stream/`--allow-out-of-scope`, not the `archiving` retry path.

JSDoc on `ArchiveChange.execute` still says “not in `archivable` state” (stale comment vs `isArchivable`).

### `skills:skill-templates-source` — implemented against preview

Layout: `templates/skills/{specd,specd-archive,specd-design,specd-implement,specd-new,specd-compliance,specd-verify}/` + agents + `shared.md.tpl`. No `specd-metadata/`. `.md.tpl` + `skill.meta.json` / `specd-agent.meta.json` with required shape.

Focus routing:

- `shared.md.tpl`: `nextAction` includes `command`; prefer that over manual derivation.
- `specd-new/SKILL.md.tpl`: follow `nextAction.command`; `done` / `signed-off` → `/specd-archive` when hop is `archivable`, else `/specd-verify`; `spec-overlap-conflict` → `/specd-design`.
- Design / implement / verify / archive: same overlap routing; hop skills do not list `OVERLAP_CONFLICT` in typical-blocker examples; archive does.
- `specd/SKILL.md.tpl`: router; no signoff / pending / approve copy.
- **No `LifecycleEngine` / constructor language** anywhere under `packages/skills`.
- Archive skill: `--skip-hooks pre` only on `changes archive`; no post `run-hooks`; still `hook-instruction` post; requires state `archivable` (matches **CLI preview**, not Core retry-from-`archiving`).

Graph: `--direction dependents`; `--snippet` opt-in; no `--changes` selector.

---

## Discrepancies

Present both interpretations.

### D1 — HIGH (spec lag): CLI archive spec vs Core archive from `archiving`

| Side                             | Evidence                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Preview `cli:change-archive`** | Prerequisites + error cases + Constraints: only `archivable`. Deltas never modified those sections.                               |
| **Core / CLI runtime**           | `Change.isArchivable` = `archivable \|\| archiving`; `archive.archivable` uses `assertArchivable()`; CLI does not re-check state. |
| **Skills preview**               | `specd-archive` MUST already be `archivable`; template: “If state is not `archivable`, this is the wrong skill.”                  |

**If spec is right:** CLI (and skills) should reject `archiving` even when Core would accept (they currently would not reject at CLI layer).  
**If Core is right (failed-archive retry):** change should update `cli:change-archive` AR-2/AR-10 **and** `skills` archive entry so agents retry archive from `archiving`.  
**Both partial:** CLI docs/JSDoc still say “archivable only” while entity allows `archiving`.

### D2 — LOW (closed vs prior): drafted JSON `availableTransitions`

Prior concern: Core leak of hops in drafted JSON. **Code now forces `[]`.** Test mocks `availableTransitions: ['ready']` and expects `[]`.

**Residual spec softness:** verify CS-2 still says “empty **or omitted**”; constraints do not say “force `[]` if Core leaks.” Code is stricter than verify. Prefer tightening verify to MUST `[]`.

### D3 — LOW: drafted `availableSteps` passthrough

CLI JSON copies Core `availableSteps`. Dependency `core:get-status` says drafted `availableSteps` MUST be empty. Not in `cli:change-status`. If Core leaked extras, agents could see them.

**Spec drift vs bug:** Core should empty them; CLI could belt-and-suspenders like `availableTransitions`.

### D4 — LOW: `specd-new` table vs `nextAction.command`

Template says follow `nextAction.command`, then if `review.required` is false, **suggest from `targetStep` table**. If Core `command` and table disagree, the table can win. `shared.md.tpl` says prefer `nextAction`. Not a hard contradiction if table matches Core guidance; tests do not lock the table to `command`.

### D5 — NONE found: `LifecycleEngine` ctor in skills

No matches in templates or skills tests. Aligns with `core:lifecycle-engine` “no LifecycleEngine class” (out of this batch but consistent).

### D6 — Consistency: in-place gates

CLI approve + skills stay-in-`ready`/`done` align with change deltas. No pending rewrite on transition CLI.

---

## Test Coverage

| Requirement cluster                                                       | Tests                                                                                                             | Verdict                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Drafted JSON forces `[]` despite Core leak                                | `packages/cli/test/commands/change/status.spec.ts` `JSON drafted status includes isDrafted and empty transitions` | **Covers focus**                           |
| Drafted text read-only                                                    | same file, text drafted test                                                                                      | Covered                                    |
| `--next` → `{ to: 'next' }`                                               | `transition.spec.ts` (success + failure paths, including signed-off and archiving reject messages)                | Covered                                    |
| No approval flags / allowOutOfScope omit                                  | `transition.spec.ts`, `archive.spec.ts`                                                                           | Covered                                    |
| Approve kernel shape + stay-in-state copy                                 | `approve.spec.ts`                                                                                                 | Covered                                    |
| Archive skip-hooks / JSON stream / overlap                                | `archive.spec.ts`                                                                                                 | Covered                                    |
| Archive not-archivable (`done`)                                           | `archive.spec.ts` mocks `InvalidStateTransitionError('done', 'archivable')`                                       | Covers **done**, not **archiving-allowed** |
| Skills gates, overlap, skip-hooks pre, review header, impl drain          | `packages/skills/test/template-workflow.spec.ts`                                                                  | Strong for ST-15–ST-19                     |
| Optimizer / metadata / command roles                                      | same file                                                                                                         | Strong for ST-12–ST-14                     |
| Status overlap peers, no review files, hide invalidation OVERLAP_CONFLICT | `status.spec.ts`                                                                                                  | Covered CS-7                               |
| Transition check bus / no `Executing:` / no `hook-progress`               | `transition.spec.ts`                                                                                              | Covered CT-6/CT-13                         |
| Repair guide uses GetStatus command                                       | `transition.spec.ts` (e.g. READ_ONLY with label)                                                                  | Partial CT-11                              |

---

## Missing Tests

1. **`cli:change-status` verify “DEPS_INCONSISTENT … Checking spec dependencies”** — implementation renders labels; status tests show unlabeled `INCOMPLETE_ARTIFACT` and overlap labels, not that scenario’s code+label pair / JSON `blockers[].label`.
2. **Drafted JSON `availableSteps` leak** — no test that Core-populated `availableSteps` are emptied or documented as Core-owned.
3. **`--help` lists `overlapDetail`** — spec CS-7; no CLI help-text assertion found.
4. **Archive from `archiving`** — neither “succeeds via Core” nor “CLI rejects” is specified in CLI tests; Core unit tests cover entity, not this CLI command.
5. **Skills `nextAction.command` string** — `template-workflow.spec.ts` does not assert `Follow the \`nextAction.command\``or the`done`/`signed-off` `/specd-archive`when hop is`archivable` row.
6. **Skills `LifecycleEngine` absence** — satisfied by absence; optional negative assertion not present (low value).
7. **Status “CLI does not add verifying from VALID_TRANSITIONS”** — pass-through implied; no test that a local constant cannot reintroduce hops (implementation has no such filter).

---

## Spec Dependency Chain

Depth-1 from change `specDependsOn` (preview):

```
cli:change-status
  → cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks

cli:change-transition
  → cli:entrypoint, core:change, core:transition-change, core:hook-execution-model, core:get-status, core:transition-checks

cli:change-approve
  → cli:entrypoint, core:change, core:transition-checks

cli:change-archive
  → cli:entrypoint, core:change, core:archive-change, core:hook-execution-model, cli:command-resource-naming, core:transition-checks

skills:skill-templates-source
  → skills:skill, cli:spec-optimizations, skills:workflow-automation, core:transition-checks
```

**Cross-spec tension (this batch vs Core on same change):** `core:change` / archive checks treat `archiving` as archive-eligible; `cli:change-archive` + `skills` archive skill still describe **archivable-only**. `core:get-status` drafted `availableSteps: []` vs CLI JSON passthrough. `core:lifecycle-engine` forbids a `LifecycleEngine` class; skills templates do not mention it.

Global `_global/architecture` (CLI as edge, Core owns lifecycle) is respected: CLI serializes / forwards; it does not recompute hops except the **drafted `availableTransitions: []` and `command: null` sanitizers**.

---

## Summary counts

| Metric                                              | Count                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assigned specs                                      | 5                                                                                                                                                                                  |
| Unique spec.md requirements audited                 | **69** (16+15+7+10+21)                                                                                                                                                             |
| Implemented (aligned with preview + code)           | **65**                                                                                                                                                                             |
| Partial                                             | **3** (AR-2/AR-10 vs Core `archiving`; drafted `availableSteps`; specd-new command vs table)                                                                                       |
| Missing / not specified in this change’s CLI deltas | **1** (archive-from-`archiving` in `cli:change-archive` + archive skill)                                                                                                           |
| Discrepancies (D1–D6; D5 none)                      | **4 material** (D1 HIGH, D2 residual LOW, D3 LOW, D4 LOW)                                                                                                                          |
| Requirements with adequate tests                    | **~58**                                                                                                                                                                            |
| Missing or weak tests                               | **7** listed                                                                                                                                                                       |
| Focus items                                         | Drafted JSON `[]`: **pass**; `--next`→`to:'next'`: **pass**; archive `archiving`: **code pass / spec-preview fail**; skills command/archive/overlap/no-engine: **pass** vs preview |

**Bottom line:** CLI status now **forces empty `availableTransitions` on drafted JSON**. Transition **`--next` is a Core passthrough**. Skills match preview routing (`nextAction.command`, archive hop from `done`/`signed-off`, overlap → `/specd-design`, no LifecycleEngine). **Largest gap:** preview `cli:change-archive` (and archive skill) still **archivable-only** while Core **archives from `archiving` too**, and this change’s CLI deltas never updated that contract.

---

## Partial file: `_partial-globals.md`

# Spec-compliance partial: project-wide globals

- **Mode:** change `workflow-transition-checks`
- **Batch:** `_partial-globals.md`
- **Read-only:** no code or spec files were modified.
- **Change previews (`changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Conformance-only (`specs show` / disk):** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs`
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`, `coverageComplete: true`. `graph search "Logger"` resolved `core:src/observability/logger.ts` (class) with public bindings on `observability/logger.ts`, `observability/index.ts`, `application/logger.ts`, `application/index.ts`. `graph impact --symbol Logger` returned `not_found`. Import/layer checks used source reads after graph.

**USER-ENFORCED (blocking if violated):** architecture preview MUST remain package-agnostic — MUST NOT mention `evaluateLifecycle`, `packages/core/...` paths, or `LifecycleEngine`. Ambient `Logger` is the only inner-layer import exception. Domain must not import `application/`. Logging: `log` vs `info`; domain MAY call `Logger.debug`. Observability vs domain imports checked.

**Verdict on user constraint:** **PASS (0 blocking).** Merged architecture `spec.md` / `verify.md` preview contains none of the forbidden terms. Disk `specs/_global/architecture/spec.md` likewise. (`spec-lock.json` lists `packages/core/...` file coverage — lock metadata, not the architecture prose preview.)

**Prior LOW (re-checked, still open):** (1) `log()` vs `info()` identity is not asserted on the ambient facade. (2) Logger unit tests live at `test/application/logger-port.spec.ts` instead of mirroring `src/observability/`.

---

## Requirements Summary

### `default:_global/architecture` (change preview)

| ID  | Requirement                                                                                                | In this change’s delta? |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| A1  | Packages with business logic: `domain` / `application` / `infrastructure`; inner layers never import outer | No (baseline)           |
| A2  | Domain is pure (no I/O); **exception: ambient Logger** is the sole inner-layer import exception            | **Yes**                 |
| A3  | Application uses `application/ports/` only; ambient Logger is not an infrastructure adapter                | **Yes**                 |
| A4  | Rich domain entities; invalid transitions throw typed errors                                               | No                      |
| A5  | Value objects expose behaviour, not internal structure                                                     | No                      |
| A6  | Ports with shared construction: `abstract class`; methods not property signatures                          | No                      |
| A7  | Stateless domain operations: plain functions in `domain/services/`                                         | No                      |
| A8  | Manual DI at package entry; no IoC                                                                         | No                      |
| A9  | Only `composition/` imports `infrastructure/`; kernel / `createX` factories                                | No                      |
| A10 | YAML validated at infrastructure boundary                                                                  | No                      |
| A11 | Adapter packages contain no business logic                                                                 | No                      |
| A12 | No circular `workspace:*` dependencies                                                                     | No                      |
| A13 | Curated public barrels; hosts use `@specd/sdk`                                                             | No                      |

**Verify.md (change):** scenarios “Domain imports ambient Logger” and “Application imports ambient Logger”.

**Package-agnostic check:** preview does not name `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...`. Application `evaluateLifecycle` (`application/services/lifecycle-evaluation.ts`) and domain `evaluateLifecycleVerdict` / `lifecycle-engine.ts` re-export barrel exist in code; architecture correctly does not mention them.

### `default:_global/logging` (change preview)

| ID  | Requirement                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Interface: `log()`, `info()`, `debug()`, `warn()`, `error()` (console-compatible)                                                                                                                             |
| L2  | `log()` SHALL be an alias of `info()`                                                                                                                                                                         |
| L3  | Minimal **console** impl: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`                                                                                                  |
| L4  | Levels: `trace` < `debug` < `info`/`log` < `warn` < `error` < `fatal`; `fatal` = process-terminating critical                                                                                                 |
| L5  | Production code avoids direct `console.*`; use logging abstraction                                                                                                                                            |
| L6  | **Ambient Logger** (added): composition assigns impl; no-op before wiring; any layer MAY import (`debug`, `trace`, diagnostic `info`); not for control flow / persistence; each package chooses how to use it |

Disk logging has L1–L5 only. Preview adds L6 and `## Spec Dependencies` → architecture.

### `default:_global/conventions` (disk, conformance)

TypeScript `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`; ESM `NodeNext`; named exports only; kebab-case sources; tests `test/` mirroring `src/` with `.spec.ts`; no `any`; explicit return types on public API; core errors extend `SpecdError`; underscore backing fields; lazy `list()`; immutability preference. Layer barrels only for `domain`/`application`/`composition` when >50 modules.

### `default:_global/testing` (disk, conformance)

Vitest; `test/` mirror; unit tests mock ports (no fs/net/process); full typed port mocks; infrastructure integration with tmpdir cleanup; `"given <state>, when <action>, then <outcome>"`; no snapshots.

### `default:_global/eslint` (disk, conformance)

No `any`; named exports; explicit public return types; kebab-case `src/`; JSDoc on functions/classes (tests exempt); `no-restricted-imports` for architecture layers.

### `default:_global/docs` (disk, scoped)

Docs under `docs/`; ADRs MADR; CLI/MCP/core/SDK alignment; JSDoc on symbols; composition-surface and listing-contract docs stay in-change. Audited only for Logger / architecture-delta drift.

---

## Implementation Status

### Architecture (A2 / A3 / layers) — change-relevant

| Req | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Mostly implemented**               | `@specd/core` has `domain/`, `application/`, `infrastructure/`, `composition/`. Additional sibling **`observability/`** (not named in the spec; package-agnostic spec cannot name core paths).                                                                                                                                                                                     |
| A2  | **Implemented via `observability/`** | Production domain Logger import: only `packages/core/src/domain/services/lifecycle-verdict.ts` → `../../observability/logger.js`. No `src/domain/**` import from `application/` (name `DeltaApplicationError` is not a layer import). No `node:fs` in that Logger path. Domain calls **`Logger.debug`** (two sites in `lifecycle-verdict.ts`) with no logger constructor argument. |
| A3  | **Implemented**                      | Use cases import `Logger` from `application/logger.js` (re-export of observability). Logger is not a use-case constructor port.                                                                                                                                                                                                                                                    |
| A7  | **Implemented for verdict**          | `evaluateLifecycleVerdict` is a plain exported function. `lifecycle-engine.ts` is a named re-export, not a class. **`LifecycleEngine` does not exist as a class.**                                                                                                                                                                                                                 |
| A9  | **Implemented for Logger wiring**    | `composition/kernel.ts` calls `Logger.setImplementation(createDefaultLogger(...))`.                                                                                                                                                                                                                                                                                                |

**Observability vs application shims:**

| Path                                   | Role                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `src/observability/logger.ts`          | Canonical ambient `Logger` + `NullLogger`             |
| `src/observability/logger.port.ts`     | Canonical `LoggerPort` / `LogLevel`                   |
| `src/observability/index.ts`           | Layer barrel re-export                                |
| `src/application/logger.ts`            | `export { Logger } from '../observability/logger.js'` |
| `src/application/ports/logger.port.ts` | Re-export of observability port types                 |

Domain **must not** import `application/logger.js` (eslint `**/application/**`). Application/infra/composition **may** import the application shim. Same class, two import graphs.

**`evaluateLifecycle`:** lives only in application (`lifecycle-evaluation.ts`); wraps `evaluateLifecycleVerdict` + guidance. Architecture preview correctly omits it.

### Logging

| Req | Status                                          | Evidence                                                                                                                                                                                                       |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Implemented**                                 | `LoggerPort` + static `Logger` methods include the five console methods plus `fatal`, `trace`, `isLevelEnabled`, `child`.                                                                                      |
| L2  | **Implemented in Pino; facade is pass-through** | `PinoLogger.log` and `PinoLogger.info` both call `this.logger.info(...)`. Ambient `Logger.log` calls `impl.log`, not `impl.info`. Alias holds for the default adapter; a custom `LoggerPort` could split them. |
| L3  | **N/A in repo**                                 | No console-backed logger. Pino has no `[FATAL]` / `[TRACE]` prefixes.                                                                                                                                          |
| L4  | **Partial**                                     | `LogLevel` includes extra `'silent'`. `fatal` logs via pino; does not terminate the process. Ordering not encoded as a comparable type.                                                                        |
| L5  | **Core yes; CLI still `console.*`**             | CLI: `console.warn` in `load-config.ts`, `cli-context.ts`; `console.error` in `spec-preview.ts`. Verify allows excluding bootstrap.                                                                            |
| L6  | **Implemented for no-op + ambient debug**       | Default `NullLogger`; `setImplementation` / `resetImplementation`. Domain uses `Logger.debug` without a port. Only **core** `createKernel` assigns the impl.                                                   |

### Conventions / testing / eslint (change-touched Logger / verdict files)

| Check                                                                          | Status                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kebab-case `observability/logger.ts`, `logger.port.ts`, `lifecycle-verdict.ts` | Pass                                                                                                                                                                           |
| Named exports, no default on Logger                                            | Pass                                                                                                                                                                           |
| Explicit return types on `Logger` static methods                               | Pass                                                                                                                                                                           |
| Test path mirror for Logger                                                    | **Fail pairing:** tests at `test/application/logger-port.spec.ts` vs source `src/observability/logger.ts` (and `logger.port.ts`)                                               |
| Lifecycle tests vs source                                                      | **Partial:** `test/domain/services/lifecycle-engine.spec.ts` matches barrel `lifecycle-engine.ts`, not `lifecycle-verdict.ts`                                                  |
| `observability/index.ts` barrel                                                | Extra barrel; conventions exception lists domain/application/composition only                                                                                                  |
| Vitest + full `LoggerPort` mock in `logger-port.spec.ts`                       | Pass                                                                                                                                                                           |
| Test titles `given/when/then`                                                  | Logger tests do not follow the pattern                                                                                                                                         |
| ESLint domain ↛ application/infrastructure/composition                         | **Conformant.** No Logger exception in eslint; domain imports `observability/` which is unrestricted. Importing `application/logger` from `src/domain/` would be a lint error. |
| JSDoc                                                                          | File-level `eslint-disable jsdoc/require-jsdoc` on `observability/logger.ts` (`NullLogger`) and `lifecycle-verdict.ts` (private helpers)                                       |

### Docs

`docs/` has **no** `Logger` / `LoggerPort` / `observability` hits. No stale documented Logger contract. Optional gap only if L6 is treated as a newly specified public integrator API (`Logger` already exported from core `"."` via application shims).

---

## Discrepancies

Each item: **severity**, **classification** (`code-wrong` | `spec-wrong` | `both`), evidence, both-sides reading.

### D1 — Architecture still says “three layers”; code has `observability/`

- **Severity:** LOW
- **Classification:** both
- **Spec might be right:** A1 requires three layers; a fourth folder is undescribed.
- **Code might be right:** naming `observability/` or `packages/core/...` in the **global architecture spec would violate the user-enforced package-agnostic constraint**. The exception is “import ambient Logger”, not “import application”.
- **Not a user-constraint violation.**

### D2 — “Each package wires the implementation at its composition root” (architecture A2) vs “each package chooses” (logging L6) vs single `createKernel` call

- **Severity:** MEDIUM
- **Classification:** both (intra-change spec tension; code matches logging better)
- **Evidence:** only `packages/core/src/composition/kernel.ts` calls `Logger.setImplementation`. CLI/code-graph/SDK consume the static facade.
- **Architecture might be right:** every package composition root should assign an impl.
- **Logging + code might be right:** one process-level assignment is enough; other packages choose ambient use without re-wiring.

### D3 — Port types live in `observability/logger.port.ts`, not authored in `application/ports/`

- **Severity:** LOW
- **Classification:** both
- **Architecture A3 / A13:** ports live under `application/ports/` (and `@specd/core/ports`).
- **Code:** types defined in observability, re-exported from `application/ports/logger.port.ts`. Domain importing `application/ports` would fail eslint.
- **Spec might be right:** move the interface into application/ports (would force eslint exception or domain staying on observability types only).
- **Code might be right:** keep port beside the ambient facade so domain never imports `application/`.

### D4 — Architecture `## Spec Dependencies` is still `*none*` while body links to logging; logging (change) depends on architecture

- **Severity:** LOW
- **Classification:** spec-wrong (documentation graph)
- One-way declared dependency + reverse prose link. Not a package cycle.

### D5 — Ambient `Logger.log` does not call `info()` on the facade

- **Severity:** LOW
- **Classification:** both
- **Spec L2:** `log()` SHALL be treated as an alias for `info()`.
- **Code:** `Logger.log` → `impl.log`; `Logger.info` → `impl.info`. Pino aliases both to `info`. A non-aliasing `LoggerPort` would diverge.
- **Spec might be right:** facade should call `impl.info` from both, or document that alias is an adapter contract.
- **Code might be right:** alias is an implementation concern of `LoggerPort` adapters.

### D6 — `LogLevel` includes `silent`; `fatal` does not terminate the process

- **Severity:** LOW
- **Classification:** both
- Spec L4: `fatal` = immediate process termination; no `silent`.
- Code: pino `silent` + `fatal` log only.
- **Spec might be right:** document `silent` and non-terminating fatal, or implement termination.
- **Code might be right:** process kill is a host concern; pino semantics are enough.

### D7 — L3 console prefix mapping has no implementation

- **Severity:** INFO
- **Classification:** spec-wrong _if_ L3 is claimed as always-on; **N/A** if scoped to “minimal console implementations” only
- No console logger in-repo to pass or fail L3.

### D8 — CLI `console.warn` / `console.error`

- **Severity:** LOW
- **Classification:** both
- L5 vs verify “excluding bootstrapping”. CLI warnings are user-facing bootstrap UX.

### D9 — JSDoc eslint-disable on observability `NullLogger` and lifecycle-verdict helpers

- **Severity:** LOW
- **Classification:** both
- ESLint/docs: JSDoc on all functions. Code disables the rule for private helpers / no-op methods.
- **Spec might be right:** document `NullLogger` methods.
- **Code might be right:** global JSDoc rule is too strict for no-ops and private engine helpers.

### D10 — `observability/index.ts` barrel not in conventions exception list

- **Severity:** LOW
- **Classification:** both
- Conventions: no `index.ts` except package root and listed layer barrels. Domain already imports `logger.js` directly.

### D11 — Docs silence on public `Logger` / `LoggerPort`

- **Severity:** INFO
- **Classification:** spec-wrong _only if_ L6 is a new public API requiring `docs/core/` in the same change; otherwise **pre-existing** undocumented export
- No contradictory stale docs found.

**Forbidden-term / layer-import findings:** none. Domain does not import `application/`. Ambient Logger is the only production inner-layer exception (`observability/`).

---

## Test Coverage

| Spec scenario                                     | Coverage                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture: domain ↛ infrastructure / `node:fs` | ESLint + tsc; no dedicated vitest                                                                                                                                                    |
| Architecture: domain MAY import ambient Logger    | Production import compiles; **no** lint fixture asserting allow vs deny paths                                                                                                        |
| Architecture: application MAY import Logger       | Indirect via use-case tests spying `Logger.debug`                                                                                                                                    |
| Logging L1 methods exist                          | Type-level `LoggerPort`; no interface contract test                                                                                                                                  |
| Logging L2 `log()` ≡ `info()`                     | **Uncovered** on ambient `Logger`. Pino both call `logger.info` — **no explicit test** that `PinoLogger.log` and `.info` are identical                                               |
| Logging L3 prefixes                               | Missing (no console impl)                                                                                                                                                            |
| Logging L4 severity order                         | Missing                                                                                                                                                                              |
| Logging L5 console lint                           | ESLint does not ban `console.*`                                                                                                                                                      |
| Logging L6 no-throw before wiring                 | Partial: `logger-port.spec.ts` only `info`/`error`; **no** `console` spy proving no-op writes nothing                                                                                |
| Logging L6 no logger port in domain               | Production `evaluateLifecycleVerdict` has no logger param; tests spy `Logger` from **`application/logger.js`** in `lifecycle-engine.spec.ts` — they do not assert signature omission |
| Testing: full port mock                           | `logger-port.spec.ts` implements all `LoggerPort` methods                                                                                                                            |
| Testing: given/when/then                          | Logger tests use informal titles                                                                                                                                                     |

Pino: `test/infrastructure/logging/pino-logger.spec.ts` (callback destination, `child`, `isLevelEnabled`) — adapter, not ambient alias.

---

## Missing Tests

1. **Prior LOW (still open):** `Logger.log` and `Logger.info` (and/or `PinoLogger.log` / `.info`) produce identical underlying calls.
2. **Prior LOW (still open):** `test/observability/logger.spec.ts` (and/or `logger.port.spec.ts`) mirroring `src/observability/` — today only `test/application/logger-port.spec.ts`.
3. All ambient methods no-throw **and** `console.*` not invoked before `setImplementation`.
4. `resetImplementation` restores no-op (not asserted).
5. ESLint/compiler fixture: domain import of `application/logger` fails; import of `observability/logger` succeeds.
6. Console `[FATAL]`/`[TRACE]` **only if** a console adapter is claimed.
7. Per-package `setImplementation` **only if** architecture A2 wiring sentence is treated as binding.

---

## Spec Dependency Chain

```
default:_global/architecture (change preview)
  Spec Dependencies: none (body still links logging)
  ↑ depended on by: default:_global/logging (change)
  ↑ depended on by: default:_global/testing (disk)
  ↑ restated by: default:_global/eslint layer rules (disk; eslint Spec Dependencies list conventions only)

default:_global/logging (change preview)
  → default:_global/architecture

default:_global/conventions (disk)
  → default:_global/error-handling-conventions
  ↑ depended on by: testing, eslint, docs

default:_global/testing (disk)
  → architecture, conventions

default:_global/eslint (disk)
  → conventions (architecture layers encoded but not listed)

default:_global/docs (disk)
  → conventions
```

This change’s core specs (`core:transition-checks`, `core:lifecycle-engine`, `core:change`, …) depend on architecture via change `specDependsOn`; those are out of this batch except for confirming architecture stays package-agnostic.

---

## Summary counts

| Spec                                     | Reqs reviewed                  | Implemented (change-relevant / conformance)                                                 | Discrepancies                              | Missing tests         | Blocking (user architecture constraint) |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------- | --------------------------------------- |
| `default:_global/architecture` (preview) | 13                             | A2/A3/A7/A9 yes (observability layout caveat)                                               | 4 (D1–D4)                                  | 3                     | **0**                                   |
| `default:_global/logging` (preview)      | 6                              | L1 yes; L2 yes with facade caveat; L3 N/A; L4 partial; L5 mostly; L6 yes (core-only wiring) | 4 (D5–D8) + shared D2                      | 5 (incl. 2 prior LOW) | 0                                       |
| `default:_global/conventions` (disk)     | 10 (change-relevant subset ~8) | kebab/named/ESM/returns yes; test pairing / extra barrel no                                 | 2 (D10 + test pairing)                     | 0 lint-enforced       | 0                                       |
| `default:_global/testing` (disk)         | 6                              | Vitest/mocks yes; naming informal                                                           | 1 (naming)                                 | shared with logging   | 0                                       |
| `default:_global/eslint` (disk)          | 6                              | Layer rules **conformant** to Logger exception                                              | 1 (D9 JSDoc) + undeclared architecture dep | 0                     | 0                                       |
| `default:_global/docs` (disk)            | scoped                         | no stale Logger docs                                                                        | 1 INFO (D11)                               | 0                     | 0                                       |

| Totals (this batch)                            | Count                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Requirements reviewed                          | 47 (13+6+10+6+6+scoped docs not double-counted as 6; docs treated as 1 scoped check) — **conservative unique: 13+6+8+6+6+1 = 40** |
| Unique discrepancies (D1–D11)                  | 11 (1 MEDIUM, 8 LOW, 2 INFO)                                                                                                      |
| Missing tests listed                           | 7                                                                                                                                 |
| Blocking user-enforced architecture violations | **0**                                                                                                                             |
| Prior LOW still open                           | **2** (`log`/`info` tests; observability test path mirror)                                                                        |

**Highest-signal for parent report:**

1. Architecture **preview is package-agnostic** — no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...` in spec prose. **User constraint held.**
2. Domain **does not** import `application/`; sole production Logger import is **`observability/logger.js`**; domain **does** call `Logger.debug`. ESLint needs **no** Logger exception if that layout is kept.
3. Dual surface `observability/*` vs `application/logger.ts` is the main layout smell vs “ports live in application/ports”.
4. `log()`↔`info()` holds in Pino, **not tested**; ambient facade does not force alias.
5. Logger tests still under `test/application/`, not `test/observability/`.
6. Architecture vs logging disagree on per-package `setImplementation`; code wires only in `createKernel`.
