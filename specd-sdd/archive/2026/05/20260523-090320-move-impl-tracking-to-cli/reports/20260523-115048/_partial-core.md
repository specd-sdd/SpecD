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
