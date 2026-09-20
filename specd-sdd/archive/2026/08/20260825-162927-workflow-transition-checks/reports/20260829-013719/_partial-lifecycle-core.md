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
