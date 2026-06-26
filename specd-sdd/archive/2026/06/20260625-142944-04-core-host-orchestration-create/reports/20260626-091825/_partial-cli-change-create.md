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
