# Spec Compliance Audit — SDK & Code-Graph (partial)

**Change:** `13-public-api-surface`  
**Specs:** `sdk:composition`, `code-graph:composition`  
**Audit date:** 2026-06-30  
**Scope:** `packages/sdk`, `packages/code-graph` public barrels, `package.json` exports, barrel tests, SDK core re-export policy

---

## Executive summary

| Area                                          | Verdict                     | Notes                                                      |
| --------------------------------------------- | --------------------------- | ---------------------------------------------------------- |
| `@specd/code-graph` public/internal split     | **PASS**                    | `public.ts` + `index.ts` wired via `package.json` exports  |
| `@specd/code-graph` barrel tests              | **PASS** (partial coverage) | 2 tests pass; internal-leak scenario not fully automated   |
| `@specd/sdk` package identity & layers        | **PASS**                    | Deps and directory layout match spec                       |
| `@specd/sdk` no `export * from '@specd/core'` | **PASS**                    | Uses explicit `core-reexports.ts` barrel                   |
| `@specd/sdk` public barrel policy             | **FAIL**                    | Re-exports `NodeContentHasher` from `@specd/core/internal` |
| Import policy (CLI/MCP/plugins)               | **PASS**                    | CLI/MCP → SDK only; plugins may use core directly          |
| Barrel test suites                            | **PASS**                    | SDK 26/26; code-graph barrel 2/2                           |

**Overall:** 1 blocking compliance gap on SDK root barrel; code-graph surface is compliant.

---

## `code-graph:composition`

### Requirement: Public and internal entry points

| Check                                       | Status  | Evidence                                                                          |
| ------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `src/public.ts` as `"."`                    | ✅ PASS | `packages/code-graph/package.json` maps `"."` → `./dist/public.js`                |
| `src/index.ts` as `"./internal"`            | ✅ PASS | Maps `"./internal"` → `./dist/index.js`                                           |
| No unrestricted `export *` on public barrel | ✅ PASS | `public.ts` uses only named exports                                               |
| `InMemoryIndexSession` internal-only        | ✅ PASS | Present in `index.ts` (L75–80), absent from `public.ts`; `barrel.spec.ts` asserts |

### Requirement: Package exports (curated public surface)

| Category                                   | Status  | Notes                                                                            |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------- |
| Composition & wiring                       | ✅ PASS | `createCodeGraphProvider`, `CodeGraphProvider` (type-only), factory option types |
| Host use cases                             | ✅ PASS | All four factories + I/O types exported from `public.ts`                         |
| VCS & config                               | ✅ PASS | `buildProjectGraphConfig`, `createBootstrapGraphConfig`, `GraphConfigOverrides`  |
| Lock management                            | ✅ PASS | `acquireGraphIndexLock`, `assertGraphIndexUnlocked`                              |
| Indexer/discovery types                    | ✅ PASS | `IndexOptions`, `IndexResult`, `WorkspaceIndexTarget`, etc.                      |
| Traversal & impact                         | ✅ PASS | `TraversalOptions`, `ImpactResult`, `analyzeFilesImpact`, etc.                   |
| Hotspots & search                          | ✅ PASS | `HotspotResult`, `SearchOptions`, expand helpers                                 |
| Staleness & fingerprint                    | ✅ PASS | Full fingerprint helper set                                                      |
| Model vocabulary                           | ✅ PASS | `FileNode`, `SymbolNode`, `SymbolKind`, etc.                                     |
| Errors                                     | ✅ PASS | `SpecdCodeGraphError` subclasses including `SpecNotFoundError`                   |
| Version                                    | ✅ PASS | `CODE_GRAPH_VERSION` matches `package.json` (barrel test)                        |
| `CodeGraphProvider` constructor not public | ✅ PASS | `export type { CodeGraphProvider }` only — no value export                       |

### Requirement: Internal components not on `"."`

