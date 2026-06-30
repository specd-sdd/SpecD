# Spec Compliance Audit — Graph Platform (Partial)

**Change:** `12-cli-mcp-sdk-migration` (`20260625-142949-12-cli-mcp-sdk-migration`)  
**Audit date:** 2026-06-29  
**Scope:** `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-impact`, `sdk:composition`, `core:composition`  
**Implementation surfaces:** `packages/cli/`, `packages/mcp/package.json`, `packages/sdk/src/index.ts`

---

## Executive Summary

| Spec                                 | Scenarios (verify) | Compliant | Discrepancies | Test gaps |
| ------------------------------------ | ------------------ | --------- | ------------- | --------- |
| `cli:graph-search`                   | ~35                | ~22       | 0 blocking    | ~13       |
| `cli:graph-hotspots`                 | ~18                | ~14       | **2**         | ~6        |
| `cli:graph-impact`                   | ~28                | ~24       | 0 blocking    | ~5        |
| `sdk:composition`                    | 6                  | 4         | **2**         | 1         |
| `core:composition` (migration slice) | 2                  | 2         | 0             | 0         |
| **Totals**                           | **~89**            | **~66**   | **4**         | **~25**   |

**Migration invariant (CLI src imports):** PASS — zero `@specd/core` or `@specd/code-graph` imports in `packages/cli/src/`.

**Package dependencies:** PASS — `@specd/cli` and `@specd/mcp` depend on `@specd/sdk` only for platform wiring (`core`/`code-graph` absent from runtime deps).

---

## Cross-cutting: SDK Migration Compliance

### PASS — CLI uses `@specd/sdk` exclusively for platform symbols

- Grep of `packages/cli/src/`: **0** matches for `@specd/core` or `@specd/code-graph`.
- Graph commands (`search.ts`, `hotspots.ts`, `impact.ts`) import `assertGraphIndexUnlocked`, provider types, and helpers from `@specd/sdk`.
- Shared lifecycle: `resolveGraphCliContext` → `assertGraphIndexUnlocked` → `withProvider` (wraps `createSdkContext` / `withOpenGraphProvider`).
- `packages/cli/src/kernel.ts` removed; `cli-context.ts` bootstraps via `openSpecdHost` from SDK.

### PASS — MCP platform dependency

- `packages/mcp/package.json` runtime deps: `@specd/sdk` only.

### PASS — SDK package identity

- `packages/sdk/package.json` depends only on `@specd/core` and `@specd/code-graph`.
- Layer layout: `composition/`, `orchestration/`, `shared/`, `index.ts` — no `domain/` or `infrastructure/`.

---

## `sdk:composition`

### Compliant

| Requirement                      | Evidence                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Host bootstrap exports           | `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider` in barrel               |
| Orchestration exports            | `buildProjectStatusSnapshot`, `runIndexProjectGraph` + types                         |
| Host-adapter lock/health         | `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, `createGetGraphHealth` exported |
| `SDK_VERSION`                    | Matches `package.json` version (`barrel.spec.ts`)                                    |
| No infra class leak (spot check) | `FsConfigLoader` not in barrel (`barrel.spec.ts`)                                    |
| Core factories available         | `createConfigLoader`, `createConfigWriter`, `createKernel` importable                |

### Discrepancies

1. **`export * from '@specd/core'` violates curated barrel rule**
   - **Spec:** "The barrel MUST NOT export infrastructure adapters, internal composition helpers, or `export *` of either dependency package."
   - **Impl:** `packages/sdk/src/index.ts` line 22 uses `export * from '@specd/core'`.
   - **Impact:** Entire `@specd/core` public surface re-exported; barrel test only asserts `FsConfigLoader` absent, not full leak surface.

2. **Extra `@specd/code-graph` re-exports beyond spec list**
   - **Spec lists:** `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, `createGetGraphHealth`, `GetGraphHealthResult`, `IndexResult`, `HotspotResult`, `CodeGraphProvider`, `createCodeGraphProvider`.
   - **Impl also exports:** `createBootstrapGraphConfig`, `createIndexProjectGraph`, `SymbolKind`, `DEFAULT_HOTSPOT_KINDS`, `isGraphStale`, `detectFingerprintMismatch`, `parseFingerprintMap`, `buildProjectGraphConfig`, `normalizeFileSelectorPath`, `GraphSpecNotFoundError`, fingerprint helpers, `SearchOptions`, `HotspotOptions`, `RiskLevel`, `FileImpactResult`, `ImpactResult`, etc.
   - **Impact:** Spec mandates curated surface; implementation is superset. CLI relies on several extras (e.g. `DEFAULT_HOTSPOT_KINDS`, `normalizeFileSelectorPath`).

