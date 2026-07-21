# Partial Audit: studio-desktop (main-kernel-lifecycle + ipc-handler-registry)

**Change:** `merge-main-adapt-ui-branch`  
**Mode:** change-scoped (subagent batch)  
**Scope:** `studio-desktop:main-kernel-lifecycle`, `studio-desktop:ipc-handler-registry`  
**Graph freshness:** fresh (`stale: false`, fingerprint OK)  
**Audit date:** 2026-07-21  
**Read-only:** no code/spec modifications

---

## Critical known-issue verdict (CONFIRMED)

| Claim                                                                                                                                     | Verdict       | Evidence                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/desktop-graph-runtime.spec.ts` still expects `@specd/code-graph-electron` dep + rebuild script targeting that package               | **CONFIRMED** | Lines 25–28 assert `dependencies['@specd/code-graph-electron'] === 'workspace:*'` and rebuild script contains `@specd/code-graph-electron rebuild:vendored-sqlite-electron`                               |
| `test/ipc-graph-provider.spec.ts` still expects `from '@specd/code-graph-electron'`                                                       | **CONFIRMED** | Line 13: `expect(source).toContain("from '@specd/code-graph-electron'")`                                                                                                                                  |
| Actual `package.json` / `ipc-handlers.ts` use `@specd/code-graph-sqlite-electron`, `graphStoreId: 'sqlite-electron'`, long-lived provider | **CONFIRMED** | `package.json` deps + scripts; `ipc-handlers.ts` imports `createElectronSqliteGraphStoreFactory`, boots with `graphStoreId: 'sqlite-electron'`, `openLongLivedGraphProvider` / `withHealthyGraphProvider` |
| Those 2 tests FAIL when run                                                                                                               | **CONFIRMED** | `vitest run` → both FAIL (expected `workspace:*` got `undefined`; expected import string missing)                                                                                                         |

**Additional test drift (same root cause — long-lived sqlite-electron migration):**

| Test file                                 | Result              | Drift                                                                                                                                                                                                                      |
| ----------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/desktop-host-lifecycle.spec.ts`     | **2 FAIL / 1 PASS** | Still expects `const { kernel } = await createSdkContext` (impl now also destructures `createGraphProvider`) and short-lived `openGraphProviders` set; impl uses `activeGraph` + `resetDesktopKernel` → `provider.close()` |
| `test/desktop-local-data-adapter.spec.ts` | PASS                | Unrelated to graph package rename                                                                                                                                                                                          |

---

## Spec 1: `studio-desktop:main-kernel-lifecycle`

### Requirements Summary

| #   | Requirement                                                                                                                                                           | Implementation                                                                 | Tests                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| R1  | One SDK host (`createSdkContext`) per open local project; no direct `createKernel`                                                                                    | **Implemented** (lazy on first `getHost`)                                      | Partial / stale string checks                    |
| R2  | Project switch tears down kernel + graph before new host                                                                                                              | **Implemented** (`resetDesktopKernel` closes graph, bumps `sessionGeneration`) | **Failing** — still asserts `openGraphProviders` |
| R3  | Electron SQLite graph runtime: dep, rebuild scripts, `prestart`, `sqlite-electron`, long-lived provider; no `code-graph-electron`; no routine `withOpenGraphProvider` | **Implemented**                                                                | **Failing** — asserts old package name           |
| R4  | `start` clears `ELECTRON_RUN_AS_NODE`                                                                                                                                 | **Implemented** (`env ELECTRON_RUN_AS_NODE= electron .`)                       | No dedicated test                                |
| R5  | Bundled CJS main + externals (`electron`, sqlite-electron, sdk, client); `main` = `dist/main/index.cjs`                                                               | **Implemented**                                                                | No dedicated test                                |
| R6  | Nested `kernel: { logFormatter: createLogFormatter({ colorize: false }) }`; no top-level `logFormatter`                                                               | **Implemented**                                                                | **Missing**                                      |

### Implementation Status (detail)

**Compliant evidence**

