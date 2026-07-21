# Verification: GetGraphHealth

## Requirements

### Requirement: Returns enriched graph health

#### Scenario: Fresh graph with matching fingerprint

- **GIVEN** an opened provider with indexed data at the current VCS ref and matching derivation fingerprint
- **WHEN** `GetGraphHealth.execute()` is called with workspaces and `codeGraphVersion`
- **THEN** the result includes all `GraphStatistics` fields
- **AND** `stale` is `false`
- **AND** `fingerprintMismatch` is `false`

#### Scenario: Unknown staleness when no indexed ref

- **GIVEN** statistics with `lastIndexedRef: null`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `stale` is `null`

### Requirement: Provider-owned availability and error propagation

#### Scenario: Busy provider error propagates unchanged

- **GIVEN** the provider reports `GRAPH_BUSY` from `getStatistics()`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** the same busy error propagates to the caller

#### Scenario: Stale provider error propagates unchanged

- **GIVEN** the provider reports `GRAPH_PROVIDER_STALE` from `getStatistics()`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** the same stale-provider error propagates to the caller

### Requirement: Computes VCS staleness

#### Scenario: Stale by VCS ref drift

- **GIVEN** `lastIndexedRef` differs from the current VCS ref
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `stale` is `true`
- **AND** `currentRef` matches the adapter ref

### Requirement: Computes derivation fingerprint mismatch

#### Scenario: Mismatch detected

- **GIVEN** stored `graphFingerprint` differs from current workspace layout
- **WHEN** workspaces and `codeGraphVersion` are provided
- **THEN** `fingerprintMismatch` is `true`

#### Scenario: Comparison skipped without workspaces

- **GIVEN** `workspaces` is omitted
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `fingerprintMismatch` is `null`

### Requirement: Accepts open provider and project inputs

#### Scenario: Does not open or close provider

- **GIVEN** a mock provider with spied `open` and `close`
- **WHEN** `GetGraphHealth.execute()` runs
- **THEN** `open` and `close` are not called

### Requirement: Factory wires dependencies

#### Scenario: Factory returns stateless instance

- **WHEN** `createGetGraphHealth()` is called twice
- **THEN** each call returns a new `GetGraphHealth` instance with no captured config
