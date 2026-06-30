# Specs Compliance Report — Change `04-core-host-orchestration-create`

| Field              | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| **Mode**           | change                                                              |
| **Change**         | `04-core-host-orchestration-create`                                 |
| **State at audit** | `verifying`                                                         |
| **Timestamp**      | `20260626-094031`                                                   |
| **Graph**          | fresh (`3ec7bb33`)                                                  |
| **Specs in scope** | `core:create-change`, `core:get-active-schema`, `cli:change-create` |

## Executive Summary

| Metric               | Count                   |
| -------------------- | ----------------------- |
| Specs audited        | 3                       |
| Requirements checked | 21                      |
| Implementation bugs  | **0**                   |
| Test gaps            | **2** (low, acceptable) |
| Documentation gaps   | **0**                   |
| Blocking issues      | **0**                   |

**Verdict:** Implementation conforms to merged change specs. Prior doc/test findings (F1–F4) resolved. No code or artifact fixes required.

## Aggregated Findings

| ID  | Severity | Type      | Status            | Summary                                                         |
| --- | -------- | --------- | ----------------- | --------------------------------------------------------------- |
| F1  | Low      | test gap  | **Resolved**      | `GetActiveSchema` error propagation test added                  |
| F2  | Low      | doc gap   | **Resolved**      | `InvalidCreateChangeInputError` documented in `errors.md`       |
| F3  | Medium   | doc drift | **Resolved**      | 5-arg `CreateChange` constructor example updated                |
| F4  | Medium   | doc drift | **Resolved**      | `createCreateChange` context options include orchestration deps |
| F5  | Low      | test gap  | Open (acceptable) | CLI manifest schema identity scenario mock-only                 |
| F6  | Low      | test gap  | Open (acceptable) | CLI overlap warning scenario mock-only; core covers detection   |

## Tests Executed

```
packages/core  create-change.spec.ts (21) + get-active-schema.spec.ts (8)  → 29/29 PASS
packages/cli   change-create.spec.ts (12)                                  → 12/12 PASS
```

Post-hooks (implementing + verifying): tests, lint, typecheck — all OK.

## Scenario Verification Summary

| Spec                     | Scenarios | Result                                                                 |
| ------------------------ | --------- | ---------------------------------------------------------------------- |
| `core:create-change`     | 22        | **PASS**                                                               |
| `core:get-active-schema` | 8         | **PASS** (no-op delta; regression via create-change + dedicated tests) |
| `cli:change-create`      | 6         | **PASS**                                                               |

---

## Detailed Findings

### `_partial-core-create-change.md`

All merged requirements implemented. Constructor injects `GetActiveSchema` + `DetectOverlap`. Partial schema override throws `InvalidCreateChangeInputError`. Schema resolution errors propagate uncaught. Overlap optional post-scaffold. Tests cover all verify scenarios including error propagation (21 tests).

### `_partial-core-get-active-schema.md`

No-op delta — behaviour unchanged. `GetActiveSchema` still resolves project active schema. Consumed by `CreateChange` when schema fields omitted. 8 dedicated unit tests pass.

### `_partial-cli-change-create.md`

CLI no longer calls `getActiveSchema` prelude or `detectOverlap` directly. Passes `includeOverlapCheck: true` when `specIds` non-empty. Stderr from `overlapReport`. Manifest omits schema identity fields. 12 tests pass. F5/F6 remain mock-only integration style — acceptable per layered testing.
