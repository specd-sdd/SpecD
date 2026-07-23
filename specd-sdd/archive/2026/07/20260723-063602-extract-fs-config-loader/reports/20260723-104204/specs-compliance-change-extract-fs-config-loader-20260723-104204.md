# Spec Compliance Report — extract-fs-config-loader

**Mode:** change  
**Change:** extract-fs-config-loader  
**Timestamp:** 20260723-104204  
**State at audit:** verifying

## Executive Summary

Pure file-layout refactor. Implementation **conforms** to change design and hexagonal constraints.  
**0 critical** findings for this extract. Remaining items are **pre-existing** cross-spec conflicts / soft test gaps.

| Metric                                 | Count |
| -------------------------------------- | ----: |
| Change specs audited                   |     2 |
| Global/dependency specs audited        |     4 |
| Requirements checked (combined)        |    52 |
| Implementation defects (this refactor) |     0 |
| Major pre-existing spec↔spec conflicts |     2 |
| Minor / soft gaps                      |     4 |

**Verdict:** Safe to proceed with verification completion for this change. Spec drift items (`schemasPath` text, `metadataPath` ownership, `createConfigLoader` naming) are out of this change’s no-op scope.

## Aggregated Findings

### Critical

None.

### Major (pre-existing, not introduced by extract)

1. **schemasPath default text** — `core:config-loader` says `<configDir>/specd/schemas`; `core:config` + code use `.specd/schemas`.
2. **metadataPath auto-derivation ownership** — `core:config` attributes to loader; `core:config-loader` + code attribute to kernel composition.

### Minor / soft

1. Architecture/composition still say `createConfigLoader` vs implemented `createDefaultConfigLoader`.
2. Composition prose says `ConfigLoader` “interface” vs abstract class.
3. Optional missing mirrored unit files for `config-schema` / `config-cascade` (covered via adapter suite).
4. Thin composition-factory / NullVcsAdapter dedicated tests (pre-existing).

## Detailed Findings

# Partial: change specs (core:config-loader, core:config)

Change: `extract-fs-config-loader` (state: verifying). Both specs have **no-op deltas** (file-layout refactor only). Audit uses merged `spec-preview` content plus graph-first inspection of the extracted modules.

## Requirements Summary

### core:config-loader (behavioral contract — no-op delta)

| #   | Requirement                               | Focus for this change                                                                                                                               |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Factory signature / return type           | `createDefaultConfigLoader(options)` → `ConfigLoader`; options `{ startDir }` \| `{ configPath }`; VCS root resolved in composition, not in options |
| 2   | Path probe                                | `resolvePath()` discovery vs forced semantics; never throws                                                                                         |
| 3   | Discovery mode                            | Walk from `startDir`, VCS-bounded candidate chain, extends activation rules                                                                         |
| 4   | Forced mode                               | Closed `extends` chain from explicit path; missing files → `ConfigValidationError`                                                                  |
| 5   | Layer merge semantics                     | Deep merge, array append, `remove.*`, standalone reset                                                                                              |
| 6   | Native `.env` / `.env.local`              | Missing files OK; local wins                                                                                                                        |
| 7   | YAML + Zod validation                     | Env overrides before validate; structural errors before path resolution                                                                             |
| 8   | `workspaces.default` required             | `ConfigValidationError` if absent                                                                                                                   |
| 9   | Path resolution                           | Relative paths vs config dir; `projectRoot` = config parent; explicit `metadataPath` only                                                           |
| 10  | Storage containment                       | Paths must stay within `rootPath` when non-null                                                                                                     |
| 11  | `isExternal` inference                    | Compare `specsPath` to `rootPath`; false when `rootPath` null                                                                                       |
| 12  | Workspace field defaults                  | ownership / codeRoot / schemasPath                                                                                                                  |
| 13  | contextInclude/Exclude pattern validation | Project + workspace                                                                                                                                 |
| 14  | Workflow / context / plugins mapping      | schemaPlugins, schemaOverrides, context entries, agents by `name`                                                                                   |
| 15  | Approvals default false                   | Absent/partial → false defaults                                                                                                                     |
| 16  | All errors `ConfigValidationError`        | Including cascade failures                                                                                                                          |

