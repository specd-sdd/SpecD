# Specs compliance report: move-impl-tracking-to-cli

**Mode:** change (`--change move-impl-tracking-to-cli`)  
**Date:** 2026-05-23  
**Change state:** verifying  
**Report directory:** `specd-sdd/changes/20260523-090320-move-impl-tracking-to-cli/reports/20260523-115048/`

## Executive summary

| Metric                            | Count |
| --------------------------------- | ----: |
| Specs in scope                    |     8 |
| Compliant                         |     8 |
| Implementation bugs               |     0 |
| Spec drift (expected pre-archive) |     1 |
| Low-severity notes                |     2 |

**Verdict:** Implementation matches merged change specs. Safe to proceed to `done` / `archivable` after user confirmation. Archive will merge deltas into canonical `specs/` and materialize `spec-lock` for `core:refresh-implementation-tracking`.

## Scope

**Change specs:**

- `core:refresh-implementation-tracking` (new)
- `core:get-status`, `core:transition-change`, `core:compile-context`
- `core:implementation-detector-port`
- `cli:change-status`, `cli:change-transition`, `cli:change-context`

**Dependencies reviewed:** `core:change`, `core:implementation-detector-port`, `core:kernel` (composition), global architecture conventions (read-only audit).

## Findings

### No action required

All merged requirements and verify scenarios are satisfied by current code and tests (unit + CLI ordering). Post-implement and pre-verifying hooks passed (tests, lint, typecheck).

### Expected pre-archive drift (not blocking)

1. **Canonical `core:get-status` spec/metadata** still documents “Implementation autodetection on status load” until archive applies deltas. **Assessment:** spec drift resolved at archive; code is correct per change deltas.

### Low-severity notes

1. **Code graph stale** — `RefreshImplementationTracking` symbols may show stale in `implementation review` until `specd graph index`. Does not affect runtime behavior.
2. **Task 8.1** — `spec-lock.json` for the new spec deferred to archive (documented in `tasks.md`); implementation links are already recorded on the change.

## Detailed findings

### \_partial-core.md

# Partial audit: core specs

**Change:** move-impl-tracking-to-cli  
**Batch:** core (5 specs)

## core:refresh-implementation-tracking (new)

| Area           | Status                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Implementation | **Compliant** — `refresh-implementation-tracking.ts`, wired in `kernel.ts`                                    |
| Tests          | **Compliant** — `refresh-implementation-tracking.spec.ts` covers guard, merge, persist, not-found, projection |
| Spec boundary  | **Compliant** — no CLI/MCP references in spec text                                                            |

**Discrepancies:** None.

---

## core:get-status

| Requirement                                           | Implementation                      | Tests                            |
| ----------------------------------------------------- | ----------------------------------- | -------------------------------- |
| No `ImplementationDetector` in constructor            | Yes — 4-arg constructor             | `makeGetStatus` without detector |
| Read-only tracking (`get`, not `mutate`+detect)       | Yes — `execute` uses `_changes.get` | Project persisted tracking test  |
| `RefreshImplementationTracking` not called internally | Yes                                 | N/A                              |

**Discrepancies:** None vs merged delta.  
**Note (post-archive):** Canonical `specs/core/get-status/spec.md` and `.specd/metadata/.../get-status/metadata.json` still describe autodetection until this change archives — **expected spec drift**, not an implementation bug.

---

## core:transition-change

| Requirement                                             | Implementation                | Tests                          |
| ------------------------------------------------------- | ----------------------------- | ------------------------------ |
| No detector / no detect loop in pre-transition `mutate` | Yes                           | `makeUseCase` without detector |
| Caller-owned refresh                                    | Yes — CLI calls refresh first | CLI transition tests           |

**Discrepancies:** None.

---

## core:compile-context

| Requirement                                | Implementation          | Tests                       |
| ------------------------------------------ | ----------------------- | --------------------------- |
| No `ImplementationDetector` in constructor | Yes — 9-arg constructor | Constructor tests updated   |
| Pre-compile load via `get` only            | Yes                     | Existing compile tests pass |

**Discrepancies:** None.

---

## core:implementation-detector-port

| Requirement                                                                             | Implementation                                         | Tests                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| Port invoked by `RefreshImplementationTracking` only (not GetStatus/Transition/Compile) | Yes — grep confirms single use case path + Vcs adapter | `vcs-implementation-detector.spec.ts` |
| Depends on refresh use case (delta)                                                     | Documented in change delta                             | N/A until archive                     |

**Discrepancies:** None.

---

## Summary (core batch)

- Requirements checked: **28** (approx.)
- Compliant: **28**
- Discrepancies (implementation bugs): **0**
- Expected pre-archive canonical drift: **1** (get-status metadata/spec text)

### \_partial-cli.md

# Partial audit: CLI specs

**Change:** move-impl-tracking-to-cli  
**Batch:** cli (3 specs)

## cli:change-status

| Scenario                           | Evidence                |
| ---------------------------------- | ----------------------- |
| Refresh before `GetStatus`         | `status.ts` line ~98    |
| No direct `ImplementationDetector` | CLI uses kernel only    |
| Tests assert call order            | `change-status.spec.ts` |

**Status:** Compliant.

---

## cli:change-transition

| Scenario                        | Evidence                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Single refresh at handler entry | `transition.ts` before `status.execute`                                                       |
| Repair path: no second refresh  | `catch` calls `status.execute` only; test asserts `refreshImplementationTracking` called once |
| Tests                           | `change-transition.spec.ts`                                                                   |

**Status:** Compliant.

---

## cli:change-context

| Scenario                          | Evidence                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| Refresh before `compile.execute`  | `context.ts` line ~130                                      |
| Refresh even with `--fingerprint` | Refresh before compile (fingerprint path uses same handler) |
| Tests                             | `change-context.spec.ts` (normal + fingerprint cases)       |

**Status:** Compliant.

---

## Intentionally unchanged callers (design)

Verified **no** `refreshImplementationTracking` in:

- `change/validate.ts`
- `change/artifacts.ts`
- `drafts/show.ts`, `discarded/show.ts`
- `change/implementation.ts` (list — avoids double refresh)

**Status:** Matches design.md non-goals.

---

## Summary (CLI batch)

- Requirements checked: **12**
- Compliant: **12**
- Discrepancies: **0**

## Recommended next step

User chose **full** verification: scenario audit (simple) + this compliance audit are complete. Proceed with lifecycle transition to `done` → `archivable` if the user selects **Proceed**.
