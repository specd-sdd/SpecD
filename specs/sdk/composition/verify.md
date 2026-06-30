# Verification: SDK Composition

## Requirements

### Requirement: Package identity and dependencies

#### Scenario: SDK depends only on core and code-graph

- **WHEN** inspecting `packages/sdk/package.json` dependencies
- **THEN** only `@specd/core` and `@specd/code-graph` workspace packages are listed as runtime dependencies
- **AND** `@specd/cli` and `@specd/mcp` are absent

### Requirement: Layer structure

#### Scenario: No infrastructure in SDK source tree

- **WHEN** listing `packages/sdk/src/`
- **THEN** directories are limited to `composition/`, `orchestration/`, `shared/`, and `index.ts`
- **AND** no `infrastructure/` or `domain/` directories exist

### Requirement: Public barrel exports

#### Scenario: SDK root does not use export star from core

- **WHEN** `packages/sdk/src/index.ts` is inspected
- **THEN** it does not contain `export * from '@specd/core'`

#### Scenario: SDK exports orchestration and bootstrap symbols

- **WHEN** importing from `@specd/sdk`
- **THEN** `openSpecdHost`, `createKernel`, and `buildProjectStatusSnapshot` are available

#### Scenario: SDK re-exports kernel-equivalent factories from core

- **WHEN** importing from `@specd/sdk`
- **THEN** `createGetStatus` and `createSpecRepository` are available

#### Scenario: SDK ports subpath re-exports core ports

- **WHEN** importing `ChangeRepository` from `@specd/sdk/ports`
- **THEN** the type resolves to the same contract as `@specd/core/ports`

### Requirement: Public barrel exports for host adapters

#### Scenario: Lock and health helpers available from SDK

- **WHEN** importing from `@specd/sdk`
- **THEN** `acquireGraphIndexLock`, `assertGraphIndexUnlocked`, and `createGetGraphHealth` are available
- **AND** `GetGraphHealthResult`, `IndexResult`, and `HotspotResult` types are available
- **AND** `codeGraphVersion` and `getCodeGraphVersion` are available

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
