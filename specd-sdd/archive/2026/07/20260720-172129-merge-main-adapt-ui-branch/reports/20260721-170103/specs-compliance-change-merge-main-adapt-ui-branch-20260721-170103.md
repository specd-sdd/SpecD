# Spec Compliance Report — change: merge-main-adapt-ui-branch

- **Mode:** change
- **Timestamp:** 20260721-170103
- **State at audit:** verifying
- **Verdict:** Implementation largely compliant; **blocking test drift** on studio-desktop; minor API **spec wording drift** on getGraphProvider vs withGraphProvider

## Aggregate summary

| Area                                             | Impl | Tests              | Key issues                                                                 |
| ------------------------------------------------ | ---- | ------------------ | -------------------------------------------------------------------------- |
| code-graph-sqlite-electron:sqlite-electron-store | PASS | PASS (6/6)         | Behavioral gaps (rebuild-skip, sqlite↔sqlite-electron equivalence)         |
| studio-desktop:main-kernel-lifecycle             | PASS | FAIL               | 3 stale test files still expect code-graph-electron / openGraphProviders   |
| studio-desktop:ipc-handler-registry              | PASS | FAIL               | ipc-graph-provider.spec expects old import                                 |
| api:composition-\* + handler-graph               | PASS | PASS (graph 13/13) | Spec overclaims reopen on getGraphProvider; handlers use withGraphProvider |

## Recommended next step

1. **Fix Implementation** — update desktop tests to sqlite-electron / long-lived provider model
2. Optionally **Update Specs** — clarify getGraphProvider (peek) vs withGraphProvider (healthy/reopen)

## Detailed Findings

### Batch: sqlite-electron

# Spec Compliance: `code-graph-sqlite-electron:sqlite-electron-store`

- **Change:** `merge-main-adapt-ui-branch`
- **Spec:** `code-graph-sqlite-electron:sqlite-electron-store`
- **Auditor mode:** read-only (implementation + tests vs change `spec-preview`; deps via canonical `specs show`)
- **Graph freshness:** not stale (`project status --graph` at audit time)
- **Known context (verify):** **CONFIRMED**
  - Package `@specd/code-graph-sqlite-electron` exists, `private: true`, exports `createElectronSqliteGraphStoreFactory` via `createSqliteGraphStoreFactory` + `loadVendoredBetterSqlite3Module`
  - `vendor/` gitignored; sync/rebuild scripts present with portable Electron/platform/arch cache metadata
  - Package tests: **6 passed** (including deferred native load at factory construction)

---

## Requirements Summary

| #   | Requirement                             | Verdict                                                  |
| --- | --------------------------------------- | -------------------------------------------------------- |
| R1  | Dedicated Electron SQLite store package | **PASS**                                                 |
| R2  | `sqlite-electron` GraphStoreFactory     | **PASS**                                                 |
| R3  | Deferred native module load             | **PASS** (impl); test coverage partial                   |
| R4  | Locally generated vendored sqlite tree  | **PASS**                                                 |
| R5  | Platform-aware Electron rebuild cache   | **PASS** (impl); behavioral test gap                     |
| R6  | Shared SQLite graph semantics           | **PASS** (by construction); **no equivalence tests**     |
| R7  | Host wiring via SDK graph options       | **PASS** (desktop host); related desktop tests **stale** |
| R8  | Internal-only distribution role         | **PASS**                                                 |

**Constraints checked:** no re-export/fork of `@specd/code-graph` composition; host path does not import `@specd/code-graph-electron`; builtin `sqlite` id not overwritten (additive registry + distinct id).

---

## Implementation Status

### R1 — Dedicated Electron SQLite store package

- Workspace package present: `packages/code-graph-sqlite-electron` (`pnpm-workspace.yaml` `packages/*`; listed in `project status` as workspace `code-graph-sqlite-electron`).
- `package.json` name `@specd/code-graph-sqlite-electron`, distinct from `@specd/code-graph` and `@specd/code-graph-electron`.
- Public barrel (`src/index.ts` / `dist/index.d.ts`) exports only:
  - `createElectronSqliteGraphStoreFactory`
  - `loadVendoredBetterSqlite3Module`, path constants
