# Partial Audit: core:create-change

**Spec:** `core:create-change` (merged preview)  
**Implementation:** `packages/core/src/application/use-cases/create-change.ts`, composition wiring, tests

## Requirements Summary

| Requirement                                           | Status                    | Evidence                                                    |
| ----------------------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| Input contract (optional schema, includeOverlapCheck) | ✅ Implemented            | `CreateChangeInput` lines 26-40                             |
| Partial schema override rejected                      | ✅ Implemented            | `InvalidCreateChangeInputError` in `_resolveSchemaIdentity` |
| Active schema resolution                              | ✅ Implemented            | delegates to `_getActiveSchema.execute()`                   |
| Schema errors propagate                               | ✅ Implemented (no catch) | `_resolveSchemaIdentity` — no try/catch around execute      |
| Optional overlap check                                | ✅ Implemented            | post-scaffold `DetectOverlap.execute`, swallow on throw     |
| Name uniqueness                                       | ✅ Unchanged              | existing logic                                              |
| Actor resolution                                      | ✅ Unchanged              |                                                             |
| Created event schema fields                           | ✅ Implemented            | uses resolved locals                                        |
| Persistence/scaffolding/result                        | ✅ Implemented            | `overlapReport?` on result                                  |
| Dependencies (5 deps)                                 | ✅ Implemented            | constructor + kernel + `createCreateChange`                 |
| Constraints                                           | ✅ Satisfied              | no transitions, no artifact reads                           |

## Discrepancies

### D1 — Missing unit test: schema resolution error propagation

- **Spec scenario:** `Schema resolution errors propagate` (verify.md)
- **Code:** correct — errors bubble from `GetActiveSchema.execute()`
- **Tests:** no scenario mocking `GetActiveSchema` throw
- **Verdict:** implementation OK, **test gap** (low)

### D2 — `docs/core/errors.md` missing `InvalidCreateChangeInputError`

- **Spec:** throws validation error for partial override
- **Code:** `InvalidCreateChangeInputError` with code `INVALID_CREATE_CHANGE_INPUT`
- **Docs:** not listed in `docs/core/errors.md`
- **Verdict:** **doc gap** (low) — outside tasks.md scope but affects public error contract docs

### D3 — `docs/core/examples/implementing-a-port.md` stale constructor

- **Line 529:** `new CreateChange(changeRepo, new Map(), actor)` — 3-arg form
- **Merged spec:** 5-arg constructor with `ListWorkspaces`, `GetActiveSchema`, `DetectOverlap`
- **Verdict:** **doc drift** (medium for examples accuracy)

### D4 — `docs/core/examples/implementing-a-port.md` stale `createCreateChange` context form

- **Lines 508-515:** `FsCreateChangeOptions` missing `listWorkspaces`, `getActiveSchema`, `detectOverlap`
- **Code:** `FsCreateChangeOptions` requires all five fields
- **Verdict:** **doc drift** (medium)

## Test Coverage

| Scenario group                             | Covered |
| ------------------------------------------ | ------- |
| Input contract / partial override          | ✅      |
| Active schema resolution                   | ✅      |
| Overlap orchestration                      | ✅      |
| Uniqueness / actor / seeding / scaffolding | ✅      |
| Schema error propagation                   | ❌      |

**Test file:** `packages/core/test/application/use-cases/create-change.spec.ts` — 20 tests, all passing.

## Global / dependency conformance

- **default:\_global/architecture:** use case in application layer; deps via constructor ports — ✅
- **core:get-active-schema:** delegates, no duplicated resolution — ✅
- **core:spec-overlap:** uses `DetectOverlap` + `OverlapReport` — ✅
- **core:change:** created event + entity construction unchanged semantics — ✅

## Summary

- Requirements implemented: **12/12**
- Discrepancies: **4** (0 implementation bugs, 1 test gap, 3 doc gaps)
- Blocking: **no**