### core:config (overlapping config semantics — no-op delta)

| #   | Requirement                                         | Overlap with loader                                                                  |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 17  | Config location / discovery / forced `--config`     | Same discovery & cascade model as loader                                             |
| 18  | Environment variable overrides                      | SPECD\_\* precedence over YAML                                                       |
| 19  | Local override / extends / remove                   | Cascade identity model                                                               |
| 20  | Workspaces (defaults, schemas, codeRoot, ownership) | Loader mapping target                                                                |
| 21  | `metadataPath` absent behavior                      | **Conflicts with config-loader** on ownership of auto-derivation (see Discrepancies) |

### Refactor / hexagonal goals (from design + change context)

| #   | Requirement                                                         |
| --- | ------------------------------------------------------------------- |
| 22  | Zod schemas live in `application/ports/config-schema.ts`            |
| 23  | Cascade helpers live in `infrastructure/fs/config-cascade.ts`       |
| 24  | `FsConfigLoader` remains in `infrastructure/fs/config-loader.ts`    |
| 25  | Composition factory stays in composition and returns `ConfigLoader` |
| 26  | `FsConfigLoader` MUST NOT be exported from `@specd/core` public API |
| 27  | `config-schema` has no `fs` / infrastructure imports                |
| 28  | Cascade remains infrastructure (may import ports + node I/O)        |

## Implementation Status

### File layout (matches design)

| Module                                       | Location                                                | Role                                                                  |
| -------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Zod + pattern helpers + `deepMergeRawConfig` | `packages/core/src/application/ports/config-schema.ts`  | Pure validation / merge utilities                                     |
| Cascade discovery / extends / merge / env    | `packages/core/src/infrastructure/fs/config-cascade.ts` | FS-bound cascade                                                      |
| `FsConfigLoader`                             | `packages/core/src/infrastructure/fs/config-loader.ts`  | Port adapter: cascade → validate → build `SpecdConfig`                |
| `createDefaultConfigLoader`                  | `packages/core/src/composition/config-loader.ts`        | VCS probe → `rootPath` → `new FsConfigLoader` typed as `ConfigLoader` |

### Factory & public API — implemented

- `createDefaultConfigLoader(options): Promise<ConfigLoader>` constructs `FsConfigLoader` but returns the port type.
- `public.ts` exports `createDefaultConfigLoader` + `FsConfigLoaderOptions` only.
- `composition/index.ts` re-exports the same pair; **does not** export `FsConfigLoader`.
- `./ports` exports `config-schema` helpers/schemas (port-adjacent validation surface), not the FS adapter.
- Graph + source: `FsConfigLoader` is only referenced from composition (and tests constructing infrastructure directly).

### Discovery / forced / resolvePath / cascade / errors — implemented

- Discovery: `findCandidateDirectory` + `discoverCandidateFiles` + `resolveActiveChain`.
- Forced: `resolveForcedCascade(configPath)`.
- `resolvePath()`: forced → `path.resolve`; discovery → chain root or `null`, catch-all never throws.
- Merge / removals: `mergeActiveLayers` / `applyRemovals` in cascade module.
- Validation failures and missing configs throw `ConfigValidationError`.
- Env: `tryLoadEnvFiles` loads `.env.local` then `.env` via `process.loadEnvFile`; `applyEnvOverrides` applies SPECD\_\* after merge, before Zod.

### Hexagonal boundaries — implemented

- `config-schema.ts` imports only `zod` and `ConfigValidationError` (domain). **No** `node:fs`, **no** infrastructure.
- `config-cascade.ts` imports `node:fs/promises`, `yaml`, local `is-enoent`, domain error, and ports (`config-schema`) — correct outer→inner direction.
- `config-loader.ts` (infra) imports ports + cascade; composition is the only layer that constructs the adapter.

### Composition wiring — implemented

