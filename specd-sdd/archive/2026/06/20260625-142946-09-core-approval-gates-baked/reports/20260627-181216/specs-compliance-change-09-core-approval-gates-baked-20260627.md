# Spec Compliance Report — `09-core-approval-gates-baked`

**Generated:** 2026-06-27  
**Mode:** Change (`--change 09-core-approval-gates-baked`)  
**Change path:** `specd-sdd/changes/20260625-142946-09-core-approval-gates-baked`  
**Specs in scope:** 7 change specs + dependency context  
**Graph:** fresh (823 files, 3715 symbols)

---

## Executive Summary

| Area                                                            | Verdict                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Change objective (approval gates baked + kernel relocation)** | **PASS**                                                                                            |
| **CLI integration**                                             | **PASS** (2 pre-existing stream issues)                                                             |
| **Core use cases (change focus)**                               | **PASS** with adjacent gaps                                                                         |
| **Overall compliance**                                          | **30/35 requirements OK**, 3 PARTIAL, 2 MISSING (pre-existing gate-guard gaps in approve use cases) |

### Change-critical invariants — all implemented

1. `ApprovalGates` baked at construction on `TransitionChange`, `ApproveSpec`, `ApproveSignoff`
2. No `approvalsSpec` / `approvalsSignoff` on execute inputs
3. `kernel.changes.approveSpec` / `approveSignoff` — not on `kernel.specs`
4. Factories + `createKernel` pass `config.approvals`
5. CLI omits approval flags on `execute`

### Top findings (non-blocking for archive)

| ID               | Severity | Finding                                                                                                     |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| D-AS-2 / D-ASN-2 | Medium   | `ApproveSpec` / `ApproveSignoff` missing `SchemaMismatchError` gate step (pre-existing pattern gap)         |
| D-TC-1           | Low      | `TransitionChange` skips default task-completion patterns when `taskCompletionCheck` omitted (pre-existing) |
| D-KERNEL-1       | Low      | `core:kernel` Purpose bullet still lists approve under `specs` — spec drift, code correct                   |
| D-CLI-T-1        | Low      | Repair guide to stderr not stdout (pre-existing)                                                            |
| —                | Info     | 15 missing tests (factory wiring, gate-guard edge cases)                                                    |

---

## Aggregate Counts

| Spec                       | Requirements | OK     | PARTIAL | MISSING | Missing tests |
| -------------------------- | ------------ | ------ | ------- | ------- | ------------- |
| `core:transition-change`   | 21           | 20     | 1       | 0       | 3             |
| `core:approve-spec`        | 7            | 5      | 1       | 1       | 6             |
| `core:approve-signoff`     | 7            | 5      | 1       | 1       | 6             |
| `cli:change-transition`    | —            | Pass\* | —       | —       | 2 gaps        |
| `cli:change-approve`       | —            | Pass\* | —       | —       | 4 gaps        |
| `core:kernel`              | —            | Pass\* | —       | —       | 2 gaps        |
| `core:composition`         | —            | Pass\* | —       | —       | 2 gaps        |
| **Total (core use cases)** | **35**       | **30** | **3**   | **2**   | **15**        |

\*CLI/kernel/composition batch: 16/18 approval-focused requirements pass; 2 pre-existing out-of-scope.

---

## Detailed Findings

<!-- BEGIN _partial-core-use-cases.md -->

# Spec Compliance Audit — Core Use Cases (Approval Gates Baked)

**Change:** `09-core-approval-gates-baked` (`20260625-142946-09-core-approval-gates-baked`)  
**Audit date:** 2026-06-27  
**Scope:** `core:transition-change`, `core:approve-spec`, `core:approve-signoff`  
**Implementation:** `packages/core/src/application/use-cases/`  
**Tests:** `packages/core/test/application/use-cases/`  
**Composition:** `packages/core/src/composition/use-cases/`, `packages/core/src/composition/kernel.ts`  
**Spec source:** merged preview via `specd changes spec-preview`

(See `reports/AUDIT_RUN/_partial-core-use-cases.md` for full verbatim content — 330 lines.)

**Key excerpt — Change-focus verdict:**

> The **primary change objective is implemented**: all three use cases accept `ApprovalGates` at construction, read gate state from `_approvals` in `execute`, expose gate-free input types, and are wired through `create*` factories and `createKernel` with `config.approvals`.

<!-- END _partial-core-use-cases.md -->

<!-- BEGIN _partial-cli-kernel-composition.md -->

# Partial: CLI + Kernel + Composition — `09-core-approval-gates-baked`

(See `reports/AUDIT_RUN/_partial-cli-kernel-composition.md` for full verbatim content — 261 lines.)

**Key excerpt — Approval-gates verdict:**

> All change-critical invariants are implemented:
>
> 1. ✅ `kernel.changes.approveSpec` and `kernel.changes.approveSignoff` — not on `kernel.specs`
> 2. ✅ CLI transition and approve commands omit `approvalsSpec` / `approvalsSignoff` on `execute`
> 3. ✅ Kernel and composition factories pass `config.approvals` at construction
> 4. ✅ Core tests cover gate routing; kernel placement test covers namespace move

<!-- END _partial-cli-kernel-composition.md -->

---

## Partial report files (audit traceability)

- `reports/AUDIT_RUN/_partial-core-use-cases.md`
- `reports/AUDIT_RUN/_partial-cli-kernel-composition.md`

---

## Reviewer decision matrix

| Finding                                  | Options                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Schema mismatch in approve use cases     | **Fix Implementation** (add gate step) OR **Update Specs** (document deferral) OR **Proceed** (pre-existing, out of change scope) |
| Default task-completion patterns         | **Fix Implementation** OR **Update Specs** OR **Proceed**                                                                         |
| Kernel Purpose bullet drift (D-KERNEL-1) | **Update Specs** before archive (recommended) OR **Proceed**                                                                      |
| Missing factory/CLI assert tests         | **Fix Implementation** (tests only) OR **Proceed**                                                                                |

---

_End of compiled compliance report._