### Test gaps

- No compile-time test that barrel rejects `export *` or enumerates allowed code-graph symbols only.
- No negative test for additional infrastructure symbols beyond `FsConfigLoader`.

---

## `core:composition` (migration-relevant slice)

### Compliant

| Requirement                      | Evidence                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| SDK orchestrates host bootstrap  | `createSdkContext` / `openSpecdHost` in SDK compose `createKernel` + `createCodeGraphProvider` |
| CLI declares SDK as platform dep | `packages/cli/package.json` → `@specd/sdk`; no direct `core`/`code-graph`                      |
| MCP declares SDK as platform dep | `packages/mcp/package.json` → `@specd/sdk` only                                                |

### Out of scope (pre-existing core internals)

Use-case factory wiring, kernel builder, VCS auto-detect, `FsChangeRepository` options — unchanged by this migration; not re-audited here.

---

## `cli:graph-search`

### Compliant (representative)

| Area                                   | Evidence                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------ |
| SDK graph context                      | `resolveGraphCliContext` + `withProvider`; imports from `@specd/sdk`     |
| Index lock guard                       | `assertGraphIndexUnlocked(config)` before provider open                  |
| `--kind` validation                    | `parseGraphKinds`; invalid kind fails before query (tested)              |
| `--config` / `--path` mutual exclusion | Implemented + tested                                                     |
| Document search routing                | `--documents` → `searchDocuments` (tested)                               |
| Text snippet format                    | `snippet @ L<n>-L<m>:` with `>>>` / `<<<` markers (tested)               |
| Snippet opt-in                         | Omitted by default in text/json/toon; included with `--snippet` (tested) |
| `--spec-content`                       | Gated to json/toon; included in structured output (tested)               |
| Category headers with limit            | `Symbols (N shown, limit <limit>):` format in `search.ts`                |
| Provider ordering preserved            | CLI does not re-sort; test asserts order kept                            |

### Discrepancies

None blocking for SDK migration scope. Identity-aware ranking semantics are delegated to `CodeGraphProvider` backends (spec-consistent).

### Test gaps

| Scenario (verify)                                      | Status                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `--spec-content` with text format exits 1              | **Not tested** (implemented in `search.ts:149-151`)               |
| Filter by workspace                                    | **Not tested** at CLI level                                       |
| Filter by file path wildcard                           | **Not tested** at CLI level                                       |
| Exclude-path / exclude-workspace                       | **Not tested**                                                    |
| Lock failure exits code 3                              | **Not tested** (only lock call asserted)                          |
| Provider open failure exits 3                          | **Not tested**                                                    |
| Identity ranking (exact > prefix > suffix > substring) | **Backend responsibility** — no integration tests in CLI suite    |
| Text-mode ANSI/control sanitization                    | **Not tested**                                                    |
| Symbol snippet indentation normalization               | **Partial** — normalization helper used; no dedicated indent test |

**CLI tests:** 17 cases in `graph-search.spec.ts`.

---

## `cli:graph-hotspots`

### Compliant (representative)

| Area                          | Evidence                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| SDK graph context             | `resolveGraphCliContext` + `withProvider` + `@specd/sdk` imports       |
| Index lock guard              | `assertGraphIndexUnlocked` before open                                 |
| Default delegation            | CLI passes `{}` when no flags; provider applies defaults               |
| Explicit overrides            | limit, min-risk, min-score, `--kind`, `--include-importer-only` tested |
| `--kind` multi-value          | Comma-separated list passed through (tested)                           |
| Invalid kind fails pre-query  | Tested                                                                 |
| Help text documents semantics | Tested                                                                 |
| Empty text output             | `No hotspots found.` in implementation                                 |

### Discrepancies