```typescript
// composition/config-loader.ts
const vcsAdapter = await createVcsAdapter(probeDir)
const rootPath = NullVcsAdapter ? null : try rootDir()
return new FsConfigLoader(rootPath, options) // typed ConfigLoader
```

Aligns with `core:vcs-adapter-port` (root boundary via adapter) and config-loader’s rule that the returned loader depends only on resolved `rootPath` data.

### core:config structure / mapping — implemented (behavioral)

Loader still maps workspaces, storage containment, `isExternal`, ownership/codeRoot/schemas defaults, approvals, context patterns, plugins, schemaOverrides — via `_buildConfig` after Zod parse. Behavior preserved under extraction (tests green).

## Discrepancies (if any — severity: critical/major/minor)

### 1. major — default `schemasPath` text conflict (spec vs spec / code)

- **core:config-loader** states default schemas path `<configDir>/specd/schemas` (and verify scenarios use `/repo/specd/schemas`).
- **core:config** states default `.specd/schemas`.
- **Implementation + tests** use `.specd/schemas` (`specdPath` default `.specd` + `schemas`).

**Interpretation A (code/core:config):** Correct default is `.specd/schemas`; config-loader wording/verify is stale.
**Interpretation B (config-loader literal):** Default should be `specd/schemas` (no leading dot); code and core:config are wrong.

**Verdict for this refactor:** Pre-existing; no-op delta did not introduce or fix it. Code matches core:config and tests. Prefer updating config-loader spec/verify to `.specd/schemas` in a follow-up (not this change’s scope).

### 2. major — absent `metadataPath` ownership conflict (spec vs spec)

- **core:config:** loader auto-derives `metadataPath` from VCS root / specs-parent fallback when absent.
- **core:config-loader:** auto-derivation is **kernel composition** (`kernel-internals.ts`); loader only resolves **explicit** `metadataPath`.
- **Implementation:** follows config-loader (no auto-derive in `load()`).

**Interpretation A (config-loader + code):** Kernel owns derivation; core:config overstates loader responsibility.
**Interpretation B (core:config):** Loader should still derive; current code under-delivers that sentence.

**Verdict:** Pre-existing cross-spec conflict. Refactor correctly preserved loader-side behavior. Specs remain inconsistent with each other.

### 3. minor — dependency specs stale on factory naming / port shape

- **core:composition** / **default:\_global/architecture** still say `createConfigLoader()` and describe `ConfigLoader` as an interface with only `load()`.
- **core:config-loader** + code: `createDefaultConfigLoader`, abstract class with `load()` + `resolvePath()`.

**Interpretation A:** Composition/architecture docs are outdated; config-loader is source of truth.
**Interpretation B:** Public naming should be `createConfigLoader`; current name drifts from architecture.

**Verdict:** Pre-existing documentation drift; not introduced by extraction. Wiring still matches the “composition returns port, not concrete adapter” rule.

### 4. minor — no composition-factory / public-surface tests

Tests construct `FsConfigLoader` directly via a test helper; there is **no** test asserting `createDefaultConfigLoader` return type / public barrel does not export `FsConfigLoader`.

Not a behavioral gap for the refactor (implementation is correct), but the change’s key packaging constraint is only verified by static inspection.

### No critical discrepancies found for the refactor goals

Factory return type, non-export of `FsConfigLoader`, module split, and hexagonal import direction all match design + change context.

## Test Coverage

Source: `packages/core/test/infrastructure/fs/config-loader.spec.ts` (reported **124 passed**).

Coverage mapped to requirements (integration via `FsConfigLoader`):

