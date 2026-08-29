# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260829-125651
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state at audit:** designing (`ARTIFACT_DRIFT` on specs/verify; **`DEPS_INCONSISTENT`** on `default:_global/architecture`; nextAction `/specd-design`)
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** Reindexed before audit (`filesIndexed: 34`). After index: `stale: false`, `contentFresh: true`, `state: current` at `2026-08-29T10:57:16.886Z`.
- **Read-only.** Partials in this directory must be kept.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide extras:** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (conformance only).

**Batches:** `_partial-lifecycle-core.md`, `_partial-use-cases.md`, `_partial-archive-hooks.md`, `_partial-cli-skills.md`, `_partial-globals.md`

## Executive summary

Neither spec nor code is assumed true. **Lifecycle/check behaviour matches the change contract** (no `LifecycleEngine` class; domain `nextHop`; application `command`; `parentsOf`; archive fail-fast / deferred overlap I/O; CLI drafted sanitizers).

**New HIGH is metadata, not runtime ABI:** live `deps.consistent` fails because architecture **extract** is `[default:_global/logging]` (new Spec Dependencies delta) while the **change plan / spec-lock** still have `[]`. Ready cannot pass until `specd changes deps` (or equivalent) records that edge.

### Closed vs prior audit (20260829-090131)

| Prior finding                                               | Now                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEDIUM: domain projects `nextAction`                        | **CLOSED** in lifecycle-engine / transition-checks / change guidance. Verify leftover `nextAction.target` (not `targetStep`) remains LOW/MEDIUM wording. |
| MEDIUM: parent-status mapping                               | **CLOSED** (spec split matches `in-progress` vs parent-review).                                                                                          |
| MEDIUM: `projectArtifacts` vs `artifactDag`                 | **CLOSED** (`parentsOf`). Residual: `nextArtifact` still uses `artifactType.requires.every` (equivalent; LOW vs “MUST use parentsOf”).                   |
| MEDIUM: Logger each-package wiring                          | **CLOSED** (process-level composition root).                                                                                                             |
| LOW: overlap `list` before predicates                       | **CLOSED**.                                                                                                                                              |
| LOW: dual `deps.consistent` unexplained                     | **CLOSED** (merge-time pass specified).                                                                                                                  |
| LOW: `log`≡`info` / Logger test path                        | **CLOSED** (`test/observability/logger.spec.ts`).                                                                                                        |
| LOW: drafted hops / archive archivable-only / CLI help hops | **CLOSED**.                                                                                                                                              |
| Dist `LifecycleEngine` / `INCOMPLETE_ARTIFACT`              | **CLOSED** (stays closed).                                                                                                                               |

### Highest-severity open findings

1. **HIGH — workflow/metadata (not code-wrong):** `default:_global/architecture` extracted `dependsOn` includes `default:_global/logging`; persisted plan is `[]`. Option A: register the dep on the change. Option B: drop the Spec Dependencies bullet (weaker: body already links logging).
2. **MEDIUM — spec graph:** architecture↔logging Spec Dependencies is a 2-node cycle. One-way would avoid the extract/plan fight on architecture.
3. **MEDIUM — spec-wrong:** `core:change` still says “engine-derived” / `evaluate` for parent-review; lifecycle **verify** still says `nextAction.target`.
4. **MEDIUM — residual:** `availableSteps.blockingArtifacts` still walks `workflow[].requires` after checks (spec forbids a second **blocker code**; walk is for UI ids).
5. **LOW:** leftover “Engine” titles/JSDoc/barrel filename; GetStatus two “engine” JSDocs; draft still uses `projectArtifacts` only (allowed by parenthetical); CLI `--help` `schema` sketch vs nested `artifactDag`.

### Architecture / logging (user constraint)

**PASS (0 blocking).** Preview stays package-agnostic. Domain imports `observability/logger.js`. No `LifecycleEngine` class in src or dist.

### What is aligned

- Checks own hops; DAG UCs use empty `checksByTarget`; `resolve*Deps` omit `lifecycle`.
- `workflow.requires` → `ARTIFACT_DRIFT` on this change (plus the new deps fail).
- Archive: `failFastOn: 'schema.nameMatch'`; peer load after predicates; `archiving` retry.
- CLI drafted JSON empty hops + leaked `command` → `null`; gerund blockers; no archive GetStatus preflight.
- Skills: `archivable` **or** `archiving`.

## Recommended next steps (not part of this audit)

1. Persist architecture → logging on the change (`changes deps`) **or** revert the Spec Dependencies op to keep lock `[]` and a one-way logging→architecture edge.
2. Mechanical leftover “engine” / `nextAction.target` in previews and two GetStatus JSDocs.
3. Optional tests: schema-mismatch skips `list()`; JSON transition failure stream.

---

# Detailed findings (verbatim partials)

---

## Partial file: `_partial-lifecycle-core.md`

# Spec-compliance audit (partial): lifecycle core

**Mode:** change `workflow-transition-checks`  
**Scope:** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`, plus preview `default:_global/architecture`, `default:_global/logging`  
**Graph:** reindexed, `stale: false`, `contentFresh: true` (caller-supplied; not re-indexed in this pass)  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified  
**User-enforced constraints:** architecture preview must stay package-agnostic (no `evaluateLifecycle`, no `packages/core` paths, no `LifecycleEngine` class). Domain `Logger` from `observability/`, never `application/`. No `LifecycleEngine` class.

---

## Requirements Summary

Sources: `specd changes spec-preview workflow-transition-checks <specId>` (deltas applied). Architecture/logging previews used as global constraints.

### `core:lifecycle-engine`

| ID    | Requirement                         | Essence                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `domain/services/lifecycle-verdict.ts`: `evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`. No class, no injected debug/logger port, no `LifecycleEngineOptions`. Domain `Logger.debug` allowed. Domain return `LifecycleDomainVerdict` has `nextHop`, not `nextAction.command`. |
| LE-2  | Centralized validation logic        | Sole domain authority: project protocol + schema predicates + core-bound predicates from caller `CheckResult`s. No I/O, no `run:` effects, no snapshot-bag fallback.                                                                                                                                                  |
| LE-3  | Effective artifact status           | Mapping split: own review states stay; `complete` + review upstream → `pending-parent-artifact-review`; `complete` + otherwise incomplete upstream → `in-progress`. Recursive parent-review.                                                                                                                          |
| LE-4  | Canonical-state-only                | Display `complete-with-drift` / `hasDrift` must not create extra lifecycle states.                                                                                                                                                                                                                                    |
| LE-5  | Machine-readable blockers           | Codes include `INCOMPLETE_ARTIFACT` (not `MISSING_ARTIFACT`), `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`. Bypass omits skippable blockers; no `warnings` field.                                                  |
| LE-6  | Available steps and domain next hop | One predicate evaluation → `validTransitions` / `availableTransitions` / `availableSteps` / `nextHop` (`targetStep`, `actionType`, `reason`; no `command`). `isReady` from `workflow.requires` results when present. No approval rewrite of requested target.                                                         |
| LE-7  | Archiving escape                    | `archiving` exposes `archivable` + `designing`; recovery `along`; incomplete restore → designing hop.                                                                                                                                                                                                                 |
| LE-8  | Review summary                      | History-driven overlap is review + designing hop, not `OVERLAP_CONFLICT` blocker.                                                                                                                                                                                                                                     |
| LE-9  | Shared consumers                    | `GetStatus` / `TransitionChange` / `ValidateArtifacts` / `GetArtifactInstruction` share verdict; `CompileContext` must not evaluate hops. Empty `checksByTarget` still yields DAG/`nextArtifact`.                                                                                                                     |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command` via `lifecycle-guidance.ts`.                                                                                                                                                                                                                                        |
| LE-11 | Next artifact topological order     | Scan `schema.artifactDag().topologicalOrder()`; first incomplete with deps complete/skipped; else `null`.                                                                                                                                                                                                             |

### `core:transition-checks` (intersection with lifecycle)

| ID   | Requirement                        | Essence                                                                                                           |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TC-1 | Check identity and result          | Stable ids, gerund labels, `pass`/`fail`/`skip`, codes on fail.                                                   |
| TC-2 | Evaluation of a transition attempt | Classify `along`; `protocol.edge`; matching predicates; `allowed` from predicates only. No pending-state routing. |
| TC-3 | Applicability `from`/`to`/`along`  | Axis splice via `AXIS_FALLBACK`; redesign vs recovery vs backward.                                                |
| TC-4 | Projections                        | `availableTransitions` / public `nextAction` from the same evaluation (application command strings).              |
| TC-5 | No snapshot bag                    | Verdict must not `check.run` against a bag.                                                                       |
| TC-6 | Registry                           | Impl checks on forward exit-`implementing` only; approvals on delivery edges.                                     |

### `core:change`

| ID   | Requirement                     | Essence                                                                                                                                                    |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CH-1 | Lifecycle / `VALID_TRANSITIONS` | Protocol table; `HAPPY_PATH_NEXT` is `to: 'next'`, not `GetStatus.nextAction`.                                                                             |
| CH-2 | Artifacts                       | Persistable file states exclude `pending-parent-artifact-review`; that token is derived on the verdict (`projectArtifacts`). Wire coerce to `in-progress`. |
| CH-3 | Guidance ownership              | Domain `nextHop`; application `evaluateLifecycle` attaches `nextAction.command`.                                                                           |
| CH-4 | `assertArchivable`              | Entity asserts `archivable` or `archiving`.                                                                                                                |

### `core:workflow-model`

| ID   | Requirement                | Essence                                                                                                         |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| WM-1 | Step names = `ChangeState` | `workflow[]` extras only; omit does not delete protocol.                                                        |
| WM-2 | Requires / task completion | Evaluated as `workflow.requires` / `workflow.taskCompletion` with `to` = requested target. Shared with execute. |
| WM-3 | Step availability          | From `evaluateLifecycleVerdict` projections; `CompileContext` must not call it.                                 |
| WM-4 | Progress axis              | Same `along` classification as transition-checks.                                                               |

### `core:schema-format`

| ID   | Requirement              | Essence                                                                                                                                          |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SF-1 | Artifact `requires`      | Feeds `projectArtifacts` cascade (in-progress vs parent-review split) and `Schema.artifactDag()`. No `Change.effectiveStatus()`.                 |
| SF-2 | Schema artifact DAG API  | Cached `artifactDag()` with `roots`, `childrenOf`, **`parentsOf`**, `topologicalOrder`, `descendantsOf`.                                         |
| SF-3 | Canonical DAG derivation | Required-upstream walks must use `parentsOf`; next-artifact must use `topologicalOrder()`. No parallel `requires` graphs when schema is present. |

### `default:_global/architecture`

| ID   | Requirement                      | Essence                                                                                                                                        |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AR-1 | Package-agnostic layers          | Domain / application / infrastructure; inner never imports outer. **Must not name Core symbols, `packages/core` paths, or `LifecycleEngine`.** |
| AR-2 | Domain purity + Logger exception | Ambient `Logger` for diagnostics only (see logging).                                                                                           |
| AR-3 | Stateless domain services        | Plain functions, not classes.                                                                                                                  |

### `default:_global/logging`

| ID   | Requirement                         | Essence                                                                  |
| ---- | ----------------------------------- | ------------------------------------------------------------------------ |
| LG-1 | Console-compatible ambient `Logger` | No-op until composition root; any layer may import for observability.    |
| LG-2 | Domain import site (user-enforced)  | Domain MUST import `Logger` from `observability/`, never `application/`. |

---

## Implementation Status

Graph-first surfaces: `evaluateLifecycleVerdict` / `projectArtifacts` / `resolveLifecycleNextHop` in `core:src/domain/services/lifecycle-verdict.ts`; `evaluateLifecycle` in `core:src/application/services/lifecycle-evaluation.ts`; `ArtifactDag.parentsOf` in `core:src/domain/value-objects/artifact-dag.ts`; `Logger` class in `core:src/observability/logger.ts`; compatibility re-export file `core:src/domain/services/lifecycle-engine.ts` (no class); impact on that file: **0 dependents**.

