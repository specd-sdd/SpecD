# Proposal: 13-public-api-surface

## Motivation

`@specd/core` currently re-exports the entire `domain/`, `application/`, and `composition/` trees via `export *` in `src/index.ts`, leaking ports, adapters, and internal types to delivery hosts. That contradicts `default:_global/architecture`, which requires delivery mechanisms to import only curated composition factories and never infrastructure. Phase A3 closes this gap with explicit public barrels for `@specd/core`, `@specd/code-graph`, and `@specd/sdk`.

**Scope for this change:** define and enforce the **integrator-facing** public API. **Compile gate:** `@specd/cli` on `main` (fully on `@specd/sdk`). **Authoritative surface:** every use case mounted on `Kernel`, plus its `*Input` / `*Result` types and related domain/errors — even when CLI does not call it. Studio/API/IPC code migration deferred; **docs and generated API reference** updated now so integrators see SDK-first guidance.

## Current behaviour

- **`@specd/core`**: `src/index.ts` uses `export *` from `domain/`, `application/`, and `composition/`. Callers can import concrete adapters, port implementations, use-case classes, and repository factories from the package root.
- **`@specd/code-graph`**: `src/index.ts` lists named exports but has no separate internal entry; indexer/store internals are reachable from `"."`.
- **`@specd/sdk`**: `export * from '@specd/core'` as a transitional boundary. CLI imports **78 distinct symbols** from `@specd/sdk` with zero direct `@specd/core` / `@specd/code-graph` imports.
- **Plugins today**: `plugin-*` and `plugin-manager` import only `SpecdConfig` and `SpecdError` from `@specd/core` (not via SDK). No port usage yet.
- **Extension hooks already in core**: `KernelRegistryInput` exposes `SpecStorageFactory`, `ChangeStorageFactory`, `ArchiveStorageFactory`, `SchemaStorageFactory`. Builtin `fs` factories exist; config-driven adapter selection and npm plugin loading are **not** wired end-to-end yet.
- **Docs / public site**: `docs/core/*` tells integrators to `import from '@specd/core'`; `docs/core/use-cases.md` documents direct use-case construction. Docusaurus TypeDoc uses `packages/core/src/index.ts` (`public-docs-config.ts` → `# @specd/core API Reference`). Landing copy says "exported `@specd/core` surface".

## Proposed solution

Introduce curated public barrels with **multiple entry points** where needed.

### `@specd/core` package exports

| Entry            | Audience                                    | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"."`            | Integrators via SDK; core-only packages     | Composition bootstrap, `Kernel` / `KernelOptions`, `SpecdConfig`, **full kernel-equivalent surface** (see below): every kernel-mounted use-case type + `*Input`/`*Result` + matching `createX` factory; repository factories (`createSpecRepository`, `createChangeRepository`, `createArchiveRepository`, `createSchemaRepository`, `createSchemaRegistry`); domain entities/errors, `Logger`, `CORE_VERSION`. Export port **types** on Kernel for typing. **Not** concrete adapters (`Fs*`, `GitVcsAdapter`). |
| `"./ports"`      | Plugin authors; custom storage implementers | Port **interfaces/abstract classes** only: `Repository`, `ChangeRepository`, `SpecRepository`, `ArchiveRepository`, `SchemaRepository`, `ActorResolver`, `VcsAdapter`, `HookRunner`, `ConfigLoader`, `ConfigWriter`, `FileReader`, artifact-parser ports, logging ports, and associated `*Config` / `*Result` types — **no** `Fs*` implementations                                                                                                                                                              |
| `"./extensions"` | Future custom repository / hook plugins     | Registration contracts: `SpecStorageFactory`, `ChangeStorageFactory`, `ArchiveStorageFactory`, `SchemaStorageFactory`, `KernelRegistryInput`, `KernelRegistryView`, `KernelBuilder` / `createKernelBuilder`, `ActorProvider`, `VcsProvider`, `ExternalHookRunner`, `RegistryConflictError` — **no** builtin `FS_*_STORAGE_FACTORY` markers                                                                                                                                                                      |
| `"./internal"`   | Monorepo tests and advanced callers         | Full current `export *` barrel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Domain entities required to implement repository ports (`Change`, `Spec`, `SpecPath`, `SpecArtifact`, `ActorIdentity`, read-only change views, archive index types, etc.) export from `"."` or `"./ports"` as needed for plugin compile-time contracts.

### `@specd/code-graph`

- `"."` → curated list aligned with `code-graph:composition` **Package exports** (CLI uses 19 symbols + health/impact types in tests).
- `"./internal"` → full barrel including `InMemoryIndexSession`, store adapters, indexer internals.

### `@specd/sdk`

| Entry            | Contents                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"."`            | Explicit re-exports of `@specd/core` `"."` + `@specd/code-graph` `"."` + SDK orchestration (`openSpecdHost`, `createSdkContext`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, `runIndexProjectGraph`, `SDK_VERSION`). **No** `export *`. |
| `"./ports"`      | `export * from '@specd/core/ports'` — port interfaces/abstract classes for integrators and custom storage implementers                                                                                                                             |
| `"./extensions"` | `export * from '@specd/core/extensions'` — storage factories, kernel registry, `KernelBuilder`, hook/VCS/actor providers                                                                                                                           |

