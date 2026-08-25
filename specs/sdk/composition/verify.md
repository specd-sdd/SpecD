# Verification: SDK Composition

## Requirements

### Requirement: Package identity and dependencies

#### Scenario: SDK depends only on core and code-graph

- **WHEN** inspecting `packages/sdk/package.json` dependencies
- **THEN** only `@specd/core` and `@specd/code-graph` workspace packages are listed as runtime dependencies
- **AND** `@specd/cli` and `@specd/mcp` are absent

### Requirement: Layer structure

#### Scenario: SDK source tree keeps infrastructure out and domain narrow

- **WHEN** listing `packages/sdk/src/`
- **THEN** `composition/`, `orchestration/`, `presentation/`, `shared/`, and a
  narrow `domain/` for SDK-specific error/value contracts may exist
- **AND** no `infrastructure/` directory exists
- **AND** `domain/` contains no entities, ports, or infrastructure adapters

#### Scenario: Internal shared directory has no package subpath

- **WHEN** inspecting SDK package exports and its curated root barrel
- **THEN** `src/shared/` has no public package subpath
- **AND** explicitly curated root exports may reference named shared bindings

### Requirement: Public barrel exports

#### Scenario: SDK root does not use export star from core

- **WHEN** `packages/sdk/src/index.ts` is inspected
- **THEN** it does not contain `export * from '@specd/core'`

#### Scenario: SDK exports orchestration and bootstrap symbols

- **WHEN** importing from `@specd/sdk`
- **THEN** `openSpecdHost`, `createKernel`, and `buildProjectStatusSnapshot` are available

#### Scenario: SDK exports context markdown presentation helpers

- **WHEN** importing from `@specd/sdk`
- **THEN** `changeContextToMarkdown` and `projectContextToMarkdown` are available

#### Scenario: SDK re-exports kernel-equivalent factories from core

- **WHEN** importing from `@specd/sdk`
- **THEN** `createGetStatus` and `createSpecRepository` are available

#### Scenario: SDK tracks revised metadata materialization surface

- **WHEN** importing from `@specd/sdk`
- **THEN** `MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState`, and their `create*` factories are available

#### Scenario: SDK does not restore removed metadata mutation APIs

- **WHEN** importing from `@specd/sdk`
- **THEN** `SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, `createSaveSpecMetadata`, `createUpdateSpecMetadata`, and `createInvalidateSpecMetadata` are not exported
- **AND** `PersistSpecMetadata` is not exported

#### Scenario: SDK ports subpath re-exports core ports

- **WHEN** importing `ChangeRepository` from `@specd/sdk/ports`
- **THEN** the type resolves to the same contract as `@specd/core/ports`

### Requirement: Public barrel exports for host adapters

#### Scenario: Isolated graph worker is available from SDK

- **WHEN** importing from `@specd/sdk`
- **THEN** `runIsolatedGraphIndex` and its host-facing input, progress, result,
  and typed worker failure contracts are available
- **AND** `createGetGraphHealth`, `GetGraphHealthResult`, `IndexResult`,
  `HotspotResult`, `codeGraphVersion`, and `getCodeGraphVersion` remain available

#### Scenario: Raw graph index lock is absent from SDK

- **WHEN** the SDK curated barrel and generated declarations are inspected
- **THEN** `acquireGraphIndexLock` and `assertGraphIndexUnlocked` are not exported
- **AND** no lock-path helper, release callback, raw lock token, or raw worker IPC
  envelope is exported

#### Scenario: Built declarations expose the complete curated worker contract

- **WHEN** a publish-shaped TypeScript consumer imports from built `@specd/sdk`
- **THEN** it can compile-import `RunIsolatedGraphIndexInput`, JSON value types,
  task/progress contracts, `IsolatedGraphIndexRunner`, and every documented worker
  failure class
- **AND** generated declarations expose no lock-path helper, lease/release callback,
  lock token, or raw IPC envelope

#### Scenario: Host can index without direct Code Graph import

- **GIVEN** a delivery host depends on `@specd/sdk` only
- **WHEN** it imports the isolated worker and graph result types
- **THEN** all required public contracts resolve from SDK
- **AND** the host does not import `@specd/code-graph` or coordinate a lock file

#### Scenario: SDK layer and package-entry rules match the published surface

- **WHEN** SDK source and package metadata are inspected
- **THEN** SDK-specific error/value contracts may reside in `src/domain/`
- **AND** `src/shared/` has no public subpath while explicitly curated root-barrel
  aliases remain importable
- **AND** the package root publishes built `dist` declarations and JavaScript
  generated from `src/index.ts`

### Requirement: Import policy for integrators

#### Scenario: CLI has no direct core dependency

- **WHEN** `packages/cli/package.json` runtime dependencies are inspected
- **THEN** only `@specd/sdk` is listed among specd platform packages

#### Scenario: Plugin may depend on core directly

- **WHEN** `packages/plugin-manager/package.json` runtime dependencies are inspected
- **THEN** `@specd/core` may be present
- **AND** `@specd/sdk` is not required

### Requirement: Version constant

#### Scenario: SDK_VERSION matches package version

- **WHEN** reading `SDK_VERSION` from `@specd/sdk`
- **THEN** it equals the `version` field in `packages/sdk/package.json`

### Requirement: Implementation review public orchestration

#### Scenario: SDK barrel exposes review without parallel imports

- **WHEN** a delivery host imports implementation review and reference result types
- **THEN** all are available from `@specd/sdk`
- **AND** the host needs no direct Core plus Code Graph composition