| Req                     | Status                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1                    | **Implemented** (naming leftovers)            | `evaluateLifecycleVerdict` is a function (graph: `lifecycle-verdict.ts:142`). No `class LifecycleEngine` in `packages/core/src` or `packages/core/dist`. Public API test asserts no `LifecycleEngine` / `LifecycleEngineOptions` / `getLifecycleEngine`. Domain `nextHop` interface has `targetStep`/`actionType`/`reason` only (`lifecycle-verdict.ts:99-103`). Compatibility barrel `lifecycle-engine.ts` re-exports verdict symbols only.                                                                                        |
| LE-2                    | **Implemented**                               | Verdict copies `options.checksByTarget`, filters `availableTransitions` by `outcome !== 'fail'` (`lifecycle-verdict.ts:159-172`). No `check.run` / snapshot bag.                                                                                                                                                                                                                                                                                                                                                                    |
| LE-3                    | **Implemented**                               | `effectiveStatus` (`lifecycle-verdict.ts:352-406`): review own-state passthrough; review upstream → `pending-parent-artifact-review`; other incomplete → `in-progress`. Tests: `lifecycle-engine.spec.ts` “computes effective status across dependency chains” (`in-progress`) and “downgrades complete artifacts to pending-parent-artifact-review…”.                                                                                                                                                                              |
| LE-4                    | **Implemented** (tests exist in prior verify) | Canonical `artifact.status` only; no `hasDrift` branch in `effectiveStatus`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| LE-5                    | **Implemented**                               | Live status of this change emits `ARTIFACT_DRIFT` from `workflow.requires` (CLI `changes status`). Codes remain in projection helpers. **Stay closed:** `ARTIFACT_DRIFT` is specified and implemented.                                                                                                                                                                                                                                                                                                                              |
| LE-6                    | **Mostly implemented**                        | `nextHop` from `resolveLifecycleNextHop` (`lifecycle-verdict.ts:255, 801+`). `isReady` prefers `workflow.requires` fail when checks present (`184-190`). **Partial:** `availableSteps` still **always** recomputes `blockingArtifacts` by walking `workflowStep.requires` against `projectArtifacts` (`174-180`) even when checks exist. Spec: do not independently re-walk `requires` to emit a **second blocker code**; blockers array is emptied when checks exist (`207-210`), but the walk still runs for `blockingArtifacts`. |
| LE-7–LE-8               | **Implemented**                               | Recovery skip of requires for `archiving→archivable` (`214-218`). Overlap → `nextHop.targetStep === 'designing'` (tests ~388).                                                                                                                                                                                                                                                                                                                                                                                                      |
| LE-9                    | **Implemented** (other batches)               | Spies in `validate-artifacts.spec.ts` / `get-artifact-instruction.spec.ts` on `evaluateLifecycleVerdict`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| LE-10                   | **Implemented**                               | `evaluateLifecycle` spreads domain verdict and attaches `nextAction` via `resolveLifecycleNextAction` (`lifecycle-evaluation.ts:20-37`). Guidance in `lifecycle-guidance.ts`.                                                                                                                                                                                                                                                                                                                                                       |
| LE-11                   | **Implemented** (minor DAG API drift)         | `nextArtifact` iterates `schema.artifactDag().topologicalOrder()` (`750-754`). Dependency readiness still uses `artifactType.requires.every` (`761-764`), not `parentsOf`. Equivalent for in-schema types; conflicts with SF-3 wording.                                                                                                                                                                                                                                                                                             |
| TC-\* (lifecycle slice) | **Implemented**                               | Domain `run*` helpers + application `WorkflowCheck` (out of this file’s deepest check-factory audit). Matcher JSDoc still says “engine” (`evaluate-transition-predicates.ts:22-25`).                                                                                                                                                                                                                                                                                                                                                |
| CH-1–CH-4               | **Implemented**                               | `assertArchivable` JSDoc matches entity (`change.ts:1065-1073`): archivable **or** archiving; no Engine wording.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| WM-\*                   | **Implemented**                               | Availability from verdict; `CompileContext` exclusion is a consumer-spec (other batch).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SF-2                    | **Implemented**                               | `parentsOf` at `artifact-dag.ts:140-142`; tests `artifact-dag.spec.ts` “returns direct requirements via parentsOf”.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SF-3                    | **Mostly implemented**                        | `requiresForArtifact` uses `schema.artifactDag().parentsOf` when the type is in schema (`lifecycle-verdict.ts:986-994`); falls back to persisted `ChangeArtifact.requires` for unknown ids.                                                                                                                                                                                                                                                                                                                                         |
| AR-1                    | **Implemented (preview)**                     | Architecture spec-preview has **no** `evaluateLifecycle`, **no** `packages/core`, **no** `LifecycleEngine`. Package-agnostic layers + Logger exception only.                                                                                                                                                                                                                                                                                                                                                                        |
| AR-2 / LG-2             | **Implemented**                               | Domain import: `import { Logger } from '../../observability/logger.js'` (`lifecycle-verdict.ts:13`). **No** domain imports of `application/logger`. `application/logger.ts` is a re-export of observability (hosts, not domain).                                                                                                                                                                                                                                                                                                    |
| LG-1                    | **Implemented**                               | `Logger` / `NullLogger` in `observability/logger.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| LE naming hygiene       | **Partial**                                   | See discrepancies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## Discrepancies

### HIGH

_None._ Architecture preview is package-agnostic. Domain does not import `application/logger`. There is no `LifecycleEngine` class in source or `dist`. `ARTIFACT_DRIFT` remains a specified, implemented blocker (not a dist-class leftover).

### MEDIUM

#### M1 — Change spec still describes derived status as “engine” / `evaluate` (spec-wrong)

**Re-verify of prior #4 (partially still open in `core:change`, not in JSDoc of `assertArchivable`).**

- **Spec (preview `core:change`):** `pending-parent-artifact-review` is “**engine-derived** on the lifecycle verdict (`projectArtifacts` / `evaluate`)” and “belongs only on the **engine projection**.” Delta header still titled `pending-parent-artifact-review is engine-derived not persistable`. Also “**sanea** (coerce)” typo.
- **Code:** Derivation is `projectArtifacts` / `evaluateLifecycleVerdict` (plain functions). No engine type.
- **Why spec might be wrong:** Rename already landed in `core:lifecycle-engine`; change spec was not fully retitled.
- **Why code might be wrong:** N/A for naming; behavior matches the mapping rules.
- **Tests:** Entity persist/sanitize covered in change specs/tests (other surfaces); wording not asserted.
- **Prior 20260829-090131 #1 (nextHop):** **CLOSED** for `core:lifecycle-engine` / `core:change` guidance line: domain `nextHop`; “`evaluateLifecycle` attaches `nextAction.command`” (`change` delta ~221). **CLOSED** for transition-checks _domain_ projecting `nextAction` — remaining `nextAction` in TC/LE verify is the **application** public field.

#### M2 — Lifecycle verify deltas still use `nextAction.target` (spec-wrong)

- **Spec (`lifecycle-engine` verify delta):** scenarios assert `` `nextAction.target` is `implementing` `` (and `ready` / `done` / `archivable` / `archiving`). Parent heading still “Available steps and **next action**”.
- **Code / spec.md:** field is `nextAction.targetStep` (and domain `nextHop.targetStep`). Grep of `packages/core/src/application` has no `nextAction.target` (non-Step).
- **Why spec might be wrong:** leftover rename; tests already use `targetStep` / `nextHop.targetStep`.
- **Why code might be wrong:** only if a serializer still emitted `target` (not found).

#### M3 — `availableSteps` still walks `requires` independently of check results (both / residual of prior dual-algorithm)

- **Spec (LE-6):** `isReady` MUST be projected from `workflow.requires` when those results are present — MUST NOT independently re-walk `requires` to emit a second blocker **code**.
- **Code:** When `evaluationChecks` is defined, `isReady` uses the check (`184-190`) and `blockers` is `[]` (`207-210`). The function **still** filters `workflowStep.requires` for `blockingArtifacts` (`177-180`) on every extras row.
- **Why code might be wrong:** `blockingArtifacts` can diverge from check `details` if a check fails for drift vs a walk that only looks at effective status.
- **Why spec might be wrong:** status UI may still want DAG ids even when checks ran; spec only forbids a second **code**.
- **Tests:** no dedicated “blockingArtifacts empty or equal to check details when checks present” case found in this pass.

### LOW

#### L1 — Engine titles leftover (prior #4 — **OPEN**)

| Location                                        | Evidence                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle-verdict.ts:1`                        | eslint-disable: “Private **engine** helpers; public types and `evaluate()` are documented.”                                                                |
| `lifecycle-engine.ts`                           | File still exists as re-export barrel; graph public bindings still list this surface. Domain `index` exports from `lifecycle-verdict.js` (not the barrel). |
| `test/domain/services/lifecycle-engine.spec.ts` | Filename + `describe('evaluateLifecycle')` wrapping **application** `evaluateLifecycle` inside domain tests.                                               |
| `evaluate-transition-predicates.ts:22-25`       | JSDoc: “**Engine** wiring row” / “when the **engine** should invoke the check”.                                                                            |
| `core:transition-checks` Purpose                | “the **engine** attaches reusable checks”.                                                                                                                 |
| `core:change`                                   | “engine-derived” / “engine projection” (also M1).                                                                                                          |

Not a `LifecycleEngine` **class**. User constraint “No LifecycleEngine class” holds.

#### L2 — `assertArchivable` JSDoc (prior #5 — **CLOSED**)

Current JSDoc (`change.ts:1065-1069`): asserts `archivable` **or** `archiving`; throws `InvalidStateTransitionError`. No Engine language. Matches `isArchivable` getter comment.

#### L3 — Dist `LifecycleEngine` / `ARTIFACT_DRIFT` (prior #6 — **CLOSED**)

- No `class LifecycleEngine` under `packages/core/dist` (search).
- `ARTIFACT_DRIFT` is a live, specified blocker (`workflow.requires` fail on this change’s own status). Do not treat as leftover.

#### L4 — `nextArtifact` uses `ArtifactType.requires` instead of `parentsOf` (spec-wrong vs SF-3, low blast)

- Spec: required-upstream walks MUST use `parentsOf`.
- Code: `nextArtifact` uses `topologicalOrder()` then `artifactType.requires.every`.
- For schema-resident types this is the same edge set `ArtifactDag.from` built. Fallback `requiresForArtifact` already uses `parentsOf`.

#### L5 — Domain tests import application `evaluateLifecycle`

`lifecycle-engine.spec.ts` lives under `test/domain/services/` but imports `application/services/lifecycle-evaluation.js`. Global testing/layout: tests mirror src. Functional coverage is real; placement is leftover from the engine class era.

#### L6 — Mixed incomplete parents (review + `in-progress`) unspecified

`effectiveStatus` returns `in-progress` as soon as a non-review incomplete parent is seen, even if another parent is `pending-review`. Spec lists the parent-review rule first, then the in-progress rule; mixed case is implicit. No test found.

---

## Prior 20260829-090131 — re-verify

| #   | Original                                                                    | Verdict    | Evidence                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MEDIUM spec-wrong: domain projected `nextAction`                            | **CLOSED** | LE spec: `nextHop` on domain; `evaluateLifecycle` + `lifecycle-guidance.ts` for `command`. Change spec: not `GetStatus.nextAction` for `HAPPY_PATH_NEXT`. Tests: `nextHop` has no `command`. |
| 2   | MEDIUM both: complete+incomplete always parent-review vs code `in-progress` | **CLOSED** | Spec mapping split (LE-3 + schema-format cascade). Code split (`effectiveStatus`). Tests for both `in-progress` chain and `pending-parent-artifact-review`.                                  |
| 3   | MEDIUM both: `projectArtifacts` walked `artifact.requires` vs DAG           | **CLOSED** | `parentsOf` on `ArtifactDag`; `requiresForArtifact` → `schema.artifactDag().parentsOf`. Schema-format delta requires it. Residual: `nextArtifact` still uses `artifactType.requires` (L4).   |
| 4   | LOW Engine titles leftover                                                  | **OPEN**   | L1 + M1. Not a class.                                                                                                                                                                        |
| 5   | LOW `assertArchivable` JSDoc                                                | **CLOSED** | L2.                                                                                                                                                                                          |
| 6   | Dist LifecycleEngine / ARTIFACT_DRIFT                                       | **CLOSED** | L3.                                                                                                                                                                                          |

---

## Test Coverage

| Requirement                | Tests found                                                                               | Adequacy                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| LE-1 no class              | `test/public-api.spec.ts`                                                                 | Adequate                                                                           |
| LE-1 nextHop no command    | `lifecycle-engine.spec.ts` `describe('evaluateLifecycleVerdict')`                         | Adequate                                                                           |
| LE-3 in-progress cascade   | `computes effective status across dependency chains`                                      | Adequate                                                                           |
| LE-3 parent-review cascade | `downgrades complete artifacts to pending-parent-artifact-review…` + `findBlockingParent` | Adequate                                                                           |
| LE-6/LE-10 commands        | Many `nextAction.command` cases in same spec file via application `evaluate()` helper     | Adequate for commands; mixed layer                                                 |
| LE-11 DAG next artifact    | Covered in lifecycle tests / markdown-parser merge comments                               | Partial in this file; other tests mention `evaluateLifecycleVerdict` next artifact |
| SF-2 `parentsOf`           | `artifact-dag.spec.ts`                                                                    | Adequate                                                                           |
| AR/LG Logger path          | Import-site inspection; architecture verify “Domain imports ambient Logger”               | No automated “must not import application/logger from domain” test                 |
| TC along / AXIS_FALLBACK   | Transition-check specs/tests (sibling batch)                                              | Not fully re-audited here                                                          |
| `assertArchivable`         | Entity tests (sibling)                                                                    | JSDoc-only prior issue closed                                                      |

---

## Missing Tests