Replace transitional `export * from '@specd/core'` on `"."` with an explicit list derived from the **kernel + code-graph public contracts** (CLI imports are the compile floor, not the ceiling).

### Kernel-equivalent public surface (must export on `@specd/core` `"."`)

**Norm:** everything on `Kernel` must also be assembleable **without** `createKernel`.

For every use case on `Kernel`, export: use-case type, `*Input`/`*Result`, and `createX` from `composition/use-cases/`.

For every repository on `Kernel`, export the matching factory:

| Kernel         | Factory                                                              |
| -------------- | -------------------------------------------------------------------- |
| `changes.repo` | `createChangeRepository`                                             |
| `specs.repos`  | `createSpecRepository` (+ workspace routing helpers if public today) |
| `schemas`      | `createSchemaRegistry`, `createSchemaRepository`                     |

Repository factories take an **adapter id** (`'fs'` today). Future plugins register `*StorageFactory` on `./extensions` and resolve ids like `'db'` through the same factories (registry dispatch wired in a follow-up; signatures must allow extensible ids).

`createKernel` = recommended full bootstrap, not the only path.

Also export port **types** referenced on `Kernel` for typing (`ChangeRepository`, `SpecRepository`, `SchemaRegistry` as types only).

**Audit task:** reconcile `application/use-cases/index.ts` exports with `Kernel` interface; fix naming drift in docs (typos, stale `*Input` field names, examples that construct use cases directly instead of `createKernel` / `kernel.*`).

### CLI compile floor (subset of kernel surface)

CLI on `main` imports **78 symbols** from `@specd/sdk` — minimum bar that `"."` re-exports must satisfy. CLI tests add error types and graph health types not always referenced in `src/`.

| Consumer needs                                                         | Import from                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Core only** — plugins, `skills`, tools without graph                 | `@specd/core` (and `@specd/core/ports` or `@specd/core/extensions` when implementing or registering storage) |
| **Core + code-graph** — CLI, MCP, any host that wires kernel and graph | `@specd/sdk` (and `@specd/sdk/ports` or `@specd/sdk/extensions` when needed)                                 |
| **Graph only** (unusual; library on top of provider)                   | `@specd/code-graph`                                                                                          |

**Rule of thumb:** if you do not use code-graph, import from `@specd/core`. If you use both, import from `@specd/sdk` — do not declare `@specd/core` and `@specd/code-graph` as parallel direct dependencies when `@specd/sdk` already composes them.

Hosts (`cli`, `mcp`) MUST follow the core+graph → SDK rule. Packages that depend only on `SpecdConfig` or repository ports stay on `@specd/core`.

**Rationale (SDK subpaths):** ports and extensions are public contracts. Re-export via `@specd/sdk/ports` and `@specd/sdk/extensions` keeps single-dep ergonomics for hosts that register custom storage.

### Import policy (recommended)

### Plugin / custom repository future

Plugins implement storage by:

1. Subclassing port abstract classes from `@specd/core/ports`
2. Exposing a `*StorageFactory` from `@specd/core/extensions`
3. Registering before `createSpecRepository('db', …)` / `createChangeRepository('db', …)` or via `createKernelBuilder()` / `createKernel`

Example future path:

```ts
// plugin registers DbSpecRepository via SpecStorageFactory
createSpecRepository('db', config, options) // after registry merge
```

**Out of scope for this change:** registry dispatch inside repository factories for non-`fs` ids, `specd.yaml` `storage.*.adapter` bindings, plugin-manager npm loading. A3 exports factories and extension contracts; `'fs'` remains the only wired id until a follow-up.

Distinct from `plugin-manager:plugin-repository-port` (agent/skill plugins).

### Documentation and generated API reference

**Principle:** hosts import **only** from `@specd/sdk`. `docs/sdk/` is the sole integrator entry. `docs/core/` and `docs/code-graph/` stay as **package reference** (plugins, semantics) — with callouts pointing hosts to SDK, not parallel import paths.

| Area                      | Change                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `docs/sdk/`               | **Only** integrator section. Single-import rule. Entry points, orchestration, assembly paths — all `@specd/sdk` |
| `docs/core/*`             | Package reference; `@specd/core` examples for plugin/core-only audience; index callout → `docs/sdk/`            |
| `docs/code-graph/*`       | Package reference; index callout → `docs/sdk/`; no host mixed-import guidance                                   |
| `apps/public-web` TypeDoc | Entry **`packages/sdk/src/index.ts`**. Title: `@specd/sdk API Reference`                                        |
| `apps/public-web` landing | Copy points to SDK as the integrator surface                                                                    |

