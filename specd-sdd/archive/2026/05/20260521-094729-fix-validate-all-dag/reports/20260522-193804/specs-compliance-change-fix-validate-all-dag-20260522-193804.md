# Spec Compliance Report — change `fix-validate-all-dag`

**Generated:** 2026-05-22T19:38:04  
**Mode:** `--change fix-validate-all-dag`  
**Report directory:** `specd-sdd/changes/20260521-094729-fix-validate-all-dag/reports/20260522-193804`  
**Graph:** re-indexed before audit (`stale: true` → index at `67fdd3b0`)

---

## Aggregate summary

| Package            | Specs audited | Req. checked | Implemented | Partial | Missing | Discrepancies |
| ------------------ | ------------- | ------------ | ----------- | ------- | ------- | ------------- |
| core (6)           | 6             | 37           | 34          | 3       | 0       | 3             |
| cli (2)            | 2             | ~28          | ~22         | ~6      | 0       | ~8            |
| **Total (scoped)** | **8**         | **~65**      | **~56**     | **~9**  | **0**   | **~11**       |

**Overall verdict:** **PARTIAL compliance** — DAG goals are implemented and tested; remaining gaps are narrow (canonical DAG call sites, optional `specPath`, CLI display/JSON field alignment, missing DAG-order tests).

---

## Priority findings (actionable)

| ID     | Severity | Area     | Issue                                                                                                                                              |
| ------ | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF-1   | Medium   | core     | `EditChange.updateSpecIds` uses `artifactDagFromChangeArtifacts` (persisted `requires`) instead of `schema.artifactDag()`                          |
| VA-1   | Medium   | core/cli | Merged spec: `specPath` optional for change-scoped validate; `ValidateArtifactsInput` still requires `specPath`; CLI uses `specIds[0]` placeholder |
| CLI-V1 | High     | cli      | Batch change-scoped steps pass `specPath` though merged spec says no `specPath`                                                                    |
| CLI-V2 | Medium   | cli      | Batch JSON uses `notes`; merged spec documents `warnings` in `results[]`                                                                           |
| CLI-S1 | Medium   | cli      | Text DAG tree uses `effectiveStatus`, not drift-aware `displayStatus`                                                                              |
| CLI-S2 | Medium   | cli      | `schema.artifactDag[].hasTasks` ignores `taskCompletionCheck`-only artifacts                                                                       |
| VA-2   | Low      | core     | No unit test proving multi-artifact validate follows `topologicalOrder()`                                                                          |
| SF-2   | Low      | cli      | Status builds `ArtifactDag.from(...)` instead of `schema.artifactDag()`                                                                            |

---

## Detailed findings

The following sections reproduce the partial audit files verbatim.

---

<!-- BEGIN _partial-core.md -->

# Spec Compliance Audit — `fix-validate-all-dag` (core partial)

**Change:** `20260521-094729-fix-validate-all-dag`  
**Report:** `reports/20260522-193804/_partial-core.md`  
**Method:** Merged spec preview (`changes spec-preview fix-validate-all-dag <specId>`), graph search/impact, implementation + test review in `packages/core/`  
**Scope:** Six core specs tied to artifact DAG canonicalization and batch validation ordering.

---

## Executive summary

| Spec                                          | Checked | Implemented | Partial | Missing | Discrepancies |
| --------------------------------------------- | ------- | ----------- | ------- | ------- | ------------- |
| `core:schema-format` (DAG reqs)               | 8       | 7           | 1       | 0       | 1             |
| `core:validate-artifacts` (DAG + deps)        | 6       | 4           | 2       | 0       | 2             |
| `core:change` (invalidation/DAG)              | 5       | 5           | 0       | 0       | 0             |
| `core:invalidate-change`                      | 11      | 11          | 0       | 0       | 0             |
| `core:lifecycle-engine` (DAG/next)            | 3       | 3           | 0       | 0       | 0             |
| `core:get-artifact-instruction` (auto-select) | 4       | 4           | 0       | 0       | 0             |
| **Totals (scoped)**                           | **37**  | **34**      | **3**   | **0**   | **3**         |

DAG-centric requirements for this change are **largely implemented and tested**. Remaining gaps are narrow: canonical-DAG sourcing in a few non-core call sites, optional `specPath` not reflected in the use-case input type, and missing explicit tests for validate traversal order.

_(Full core partial: see `_partial-core.md` in this directory — 391 lines.)_

<!-- END _partial-core.md -->

---

<!-- BEGIN _partial-cli.md -->

# Spec compliance audit (partial): CLI

**Change:** `fix-validate-all-dag` (`20260521-094729-fix-validate-all-dag`)  
**Audited specs:** `cli:change-validate`, `cli:change-status`  
**Sources:** merged `spec-preview`, `packages/cli/src/commands/change/{validate,status}.ts`, tests, graph search  
**Mode:** read-only

**Verdicts:** `cli:change-validate` **PARTIAL**; `cli:change-status` **PARTIAL**.

_(Full CLI partial: see `_partial-cli.md` in this directory — 152 lines.)_

<!-- END _partial-cli.md -->

---

## Partial report files (source of truth)

- `_partial-core.md`
- `_partial-cli.md`

---

_Compiled by specd-compliance workflow for verification mode **Full**._
