# Specs compliance — change `workflow-transition-checks`

- **Mode:** change
- **Timestamp:** 20260829-142635
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state at audit:** designing (`ARTIFACT_DRIFT` on specs/verify; **no** `DEPS_INCONSISTENT`; nextAction `/specd-design`)
- **CLI:** `node packages/cli/dist/index.js`
- **Graph:** Reindexed before audit (`filesIndexed: 14` incremental, `symbolCount: 4190`). After index: `stale: false`, `contentFresh: true`, `lastIndexedAt: 2026-08-29T12:26:58.866Z`.
- **Read-only.** Partials in this directory must be kept.

## Scope

**Change specs (22):** `core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

**Project-wide extras:** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (conformance only).

**Batches:** `_partial-lifecycle-core.md`, `_partial-use-cases.md`, `_partial-archive-hooks.md`, `_partial-cli-skills.md`, `_partial-globals.md`

## Executive summary

Post-fix audit after compliance remediation (vs `20260829-125651`). **No HIGH or MEDIUM implementation defects** remain in lifecycle, archive, CLI, or global architecture constraints. Core contract holds: no `LifecycleEngine` class; domain `nextHop` / application `command`; `blockingArtifacts` from check `details`; `nextArtifact` via `parentsOf`; archive fail-fast and deferred overlap I/O; CLI drafted sanitizers and new tests.

### Closed vs prior audit (`20260829-125651`)

| Prior finding                                 | Now                                                            |
| --------------------------------------------- | -------------------------------------------------------------- |
| HIGH `DEPS_INCONSISTENT` architecture→logging | **CLOSED** — Spec Dependencies edge removed; live status clean |
| MEDIUM spec cycle architecture↔logging        | **CLOSED**                                                     |
| MEDIUM change “engine-derived” / sanea        | **CLOSED** in deltas                                           |
| MEDIUM verify `nextAction.target`             | **CLOSED** (body uses `targetStep`)                            |
| MEDIUM `blockingArtifacts` requires walk      | **CLOSED** in code + test                                      |
| LOW `nextArtifact` `parentsOf`                | **CLOSED**                                                     |
| LOW GetStatus / approve “engine” JSDoc        | **CLOSED**                                                     |
| LOW CLI help `schema` sketch                  | **CLOSED**                                                     |
| LOW archive verify duplicate heading          | **CLOSED**                                                     |
| LOW Logger test path / eslint disable         | **CLOSED**                                                     |
| Dist `LifecycleEngine`                        | **CLOSED** (stays closed)                                      |

### Open findings (all LOW / hygiene)

1. **LOW — wording:** `ArtifactFile` + `change-repository` still say “engine-derived”; specs say “verdict-derived”.
2. **LOW — verify selectors:** GAI verify delta selector title `engine-derived`; lifecycle verify section selector still “next action” while spec renamed “domain next hop”.
3. **LOW — naming debt:** `lifecycle-engine.ts` barrel, `lifecycle-engine.spec.ts` filename, `public.ts` export path — not a class.
4. **LOW — residual:** `transitionBlockers` fallback walks `requires` only when no injected checks for that hop (DAG-only path).
5. **LOW — tests:** optional CLI approve/schemaInfo gaps (unchanged nits).

### Architecture / logging (user constraint)

**PASS (0 blocking).** Preview package-agnostic. Domain imports `observability/logger.js`. No `LifecycleEngine` in src or dist.

### Workflow note

Change remains **designing** with **`ARTIFACT_DRIFT`** on specs/verify (expected after delta edits). This is workflow state, not a code/spec ABI defect. `workflow.requires` → `ARTIFACT_DRIFT` on this change is live and correct.

## Recommended next steps (not part of this audit)

1. Align error strings / JSDoc “engine-derived” → “verdict-derived” (mechanical).
2. Rename verify delta selectors to match renamed scenario/section titles.
3. `/specd-design` → review drifted artifacts → validate → continue lifecycle.

---

---

## Partial file: `_partial-lifecycle-core.md`

# Spec-compliance audit (partial): lifecycle core

**Mode:** change `workflow-transition-checks`  
**Scope:** `core:lifecycle-engine`, `core:transition-checks`, `core:change`, `core:workflow-model`, `core:schema-format`, plus preview `default:_global/architecture`, `default:_global/logging`  
**Graph:** reindexed `2026-08-29` (timestamp `20260829-142635`), `stale: false`  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified  
**User-enforced constraints:** architecture preview package-agnostic (no `evaluateLifecycle`, no `packages/core` paths, no `LifecycleEngine` class). Domain `Logger` from `observability/`, never `application/`. No `LifecycleEngine` class in src or dist.

---

## Requirements Summary

Sources: `specd changes spec-preview workflow-transition-checks <specId>` (deltas applied). Architecture/logging previews used as global constraints.

### `core:lifecycle-engine`

| ID    | Requirement                         | Essence                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1  | Stateless domain lifecycle verdict  | Plain functions in `domain/services/lifecycle-verdict.ts`: `evaluateLifecycleVerdict`, `projectArtifacts`, `findBlockingParent`. No class, no injected debug/logger port, no `LifecycleEngineOptions`. Domain `Logger.debug` allowed. Domain return `LifecycleDomainVerdict` has `nextHop`, not `nextAction.command`.                                           |
| LE-2  | Centralized validation logic        | Sole domain authority: project protocol + schema predicates + core-bound predicates from caller `CheckResult`s. No I/O, no `run:` effects, no snapshot-bag fallback.                                                                                                                                                                                            |
| LE-3  | Effective artifact status           | Mapping split: own review states stay; `complete` + review upstream → `pending-parent-artifact-review`; `complete` + otherwise incomplete upstream → `in-progress`. Recursive parent-review. Mixed upstream: parent-review wins over in-progress.                                                                                                               |
| LE-4  | Canonical-state-only                | Display `complete-with-drift` / `hasDrift` must not create extra lifecycle states.                                                                                                                                                                                                                                                                              |
| LE-5  | Machine-readable blockers           | Codes include `INCOMPLETE_ARTIFACT`, `ARTIFACT_DRIFT`, `REVIEW_REQUIRED`, `PENDING_PARENT_REVIEW`, `INCOMPLETE_TASKS`, `OVERLAP_CONFLICT`, `INVALID_TRANSITION`, `APPROVAL_REQUIRED`. Bypass omits skippable blockers; no `warnings` field.                                                                                                                     |
| LE-6  | Available steps and domain next hop | One predicate evaluation → `validTransitions` / `availableTransitions` / `availableSteps` / `nextHop` (`targetStep`, `actionType`, `reason`; no `command`). `isReady` from `workflow.requires` results when present. `blockingArtifacts` MUST follow check `details` when checks present — MUST NOT independently re-walk `requires` for a second blocker code. |
| LE-7  | Archiving escape                    | `archiving` exposes `archivable` + `designing`; recovery `along`; incomplete restore → designing hop.                                                                                                                                                                                                                                                           |
| LE-8  | Review summary                      | History-driven overlap is review + designing hop, not `OVERLAP_CONFLICT` blocker.                                                                                                                                                                                                                                                                               |
| LE-9  | Shared consumers                    | `GetStatus` / `TransitionChange` / `ValidateArtifacts` / `GetArtifactInstruction` share verdict; `CompileContext` must not evaluate hops. Empty `checksByTarget` still yields DAG/`nextArtifact`.                                                                                                                                                               |
| LE-10 | Application lifecycle guidance      | `evaluateLifecycle` attaches `nextAction.command` via `lifecycle-guidance.ts`.                                                                                                                                                                                                                                                                                  |
| LE-11 | Next artifact topological order     | Scan `schema.artifactDag().topologicalOrder()`; first incomplete with deps complete/skipped via `parentsOf(id)`; else `null`.                                                                                                                                                                                                                                   |
| LE-12 | No LifecycleEngine class            | No class in domain/application/dist; `lifecycle-engine.ts` compatibility barrel re-exports domain functions only.                                                                                                                                                                                                                                               |

### `core:transition-checks` (intersection with lifecycle)

| ID   | Requirement                        | Essence                                                                                                                                               |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-1 | Check identity and result          | Stable ids, gerund labels, `pass`/`fail`/`skip`, codes on fail.                                                                                       |
| TC-2 | Evaluation of a transition attempt | Classify `along`; `protocol.edge`; matching predicates; `allowed` from predicates only. No pending-state routing.                                     |
| TC-3 | Applicability `from`/`to`/`along`  | Axis splice via `AXIS_FALLBACK`; redesign vs recovery vs backward. Binding table declares applicability (spec uses “engine” vocabulary for registry). |
| TC-4 | Projections                        | `availableTransitions` / public `nextAction` from the same evaluation (application command strings).                                                  |
| TC-5 | No snapshot bag                    | Verdict must not `check.run` against a bag.                                                                                                           |
| TC-6 | Registry                           | Impl checks on forward exit-`implementing` only; approvals on delivery edges.                                                                         |

### `core:change`

| ID   | Requirement                     | Essence                                                                                                                                                                                                |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CH-1 | Lifecycle / `VALID_TRANSITIONS` | Protocol table; `HAPPY_PATH_NEXT` is `to: 'next'`, not `GetStatus.nextAction`.                                                                                                                         |
| CH-2 | Artifacts                       | Persistable file states exclude `pending-parent-artifact-review`; that token is **verdict-derived** on the projection (`projectArtifacts` / `evaluateLifecycleVerdict`). Wire coerce to `in-progress`. |
| CH-3 | Guidance ownership              | Domain `nextHop`; application `evaluateLifecycle` attaches `nextAction.command`.                                                                                                                       |
| CH-4 | `assertArchivable`              | Entity asserts `archivable` or `archiving`.                                                                                                                                                            |

### `core:workflow-model`

| ID   | Requirement                | Essence                                                                                                         |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| WM-1 | Step names = `ChangeState` | `workflow[]` extras only; omit does not delete protocol.                                                        |
| WM-2 | Requires / task completion | Evaluated as `workflow.requires` / `workflow.taskCompletion` with `to` = requested target. Shared with execute. |
| WM-3 | Step availability          | From `evaluateLifecycleVerdict` projections; `CompileContext` must not call it.                                 |
| WM-4 | Progress axis              | Same `along` classification as transition-checks.                                                               |

### `core:schema-format`

| ID   | Requirement              | Essence                                                                                                                           |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| SF-1 | Artifact `requires`      | Feeds `projectArtifacts` cascade (in-progress vs parent-review split) and `Schema.artifactDag()`. No `Change.effectiveStatus()`.  |
| SF-2 | Schema artifact DAG API  | Cached `artifactDag()` with `roots`, `childrenOf`, **`parentsOf`**, `topologicalOrder`, `descendantsOf`.                          |
| SF-3 | Canonical DAG derivation | Required-upstream walks and next-artifact dependency readiness MUST use `parentsOf`; next-artifact MUST use `topologicalOrder()`. |

### `default:_global/architecture`

| ID   | Requirement                      | Essence                                                                                                                                        |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AR-1 | Package-agnostic layers          | Domain / application / infrastructure; inner never imports outer. **Must not name Core symbols, `packages/core` paths, or `LifecycleEngine`.** |
| AR-2 | Domain purity + Logger exception | Ambient `Logger` for diagnostics only (see logging).                                                                                           |
| AR-3 | Stateless domain services        | Plain functions, not classes.                                                                                                                  |
| AR-4 | Spec dependencies                | Architecture is a global constraint spec with no `dependsOn` entries (no cycle with logging).                                                  |

### `default:_global/logging`

| ID   | Requirement                         | Essence                                                                  |
| ---- | ----------------------------------- | ------------------------------------------------------------------------ |
| LG-1 | Console-compatible ambient `Logger` | No-op until composition root; any layer may import for observability.    |
| LG-2 | Domain import site (user-enforced)  | Domain MUST import `Logger` from `observability/`, never `application/`. |

---

## Implementation Status

Graph-first surfaces: `evaluateLifecycleVerdict` / `projectArtifacts` / `resolveLifecycleNextHop` in `core:src/domain/services/lifecycle-verdict.ts`; `evaluateLifecycle` in `core:src/application/services/lifecycle-evaluation.ts`; `ArtifactDag.parentsOf` in `core:src/domain/value-objects/artifact-dag.ts`; `Logger` in `core:src/observability/logger.ts`; compatibility barrel `core:src/domain/services/lifecycle-engine.ts` (re-export only); domain `index` exports from `lifecycle-verdict.js` (not the barrel).

| Req                     | Status                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1                    | **Implemented**                  | `evaluateLifecycleVerdict` is a plain function (`lifecycle-verdict.ts:142`). No `class LifecycleEngine` in `packages/core/src` or `packages/core/dist` (grep: 0 matches). `public-api.spec.ts` asserts no `LifecycleEngine` / `LifecycleEngineOptions` / `getLifecycleEngine`. Domain `nextHop` has `targetStep`/`actionType`/`reason` only (`lifecycle-verdict.ts:99-103`).                               |
| LE-2                    | **Implemented**                  | Verdict copies `options.checksByTarget`, filters `availableTransitions` by `outcome !== 'fail'` (`159-172`). No `check.run` / snapshot bag.                                                                                                                                                                                                                                                                |
| LE-3                    | **Implemented**                  | `effectiveStatus` (`353-411`): review own-state passthrough; review upstream sets `blockedByReview`; incomplete sets `blockedByIncomplete`; review wins when both (`395-407`). Tests: `computes effective status across dependency chains` (in-progress); `downgrades complete artifacts to pending-parent-artifact-review…`; **new** `given mixed review and incomplete parents…then parent-review wins`. |
| LE-4                    | **Implemented**                  | Canonical `artifact.status` only; no `hasDrift` branch in `effectiveStatus`.                                                                                                                                                                                                                                                                                                                               |
| LE-5                    | **Implemented**                  | Live change status emits `ARTIFACT_DRIFT` from `workflow.requires` (CLI `changes status`). Codes in projection helpers.                                                                                                                                                                                                                                                                                    |
| LE-6                    | **Implemented**                  | `nextHop` from `resolveLifecycleNextHop`. `isReady` from `workflow.requires` fail when checks present (`185-191`). `blockingArtifactIds` (`754-771`): when `evaluationChecks` defined, returns `[artifactId]` from failed `workflow.requires` check `details` only — no independent `requires` walk. Test: `blockingArtifacts follow check details`.                                                       |
| LE-7–LE-8               | **Implemented**                  | Recovery skip of requires for `archiving→archivable` (`214-218`). Overlap → `nextHop.targetStep === 'designing'`.                                                                                                                                                                                                                                                                                          |
| LE-9                    | **Implemented** (consumer batch) | Spies in validate/get-artifact-instruction specs on `evaluateLifecycleVerdict`.                                                                                                                                                                                                                                                                                                                            |
| LE-10                   | **Implemented**                  | `evaluateLifecycle` spreads domain verdict and attaches `nextAction` via `resolveLifecycleNextAction` (`lifecycle-evaluation.ts`).                                                                                                                                                                                                                                                                         |
| LE-11                   | **Implemented**                  | `nextArtifact` iterates `topologicalOrder()` and tests readiness with `parentsOf(artifactId)` (`774-796`).                                                                                                                                                                                                                                                                                                 |
| LE-12                   | **Implemented**                  | `lifecycle-engine.ts` is a compatibility re-export barrel only (`lifecycle-engine.ts:1-19`). Dist has no `LifecycleEngine` class.                                                                                                                                                                                                                                                                          |
| TC-\* (lifecycle slice) | **Implemented**                  | Domain `run*` helpers + application `WorkflowCheck`. Binding JSDoc in `evaluate-transition-predicates.ts` now says “Registry wiring row” (no “engine”). `transition-checks.ts:423` still says “Engine-owned wiring”.                                                                                                                                                                                       |
| CH-1–CH-4               | **Implemented**                  | `assertArchivable` JSDoc (`change.ts:1065-1073`): archivable **or** archiving. Change delta retitled to **verdict-derived** (`spec.md.delta.yaml:167,181`). One leftover line: “Engine effective status” (`spec.md.delta.yaml:202`).                                                                                                                                                                       |
| WM-\*                   | **Implemented**                  | Availability from verdict; `CompileContext` exclusion is consumer-spec (other batch).                                                                                                                                                                                                                                                                                                                      |
| SF-2                    | **Implemented**                  | `parentsOf` at `artifact-dag.ts:140-142`; tests `artifact-dag.spec.ts` “returns direct requirements via parentsOf”.                                                                                                                                                                                                                                                                                        |
| SF-3                    | **Implemented**                  | `requiresForArtifact` → `schema.artifactDag().parentsOf` when type in schema (`1010-1018`). `nextArtifact` uses `parentsOf` for dependency readiness (`785-788`).                                                                                                                                                                                                                                          |
| AR-1                    | **Implemented (preview)**        | Architecture spec-preview: no `evaluateLifecycle`, no `packages/core`, no `LifecycleEngine`. Package-agnostic layers + Logger exception only.                                                                                                                                                                                                                                                              |
| AR-4                    | **Implemented**                  | Preview `## Spec Dependencies`: _none — this is a global constraint spec_. `logging` depends on `architecture` only. Change `status` blockers: `ARTIFACT_DRIFT` only — **no `DEPS_INCONSISTENT` on architecture**.                                                                                                                                                                                         |
| AR-2 / LG-2             | **Implemented**                  | Domain import: `import { Logger } from '../../observability/logger.js'` (`lifecycle-verdict.ts:13`). No domain imports of `application/logger`. `application/logger.ts` re-exports observability (`application/logger.ts:1`).                                                                                                                                                                              |
| LG-1                    | **Implemented**                  | `Logger` / `NullLogger` in `observability/logger.ts`.                                                                                                                                                                                                                                                                                                                                                      |
| Naming hygiene          | **Partial**                      | Residual “engine” vocabulary in specs/code (see LOW discrepancies). Not a `LifecycleEngine` **class**.                                                                                                                                                                                                                                                                                                     |

