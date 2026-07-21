# Verification: SDK Run Index Project Graph

## Requirements

### Requirement: runIndexProjectGraph orchestration

#### Scenario: Full workspace index with transient provider and lifecycle hooks

- **GIVEN** optional `beforeOpen` and `afterClose` hooks provided in `input`
- **WHEN** `runIndexProjectGraph(ctx, { force: false, beforeOpen, afterClose })` is called without explicit provider
- **THEN** `listWorkspaces` is invoked
- **AND** `withOpenGraphProvider` receives `beforeOpen` and `afterClose`
- **AND** `IndexProjectGraph` runs for all workspaces
- **AND** the transient provider is closed upon completion

#### Scenario: Existing open provider bypasses withOpenGraphProvider

- **GIVEN** an open `CodeGraphProvider` instance
- **WHEN** `runIndexProjectGraph(ctx, { provider: openProvider })` is called
- **THEN** `IndexProjectGraph` executes directly on `openProvider`
- **AND** `openProvider.close()` is NOT called even if indexing succeeds or throws an error

#### Scenario: Conflicting lifecycle hooks with existing provider throws error

- **GIVEN** an open `CodeGraphProvider` instance
- **AND** `input` includes `provider` and either `beforeOpen` or `afterClose`
- **WHEN** `runIndexProjectGraph(ctx, input)` is called
- **THEN** it throws `InvalidProviderLifecycleError`
- **AND** the error is an instance of `SpecdError` with `code: 'INVALID_PROVIDER_LIFECYCLE'`

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
