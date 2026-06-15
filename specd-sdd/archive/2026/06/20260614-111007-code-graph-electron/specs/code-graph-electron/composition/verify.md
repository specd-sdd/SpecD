# Verification: Composition

## Requirements

### Requirement: Electron-specific graph package

#### Scenario: Desktop local graph imports the Electron package

- **GIVEN** `studio-desktop` provides local graph operations from Electron main
- **WHEN** the desktop graph composition is inspected
- **THEN** local graph wiring resolves through `@specd/code-graph-electron`
- **AND** it does not import the standard `@specd/code-graph` build output directly for desktop local graph operations

#### Scenario: CLI and API remain on the standard package

- **WHEN** CLI and API graph consumers are inspected
- **THEN** they continue to resolve graph composition through `@specd/code-graph`
- **AND** they do not require the Electron-specific package to run

### Requirement: Shared provider contract

#### Scenario: Desktop local graph wiring uses the same provider shape

- **GIVEN** desktop local graph callers already expect `createCodeGraphProvider(...)` and the shared graph types
- **WHEN** `studio-desktop` is switched to `@specd/code-graph-electron`
- **THEN** desktop graph wiring still compiles against the expected provider contract
- **AND** no desktop-only graph API fork is required

### Requirement: Isolated native runtime path

#### Scenario: Electron resolves its own native SQLite path

- **GIVEN** Electron main opens the desktop-local graph provider
- **WHEN** the provider initializes SQLite-backed graph storage
- **THEN** the effective native module path used for SQLite belongs to `@specd/code-graph-electron`
- **AND** it is not satisfied by the standard `@specd/code-graph` native runtime path

#### Scenario: Desktop compatibility changes do not retarget CLI or API

- **GIVEN** the Electron package requires a runtime-specific native rebuild or compatibility adjustment
- **WHEN** desktop packaging or development rebuilds the graph package for Electron
- **THEN** CLI and API continue using their existing standard-package runtime path
- **AND** they are not forced onto the Electron-targeted native build

### Requirement: Shared source model without behavioural fork

#### Scenario: Desktop and standard packages expose the same graph behaviour

- **GIVEN** equivalent graph operations are invoked through `@specd/code-graph` and `@specd/code-graph-electron`
- **WHEN** both packages run against the same compatible graph inputs
- **THEN** indexing, search, traversal, impact, hotspots, and stats follow the same observable graph semantics
- **AND** any differences are limited to packaging or runtime-specific native resolution

### Requirement: Internal-only distribution role

#### Scenario: Electron package remains an internal workspace package

- **WHEN** the Electron package metadata and distribution role are reviewed
- **THEN** it is marked for internal workspace usage rather than public standalone npm publication
- **AND** its primary consumer is the packaged or locally developed `studio-desktop` application

### Requirement: Desktop runtime compatibility track

#### Scenario: Desktop may upgrade Electron without retargeting Node consumers

- **GIVEN** `studio-desktop` moves from Electron `36.x` to a newer supported Electron line
- **WHEN** the Electron-specific graph package is rebuilt or repackaged for that line
- **THEN** the compatibility adjustment remains scoped to desktop runtime packaging
- **AND** CLI and API do not inherit the same Electron runtime target