---

## Discrepancies

### HIGH

_None._ Architecture preview is package-agnostic and dependency-consistent. Domain does not import `application/logger`. There is no `LifecycleEngine` class in source or `dist`. `ARTIFACT_DRIFT` is a specified, implemented blocker.

### MEDIUM

_None._ All prior MEDIUM items from audit `20260829-125651` are closed or downgraded (see re-verify table).

### LOW

#### L1 — Residual “engine” vocabulary (prior #4 — **PARTIALLY OPEN**, reduced scope)

| Location                               | Evidence                                                                                | Verdict                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `core:change` delta line 202           | “**Engine** effective status MAY additionally report `pending-parent-artifact-review`…” | **spec-wrong** — should say “verdict/effective projection” to match retitled CH-2            |
| `core:transition-checks` spec:50       | “The **engine** SHALL declare applicability…”                                           | **spec-wrong** — binding registry vocabulary; no class exists                                |
| `transition-checks.ts:423`             | JSDoc: “**Engine-owned** wiring”                                                        | **code-wrong** — inconsistent with `evaluate-transition-predicates.ts` “Registry wiring row” |
| `artifact-file.ts:54`                  | Error: “pending-parent-artifact-review is **engine-derived**…”                          | **code-wrong** — should say “verdict-derived” per CH-2                                       |
| `lifecycle-engine.spec.ts`             | Filename under `test/domain/services/`                                                  | **code-wrong** — cosmetic; tests import both domain and application layers                   |
| `lifecycle-engine/verify.md.delta`     | Requirement heading still “Available steps and **next action**”                         | **spec-wrong** — cosmetic; body correctly uses `targetStep` / `nextHop.targetStep`           |
| `lifecycle-engine.ts`                  | Compatibility barrel (intentional per LE-12)                                            | **OK** — spec requires re-export surface                                                     |
| `lifecycle-verdict.ts:1`               | eslint-disable: “Private **verdict** helpers…”                                          | **CLOSED** — was “engine” in prior audit                                                     |
| `evaluate-transition-predicates.ts:22` | “Registry wiring row”                                                                   | **CLOSED** — was “Engine wiring row” in prior audit                                          |