- Does **not** re-export `createCodeGraphProvider` or a full composition surface.

### R2 — `sqlite-electron` GraphStoreFactory

```15:18:packages/code-graph-sqlite-electron/src/create-electron-sqlite-graph-store-factory.ts
export function createElectronSqliteGraphStoreFactory(): GraphStoreFactory {
  return createSqliteGraphStoreFactory({
    loadDatabaseModule: loadVendoredBetterSqlite3Module,
  })
}
```

- Built with `createSqliteGraphStoreFactory` from `@specd/code-graph`.
- Loader resolves this package’s vendored entry (`vendor/better-sqlite3/lib/index.js`).
- Host registers under id `sqlite-electron` only (see R7). Builtin registry merge in `createGraphStoreRegistry` **throws** on colliding builtin ids — registering `sqlite-electron` cannot overwrite `sqlite`.

### R3 — Deferred native module load

- Loader is a function passed into the factory; `require(vendoredSqliteEntry)` runs only when `loadVendoredBetterSqlite3Module()` is invoked.
- `SQLiteGraphStore.open()` awaits `loadDatabaseModule()` (code-graph sqlite adapter) — matches `code-graph:sqlite-graph-store` / composition deferred-load contract.
- Factory construction itself is synchronous and does not call the loader (covered by package test spy).

### R4 — Locally generated vendored sqlite tree

- Root `.gitignore`: `packages/code-graph-sqlite-electron/vendor/`
- Package `.gitignore`: `vendor/`
- `scripts/sync-vendored-sqlite.mjs` copies canonical `better-sqlite3` (+ bindings deps) into `vendor/better-sqlite3/` under this package only.
- Paths assert physical separation from `code-graph-electron/vendor` (package test).
- `build` / `test` scripts invoke sync before compile.

### R5 — Platform-aware Electron rebuild cache

- `scripts/electron-build-metadata.mjs` defines portable metadata: `electronVersion`, `platform`, `arch` (rejects legacy `binaryPath`).
- `scripts/rebuild-vendored-sqlite-electron.mjs`:
  - reads Electron version from `apps/specd-studio-desktop`
  - skips rebuild when binary + matching metadata exist (`electronBuildMatchesCurrent`)
  - otherwise `npm rebuild` with Electron runtime env and writes `.electron-build.json`
- **Observation (operational, not a spec fail):** at audit time `vendor/.../better_sqlite3.node` existed but `.electron-build.json` was absent — rebuild would not skip until a successful rebuild writes metadata. Logic still matches the “skip only when metadata matches” requirement.

### R6 — Shared SQLite graph semantics

- No forked store: factory returns `SQLiteGraphStore` via `createSqliteGraphStoreFactory`.
- Differences limited to `loadDatabaseModule` / packaging, as required.
- No package-level indexing/search/impact equivalence suite vs builtin `sqlite`.

### R7 — Host wiring via SDK graph options

Desktop main (`apps/specd-studio-desktop/src/main/ipc-handlers.ts`):

- imports `createElectronSqliteGraphStoreFactory` from `@specd/code-graph-sqlite-electron`
- `createSdkContext(config, { graph: { graphStoreId: 'sqlite-electron', graphStoreFactories: { 'sqlite-electron': createElectronSqliteGraphStoreFactory() } } })`
- no `from '@specd/code-graph-electron'` under `apps/specd-studio-desktop/src`
- desktop `package.json` depends on `@specd/code-graph-sqlite-electron`, rebuild scripts filter that package

SDK forwards `options.graph` into `createCodeGraphProvider` (`packages/sdk/src/composition/host-context.ts`).

### R8 — Internal-only distribution role

- `"private": true`, `"version": "0.0.0"`, workspace dependency only.

---

## Discrepancies

### D1 — Stale desktop tests contradict host-wiring scenario (test drift; impl correct)

**Spec / verify:** Desktop MUST wire `sqlite-electron` from this package and MUST NOT import `@specd/code-graph-electron`.

**Implementation:** Complies (ipc-handlers + package.json).

**Tests (related host, outside this package but validating the verify scenario):**

