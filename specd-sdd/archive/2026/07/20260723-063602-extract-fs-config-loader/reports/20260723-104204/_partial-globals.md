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