- `getHost()` (`ipc-handlers.ts` ~261–303): single `hostPromise` gated by `sessionGeneration` / `hostPromiseGeneration`; awaits `createSdkContext(config, { kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) }, graph: { graphStoreId: 'sqlite-electron', graphStoreFactories: { 'sqlite-electron': createElectronSqliteGraphStoreFactory() } } })`; opens one long-lived provider via `openLongLivedGraphProvider`.
- No `createKernel` import/use in studio-desktop (graph search: zero studio-desktop hits).
- `resetDesktopKernel()` (~2245–2254): increments generation, clears `hostPromise`/`logRing`/`activeGraph`, **`void graph.provider.close()`**.
- `openLocalProject` / `closeSession` call `resetDesktopKernel()` before/after root change; in-flight work can hit `SessionSupersededError`.
- `package.json`: dep `@specd/code-graph-sqlite-electron`; scripts `rebuild:graph-sqlite-electron`, alias `rebuild:graph-electron`, `prestart`, `build` prefix rebuild; `main: dist/main/index.cjs`; `start` clears `ELECTRON_RUN_AS_NODE`.
- `tsup.main.config.ts` externals: `electron`, `@specd/sdk`, `@specd/client`, `@specd/code-graph-sqlite-electron`.
- Graph navigation: `ipc-handlers.ts` depends on `long-lived-graph.ts` + `@specd/code-graph-sqlite-electron`; **no** studio-desktop import of `withOpenGraphProvider` or `@specd/code-graph-electron`.
- CLI/API `package.json`: no `@specd/code-graph-sqlite-electron` / `@specd/code-graph-electron` (isolation OK).

**Soft / interpretive notes**

- Host construction is **lazy** (first port/graph call), not inside `openLocalProject`. Verify scenario wording (“WHEN user opens … THEN awaits `createSdkContext`”) is stricter than “one host per project until switch”. Behaviour still guarantees at-most-one host per session generation; flag as **spec vs timing ambiguity**, not a hard bug.
- Index path uses `createIndexProjectGraph()` on the **already-open** long-lived provider (not `runIndexProjectGraph` + forced reopen). Spec **MAY** allow `runIndexProjectGraph`; forced reopen after short-lived index is N/A for this path. Stale recovery still via `withHealthyGraphProvider` on `GraphProviderStaleError`.

### Discrepancies

1. **Test drift vs correct implementation (HIGH)** — `desktop-graph-runtime.spec.ts` and parts of `desktop-host-lifecycle.spec.ts` encode the pre-migration `code-graph-electron` / short-lived `openGraphProviders` model. **Likely resolution: update tests to match change specs** (impl matches `sqlite-electron` requirements).
2. **Verify timing vs lazy boot (LOW)** — open does not eagerly call `createSdkContext`. Either accept lazy boot or tighten open path / soften verify scenario.

### Test Coverage

| Area                                                   | Coverage                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Rebuild/scripts/dep isolation                          | Present but **wrong package name** → FAIL                            |
| One host + superseded session                          | Present but stale destructure string → FAIL                          |
| `mapProjectStatusDto` wiring                           | Covered in host-lifecycle (passes) — also IPC spec                   |
| Long-lived open/reuse/stale refresh                    | **Missing** (no assertions on `long-lived-graph.ts` / `activeGraph`) |
| `resetDesktopKernel` closes graph                      | **Missing** (tests still expect `openGraphProviders.clear`)          |
| Nested `colorize: false`                               | **Missing**                                                          |
| `ELECTRON_RUN_AS_NODE` / tsup externals / `main` field | **Missing**                                                          |

### Missing Tests

- Assert `@specd/code-graph-sqlite-electron` dep + rebuild script filter to that package.
- Assert no `@specd/code-graph-electron` import in main IPC path.
- Assert `graphStoreId: 'sqlite-electron'` + factory registration in `createSdkContext` options.
- Assert `kernel.logFormatter` / `colorize: false` nesting (and absence of top-level `logFormatter`).
- Assert `resetDesktopKernel` closes `activeGraph.provider` (not `openGraphProviders`).
- Assert `withOpenGraphProvider` absent from routine IPC source.
- Optional: package `main` + tsup externals + `start` env clear.