1. **Default kind set includes `interface` — spec excludes it**
   - **Spec:** Default policy `kinds = class,method,function`; "exclude `variable` and `interface` unless user explicitly includes them."
   - **Impl:** `@specd/code-graph` `DEFAULT_HOTSPOT_KINDS = ['class', 'interface', 'method', 'function']`; re-exported via SDK; CLI help uses this constant.
   - **Provider:** `compute-hotspots.ts` uses `DEFAULT_HOTSPOT_KINDS` when CLI passes no `kinds`.
   - **Severity:** Medium — behavioral mismatch vs merged spec.

2. **CLI reference docs contradict merged spec**
   - **`docs/cli/cli-reference.md` L1212:** documents default kinds as `class`, `interface`, `method`, `function`.
   - **Test `keeps the CLI reference aligned...`:** explicitly asserts interface is in defaults — test encodes old behavior, conflicts with spec-preview.
   - **Severity:** Medium — docs + test aligned with impl, not spec.

### Test gaps

| Scenario (verify)                          | Status                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| Text ranked table output                   | **Not tested**                                                 |
| JSON/toon `totalSymbols` + `entries` shape | **Not tested**                                                 |
| Lock failure exits code 3                  | **Not tested**                                                 |
| Infrastructure error exits 3               | **Not tested**                                                 |
| Bootstrap / no-config fallback             | **Not tested** (context resolution partially tested via mocks) |
| Default kinds = `class,method,function`    | **Not tested** — would fail today                              |

**CLI tests:** 14 cases in `graph-hotspots.spec.ts`.

---

## `cli:graph-impact`

### Compliant (representative)

| Area                                 | Evidence                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| SDK graph context                    | `resolveGraphCliContext`, `withProvider`, symbols from `@specd/sdk`             |
| Index lock guard                     | `assertGraphIndexUnlocked`; exit 3 on failure (tested)                          |
| Selector exclusivity                 | Exactly one of `--file`/`--symbol`/`--spec` (tested)                            |
| Direction aliases                    | `dependents`→`upstream`, `dependencies`→`downstream`; invalid rejected (tested) |
| Depth passthrough                    | Default 3 and custom depth (tested)                                             |
| File impact text/json                | Risk counts, changed symbols, aggregate JSON fields (tested)                    |
| Multi-file aggregation               | Grouped changed symbols + per-file breakdown (tested)                           |
| Symbol: single/multiple/not-found    | Tested                                                                          |
| Spec impact + `SPEC_NOT_FOUND`       | Tested (text + json)                                                            |
| Ambiguous unprefixed file            | Implemented in `impact.ts:286-291`                                              |
| Missing file normalized path         | Tested                                                                          |
| `--config`/`--path` mutual exclusion | Tested                                                                          |

### Discrepancies

None blocking for SDK migration scope.

### Test gaps

| Scenario (verify)                               | Status                                  |
| ----------------------------------------------- | --------------------------------------- |
| Ambiguous unprefixed file lists canonical paths | **Not tested**                          |
| Spec downstream covers files/symbols            | **Not tested** (only basic spec output) |
| Spec upstream dependent specs                   | **Not tested**                          |
| Absolute path normalization                     | **Not tested**                          |
| `--changes` flag rejected                       | **Not tested**                          |

**CLI tests:** ~25 cases in `graph-impact.spec.ts`.

---

## Recommendations (informational — no code changes made)

1. **Hotspots default kinds:** Align `DEFAULT_HOTSPOT_KINDS` in code-graph (or CLI explicit default) with spec `class,method,function`; update docs and `graph-hotspots.spec.ts` reference assertion.
2. **SDK barrel:** Replace `export * from '@specd/core'` with explicit re-exports per spec; either narrow code-graph re-exports or amend spec to document the extended host-adapter surface.
3. **Tests:** Add CLI tests for search `--spec-content`+text rejection, hotspots output formats + default kinds, impact ambiguous file selector.

---

## Audit Method

- Merged specs via `node packages/cli/dist/index.js changes spec-preview 12-cli-mcp-sdk-migration <specId> --format text`
- Implementation read: graph command sources, SDK barrel, package manifests
- Import scan: `rg '@specd/(core|code-graph)' packages/cli/src`
- Test coverage: `packages/cli/test/commands/graph-*.spec.ts`, `packages/sdk/test/barrel.spec.ts`
