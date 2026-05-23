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
