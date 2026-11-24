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
