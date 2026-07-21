# Verification: SQLite Electron Store

## Requirements

### Requirement: Dedicated Electron SQLite store package

#### Scenario: Package is a separate workspace from composition forks

- **WHEN** workspace and package metadata are inspected
- **THEN** `@specd/code-graph-sqlite-electron` exists as its own workspace package
- **AND** it does not re-export `createCodeGraphProvider` or a full code-graph composition surface
- **AND** it is distinct from `@specd/code-graph-electron`

### Requirement: sqlite-electron GraphStoreFactory

#### Scenario: Factory registers under sqlite-electron without colliding with sqlite

- **WHEN** the package factory is registered via `graphStoreFactories` with id `sqlite-electron`
- **THEN** `createCodeGraphProvider(config, { graphStoreId: 'sqlite-electron', graphStoreFactories })` constructs a provider successfully
- **AND** the built-in `sqlite` backend id remains available and unmodified

#### Scenario: Factory uses createSqliteGraphStoreFactory with vendored loader

- **WHEN** the exported Electron SQLite factory is inspected
- **THEN** it is produced by `createSqliteGraphStoreFactory` from `@specd/code-graph`
- **AND** its `loadDatabaseModule` resolves the package’s Electron-vendored better-sqlite3 entry

### Requirement: Deferred native module load

#### Scenario: Native addon is not loaded during provider construction

- **GIVEN** an Electron SQLite factory registered as `sqlite-electron`
- **WHEN** `createCodeGraphProvider(...)` returns a provider without calling `open()`
- **THEN** the vendored native module has not been loaded yet
- **AND** loading occurs during `open()`

### Requirement: Locally generated vendored sqlite tree

#### Scenario: Vendor directory is ignored by git

- **WHEN** repository ignore rules are inspected
- **THEN** `packages/code-graph-sqlite-electron/vendor/` is excluded from version control

#### Scenario: Sync populates the vendored tree on demand

- **GIVEN** a fresh workspace without a local vendored sqlite tree under the new package
- **WHEN** the package sync workflow runs
- **THEN** `vendor/better-sqlite3/` is created under `@specd/code-graph-sqlite-electron`

### Requirement: Platform-aware Electron rebuild cache

#### Scenario: Matching cache metadata skips rebuild

- **GIVEN** a vendored `better_sqlite3.node` exists with matching Electron version, platform, and arch metadata
- **WHEN** the Electron sqlite rebuild workflow runs
- **THEN** it skips recompilation

### Requirement: Shared SQLite graph semantics

#### Scenario: Electron backend preserves SQLite graph behaviour

- **GIVEN** equivalent graph operations through `sqlite` and `sqlite-electron` backends on compatible inputs
- **WHEN** indexing and search are exercised
- **THEN** observable graph semantics match
- **AND** differences are limited to native-module resolution

### Requirement: Host wiring via SDK graph options

#### Scenario: Desktop selects sqlite-electron through SDK options

- **WHEN** desktop local composition is inspected
- **THEN** providers are created with `graphStoreId: 'sqlite-electron'` and the additive factory from this package
- **AND** `@specd/code-graph-electron` is not imported on that path

### Requirement: Internal-only distribution role

#### Scenario: Package is marked for internal workspace usage

- **WHEN** package metadata is reviewed
- **THEN** it is private / internal workspace usage rather than a public standalone npm product by default
