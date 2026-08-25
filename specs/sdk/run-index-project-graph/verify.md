# Verification: SDK Run Index Project Graph

## Requirements

### Requirement: runIndexProjectGraph orchestration

#### Scenario: Full workspace index with transient provider and lifecycle hooks

- **GIVEN** `beforeOpen` and `afterClose` hooks
- **WHEN** a non-forced transient index runs
- **THEN** workspaces are listed, the helper receives the hooks, and the provider closes

#### Scenario: Existing open provider bypasses withOpenGraphProvider

- **GIVEN** an open explicit provider
- **WHEN** indexing runs
- **THEN** it executes directly and the provider is not closed

#### Scenario: Conflicting lifecycle hooks with existing provider throws error

- **GIVEN** an explicit provider and a lifecycle hook
- **WHEN** indexing is requested
- **THEN** it throws `InvalidProviderLifecycleError`

#### Scenario: Subset workspace index

- **WHEN** selected workspaces are supplied
- **THEN** only those workspaces are indexed

#### Scenario: Prepared provider delegates through IndexProjectGraph

- **GIVEN** an explicit open provider or a transient provider opened by the helper
- **WHEN** project indexing runs
- **THEN** the SDK invokes the prepared-provider `IndexProjectGraph` use-case seam
- **AND** the use case receives the prepared workspace, VCS, force, and progress inputs

#### Scenario: Force-only typed recovery retries once

- **GIVEN** a transient provider whose first open raises `GraphStorageRecoveryRequiredError`
- **WHEN** `runIndexProjectGraph` receives `force: true`
- **THEN** it closes that provider, invokes `recreate()`, opens once more, and indexes
- **AND** caller hooks and final cleanup occur exactly once

#### Scenario: Non-forced or non-recoverable open failure is not retried

- **WHEN** force is false or open raises a different error
- **THEN** the original error propagates without recreation or retry

#### Scenario: Explicit provider remains caller-owned

- **GIVEN** an explicit already-open provider
- **WHEN** force indexing runs
- **THEN** the SDK does not close, recreate, or retry it

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

### Requirement: Repair lifecycle passthrough

#### Scenario: SDK can repair a store normal reads cannot open

- **GIVEN** a provider normal-open rejects an old schema
- **WHEN** force indexing is requested
- **THEN** the bounded repair lifecycle reaches a rebuild

#### Scenario: Recovery result is preserved

- **WHEN** force recovery succeeds
- **THEN** the returned result retains the full-rebuild reason and index fields
