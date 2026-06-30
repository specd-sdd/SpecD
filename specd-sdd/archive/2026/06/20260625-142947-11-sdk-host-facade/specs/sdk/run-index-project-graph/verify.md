# Verification: SDK Run Index Project Graph

## Requirements

### Requirement: runIndexProjectGraph orchestration

#### Scenario: Full workspace index

- **WHEN** `runIndexProjectGraph(ctx, { force: false })` is called without workspace filter
- **THEN** `listWorkspaces` is invoked
- **AND** `IndexProjectGraph` runs inside `withOpenGraphProvider` for all workspaces

#### Scenario: Subset workspace index

- **WHEN** `runIndexProjectGraph(ctx, { workspaces: ['core'] })` is called
- **THEN** only the specified workspaces are passed to `IndexProjectGraph`

### Requirement: Lock acquisition out of scope

#### Scenario: SDK does not acquire index lock

- **WHEN** `runIndexProjectGraph` runs without CLI `beforeOpen` hook
- **THEN** `acquireGraphIndexLock` is not called by the SDK implementation

### Requirement: Progress callback passthrough

#### Scenario: onProgress receives index events

- **GIVEN** `input.onProgress` is provided
- **WHEN** indexing emits progress
- **THEN** the same callback receives the events unchanged

### Requirement: Result passthrough

#### Scenario: Index result fields preserved

- **WHEN** indexing completes
- **THEN** returned counts and per-workspace breakdown match `IndexProjectGraph` output