1. Domain file import policy: domain modules must not import `application/logger` (user-enforced; architecture exception is observability).
2. `availableSteps.blockingArtifacts` vs `workflow.requires` check `details` when both exist (M3).
3. `nextArtifact` with persisted `requires` ≠ schema `parentsOf` (SF-3 / EditChange sibling; production path uses schema).
4. Mixed upstream: one parent `pending-review`, another `in-progress` (L6).
5. Rename: assert public JSON/TOON uses `targetStep` not `target` (guards M2).
6. No test that `lifecycle-engine.ts` barrel is unused / not a class (public-api already covers exports).

---

## Spec Dependency Chain

```
default:_global/architecture
  └── default:_global/logging
        └── (ambient Logger exception)

core:schema-format  ──artifact DAG / requires cascade──►  core:workflow-model
core:change         ──persisted states / VALID_TRANSITIONS──►  core:workflow-model
core:workflow-model ──requires / axis / hooks semantics──►  core:transition-checks
core:transition-checks ──CheckResult / along / bindings──►  core:lifecycle-engine
core:change + schema-format + workflow-model + architecture + logging
  └── core:lifecycle-engine
```

Consistency notes:

- Architecture preview **does not** contradict LE by naming Core types (user-enforced). Logging preview points at architecture for the Logger exception — aligned with domain `observability/` import.
- `core:change` still says “engine projection” while `core:lifecycle-engine` forbids a class — **cross-spec leftover** (M1).
- `core:schema-format` mapping rules **match** LE-3 (split parent-review vs in-progress).
- `core:workflow-model` availability via `evaluateLifecycleVerdict` **matches** LE-9; `CompileContext` exclusion is consistent.
- `core:transition-checks` Purpose still says “engine attaches checks”; LE says functions + bindings table — **vocabulary drift** (L1), not a behavioral contradiction.
- Verify LE still uses `nextAction.target` while spec.md uses `targetStep` — **verify vs spec.md** (M2).

---

## Summary counts

|                                       | Count                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Requirements inventoried (this batch) | **~40** (11 LE + 6 TC-lifecycle + 4 CH + 4 WM + 3 SF + 3 AR + 2 LG; plus overlapping verify scenarios) |
| Implemented                           | **36**                                                                                                 |
| Partial                               | **4** (LE-6 blockingArtifacts walk; SF-3 nextArtifact requires; naming hygiene; verify field names)    |
| Missing implementation                | **0**                                                                                                  |
| Discrepancies HIGH                    | **0**                                                                                                  |
| Discrepancies MEDIUM                  | **3** (M1, M2, M3)                                                                                     |
| Discrepancies LOW                     | **6** (L1 open Engine titles; L2–L3 closed priors; L4–L6 residual)                                     |
| Prior items CLOSED                    | **#1, #2, #3, #5, #6**                                                                                 |
| Prior items OPEN                      | **#4** (Engine titles; expanded by M1)                                                                 |
| Missing tests                         | **6**                                                                                                  |

**Highest findings (≤10 lines):**  
0 HIGH. MEDIUM: change spec still says engine-derived/`evaluate`; lifecycle verify still asserts `nextAction.target` not `targetStep`; `availableSteps` still re-walks `requires` for `blockingArtifacts`. LOW OPEN: Engine titles (`lifecycle-verdict` eslint, `lifecycle-engine.ts` barrel, `lifecycle-engine.spec.ts`, check-binding JSDoc, TC Purpose). CLOSED priors: nextHop split, parent-review vs in-progress mapping, `parentsOf`, `assertArchivable` JSDoc, no dist class / `ARTIFACT_DRIFT` stays real. Architecture preview package-agnostic; domain Logger from `observability/` only.

---

## Partial file: `_partial-use-cases.md`

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change
- **Change:** `workflow-transition-checks`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** treated as reindexed per parent; navigation via `graph search` (`evaluateLifecycleVerdict`, `resolveGetStatusDeps`, class `GetStatus` at `get-status.ts:287`)
- **User-enforced:** no `domain` → `application` imports; no `LifecycleEngine` class
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior `20260829-090131` this batch:** leftover engine JSDoc on GetStatus; drafted `command` null test gap; D2 draft `projectArtifacts` vs verdict.

---

## Requirements Summary

### `core:get-status`

Previewed delta requirements (abridged, all checked):

| ID    | Requirement                                                                                                                         | Spec location (preview)                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                               | Accepts a change name as input                              |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`    | Returns the change and its artifact statuses                |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                             | Returns… / Throws ChangeNotFoundError                       |
| GS-4  | Drafted: empty `availableTransitions`; `nextAction.command` MUST NOT recommend transition/validate; `availableSteps` empty          | Drafted change read-only status / Returns lifecycle context |
| GS-5  | Drafted effective statuses via same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`)              | Drafted change read-only status                             |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only (not detector)                                 | Implementation status / Optional pre-read refresh           |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                            | Drift-aware display status                                  |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`    | Reports task completion counts / Constructor                |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                          | Execute matching predicates then project                    |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`                 | Constructor dependencies                                    |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                       | Config-based factory…                                       |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                       | Reports effective status…                                   |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping is shared with checks | Returns lifecycle context / Identifies blockers             |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                               | Graceful degradation                                        |

### `core:transition-change`

| ID   | Requirement                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 | Import `evaluateLifecycle` as module function; MUST NOT ctor `LifecycleEngine`                                                             |
| TC-2 | `to: 'next'` = `HAPPY_PATH_NEXT`; typed error when undefined (pending-spec-approval, pending-signoff, archivable, archiving, …)            |
| TC-3 | `failFastOn: 'protocol.edge'` for predicate execute                                                                                        |
| TC-4 | Approvals in place: `ready` + spec gate MUST NOT rewrite persist target to `pending-spec-approval`; stay in `ready` on `approval-required` |
| TC-5 | Task gating via `workflow.taskCompletion`; MUST NOT second `CountTasks` after green predicates                                             |
| TC-6 | `resolveTransitionChangeDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`; import `evaluateLifecycle`                                 |
| TC-7 | Constructor: changes, actor, schemaProvider, refresh, approvals, `transitionBindings` (not `RunStepHooks` / `CountTasks`)                  |

### `core:validate-artifacts`

| ID   | Requirement                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| VA-1 | Constructor without `LifecycleEngine`; DAG via `evaluateLifecycleVerdict({ checksByTarget: {} })` once at start; in-memory `markVerdictComplete` |
| VA-2 | MUST NOT hop predicates / `executeChecksByLegalTargets`                                                                                          |
| VA-3 | `resolveValidateArtifactsDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                                                  |

### `core:get-artifact-instruction`

| ID    | Requirement                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| GAI-1 | Constructor without `LifecycleEngine`; omitted `artifactId` → `evaluateLifecycleVerdict` empty `checksByTarget` → `nextArtifact` |
| GAI-2 | MUST NOT hop predicates / `availableTransitions` evaluation                                                                      |
| GAI-3 | `resolveGetArtifactInstructionDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine`                                             |

### `core:approve-spec` / `core:approve-signoff`

| ID   | Requirement                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| AS-1 | Happy path: record consent in bound `from` (`ready` / `done`); MUST NOT transition to pending parking states |
| AS-2 | Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`                           |
| AS-3 | Gate disabled → `ApprovalGateDisabledError`; ctor `approvals` from config                                    |

### `core:config`

| ID    | Requirement                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| CFG-1 | `approvals.spec` / `approvals.signoff` default false; in-place gates; new work MUST NOT require pending hops as happy path |
| CFG-2 | Config MUST NOT document pending-spec-approval as required graph hop when spec gate is on                                  |

**Global / architecture (depth-1, relevant):** inner layers never import outer (`specs/_global/architecture` layered structure). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted.

### Closed vs prior `20260829-090131` (this batch)

| Prior claim                                                    | Re-verify (this pass)                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leftover **engine JSDoc on GetStatus**                         | **PARTIAL.** `LifecycleContext.availableSteps` now says `evaluateLifecycle` (`get-status.ts:232`). **Still leftover:** `_nextActionAfterArchiveOverlap` (`:771` “so the engine can still recommend”) and `_projectReview` (`:799` “Projects engine review”). Grep of this file: only those two `engine` hits. |
| Drafted `nextAction.command === null` **test gap**             | **CLOSED.** `get-status.spec.ts:795-815` asserts `result.nextAction.command` is `null` together with empty `validTransitions` / `availableTransitions` / `availableSteps`.                                                                                                                                    |
| D2 draft `projectArtifacts` vs full `evaluateLifecycleVerdict` | **STILL OPEN (LOW).** Unchanged behaviour: `_buildDraftedResult` uses `projectArtifacts` (`:640-641`), zeros `nextArtifact` / `review.required` / checks (`:673-714`). Test still spies that `evaluateLifecycle` is **not** called (`:849-852`).                                                              |

### Per-spec implementation

**GetStatus — IMPLEMENTED (contracts hold)**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`. Domain `projectArtifacts` imported from `lifecycle-verdict.js` (`:12-17`).
- Active path: `projectArtifacts` `:452` → `executeChecksByLegalTargets` `:457-463` (no `failFastOn`) → archive predicates when `archivable` `:465-479` → `evaluateLifecycle` `:481-484`. Task paint `taskCompletionFromChecks` then `evaluateLifecycle` (order test `:387-434`, `CountTasks` once `:430`).
- Drafted: `_buildDraftedResult` `:621-715` — empty hops `:673-676`, `nextAction.command: null` `:709-713`. Effective status via `projectArtifacts` (same DAG helper `evaluateLifecycleVerdict` uses internally).
- Schema fail: `try/catch` `SchemaNotFoundError` `:395-430`; `validTransitions` from `VALID_TRANSITIONS`; `availableTransitions` stays `[]`.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187` (`change-state.ts:49-58`; pending/archivable/archiving omitted).
- `executeMatchingPredicates(..., { failFastOn: 'protocol.edge' })` `:202-216`.
- `evaluateLifecycle` `:219-223` with `checksByTarget: { [requestedTarget]: evaluation.checks }`.
- Persist target is `requestedTarget` (`effectiveTarget = requestedTarget` `:217`); comments `:48-50` forbid pending rewrite.
- `resolveTransitionChangeDeps` `composition/use-cases/transition-change.ts:41-50` — no lifecycle key.

**ValidateArtifacts — IMPLEMENTED**

- `evaluateLifecycleVerdict` + `{ checksByTarget: {} }` `:220-222`.
- `markVerdictComplete` `:226-234`.
- Ctor `:136-154` — no engine.
- `resolveValidateArtifactsDeps` `composition/use-cases/validate-artifacts.ts:38-53` — no lifecycle.

**GetArtifactInstruction — IMPLEMENTED**

- `evaluateLifecycleVerdict` `{ checksByTarget: {} }` `:97-99`; `resolvedId = input.artifactId ?? lifecycle.nextArtifact` `:100`.
- Ctor `:66-72` — no engine.
- `resolveGetArtifactInstructionDeps` `composition/use-cases/get-artifact-instruction.ts:37-48` — no lifecycle.

**ApproveSpec / ApproveSignoff — IMPLEMENTED (in-place consent)**

