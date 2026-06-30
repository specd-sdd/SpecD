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
