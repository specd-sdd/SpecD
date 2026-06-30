# Specs Compliance Report — Change `04-core-host-orchestration-create`

| Field                    | Value                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Mode**                 | change                                                                                                                                |
| **Change**               | `04-core-host-orchestration-create`                                                                                                   |
| **State at audit**       | `verifying`                                                                                                                           |
| **Timestamp**            | `20260626-091825`                                                                                                                     |
| **Graph**                | fresh (`3ec7bb33`)                                                                                                                    |
| **Specs in scope**       | `core:create-change`, `core:get-active-schema`, `cli:change-create`                                                                   |
| **Dependencies checked** | `core:change`, `core:get-active-schema`, `core:spec-overlap`, `default:_global/architecture`, `cli:entrypoint`, `core:spec-id-format` |

## Executive Summary

| Metric               | Count              |
| -------------------- | ------------------ |
| Specs audited        | 3                  |
| Requirements checked | 21                 |
| Implementation bugs  | **0**              |
| Test gaps            | **3** (low)        |
| Documentation gaps   | **3** (low–medium) |
| Blocking issues      | **0**              |

**Verdict:** Implementation conforms to merged change specs. No code fixes required for spec compliance. Residual findings are documentation drift in examples/errors docs and optional test hardening.

## Aggregated Findings

| ID  | Severity | Type      | Location                                            | Summary                                                            |
| --- | -------- | --------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| F1  | Low      | test gap  | `core:create-change`                                | No unit test for `GetActiveSchema` error propagation               |
| F2  | Low      | doc gap   | `docs/core/errors.md`                               | `InvalidCreateChangeInputError` not documented                     |
| F3  | Medium   | doc drift | `docs/core/examples/implementing-a-port.md:529`     | Stale 3-arg `CreateChange` constructor example                     |
| F4  | Medium   | doc drift | `docs/core/examples/implementing-a-port.md:508-515` | Stale `createCreateChange` context options (missing required deps) |
| F5  | Low      | test gap  | `cli:change-create`                                 | Manifest schema identity scenario mock-only                        |
| F6  | Low      | test gap  | `cli:change-create`                                 | Overlap warning scenario mock-only (core covers detection)         |

## Tests Executed During Audit

```
packages/core  create-change.spec.ts + get-active-schema.spec.ts  → 28/28 PASS
packages/cli   change-create.spec.ts                              → 12/12 PASS
```

Post-hooks (verifying): tests, lint, typecheck — all OK.

## Implementation Tracking

```
core:create-change → create-change.ts, invalid-create-change-input-error.ts,
                      create-change.ts (composition), kernel.ts
cli:change-create  → change/create.ts
```

Stale symbol diagnostic on `InvalidCreateChangeInputError` in implementation review — symbol exists; graph index lag on new file (non-blocking).

---

## Detailed Findings

### `_partial-core-create-change.md`

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

---

### `_partial-core-get-active-schema.md`

# Partial Audit: core:get-active-schema

**Spec:** `core:get-active-schema` (no-op delta — unchanged API)  
**Role in change:** internal resolver called by `CreateChange` in project mode

## Requirements Summary

No requirement changes in this change. Audit focus: `CreateChange` usage conforms to existing `GetActiveSchema` contract.

| Check                                          | Status | Evidence                                 |
| ---------------------------------------------- | ------ | ---------------------------------------- |
| Project mode: `execute()` no args              | ✅     | `create-change.ts:184`                   |
| Returns non-raw `Schema`                       | ✅     | rejects `result.raw` with internal Error |
| No resolution logic duplicated in CreateChange | ✅     | single delegate call                     |
| Existing GetActiveSchema tests still pass      | ✅     | 8/8 vitest                               |

## Discrepancies

None. Change correctly consumes existing API without modifying spec.

## Test Coverage

Existing `get-active-schema.spec.ts` covers GetActiveSchema directly. Indirect coverage via `create-change.spec.ts` schema resolution tests.

## Summary

- Requirements affected: **0 changed**
- Discrepancies: **0**
- Blocking: **no**

---

### `_partial-cli-change-create.md`

# Partial Audit: cli:change-create

**Spec:** `cli:change-create` (merged preview)  
**Implementation:** `packages/cli/src/commands/change/create.ts`, tests

## Requirements Summary

| Requirement                              | Status         | Evidence                                                  |
| ---------------------------------------- | -------------- | --------------------------------------------------------- |
| Command signature                        | ✅ Unchanged   | commander registration                                    |
| Workspace resolution                     | ✅ Unchanged   | `parseSpecId`                                             |
| ReadOnly rejection                       | ✅ Unchanged   | pre-use-case check                                        |
| Schema resolved inside CreateChange      | ✅ Implemented | no `kernel.specs.getActiveSchema` call                    |
| execute without schemaName/schemaVersion | ✅ Implemented | create.ts execute payload                                 |
| Overlap warning delegation               | ✅ Implemented | `includeOverlapCheck: true` + stderr from `overlapReport` |
| No direct detectOverlap in CLI           | ✅ Implemented | removed try/catch block                                   |
| Output / JSON / duplicate error          | ✅ Unchanged   | existing tests pass                                       |
| Constraints                              | ✅ Updated     | no CLI schema resolution                                  |

## Discrepancies

### D1 — Manifest schema scenario not e2e-tested

- **Spec scenarios:** `Schema resolved inside CreateChange`, `Manifest still records effective schema identity`
- **Tests:** mock-level only (`getActiveSchema` spy + mocked `create.execute`)
- **Code:** correct by delegation — manifest written by core persistence, not CLI
- **Verdict:** **test gap** (low) — acceptable for CLI unit scope; integration would need fs fixture

### D2 — Overlap warning e2e scenario

- **Spec:** overlap warning when another change targets same spec
- **Test:** mocked `overlapReport` on execute result — not real `DetectOverlap` integration
- **Verdict:** **test gap** (low) — CLI formatting verified, detection logic tested in core

## Test Coverage

**File:** `packages/cli/test/commands/change-create.spec.ts` — 12 tests  
New tests: schema delegation, includeOverlapCheck, overlap stderr, no detectOverlap direct call.

`packages/cli/test/commands/change.spec.ts` create block — 9 tests, all pass without modification.

## Global / dependency conformance

- **cli:entrypoint:** error formatting, exit codes — ✅
- **core:change:** delegates entity creation to use case — ✅
- **core:spec-id-format:** `parseSpecId` — ✅

## Summary

- Requirements implemented: **9/9**
- Discrepancies: **2** (test gaps only, no implementation bugs)
- Blocking: **no**

---

## Recommendations

1. **Proceed to archive path** — no implementation blockers.
2. **Optional follow-up (non-blocking):**
   - Update `docs/core/examples/implementing-a-port.md` constructor + factory examples (F3, F4)
   - Add `InvalidCreateChangeInputError` to `docs/core/errors.md` (F2)
   - Add propagation unit test in `create-change.spec.ts` (F1)