- ApproveSpec: `boundFromStates('approval.spec')`; drain only if `pending-spec-approval` (`approve-spec.ts:86-98`). Ready path does not `transition` to pending. Class JSDoc `:22-24` names the binding table / drain, not a removed engine class.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` — repositories, hasher, `approvals` only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:219-220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Preview: stay in `ready`/`done`; `approvals.spec: true` wait is the check, not a pending hop (`core:config` verify “Spec gate on does not require pending-spec-approval in the graph”).

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain (`:1-12`).

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

Matches the assigned contract.

**`HAPPY_PATH_NEXT` / fail-fast protocol**

- Table: `change-state.ts:49-58`.
- GetStatus collects all fails: `executeChecksByLegalTargets` calls `executeMatchingPredicates` **without** `failFastOn` (`execute-matching-predicates.ts:219-231`).
- TransitionChange fail-fast: `failFastOn === result.id` (`:143-147`) with `'protocol.edge'`.

**`LifecycleEngine` class**

- Search under `packages/core`: **no** `class LifecycleEngine`. Graph class `GetStatus` is the use case, not an engine.

---

## Discrepancies

### D1 — LOW — leftover “engine” **wording** (GetStatus JSDoc + some spec/verify titles)

**Evidence (code):** `get-status.ts:771`, `:799` still say “engine”. **Improved vs 090131:** `:232` no longer says “from the engine”. ApproveSpec/Signoff class comments no longer say “engine binds”. `workflow-requires.ts` no longer uses “Engine bindings” in the runner header.

**Evidence (spec):** GetStatus “availableSteps MUST be … from the **engine**”; GAI verify scenario title “Omitted artifactId uses **engine-derived** readiness”; ApproveSpec depends-on text “engine check bindings”.

**Option A (prefer for wording):** Specs and remaining comments still name the removed class; behaviour already uses `evaluateLifecycle` / `evaluateLifecycleVerdict` / `boundFromStates`. Update wording to those names.

**Option B:** Treat leftover “engine” as a remaining `LifecycleEngine` abstraction — **rejected by search**: no `class LifecycleEngine`.

**Severity:** documentation / spec-preview drift, not a ctor/import violation.

### D2 — LOW — drafted GetStatus does not call `evaluateLifecycleVerdict`

**Spec:** compute effective statuses via the same DAG as `evaluateLifecycleVerdict` with empty `checksByTarget` (`projectArtifacts`). Also (result requirement): compute artifact **and lifecycle projections** for inspection; MUST NOT surface mutating transitions.

**Code:** `projectArtifacts` only (`get-status.ts:640-667`). Lifecycle inspection fields zeroed (`validTransitions: []`, `nextArtifact: null`, empty checks, `review.required: false`). Test **asserts** `evaluateLifecycle` is not called (`get-status.spec.ts:818-852`).

**Option A:** Spec’s parenthetical `projectArtifacts` plus “MUST NOT surface transitions” is the intended draft path; empty lifecycle extras are correct. Parent-review cascade is covered (`pending-parent-artifact-review` `:853-855`).

**Option B:** Spec wants a full `evaluateLifecycleVerdict(..., { checksByTarget: {} })` for inspection (`nextArtifact`, review) while still emptying mutation surfaces. Then code under-projects `nextArtifact`/review on drafts.

**Assessment:** functional contract for **empty transitions / null command / parent-review cascade** is met. Gap is only whether draft inspection must include verdict `nextArtifact`/`review`. Unchanged since 090131.

### D3 — INFO — GetStatus `LifecycleContext.availableSteps` comment vs D1

Comment `:232` now matches `evaluateLifecycle`. Remaining engine language is D1 (`:771`, `:799`).

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no `lifecycle:` composition stub on these `resolve*Deps`. **Compliant.**

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                    | Verdict                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`               | Covered (deps object has no lifecycle field)            |
| Drafted empty transitions / steps / **command null**                  | `get-status.spec.ts:795-815`                                         | **Covered** (`command` `:815`; `availableSteps` `:812`) |
| Drafted parent-review cascade; no `evaluateLifecycle`                 | `get-status.spec.ts:818-858`                                         | Covered                                                 |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)     | Covered                                                 |
| Recount on second `GetStatus.execute`                                 | `get-status.spec.ts:437+`                                            | Covered                                                 |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)            | `execute-matching-predicates.spec.ts:43`                             | Covered (runner, not UC integration)                    |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215` | Covered                                                 |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`    | Covered                                                 |
| Approvals stay in `ready`                                             | `transition-change.spec.ts:377-391`                                  | Covered                                                 |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241-264`                                 | Covered                                                 |
| GAI empty `checksByTarget`                                            | `get-artifact-instruction.spec.ts:98-104`                            | Covered                                                 |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-71`                                    | Covered                                                 |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                         | Covered                                                 |
| ApproveSignoff stays in `done`                                        | `approve-signoff.spec.ts:72-89`                                      | Covered                                                 |

---

## Missing Tests

| Gap                                                                  | Spec                | Suggested assertion                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafted `evaluateLifecycleVerdict` not required vs spec dual wording | GS-5 / D2           | If Option A: keep `projectArtifacts` / parent-review only (current). If Option B: spy `evaluateLifecycleVerdict` once with `{ checksByTarget: {} }` and assert `nextArtifact`/`review` from verdict |
| GAI verify title “engine-derived”                                    | GAI verify          | Rename scenario; keep existing `evaluateLifecycleVerdict` spy                                                                                                                                       |
| Composition never resolves `lifecycle`                               | GS-11 / TC-6 / VA-3 | Optional: assert deps object keys omit `lifecycle` (shape already implied by composition tests)                                                                                                     |
| GetStatus hop with two fails on **use case** (not only runner)       | GS-9                | Runner test exists; optional UC-level two-fail hop                                                                                                                                                  |

**Closed vs 090131:** drafted `nextAction.command === null` is **no longer missing**.

No missing test for **second CountTasks on GetStatus** — `toHaveBeenCalledTimes(1)` on a single execute is present.

---

## Spec Dependency Chain

From `changes status` / preview `## Spec Dependencies` (depth 1, assigned specs):

- **core:get-status** → `core:change`, `core:kernel`, `core:transition-change`, `core:schema-format`, `core:config`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:transition-change** → `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`
- **core:validate-artifacts** → `core:change`, `core:change-layout`, `core:change-manifest`, `core:lifecycle-engine`, `core:delta-format`, `core:selector-model`, `core:storage`, `default:_global/architecture`, `core:spec-id-format`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:get-artifact-instruction** → `core:delta-format`, `core:change`, `core:schema-merge`, `core:template-variables`, `core:lifecycle-engine`, `core:schema-format`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-spec** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:approve-signoff** → `core:change`, `core:schema-format`, `core:composition`, `core:kernel`, `core:composition-resolver`, `core:transition-checks`
- **core:config** → `core:vcs-adapter-port`, `default:_global/architecture`, `core:transition-checks`

**Consistency note:** several specs still **depend on** `core:lifecycle-engine` while implementation uses `evaluateLifecycle` / `evaluateLifecycleVerdict`. That is a **spec-id naming** leftover (the engine spec now describes functions). Not a code import of a class.

**Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

---

## Summary counts

| Metric                                | Count                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| Specs in this batch                   | 7                                                                  |
| Requirements tracked (tables above)   | 32                                                                 |
| Implemented (behaviour)               | 31–32 (all listed contracts hold; D2 is optional extra projection) |
| Partial / wording-only                | 1 (D1 leftover “engine” on GetStatus `:771`, `:799` + spec titles) |
| Functional discrepancies              | 0 HIGH; 1 LOW optional (D2 draft verdict vs `projectArtifacts`)    |
| Missing tests                         | 0 required for GS-4 command null; 1 optional (D2 verdict spy)      |
| Prior leftover GetStatus engine JSDoc | **PARTIAL** (`:232` fixed; `:771`/`:799` remain)                   |
| Prior drafted `command` null test     | **CLOSED** (`get-status.spec.ts:815`)                              |
| Prior D2                              | **OPEN (LOW)**                                                     |
| `LifecycleEngine` class               | **ABSENT**                                                         |
| domain → application imports          | **ABSENT**                                                         |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)                            |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`; tests spy empty bag)                                 |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (GetStatus, TransitionChange, ValidateArtifacts, GAI, ApproveSpec, ApproveSignoff) |
| Drafted GetStatus empty hops + `command` null                    | **PASS** (code `:675-713`; test `:815`)                                                     |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`; tests `:20-71`)                                     |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`; runner tests)                                                             |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`; pending/archivable tests)                    |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready` / `done`)              |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430` one execute)                     |

---

## Partial file: `_partial-archive-hooks.md`

# Spec-compliance audit (partial): archive-change / hook-execution-model / storage

**Change:** `workflow-transition-checks`  
**Mode:** change  
**Assigned specs:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**CLI:** `node packages/cli/dist/index.js` (`changes spec-preview workflow-transition-checks <specId>`)  
**Graph:** `stale: false`, `contentFresh: true` (`graph stats`). Navigation via `graph search` + targeted reads.  
**Scope note:** Storage is audited against the change-preview cascade rule this batch was assigned (`projectArtifacts` / `effectiveStatus` functions; no `Change.effectiveStatus()`; no `LifecycleEngine` class). Fs-cache layout, archive pattern catalog, locks, and named factories are not re-litigated here.  
**Prior 090131 LOW (re-verify):** overlap host `list`/`get` before predicates; dual `runDepsConsistent`; `assertArchivable` JSDoc; domain hook stub comments.

Neither spec nor code is treated as sole truth. Evidence is `path:line`.

---

## Requirements Summary

### `core:archive-change` (change preview)

| Requirement                                 | Spec intent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor                       | Inject `archiveBindings`; no `RunStepHooks` / `HookRunner` / `projectWorkflowHooks` on the use case. `ListWorkspaces`, parsers, `MaterializeSpecMetadata`, hasher, batch snapshot.                                                                                                                                                                                                                                                                                                                                                                                |
| Archive bindings not RunStepHooks           | `resolveArchiveChangeDeps` takes `archiveBindings` from `resolveWorkflowCheckRegistry`; no `runStepHooks` on `ArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Input                                       | `name`, `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`, `allowOutOfScope`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Schema name guard                           | Evaluate `schema.nameMatch` on operation `archive` **before** archivable guard, hooks, file writes. Matching predicates `failFastOn: 'schema.nameMatch'`. **Host MUST NOT `list()`/`get()` other active changes before predicates return.** Overlap peer loading MAY run after a failed `spec.overlap` or when `allowOverlap` invalidation is required.                                                                                                                                                                                                           |
| Archivable guard                            | `archive.archivable` / `change.assertArchivable()`; allow `archivable` **or** `archiving`. Not a lifecycle hop. **`approval.signoff` MUST NOT be bound on archive.**                                                                                                                                                                                                                                                                                                                                                                                              |
| Deferred `archiving`                        | After full-batch preflight + snapshots; mutate then `transition('archiving')` if not already `archiving`. Hooks use workflow step `archiving` while lifecycle may still be `archivable`.                                                                                                                                                                                                                                                                                                                                                                          |
| Shared runners                              | Predicates: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly` + `deps.consistent` (same runners as enter-`ready`; archive facts = **sealed** `dependsOn`), `impl.filesResolved` + `impl.linksInScope`. No `archive.publication` binding. Remaining merge/publish preflight stays **inside** `ArchiveChange`. **After merge extract, re-run `runDepsConsistent` against sidecar `finalDependsOn` (merge-time sealed set).** Named predicate uses pre-merge sealed set; private pass is merge-time comparison, not a second algorithm. |
| Overlap / readOnly                          | After archivable, before hooks; overlap skippable; readOnly uses same runner as enter-`ready`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Pre/post hooks                              | Effects selected by **binding `phase`**, not `check.id`. `before-persist` + `abort`; `after-persist` + `collect`. Skip selectors skip effects only.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Plan / snapshot / restore / metadata / lock | Unchanged atomic archive contract (preflight, staged publish, restore, `MaterializeSpecMetadata` post-move).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Factory                                     | `createArchiveChange` via `resolveArchiveChangeDeps`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### `core:hook-execution-model` (archive-facing)

| Requirement                  | Spec intent                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two hook types               | `instruction:` never executed; `run:` via `HookRunner` / `RunStepHooks`.                                                                                                                                                              |
| Default execution            | `ArchiveChange` auto-runs matching `run:` effects after predicates; slot/policy from binding (`phase`, `onFailure`). No private “always source.post” path; no branch on `hook.pre`/`hook.post` **ids** for timing/policy/skip/launch. |
| `RunStepHooks` placement     | Constructor dep of **hook checks**, not of `ArchiveChange`.                                                                                                                                                                           |
| Skip                         | `skipHookPhases`: `pre` / `post` / `all`; predicates still run.                                                                                                                                                                       |
| Fail-fast pre / collect post | Pre abort + no files; post collect + no rollback.                                                                                                                                                                                     |
| Change entity                | Must not execute hooks.                                                                                                                                                                                                               |
| Template tokens              | `HookVariables` without `{{change.workspace}}` (HookRunner / template spec; not re-proven in this file beyond hook check wiring).                                                                                                     |

### `core:storage` (assigned focus)

| Requirement                 | Spec intent                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact dependency cascade | Cascade owned by `projectArtifacts` / `effectiveStatus` (see lifecycle-engine **functions**). **No** `Change.effectiveStatus()` method. Load-time file status remains hash-derived on the repository. |

---

## Implementation Status

### `failFastOn: 'schema.nameMatch'` — **still implemented**

- `ArchiveChange.execute` calls `executeMatchingPredicates(..., { failFastOn: 'schema.nameMatch' })` (`packages/core/src/application/use-cases/archive-change.ts:280–292`).
- Runner stops later **predicate** `execute` when that id fails (`packages/core/src/application/services/execute-matching-predicates.ts:129–148`).
- Unit test: `packages/core/test/application/services/execute-matching-predicates.spec.ts:105–138` (`later` for `archive.archivable` not called).
- Failures map through `throwMappedArchiveFailure` including `schema.nameMatch` → `SchemaMismatchError` (`archive-change.ts:1300–1309`).
- Integration throws `SchemaMismatchError` (`archive-change.spec.ts:273–287`) but does **not** assert peer `list`/`get` were skipped.

### Overlap host load after predicates — **prior 090131 LOW closed**