- `apps/specd-studio-desktop/test/desktop-graph-runtime.spec.ts` still expects:
  - `dependencies['@specd/code-graph-electron'] === 'workspace:*'`
  - rebuild script containing `@specd/code-graph-electron rebuild:vendored-sqlite-electron`
- `apps/specd-studio-desktop/test/ipc-graph-provider.spec.ts` expects `from '@specd/code-graph-electron'`

**Interpretation:** Spec and implementation agree; desktop tests lagged the package split. Prefer updating tests to assert `@specd/code-graph-sqlite-electron` / `sqlite-electron` wiring (not reverting host to `code-graph-electron`).

### D2 — No contradiction with dependency specs

Checked against:

- `code-graph:composition` — additive `graphStoreFactories`, `createSqliteGraphStoreFactory` public export, sync factory creation, native load deferred to `open()`
- `code-graph:sqlite-graph-store` — injectable `loadDatabaseModule`, deferred until `open()`, backend id `sqlite` remains the builtin Node path

This change spec **extends** those contracts with an additive Electron backend id; it does not redefine or conflict with them.

### D3 — Shared-semantics requirement lacks direct verification evidence

Requirement R6 is satisfied architecturally (same `SQLiteGraphStore`) but verify scenario “Electron backend preserves SQLite graph behaviour” has **no** automated exercise of index/search (or impact/hotspots/stats) through `graphStoreId: 'sqlite-electron'`. Residual risk if factory options ever diverge from the shared factory path.

---

## Test Coverage

Package: `packages/code-graph-sqlite-electron/test/runtime/vendored-sqlite.spec.ts` — **6 tests, all passing** (`pnpm test`).

| Scenario (verify.md)                                           | Covered?                       | Evidence                                                                                                             |
| -------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Separate workspace / no composition re-export                  | Partial                        | Workspace + barrel export checks; no explicit “does not export createCodeGraphProvider” assert                       |
| Factory registers `sqlite-electron` without colliding `sqlite` | **Gap**                        | Host wires it; no package test calling `createCodeGraphProvider` / asserting builtin `sqlite` still works            |
| Factory uses `createSqliteGraphStoreFactory` + vendored loader | Partial                        | Factory has `create`; barrel mentions vendor paths; does not assert call into `createSqliteGraphStoreFactory` by spy |
| Native not loaded until `open()`                               | Partial                        | Spy proves factory construction does not load; does **not** run provider/`open()` path                               |
| Vendor ignored by git                                          | **Yes**                        | Asserts root `.gitignore` contains `packages/code-graph-sqlite-electron/vendor/`                                     |
| Sync populates vendor tree                                     | Partial                        | Sync runs in build; version/path existence checks; no from-empty sync unit test                                      |
| Matching cache metadata skips rebuild                          | Partial                        | Static script content asserts portable metadata APIs / platform/arch; no run of rebuild with matching cache          |
| Shared SQLite semantics                                        | **No**                         | Missing                                                                                                              |
| Desktop SDK wiring / no code-graph-electron                    | Impl yes; tests **stale** (D1) |                                                                                                                      |
| Package private/internal                                       | Soft gap                       | `private: true` present; no metadata assertion in package tests                                                      |

---

## Missing Tests

1. **Integration:** `createCodeGraphProvider(config, { graphStoreId: 'sqlite-electron', graphStoreFactories })` succeeds; builtin `sqlite` still selectable afterward / without collision.
2. **Deferred load end-to-end:** provider construction does not invoke loader; first invocation on `open()` (mock loader).
3. **Semantics smoke (or golden vs sqlite):** minimal index + search (and ideally impact/stats) through `sqlite-electron` factory with a Node-safe mock/fake Database module if Electron ABI is unavailable in CI.
4. **Rebuild skip behavioral:** fixture with matching `.electron-build.json` + binary asserts rebuild exits without recompilation (or spies `npm rebuild`).
5. **Desktop test updates:** replace `code-graph-electron` expectations with `@specd/code-graph-sqlite-electron` + `graphStoreId: 'sqlite-electron'` source asserts.
6. Optional: assert barrel does not export `createCodeGraphProvider`; assert `"private": true`.