**Type and shape audit:** walk kernel use cases vs `docs/core/use-cases.md` and TypeDoc output; fix stale type names, input fields, and error codes. Barrel `export type` vs `export class` choices must keep TypeDoc accurate for integrators.

### Studio / API / IPC

**Out of scope.** Hosts in `feat-user-interface` still use direct core/code-graph imports. Studio-only APIs (`getArtifact`, `saveArtifact`, etc.) are not added to A3 barrels. Migrating those hosts to `@specd/sdk` is a follow-up change after the UI merge.

## Specs affected

### New specs

_none_

### Modified specs

- `default:_global/architecture`: Multi-entry public barrels; kernel use-case types on `"."`; import policy; concrete adapters never on public entries.
  - Depends on (added): none
  - Depends on (removed): none

- `default:_global/docs`: Integrator docs use SDK for core+graph hosts; API reference generation targets SDK public entry.
  - Depends on (added): none
  - Depends on (removed): none

- `core:composition`: Exact `"."` export list = kernel-mounted use cases + I/O types + bootstrap; `ports` / `extensions` / `internal` subpaths; retired symbols.
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:composition`: `"."` vs `"./internal"`; full host use-case + provider export list.
  - Depends on (added): none
  - Depends on (removed): none

- `sdk:composition`: Explicit `"."` re-export (kernel + graph + orchestration); `./ports` and `./extensions` subpaths; remove `export *`.
  - Depends on (added): none
  - Depends on (removed): none

- `public-web:api-reference`: Generated reference MUST derive from `@specd/sdk` public entry (replaces `@specd/core`-only initial scope).
  - Depends on (added): `sdk:composition`
  - Depends on (removed): none

## Impact

- **Packages**: `packages/core`, `packages/code-graph`, `packages/sdk`, `apps/public-web` (TypeDoc entry), `docs/sdk/*`, `docs/core/*`.
- **Compile gate**: `pnpm --filter @specd/cli test`. Additional: `apps/public-web` API generation test, doc link/import audit.
- **Docs / TypeDoc**: breaking change in **documented** import paths (`@specd/core` → `@specd/sdk` for hosts); generated API moves to SDK package surface.
- **Plugins / integrators**: No import changes required immediately (`SpecdConfig` / `SpecdError` stay on `"."`). `@specd/sdk/ports` and `@specd/sdk/extensions` available for custom repository work; `@specd/core/ports` and `@specd/core/extensions` remain equivalent sources.
- **Breaking**: Importing concrete adapters (`Fs*`, `GitVcsAdapter`) from `@specd/core` `"."`. Standalone factories move **to** `"."` from the old full barrel — integrators gain `createX` / `create*Repository` on public root.
- **Out of scope (follow-up changes):**
  - Studio/API/IPC host import migration (`feat-user-interface` merge)
  - Custom storage plugin wiring: registry dispatch for adapter ids beyond `'fs'`, `specd.yaml` `storage.*.adapter`, plugin-manager npm loading of `*StorageFactory`
- **Sequencing**: After `12-cli-mcp-sdk-migration` (complete — CLI is compile gate).

## Technical context

- CLI on `main` is the compile floor — 78 `@specd/sdk` symbols, 0 direct core/code-graph imports.
- **Kernel surface = public API** for integrators: types + factories for every kernel-mounted capability; CLI subset ⊂ kernel exports.
- **Two assembly paths:** `createKernel` (recommended) or standalone `createX` / `create*Repository`.
- Kernel registry already models custom storage factories parallel to `GraphStoreFactory`.
- Exploration phase A3 (`core-refactor-on-main.md`) originally listed generic core exports; narrowed to CLI inventory + plugin extension subpaths per design discussion.
- **Import policy:** core-only → `@specd/core`; core + code-graph → `@specd/sdk`; avoid dual direct core+code-graph deps on hosts.

## Resolved decisions

1. **CLI compile gate** — `pnpm --filter @specd/cli test`. `12-cli-mcp-sdk-migration` done on `main`.
2. **`RecordSkillInstall` / `GetSkillsManifest`** — already removed from core; no action (denylist in `config-mutation-exports.spec.ts` only).
3. **`09-core-approval-gates-baked`** — archived; no overlap to reconcile.
4. **`KernelBuilder`** — public on `@specd/core/extensions` (re-export `@specd/sdk/extensions`). Integrators use it to register **kernel registry extensions** at bootstrap: `*StorageFactory`, parsers, extractor transforms, VCS/actor providers, external hook runners, graph stores. Equivalent: `createKernel(config, { specStorageFactories: { db: factory } })`. **Not** for agent/skill npm plugins (`plugin-manager`) — separate system.
