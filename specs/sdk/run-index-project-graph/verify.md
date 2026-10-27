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

- **GIVEN** a non-forced run whose open raises a recoverable failure other than `SCHEMA_INCOMPATIBLE`, or any non-recoverable error
- **WHEN** `runIndexProjectGraph` runs
- **THEN** the original error propagates without recreation or retry

#### Scenario: Explicit provider remains caller-owned

- **GIVEN** an explicit already-open provider
- **WHEN** force indexing runs
- **THEN** the SDK does not close, recreate, or retry it

#### Scenario: A non-forced run rebuilds a schema-incompatible store

- **GIVEN** a transient provider whose first open raises `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`
- **WHEN** `runIndexProjectGraph` runs with `force` not set
- **THEN** it closes that provider, recreates it once, opens again, and indexes
- **AND** the result reports a full rebuild with that reason

### Requirement: Lock acquisition out of scope

#### Scenario: SDK does not acquire index lock

- **WHEN** `runIndexProjectGraph` runs without CLI `beforeOpen` hook
- **THEN** `acquireGraphIndexLock` is not called by the SDK implementation

### Requirement: Progress callback passthrough

#### Scenario: onProgress receives index events

- **GIVEN** `input.onProgress` is provided
- **WHEN** indexing emits progress
- **THEN** the same callback receives the events unchanged

#### Scenario: The progress callback keeps its signature

- **GIVEN** a caller that passes only `onProgress`
- **WHEN** the run executes
- **THEN** the callback receives the same `(percent, phase)` calls as before this change

### Requirement: Typed event passthrough

#### Scenario: Indexer events reach the receiver in order

- **GIVEN** an `onEvent` receiver and a run that produces `file-activity` and `file-skipped` events
- **WHEN** the run executes
- **THEN** the receiver gets them in arrival order and without transformation

#### Scenario: Worker events are not part of this receiver

- **GIVEN** a host that passes `onEvent` to `runIndexProjectGraph` and also runs the isolated worker
- **WHEN** the worker produces a `worker-silent` event
- **THEN** that event is delivered through the `onEvent` of `runIsolatedGraphIndex`, not through the one of `runIndexProjectGraph`

#### Scenario: Omitting the receiver changes nothing

- **GIVEN** a run without `onEvent`
- **WHEN** it completes
- **THEN** it behaves as before and `onProgress` is unaffected

#### Scenario: Event types are exported

- **GIVEN** the curated public SDK surface
- **WHEN** a host imports the indexer event types and the isolated-worker event and diagnostics types
- **THEN** every kind is available with member-level documentation and no internal module is needed

### Requirement: Result passthrough

#### Scenario: Index result fields preserved

- **WHEN** indexing completes
- **THEN** returned counts and per-workspace breakdown match `IndexProjectGraph` output

#### Scenario: Size-skip fields are passed through

- **GIVEN** an indexing result with `filesSkippedForSize`, `largestSkippedForSize`, and `sizeExemptAnalysed`
- **WHEN** the SDK returns its result
- **THEN** those fields are present with the same values

### Requirement: Repair lifecycle passthrough

#### Scenario: SDK can repair a store normal reads cannot open

- **GIVEN** a provider normal-open rejects an old schema
- **WHEN** force indexing is requested
- **THEN** the bounded repair lifecycle reaches a rebuild

#### Scenario: Recovery result is preserved

- **WHEN** force recovery succeeds
- **THEN** the returned result retains the full-rebuild reason and index fields