| Symbol                                   | On `public.ts`? | Status                        |
| ---------------------------------------- | --------------- | ----------------------------- |
| `InMemoryIndexSession`                   | No              | ✅ (tested)                   |
| `IndexSession` / `RegisterFileInput`     | No              | ✅ (internal `index.ts` only) |
| `LadybugGraphStore` / `SQLiteGraphStore` | No              | ✅ (manual inspection)        |
| `AdapterRegistry` / `IndexCodeGraph`     | No              | ✅ (manual inspection)        |

**Gap:** Verify scenario _"Internal components not exported"_ has no barrel test asserting `LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, or `IndexCodeGraph` are absent from the public import path. Implementation appears correct; test coverage is thin.

### Requirement: Dependency on `@specd/core`

✅ PASS — `package.json` lists `@specd/core`; primary factory accepts `SpecdConfig`.

### Requirement: Host use cases

✅ PASS — Factories tested in `host-use-case-factories.spec.ts` (imports from source modules; factories available on public barrel).

### Requirement: CodeGraphProvider facade & lifecycle

✅ PASS (behavioral) — Covered by `code-graph-provider.spec.ts` (delegation, lifecycle, selector normalization).

### Tests

```
packages/code-graph/test/barrel.spec.ts — 2/2 passed
Full suite — barrel tests included; vitest worker teardown warning observed (non-blocking)
```

---

## `sdk:composition`

### Requirement: Package identity and dependencies

| Check                                | Status  | Evidence                                   |
| ------------------------------------ | ------- | ------------------------------------------ |
| Location `packages/sdk/`             | ✅ PASS | Present                                    |
| Workspace `sdk` in `specd.yaml`      | ✅ PASS | `specd.yaml` L90–95                        |
| Runtime deps: core + code-graph only | ✅ PASS | `package-boundary.spec.ts`, `package.json` |
| No cli/mcp deps                      | ✅ PASS | Verified                                   |

### Requirement: Layer structure

| Check                                             | Status  | Evidence                                                                                                |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| Dirs: `composition/`, `orchestration/`, `shared/` | ✅ PASS | `ls packages/sdk/src/`                                                                                  |
| No `infrastructure/` or `domain/`                 | ✅ PASS | Absent                                                                                                  |
| `shared/` not re-exported from `index.ts`         | ✅ PASS | Only `code-graph-version` helpers exported by name                                                      |
| Auxiliary root files                              | ℹ️ INFO | `core-reexports.ts`, `ports.ts`, `extensions.ts` at `src/` root (not forbidden; spec lists directories) |

### Requirement: Public barrel exports (`package.json`)

| Entry            | Expected                  | Actual                                                            | Status  |
| ---------------- | ------------------------- | ----------------------------------------------------------------- | ------- |
| `"."`            | `src/index.ts`            | `./dist/index.js`                                                 | ✅ PASS |
| `"./ports"`      | re-export core ports      | `./dist/ports.js` → `export * from '@specd/core/ports'`           | ✅ PASS |
| `"./extensions"` | re-export core extensions | `./dist/extensions.js` → `export * from '@specd/core/extensions'` | ✅ PASS |

### Requirement: No `export * from '@specd/core'` on SDK root

✅ PASS — `index.ts` uses `export * from './core-reexports.js'`; `core-reexports.ts` lists explicit named exports. Barrel test asserts no `export * from '@specd/core'` in `index.ts`.

### Requirement: SDK composition & orchestration exports

| Symbol                                                       | Status  |
| ------------------------------------------------------------ | ------- |
| `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider` | ✅ PASS |
| `buildProjectStatusSnapshot`, `runIndexProjectGraph`         | ✅ PASS |
| Associated input/result types                                | ✅ PASS |

### Requirement: Explicit core re-exports

✅ PASS — `core-reexports.ts` explicitly exports bootstrap factories, kernel, use-case types, entities, errors, domain services. Spot-checked via `barrel.spec.ts`: `createKernel`, `createGetStatus`, `createSpecRepository`, `CORE_VERSION`.

### Requirement: Public barrel exports for host adapters (code-graph via SDK)

| Symbol                                                                | Status  |
| --------------------------------------------------------------------- | ------- |
| `acquireGraphIndexLock`, `assertGraphIndexUnlocked`                   | ✅ PASS |
| `createGetGraphHealth`, `GetGraphHealthInput`, `GetGraphHealthResult` | ✅ PASS |
| `IndexResult`, `HotspotResult`, `ImpactResult`, `FileImpactResult`    | ✅ PASS |
| `codeGraphVersion`, `getCodeGraphVersion`                             | ✅ PASS |
| `GraphSpecNotFoundError` (alias)                                      | ✅ PASS |
| `SymbolKind`, `SearchOptions`, `HotspotOptions`, `RiskLevel`          | ✅ PASS |
| `normalizeFileSelectorPath`, `createBootstrapGraphConfig`             | ✅ PASS |
| Fingerprint helpers                                                   | ✅ PASS |

### Requirement: SDK root must not export dependency `./internal` symbols

| Check                                            | Status      | Evidence                                                                   |
| ------------------------------------------------ | ----------- | -------------------------------------------------------------------------- |
| No `@specd/code-graph/internal` imports on `"."` | ✅ PASS     | None found                                                                 |
| No `@specd/core/internal` on `"."`               | ❌ **FAIL** | `index.ts` L24: `export { NodeContentHasher } from '@specd/core/internal'` |

**Finding (blocking):** `NodeContentHasher` is exported from the SDK `"."` barrel via `@specd/core/internal`. Spec requirement: _"The `"."` barrel MUST NOT export … symbols that are only available from `"./internal"` entry points of dependency packages."_ This violates `sdk:composition` public barrel policy. Not covered by barrel tests.

### Requirement: Version constant

✅ PASS — `SDK_VERSION` read from `package.json`; barrel test asserts match.

### Requirement: Import policy for integrators

| Consumer                | Expected                     | Actual                                                     | Status  |
| ----------------------- | ---------------------------- | ---------------------------------------------------------- | ------- |
| `@specd/cli`            | SDK only among platform pkgs | `@specd/sdk` only (no `@specd/core` / `@specd/code-graph`) | ✅ PASS |
| `@specd/mcp`            | SDK only                     | `@specd/sdk` only                                          | ✅ PASS |
| `@specd/plugin-manager` | May use core directly        | `@specd/core` present, no SDK required                     | ✅ PASS |

### Tests

```
packages/sdk — 26/26 passed (6 files)
  test/barrel.spec.ts — 8/8
  test/composition/package-boundary.spec.ts — 1/1