---

## Spec Dependency Chain

```
code-graph-sqlite-electron:sqlite-electron-store
├── code-graph:composition
│   ├── createSqliteGraphStoreFactory (public)
│   ├── CodeGraphCompositionOptions.graphStoreFactories (additive; reject overwrite of builtins)
│   ├── graphStoreId selection
│   └── createCodeGraphProvider remains sync; native load at open()
└── code-graph:sqlite-graph-store
    ├── SQLiteGraphStore semantics (index/search/traversal/impact/hotspots/stats)
    └── injectable loadDatabaseModule deferred until open()
```

**Host consumer (verify scenario, not a declared Spec Dependency):** `studio-desktop` via `@specd/sdk` `createSdkContext({ graph })`.

**Consistency with deps:** aligned; no requirement-level contradiction found.

---

## Summary counts

| Category                                                  |           Count |
| --------------------------------------------------------- | --------------: |
| Requirements audited                                      |               8 |
| Requirements **PASS** (implementation)                    |               8 |
| Requirements **FAIL** (implementation)                    |               0 |
| Spec↔dependency contradictions                            |               0 |
| Discrepancies (incl. related stale tests / evidence gaps) |       3 (D1–D3) |
| Verify scenarios                                          |              10 |
| Scenarios well covered by package tests                   |             3–4 |
| Scenarios partial                                         |             4–5 |
| Scenarios missing / stale related tests                   |             2–3 |
| Package tests run                                         | 6 pass / 0 fail |
| Missing recommended tests                                 |   6 (see above) |

### Bottom line

`@specd/code-graph-sqlite-electron` **implements** `sqlite-electron-store` as specified: private workspace package, additive `sqlite-electron` factory over `createSqliteGraphStoreFactory` + vendored deferred loader, gitignored vendor + sync/rebuild with portable Electron/platform/arch cache, and desktop SDK wiring without `@specd/code-graph-electron`. Known verify context is **confirmed**. Main compliance debt is **verification gaps** (shared semantics, provider-level deferred load, rebuild skip behavior) and **stale studio-desktop tests** still expecting the old `code-graph-electron` package.

### Batch: studio-desktop

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

### Batch: api

# Spec Compliance Partial — API long-lived graph host

**Change:** `merge-main-adapt-ui-branch`  
**Batch:** `api`  
**Specs audited:**

1. `api:composition-create-api-server`
2. `api:composition-graph-provider`
3. `api:composition-create-api-context`
4. `api:handler-graph`

**Scope note:** Read-only audit. Evidence from `specd changes spec-preview`, `specd graph search/impact`, `packages/api` source, and `pnpm --filter @specd/api exec vitest run test/graph.spec.ts` (**13/13 passed**, ~51s; not DB-locked in this run).

**Primary implementation files:**

- `packages/api/src/composition/create-api-server.ts`
- `packages/api/src/composition/create-api-context.ts`
- `packages/api/src/composition/long-lived-graph.ts`
- `packages/api/src/delivery/http/handlers/handler-graph.ts`
- `packages/api/package.json` (deps: `@specd/sdk`, `@specd/client` only — **no** `@specd/code-graph-sqlite-electron`)

---

## Cross-cutting: long-lived graph host model

| Focus check                                                                                                        | Status   | Evidence                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `createApiServer` opens one provider at bootstrap                                                                  | **PASS** | `openLongLivedGraphProvider(sdkHost.createGraphProvider)` into `state.graph.provider` |
| `ApiServer.close()` closes long-lived provider                                                                     | **PASS** | `await state.graph.provider.close()` before `app.close()`                             |
| Context exposes `getGraphProvider` / `withGraphProvider` / `releaseGraphProviderForIndex` / `refreshGraphProvider` | **PASS** | `ApiContext` in `create-api-context.ts`                                               |
| Handler reads use `withGraphProvider`                                                                              | **PASS** | status/search/impact/hotspots/specs/changes all wrap via `ctx.withGraphProvider`      |
| Index = release → `runIndexProjectGraph` → refresh in `finally`                                                    | **PASS** | `handler-graph.ts` POST `/graph/index`                                                |
| MUST NOT use `withOpenGraphProvider` on routine routes                                                             | **PASS** | No usages under `packages/api` (symbol only in `@specd/sdk`)                          |
| MUST NOT depend on `@specd/code-graph-sqlite-electron`                                                             | **PASS** | `packages/api/package.json` dependencies                                              |

