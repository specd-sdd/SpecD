# Specs Compliance Report — `workflow-transition-checks`

**Timestamp:** 20260829-222916  
**Mode:** change (`workflow-transition-checks`)  
**Prior report:** `20260829-175039`  
**Graph:** unavailable — `graph stats` failed (`SCHEMA_INCOMPATIBLE` 5 vs 9); `graph index --force` worker exit. Audit used `changes spec-preview`, source inspection, and test suites (`@specd/core` 2539 tests, `@specd/cli` 899 tests — all pass).  
**Read-only audit**

---

## Executive Summary

| Verdict                 | Detail                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| **Overall**             | **Compliant** — implementation matches merged spec-preview for all 22 change specs |
| **HIGH**                | **0**                                                                              |
| **MEDIUM**              | **0**                                                                              |
| **LOW**                 | **0**                                                                              |
| **Functional blockers** | **None**                                                                           |

### Scope

22 specs audited via `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId>`:

`core:lifecycle-engine`, `core:get-status`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `cli:change-status`, `cli:change-transition`, `core:transition-checks`, `core:change`, `skills:skill-templates-source`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `cli:change-approve`, `core:config`, `cli:change-archive`, `core:validate-artifacts`, `core:get-artifact-instruction`, `core:schema-format`, `core:storage`, `default:_global/logging`, `default:_global/architecture`

Project-wide specs from `project context` (`default:*`) included via `default:_global/architecture` and `default:_global/logging` in the change set.

### vs prior audit (`175039`)

| Area                   | Before          | After                                                                 |
| ---------------------- | --------------- | --------------------------------------------------------------------- |
| All batches            | 0 discrepancies | **Confirmed** — no regressions                                        |
| Change lifecycle state | verifying       | **Still verifying** — `nextAction` targets `done` via `/specd-verify` |

### Aggregated counts

| Batch          |  Specs | Req checked |  HIGH | MEDIUM |   LOW |
| -------------- | -----: | ----------: | ----: | -----: | ----: |
| lifecycle-core |      6 |          45 |     0 |      0 |     0 |
| use-cases      |      8 |          58 |     0 |      0 |     0 |
| CLI            |      4 |          38 |     0 |      0 |     0 |
| globals+skills |      4 |          44 |     0 |      0 |     0 |
| **Total**      | **22** |     **185** | **0** |  **0** | **0** |

### Audit limitations

- Code graph could not be reindexed; blast-radius navigation used file structure and test references instead of `specd graph impact`.
- This does not affect the compliance verdict — binding table, use-case wiring, CLI presenters, and verify scenarios were verified directly.

### Blocking issues

None. Change is in `verifying` with all artifacts complete (152/152 tasks). Workflow `nextAction` recommends `/specd-verify` to leave verifying.

---

## Detailed Findings (verbatim partial reports)

---

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

---

# Partial Audit: use-cases

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Graph:** unavailable (see lifecycle-core partial)  
**Read-only**

---

## Specs Audited

- `core:get-status`
- `core:transition-change`
- `core:archive-change`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `core:validate-artifacts`
- `core:get-artifact-instruction`

---

## Per-Spec Findings

### `core:get-status`

| Req                                                 | Status          | Evidence                                                     |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| `executeChecksByLegalTargets` for all legal targets | **Implemented** | `get-status.ts:457`                                          |
| `checksByTarget` on result                          | **Implemented** | `get-status.ts:249`; CLI forwards (`change/status.ts:40-41`) |
| Archive predicates only in `archivable`             | **Implemented** | `get-status.ts:466-467`                                      |
| Blockers include `label` / `checkId`                | **Implemented** | `get-status.spec.ts`; `status.spec.ts:1061`                  |
| No progress bus on status                           | **Implemented** | snapshot-only                                                |

**Tests:** `get-status.spec.ts`, `status.spec.ts` — adequate.

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:transition-change`

| Req                                           | Status          | Evidence                                                  |
| --------------------------------------------- | --------------- | --------------------------------------------------------- |
| Predicate pass before effects                 | **Implemented** | `transition-change.ts` + `execute-matching-predicates.ts` |
| Effect slots by binding `phase` / `onFailure` | **Implemented** | no `switch` on `hook.pre` id in use case                  |
| Generic check progress bus                    | **Implemented** | `transition-change.spec.ts:1760-2016`                     |
| No rewrite to pending approval states         | **Implemented** | `transition.spec.ts:162-205`                              |
| Fail-fast `protocol.edge` on execute          | **Implemented** | tests pass                                                |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:archive-change`