Not a `LifecycleEngine` **class**. User constraint “No LifecycleEngine class” holds.

#### L2 — `assertArchivable` JSDoc (prior #5 — **CLOSED**)

Current JSDoc (`change.ts:1065-1069`): asserts `archivable` **or** `archiving`; throws `InvalidStateTransitionError`. No Engine language.

#### L3 — Dist `LifecycleEngine` / `ARTIFACT_DRIFT` (prior #6 — **CLOSED**)

- No `class LifecycleEngine` / `LifecycleEngineOptions` / `getLifecycleEngine` under `packages/core/dist`.
- `ARTIFACT_DRIFT` is live on this change’s own status (`changes status workflow-transition-checks`).

#### L4 — Domain tests import application `evaluateLifecycle` (residual)

`lifecycle-engine.spec.ts` has `describe('evaluateLifecycleVerdict')` and `describe('evaluateLifecycle')`; latter imports application layer. Functional coverage is real; placement is legacy from engine-class era. Global testing convention: tests mirror src — acceptable but cross-layer.

#### L5 — No automated domain import-policy test

Architecture verify scenario “Domain imports ambient Logger” exists; no test asserting domain modules never import `application/logger`. User-enforced; manual inspection passes for `lifecycle-verdict.ts`.

---

## Prior 20260829-125651 — re-verify

