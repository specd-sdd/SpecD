# SDK Composition

## Purpose

Delivery hosts (CLI, MCP, API, IPC) need a single package that wires `@specd/core` and `@specd/code-graph` without importing infrastructure or duplicating bootstrap logic. `@specd/sdk` is that package: a thin composition layer that re-exports curated factories and hosts cross-package orchestration helpers defined in sibling specs.

## Requirements

### Requirement: Package identity and dependencies

The `@specd/sdk` package SHALL live at `packages/sdk/` in the monorepo with workspace name `sdk` in `specd.yaml`. Runtime dependencies MUST be limited to `@specd/core` and `@specd/code-graph` workspace packages. The package MUST NOT depend on `@specd/cli`, `@specd/mcp`, or plugin packages.

### Requirement: Layer structure

The SDK source tree MAY contain `src/composition/`, `src/orchestration/`,
`src/presentation/`, `src/shared/`, and `src/domain/`. `src/domain/` is limited to
SDK-specific error and value contracts and MUST NOT introduce entities, ports, or
infrastructure adapters.

`src/shared/` is an internal implementation directory and MUST NOT have a public
package subpath. The curated root barrel MAY explicitly re-export a named binding
implemented in `src/shared/` when that binding is listed in the public-barrel
requirement; this does not make the directory itself public.

Package `exports["."]` SHALL publish `./dist/index.js` and `./dist/index.d.ts`,
generated from the logical source barrel `src/index.ts`.

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

`src/index.ts` SHALL re-export the following symbols from the curated
`@specd/code-graph` `"."` entrypoint for delivery hosts:

- `runIsolatedGraphIndex` and its public input, progress, result, and typed worker
  failure contracts
- `createGetGraphHealth`, type `GetGraphHealthInput`, and type
  `GetGraphHealthResult`
- type `IndexResult`, type `HotspotResult`, type `ImpactResult`, and type
  `FileImpactResult`
- `codeGraphVersion` and `getCodeGraphVersion` (SDK-owned aliases where applicable)
- `GraphSpecNotFoundError` (alias for graph `SpecNotFoundError`)
- `SymbolKind`, `SearchOptions`, `HotspotOptions`, and `RiskLevel`
- `normalizeFileSelectorPath` and `createBootstrapGraphConfig`
- fingerprint helpers: `isGraphStale`, `detectFingerprintMismatch`,
  `parseFingerprintMap`, and `buildProjectGraphConfig`

SDK MUST NOT export `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, lock-path
helpers, release callbacks, raw lock tokens, or raw worker IPC envelopes. Delivery
hosts SHALL invoke the high-level isolated worker for graph writes and normal graph
provider/use-case operations for reads.

Delivery hosts MUST import the curated symbols from `@specd/sdk`, not from
`@specd/code-graph` directly.

### Requirement: Import policy for integrators

Delivery hosts (`@specd/cli`, `@specd/mcp`, and future API/IPC hosts) that use both `@specd/core` and `@specd/code-graph` MUST depend on `@specd/sdk` only — not on `@specd/core` and `@specd/code-graph` as parallel direct runtime dependencies.

Packages that need only `@specd/core` (for example `plugin-*`, `skills`) MAY import `@specd/core` directly.

Custom storage implementers MAY import port contracts from `@specd/core/ports` or `@specd/sdk/ports`, and registration types from `@specd/core/extensions` or `@specd/sdk/extensions`.

### Requirement: Version constant

The package SHALL export `SDK_VERSION` as a string constant matching `package.json` version.

### Requirement: Implementation review public orchestration

The SDK public barrel SHALL export `buildImplementationReview` and its input/result types. It SHALL also re-export the public Code Graph reference, logical-symbol, binding, member, coverage, health, and resolver result types required by delivery hosts.

CLI and other hosts using implementation review MUST import this orchestration through `@specd/sdk`; they MUST NOT compose Core and Code Graph independently.

## Spec Dependencies

- `default:_global/architecture` — SDK layering
- `core:composition` — Core public composition
- `code-graph:composition` — Code Graph public composition
- `cli:host-context` — host consumer
- `sdk:context-markdown` — presentation helpers
- `sdk:build-implementation-review` — shared review orchestration
- `code-graph:isolated-index-worker` — isolated graph-index execution re-exported
  to delivery hosts
