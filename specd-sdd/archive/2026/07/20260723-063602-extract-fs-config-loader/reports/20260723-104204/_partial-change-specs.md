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