| #              | Original (125651)                                                                | Verdict (142635)              | Evidence                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1             | HIGH: `DEPS_INCONSISTENT` on `default:_global/architecture` (cycle with logging) | **CLOSED**                    | Architecture preview `dependsOn: none`. Logging depends on architecture only. `changes status` blockers: `ARTIFACT_DRIFT` only — no `DEPS_INCONSISTENT`. |
| M1             | MEDIUM: `core:change` “engine-derived” / `evaluate` wording                      | **CLOSED** (one LOW residual) | Delta retitled `verdict-derived`; uses `evaluateLifecycleVerdict`. Residual: line 202 “Engine effective status” → L1.                                    |
| M2             | MEDIUM: lifecycle verify `nextAction.target` vs `targetStep`                     | **CLOSED**                    | Verify delta now asserts `nextAction.targetStep` and `nextHop.targetStep` (`verify.md.delta.yaml:66+`). Tests use `targetStep`.                          |
| M3             | MEDIUM: `availableSteps` independent `requires` walk for `blockingArtifacts`     | **CLOSED**                    | `blockingArtifactIds` uses check `details` when checks present (`760-766`). Test `blockingArtifacts follow check details`.                               |
| L4 (090131 #3) | `nextArtifact` used `ArtifactType.requires` not `parentsOf`                      | **CLOSED**                    | `nextArtifact` now calls `schema.artifactDag().parentsOf(artifactId)` (`785-788`). SF-3 delta requires this.                                             |
| L6             | Mixed incomplete parents (review + in-progress) unspecified                      | **CLOSED**                    | `effectiveStatus` review-wins logic (`395-407`). Test `given mixed review and incomplete parents…then parent-review wins`.                               |
| #4             | LOW: Engine titles leftover                                                      | **PARTIALLY OPEN**            | Several items fixed (verdict eslint, registry JSDoc). Residual L1 list (reduced).                                                                        |
| #5             | LOW: `assertArchivable` JSDoc                                                    | **CLOSED**                    | L2.                                                                                                                                                      |
| #6             | LOW: Dist LifecycleEngine / ARTIFACT_DRIFT                                       | **CLOSED**                    | L3.                                                                                                                                                      |
| 090131 #1      | Domain projected `nextAction`                                                    | **CLOSED** (unchanged)        | Domain `nextHop`; application `evaluateLifecycle` for `command`.                                                                                         |
| 090131 #2      | parent-review vs in-progress mapping                                             | **CLOSED** (unchanged)        | LE-3 + code split + tests.                                                                                                                               |

---

## Test Coverage

| Requirement                        | Tests found                                                                               | Adequacy                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| LE-1 no class                      | `test/public-api.spec.ts`                                                                 | Adequate                                                           |
| LE-1 nextHop no command            | `lifecycle-engine.spec.ts` `describe('evaluateLifecycleVerdict')`                         | Adequate                                                           |
| LE-3 in-progress cascade           | `computes effective status across dependency chains`                                      | Adequate                                                           |
| LE-3 parent-review cascade         | `downgrades complete artifacts to pending-parent-artifact-review…` + `findBlockingParent` | Adequate                                                           |
| LE-3 mixed upstream                | `given mixed review and incomplete parents…then parent-review wins`                       | **New — adequate**                                                 |
| LE-6 blockingArtifacts from checks | `blockingArtifacts follow check details`                                                  | **New — adequate**                                                 |
| LE-6/LE-10 commands                | Many `nextAction.command` cases via `describe('evaluateLifecycle')`                       | Adequate for commands; cross-layer file                            |
| LE-11 DAG next artifact            | `nextArtifact` expectations in lifecycle tests (`368`, `516`)                             | Adequate; does not assert `parentsOf` call path explicitly         |
| SF-2 `parentsOf`                   | `artifact-dag.spec.ts`                                                                    | Adequate                                                           |
| AR/LG Logger path                  | Import-site inspection; architecture verify “Domain imports ambient Logger”               | No automated “must not import application/logger from domain” test |
| TC along / AXIS_FALLBACK           | Transition-check specs/tests (sibling batch)                                              | Not fully re-audited here                                          |
| `assertArchivable`                 | Entity tests (sibling)                                                                    | Adequate                                                           |

---

## Missing Tests

1. Domain file import policy: domain modules must not import `application/logger` (user-enforced; architecture exception is observability).
2. `nextArtifact` when persisted `requires` ≠ schema `parentsOf` for unknown/off-schema artifact ids (edge case; production path uses schema `parentsOf`).
3. Explicit assertion that `nextArtifact` dependency readiness uses `parentsOf` not `artifactType.requires` (implementation correct; no spy test).
4. Rename guard: public JSON/TOON must use `targetStep` not `target` (partially covered by existing tests using `targetStep`).

---

## Spec Dependency Chain

```
default:_global/architecture  (dependsOn: none)
  └── default:_global/logging

core:schema-format  ──artifact DAG / requires cascade──►  core:workflow-model
core:change         ──persisted states / VALID_TRANSITIONS──►  core:workflow-model
core:workflow-model ──requires / axis / hooks semantics──►  core:transition-checks
core:transition-checks ──CheckResult / along / bindings──►  core:lifecycle-engine
core:change + schema-format + workflow-model + architecture + logging
  └── core:lifecycle-engine
```

Consistency notes:

- Architecture preview **does not** contradict LE by naming Core types (user-enforced). **No `DEPS_INCONSISTENT`** on architecture (cycle removed).
- Logging preview points at architecture for the Logger exception — aligned with domain `observability/` import.
- `core:change` retitled to **verdict-derived**; one “Engine effective status” line remains (L1).
- `core:schema-format` mapping rules **match** LE-3; SF-3 `parentsOf` requirement **matches** code.
- `core:workflow-model` availability via `evaluateLifecycleVerdict` **matches** LE-9.
- `core:transition-checks` still uses “engine” for binding registry in one requirement (L1) — vocabulary drift, not behavioral contradiction.
- Lifecycle verify uses `targetStep` — **aligned** with spec.md (M2 closed).

---

## Summary counts

|                                       | Count                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Requirements inventoried (this batch) | **~42** (12 LE + 6 TC-lifecycle + 4 CH + 4 WM + 3 SF + 4 AR + 2 LG; plus overlapping verify scenarios) |
| Implemented                           | **41**                                                                                                 |
| Partial                               | **1** (naming hygiene / residual “engine” vocabulary only)                                             |
| Missing implementation                | **0**                                                                                                  |
| Discrepancies HIGH                    | **0**                                                                                                  |
| Discrepancies MEDIUM                  | **0**                                                                                                  |
| Discrepancies LOW                     | **5** (L1 open reduced; L2–L3 closed priors; L4–L5 residual)                                           |
| Prior 125651 items CLOSED             | **D1, M1 (main), M2, M3, L4, L6, #5, #6, 090131 #1–#3**                                                |
| Prior 125651 items PARTIALLY OPEN     | **#4** (Engine vocabulary — reduced)                                                                   |
| Missing tests                         | **4**                                                                                                  |

**Highest findings (≤10 lines):**  
0 HIGH, 0 MEDIUM. All prior blocking MEDIUM items closed: architecture `DEPS_INCONSISTENT` gone; change spec retitled verdict-derived; verify uses `targetStep`; `blockingArtifacts` follows check details; `nextArtifact` uses `parentsOf`; mixed-parent test added. LOW OPEN: residual “engine” wording in change delta line 202, transition-checks spec/JSDoc, `artifact-file.ts` error message, verify heading “next action”, `lifecycle-engine.spec.ts` filename. CLOSED: no `LifecycleEngine` class in src/dist; domain Logger from `observability/`; architecture preview package-agnostic; `assertArchivable` JSDoc; `ARTIFACT_DRIFT` remains real.

---

## Partial file: `_partial-use-cases.md`

# Spec compliance — use-case batch (`workflow-transition-checks`)

- **Mode:** change (read-only audit)
- **Change:** `workflow-transition-checks`
- **Report:** `20260829-142635`
- **Assigned specs:** `core:get-status`, `core:transition-change`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:approve-spec`, `core:approve-signoff`, `core:config`
- **Preview source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`
- **Graph:** fresh (`stale: false`); navigation via `graph search` / `graph impact` on `GetStatus`, `TransitionChange`, `ValidateArtifacts`, `GetArtifactInstruction`, `ApproveSpec`, `ApproveSignoff`
- **Code paths:** `packages/core/src/application/use-cases/*.ts`, `packages/core/src/composition/use-cases/*.ts`, matching tests under `packages/core/test/`
- **Neither spec nor code is truth.** Discrepancies list Option A (spec / wording drift) and Option B (code wrong).
- **Prior batch:** `reports/20260829-125651/_partial-use-cases.md`

---

## Requirements Summary

### `core:get-status`

| ID    | Requirement                                                                                                                                                                                                    | Spec location (preview)                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GS-1  | `execute` accepts `name`, optional `refreshImplementationTracking`, `ifModifiedSince`                                                                                                                          | Accepts a change name as input                    |
| GS-2  | Result: `change` XOR `draftView`, `artifactStatuses`, `specDependsOn`, `review`, `blockers`, `nextAction`; 304-style `unchanged`                                                                               | Returns the change and its artifact statuses      |
| GS-3  | Resolution `get` then `getDraft`; never `getDiscarded`; unknown → `ChangeNotFoundError`                                                                                                                        | Returns… / Throws ChangeNotFoundError             |
| GS-4  | Drafted: empty `availableTransitions` / `availableSteps`; `nextAction.command` MUST NOT recommend transition/validate                                                                                          | Drafted change read-only status                   |
| GS-5  | Drafted effective statuses via `projectArtifacts` only (same DAG cascade as `evaluateLifecycleVerdict` with empty `checksByTarget`); MUST NOT call `evaluateLifecycle` or `evaluateLifecycleVerdict` on drafts | Drafted change read-only status                   |
| GS-6  | Implementation tracking projection; refresh via `RefreshImplementationTracking` only (not detector)                                                                                                            | Implementation status / Optional pre-read refresh |
| GS-7  | Drift-aware `displayStatus` / `hasDrift`                                                                                                                                                                       | Drift-aware display status                        |
| GS-8  | Task counts from `workflow.taskCompletion` (`CountTasks` inside check); MUST NOT second `CountTasks`; MUST NOT ctor `CountTasks`                                                                               | Reports task completion counts / Constructor      |
| GS-9  | All matching predicates per legal hop (no `protocol.edge` fail-fast); archive predicates when `archivable`                                                                                                     | Execute matching predicates then project          |
| GS-10 | Import `evaluateLifecycle` as module function; MUST NOT ctor `evaluateLifecycle` / `LifecycleEngine` / `CountTasks`                                                                                            | Constructor dependencies                          |
| GS-11 | `resolveGetStatusDeps` MUST NOT resolve `lifecycle` / `LifecycleEngine` / `evaluateLifecycle`                                                                                                                  | Config-based factory…                             |
| GS-12 | Full path: one entry per schema artifact type; `effectiveStatus` via `evaluateLifecycle` / `projectArtifacts`                                                                                                  | Reports effective status…                         |
| GS-13 | Review priority (drift → overlap → pending-review); blockers include check codes; `workflow.requires` mapping shared with checks                                                                               | Returns lifecycle context / Identifies blockers   |
| GS-14 | Schema `get()` failure: degrade, `validTransitions` populated, `availableTransitions` empty, no throw                                                                                                          | Graceful degradation                              |

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

**Global / architecture (depth-1, relevant):** inner layers never import outer (`default:_global/architecture`). Domain MUST NOT import `application/`.

---

## Implementation Status

Evidence is `packages/core/src/...` line numbers unless noted.

### Closed vs prior `20260829-125651` (this batch)

| Prior claim                                                                       | Re-verify (this pass)                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leftover **engine JSDoc on GetStatus** (`:771`, `:799`)                           | **CLOSED.** `get-status.ts` has **zero** `engine` matches (grep). `_nextActionAfterArchiveOverlap` (`:770-772`) and `_projectReview` (`:798-799`) now say **verdict**. `LifecycleContext.availableSteps` comment (`:232`) references `evaluateLifecycle`. |
| Drafted path uses `projectArtifacts` only vs full `evaluateLifecycleVerdict` (D2) | **CLOSED as discrepancy.** Preview delta now **requires** `projectArtifacts` only and **forbids** `evaluateLifecycle` / `evaluateLifecycleVerdict` on drafts (GS-5). Code (`:640-667`) and tests (`get-status.spec.ts:818-852` spy not called) align.     |
| Drafted `nextAction.command === null` test gap                                    | **CLOSED** (unchanged). `get-status.spec.ts:815`.                                                                                                                                                                                                         |
| Approve spec **engine check bindings** wording                                    | **STILL OPEN (LOW, spec-only).** `approve-spec` / `approve-signoff` Spec Dependencies still say "engine bindings" (`spec-preview` lines ~2938, ~3155). Code uses `boundFromStates` from `check-bindings.js`.                                              |

### Per-spec implementation

**GetStatus — IMPLEMENTED**

- Ctor: `get-status.ts:307-321` — `ChangeRepository`, `SchemaProvider`, `approvals`, `RefreshImplementationTracking`, `transitionBindings`, `archiveBindings`. No `CountTasks`, no `evaluateLifecycle` port.
- Module import: `:18` `evaluateLifecycle` from `../services/lifecycle-evaluation.js`. Domain `projectArtifacts` from `lifecycle-verdict.js` (`:12-17`).
- Active path: `projectArtifacts` `:452` → `executeChecksByLegalTargets` `:457-463` (no `failFastOn`) → archive predicates when `archivable` `:465-479` → `evaluateLifecycle` `:481-484`. Task paint from `taskCompletionFromChecks` after checks.
- Drafted: `_buildDraftedResult` `:621-715` — `projectArtifacts` only `:640-667`; empty hops `:673-676`; `nextArtifact: null` `:679`; `nextAction.command: null` `:709-713`.
- Schema fail: `try/catch` `SchemaNotFoundError` in active and drafted paths; degraded lifecycle on active path per spec.
- Composition: `resolveGetStatusDeps` `composition/use-cases/get-status.ts:39-50` — no `lifecycle` key.

**TransitionChange — IMPLEMENTED**

- Ctor `:129-143` matches TC-7.
- `to === 'next'` uses `HAPPY_PATH_NEXT` `:182-187`.
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

- ApproveSpec: `boundFromStates('approval.spec')` (`approve-spec.ts:86`); drain only if `pending-spec-approval` (`:96-98`). Ready path does not `transition` to pending. Class JSDoc `:22-24` names binding table / drain.
- ApproveSignoff: analogous (`approve-signoff.ts:86-98`).
- `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` — repositories, hasher, `approvals` only.

**Config — IMPLEMENTED**

- `SpecdConfig.approvals` `specd-config.ts:220`; zod `approvals: z.object({ spec: z.boolean(), signoff: z.boolean() })` `:279`.
- Loader defaults: `config-loader.ts:616` — `{ spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }`.
- Preview documents in-place gates; `approvals.spec: true` wait is the check, not a pending hop.

**Architecture / domain imports — IMPLEMENTED**

- Workspace search `packages/core/src/domain` for `from '...application/'`: **no matches**.
- Domain `workflow-requires.ts` is pure domain.

**`workflow.requires` code map (shared by GetStatus blockers / TransitionChange throws)**

`packages/core/src/domain/checks/workflow-requires.ts:49-74`:

- `pending-review` → `REVIEW_REQUIRED`
- `drifted-pending-review` → `ARTIFACT_DRIFT`
- `pending-parent-artifact-review` → `PENDING_PARENT_REVIEW`
- else → `INCOMPLETE_ARTIFACT`

**`HAPPY_PATH_NEXT` / fail-fast protocol**

- Table: `change-state.ts:49-58`.
- GetStatus collects all fails: `executeChecksByLegalTargets` calls `executeMatchingPredicates` **without** `failFastOn` (`execute-matching-predicates.ts:219-231`).
- TransitionChange fail-fast: `failFastOn === result.id` with `'protocol.edge'`.

**`LifecycleEngine` class**

- Search under `packages/core`: **no** `class LifecycleEngine`. Graph class `GetStatus` is the use case, not an engine.

---

## Discrepancies

### D1 — LOW — leftover **"engine" wording in spec preview** (not in GetStatus code)

**Evidence (spec preview):**

- `core:validate-artifacts` requirement title: "DAG lifecycle from **engine** evaluate" (appears in spec + verify sections).
- `core:get-artifact-instruction` verify scenario: "Omitted artifactId uses **engine-derived** readiness"; sibling scenario "when **engine** reports dependency blockage".
- `core:approve-spec` / `core:approve-signoff` Spec Dependencies: "`from` states … come from **engine bindings**".

**Evidence (code):** No `engine` string in `get-status.ts`, `approve-spec.ts`, or `approve-signoff.ts`. Implementation uses `evaluateLifecycleVerdict`, `boundFromStates`, and `check-bindings` registry.

**Option A (prefer):** Spec/verify titles still name the removed `LifecycleEngine` class. Update to `evaluateLifecycleVerdict` / `transition-checks` bindings / `boundFromStates`.

**Option B:** Code should still expose an "engine" abstraction — **rejected** by search: no `class LifecycleEngine`, no ctor injection.

**Severity:** documentation / spec-preview drift only.

### D2 — none — drafted GetStatus `projectArtifacts` path

**Prior 125651:** LOW optional gap (code under-projects `nextArtifact`/`review` on drafts vs dual spec wording).

**This pass:** Preview delta **explicitly** requires `projectArtifacts` only and forbids `evaluateLifecycle` / `evaluateLifecycleVerdict` on drafts. Code and tests match. **No discrepancy.**

### D3 — INFO — config approvals default test gap

**Spec verify:** "GIVEN `specd.yaml` does not declare `approvals.spec` THEN `approvals.spec` defaults to `false`" (and signoff analogue).

**Code:** `config-loader.ts:616` implements defaults.

**Tests:** `config-loader.spec.ts:961-974` covers explicit `approvals` parsing; **no** test omits `approvals` and asserts `{ spec: false, signoff: false }`.

**Severity:** INFO — implementation likely correct; verify scenario not directly exercised.

### D4 — none found — domain → application

No domain files import application. **Compliant.**

### D5 — none found — `LifecycleEngine` class / ctor injection

No `class LifecycleEngine`, no `new LifecycleEngine`, no `lifecycle:` composition stub on scoped `resolve*Deps`. **Compliant.**

---

## Test Coverage

| Spec / contract                                                       | Tests (file:line)                                                    | Verdict                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| GetStatus ctor / composition no lifecycle                             | `test/composition/use-cases/get-status.spec.ts:69-112`               | Covered                    |
| Drafted empty transitions / steps / **command null**                  | `get-status.spec.ts:795-815`                                         | Covered (`command` `:815`) |
| Drafted `projectArtifacts` parent-review; no `evaluateLifecycle`      | `get-status.spec.ts:818-858`                                         | Covered                    |
| Drafted missing schema artifacts from DAG                             | `get-status.spec.ts:861+`                                            | Covered                    |
| CountTasks inside check, once per execute, before `evaluateLifecycle` | `get-status.spec.ts:387-434` (`toHaveBeenCalledTimes(1)` `:430`)     | Covered                    |
| GetStatus collect-all fails (no `protocol.edge` fail-fast)            | `execute-matching-predicates.spec.ts:43-71`                          | Covered (runner)           |
| `failFastOn: 'protocol.edge'`                                         | `execute-matching-predicates.spec.ts:74-98`; TransitionChange `:215` | Covered                    |
| `to: 'next'` / HAPPY_PATH / pending rejects                           | `transition-change.spec.ts:185-241`; `change-state.spec.ts:72-79`    | Covered                    |
| Approvals stay in `ready` / `done`                                    | `transition-change.spec.ts:377-391`, `:435-447`                      | Covered                    |
| ApproveSpec stays in `ready`                                          | `approve-spec.spec.ts:71-89`                                         | Covered                    |
| ApproveSignoff stays in `done`                                        | `approve-signoff.spec.ts:72-89`                                      | Covered                    |
| ValidateArtifacts empty `checksByTarget`                              | `validate-artifacts.spec.ts:241-264`                                 | Covered                    |
| GAI empty `checksByTarget` / auto `nextArtifact`                      | `get-artifact-instruction.spec.ts:98-104`                            | Covered                    |
| `workflow.requires` codes                                             | `workflow-requires.spec.ts:20-71`                                    | Covered                    |
| Config explicit approvals parse                                       | `config-loader.spec.ts:961-974`                                      | Covered                    |
| `boundFromStates` registry                                            | `transition-checks.spec.ts:221-223`                                  | Covered                    |

---

## Missing Tests

| Gap                                                             | Spec                        | Suggested assertion                                                                                                            |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Config approvals default when section omitted                   | CFG-1 verify                | Load minimal yaml without `approvals`; expect `{ spec: false, signoff: false }`                                                |
| GAI verify title "engine-derived"                               | GAI verify                  | Rename scenario only; behaviour already tested via `evaluateLifecycleVerdict` spy                                              |
| Composition never resolves `lifecycle` (explicit key assertion) | GS-11 / TC-6 / VA-3 / GAI-3 | Optional: `expect(deps).not.toHaveProperty('lifecycle')` in composition tests (pattern exists in `compile-context.spec.ts:88`) |
| GetStatus hop with two fails at **use case** level              | GS-9                        | Runner test exists; optional UC-level two-fail hop integration                                                                 |

**Closed vs 125651:** drafted `nextAction.command === null` — **not missing**. Draft `evaluateLifecycleVerdict` spy — **not missing** (spec now forbids the call). GetStatus engine JSDoc — **not missing** (removed).

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

**Consistency note:** several specs still **depend on** `core:lifecycle-engine` while implementation uses `evaluateLifecycle` / `evaluateLifecycleVerdict`. That is a **spec-id naming** artifact (the engine spec describes module functions). Not a code import violation.

**Architecture:** `default:_global/architecture` forbids domain → application. Code complies.

---

## Summary counts

| Metric                               | Count                                           |
| ------------------------------------ | ----------------------------------------------- |
| Specs in this batch                  | 7                                               |
| Requirements tracked (tables above)  | 32                                              |
| Implemented (behaviour)              | 32 / 32                                         |
| Partial / wording-only               | 1 (D1 spec "engine" titles / dependencies text) |
| Functional discrepancies             | 0 HIGH; 0 LOW functional                        |
| Missing tests                        | 1 INFO (config approvals default); 3 optional   |
| Prior GetStatus engine JSDoc         | **CLOSED**                                      |
| Prior drafted `command` null test    | **CLOSED**                                      |
| Prior D2 draft `projectArtifacts`    | **CLOSED** (spec aligned)                       |
| Prior approve-spec "engine bindings" | **OPEN (LOW, spec-only)**                       |
| `LifecycleEngine` class              | **ABSENT**                                      |
| domain → application imports         | **ABSENT**                                      |

**Focus-contract scorecard**

| Contract                                                         | Status                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GetStatus / TransitionChange import `evaluateLifecycle`, no ctor | **PASS** (`get-status.ts:18,481`; `transition-change.ts:14,219`)                            |
| DAG UCs `evaluateLifecycleVerdict` + `{ checksByTarget: {} }`    | **PASS** (VA `:220-222`; GAI `:97-99`; tests spy empty bag)                                 |
| Drafted GetStatus `projectArtifacts` only, no evaluate calls     | **PASS** (code `:640-667`; test `:849-852`)                                                 |
| `resolve*Deps` MUST NOT resolve lifecycle / LifecycleEngine      | **PASS** (GetStatus, TransitionChange, ValidateArtifacts, GAI, ApproveSpec, ApproveSignoff) |
| Drafted GetStatus empty hops + `command` null                    | **PASS** (code `:675-713`; test `:815`)                                                     |
| `workflow.requires` status → codes                               | **PASS** (`workflow-requires.ts:53-74`; tests `:20-71`)                                     |
| TransitionChange `failFastOn: 'protocol.edge'`                   | **PASS** (`:215`; runner tests)                                                             |
| `to: 'next'` = `HAPPY_PATH_NEXT`                                 | **PASS** (`:182-187`; `change-state.ts:49-58`)                                              |
| Approvals in place (no pending-spec-approval rewrite)            | **PASS** (`effectiveTarget = requestedTarget`; tests stay in `ready` / `done`)              |
| Task gating via `workflow.taskCompletion`, not second CountTasks | **PASS** (GetStatus paints from check details; test `:430`)                                 |
| Config approvals default false                                   | **PASS** (loader `:616`; explicit-parse test only)                                          |

---

## Partial file: `_partial-archive-hooks.md`

# Spec-compliance audit (partial): archive, hooks, storage

**Mode:** change `workflow-transition-checks`  
**Scope:** `core:archive-change`, `core:hook-execution-model`, `core:storage`  
**Read-only**

---

## Implementation Status

| Requirement                                              | Verdict         | Evidence                                                       |
| -------------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| `failFastOn: 'schema.nameMatch'`                         | **Implemented** | `execute-matching-predicates.spec.ts`; archive bindings        |
| Overlap load after predicates                            | **Implemented** | `_loadArchiveOverlap` gated (`archive-change.ts:294-303`)      |
| `isArchivable` / `assertArchivable` includes `archiving` | **Implemented** | `change.spec.ts`                                               |
| Dual `runDepsConsistent` documented                      | **Implemented** | spec + merge-time pass                                         |
| Domain hook stub comments                                | **Implemented** | `domain/checks/hook-pre.ts`, `hook-post.ts`                    |
| Schema mismatch no peer `list`                           | **Implemented** | test `throws SchemaMismatchError without listing peer changes` |

---

## Discrepancies

### HIGH / MEDIUM / LOW

_None in this batch._

Optional note: overlap-fail may still double-scan peers in predicate details + host load — spec permits; not a MUST fail.

---

## Test Coverage

| Gap (prior)                    | Now                                            |
| ------------------------------ | ---------------------------------------------- |
| Schema mismatch skips `list()` | **Covered** (`archive-change.spec.ts:274-289`) |
| `archiving` retry              | Covered via entity + CLI (sibling batch)       |

---

## Closed vs prior `20260829-125651`

All four prior LOW items **remain CLOSED**.

---

## Summary counts

|        | Count |
| ------ | ----- |
| HIGH   | **0** |
| MEDIUM | **0** |
| LOW    | **0** |

---

## Partial file: `_partial-cli-skills.md`

# Spec-compliance audit (partial): CLI + skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `cli:change-status`, `cli:change-transition`, `cli:change-approve`, `cli:change-archive`, `skills:skill-templates-source`  
**Read-only.** Graph `stale: false` (indexed `2026-08-29T12:26:58.866Z`). Specs via `changes spec-preview workflow-transition-checks`.  
**Prior 125651 (this batch):** 0 HIGH/MEDIUM; LOW help schema sketch, duplicate archive verify heading, test gaps (JSON gerund, JSON transition failure, archiving retry passthrough).  
**Re-verify focus:** status help `artifactDag`, drafted JSON empty hops, transition JSON failure stream, archive no GetStatus preflight, skills `archivable`|`archiving`.

**Tests run (pass):** `packages/cli` (890 tests incl. change status/transition/approve/archive specs); `packages/skills` (50 tests incl. `template-workflow.spec.ts`).

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

| Req     | Status          | Evidence                                                                                                                                                                                                                                                          |
| ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1      | **Implemented** | `status <name>`, `--format`, `--implementation`                                                                                                                                                                                                                   |
| S2      | **Implemented** | `draftView` branch: text `(drafted)`, transitions `(none — change is drafted)`, `command: (none)`; JSON `isDrafted: true`, `availableTransitions: []`, `availableSteps: []`, `nextAction.command: null` even when Core leaked hops/command (`status.ts` L142–179) |
| S3–S5   | **Implemented** | DAG `state` from `displayStatus`; JSON files include `state` + `displayStatus`; `hasTasks` boolean                                                                                                                                                                |
| S6      | **Implemented** | Text/JSON hops copied from `lifecycle.availableTransitions` / `availableSteps`; no VALID_TRANSITIONS rewrite                                                                                                                                                      |
| S7      | **Implemented** | `review:` without file paths; overlap section from `overlapDetail`; filters `OVERLAP_CONFLICT` when reason is `spec-overlap-conflict`                                                                                                                             |
| S8      | **Implemented** | `! ${code} — ${label}: ${message}`; JSON maps `label`/`checkId` via spread (`status.ts` L410–415)                                                                                                                                                                 |
| S9      | **Implemented** | compares `change.schema*` to `lifecycle.schemaInfo` only; skip if null                                                                                                                                                                                            |
| S10     | **Implemented** | `handleError`                                                                                                                                                                                                                                                     |
| S11     | **Implemented** | `resolveStatusSchemaDag` prefers `schema.artifactDag()`; fallback `ArtifactDag.from(schemaInfo.artifacts)` when `activeSchema.raw`; `visited` set omits convergent repeats (spec MAY omit)                                                                        |
| S12     | **Implemented** | `status.execute({ name })` only                                                                                                                                                                                                                                   |
| S13     | **Implemented** | `enrichImplementationTracking` gated on `--implementation`                                                                                                                                                                                                        |
| S14–S16 | **Implemented** | details `tasks: N/M`; no `specs:` line; `specDependsOn`                                                                                                                                                                                                           |

**Help (125651 LOW — now closed):** `--help` JSON schema documents nested `schema: { name, version, artifactDag: … }`, top-level `artifactDag`, drafted-only top-level hops comment, and `review.overlapDetail` (`status.ts` L94–125). Test `help documents nested schema.artifactDag and overlapDetail` asserts both strings.

**Note (not scored as fail):** handler calls `kernel.specs.getActiveSchema.execute()` for DAG topology. Constraint forbids another use case to recompute **lifecycle**; S11 requires a live `Schema.artifactDag()`. Version warning does **not** resolve schema independently.

### `cli:change-transition` — `packages/cli/src/commands/change/transition.ts` + `_check-progress-presenter.ts`

| Req        | Status          | Evidence                                                                                                                                           |
| ---------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1         | **Implemented** | `[step]` optional; `--next` xor step; `--allow-out-of-scope` only when flag set                                                                    |
| T2         | **Implemented** | `to: requestedTarget` is `'next'` or concrete state; `CHANGE_STATES` is validation, not a from→to table                                            |
| T3         | **Implemented** | preflight + repair `status.execute({ name, refreshImplementationTracking: false })`                                                                |
| T4         | **Implemented** | execute input is `name`, `to`, `skipHookPhases`, optional `allowOutOfScope`                                                                        |
| T5         | **Implemented** | `parseCommaSeparatedValues` vs `source.pre/post`, `target.pre/post`, `all`                                                                         |
| T6–T8, T13 | **Implemented** | presenter `streamName: 'change-transition'`; text to stderr; no `Executing:`                                                                       |
| T9         | **Implemented** | `transitioned ${name}: ${from} → ${to}`; JSON complete `ok`                                                                                        |
| T10        | **Implemented** | `HookFailedError` not in `isRepairGuideError`; `handleError` exit 2                                                                                |
| T11        | **Implemented** | gerund blocker lines; repair guide from GetStatus `nextAction`; JSON failure complete includes `blockers`, `nextAction` (`transition.ts` L298–311) |
| T12, T14   | **Implemented** | delegated to Core; CLI surfaces errors                                                                                                             |

Help description: stay in ready/done; pending drain — policy, not a routing table (constraint T).

### `cli:change-approve` — `packages/cli/src/commands/change/approve.ts`

| Req   | Status          | Evidence                                                                 |
| ----- | --------------- | ------------------------------------------------------------------------ | -------------------------------- |
| A1–A3 | **Implemented** | `requiredOption('--reason')`; execute `{ name, reason }` only; no hashes |
| A4–A5 | **Implemented** | help: ready / done with pending drain wording; stdout `approved spec     | signoff for` with no pending hop |
| A6–A7 | **Implemented** | JSON `{ result, gate, name }`; Commander + `handleError`                 |

Command does **not** call GetStatus (tests still mock it unused).

### `cli:change-archive` — `packages/cli/src/commands/change/archive.ts`

| Req   | Status          | Evidence                                                                                                                                             |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| R1    | **Implemented** | registered on `changes` with alias `change` (`packages/cli/src/index.ts`)                                                                            |
| R2    | **Implemented** | **no** local state table; description: “archivable … or retry from archiving”; direct `kernel.changes.archive.execute` only — no GetStatus preflight |
| R3–R4 | **Implemented** | direct `archive.execute`; skip set `pre                                                                                                              | post | all` |
| R5    | **Implemented** | same presenter, `streamName: 'change-archive'`                                                                                                       |
| R6    | **Implemented** | `postHookFailures` → `cliError(..., 2)` **before** success print                                                                                     |
| R7–R9 | **Implemented** | text path; invalidated only if `length > 0`; JSON single stream complete object                                                                      |
| R10   | **Implemented** | `ChangeNotFoundError` / `InvalidStateTransitionError` / `SpecOverlapError`                                                                           |

**No GetStatus preflight (125651 closed, re-verified):** `archive.ts` action calls only `kernel.changes.archive.execute`; test `confirms archive in text format` asserts `status.execute` not called.

### `skills:skill-templates-source`

| Req                                          | Status                       | Evidence                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K15 archive                                  | **Implemented**              | `specd-archive/SKILL.md.tpl`: MUST already be `archivable` **or** `archiving`; signoff wait `/specd-verify` in `done`; no `pending-signoff` / transition into it                    |
| K15 verify/implement/design/new/shared/entry | **Implemented**              | stay-in-state; drain-only pending rows; entry skill has no signoff copy (`template-workflow.spec.ts`)                                                                               |
| K16–K19                                      | **Implemented**              | shared cookbook; verify drains `IMPLEMENTATION_STATE`; archive `--skip-hooks pre`; design does not list files under `review:`; hop skills do not list `OVERLAP_CONFLICT` as typical |
| K1–K14                                       | **Implemented** (spot-check) | `.md.tpl` + meta; no `graph impact --changes`; `--snippet` opt-in in shared/new/design                                                                                              |

---

## Discrepancies

None **HIGH** / **MEDIUM** / **LOW**. Prior 125651 nits in this batch are **closed**.

### Closed priors (do not re-open)

| Prior (125651)                           | Re-verify result                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LOW** help schema sketch vs S11        | **Closed.** Help lists nested `schema.artifactDag` and top-level `artifactDag`; test added.                                                                                                                                                                                                   |
| **LOW** duplicate archive verify heading | **Closed.** Merged `changes spec-preview` shows one `Scenario: Change not in archivable state` (updated GIVEN) plus distinct `Scenario: Change in archiving may retry archive` — no duplicate heading.                                                                                        |
| **Drafted JSON empty hops**              | **Closed.** `status.ts` forces `[]` hops and `nextAction.command: null`; test leaks Core `availableTransitions: ['ready']`.                                                                                                                                                                   |
| **Archive archivable-only CLI gate**     | **Closed.** Core owns `assertArchivable`; description includes `archiving` retry.                                                                                                                                                                                                             |
| **Archive GetStatus preflight**          | **Closed.** Absent in handler; test asserts `status.execute` not called.                                                                                                                                                                                                                      |
| **Skills archive/verify parking copy**   | **Closed.** Archive requires `archivable` **or** `archiving`; verify does not teach `pending-signoff`.                                                                                                                                                                                        |
| **MED** transition JSON failure stream   | **Partially closed.** New test `JSON incomplete-tasks failure is a change-transition stream failure record` asserts terminal NDJSON `stream: change-transition`, `event.type: complete`, `result: failure`. Implementation also emits `blockers`/`nextAction` — see remaining test gap below. |

### Remaining notes (not implementation bugs)

| Sev  | Spec                                     | Item                                                                                                                                                             | Assessment                                            |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| NOTE | `cli:change-status` S11 vs constraint    | `getActiveSchema` used for DAG.                                                                                                                                  | Allowed by S11; not used to recompute lifecycle hops. |
| NOTE | `cli:change-archive` workspace verify.md | Base `specs/cli/change-archive/verify.md` on disk still has pre-delta JSON success wording until archive; merged change preview is authoritative for this audit. | Spec hygiene at archive time, not a code gap.         |

No spec↔global contradiction in this batch: in-place `approval.spec` / `approval.signoff` is consistently “stay in ready/done + approve”, not protocol hops to pending.

---

## Test Coverage

### `packages/cli/test/commands/change/status.spec.ts`

| Spec / scenario                              | Test                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| S2 drafted JSON leak                         | `JSON drafted status includes isDrafted and empty transitions`                      |
| S2 drafted text                              | `text drafted status marks drafted and omits transition commands`                   |
| S1 missing name                              | `Missing name argument`                                                             |
| S7 help overlapDetail + S11 help artifactDag | **`help documents nested schema.artifactDag and overlapDetail`** (new since 125651) |
| S12 no refresh                               | `Normal status output` — `refreshImplementationTracking.execute` not called         |
| S15/S16                                      | no `specs:`; has `specs and dependencies:`                                          |
| S8 gerund (text)                             | `Text blockers include gerund label`                                                |
| S6 hops passthrough                          | `Text output shows available transitions`                                           |
| S11 childrenOf                               | `JSON artifactDag children match schema DAG childrenOf`                             |
| S3 drift DAG state                           | `JSON output includes hasTasks and drift-aware state in artifactDag`                |
| S7/S8 overlap                                | review header, no file lists, hide vs show `OVERLAP_CONFLICT`, JSON `overlapDetail` |
| S9/S10                                       | Schema mismatch; Unknown change name                                                |
| S14                                          | `shows task counts in the details section`                                          |

### `packages/cli/test/commands/change/transition.spec.ts`

| Spec / scenario             | Test                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| T1 xor / allowOutOfScope    | combine `--next`+step; flag on/off                                                                  |
| T2 `--next`                 | `to: 'next'`; ready→implementing without pending persist; signed-off→archivable                     |
| T3 refresh false            | preflight + nth call on repair                                                                      |
| T4 no rewrite               | ready→implementing; done→archivable stay                                                            |
| T5 skip phases              | `all`, empty, comma `target.pre,source.post`                                                        |
| T6–T8, T13                  | gerund predicate; hook bus; JSON `stream !== 'hook-progress'`                                       |
| T9 JSON complete            | success complete record                                                                             |
| T10 HookFailedError         | exit 2, no `repair guide:`; progress then fail                                                      |
| T11 repair (text)           | InvalidStateTransitionError; gerund `READ_ONLY_WORKSPACE`; verify not implement                     |
| **T11 JSON failure stream** | **`JSON incomplete-tasks failure is a change-transition stream failure record`** (new since 125651) |
| T12                         | Unchecked checkboxes block verifying                                                                |

### `packages/cli/test/commands/change/approve.spec.ts`

| Spec / scenario | Test                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| A4/A6           | success from ready; no `pending-spec-approval` in stdout; JSON                       |
| A5              | success from done; drain from pending-signoff                                        |
| A1/A7           | missing `--reason`; unknown sub-verb; not found; wrong state                         |
| A2 call shape   | `execute` `{ name, reason }` only on `kernel.changes.approveSpec` / `approveSignoff` |

### `packages/cli/test/commands/change/archive.spec.ts`

| Spec / scenario    | Test                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| R2/R3 no GetStatus | `confirms archive` + `status.execute` not called                                |
| R2 not archivable  | `exits 1 when change is not in archivable state`                                |
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

| Sev | Spec                        | Gap                                                                                                                                                                                     | vs 125651                             |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| MED | `cli:change-status` S8      | Verify scenario requires JSON `blockers[].label`; test `Text blockers include gerund label` is **text-only** — no `--format json` assertion on `label`/`checkId`.                       | unchanged                             |
| MED | `cli:change-status` S6      | No test that CLI does **not** inject `verifying` from `validTransitions` when GetStatus omitted it; no status-level nextAction implement-vs-verify (covered only on transition repair). | unchanged                             |
| MED | `cli:change-transition` T11 | JSON failure test asserts stream/`result: failure` only — does **not** assert `blockers` / `nextAction` in terminal record (implementation emits both).                                 | **narrowed** (stream test added)      |
| MED | `cli:change-archive` R2     | Verify scenario **Change in archiving may retry** — no test that CLI forwards `archiving` without a local archivable-only gate.                                                         | unchanged                             |
| LOW | `cli:change-status` S2      | Discarded name → exit 1; relies on Core `ChangeNotFoundError` without a status-unit case.                                                                                               | unchanged                             |
| LOW | `cli:change-status` S4      | DAG `[hasTasks]` fallback when `taskCompletion` absent.                                                                                                                                 | unchanged                             |
| LOW | `cli:change-status` S11     | Convergent DAG (`design` under proposal **and** specs) not duplicated — no test.                                                                                                        | unchanged                             |
| LOW | `cli:change-status` S9      | `schemaInfo: null` skips warning — no test.                                                                                                                                             | unchanged                             |
| LOW | `cli:change-archive` R1     | Singular alias `change archive` vs `changes archive` — verify scenario exists; no dedicated unit test.                                                                                  | unchanged                             |
| LOW | `cli:change-archive` R10    | stderr **names current state** — test only `/error:/`.                                                                                                                                  | unchanged                             |
| LOW | `cli:change-approve` A2     | No assertion `kernel.specs.approveSpec` is **not** invoked (call-shape on changes path is tested).                                                                                      | unchanged                             |
| LOW | `cli:change-transition` T5  | Individual `--skip-hooks target.pre` vs `source.post` (comma set is tested).                                                                                                            | unchanged                             |
| LOW | skills K5                   | Graph dependents wording / `--direction dependents` not asserted in `template-workflow.spec.ts`.                                                                                        | unchanged                             |
| —   | `cli:change-status` S7 help | ~~`--help` contains `overlapDetail`~~                                                                                                                                                   | **closed** — covered by new help test |

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

| Spec                            | Requirements | Implemented | Partial | Missing impl | Discrepancies (open) |                                 Verify scenarios well-covered | Missing tests (rows above) |
| ------------------------------- | -----------: | ----------: | ------: | -----------: | -------------------: | ------------------------------------------------------------: | -------------------------: |
| `cli:change-status`             |           16 |          16 |       0 |            0 |                    0 |                                                     ~23 / ~28 |                          6 |
| `cli:change-transition`         |           14 |          14 |       0 |            0 |                    0 |                                                     ~25 / ~30 |                          2 |
| `cli:change-approve`            |            7 |           7 |       0 |            0 |                    0 |                                                       10 / 12 |                          2 |
| `cli:change-archive`            |           10 |          10 |       0 |            0 |                    0 |                                                       16 / 18 |                          3 |
| `skills:skill-templates-source` |           19 |          19 |       0 |            0 |                    0 | change-delta scenarios covered in `template-workflow.spec.ts` |                          1 |
| **Total**                       |       **66** |      **66** |   **0** |        **0** |                **0** |                                                             — |                     **13** |

**Verdict:** this batch is **compliant**. All 125651 CLOSED behaviour items remain closed; two 125651 LOW nits (help `artifactDag`, duplicate verify heading) are **resolved**. Residual work is test depth only (JSON gerund labels, JSON failure payload fields, archiving retry passthrough, S6 negative guard) — not behaviour gaps.

---

## Partial file: `_partial-globals.md`

# Spec-compliance audit (partial): globals (architecture + logging)

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`; conformance: `conventions`, `testing`, `eslint`, `docs`  
**Read-only**

---

## Implementation Status

| Requirement                    | Verdict     | Evidence                                                                                                                    |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Architecture package-agnostic  | **PASS**    | Preview delta: no `evaluateLifecycle`, no `packages/core`, no `LifecycleEngine`                                             |
| Logger exception in domain     | **PASS**    | `observability/logger.ts`; domain imports observability only                                                                |
| Process-level composition root | **PASS**    | `createKernel` assigns `Logger.setImplementation`                                                                           |
| `log` ≡ `info`                 | **PASS**    | `logger.ts`; `test/observability/logger.spec.ts`                                                                            |
| `DEPS_INCONSISTENT`            | **PASS**    | Live `changes status`: blockers are `ARTIFACT_DRIFT` only; architecture `dependsOn: (none)`                                 |
| One-way logging→architecture   | **PASS**    | logging delta depends on architecture; architecture Spec Dependencies edge removed                                          |
| Observability naming           | **PASS**    | Architecture delta: “observability facade, not a fourth hexagon layer”                                                      |
| JSDoc on Logger                | **PASS**    | `eslint-disable` removed from `observability/logger.ts`; `NullLogger` methods documented                                    |
| Pino adapter JSDoc             | **Partial** | `pino-logger.ts` uses `@inheritdoc` on methods; module helpers documented; `eslint-disable` reduced to `require-param` only |

---

## Discrepancies

### HIGH / MEDIUM

_None._

### LOW

#### D1 — Runtime error strings still say “engine-derived” (cross-spec with `core:change`)

`ArtifactFile` constructor error (`artifact-file.ts:54`) vs change spec “verdict-derived”. User-facing inconsistency only.

#### D2 — `change-repository.ts` JSDoc “engine-derived” (comment only)

Maps parent-review off persistable union — behaviour correct; wording stale.

---

## Test Coverage

| Requirement                 | Tests                                 |
| --------------------------- | ------------------------------------- |
| L2 log≡info                 | `test/observability/logger.spec.ts`   |
| L6 no console before assign | New test: no `console.*` when unwired |
| Domain Logger path          | compile + public-api import scan      |

---

## Closed vs prior `20260829-125651`

| Finding                        | Verdict                                         |
| ------------------------------ | ----------------------------------------------- |
| D1 DEPS_INCONSISTENT           | **CLOSED**                                      |
| D2 bidirectional cycle         | **CLOSED**                                      |
| D3 each-package wiring MEDIUM  | **CLOSED**                                      |
| D4 JSDoc eslint disable        | **CLOSED** (observability logger); pino partial |
| D5 observability layer unnamed | **CLOSED** in architecture delta prose          |

---

## Summary counts

|                         | Count                        |
| ----------------------- | ---------------------------- |
| HIGH                    | **0**                        |
| MEDIUM                  | **0**                        |
| LOW                     | **2** (error string wording) |
| Architecture constraint | **PASS (0 blocking)**        |