### Nuance: `getGraphProvider` vs stale reopen

- **Code:** `getGraphProvider()` returns `Promise.resolve(state.graph.provider)` — **no** stale detection/reopen.
- **Code:** `withGraphProvider` → `withHealthyGraphProvider` retries once after `GraphProviderStaleError` via `refreshLongLivedGraphProvider`.
- **Spec (`api:composition-create-api-context`):** states `getGraphProvider` returns the long-lived provider “**(reopening on `GraphProviderStaleError` when needed)**”.
- **Assessment:** **Spec drift.** Implementation intentionally splits “peek holder” (`getGraphProvider`) from “healthy accessor” (`withGraphProvider`). Handlers correctly use the healthy path. Spec (and several verify scenarios naming only `getGraphProvider`) should be updated to describe this split, not the reverse.

---

## 1. `api:composition-create-api-server`

### Requirements Summary

| Requirement                                                                         | Verdict                             |
| ----------------------------------------------------------------------------------- | ----------------------------------- |
| Factory accepts `{ projectRoot, host, port, auth, authRegistry?, uiDistPath? }`     | **Implemented**                     |
| Auth from `specd.yaml` `api.auth` (+ CLI override); reject non-`disabled`           | **Implemented**                     |
| One `createSdkContext` per process; per-request via `createApiContext`              | **Implemented**                     |
| Nested `kernel: { logRing, logFormatter: createLogFormatter({ colorize: false }) }` | **Implemented**                     |
| Open one long-lived provider at bootstrap; close on `ApiServer.close()`             | **Implemented**                     |
| Routes under `/v1`                                                                  | **Implemented**                     |
| Health/project expose `auth: { type }` without secrets                              | **Implemented** (project presenter) |
| Import policy: `@specd/sdk`, not `@specd/core` / `@specd/code-graph` directly       | **Implemented**                     |

### Implementation Status

- Bootstrap opens provider once and retains it on `ApiServerState.graph`.
- `close()` closes the provider then Fastify.
- Kernel/log nesting matches the nested-options requirement.
- Signal handlers in `listen()` call `app.close()` only (not `ApiServer.close()`), so SIGINT/SIGTERM may skip explicit provider close before process exit. Low practical risk on process death; still a lifecycle gap vs the `ApiServer.close()` contract if signals are the only shutdown path.

### Discrepancies

1. **Low — signal shutdown vs `ApiServer.close()`**
   - **Spec:** `ApiServer.close()` MUST close the long-lived provider.
   - **Code:** `listen()` registers SIGINT/SIGTERM → `void app.close()` without closing `state.graph.provider`.
   - **Possible readings:** (a) implementation incomplete for signal shutdown; (b) process exit makes it moot and only programmatic `close()` is in contract. Prefer wiring signals to `close()` for clarity.

2. No material conflict with `code-graph:composition` long-lived host contract (create → open → reuse → close/replace).

### Test Coverage

- Indirect coverage via shared `api-test-server.ts` (`createApiServer` + teardown `server.close()`).
- `static-ui.spec.ts` covers optional `uiDistPath`.
- `project.spec.ts` / health-related suites cover auth echo (out of this file’s primary focus).
- **No dedicated unit test** asserting single open at bootstrap or provider close on `ApiServer.close()`.

### Missing Tests

- Explicit assertion that bootstrap leaves exactly one opened provider reused across graph requests.
- Explicit assertion that `ApiServer.close()` closes the held provider (spy/mock).
- Signal-path close behavior (optional).

### Spec Dependency Chain

`default:_global/architecture`, `default:_global/conventions`, `sdk:host-context`, `sdk:composition`, `api:auth-adapter-registry`, `api:middleware-auth`, `core:kernel`, `code-graph:composition` — no contradictions found with the implemented long-lived host pattern.

### Summary counts — `api:composition-create-api-server`

