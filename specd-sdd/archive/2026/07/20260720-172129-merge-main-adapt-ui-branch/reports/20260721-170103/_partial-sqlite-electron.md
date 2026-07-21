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