- Spec now: host MUST NOT `list()`/`get()` other active changes **before predicates return**; MAY load after failed `spec.overlap` or `allowOverlap` invalidation (preview Requirement: Schema name guard).
- Code: predicates first (`archive-change.ts:280–293`); `needsOverlapScan` is overlap fail **or** (`failedPredicates.length === 0 && allowOverlap`) (`:294–303`); then `_loadArchiveOverlap` (`:1063–1080`).
- On schema mismatch, `failFastOn` leaves `failedPredicates` with `schema.nameMatch` only → `needsOverlapScan` is false → host peer load skipped.
- Named `spec.overlap` still lists peers **during** its own `execute` via registry `includeOverlapDetection` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:41–62`; `spec-overlap.ts:72–80`). That is the overlap **predicate**, after `schema.nameMatch` in table order (`check-bindings.ts:85–87`). Not host prefetch before predicates.
- Overlap-fail / `allowOverlap` paths still pay **two** peer scans (check + host). Spec explicitly allows the second scan for error mapping / invalidation. Treated as efficiency leftover, not a MUST violation.

### Dual `runDepsConsistent` — **prior 090131 LOW closed as spec gap**

- Spec now: “After merge extract, `ArchiveChange` MUST re-run `runDepsConsistent` against sidecar `finalDependsOn`… The named `deps.consistent` predicate uses the pre-merge sealed set; the private pass is the merge-time comparison, not a second algorithm.”
- Named archive predicate: `createDepsConsistent` uses `loadArchiveSealedDependsOnBySpecId` when `attempt.scope === 'archive'` (`packages/core/src/application/checks/deps-consistent.ts:59–68`; loader `packages/core/src/application/services/ready-predicate-facts.ts:97–113`).
- Merge-time pass: `_prepareArchivePreflight` → `_assertArchiveDepsConsistent` (`archive-change.ts:781`, `:1150–1177`) calling `runDepsConsistent` on extract vs `finalDependsOn`.
- Same domain runner; two **times** (pre-merge sealed vs merge-time sidecar), as specified. Not a duplicate algorithm.

### `isArchivable` includes `archiving` — **still implemented**

- Getter: `state === 'archivable' || state === 'archiving'` (`packages/core/src/domain/entities/change.ts:668–671`).
- `assertArchivable()` uses that getter (`:1070–1073`).
- Domain `runArchiveArchivable` (`packages/core/src/domain/checks/archive-archivable.ts:18–25`, `:44–45`).
- Tests: `packages/core/test/domain/entities/change.spec.ts:1075–1119`.

### `assertArchivable` JSDoc — **prior 090131 LOW closed**

- Comment and `@throws` now say `archivable` **or** `archiving` (`change.ts:1065–1068`). Matches getter and archive-change Archivable guard.
- Error still uses target `'archivable'` (`:1072`) — historical `InvalidStateTransitionError(from, 'archivable')` shape, not comment drift.

### Domain hook stub comments — **prior 090131 LOW closed**

- `hook-pre.ts:3–17` / `hook-post.ts:3–17`: domain `execute` always skip; comments state application `createHookPre` / `createHookPost` run `RunStepHooks`.

### Archive bindings + composition — **aligned**

- `ArchiveChange` ctor arg 4 is `archiveBindings` (`archive-change.ts:202`, `:222–248`). No `RunStepHooks` / `HookRunner` on the class (`rg` in that file: none).
- `resolveArchiveChangeDeps` sets `archiveBindings: registry.archiveBindings` (`packages/core/src/composition/use-cases/archive-change.ts:134–148`). `ArchiveChangeDeps` has no `runStepHooks` (`:105–118`). Factory constructs with bindings only (`:191–205`).
- Registry table: `ARCHIVE_BINDING_SPECS` (`check-bindings.ts:84–94`) has no `approval.signoff`. Signoff is **only** `done → archivable` forward (`TRANSITION_BINDING_SPECS` `:61–65`).
- Effects: `matchingEffects(..., 'before-persist'|'after-persist')` (`archive-change.ts:323–347` and post-persist loop). Skip via `ctx.skipHookPhases` in `HookEffectCheck` (`hook-effect-shared.ts:131–147`), not use-case `check.id` switch. Archive step `'archiving'` (`hookStep` `:18–21`).
- Factories: `createHookPre` / `createHookPost` (`hook-pre.ts:12–14`, `hook-post.ts`). Registry attaches `RunStepHooks` (`workflow-check-registry.ts:67–74`).
- `Change` has no hook runner (entity `change.ts`).

### Storage / layering (user-enforced) — **still aligned**

- `projectArtifacts` is a **function** (`lifecycle-verdict.ts:309–324`), re-exported from barrel `packages/core/src/domain/services/lifecycle-engine.ts:1–18` (no class).
- Graph / `rg`: **no** `class LifecycleEngine` under `packages/core`.
- `Change.effectiveStatus(`: **no** matches in `change.ts`.
- Domain → application imports: `rg` over `packages/core/src/domain` found **zero** `from '...application/'`. Mentions of “application” in domain are comments / `DeltaApplicationError` / layering notes, not imports.

### CLI (other batch; observed)

- Core allows archive from `archiving` (`change.ts:669–670`). CLI archive command is not re-audited here.

---

## Discrepancies

### HIGH

None in this Core archive / storage / hooks batch.

### MEDIUM

None. Prior `failFastOn: 'schema.nameMatch'` remains implemented.

### LOW

None remaining from the 090131 set:

| Prior 090131 LOW                       | Re-verify                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Overlap `list`/`get` before predicates | **Closed.** Host load gated (`archive-change.ts:294–303`). Spec updated to allow post-predicate load.                          |
| Dual `runDepsConsistent`               | **Closed.** Spec documents merge-time second pass; code matches (`deps-consistent.ts:59–68` + `_assertArchiveDepsConsistent`). |
| `assertArchivable` JSDoc               | **Closed.** (`change.ts:1065–1068`)                                                                                            |
| Domain hook stub comments              | **Closed.** (`domain/checks/hook-pre.ts:3–4`, `hook-post.ts:3–4`)                                                              |

**Optional leftover (not a MUST fail):** overlap-fail / `allowOverlap` still lists peers in `spec.overlap` **and** again in `_loadArchiveOverlap`. Spec permits the host scan; it does not require a single scan. No severity bump.

---

## Test Coverage

| Area                                                     | Evidence                                                                                                                                        | Verdict                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `failFastOn: 'schema.nameMatch'`                         | `execute-matching-predicates.spec.ts:105–138`                                                                                                   | Covered at runner unit level                                                                           |
| Schema mismatch throws                                   | `archive-change.spec.ts:273–287`                                                                                                                | Covered (error type); host `list` skip **not** asserted                                                |
| `isArchivable` / `assertArchivable` includes `archiving` | `change.spec.ts:1075–1119`                                                                                                                      | Covered                                                                                                |
| Archive skip hooks `all` / `pre` / `post`                | `archive-change.spec.ts` (~1837+, `'pre'` ~1961, `'post'` ~1992); `HookEffectCheck` skip by archive selectors (`hook-effect-shared.ts:136–142`) | Covered at use-case integration                                                                        |
| `createHookPre` uses `RunStepHooks`                      | `workflow-check-factories.spec.ts:21–40`                                                                                                        | Covered (transition attempt, not archive scope)                                                        |
| Archive hook phases / collect                            | `transition-checks.spec.ts:256–270` (`before-persist`/`abort`, `after-persist`/`collect`)                                                       | Covered                                                                                                |
| Shared `deps.consistent` object on transition + archive  | `transition-checks.spec.ts:213–217`                                                                                                             | Covered (identity of domain check object)                                                              |
| `approval.signoff` on transitions                        | `transition-checks.spec.ts:220–253` (`from: done`, `to: archivable`)                                                                            | Covered for **transition** table; archive absence is implicit via `ARCHIVE_BINDINGS` loop (`:207–210`) |
| Storage `projectArtifacts`                               | `lifecycle-engine.spec.ts` uses `projectArtifacts`                                                                                              | Function exists; no `Change.effectiveStatus` tests needed if method absent                             |
| Domain no application imports                            | static `rg`                                                                                                                                     | Structural, not a runtime test                                                                         |

---

## Missing Tests

1. **ArchiveChange integration:** schema mismatch does **not** call `ChangeRepository.list` / peer `get` (would lock the host-deferral fix). Current test only expects `SchemaMismatchError`.
2. **ArchiveChange integration:** `failFastOn` with real `createSchemaNameMatch` + spies that `archive.archivable` / `spec.overlap` `execute` are not called — currently only the generic runner test with stub checks.
3. **Sealed vs merge `deps.consistent`:** `loadArchiveSealedDependsOnBySpecId` vs `_assertArchiveDepsConsistent` agreement / disagreement (no test hits for those names under `packages/core/test`).
4. **`approval.signoff` absent from `archiveBindings`:** explicit assertion that `ARCHIVE_BINDING_SPECS` / `ARCHIVE_BINDINGS` has no signoff row (today only “every archive row has archive applicability”).
5. **`HookEffectCheck` unit:** `skipHookPhases` `pre`/`post`/`all` with `attempt.scope === 'archive'` (factory test still uses a **transition** attempt; use-case tests already cover archive skip).

CLI retry-from-`archiving` remains other-batch.

---

## Spec Dependency Chain

From change-preview `core:archive-change` **Spec Dependencies** (depth 1):

- `core:change`
- `core:schema-format`
- `core:delta-format`
- `core:validate-artifacts`
- `core:storage`
- `core:run-step-hooks`
- `core:hook-execution-model`
- `core:template-variables`
- `core:spec-metadata`
- `core:content-extraction`
- `default:_global/architecture`
- `core:workspace`
- `core:spec-id-format`
- `core:spec-overlap`
- `default:_global/logging`
- `core:spec-lock`
- `default:_global/error-handling-conventions`
- `core:regenerate-spec-metadata`
- `core:spec-optimization`
- `core:initialize-persisted-spec-state`
- `core:composition-resolver`
- `core:transition-checks`

**Consistency with globals / deps (this batch):**

- **Architecture / user rule:** domain does not import application. Hook I/O is in `application/checks`. No `LifecycleEngine` class. `projectArtifacts` is a domain **function**, re-exported from `lifecycle-engine.ts` barrel — aligns with storage’s “no `Change.effectiveStatus()` / cascade via `projectArtifacts`”.
- **`core:transition-checks`:** archive table + shared runners match “share runners”; `approval.signoff` is transition-only.
- **`core:hook-execution-model` vs archive-change:** “delegated to `RunStepHooks`” vs “MUST NOT take `RunStepHooks`” is resolved by injecting `RunStepHooks` into `createHookPre`/`createHookPost` only (`workflow-check-registry.ts:67–74`).
- **`core:storage`:** assigned cascade rule matches code (`lifecycle-verdict.ts:309–323`). Full fs-cache / pattern catalog not audited in this partial.
- **Prior spec-vs-code tension on dual deps:** preview now documents merge-time second pass — consistent with `_assertArchiveDepsConsistent`.

---

## Summary counts

| Spec                            | Req. headings in preview (approx.) |                                                                                                              Implemented as specified |                                        Partial / leftover |  HIGH | MEDIUM |   LOW |                                 Untested gaps (this batch) |
| ------------------------------- | ---------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------: | ----: | -----: | ----: | ---------------------------------------------------------: |
| `core:archive-change`           |                                ~31 | Bindings, fail-fast nameMatch, deferred host overlap load, archiving retry, effects by phase, merge-time `runDepsConsistent`, factory | Dual overlap I/O on fail/`allowOverlap` (allowed by spec) |     0 |      0 |     0 | 3 (list skip lock, real-factory failFast, merge-time deps) |
| `core:hook-execution-model`     |               ~12 archive-relevant |                                                              `createHook*` + `HookEffectCheck` skip/policy; Change does not run hooks |                                   Domain comments aligned |     0 |      0 |     0 |                    1 optional (archive-scope factory unit) |
| `core:storage` (assigned slice) |                1 cascade + related |               `projectArtifacts` function; no `Change.effectiveStatus`; no `LifecycleEngine` class; domain has no application imports |                                                         — |     0 |      0 |     0 |                                                          0 |
| **Totals**                      |                                    |                                                                                                                                       |                                                           | **0** |  **0** | **0** |                                         **5** listed above |

**Prior 090131 LOW (4):** all **closed** (code and/or spec).  
**Re-verify user list:** `failFastOn schema.nameMatch` **yes**; `isArchivable` includes `archiving` **yes**; no `LifecycleEngine` class **yes**; no `Change.effectiveStatus` **yes**; domain no application imports **yes**.

---

## Partial file: `_partial-cli-skills.md`

# Spec-compliance audit (partial): CLI + skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Read-only.** Graph `stale: false` (indexed `2026-08-29T10:57:16.886Z`). Specs via `changes spec-preview`.  
**Prior 090131 (this batch):** drafted JSON empty hops CLOSED; HIGH archive archivable-only CLOSED; leftover LOW help vs nested lifecycle hops CLOSED (help updated); archive description CLOSED; skills verify/archive `archivable` **or** `archiving` CLOSED; drafted command-leak test PRESENT; gerund blocker test PRESENT; archive no GetStatus preflight PRESENT.

---

## Requirements Summary

### `cli:change-status` (16 requirements)

| ID  | Requirement                        | Intent                                                                                                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| S1  | Command signature                  | `change status <name> [--format text\|json\|toon]`                                                                           |
| S2  | Drafted status is read-only        | No mutating hops; mark drafted; MAY show artifacts                                                                           |
| S3  | Output format                      | `artifactDag[].hasTasks`; DAG `state` is display projection                                                                  |
| S4  | Task completion in DAG             | `[hasTasks - N/M done]` vs `[hasTasks]` fallback; JSON `hasTasks` boolean                                                    |
| S5  | Display-state rendering            | Text uses display states; JSON has canonical + display                                                                       |
| S6  | Lifecycle from GetStatus checks    | No local `VALID_TRANSITIONS`-only filter                                                                                     |
| S7  | Text omits duplicated review files | `review:` header without `affectedArtifacts` paths; overlap peers still print                                                |
| S8  | Text blockers include check labels | `! CODE — <gerund>: <message>`; JSON `label`/`checkId`                                                                       |
| S9  | Schema version warning             | stderr warning vs `lifecycle.schemaInfo`; skip if null; exit 0                                                               |
| S10 | Change not found                   | exit 1, `error:`                                                                                                             |
| S11 | Schema-derived fields              | nested `schema.artifactDag` via `artifactDag()`/`childrenOf`; text DAG roots/children; display status; convergent nodes once |
| S12 | Delegates refresh to GetStatus     | no `RefreshImplementationTracking` / detector                                                                                |
| S13 | Implementation section             | SDK projection only                                                                                                          |
| S14 | Task completion in details         | `tasks: N/M`                                                                                                                 |
| S15 | Basic info                         | name + state; no standalone `specs:` list                                                                                    |
| S16 | Specs and dependencies             | text section + JSON `specDependsOn`                                                                                          |

**Constraints (binding):** no SchemaRegistry/`config show` to recompute **lifecycle**; drafted `nextAction.command` `(none)` / JSON `null`; drafted JSON `availableTransitions`/`availableSteps` `[]` even if Core leaked hops; no second VALID_TRANSITIONS filter.

### `cli:change-transition` (14 requirements)

| ID  | Requirement                | Intent                                                                                         |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| T1  | Command signature          | `<name> <step>` or `--next`; `--skip-hooks`; `--allow-out-of-scope` → `impl.linksInScope` only |
| T2  | Next-transition resolution | `to: 'next'` to Core; no CLI routing table; no `GetStatus.nextAction` as resolver              |
| T3  | Delegates refresh          | preflight + repair `GetStatus` with `refreshImplementationTracking: false`                     |
| T4  | Approval-gate routing      | no gate flags on execute; no rewrite to pending parking                                        |
| T5  | Hook execution             | map `--skip-hooks` to `skipHookPhases`                                                         |
| T6  | Progress output            | generic check bus; `stream: "change-transition"`; no `hook-progress`                           |
| T7  | Hook observability         | progress before hook-triggered failure                                                         |
| T8  | Shared hook progress       | distinct stream from `run-hooks`                                                               |
| T9  | Output on success          | text confirmation; JSON terminal `complete`/`ok`                                               |
| T10 | Post-hook failure          | exit 2, `error:`; not a warning state                                                          |
| T11 | Invalid transition         | exit 1; Repair Guide on stderr with gerund labels; JSON `failure` complete record              |
| T12 | Incomplete tasks           | exit 1 naming artifact                                                                         |
| T13 | Check progress rendering   | gerund `(id)`; `✓`/`✗`; no `Executing:`                                                        |
| T14 | Unsatisfied requires       | exit 1                                                                                         |

**Constraints:** help must not expose from→to routing; repair data from Core; `HookFailedError` is not repair-guide; text progress on stderr, confirmation on stdout.

### `cli:change-approve` (7 requirements)

| ID  | Requirement               | Intent                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | Command signatures        | `approve spec\|signoff <name> --reason` (required)                                                     |
| A2  | Delegates gate state      | `{ name, reason }` only; `kernel.changes.*` not `kernel.specs.*`                                       |
| A3  | Artifact hash computation | CLI must not compute/pass hashes                                                                       |
| A4  | Approve spec              | bound-`from` `ready` (+ drain `pending-spec-approval`); stay in `ready`; help uses bound-from language |
| A5  | Approve signoff           | bound-`from` `done` (+ drain); stay in `done`                                                          |
| A6  | Output on success         | `approved <gate> for <name>` / JSON `{ result, gate, name }`                                           |
| A7  | Error cases               | missing reason, wrong state, not found → exit 1                                                        |

### `cli:change-archive` (10 requirements)

| ID  | Requirement                  | Intent                                                                                                                     |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | Command signature            | `changes archive` canonical; `change archive` alias; skip phases `pre,post,all`; `--allow-overlap`; `--allow-out-of-scope` |
| R2  | Prerequisites                | `archivable` **or** `archiving`; Core `assertArchivable`; **no** CLI-only archivable-only table                            |
| R3  | Behaviour                    | delegate merge/move/history to `ArchiveChange`                                                                             |
| R4  | Hook execution               | map `--skip-hooks` to archive phase set                                                                                    |
| R5  | Check progress rendering     | same gerund bus as transition; stream `change-archive`                                                                     |
| R6  | Post-archive hooks           | exit 2 on post failures                                                                                                    |
| R7  | Output on success            | path line; omit invalidated section when empty                                                                             |
| R8  | Output on success (extended) | invalidated list / JSON array                                                                                              |
| R9  | JSON output on success       | NDJSON `stream: "change-archive"` complete; **no** second unwrapped `{ result: "ok" }`                                     |
| R10 | Error cases                  | not found / not archivable-or-archiving / merge fail → exit 1; stderr names current state                                  |

### `skills:skill-templates-source` (19 requirements; change-relevant subset called out)

| ID     | Requirement                                                               | Change-relevant?                                                                              |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| K1–K10 | Template tree, metadata, Handlebars, graph wording, snippets, frontmatter | Baseline (still in force)                                                                     |
| K11    | Implementation tracking copy                                              | Yes (shared/archive/implement)                                                                |
| K12    | Metadata self-healing                                                     | Yes (archive)                                                                                 |
| K13    | Optimizer gating                                                          | Baseline                                                                                      |
| K14    | Agent-facing command roles                                                | Yes (archive/shared)                                                                          |
| K15    | **In-place approval gates**                                               | **Yes** — stay in `ready`/`done`; pending drain-only; archive `archivable` **or** `archiving` |
| K16    | Verify/implement tracking drain                                           | Yes                                                                                           |
| K17    | Archive `--skip-hooks pre` not `all`                                      | Yes                                                                                           |
| K18    | Design review scope                                                       | Yes                                                                                           |
| K19    | OVERLAP_CONFLICT live-archive only                                        | Yes                                                                                           |

**Direct dependencies (depth 1, not fully re-audited here):** `cli:entrypoint`, `core:change`, `core:get-status`, `core:transition-change`, `core:transition-checks`, `core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`, `sdk:build-implementation-review`, `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`.

No contradiction found between these change specs and `core:transition-checks` in-place gates (CLI/skills describe stay-in-state + human approve; pending is drain).

---

## Implementation Status

### `cli:change-status` — `packages/cli/src/commands/change/status.ts`

| Req     | Status          | Evidence                                                                                                                                                                                                                                   |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1      | **Implemented** | `status <name>`, `--format`, `--implementation`                                                                                                                                                                                            |
| S2      | **Implemented** | `draftView` branch: text `(drafted)`, transitions `(none — change is drafted)`, `command: (none)`; JSON `isDrafted: true`, `availableTransitions: []`, `availableSteps: []`, `nextAction.command: null` even when Core leaked hops/command |
| S3–S5   | **Implemented** | DAG `state` from `displayStatus`; JSON files include `state` + `displayStatus`; `hasTasks` boolean                                                                                                                                         |
| S6      | **Implemented** | Text/JSON hops copied from `lifecycle.availableTransitions` / `availableSteps`; no VALID_TRANSITIONS rewrite                                                                                                                               |
| S7      | **Implemented** | `review:` without file paths; overlap section from `overlapDetail`; filters `OVERLAP_CONFLICT` when reason is `spec-overlap-conflict`                                                                                                      |
| S8      | **Implemented** | `! ${code} — ${label}: ${message}`; JSON maps `label`/`checkId`                                                                                                                                                                            |
| S9      | **Implemented** | compares `change.schema*` to `lifecycle.schemaInfo` only; skip if null                                                                                                                                                                     |
| S10     | **Implemented** | `handleError`                                                                                                                                                                                                                              |
| S11     | **Implemented** | `resolveStatusSchemaDag` prefers `schema.artifactDag()`; fallback `ArtifactDag.from(schemaInfo.artifacts)` when `activeSchema.raw`; `visited` set omits convergent repeats (spec MAY omit)                                                 |
| S12     | **Implemented** | `status.execute({ name })` only                                                                                                                                                                                                            |
| S13     | **Implemented** | `enrichImplementationTracking` gated on `--implementation`                                                                                                                                                                                 |
| S14–S16 | **Implemented** | details `tasks: N/M`; no `specs:` line; `specDependsOn`                                                                                                                                                                                    |

**Help (prior LOW):** JSON help now states top-level `availableTransitions`/`availableSteps` are **drafted JSON only**; active hops live under `lifecycle`. `review.overlapDetail` is listed. Matches S6/S7.

**Note (not scored as fail):** handler calls `kernel.specs.getActiveSchema.execute()` for DAG topology. Constraint forbids another use case to recompute **lifecycle**; S11 requires a live `Schema.artifactDag()`. Version warning does **not** resolve schema independently.

### `cli:change-transition` — `packages/cli/src/commands/change/transition.ts` + `_check-progress-presenter.ts`

| Req        | Status          | Evidence                                                                                                |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| T1         | **Implemented** | `[step]` optional; `--next` xor step; `--allow-out-of-scope` only when flag set                         |
| T2         | **Implemented** | `to: requestedTarget` is `'next'` or concrete state; `CHANGE_STATES` is validation, not a from→to table |
| T3         | **Implemented** | preflight + repair `status.execute({ name, refreshImplementationTracking: false })`                     |
| T4         | **Implemented** | execute input is `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`                             |
| T5         | **Implemented** | `parseCommaSeparatedValues` vs `source.pre/post`, `target.pre/post`, `all`                              |
| T6–T8, T13 | **Implemented** | presenter `streamName: 'change-transition'`; text to stderr; no `Executing:`                            |
| T9         | **Implemented** | `transitioned ${name}: ${from} → ${to}`; JSON complete `ok`                                             |
| T10        | **Implemented** | `HookFailedError` not in `isRepairGuideError`; `handleError` exit 2                                     |
| T11        | **Implemented** | gerund blocker lines; repair guide from GetStatus `nextAction`                                          |
| T12, T14   | **Implemented** | delegated to Core; CLI surfaces errors                                                                  |

Help description: stay in ready/done; pending drain — policy, not a routing table (constraint T).

### `cli:change-approve` — `packages/cli/src/commands/change/approve.ts`

| Req   | Status          | Evidence                                                                 |
| ----- | --------------- | ------------------------------------------------------------------------ | -------------------------------- |
| A1–A3 | **Implemented** | `requiredOption('--reason')`; execute `{ name, reason }` only; no hashes |
| A4–A5 | **Implemented** | help: ready / done with pending drain wording; stdout `approved spec     | signoff for` with no pending hop |
| A6–A7 | **Implemented** | JSON `{ result, gate, name }`; Commander + `handleError`                 |

Command does **not** call GetStatus (tests still mock it unused).

### `cli:change-archive` — `packages/cli/src/commands/change/archive.ts`

| Req   | Status          | Evidence                                                                                                  |
| ----- | --------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---- |
| R1    | **Implemented** | registered on `changes` with alias `change` (`packages/cli/src/index.ts`)                                 |
| R2    | **Implemented** | **no** local state table; description: “archivable … or retry from archiving”; `assertArchivable` is Core |
| R3–R4 | **Implemented** | direct `archive.execute`; skip set `pre                                                                   | post | all` |
| R5    | **Implemented** | same presenter, `streamName: 'change-archive'`                                                            |
| R6    | **Implemented** | `postHookFailures` → `cliError(..., 2)` **before** success print                                          |
| R7–R9 | **Implemented** | text path; invalidated only if `length > 0`; JSON single stream complete object                           |
| R10   | **Implemented** | `ChangeNotFoundError` / `InvalidStateTransitionError` / `SpecOverlapError`                                |

**No GetStatus preflight** (prior HIGH/test): `status.execute` is not called in the action.

### `skills:skill-templates-source`

| Req                                          | Status                       | Evidence                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K15 archive                                  | **Implemented**              | `specd-archive/SKILL.md.tpl`: MUST already be `archivable` **or** `archiving`; signoff wait `/specd-verify` in `done`; no `pending-signoff` / transition into it                    |
| K15 verify/implement/design/new/shared/entry | **Implemented**              | stay-in-state; drain-only pending rows; entry skill has no signoff copy (`template-workflow.spec.ts`)                                                                               |
| K16–K19                                      | **Implemented**              | shared cookbook; verify drains `IMPLEMENTATION_STATE`; archive `--skip-hooks pre`; design does not list files under `review:`; hop skills do not list `OVERLAP_CONFLICT` as typical |
| K1–K14                                       | **Implemented** (spot-check) | `.md.tpl` + meta; no `graph impact --changes`; `--snippet` opt-in in shared/new/design                                                                                              |

---

## Discrepancies

None **HIGH** / **CRITICAL**. Prior 090131 items in this batch are **closed in code**.

### Closed priors (do not re-open)

1. **Drafted JSON empty hops** — `status.ts` forces `availableTransitions: []`, `availableSteps: []`, `nextAction.command: null`. Test leaks Core `availableTransitions: ['ready']` and `/specd-design`.
2. **Archive archivable-only CLI gate** — removed; Core owns `assertArchivable`; description includes `archiving` retry.
3. **Help vs nested lifecycle hops** — help comments: drafted-only top-level hops; active hops under `lifecycle`.
4. **Skills archive/verify parking copy** — archive requires `archivable` **or** `archiving`; verify does not teach `pending-signoff`.
5. **Archive GetStatus preflight** — absent; test `expect(kernel.changes.status.execute).not.toHaveBeenCalled()`.

### Remaining nits (not implementation bugs)

| Sev  | Spec                                  | Item                                                                                                                                                                     | Spec might be wrong                                         | Code might be wrong                            | Both                                                       |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| LOW  | `cli:change-status` help vs S11       | `--help` JSON still types `schema` as `{ name, version }` while runtime overwrites `schema` with `{ name, version, artifactDag }` **and** keeps top-level `artifactDag`. | Help is a union sketch, not a SHALL except `overlapDetail`. | Help incomplete vs actual JSON.                | Prefer aligning help with S11 nested `schema.artifactDag`. |
| LOW  | `cli:change-archive` verify.md        | Duplicate heading `#### Scenario: Change not in archivable state` (twice).                                                                                               | Artifact drift in verify delta.                             | —                                              | Spec hygiene.                                              |
| NOTE | `cli:change-status` S11 vs constraint | `getActiveSchema` used for DAG.                                                                                                                                          | Constraint “lifecycle data” vs S11 live DAG.                | Would be a bug only if used to recompute hops. | Treat as allowed by S11.                                   |

No spec↔global contradiction in this batch: in-place `approval.spec` / `approval.signoff` is consistently “stay in ready/done + approve”, not protocol hops to pending.

---

## Test Coverage

### `packages/cli/test/commands/change/status.spec.ts`

| Spec / scenario      | Test                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S2 drafted JSON leak | `JSON drafted status includes isDrafted and empty transitions` — asserts `[]` hops and `nextAction.command` null despite Core leak |
| S2 drafted text      | `text drafted status marks drafted and omits transition commands`                                                                  |
| S1 missing name      | `Missing name argument`                                                                                                            |
| S12 no refresh       | `Normal status output` — `refreshImplementationTracking.execute` not called                                                        |
| S15/S16              | no `specs:`; has `specs and dependencies:`                                                                                         |
| S8 gerund            | `Text blockers include gerund label` — exact `! DEPS_INCONSISTENT — Checking spec dependencies: …`                                 |
| S6 hops passthrough  | `Text output shows available transitions`                                                                                          |
| S11 childrenOf       | `JSON artifactDag children match schema DAG childrenOf`                                                                            |
| S3 drift DAG state   | `JSON output includes hasTasks and drift-aware state in artifactDag` → `complete-with-drift`                                       |
| S7/S8 overlap        | review header, no file lists, hide vs show `OVERLAP_CONFLICT`, JSON `overlapDetail`                                                |
| S9/S10               | Schema mismatch; Unknown change name                                                                                               |
| S14                  | `shows task counts in the details section`                                                                                         |

### `packages/cli/test/commands/change/transition.spec.ts`

| Spec / scenario          | Test                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| T1 xor / allowOutOfScope | combine `--next`+step; flag on/off                                                                             |
| T2 `--next`              | `to: 'next'`; ready→implementing without pending persist; signed-off→archivable                                |
| T3 refresh false         | preflight + nth call on repair                                                                                 |
| T4 no rewrite            | ready→implementing; done→archivable stay                                                                       |
| T5 skip phases           | `all`, empty, comma `target.pre,source.post`                                                                   |
| T6–T8, T13               | gerund predicate; hook bus; JSON `stream !== 'hook-progress'`                                                  |
| T9 JSON complete         | success complete record                                                                                        |
| T10 HookFailedError      | exit 2, no `repair guide:`; progress then fail                                                                 |
| T11 repair               | InvalidStateTransitionError; gerund `READ_ONLY_WORKSPACE — Checking workspace ownership`; verify not implement |
| T12                      | Unchecked checkboxes block verifying                                                                           |

### `packages/cli/test/commands/change/approve.spec.ts`

| Spec / scenario | Test                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| A4/A6           | success from ready; no `pending-spec-approval` in stdout; JSON                                 |
| A5              | success from done; drain from pending-signoff                                                  |
| A1/A7           | missing `--reason`; unknown sub-verb; not found; wrong state (via `ApprovalGateDisabledError`) |
| A2              | `execute` `{ name, reason }` only                                                              |

### `packages/cli/test/commands/change/archive.spec.ts`

| Spec / scenario    | Test                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| R2/R3 no GetStatus | `confirms archive` + `status.execute` not called                                |
| R2 not archivable  | `InvalidStateTransitionError('done', 'archivable')` exit 1                      |
| R4 skip phases     | `all`, `pre`, `post`, `pre,post`, default empty                                 |
| R5 gerund          | `Checking workspace ownership` / `Running pre hooks`; no `Executing:`           |
| R6                 | post-hook failures exit 2, no success line                                      |
| R7–R9              | path; invalidated text/JSON; NDJSON check-start/done/complete; no second object |
| R1 flags           | `allowOverlap` / `allowOutOfScope` on/off                                       |

### `packages/skills/test/template-workflow.spec.ts`

| Spec / scenario | Test                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| K15             | pending parking absent; archive contains `archivable` **and** `archiving`; entry skill no signoff |
| K16             | verify drain / implement zero-open                                                                |
| K17             | `--skip-hooks pre`; no archive `--skip-hooks all`; no post `run-hooks archiving`                  |
| K18             | design review scope                                                                               |
| K19             | hop skills typical blockers omit `OVERLAP_CONFLICT`; archive includes it + live-overlap wording   |
| K12–K14         | metadata/optimizer/command-role exact strings                                                     |

---

## Missing Tests

| Sev | Spec                        | Gap                                                                                                                                                                                    |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MED | `cli:change-status` S8      | Gerund test is **text-only**; no assertion that JSON/TOON `blockers[].label` / `checkId` are serialized                                                                                |
| MED | `cli:change-status` S6      | No test that CLI does **not** inject `verifying` from `validTransitions` when GetStatus omitted it; no status-level nextAction implement-vs-verify (covered only on transition repair) |
| MED | `cli:change-transition` T11 | No JSON/TOON test for terminal `complete` + `result: "failure"` with `blockers` + `nextAction`                                                                                         |
| MED | `cli:change-archive` R2     | Verify scenario **Change in archiving may retry** — no test that CLI forwards `archiving` without a local archivable-only gate (implementation has no gate; still unasserted)          |
| LOW | `cli:change-status` S2      | Discarded name → exit 1 (verify scenario); relies on Core `ChangeNotFoundError` without a status-unit case                                                                             |
| LOW | `cli:change-status` S4      | DAG `[hasTasks]` fallback when `taskCompletion` absent (existing DAG test supplies counts)                                                                                             |
| LOW | `cli:change-status` S11     | Convergent DAG (`design` under proposal **and** specs) not duplicated — no test                                                                                                        |
| LOW | `cli:change-status` S7      | `--help` contains `overlapDetail` (spec SHALL on help schema) — no test                                                                                                                |
| LOW | `cli:change-status` S9      | `schemaInfo: null` skips warning — no test                                                                                                                                             |
| LOW | `cli:change-archive` R1     | Singular alias `change archive` vs `changes archive` — no dedicated test (parent `.alias('change')`)                                                                                   |
| LOW | `cli:change-archive` R10    | stderr **names current state** — test only `/error:/`                                                                                                                                  |
| LOW | `cli:change-approve` A2     | No assertion `kernel.specs.approveSpec` is **not** invoked                                                                                                                             |
| LOW | `cli:change-approve` A3     | No explicit “CLI did not pass hashes” (true by call-shape `{ name, reason }`)                                                                                                          |
| LOW | `cli:change-transition` T5  | Individual `--skip-hooks target.pre` vs `source.post` (comma set is tested)                                                                                                            |
| LOW | skills K5                   | Graph dependents wording / `--direction dependents` not asserted in `template-workflow.spec.ts` (no `--changes` in templates; untested)                                                |

---

## Spec Dependency Chain

```
cli:change-status
  → cli:entrypoint
  → core:change
  → core:get-status
  → sdk:build-implementation-review
  → core:transition-checks

cli:change-transition
  → cli:entrypoint
  → core:change
  → core:transition-change
  → core:hook-execution-model
  → core:get-status
  → core:transition-checks

cli:change-approve
  → cli:entrypoint
  → core:change
  → core:transition-checks

cli:change-archive
  → cli:entrypoint
  → core:change
  → core:archive-change
  → core:hook-execution-model
  → cli:command-resource-naming
  → core:transition-checks

skills:skill-templates-source
  → skills:skill
  → cli:spec-optimizations
  → skills:workflow-automation
  → core:transition-checks
```

**Consistency:** CLI/skills consume check-derived projections and gerund labels; they do not re-bind pending parking as happy-path protocol. Archive retry state is Core `assertArchivable`, not a narrower CLI enum.

---

## Summary counts

| Spec                            | Requirements | Implemented | Partial | Missing impl |             Discrepancies (open) |                                 Verify scenarios well-covered | Missing tests (rows above) |
| ------------------------------- | -----------: | ----------: | ------: | -----------: | -------------------------------: | ------------------------------------------------------------: | -------------------------: |
| `cli:change-status`             |           16 |          16 |       0 |            0 |       1 LOW (help schema sketch) |                                                     ~22 / ~28 |                          7 |
| `cli:change-transition`         |           14 |          14 |       0 |            0 |                                0 |                                                     ~24 / ~30 |                          2 |
| `cli:change-approve`            |            7 |           7 |       0 |            0 |                                0 |                                                       10 / 12 |                          2 |
| `cli:change-archive`            |           10 |          10 |       0 |            0 | 1 LOW (duplicate verify heading) |                                                       16 / 18 |                          3 |
| `skills:skill-templates-source` |           19 |          19 |       0 |            0 |                                0 | change-delta scenarios covered in `template-workflow.spec.ts` |                          1 |
| **Total**                       |       **66** |      **66** |   **0** |        **0** |                   **2 LOW nits** |                                                             — |                     **15** |

**Verdict:** this batch is **compliant**. All 090131 CLOSED items remain closed. Residual work is tests (JSON gerund, JSON transition failure, archiving retry passthrough) and help/verify hygiene, not behaviour.

---

## Partial file: `_partial-globals.md`

# Spec-compliance audit — globals batch

**Mode:** change `workflow-transition-checks` (read-only)  
**Previews:** `default:_global/architecture`, `default:_global/logging` (via `changes spec-preview`)  
**Conformance (workspace specs, not in this change):** `default:_global/conventions`, `testing`, `eslint`, `docs`  
**Graph:** `stale: false` (`lastIndexedAt` 2026-08-29T10:57:16Z)  
**CLI:** `node packages/cli/dist/index.js`

**Architecture constraint (user-enforced blocking):** **PASS**

Preview `spec.md` / `verify.md` do **not** mention `evaluateLifecycle`, `packages/core/…`, or `LifecycleEngine`. Domain imports `Logger` from `observability/`, not `application/`. Domain calls `Logger.debug`.

---

## Requirements Summary

### `default:_global/architecture` (preview)

| ID  | Requirement                                                  | Kind         | Notes                                                                                          |
| --- | ------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------- |
| A1  | Layered structure (domain / application / infrastructure)    | constraint   | Unchanged by delta; core still layered.                                                        |
| A2  | Domain layer is pure + **ambient Logger exception**          | **changed**  | Process-level composition root assigns impl; packages choose call sites; link to logging spec. |
| A3  | Application uses ports only + Logger not an adapter import   | **changed**  | Diagnostic `Logger` allowed.                                                                   |
| A4  | Rich domain entities                                         | pre-existing | Out of delta; not re-audited line-by-line.                                                     |
| A5  | Value objects expose behaviour                               | pre-existing | Same.                                                                                          |
| A6  | Ports with shared construction are abstract classes          | pre-existing | Same.                                                                                          |
| A7  | Pure functions for stateless domain services                 | pre-existing | `evaluateLifecycleVerdict` remains a function in `domain/services/`.                           |
| A8  | Manual dependency injection                                  | pre-existing | Ambient Logger is an explicit exception, not ctor DI.                                          |
| A9  | Composition layer / `createKernel` / factories               | pre-existing | Logger assignment still happens inside `createKernel` (see discrepancies).                     |
| A10 | YAML validated at infrastructure boundary                    | pre-existing | Untouched.                                                                                     |
| A11 | Adapter packages contain no business logic                   | pre-existing | Untouched.                                                                                     |
| A12 | No circular `workspace:*` package deps                       | pre-existing | Untouched.                                                                                     |
| A13 | Curated public barrels                                       | pre-existing | `Logger` re-exported from core public surfaces.                                                |
| A-C | Constraints: domain ↛ application/infrastructure/composition | constraint   | Enforced by ESLint `no-restricted-imports`; observability is not a forbidden group.            |
| A-D | Spec Dependencies → `default:_global/logging`                | **changed**  | Extract vs persisted mismatch (below).                                                         |

Verify (delta): domain/application MAY import ambient `Logger`.

### `default:_global/logging` (preview)

| ID  | Requirement                                                                              | Kind         | Notes                                                                                   |
| --- | ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| L1  | Console compatibility (`log/info/debug/warn/error`)                                      | pre-existing | `LoggerPort` + facade.                                                                  |
| L2  | `log()` aliases `info()`                                                                 | pre-existing | Facade `Logger.log` → `impl.info`; `PinoLogger.log` → pino `info`.                      |
| L3  | Minimal **console** impl: `fatal`→`console.error`+`[FATAL]`; `trace`→debug/log+`[TRACE]` | pre-existing | Applies only to console-backed adapters; production uses Pino.                          |
| L4  | Log level semantics                                                                      | pre-existing | Levels exist on port; no ordering type.                                                 |
| L5  | Prefer logging abstraction over `console.*` in production                                | pre-existing | Kernel wires Pino; domain/application use `Logger`.                                     |
| L6  | **Ambient Logger**                                                                       | **changed**  | No-op before wiring; any layer MAY import; not for control flow; packages choose usage. |
| L-D | Spec Dependencies → `default:_global/architecture`                                       | **changed**  | Change plan already lists this; lock still `[]`.                                        |

### Conformance (globals not in change)

| Spec        | Relevance to this batch                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| conventions | kebab-case `logger.ts`; tests in `test/` mirroring `src/`; named exports; public return types; no `any`.                    |
| testing     | Vitest; `test/observability/logger.spec.ts` mirrors `src/observability/logger.ts`; `given…when…then` names on Logger tests. |
| eslint      | Layer `no-restricted-imports` does not block `domain` → `observability`. JSDoc disable on Logger/Pino files.                |
| docs        | JSDoc-on-all-symbols; no `docs/` hits for `observability/logger` (Logger is code-first).                                    |

---

## Implementation Status

| Requirement                             | Status                      | Evidence                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2 Domain purity + Logger               | **Implemented**             | `packages/core/src/domain/services/lifecycle-verdict.ts` imports `Logger` from `../../observability/logger.js` (not `application/`). `Logger.debug` at diagnostic sites. No `domain` → `application/` / `infrastructure/` / `composition/` imports (search).                                   |
| A3 Application Logger                   | **Implemented**             | Use cases (`get-status`, `transition-change`, `validate-artifacts`, `archive-change`, `get-artifact-instruction`) call `Logger.debug`. Ports still live under `application/ports/`; `application/ports/logger.port.ts` re-exports observability types.                                         |
| A-C Domain ↛ application                | **Implemented**             | ESLint `packages/*/src/domain/**` forbids `**/application/**`. Domain Logger path is `observability/`.                                                                                                                                                                                         |
| L1 Console-compatible methods           | **Implemented**             | `LoggerPort` in `src/observability/logger.port.ts`; facade methods on `Logger`.                                                                                                                                                                                                                |
| L2 `log` ≡ `info`                       | **Implemented**             | `Logger.log` calls `Logger.impl.info` (`logger.ts` ~41–44). `PinoLogger.log` uses `this.logger.info`.                                                                                                                                                                                          |
| L3 Console prefix mapping               | **N/A / not this adapter**  | `PinoLogger` uses pino `fatal`/`trace`, not `console.error` + `[FATAL]`. Spec scopes this to console-object implementations.                                                                                                                                                                   |
| L5 No production `console` for app logs | **Implemented (core path)** | `createKernel` → `createDefaultLogger` (Pino).                                                                                                                                                                                                                                                 |
| L6 Ambient Logger                       | **Implemented**             | `NullLogger` default; `setImplementation` / `resetImplementation`; `createKernel` (`composition/kernel.ts` ~275) assigns `createDefaultLogger`. Domain has no logger ctor/port.                                                                                                                |
| A9 Process-level vs kernel              | **Implemented with caveat** | Architecture delta: _process-level composition root assigns; other packages MAY use facade without re-wiring_. Runtime assignment is still `createKernel` in `@specd/core` composition (typical host bootstrap). Standalone `createX` does not call `setImplementation` (only kernel + tests). |
| Observability location                  | **Implemented**             | Canonical module: `src/observability/logger.ts`. Shims: `src/application/logger.ts`, `application/ports/logger.port.ts`.                                                                                                                                                                       |
| Prior LOW tests location                | **Closed**                  | Only `packages/core/test/observability/logger.spec.ts` (no `test/application/**/logger.spec.ts`).                                                                                                                                                                                              |

---

## Discrepancies

### D1 — `DEPS_INCONSISTENT` on `default:_global/architecture` — **HIGH** (workflow / metadata)

**Observed (change status):** `deps.consistent` fail: extracted `dependsOn` `[default:_global/logging]` vs persisted `[]` for `default:_global/architecture`.

**Spec (preview):** Spec Dependencies lists logging (ambient Logger exception + composition-root assignment).

**Persisted:** `specs/_global/architecture/spec-lock.json` `"dependsOn": []`. Change `specDependsOn["default:_global/architecture"]` is empty. Contrast: `specDependsOn["default:_global/logging"]` already has `[default:_global/architecture]`.

**Interpretations:**

1. **Spec/delta correct, plan/lock stale** (most likely): architecture delta added the edge; publication plan and sidecar were not updated. Ready is blocked until plan + lock match extract.
2. **Persisted `[]` still intended:** then the architecture delta Spec Dependencies section should not list logging (would contradict the written exception).
3. **Both incomplete:** logging lock is also `"dependsOn": []` while the _change plan_ already has logging→architecture. After archive, architecture lock must gain logging or extract will keep failing.

This is the mismatch called out from prior 090131 / current lifecycle blockers. **Not an implementation bug.**

### D2 — Bidirectional spec dependency cycle — **MEDIUM** (spec graph)

**Architecture preview** depends on **logging**. **Logging preview** depends on **architecture**. That is a 2-node cycle in the spec DAG.

**Possible readings:**

- **Intentional cross-reference** for the Logger exception (each spec points at the other).
- **Should be one-way:** architecture→logging (exception lives in architecture; logging only _mentions_ architecture in prose) **or** logging→architecture only.

`deps.consistent` currently fails only the architecture side because the change plan already recorded logging→architecture.

### D3 — Prior 090131 MEDIUM (each-package wires vs logging vs `createKernel`) — **CLOSED as spec contradiction; residual composition note**

**Was:** architecture “each package wires Logger” vs logging “each package chooses” vs code `createKernel` wiring.

**Now (architecture delta):** _A process-level composition root assigns the implementation; other packages MAY use the facade without re-wiring. Each package chooses how and where to call it._

**Logging:** composition root assigns; each package chooses how/where to **use** it; no ctor-vs-ambient mandate.

Those texts **align**. Code still assigns in `createKernel`, which is a process-wide ambient write when hosts use the kernel. Residual (not a text clash): hosts that only call `createX(deps)` never run `Logger.setImplementation` → `NullLogger` (silent diagnostics). Specs do not require every factory to wire Logger.

### D4 — JSDoc ESLint disabled on observability Logger / Pino adapter — **LOW** (conformance vs `eslint`/`docs`)

`logger.ts` and `pino-logger.ts` start with `eslint-disable` for `jsdoc/require-jsdoc` (and related). Facade methods have short JSDoc; `NullLogger` methods do not. `docs` / `eslint` require JSDoc on functions/methods in `src/`.

**Readings:** (a) code should drop disable and document `NullLogger`; (b) specs over-reach for tiny private no-ops.

### D5 — Architecture does not name `observability/` as a layer — **LOW** (implicit)

Hexagon text still lists domain / application / infrastructure (+ composition). Implementation places the ambient facade under `src/observability/`. User-enforced location **matches code**. Architecture allows “the project's ambient Logger” without a path; ESLint does not treat observability as outer.

Not a fail of the blocking constraint.

### Non-discrepancies (checked)

- Architecture preview **forbidden strings:** none found.
- Domain **application imports:** none (other than unrelated `DeltaApplicationError` name).
- `Logger.log` ≡ `info`: implemented and tested (prior LOW **closed**).
- Tests under `application` for Logger: **gone**.

---

## Test Coverage

| Requirement / scenario            | Tests                                                                                                                                     | Verdict                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| L2 `log()` aliases `info()`       | `test/observability/logger.spec.ts` — _given an implementation, when log runs, then it aliases info_ (`impl.info` called; `impl.log` not) | **Covered**                                                                |
| L6 no-throw before wiring         | _given no implementation, when info or error runs, then it does not throw_                                                                | **Partial** — no `debug`/`log`; does not spy `console`                     |
| L6 no console until assigned      | verify: MUST NOT write to `console` unless assigned                                                                                       | **Missing**                                                                |
| L6 domain no logger port          | `evaluateLifecycleVerdict` is a function; `lifecycle-engine.spec.ts` spies `Logger.debug`                                                 | **Indirect** — no assertion “no logger in options type”                    |
| A2 domain Logger import permitted | Lint + compile; no dedicated eslint spec test in this package                                                                             | **Tooling, not a WHEN/THEN unit test** (matches architecture verify style) |
| L1 method presence                | Delegation test covers `info`/`error`/`child`/`isLevelEnabled`                                                                            | **Partial** — no explicit `warn`/`fatal`/`trace` on facade                 |
| L3 `[FATAL]` / `[TRACE]`          | No tests in core                                                                                                                          | **Uncovered** (console-minimal adapter absent)                             |
| L4 severity order                 | None                                                                                                                                      | **Uncovered** (no comparator API)                                          |
| Domain `Logger.debug`             | `lifecycle-engine.spec.ts` spy `Logger.debug` on `evaluateLifecycleVerdict`                                                               | **Covered**                                                                |

---

## Missing Tests

1. **L6 AND-clause:** after import, with default `NullLogger`, `console.log` / `console.error` / `console.debug` are **not** invoked (`vi.spyOn(console, …)`).
2. **L6 `Logger.debug` / `Logger.log` no-throw** on default impl (info/error only today).
3. **L3** if a console-backed `LoggerPort` is ever shipped: `[FATAL]` / `[TRACE]` prefix scenarios.
4. Optional: facade `warn` / `fatal` / `trace` delegation (parity with `info`).

Not missing (prior LOW): `log`≡`info`; file location `test/observability/logger.spec.ts`.

---

## Spec Dependency Chain

```
default:_global/architecture  --(preview extract)-->  default:_global/logging
default:_global/logging       --(preview + change plan)-->  default:_global/architecture
                                                      CYCLE (D2)

Persisted / lock:
  architecture spec-lock dependsOn: []     ≠ extract [logging]   → DEPS_INCONSISTENT (D1)
  logging spec-lock dependsOn: []
  change specDependsOn logging: [architecture]  (matches extract)
  change specDependsOn architecture: []         (mismatches extract)

Conformance (depth 1, not in change):
  logging ↔ architecture (mutual, preview)
  conventions → error-handling-conventions
  testing → architecture, conventions
  eslint → conventions  (and enforces architecture import rules)
  docs → conventions
```

Direct dependencies of **this change’s global specs** (preview): architecture↔logging only. Project-wide conformance specs are audit scope, not delta targets.

---

## Architecture constraint PASS/FAIL

| Check                                                         | Result                            |
| ------------------------------------------------------------- | --------------------------------- |
| Architecture **preview** must not mention `evaluateLifecycle` | **PASS**                          |
| Architecture **preview** must not mention `packages/core/…`   | **PASS**                          |
| Architecture **preview** must not mention `LifecycleEngine`   | **PASS**                          |
| Domain must not import application                            | **PASS**                          |
| Ambient `Logger` lives under `observability/`                 | **PASS**                          |
| Domain MAY `Logger.debug`                                     | **PASS** (`lifecycle-verdict.ts`) |

**Overall architecture constraint: PASS.**

---

## Summary counts

| Metric                                                  | Count                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Specs in this batch (previews)                          | 2 (`architecture`, `logging`)                                                                       |
| Conformance specs reviewed                              | 4 (`conventions`, `testing`, `eslint`, `docs`)                                                      |
| Requirements tabulated (architecture + logging)         | 19 (13 architecture + 6 logging)                                                                    |
| Changed requirements in deltas                          | 4 (A2, A3, A-D, L6) + L-D                                                                           |
| Implemented (changed + Logger-related)                  | A2, A3, L1, L2, L5, L6                                                                              |
| N/A this adapter                                        | L3 (Pino ≠ console mapping)                                                                         |
| Discrepancies                                           | 5 (D1 HIGH, D2 MEDIUM, D3 closed+note, D4 LOW, D5 LOW)                                              |
| Prior 090131 MEDIUM (wiring wording)                    | **Closed** (process-level composition root)                                                         |
| Prior LOW (`log`≡`info` untested; tests in application) | **Closed**                                                                                          |
| Missing tests                                           | 3–4 (console silence; extra no-throw; optional L3/L1)                                               |
| Architecture constraint                                 | **PASS**                                                                                            |
| Workflow `deps.consistent`                              | **FAIL** (D1) — expected until architecture `dependsOn` is persisted as `[default:_global/logging]` |
