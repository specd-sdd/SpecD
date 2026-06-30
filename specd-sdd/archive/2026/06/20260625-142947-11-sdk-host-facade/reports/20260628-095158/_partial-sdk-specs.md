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