| Metric               | Count                  |
| -------------------- | ---------------------- |
| Requirements checked | 6 (+ constraints)      |
| Fully compliant      | 5                      |
| Partial / nuance     | 1 (signal close path)  |
| Spec drift           | 0                      |
| Implementation bugs  | 0–1 (signal path only) |
| Test gaps            | 2                      |

---

## 2. `api:composition-graph-provider`

### Requirements Summary

| Requirement                                                                                                                | Verdict                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider from `SdkHostContext.createGraphProvider` bound to served `SpecdConfig`                                           | **Implemented**                                                                       |
| Open once, reuse, reopen/replace on stale, close on shutdown                                                               | **Implemented** (`long-lived-graph.ts` + server)                                      |
| Indexing via `runIndexProjectGraph` (CLI-aligned assembly)                                                                 | **Implemented** (handler + SDK)                                                       |
| Stale/freshness observable via status                                                                                      | **Implemented** (`createGetGraphHealth` + `toGraphStatusDto`)                         |
| Opened provider via long-lived accessor; no direct `createCodeGraphProvider`; no `withOpenGraphProvider` on routine routes | **Implemented**                                                                       |
| Refresh long-lived provider after index; stale → close/reopen (+ optional one retry)                                       | **Implemented** (`refresh` in index `finally`; `withHealthyGraphProvider` retry once) |

### Implementation Status

- Factory path: `createSdkContext` → `createGraphProvider` → `openLongLivedGraphProvider`.
- Stale recovery centralized in `withHealthyGraphProvider`.
- Index refresh: host releases before short-lived index orchestration, then `refreshGraphProvider()` in `finally`.
- Dead/unused re-export file `packages/api/src/composition/graph-provider.ts` exports `createCodeGraphProvider` from `@specd/sdk` but has **zero** importers — not a handler violation, but noise relative to “centralized provider creation” narrative.

### Discrepancies

1. **Low — unused `graph-provider.ts` re-export**  
   Does not violate “MUST NOT import `createCodeGraphProvider` from `@specd/code-graph`” (re-export is from SDK). Prefer delete or document; handlers correctly avoid it.

2. **Wording vs handlers:** verify scenarios say handlers call `getGraphProvider()`; production handlers call `withGraphProvider()` (healthier equivalent). Treat as **spec/verify drift**, not an implementation defect.

### Test Coverage

- Integration: `GET /v1/graph/status`, search/impact/hotspots, `POST /v1/graph/index` in `graph.spec.ts`.
- Presenter health mapping: `presenter-graph-health.spec.ts`.
- **No unit tests** for `withHealthyGraphProvider` stale retry or `refreshLongLivedGraphProvider` after index.

### Missing Tests

- Inject `GraphProviderStaleError` once → assert reopen + single retry success.
- After `POST /graph/index`, assert holder provider identity changed (or `open` called again) before next read.
- Status `stale: true/false` fixtures against known mtimes (verify scenarios partially uncovered).

### Spec Dependency Chain

`sdk:run-index-project-graph`, `sdk:host-context`, `code-graph:composition` — aligned with long-lived host + project-level index orchestration.

### Summary counts — `api:composition-graph-provider`

| Metric                    | Count |
| ------------------------- | ----- |
| Requirements checked      | 5     |
| Fully compliant           | 5     |
| Spec/verify wording drift | 1     |
| Implementation bugs       | 0     |
| Test gaps                 | 3     |

---

## 3. `api:composition-create-api-context`

### Requirements Summary

| Requirement                                                                                                    | Verdict                                            |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Context exposes `kernel`, `actor`, `createGraphProvider`, `getGraphProvider`, `config`, `authType`, `apiActor` | **Implemented** (plus extras)                      |
| `ApiContext` / `ApiServerState` extend `SdkHostContext`                                                        | **Implemented**                                    |
| `getGraphProvider` returns long-lived opened provider **and** reopens on stale when needed                     | **Partial** — returns holder; **does not** reopen  |
| `createGraphProvider` delegates to process SDK factory                                                         | **Implemented**                                    |
| Handlers obtain opened provider via `getGraphProvider()` (or equivalent) not open/close per request            | **Implemented** via equivalent `withGraphProvider` |