### Spec Dependency Chain

- `sdk:host-context` — used via `createSdkContext` ✓
- `client:specd-data-port` — IPC surface ✓
- `code-graph-sqlite-electron:sqlite-electron-store` — factory import ✓
- `code-graph:composition` — long-lived holder pattern mirrored in `long-lived-graph.ts` ✓
- No contradiction found between change delta and these dependencies for the audited requirements.

### Summary counts (`studio-desktop:main-kernel-lifecycle`)

| Metric                      | Count                                                                          |
| --------------------------- | ------------------------------------------------------------------------------ |
| Requirements checked        | 6                                                                              |
| Implemented compliant       | 6 (1 soft timing note)                                                         |
| Implementation bugs vs spec | 0 hard                                                                         |
| Spec ambiguities            | 1 (eager vs lazy `createSdkContext`)                                           |
| Test failures confirmed     | 3 cases across 2 files (`desktop-graph-runtime` 1, `desktop-host-lifecycle` 2) |
| Missing / inadequate tests  | 6+ scenario gaps                                                               |
| Spec↔global contradictions  | 0                                                                              |

---

## Spec 2: `studio-desktop:ipc-handler-registry`

### Requirements Summary

| #   | Requirement                                                                                                                                                                      | Implementation                            | Tests                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| R1  | IPC handlers mirror SpecdDataPort / kernel use cases; draft-aware preview/outline                                                                                                | **Implemented**                           | Partial (adapter filename only)         |
| R2  | Handlers use ipc-message-envelope (`createIpcSuccess` / `createIpcFailure`)                                                                                                      | **Implemented**                           | No envelope-focused desktop tests       |
| R3  | Kernel from process-scoped SDK host; no per-invoke kernel                                                                                                                        | **Implemented** (`getKernel` → `getHost`) | Stale session string checks only        |
| R4  | Graph IPC: long-lived sqlite-electron provider; no direct `createCodeGraphProvider` / routine `withOpenGraphProvider`; no `code-graph-electron`; renderer stays on SpecdDataPort | **Implemented**                           | **FAIL** (`ipc-graph-provider.spec.ts`) |
| R5  | Project status via `@specd/client` `mapProjectStatusDto`                                                                                                                         | **Implemented**                           | Covered (string assert PASS)            |

### Implementation Status (detail)

**Compliant evidence**

- `handlePortMethod` / `handleDraftAwarePort`: invoke `kernel.changes.*`, `kernel.specs.*`, `kernel.project.*`, etc.; draft methods `previewChangeDraft`, `outlineChangeArtifact`, `outlineSpecDraft` present (~1199–1254).
- Envelopes: all replies go through `createIpcSuccess` / `createIpcFailure` with request `id`; failures pass `{ message }` only (no raw stack leak via envelope helper).
- Graph cases (`getGraphStatus`, `indexGraph`, search/impact/hotspots, …) call `withGraphProvider` → `withHealthyGraphProvider` on host-owned holder — not `withOpenGraphProvider`, not `createCodeGraphProvider` directly.
- Import: `createElectronSqliteGraphStoreFactory` from `@specd/code-graph-sqlite-electron` only (no `code-graph-electron`).
- Renderer: `desktop-local-data-adapter.ts` invokes port methods over bridge; no graph-runtime package imports under `src/renderer`.
- `toProjectStatusDtoFromSnapshot` → `mapProjectStatusDto({...})`; when health unavailable, snapshot uses `graphHealth: null` and mapper omits `graph` (`input.graph == null` → field omitted) — matches verify “optional semantics”.

**Notes**

- Index uses long-lived provider + `createIndexProjectGraph` (see Spec 1). Acceptable under MAY for `runIndexProjectGraph`.
- Error path stringifies `err.message`; SpecdError-specific shaping is thin but envelope contract still holds.

### Discrepancies

