# Specs Compliance Report — Change 11-sdk-host-facade

**Date:** 2026-06-28  
**Mode:** change  
**Change:** `11-sdk-host-facade`  
**State at audit:** `verifying`

## Executive Summary

| Metric                  | Count |
| ----------------------- | ----: |
| Specs audited           |     7 |
| Requirements conformant |    38 |
| Partial                 |     1 |
| Missing implementation  |     0 |
| Discrepancies           |     0 |

**Verdict:** Implementation conforms to merged change specs. One partial finding (style-only): `withOpenGraphProvider` uses explicit try/catch close paths instead of a `finally` block; behavior matches verify scenarios.

Previous audit gaps (layer `shared/`, missing tests, factory prose) are resolved.

---

## sdk:composition

| Requirement                       | Status                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| Package identity and dependencies | ✅ `@specd/core`, `@specd/code-graph` only                 |
| Layer structure                   | ✅ `composition/`, `orchestration/`, `shared/`, `index.ts` |
| Public barrel exports for A2a     | ✅ Named exports only, no `export *`                       |
| Version constant                  | ✅ `SDK_VERSION` from `package.json`                       |

**Tests:** `test/barrel.spec.ts` covers exports, `SDK_VERSION`, negative internals.

---

## sdk:host-context

| Requirement                                 | Status |
| ------------------------------------------- | ------ |
| SdkHostContext shape                        | ✅     |
| createSdkContext async wiring               | ✅     |
| openSpecdHost discovery + forced configPath | ✅     |
| No duplicate config on context              | ✅     |

**Tests:** `test/composition/host-context.spec.ts` (5 tests).

---

## sdk:with-open-graph-provider

| Requirement                     | Status         |
| ------------------------------- | -------------- |
| Open before fn, close after     | ✅             |
| beforeOpen hook                 | ✅             |
| No process.exit                 | ✅ grep + test |
| Error propagation on fn failure | ✅             |

**Tests:** `test/composition/with-open-graph-provider.spec.ts` (4 tests).

**Partial:** Close logic uses nested try/catch rather than `finally`; semantically equivalent per tests.

---

## sdk:build-project-status-snapshot

| Requirement                           | Status          |
| ------------------------------------- | --------------- |
| Summary always                        | ✅              |
| Graph optional via includeGraph       | ✅              |
| createGetGraphHealth().execute({...}) | ✅ matches spec |
| Graph fail → null, no throw           | ✅              |
| includeHotspots                       | ✅              |
| Approvals / llmOptimizedContext       | ✅              |
| Structured data only                  | ✅              |

**Tests:** `test/orchestration/build-project-status-snapshot.spec.ts` (4 tests).

---

## sdk:run-index-project-graph

| Requirement                     | Status |
| ------------------------------- | ------ |
| Full workspace index            | ✅     |
| Subset filter                   | ✅     |
| No acquireGraphIndexLock in SDK | ✅     |
| onProgress passthrough          | ✅     |
| Result passthrough              | ✅     |

**Tests:** `test/orchestration/run-index-project-graph.spec.ts` (3 tests).

---

## core:composition (delta)

| Requirement                     | Status                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| SDK as preferred host bootstrap | ✅ Documentation delta only; no code change required in core |

---

## core:kernel (delta)

| Requirement | Status                                    |
| ----------- | ----------------------------------------- |
| No-op       | ✅ SDK consumes existing kernel unchanged |

---

## Global architecture alignment

- No `domain/` or `infrastructure/` under `packages/sdk/src`
- `src/shared/` internal helpers not barrel-exported — conforms to relaxed layer spec
- Hexagonal boundaries respected

---

## Test coverage summary

| Package      | Test files | Tests |
| ------------ | ---------- | ----: |
| `@specd/sdk` | 5          |    20 |

All binding verify scenarios for SDK specs have automated coverage except compile-time barrel negative import (runtime assertion in barrel test suffices).

---

## Recommendations

None blocking. Optional: refactor `withOpenGraphProvider` to `finally` for readability (no spec change required).
