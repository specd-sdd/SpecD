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

### Requirement: Public barrel exports for A2a

#### Scenario: Barrel exports host and orchestration symbols

- **WHEN** importing from `@specd/sdk`
- **THEN** `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider`, `buildProjectStatusSnapshot`, and `runIndexProjectGraph` are available
- **AND** `createConfigLoader`, `createConfigWriter`, and `createKernel` are re-exported from core

#### Scenario: Barrel does not export internals

- **WHEN** attempting to import `FsConfigLoader` or raw use-case classes from `@specd/sdk`
- **THEN** the import fails at compile time

### Requirement: Version constant

#### Scenario: SDK_VERSION matches package version

- **WHEN** reading `SDK_VERSION` from `@specd/sdk`
- **THEN** it equals the `version` field in `packages/sdk/package.json`