| Area                                             | Covered? | Notes                                                   |
| ------------------------------------------------ | -------- | ------------------------------------------------------- |
| Discovery / CWD-only outside VCS                 | Yes      | Dedicated describes                                     |
| Forced mode closed chain                         | Yes      | `Forced mode cascade`                                   |
| Cascade extends / merge / remove                 | Yes      | Multiple cascade describes                              |
| `resolvePath()`                                  | Yes      | Discovery + forced + never-throw                        |
| Storage containment                              | Yes      | Outside-root throws                                     |
| `isExternal`                                     | Yes      | Inside / outside / null-root cases                      |
| Pattern validation                               | Yes      | Valid + invalid positions/qualifiers                    |
| Workspace defaults / codeRoot required           | Yes      | Including schemas default `.specd/schemas`              |
| Env `.env` / `.env.local`                        | Yes      | Privacy override scenarios                              |
| Approvals when declared                          | Partial  | Parses values; absent-section default not explicit      |
| `ConfigValidationError`                          | Yes      | Invalid YAML/structure/extends/etc.                     |
| Extracted modules in isolation                   | No       | By design: behavior preserved via existing loader suite |
| `createDefaultConfigLoader` / public export rule | No       | Static audit only                                       |

Design testing strategy (“existing scenarios must pass without behavior changes”) is satisfied.

## Missing Tests

1. **Approvals section entirely absent** → `{ spec: false, signoff: false }` (verify scenario exists; only partial/present cases tested).
2. **`createDefaultConfigLoader` composition path** — returns `ConfigLoader`, resolves `rootPath` via VCS, does not require callers to import `FsConfigLoader`.
3. **Public API regression** — `@specd/core` / `public.ts` must not export `FsConfigLoader` (cheap export-surface assertion).
4. _(Optional)_ Unit tests for `config-cascade` / `config-schema` helpers in isolation — not required for this no-op refactor if loader suite remains the contract suite.

## Spec Dependency Consistency

Checked against: `core:composition`, `default:_global/architecture`, `core:vcs-adapter-port`.