| Req                                    | Status          | Evidence                                    |
| -------------------------------------- | --------------- | ------------------------------------------- |
| Operation `archive` bindings           | **Implemented** | `archive-change.ts` uses `_archiveBindings` |
| `hook.post` after-persist collect      | **Implemented** | `ARCHIVE_BINDING_SPECS` line 93             |
| No `archive.publication` check         | **Implemented** | binding table + tests                       |
| Publication preflight after predicates | **Implemented** | merge/publish remains in use case body      |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:hook-execution-model`

| Req                                             | Status          | Evidence                                               |
| ----------------------------------------------- | --------------- | ------------------------------------------------------ |
| `RunStepHooks` only inside hook check `execute` | **Implemented** | `hook-pre.ts`, `hook-post.ts`, `hook-effect-shared.ts` |
| Binding-table effect selection                  | **Implemented** | lifecycle use cases iterate bindings                   |
| Progress on generic bus                         | **Implemented** | hook output → `check-progress`                         |

Cross-spec consistency with `core:transition-checks`: **PASS** — no contradictions.

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:approve-spec` / `core:approve-signoff`

| Req                                                        | Status          | Evidence                                                     |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Record consent in-place (no `TransitionChange` to pending) | **Implemented** | `approve-spec.ts:86` uses `boundFromStates('approval.spec')` |
| Signoff from `done` only                                   | **Implemented** | `boundFromStates('approval.signoff')` → `['done']`           |
| Separate commands                                          | **Implemented** | CLI `change approve` delegates                               |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:validate-artifacts`

| Req                                                       | Status          | Evidence                                              |
| --------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| Uses `evaluateLifecycleVerdict` with `checksByTarget: {}` | **Implemented** | `validate-artifacts.ts:220-222`                       |
| No snapshot bag / no per-check execute in validate        | **Implemented** | DAG-only lifecycle projection for validation ordering |
| Ready-step deps/workspace via transition-check model      | **Implemented** | aligned with change delta                             |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `core:get-artifact-instruction`

| Req                                                  | Status          | Evidence                                                               |
| ---------------------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| No `LifecycleEngine` class dependency                | **Implemented** | `get-artifact-instruction.spec.ts`; markdown-parser-real-merge fixture |
| `checksByTarget: {}` lifecycle projection            | **Implemented** | `get-artifact-instruction.ts:98`                                       |
| Ready gating uses lifecycle verdict not snapshot bag | **Implemented** | tests pass                                                             |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     8 |          58 |    0 |      0 |   0 |

---

# Partial Audit: CLI

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Read-only**

---

## Specs Audited

- `cli:change-status`
- `cli:change-transition`
- `cli:change-approve`
- `cli:change-archive`

**Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks cli:<specId>`

---

## Cross-cutting CLI infrastructure

`_check-progress-presenter.ts` matches preview:

- Gerund `label` with `(id)` header
- `✓` / `✗` outcome lines
- No `Executing:` prefix (`transition.spec.ts:468`, `archive.spec.ts:507`)
- Structured `stream: "change-transition"|"change-archive"`

**Status:** **PASS** — no discrepancies.

---

## Per-Spec Findings

### `cli:change-status`

| Req                                             | Status          | Evidence              |
| ----------------------------------------------- | --------------- | --------------------- |
| Delegates lifecycle to GetStatus                | **Implemented** | `status.ts`           |
| Text blockers include check `label` / `checkId` | **Implemented** | `status.spec.ts:1061` |
| `checksByTarget` in JSON/TOON                   | **Implemented** | `status.ts:40-41`     |
| `/specd-verify` when tasks complete             | **Implemented** | `status.spec.ts:1034` |
| Drafted read-only                               | **Implemented** | existing tests        |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-transition`

| Req                               | Status          | Evidence                                                   |
| --------------------------------- | --------------- | ---------------------------------------------------------- |
| Generic check bus rendering       | **Implemented** | `transition.ts` + presenter                                |
| No pending-spec-approval rewrite  | **Implemented** | `transition.spec.ts:162-184`                               |
| No pending-signoff rewrite        | **Implemented** | `transition.spec.ts:187-205`                               |
| JSON streams check events         | **Implemented** | `transition.spec.ts:418-559`                               |
| Chained status guidance respected | **Implemented** | CT-04 scenario covered in `transition.spec.ts` error paths |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-approve`