1. **Test drift (HIGH)** — `ipc-graph-provider.spec.ts` requires `@specd/code-graph-electron` import while implementation correctly imports sqlite-electron. **Fix tests, not production code.**
2. **Coverage gap (MEDIUM)** — no test asserts absence of `withOpenGraphProvider`, presence of long-lived helper, or stale refresh path for graph IPC.
3. **Coverage gap (LOW)** — draft-aware / GetStatus / 409 envelope scenarios are largely untested at desktop layer (contract may be covered elsewhere).

### Test Coverage

| Area                                    | Coverage                             |
| --------------------------------------- | ------------------------------------ |
| Graph package import                    | Present but **wrong package** → FAIL |
| `mapProjectStatusDto`                   | Present → PASS                       |
| Long-lived / no `withOpenGraphProvider` | **Missing**                          |
| Envelope correlation / failure shape    | **Missing** at desktop               |
| Draft-aware IPC                         | **Missing**                          |
| Renderer isolation from graph packages  | **Missing** (spot-checked manually)  |

### Missing Tests

- Update `ipc-graph-provider.spec.ts` to expect `@specd/code-graph-sqlite-electron` and optionally `graphStoreId: 'sqlite-electron'`.
- Assert source does **not** contain `withOpenGraphProvider` / `from '@specd/code-graph-electron'`.
- Assert `withHealthyGraphProvider` / `openLongLivedGraphProvider` usage for graph IPC.
- Optional behavioral test for `GraphProviderStaleError` refresh.
- Draft-aware method → kernel use-case dispatch smoke tests.

### Spec Dependency Chain

- `sdk:host-context` ✓
- `client:specd-data-port` ✓
- `client:ipc-message-envelope` ✓ (`@specd/client` envelope helpers)
- `client:dto-project-status` ✓ (`mapProjectStatusDto`)
- `code-graph-sqlite-electron:sqlite-electron-store` ✓
- `code-graph:composition` ✓ (long-lived lifecycle)
- No change-spec vs dependency contradictions found for audited requirements.

### Summary counts (`studio-desktop:ipc-handler-registry`)

| Metric                      | Count                                 |
| --------------------------- | ------------------------------------- |
| Requirements checked        | 5                                     |
| Implemented compliant       | 5                                     |
| Implementation bugs vs spec | 0                                     |
| Spec ambiguities            | 0 (index MAY path noted)              |
| Test failures confirmed     | 1 file (`ipc-graph-provider.spec.ts`) |
| Missing / inadequate tests  | 4+ scenario gaps                      |
| Spec↔global contradictions  | 0                                     |

---

## Cross-cutting verified checklist (user-requested)

| Check                                                                | Result                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `createSdkContext` nested `kernel.logFormatter` `colorize: false`    | **YES** (`ipc-handlers.ts` ~271–275)                             |
| Rebuild scripts (`rebuild:graph-sqlite-electron`, alias, `prestart`) | **YES** (`package.json`)                                         |
| No `withOpenGraphProvider` for routine IPC                           | **YES** (source + graph impact; uses `withHealthyGraphProvider`) |
| `mapProjectStatusDto` usage                                          | **YES** (`toProjectStatusDtoFromSnapshot`)                       |
| `resetDesktopKernel` closes graph                                    | **YES** (`activeGraph.provider.close()`)                         |
| Known stale tests vs sqlite-electron impl                            | **CONFIRMED FAIL**                                               |

---

## Batch totals

| Metric                        | Count                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Specs audited                 | 2                                                                                           |
| Hard implementation↔spec bugs | 0                                                                                           |
| Confirmed failing test files  | 3 (`desktop-graph-runtime`, `ipc-graph-provider`, `desktop-host-lifecycle` partially)       |
| Primary remediation           | Update desktop tests to sqlite-electron + long-lived provider model; keep production wiring |
| Spec wording follow-ups       | Optional: clarify lazy vs eager host boot on `openLocalProject`                             |

---

## Recommendation (non-binding)

Treat production desktop wiring as **aligned** with the change specs for these two IDs. The compliance gap is almost entirely **test drift** left on `@specd/code-graph-electron` / short-lived provider assertions. Updating those tests is required before verify can pass for studio-desktop.