| Dependency                                                                                           | Consistency with change specs / code                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **architecture** — application must not import infrastructure; concrete adapters not on public `"."` | **Consistent.** `config-schema` is application-side; `FsConfigLoader` not on `public.ts`.                                                |
| **architecture** — YAML validated at infrastructure boundary with typed errors                       | **Consistent.** Zod in ports helpers; parse/throw still at loader/cascade FS boundary.                                                   |
| **architecture / composition** — `createConfigLoader()` naming & single-method interface             | **Inconsistent (minor, pre-existing)** with `createDefaultConfigLoader` + `resolvePath` (see discrepancy #3).                            |
| **composition** — config I/O factories return ports; hosts must not construct FS adapters            | **Consistent** for public surface; tests still construct `FsConfigLoader` (allowed).                                                     |
| **vcs-adapter-port** — root via `rootDir()`; NullVcs throws                                          | **Consistent.** Composition normalizes NullVcs / throw → `rootPath = null` before constructing loader.                                   |
| **core:config ↔ core:config-loader**                                                                 | **Inconsistent (major, pre-existing)** on `schemasPath` default text and `metadataPath` auto-derivation ownership (discrepancies #1–#2). |

No-op deltas correctly avoid “fixing” these conflicts inside this change; they remain latent debt.

## Summary

- requirements checked: **28**
- implemented: **26** (all refactor + loader behavioral requirements aligned with code; 2 are cross-spec conflicts where code picks one side)
- discrepancies: **4** (0 critical, 2 major pre-existing spec↔spec, 2 minor)
- missing tests: **3** (plus 1 optional isolation suite)

**Overall:** The extract refactor meets its design goals: schemas in ports, cascade in infrastructure, `FsConfigLoader` private to infrastructure/composition, factory returns `ConfigLoader`, hexagonal imports clean, existing loader tests green. Remaining issues are pre-existing spec inconsistencies (`schemasPath` path text; `metadataPath` ownership) and thin gaps around composition/public-API test coverage — not blockers for verifying the file-layout extract itself.

---

# Partial: globals & composition

**Change:** `extract-fs-config-loader`  
**Scope:** REFACTOR conformance to `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `core:composition`  
**Inspected files:**

- `packages/core/src/application/ports/config-schema.ts` (NEW)
- `packages/core/src/infrastructure/fs/config-cascade.ts` (NEW)
- `packages/core/src/infrastructure/fs/config-loader.ts` (MODIFIED)
- `packages/core/src/composition/config-loader.ts`
- `packages/core/src/application/ports/index.ts`
- `packages/core/src/ports.ts`
- `packages/core/src/public.ts`
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`

**Method:** `project status --graph` (fresh), `specs show` for the four target specs, `graph search` / `graph impact` for `FsConfigLoader` / `createDefaultConfigLoader` / `config-schema`, plus Read of listed sources.

---

## Requirements Summary

### `default:_global/architecture` (relevant to this refactor)

| ID  | Requirement                                                         | Relevance |
| --- | ------------------------------------------------------------------- | --------- |
| A1  | Layered structure; inner layers never import outer                  | High      |
| A2  | Application uses ports only; never imports infrastructure           | High      |
| A3  | Only `composition/` may import `infrastructure/`                    | High      |
| A4  | Concrete adapter classes never on public `"."` / `"./ports"`        | High      |
| A5  | Composition exposes config loader factory returning `ConfigLoader`  | High      |
| A6  | YAML validated at infrastructure boundary before domain/app objects | High      |
| A7  | Manual DI; curated public barrels                                   | Medium    |

### `default:_global/conventions` (relevant)

| ID  | Requirement                                          | Relevance |
| --- | ---------------------------------------------------- | --------- |
| C1  | Named exports only (no default)                      | High      |
| C2  | ESM + relative imports with `.js` extensions         | High      |
| C3  | kebab-case source filenames                          | High      |
| C4  | Explicit return types on exported functions          | High      |
| C5  | No `any`                                             | Medium    |
| C6  | Tests in `test/` mirroring `src/`, `.spec.ts` suffix | High      |

### `default:_global/testing` (relevant)

| ID  | Requirement                                                              | Relevance   |
| --- | ------------------------------------------------------------------------ | ----------- |
| T1  | Vitest; tests under `test/` mirroring `src/`                             | High        |
| T2  | Infrastructure adapters: integration tests with real temp dirs + cleanup | High        |
| T3  | No snapshot tests                                                        | High        |
| T4  | Test descriptions prefer `given/when/then`                               | Low (style) |

### `core:composition` (relevant)

| ID  | Requirement                                                                      | Relevance |
| --- | -------------------------------------------------------------------------------- | --------- |
| P1  | Only composition imports infrastructure                                          | High      |
| P2  | `createDefaultConfigLoader()` returns `ConfigLoader` port (not wrapped use-case) | High      |
| P3  | Concrete adapters not on `"."` / `"./ports"` / `"./extensions"`                  | High      |
| P4  | Port contracts on `./ports`; factories on `"."`                                  | High      |
| P5  | Factory derives `rootPath` via `createVcsAdapter()`; NullVcsAdapter → `null`     | High      |
| P6  | `ConfigLoader` port in `application/ports/`                                      | High      |

---

## Implementation Status

### Layer boundaries — **CONFORMANT**

- `application/ports/config-schema.ts` imports only `zod` and `domain/errors` — **no** `infrastructure`, **no** `node:fs` / I/O.
- `application/` has **zero** imports from `infrastructure/` (repo-wide check under `packages/core/src/application`).
- `FsConfigLoader` is constructed only from:
  - `packages/core/src/composition/config-loader.ts` (allowed)
  - `packages/core/test/infrastructure/fs/config-loader.spec.ts` (tests)
- Infrastructure helpers stay in `infrastructure/fs/` (`config-loader.ts`, `config-cascade.ts`) and depend inward on application ports / domain — correct hexagonal direction.
- Zod validation of merged YAML still executes inside `FsConfigLoader._buildConfig` via `SpecdYamlZodSchema.safeParse(...)` (infrastructure boundary), even though schema definitions live in ports as shared contracts.

### Naming / ESM / exports — **CONFORMANT**

- New/modified modules: kebab-case (`config-schema.ts`, `config-cascade.ts`, `config-loader.ts`).
- Named exports only; no `export default` in changed files.
- All relative imports use explicit `.js` extensions.
- Exported functions/methods in new files carry explicit return types (`void`, `Promise<...>`, `Record<...>`, etc.).
- No `: any` type usage in changed files (only the word “any” in comments).

### Public package surface — **CONFORMANT** (for this change)

| Surface                  | `FsConfigLoader` class                               | `createDefaultConfigLoader`               | `config-schema`                                           | `Fs*` adapters                                                                        |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `"."` (`public.ts`)      | Not exported                                         | Exported; returns `Promise<ConfigLoader>` | Not re-exported                                           | Options type `FsConfigLoaderOptions` only (same pattern as `FsSpecRepositoryOptions`) |
| `"./ports"` (`ports.ts`) | Not exported                                         | N/A                                       | `export *` from `config-schema.js` (contract/schema — OK) | No `Fs*` symbols                                                                      |
| Barrel tests             | `expect('FsConfigLoader' in corePublic).toBe(false)` | present                                   | —                                                         | —                                                                                     |

`createDefaultConfigLoader` wires `new FsConfigLoader(rootPath, options)` and types the return as `ConfigLoader` — does not expose the concrete class on the public API.

### Composition factory VCS wiring — **CONFORMANT**

```ts
// composition/config-loader.ts
const vcsAdapter = await createVcsAdapter(probeDir)
const rootPath =
  vcsAdapter instanceof NullVcsAdapter
    ? null
    : (() => {
        try {
          return vcsAdapter.rootDir()
        } catch {
          return null
        }
      })()
return new FsConfigLoader(rootPath, options)
```

Matches composition verify scenarios: root data only (not retained adapter); NullVcsAdapter / `rootDir()` throw → `rootPath = null`.

### Testing layout — **MOSTLY CONFORMANT**

- Adapter integration tests live at `test/infrastructure/fs/config-loader.spec.ts` (mirrors `src/infrastructure/fs/config-loader.ts`).
- Uses Vitest, `os.tmpdir()` + `mkdtemp`, `afterEach` recursive `rm` cleanup.
- Real filesystem I/O; no snapshots.
- Direct construction of `FsConfigLoader` in tests is appropriate for infrastructure integration tests.

---

## Discrepancies

### D1 — Missing mirrored unit/integration files for newly extracted modules (soft)

**Specs:** `default:_global/conventions` (file naming / test mirror), `default:_global/testing` (test lives under `test/` matching source name)

**Observation:** New sources lack dedicated mirrors:

- No `test/application/ports/config-schema.spec.ts`
- No `test/infrastructure/fs/config-cascade.spec.ts`

Behaviour remains covered indirectly by `config-loader.spec.ts` (~124 `it(...)` cases), which matches the change design (“existing scenarios must pass”).

**Interpretation:**

- **Code OK / convention soft gap:** Extracted pure helpers and cascade logic are still exercised through the adapter integration suite; naming convention prefers per-file mirrors but does not require duplicate coverage when behaviour is already tested via the public adapter path.
- **Possible improvement:** Add focused unit tests for `validateContextPattern` / `deepMergeRawConfig` and cascade pure functions if isolation is desired later.

**Severity:** Low (missing dedicated files, not missing behaviour coverage)

### D2 — Test description style vs `given/when/then` (pre-existing)

**Spec:** `default:_global/testing` — Test naming

**Observation:** `config-loader.spec.ts` uses descriptive `it('defaults logging level...')` titles rather than `"given <state>, when <action>, then <outcome>"`. Style predates this refactor; not introduced by the extract.

**Severity:** Informational / pre-existing

### D3 — Spec naming drift: `createConfigLoader` vs `createDefaultConfigLoader` (pre-existing; not introduced by refactor)

**Specs:** `default:_global/architecture` and `core:composition` **Constraints** still say `createConfigLoader`; composition **Requirements** and `core:config-loader` / implementation use `createDefaultConfigLoader`.

**Observation:** Public barrel correctly exports `createDefaultConfigLoader`. This refactor did not rename the factory.

**Interpretation:** Spec wording inconsistency (architecture/composition constraints lag requirements/code). Implementation aligns with the more specific config-loader + composition requirement text.

**Severity:** Spec drift (out of scope to fix in this audit); **not** an implementation failure of the extract

### D4 — Composition wording: `ConfigLoader` as “interface” vs abstract class (pre-existing)

**Spec:** `core:composition` (“defined … as an interface”) vs `default:_global/architecture` (“Ports with shared construction are abstract classes”) and actual `application/ports/config-loader.ts` (`export abstract class ConfigLoader`).

**Observation:** Code matches architecture (shared `rootPath` construction). Composition prose is stale.

**Severity:** Spec drift only

---

## Test Coverage

| Concern                                                        | Covered?            | Evidence                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FsConfigLoader load/validate/resolve against real FS           | Yes                 | `test/infrastructure/fs/config-loader.spec.ts` (~124 cases), tmpdir + cleanup                                                                                                                                 |
| Cascade / extends / local overlays / env                       | Yes (via adapter)   | Same suite (extends, local variants, SPECD\_\*, removals historically covered there)                                                                                                                          |
| Zod schema / context pattern validation                        | Yes (via adapter)   | Suite includes include/exclude pattern and validation-error paths                                                                                                                                             |
| Public barrel hides `FsConfigLoader`                           | Yes                 | `packages/core/test/barrel.spec.ts`; also `packages/sdk/test/barrel.spec.ts`                                                                                                                                  |
| `createDefaultConfigLoader` returns factory on SDK surface     | Yes                 | SDK barrel + host-context mocks                                                                                                                                                                               |
| Composition NullVcsAdapter → null `rootPath` for config loader | **Weak / indirect** | Composition factory logic exists; no dedicated `test/composition/config-loader.spec.ts` exercising NullVcsAdapter → `FsConfigLoader` construction (pre-existing gap relative to composition verify scenarios) |
| Isolated `config-schema` / `config-cascade` units              | No dedicated files  | Covered only through adapter integration                                                                                                                                                                      |

---

## Missing Tests

1. **Optional:** `test/application/ports/config-schema.spec.ts` — direct unit coverage for `validateContextPattern`, `validateContextPatterns`, `deepMergeRawConfig`, Zod schema edge cases.
2. **Optional:** `test/infrastructure/fs/config-cascade.spec.ts` — discovery sort keys, active-chain / forced-chain resolution, removals without full loader.
3. **Pre-existing gap vs composition verify:** `test/composition/config-loader.spec.ts` scenarios for:
   - `createDefaultConfigLoader` derives `rootPath` from `createVcsAdapter()`
   - `NullVcsAdapter` / throwing `rootDir()` normalizes to `rootPath = null`
   - Return type is `ConfigLoader`, not a pass-through use-case

None of (1)–(3) block the architectural conformance of the extract itself; (1)–(2) are convention mirror gaps; (3) is an existing composition verification hole.

---

## Summary counts

| Metric                                                          | Count                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Specs in this batch                                             | 4 (`architecture`, `conventions`, `testing`, `composition`) |
| Requirements checked (scoped)                                   | 24                                                          |
| Conformant                                                      | 20                                                          |
| Soft / informational gaps                                       | 2 (D1 mirrored test files; D2 naming style)                 |
| Pre-existing spec drift (not code defects)                      | 2 (D3 factory name; D4 interface vs abstract class)         |
| Implementation defects vs globals/composition for this refactor | **0**                                                       |
| Missing dedicated test files (optional)                         | 2 (`config-schema`, `config-cascade`)                       |
| Missing composition factory tests (pre-existing)                | 1 suite                                                     |

**Verdict:** The extract-fs-config-loader refactor **conforms** to project-wide architecture, conventions, testing strategy, and composition constraints for layer boundaries, ESM/naming, and public/ports surfaces. No Fs\* concrete class leaks onto `"."` or `"./ports"`; `config-schema` on `./ports` is an acceptable contract export; only composition (and tests) import `FsConfigLoader`. Residual items are soft test-file mirroring and pre-existing spec naming drift, not blockers for this change.
