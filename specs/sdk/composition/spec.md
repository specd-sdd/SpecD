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
- `src/shared/` — internal cross-cutting helpers (e.g. package version constants) not exported from the public barrel
- `src/index.ts` — public barrel only

The package MUST NOT contain domain entities, application ports, or infrastructure adapters. Files under `src/shared/` MUST NOT be re-exported from `src/index.ts`.

### Requirement: Public barrel exports for A2a

`src/index.ts` SHALL export:

- From host-context spec: `openSpecdHost`, `createSdkContext`, `SdkHostContext`, `OpenSpecdHostInput`, `OpenSpecdHostResult`
- From graph lifecycle spec: `withOpenGraphProvider`
- From orchestration specs: `buildProjectStatusSnapshot`, `runIndexProjectGraph`, and their input/result types
- Re-exports from `@specd/core`: `createConfigLoader`, `createConfigWriter`, `createKernel`, `Kernel`, `KernelOptions`, `SpecdConfig`, and the remainder of the `@specd/core` public surface via `export * from '@specd/core'` until change `13-public-api-surface` narrows the curated list
- Re-exports from `@specd/code-graph`: `CodeGraphProvider`, `createCodeGraphProvider`, plus host-adapter symbols listed under **Public barrel exports for host adapters**

The barrel MUST NOT export infrastructure adapters or internal composition helpers from either dependency package. `export * from '@specd/core'` is permitted as a transitional re-export boundary for delivery hosts migrating off direct `@specd/core` dependencies.

### Requirement: Public barrel exports for host adapters

`src/index.ts` SHALL re-export the following symbols from `@specd/code-graph` for CLI host adapters:

- `acquireGraphIndexLock`
- `assertGraphIndexUnlocked`
- `createGetGraphHealth`
- `type GetGraphHealthResult`
- `type IndexResult`
- `type HotspotResult`
- `codeGraphVersion` and `getCodeGraphVersion`
- `GraphSpecNotFoundError` (alias for graph `SpecNotFoundError`)
- Additional host-adapter symbols used by CLI graph commands: `SymbolKind`, `SearchOptions`, `HotspotOptions`, `RiskLevel`, `normalizeFileSelectorPath`, `createBootstrapGraphConfig`, fingerprint helpers, and related impact/search types

Delivery hosts MUST import these symbols from `@specd/sdk`, not from `@specd/code-graph` directly.

### Requirement: Version constant

The package SHALL export `SDK_VERSION` as a string constant matching `package.json` version.

## Spec Dependencies

- [`default:_global/architecture`](../../../../specs/_global/architecture/spec.md) — hexagonal layer rules for the new package
- [`core:composition`](../../../../specs/core/composition/spec.md) — kernel and config factory sources
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — graph provider factory source
- [`cli:host-context`](../../../../specs/cli/host-context/spec.md) — consumer of host-adapter barrel re-exports