### Implementation Status

```ts
getGraphProvider() {
  return Promise.resolve(state.graph.provider)
}
withGraphProvider(run) {
  return withHealthyGraphProvider(state.createGraphProvider, state.graph, run)
}
```

Extras vs MUST list (additive, compliant): `withGraphProvider`, `releaseGraphProviderForIndex`, `refreshGraphProvider`.

`getGraphProvider` is currently **unused** by any handler (only defined). All graph routes use `withGraphProvider`.

### Discrepancies

1. **Medium — `getGraphProvider` reopen claim (spec drift preferred)**
   - **Spec text:** reopen on `GraphProviderStaleError` when needed.
   - **Code:** no reopen.
   - **Interpretation A (recommended):** Spec wrong — reopen belongs on `withGraphProvider` / `withHealthyGraphProvider`. Update spec/verify.
   - **Interpretation B:** Code wrong — `getGraphProvider` should refresh-on-stale. That would blur peek vs healthy accessor and is **not** what handlers use today.

2. **Low — verify scenarios name only `getGraphProvider`**  
   Should mention `withGraphProvider` as the routine healthy accessor used by handlers.

### Test Coverage

- No dedicated `create-api-context` / long-lived unit tests.
- Behavior covered only indirectly through HTTP graph suite.

### Missing Tests

- Unit: `getGraphProvider` returns same instance as holder without refresh.
- Unit: `withGraphProvider` refreshes once on `GraphProviderStaleError`.
- Unit: `releaseGraphProviderForIndex` + `refreshGraphProvider` sequencing.

### Spec Dependency Chain

`sdk:host-context`, `code-graph:composition` — host long-lived lifecycle matches code; only the `getGraphProvider` reopen sentence conflicts.

### Summary counts — `api:composition-create-api-context`

| Metric                 | Count                                |
| ---------------------- | ------------------------------------ |
| Requirements checked   | 2 (+ constraints)                    |
| Fully compliant        | 1                                    |
| Partial / discrepancy  | 1 (`getGraphProvider` stale wording) |
| Spec drift (preferred) | 1                                    |
| Implementation bugs    | 0 (if split intentional)             |
| Test gaps              | 3                                    |

---

## 4. `api:handler-graph`

### Requirements Summary

| Requirement                                                                                                                                                           | Verdict                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Implements routes under `/v1` per `api:routes-graph`                                                                                                                  | **Implemented** (status, index, search, impact, hotspots, specs/\*, changes/:name)     |
| Delegate: long-lived provider for reads; `runIndexProjectGraph` for index; no direct `createCodeGraphProvider`; no per-request open/close; no `withOpenGraphProvider` | **Implemented** (via `withGraphProvider`, not bare `getGraphProvider`)                 |
| Presenters + DTO wire shapes                                                                                                                                          | **Implemented** (`presenter-graph.ts`)                                                 |
| Failures → problem+json                                                                                                                                               | **Implemented** (`apiHandler` + server error handler); covered by validation/404 tests |
| Index uses CLI-aligned SDK assembly                                                                                                                                   | **Implemented**                                                                        |
| SDK delivery imports only                                                                                                                                             | **Implemented** (`@specd/sdk` only)                                                    |

### Implementation Status

- Reads: `ctx.withGraphProvider(...)`.
- Index:
  ```ts
  await ctx.releaseGraphProviderForIndex()
  try {
    const result = await runIndexProjectGraph(ctx, ...)
    return toGraphIndexResultDto(result)
  } finally {
    await ctx.refreshGraphProvider()
  }
  ```
- Change-scoped view: loads change via `ctx.kernel.changes.repo.get`, then coverage via provider — no local domain reimplementation of lifecycle rules.
- Spec impact: uses `provider.analyzeSpecImpact` (CLI-aligned capability).

### Discrepancies

1. **Low/Medium — Spec says invoke `getGraphProvider()`; code uses `withGraphProvider()`**
   - **Focus model / `code-graph:composition`:** healthy long-lived accessor with stale replace is correct.
   - **Spec/verify wording:** lagging; should say `withGraphProvider` (or “`getGraphProvider` / healthy equivalent”).
   - **Not** an implementation regression relative to the long-lived host intent.