```

---

## Cross-package observations

1. **SDK `export *` pattern:** Root uses `export * from './core-reexports.js'` (local curated file). Compliant with the literal verify scenario; `ports.ts` / `extensions.ts` use `export *` on dedicated subpaths as spec allows.

2. **Code-graph build:** `tsup` builds `public.ts` and `index.ts` separately; dist artifacts align with `package.json` export map.

3. **Test coverage gaps (non-blocking):**
   - SDK: no test asserting `NodeContentHasher` / internal symbols are absent (would have caught the violation).
   - Code-graph: no barrel test for store/adapter/indexer symbols staying off `"."`.

---

## Recommended fixes (informational — audit is read-only)

1. **Remove or relocate `NodeContentHasher`** from `packages/sdk/src/index.ts`; consumers needing it should import `@specd/core/internal` directly or receive it via composition injection.
2. Add barrel negative tests:
   - SDK: assert `NodeContentHasher` ∉ `@specd/sdk` root export.
   - Code-graph: assert `LadybugGraphStore`, `SQLiteGraphStore`, `AdapterRegistry`, `IndexCodeGraph` ∉ public import.

---

## Verification commands run

```bash
node packages/cli/dist/index.js change spec-preview 13-public-api-surface sdk:composition --format text
node packages/cli/dist/index.js change spec-preview 13-public-api-surface code-graph:composition --format text
cd packages/sdk && pnpm test          # 26 passed
cd packages/code-graph && pnpm test   # barrel 2/2 passed (full suite)
```
