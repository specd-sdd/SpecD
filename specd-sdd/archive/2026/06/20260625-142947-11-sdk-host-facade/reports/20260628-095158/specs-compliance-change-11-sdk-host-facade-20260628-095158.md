# Specs Compliance Report — Change `11-sdk-host-facade`

| Field               | Value                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mode**            | Change (`--change 11-sdk-host-facade`)                                                                                                          |
| **Change path**     | `specd-sdd/changes/20260625-142947-11-sdk-host-facade`                                                                                          |
| **Change state**    | `verifying`                                                                                                                                     |
| **Implementation**  | `packages/sdk/`                                                                                                                                 |
| **Audit timestamp** | 20260628-095158                                                                                                                                 |
| **Graph index**     | Stale (indexed `4741b74`, current `51b8758`) — audit used direct file inspection and spec-preview; graph search not relied upon for SDK symbols |

---

## Executive Summary

The `@specd/sdk` implementation for change **11-sdk-host-facade** is **largely conformant** with merged change specs and global architecture/conventions. All five SDK feature areas (`openSpecdHost`, `createSdkContext`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`) are implemented and exported as specified. The `core:composition` delta requirement (SDK as documented host bootstrap) is satisfied.

Primary gaps are **verify-scenario test coverage** (several binding scenarios untested) and one **layer-structure partial** finding: `src/shared/` exists though the composition verify scenario limits directories to `composition/`, `orchestration/`, and `index.ts` only.

No missing implementations were found. Spec prose in two orchestration specs uses outdated factory call signatures (`createGetGraphHealth({ provider })`, `createIndexProjectGraph({ provider, config })`) that do not match the actual `@specd/code-graph` stateless factories — implementation follows the real API.

---

## Aggregate Counts

| Category          | Count |
| ----------------- | ----- |
| **Conformant**    | 31    |
| **Partial**       | 3     |
| **Missing**       | 0     |
| **Discrepancies** | 7     |

_Counts aggregate requirements/checks across 5 SDK specs, 1 core delta requirement, and global compliance checks._

---

## Top 5 Findings (by severity)

| #   | Severity   | Finding                                                                                                                    | Location                                                                    | Recommendation                                                                                                                             |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Medium** | `src/shared/` directory violates strict layer-structure verify scenario                                                    | `packages/sdk/src/shared/code-graph-version.ts` vs `sdk:composition` verify | Either amend verify scenario to allow `shared/` for cross-cutting constants, or relocate `codeGraphVersion` under `orchestration/`         |
| 2   | **Medium** | Binding verify scenarios lack automated tests (~40% gap)                                                                   | `packages/sdk/test/`                                                        | Add tests for `SDK_VERSION`, forced `configPath`, barrel negative imports, `process.exit` absence, `includeHotspots`, full-workspace index |
| 3   | **Low**    | Graph path failures silently return `graphHealth: null` — spec says "unavailable" but does not document swallow-vs-rethrow | `build-project-status-snapshot.ts:68-90`                                    | Clarify spec or document intentional resilience; consider surfacing error cause                                                            |
| 4   | **Low**    | `withOpenGraphProvider` uses try/catch branches, not literal `finally`                                                     | `with-open-graph-provider.ts`                                               | Behavior matches spec intent; optional refactor to `finally` for clarity                                                                   |
| 5   | **Info**   | Orchestration spec prose uses non-existent factory signatures                                                              | `sdk:build-project-status-snapshot`, `sdk:run-index-project-graph` spec.md  | Update spec text to `createGetGraphHealth()` / `createIndexProjectGraph()` with `execute()` inputs                                         |

---

## Resolved Audit Scope

### Change specs (7)

- `sdk:composition`
- `sdk:host-context`
- `sdk:with-open-graph-provider`
- `sdk:build-project-status-snapshot`
- `sdk:run-index-project-graph`
- `core:composition` (delta)
- `core:kernel` (no-op delta)

### Project-wide specs (included)

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/testing`
- `default:_global/eslint`
- `default:_global/spec-layout`

### Direct dependencies (depth 1, consistency-checked)

Per `specDependsOn` from change status — no contradictions between change specs and dependency specs.

---

## Detailed Findings

<!-- BEGIN PARTIAL: sdk-specs -->

# Partial Audit: SDK Specs (change 11-sdk-host-facade)

**Scope:** `sdk:composition`, `sdk:host-context`, `sdk:with-open-graph-provider`, `sdk:build-project-status-snapshot`, `sdk:run-index-project-graph`  
**Implementation:** `packages/sdk/`  
**Spec source:** `specd changes spec-preview 11-sdk-host-facade <specId>`

---

## sdk:composition

### Requirements Summary

| Requirement                       | Status        |
| --------------------------------- | ------------- |
| Package identity and dependencies | ✅ Conformant |
| Layer structure                   | ⚠️ Partial    |
| Public barrel exports for A2a     | ✅ Conformant |
| Version constant                  | ✅ Conformant |

### Implementation Status

- **Package identity:** `packages/sdk/package.json` lists only `@specd/core` and `@specd/code-graph` as runtime dependencies. No CLI/MCP/plugin deps. Workspace `sdk` registered in `specd.yaml` with `codeRoot: packages/sdk`.
- **Layer structure:** `src/composition/`, `src/orchestration/`, `src/index.ts` present as required. **Additional `src/shared/code-graph-version.ts` exists** — not enumerated in the verify scenario.
- **Barrel:** `src/index.ts` exports all required symbols; uses named re-exports only (no `export *`). `dist/index.d.ts` confirms public surface. Does not export infrastructure adapters.
- **SDK_VERSION:** Exported from `src/index.ts` via `createRequire('../package.json').version` — matches `0.1.0` in `package.json`.

### Discrepancies

1. **Layer structure vs `src/shared/`** (severity: **medium**)
   - **Spec/verify:** "directories are limited to `composition/`, `orchestration/`, and `index.ts`"
   - **Code:** `packages/sdk/src/shared/code-graph-version.ts` holds `codeGraphVersion` helper used by orchestration modules.
   - **Assessment:** Either spec should allow a minimal `shared/` subtree for cross-cutting constants, or the helper should move under `orchestration/` (or inline). Implementation is reasonable; verify scenario is overly strict.

### Test Coverage

| Scenario                                      | Covered?                                              |
| --------------------------------------------- | ----------------------------------------------------- |
| SDK depends only on core and code-graph       | ❌ No automated test (manual/package.json inspection) |
| No infrastructure in source tree              | ❌ No test; `shared/` would fail strict scenario      |
| Barrel exports host and orchestration symbols | ❌ No integration/barrel test                         |
| Barrel does not export internals              | ❌ No compile-time negative test                      |
| SDK_VERSION matches package version           | ❌ No test                                            |

### Missing Tests

- Barrel export surface test (import from `@specd/sdk` or `dist/index.js`)
- `SDK_VERSION === package.json version`
- Structural test asserting allowed `src/` layout

### Summary

- Conformant: 3 | Partial: 1 | Missing: 0 | Discrepancies: 1

---

## sdk:host-context

### Requirements Summary

| Requirement              | Status        |
| ------------------------ | ------------- |
| SdkHostContext shape     | ✅ Conformant |
| createSdkContext         | ✅ Conformant |
| openSpecdHost            | ✅ Conformant |
| Config mutation boundary | ✅ Conformant |

### Implementation Status

- **`SdkHostContext`:** Readonly `{ kernel, createGraphProvider }` — no top-level `config` (`host-context.ts`).
- **`createSdkContext`:** Awaits `createKernel(config, options)`; `createGraphProvider` closes over same `config` reference; each call returns new provider via `createCodeGraphProvider(config)`.
- **`openSpecdHost`:** Uses `createConfigLoader({ configPath })` for forced mode or `{ startDir: process.cwd() }` for discovery; parallel `load()` + `resolvePath()`; spreads context into result with `config` and `configFilePath`.
- **Config mutation:** No write methods on `SdkHostContext` type.

### Discrepancies

None material.

### Test Coverage

| Scenario                                         | Covered?                                             |
| ------------------------------------------------ | ---------------------------------------------------- |
| Context exposes kernel and provider factory only | ⚠️ Implicit (no explicit `config` absence assertion) |
| Provider factory uses same config as kernel      | ✅ `host-context.spec.ts`                            |
| createSdkContext awaits kernel construction      | ✅ async tests                                       |
| Each provider call returns new instance          | ✅                                                   |
| Discovery mode loads config from cwd             | ✅                                                   |
| Forced config path                               | ❌ Not tested                                        |
| Kernel options forwarded                         | ✅                                                   |
| Host context has no write methods                | ❌ No type-level test                                |

### Summary

- Conformant: 4 | Partial: 0 | Missing: 0 | Discrepancies: 0

---

## sdk:with-open-graph-provider

### Requirements Summary

| Requirement                     | Status        |
| ------------------------------- | ------------- |
| withOpenGraphProvider signature | ✅ Conformant |
| Error propagation               | ✅ Conformant |
| No process exit side effects    | ✅ Conformant |
| Optional beforeOpen hook        | ✅ Conformant |

### Implementation Status

- Creates provider, optional `beforeOpen`, `open()`, runs `fn`, closes on success or after `fn` error.
- On `fn` throw: close attempted; close errors swallowed; original `fn` error rethrown.
- No `process.exit` in SDK package (grep confirmed).
- `beforeOpen` invoked before `open()` when provided.

### Discrepancies

1. **Finally wording vs implementation** (severity: **low**)
   - Spec says close in `finally` block; implementation uses explicit try/catch branches. Behavior matches intent.

2. **Success-path close failure** (severity: **low**)
   - If `fn` succeeds but `close()` throws, close error propagates. Spec only documents error-cleanup masking; not a violation.

### Test Coverage

| Scenario                                                 | Covered?       |
| -------------------------------------------------------- | -------------- |
| Provider opened and closed around callback               | ✅             |
| Original error preserved when close fails during cleanup | ✅             |
| Close attempted after fn throws                          | ✅ (same test) |
| SDK helper does not exit process                         | ❌ Not tested  |
| beforeOpen runs before open                              | ✅             |

### Summary

- Conformant: 4 | Partial: 0 | Missing: 0 | Discrepancies: 1 (low)

---

## sdk:build-project-status-snapshot

### Requirements Summary

| Requirement                              | Status        |
| ---------------------------------------- | ------------- |
| buildProjectStatusSnapshot orchestration | ✅ Conformant |
| Result shape stability                   | ✅ Conformant |
| No presenter formatting                  | ✅ Conformant |

### Implementation Status

- Calls `getProjectSummary.execute()` always.
- When `includeGraph` false (default): no `withOpenGraphProvider`; `graphHealth: null`.
- When `includeGraph` true: wraps `createGetGraphHealth().execute({ config, provider, codeGraphVersion, workspaces, assertUnlocked: false })` inside `withOpenGraphProvider`; workspaces from `listWorkspaces`.
- Returns `{ summary, graphHealth, approvals, llmOptimizedContext }` plus optional `hotspots` when `includeHotspots`.
- Plain structured object; no formatting.

### Discrepancies

1. **Spec factory notation drift** (severity: **info**)
   - Spec text: `createGetGraphHealth({ provider })` — actual `@specd/code-graph` API is stateless `createGetGraphHealth()` with `provider` on `execute()` input. Implementation matches real API.

2. **Undocumented graph failure handling** (severity: **low**)
   - Outer `try/catch` sets `graphHealth = null` on any graph path failure. Spec allows null when "unavailable" but does not document silent swallowing vs rethrow. Reasonable for resilience; spec could clarify.

### Test Coverage

| Scenario                             | Covered?      |
| ------------------------------------ | ------------- |
| Summary only without graph           | ✅            |
| Graph health included when requested | ✅            |
| Approvals derived from getConfig     | ✅            |
| llmOptimizedContext forwarded        | ✅            |
| Returns structured object            | ✅ (implicit) |
| includeHotspots                      | ❌ Not tested |

### Summary

- Conformant: 3 | Partial: 0 | Missing: 0 | Discrepancies: 2 (info/low)

---

## sdk:run-index-project-graph

### Requirements Summary

| Requirement                        | Status        |
| ---------------------------------- | ------------- |
| runIndexProjectGraph orchestration | ✅ Conformant |
| Lock acquisition out of scope      | ✅ Conformant |
| Progress callback passthrough      | ✅ Conformant |
| Result passthrough                 | ✅ Conformant |

### Implementation Status

- Reads config via `getConfig.execute()`, lists workspaces, filters subset when `input.workspaces` provided.
- Resolves VCS ref via `createVcsAdapter(projectRoot)` (internal; not barrel-exported).
- Runs `createIndexProjectGraph().execute({ provider, projectRoot, workspaces, graphConfig, codeGraphVersion, force, vcsRef, onProgress })` inside `withOpenGraphProvider`.
- Forwards `beforeOpen` to `withOpenGraphProvider` options.
- `RunIndexProjectGraphResult = IndexResult` — full passthrough type.
- No `acquireGraphIndexLock` in SDK.

### Discrepancies

1. **Spec factory notation drift** (severity: **info**)
   - Spec: `createIndexProjectGraph({ provider, config })` — actual API is stateless `createIndexProjectGraph()` with inputs on `execute()`.

2. **Extra input fields** (severity: **info**)
   - `RunIndexProjectGraphInput` includes `excludePaths` and top-level `beforeOpen` beyond spec prose — extensions, not violations.

### Test Coverage

| Scenario                         | Covered?                                             |
| -------------------------------- | ---------------------------------------------------- |
| Full workspace index             | ❌ Not explicitly tested                             |
| Subset workspace index           | ✅                                                   |
| SDK does not acquire index lock  | ❌ Not tested (code inspection only)                 |
| onProgress receives index events | ✅                                                   |
| Index result fields preserved    | ⚠️ Partial (mock returns `{ filesIndexed: 3 }` only) |

### Summary

- Conformant: 4 | Partial: 0 | Missing: 0 | Discrepancies: 2 (info)

---

## SDK Specs Aggregate

| Metric                  | Count                          |
| ----------------------- | ------------------------------ |
| Conformant requirements | 18                             |
| Partial                 | 1                              |
| Missing implementations | 0                              |
| Discrepancies           | 6 (mostly info/low + 1 medium) |

<!-- END PARTIAL: sdk-specs -->

<!-- BEGIN PARTIAL: core-deltas -->

# Partial Audit: Core Delta Specs (change 11-sdk-host-facade)

**Scope:** `core:composition` (delta), `core:kernel` (no-op delta)  
**Implementation relevance:** SDK bootstrap entry points in `packages/sdk/`

---

## core:composition (delta)

### New/Changed Requirement: @specd/sdk orchestrates cross-package host bootstrap

| Aspect                               | Finding                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status                               | ✅ Conformant                                                                                                                                                                                                            |
| Evidence                             | `@specd/sdk` package exists at `packages/sdk/` exporting `openSpecdHost` and `createSdkContext` per `src/index.ts` and `dist/index.d.ts`                                                                                 |
| Consistency with global architecture | SDK is a thin composition/orchestration layer delegating to `createConfigLoader`, `createKernel`, `createCodeGraphProvider` — aligns with hexagonal guidance that delivery hosts should not wire infrastructure directly |

### Verify Scenario: SDK package exists for host bootstrap

- **WHEN** delivery host needs config, kernel, and graph provider wiring
- **THEN** `@specd/sdk` provides `openSpecdHost` and `createSdkContext`
- **Result:** ✅ Implemented and exported

### Discrepancies

None. Delta requirement is satisfied by this change's implementation.

### Summary

- Conformant: 1 | Partial: 0 | Missing: 0 | Discrepancies: 0

---

## core:kernel (no-op delta)

### Assessment

Preview shows original kernel spec/verify unchanged. No new SDK-specific kernel wiring required in `@specd/core` for this change.

SDK correctly consumes:

- `kernel.project.getConfig.execute()`
- `kernel.project.getProjectSummary.execute()`
- `kernel.project.listWorkspaces.execute()`

These paths exist on the current kernel per `packages/core/src/composition/kernel.ts`.

### Consistency Check

- SDK does not expose config mutation on kernel — ✅
- SDK uses `getConfig` for readonly config rather than duplicating `SpecdConfig` on context (except `openSpecdHost` result which includes loaded config for host convenience — separate from `SdkHostContext`) — ✅ aligns with kernel spec

### Summary

- No delta requirements to implement in core code for this change.
- SDK usage of kernel API: Conformant.

<!-- END PARTIAL: core-deltas -->

<!-- BEGIN PARTIAL: global-compliance -->

# Partial Audit: Global Spec Compliance

**Scope:** Project-wide specs from `specd project context` relevant to `@specd/sdk`  
**Implementation:** `packages/sdk/`

---

## default:\_global/architecture

| Check                                           | Status | Notes                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| SDK is not a domain package with business logic | ✅     | No `domain/`, `application/`, or `infrastructure/` layers — composition/orchestration only |
| Delegates to core/code-graph use cases          | ✅     | All workflows call factories and kernel use cases                                          |
| No circular package dependencies                | ✅     | `sdk` → `core`, `code-graph` only                                                          |
| Manual DI at entry points                       | ✅     | `openSpecdHost` / `createSdkContext` wire dependencies explicitly                          |
| Delivery adapter rule                           | ✅     | SDK is host facade, not an adapter with embedded domain logic                              |

**Partial:** Verify scenario in `sdk:composition` mirrors architecture layering but `src/shared/` is an extra directory not covered by either global or SDK layer specs.

---

## default:\_global/conventions

| Check                    | Status | Notes                                                       |
| ------------------------ | ------ | ----------------------------------------------------------- |
| ESM (`"type": "module"`) | ✅     | `package.json`                                              |
| Named exports only       | ✅     | No default exports; no `export *`                           |
| TypeScript strict        | ✅     | `tsconfig.json` extends monorepo pattern                    |
| JSDoc on public APIs     | ✅     | Host context, orchestration, and version helpers documented |

---

## default:\_global/testing

| Check                      | Status     | Notes                                                                  |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| Unit tests for SDK modules | ⚠️ Partial | 4 spec files under `packages/sdk/test/` with mocked dependencies       |
| Verify scenario coverage   | ⚠️ Partial | ~60% of verify scenarios have direct tests; gaps listed in SDK partial |
| Test structure (vitest)    | ✅         | `vitest.config.ts` present                                             |

**Finding (medium):** Several binding verify scenarios lack tests (SDK_VERSION, forced config path, barrel negative exports, process.exit absence, full index, hotspots).

---

## default:\_global/eslint

| Check                      | Status | Notes                             |
| -------------------------- | ------ | --------------------------------- |
| Package eslint config      | ✅     | `eslint.config.js` extends root   |
| Test file rule relaxations | ✅     | Standard pattern for vitest mocks |

---

## default:\_global/spec-layout

| Check                                         | Status | Notes                             |
| --------------------------------------------- | ------ | --------------------------------- |
| Change-owned specs under change `specs/sdk/*` | ✅     | Per change status artifacts       |
| Paired verify.md                              | ✅     | All 5 SDK specs have verify files |

---

## Spec Dependency Chain Consistency

| Change spec                       | Depends on                                                                         | Consistent?                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| sdk:composition                   | architecture, core:composition, code-graph:composition                             | ✅                                                       |
| sdk:host-context                  | sdk:composition, core:kernel, core:composition                                     | ✅ Uses getConfig not duplicate config on SdkHostContext |
| sdk:with-open-graph-provider      | sdk:host-context, code-graph:composition                                           | ✅                                                       |
| sdk:build-project-status-snapshot | sdk:host-context, core:get-project-summary, code-graph:get-graph-health            | ✅ (factory signature prose drift only)                  |
| sdk:run-index-project-graph       | sdk:with-open-graph-provider, code-graph:index-project-graph, core:list-workspaces | ✅                                                       |

No contradictions found between change specs and global architecture/conventions.

---

## Global Aggregate

| Metric            | Count                                      |
| ----------------- | ------------------------------------------ |
| Conformant checks | 12                                         |
| Partial           | 2 (layer layout strictness, test coverage) |
| Missing           | 0                                          |
| Discrepancies     | 0 at global level                          |

<!-- END PARTIAL: global-compliance -->

---

## Audit Metadata

- **Auditor:** specd-compliance skill (read-only)
- **Partial files:**
  - `reports/20260628-095158/_partial-sdk-specs.md`
  - `reports/20260628-095158/_partial-core-deltas.md`
  - `reports/20260628-095158/_partial-global-compliance.md`
- **Code/spec modifications:** None