2. No use of `@specd/code-graph-sqlite-electron` — compliant.

### Test Coverage (`packages/api/test/graph.spec.ts`)

| #   | Scenario                                       | Result (this run) |
| --- | ---------------------------------------------- | ----------------- |
| 1   | GET `/graph/status`                            | pass              |
| 2   | GET `/graph/search` missing `q` → 400          | pass              |
| 3   | GET `/graph/search?q=…`                        | pass              |
| 4   | GET `/graph/impact` missing selector → 400     | pass              |
| 5   | GET `/graph/impact` invalid direction → 400    | pass              |
| 6   | GET `/graph/impact?symbol=`                    | pass              |
| 7   | GET `/graph/impact?spec=`                      | pass              |
| 8   | GET `/graph/hotspots`                          | pass              |
| 9   | POST `/graph/index` `{ force: true }`          | pass (~43s)       |
| 10  | POST `/graph/index` unknown `workspaces` → 400 | pass              |
| 11  | GET `/graph/specs/:ws/*` coverage              | pass              |
| 12  | GET `/graph/specs/...` unknown → 404           | pass              |
| 13  | GET `/graph/changes/:name`                     | pass              |

**Totals: 13 passed / 13.** Note: index test is heavy and can fail under DB lock when another process holds the graph store.

### Missing Tests

- Undeclared HTTP verb → 405 (verify scenario).
- Explicit assertion handlers never call `withOpenGraphProvider` / never open per request (structural/unit).
- Stale-provider recovery path through a graph route.
- Unknown change name → 404 before presenter (partially pattern-matched by specs 404; change-specific may be thin if no fixture).

### Spec Dependency Chain

`sdk:composition`, `sdk:run-index-project-graph`, `api:routes-graph`, `api:composition-graph-provider`, `code-graph:composition` — handler behavior matches composition specs’ long-lived intent; only accessor naming lags.

### Summary counts — `api:handler-graph`

| Metric                    | Count                                         |
| ------------------------- | --------------------------------------------- |
| Requirements checked      | 6                                             |
| Fully compliant (intent)  | 6                                             |
| Spec wording drift        | 1 (`getGraphProvider` vs `withGraphProvider`) |
| Implementation bugs       | 0                                             |
| Integration tests passing | 13/13                                         |
| Test gaps                 | 3                                             |

---

## Batch roll-up

### Overall verdict

**Long-lived graph host model is correctly implemented in `@specd/api`.** Bootstrap open, request-scoped healthy reads via `withGraphProvider`, index release/refresh, shutdown close, SDK-only imports, and no sqlite-electron / `withOpenGraphProvider` on routine routes all check out. Primary issues are **spec/verify wording** around `getGraphProvider` (overclaims stale reopen; handlers correctly use `withGraphProvider`) and **missing unit tests** for stale refresh / close lifecycle.

### Aggregate counts

| Metric                                         | Count                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Specs audited                                  | 4                                                                                                |
| Hard implementation defects (long-lived model) | **0**                                                                                            |
| Spec drift / wording mismatches                | **2–3** (getGraphProvider reopen; get vs with in handler/verify text; optional unused re-export) |
| Minor lifecycle nits                           | **1** (SIGINT → `app.close` only)                                                                |
| Dedicated lifecycle unit-test gaps             | **several** (stale retry, refresh-after-index, close)                                            |
| `graph.spec.ts`                                | **13/13 pass** (this run)                                                                        |

### Recommended follow-ups (for humans / change authors — not applied here)

1. Amend `api:composition-create-api-context` so `getGraphProvider` is documented as a non-refreshing holder peek; stale reopen lives on `withGraphProvider`.
2. Amend `api:handler-graph` / `api:composition-graph-provider` verify scenarios to name `withGraphProvider` as the routine read accessor.
3. Add unit tests for `long-lived-graph.ts` (stale once-retry, refresh after close).
4. Optionally route signal handlers through `ApiServer.close()` and remove unused `graph-provider.ts` re-export.
