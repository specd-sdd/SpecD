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