| Req                                            | Status          | Evidence                                          |
| ---------------------------------------------- | --------------- | ------------------------------------------------- |
| `approve spec` / `approve signoff` subcommands | **Implemented** | `change/approve.ts`                               |
| No transition into pending states              | **Implemented** | delegates to ApproveSpec/ApproveSignoff use cases |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `cli:change-archive`

| Req                                              | Status          | Evidence                  |
| ------------------------------------------------ | --------------- | ------------------------- |
| Archive check bus                                | **Implemented** | `archive.ts` + presenter  |
| JSON check-progress then complete                | **Implemented** | `archive.spec.ts:114-146` |
| `--allow-overlap` / `--allow-out-of-scope` flags | **Implemented** | skippable check semantics |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Verify delta scenarios (CLI)

All 30 CLI verify scenarios from merged preview have corresponding automated tests in `packages/cli/test/commands/change/*.spec.ts` (899 CLI tests pass).

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     4 |          38 |    0 |      0 |   0 |

---

# Partial Audit: globals + skills + config

**Mode:** change `workflow-transition-checks`  
**Report:** `20260829-222916`  
**Read-only**

---

## Specs Audited

- `core:config`
- `skills:skill-templates-source`
- `default:_global/logging`
- `default:_global/architecture`

---

## Per-Spec Findings

### `core:config`

| Req                                                 | Status          | Evidence                                                      |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `approvals.spec` / `approvals.signoff` config gates | **Implemented** | `config` module; `approvalGates` on status output             |
| In-place approval model documented in delta         | **Implemented** | spec-preview delta; templates enforce                         |
| Default gates off                                   | **Implemented** | `change.spec.ts:511`, `get-status.spec.ts` `defaultApprovals` |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `skills:skill-templates-source`

| Req                                                 | Status          | Evidence                                         |
| --------------------------------------------------- | --------------- | ------------------------------------------------ |
| Templates teach in-place approval (not pending hop) | **Implemented** | `template-workflow.spec.ts:83-100`               |
| `/specd-verify` when implementing complete          | **Implemented** | workflow templates align with lifecycle guidance |
| No `pending-spec-approval` in shared skill text     | **Implemented** | template tests assert absence                    |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `default:_global/logging`

| Req                                              | Status          | Evidence                                                     |
| ------------------------------------------------ | --------------- | ------------------------------------------------------------ |
| Domain purity — no domain imports of logger      | **Implemented** | checks/domain modules use no `application/logger`            |
| Application/debug logging at use-case boundaries | **Implemented** | `ValidateArtifacts` debug log at `validate-artifacts.ts:252` |
| Delta cross-ref transition-check progress bus    | **Implemented** | no contradiction                                             |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

### `default:_global/architecture`

| Req                                  | Status          | Evidence                                                                   |
| ------------------------------------ | --------------- | -------------------------------------------------------------------------- |
| Hexagonal layering for check modules | **Implemented** | domain pure rules in `domain/checks/`; I/O in `application/checks/create*` |
| Manual DI via composition            | **Implemented** | `composition/use-cases/workflow-check-registry.ts`                         |
| No infrastructure in domain checks   | **Implemented** | domain checks export stubs / pure `run`                                    |
| Delta adds no violations             | **Implemented** | architecture delta is additive cross-ref                                   |

| HIGH | MEDIUM | LOW |
| ---: | -----: | --: |
|    0 |      0 |   0 |

---

## Cross-spec consistency

| Pair                                        | Status   |
| ------------------------------------------- | -------- |
| Config ↔ transition-checks (in-place gates) | **PASS** |
| Skills ↔ transition-checks                  | **PASS** |
| Architecture ↔ check module layout          | **PASS** |
| Logging ↔ domain purity                     | **PASS** |

---

## Batch Summary

| Specs | Req checked | HIGH | MEDIUM | LOW |
| ----: | ----------: | ---: | -----: | --: |
|     4 |          44 |    0 |      0 |   0 |
