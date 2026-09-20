# Partial Audit: lifecycle-core

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Graph:** unavailable — `graph stats` / `graph index --force` failed (`SCHEMA_INCOMPATIBLE` schema 5 vs 9; worker exit). Audit used spec-preview, source reads, and test suite.  
**CLI:** `node packages/cli/dist/index.js`  
**Read-only:** no code or spec files modified

---

## Specs Audited

- `core:lifecycle-engine`
- `core:transition-checks`
- `core:change`
- `core:workflow-model`
- `core:schema-format`
- `core:storage` (lifecycle intersection)
- Cross-check: `default:_global/architecture`, `default:_global/logging` (dependency chain)

---

## Prior Audit Delta (20260829-175039)

| Prior item                                  | Status (this audit)                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 HIGH / 0 MEDIUM / 0 LOW                   | **Confirmed**                                                                                    |
| Hop-matrix verify scenarios merged          | **Confirmed** — delta at `deltas/core/lifecycle-engine/verify.md.delta.yaml`                     |
| All lifecycle-core requirements implemented | **Confirmed** via `lifecycle-verdict.spec.ts`, `transition-checks.spec.ts`, `public-api.spec.ts` |

---

## Per-Spec Findings

### `core:lifecycle-engine`

#### Requirements Summary

| ID         | Requirement                                              | Essence                                                                                          |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| LE-1       | Stateless domain lifecycle verdict                       | Plain functions; no `LifecycleEngine` class; domain `nextHop` without `command`.                 |
| LE-2       | Centralized validation logic                             | Project caller-supplied `CheckResult`s only; no I/O or snapshot-bag fallback.                    |
| LE-3–LE-5  | Effective status, canonical state, blockers              | Review mapping, `INCOMPLETE_ARTIFACT`, skippable bypass semantics.                               |
| LE-6       | Available steps and domain next hop                      | Predicate evaluation; `blockingArtifacts` from check `details`; DAG fallback when checks absent. |
| LE-7–LE-8  | Archiving escape, review overlap                         | Recovery skips requires; overlap → review not blocker.                                           |
| LE-9–LE-12 | Shared interpretation, guidance, next artifact, no class | `evaluateLifecycle` attaches `nextAction.command`; barrel re-exports only.                       |

#### Implementation Status

| Req        | Status          | Evidence                                                                                                                                                                                                                                                    |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LE-1–LE-12 | **Implemented** | `lifecycle-verdict.ts`; `lifecycle-engine.ts` compatibility barrel; `lifecycle-verdict.spec.ts` (2539 core tests pass). No `LifecycleEngine` class (`public-api.spec.ts`). `checksByTarget` drives `availableTransitions` (`lifecycle-verdict.ts:159-172`). |

#### Discrepancies

_None._

#### Test Coverage

Adequate — hop matrix, blockers, nextAction, nextArtifact, parent-review, archiving recovery (`lifecycle-verdict.spec.ts`).

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:transition-checks`

#### Requirements Summary

Central spec: check ABI (`WorkflowCheck`, `create*`), binding table (`from`/`to`/`along`, operation `archive`), predicate vs effect phases, registry bindings, projections, progress bus, no snapshot bag, actionable diagnostics.

#### Implementation Status

| Req                     | Status          | Evidence                                                                                                                                   |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Check identity / labels | **Implemented** | `CHECK_LABELS` in `transition-checks.ts`; gerund labels; no `Executing:` (`transition-checks.spec.ts:203`).                                |
| WorkflowCheck ABI       | **Implemented** | `workflow-check.ts`; per-check `create*` factories in `application/checks/`.                                                               |
| One file per check      | **Implemented** | 14 domain + 14 application check modules under `checks/`.                                                                                  |
| Binding table           | **Implemented** | `check-bindings.ts` — matches spec registry (approval.signoff only `done→archivable`; no `archive.publication`).                           |
| Archive operation       | **Implemented** | `ARCHIVE_BINDING_SPECS`; `hook.post` `after-persist` / `collect`.                                                                          |
| Progress bus            | **Implemented** | `execute-matching-predicates.ts` emits start/done; hook maps to `check-progress` (`hook-effect-shared.ts`).                                |
| No snapshot bag         | **Implemented** | No `PredicateSnapshots` export (`transition-checks.spec.ts:384-388`).                                                                      |
| Projections             | **Implemented** | `/specd-verify` when tasks complete (`lifecycle-verdict.spec.ts:629-643`); approve spec not pending hop (`lifecycle-verdict.spec.ts:330`). |

#### Discrepancies

_None._

#### Test Coverage

Adequate — `transition-checks.spec.ts`, `execute-check-with-progress.spec.ts`, `workflow-check-factories.spec.ts`, `transition-change.spec.ts` (check bus).

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:change`

#### Implementation Status

Change entity exposes `checks`, `checksByTarget`, `approvalGates`; load-time sanitize for dependency cascade per storage delta. Transition-check integration via lifecycle consumers. **Implemented** — `change.ts`, `get-status.spec.ts`, `change.spec.ts`.

#### Discrepancies

_None._

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:workflow-model`

#### Implementation Status

`classifyAlong` / `AXIS_FALLBACK` splice logic in `transition-checks.ts:107-148`; workflow model uses shared axis. Delta requires no parallel if-ladders for transition legality. **Implemented**.

#### Discrepancies

_None._

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:schema-format`

#### Implementation Status

Delta documents check binding metadata on schema artifacts; no contradiction with transition-checks binding model. Schema merge / artifact DAG unchanged for this change scope. **Implemented** for intersection requirements.

#### Discrepancies

_None._

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:storage`

#### Implementation Status (lifecycle intersection)

Dependency cascade on load, drift ownership, sanitize `dependsOn` at persist — aligned with `deps.consistent` check and archive predicates. **Implemented** — storage tests pass in full suite.

#### Discrepancies

_None._

#### Summary

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     6 |          45 |    0 |      0 |   0 |
