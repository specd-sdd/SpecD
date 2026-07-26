# SDK Composition

## Purpose

Delivery hosts (CLI, MCP, API, IPC) need a single package that wires `@specd/core` and `@specd/code-graph` without importing infrastructure or duplicating bootstrap logic. `@specd/sdk` is that package: a thin composition layer that re-exports curated factories and hosts cross-package orchestration helpers defined in sibling specs.

## Requirements

### Requirement: Package identity and dependencies

The `@specd/sdk` package SHALL live at `packages/sdk/` in the monorepo with workspace name `sdk` in `specd.yaml`. Runtime dependencies MUST be limited to `@specd/core` and `@specd/code-graph` workspace packages. The package MUST NOT depend on `@specd/cli`, `@specd/mcp`, or plugin packages.

### Requirement: Layer structure

`@specd/sdk` SHALL follow hexagonal boundaries from `default:_global/architecture`:

- `src/composition/` — host bootstrap (`openSpecdHost`, `createSdkContext`) and graph lifecycle (`withOpenGraphProvider`)
- `src/orchestration/` — cross-package workflows (`buildProjectStatusSnapshot`, `runIndexProjectGraph`)
- `src/presentation/` — pure agent-facing formatters (`changeContextToMarkdown`, `projectContextToMarkdown`) over structured core results
- `src/shared/` — internal cross-cutting helpers (e.g. package version constants) not exported from the public barrel
- `src/index.ts` — public barrel only

The package MUST NOT contain domain entities, application ports, or infrastructure adapters. Files under `src/shared/` MUST NOT be re-exported from `src/index.ts`. Presentation helpers MUST remain pure (no I/O); they MAY be exported from the public barrel.

### Requirement: Public barrel exports

`package.json` `exports` MUST include:

- `"."` → `src/index.ts` (curated host surface)
- `"./ports"` → re-export `@specd/core/ports`
- `"./extensions"` → re-export `@specd/core/extensions`

`src/index.ts` SHALL export explicitly (no `export * from '@specd/core'`):

- SDK composition: `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider`, `SdkHostContext`, `OpenSpecdHostInput`, `OpenSpecdHostResult`, `WithOpenGraphProviderOptions`
- SDK orchestration: `buildProjectStatusSnapshot`, `runIndexProjectGraph`, and their input/result types
- SDK presentation: `changeContextToMarkdown`, `projectContextToMarkdown`, `ChangeContextToMarkdownOptions`
- Explicit re-exports from `@specd/core` `"."` public barrel (bootstrap, `Kernel`, kernel-equivalent `createX` factories, repository factories, kernel use-case I/O types, domain entities, errors). This MUST track the revised `kernel.specs` surface — including `MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState`, persisted schema inspection/reassignment, and persisted dependency/implementation/optimization use cases — and their `create*` factories.
- Explicit re-exports from `@specd/code-graph` `"."` public barrel (provider factory, host use cases, graph host-adapter symbols listed under **Public barrel exports for host adapters**)
- `SDK_VERSION`, `codeGraphVersion`, `getCodeGraphVersion`

The `"."` barrel MUST NOT export infrastructure adapters, internal composition helpers, or symbols that are only available from `"./internal"` entry points of dependency packages.

The `"."` barrel MUST NOT re-export `SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, or their `createSaveSpecMetadata` / `createUpdateSpecMetadata` / `createInvalidateSpecMetadata` factories — those use cases are removed from `@specd/core` and MUST NOT be restored at the SDK layer. `PersistSpecMetadata` MUST NOT be exported — it is an internal collaborator of `MaterializeSpecMetadata` only.

### Requirement: Public barrel exports for host adapters

`src/index.ts` SHALL re-export the following symbols from `@specd/code-graph` `"."` for CLI host adapters:

- `acquireGraphIndexLock`, `assertGraphIndexUnlocked`
- `createGetGraphHealth`, `type GetGraphHealthInput`, `type GetGraphHealthResult`
- `type IndexResult`, `type HotspotResult`, `type ImpactResult`, `type FileImpactResult`
- `codeGraphVersion`, `getCodeGraphVersion` (SDK-owned aliases where applicable)
- `GraphSpecNotFoundError` (alias for graph `SpecNotFoundError`)
- `SymbolKind`, `SearchOptions`, `HotspotOptions`, `RiskLevel`
- `normalizeFileSelectorPath`, `createBootstrapGraphConfig`
- Fingerprint helpers: `isGraphStale`, `detectFingerprintMismatch`, `parseFingerprintMap`, `buildProjectGraphConfig`

Delivery hosts MUST import these symbols from `@specd/sdk`, not from `@specd/code-graph` directly.

### Requirement: Import policy for integrators

Delivery hosts (`@specd/cli`, `@specd/mcp`, and future API/IPC hosts) that use both `@specd/core` and `@specd/code-graph` MUST depend on `@specd/sdk` only — not on `@specd/core` and `@specd/code-graph` as parallel direct runtime dependencies.

Packages that need only `@specd/core` (for example `plugin-*`, `skills`) MAY import `@specd/core` directly.

Custom storage implementers MAY import port contracts from `@specd/core/ports` or `@specd/sdk/ports`, and registration types from `@specd/core/extensions` or `@specd/sdk/extensions`.

### Requirement: Version constant

The package SHALL export `SDK_VERSION` as a string constant matching `package.json` version.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal layering applied to the SDK package
- [`core:composition`](../../core/composition/spec.md) — core composition surface the SDK re-exports and wraps
- [`code-graph:composition`](../../code-graph/composition/spec.md) — code-graph composition surface the SDK re-exports and wraps
- [`cli:host-context`](../../cli/host-context/spec.md) — consumer of host-adapter barrel re-exports
- [`sdk:context-markdown`](../context-markdown/spec.md) — presentation helpers exported from the public barrel
