# Verification: Staleness Detection

## Requirements

### Requirement: VCS ref storage at index time

#### Scenario: Ref persisted after indexing

- **GIVEN** `IndexOptions.vcsRef` is `"abc1234"`
- **WHEN** indexing completes successfully
- **THEN** the graph store's `lastIndexedRef` meta key SHALL be `"abc1234"`

#### Scenario: No VCS ref provided

- **GIVEN** `IndexOptions.vcsRef` is not provided
- **WHEN** indexing completes successfully
- **THEN** the graph store's `lastIndexedRef` meta key SHALL remain `null`

### Requirement: Staleness comparison

#### Scenario: Stale graph

- **GIVEN** `lastIndexedRef` is `"abc1234"`
- **WHEN** the current VCS ref is `"def5678"`
- **THEN** the graph SHALL be considered stale

#### Scenario: Fresh graph

- **GIVEN** `lastIndexedRef` is `"abc1234"`
- **WHEN** the current VCS ref is `"abc1234"`
- **THEN** the graph SHALL be considered fresh

#### Scenario: Unknown staleness

- **GIVEN** `lastIndexedRef` is `null`
- **WHEN** staleness is checked
- **THEN** the staleness state SHALL be unknown
- **AND** the system SHALL NOT treat it as stale

### Requirement: Graph derivation freshness

#### Scenario: Derivation mismatch despite matching VCS ref

- **GIVEN** `lastIndexedRef` is `"abc1234"`
- **AND** the current VCS ref is also `"abc1234"`
- **AND** the persisted graph fingerprint differs from the fingerprint computed for the current config and code-graph package version
- **WHEN** freshness is checked
- **THEN** VCS freshness remains fresh
- **AND** derivation freshness is reported as mismatched

#### Scenario: Derivation fingerprint absent remains unknown

- **GIVEN** the graph store has no persisted graph fingerprint
- **WHEN** derivation freshness is checked
- **THEN** the derivation-freshness state is unknown rather than silently treated as matching

### Requirement: Warn-not-block policy

#### Scenario: Stale graph still returns results

- **GIVEN** the graph is stale
- **WHEN** `graph stats` is executed
- **THEN** a staleness warning SHALL be displayed
- **AND** the command SHALL still return results from the current graph data

### Requirement: Derivation mismatch policy

#### Scenario: Read command surfaces derivation mismatch without blocking

- **GIVEN** the persisted graph fingerprint differs from the fingerprint computed for the current run
- **WHEN** `graph stats` is executed
- **THEN** the command returns graph results
- **AND** the output explicitly indicates a derivation mismatch

#### Scenario: graph index repairs derivation mismatch by full rebuild

- **GIVEN** the persisted graph fingerprint differs from the fingerprint computed for the current run
- **WHEN** `graph index` is executed
- **THEN** the command either performs a full rebuild with a visible reason
- **OR** fails with a clear message requiring an explicit force re-index

#### Scenario: Derivation mismatch is independent from stale-by-VCS

- **GIVEN** the current VCS ref differs from `lastIndexedRef`
- **AND** the persisted graph fingerprint also differs from the fingerprint computed for the current run
- **WHEN** graph freshness diagnostics are rendered
- **THEN** the output can distinguish both stale-by-VCS and derivation-mismatch states

### Requirement: GraphStatistics extension

#### Scenario: lastIndexedRef in statistics

- **WHEN** `getStatistics()` is called
- **THEN** the returned `GraphStatistics` SHALL include `lastIndexedRef`
- **AND** its value SHALL match the stored meta key

### Requirement: Staleness in graph stats output

#### Scenario: Text output with stale graph

- **GIVEN** `lastIndexedRef` is `"abc1234def"`
- **AND** the current VCS ref is `"fff9999aaa"`
- **WHEN** `graph stats` is run in text mode
- **THEN** a line `⚠ Graph is stale (indexed at abc1234, current: fff9999)` SHALL appear after `Last indexed`

#### Scenario: Text output with null ref

- **GIVEN** `lastIndexedRef` is `null`
- **WHEN** `graph stats` is run in text mode
- **THEN** no staleness line SHALL be shown

#### Scenario: JSON output includes staleness fields

- **WHEN** `graph stats --format json` is run
- **THEN** the output SHALL include `stale` (boolean or null) and `currentRef` (string or null) fields

### Requirement: Centralized index lock control

#### Scenario: Assert unlocked passes when no lock file exists

- **GIVEN** no index.lock file exists in `.specd/config/graph/`
- **WHEN** `assertGraphIndexUnlocked()` is called
- **THEN** it completes without throwing

#### Scenario: Assert unlocked throws when lock file exists

- **GIVEN** an index.lock file exists in `.specd/config/graph/`
- **WHEN** `assertGraphIndexUnlocked()` is called
- **THEN** it throws an error indicating the graph is being indexed

#### Scenario: Lock acquisition and release lifecycle

- **GIVEN** no lock file exists
- **WHEN** `acquireGraphIndexLock()` is called
- **THEN** the lock file is created containing the current process PID
- **AND** calling the returned release callback removes the lock file

### Requirement: Effective configuration building

#### Scenario: Effective configuration merges overrides

- **GIVEN** project config with `excludePaths: ["foo"]`
- **WHEN** `buildProjectGraphConfig` is called with overrides `excludePaths: ["bar"]`
- **THEN** the returned effective configuration's `excludePaths` contains both `"foo"` and `"bar"`

### Requirement: Bootstrap fallback configuration

#### Scenario: Bootstrap fallback config has synthetic single default workspace

- **GIVEN** a directory with no `specd.yaml` config file
- **WHEN** bootstrap configuration is requested for `/tmp/project`
- **THEN** it returns a `SpecdConfig` where `workspaces` contains exactly one workspace named `"default"`
- **AND** `workspaces[0].codeRoot` is `/tmp/project`

#### Scenario: createBootstrapGraphConfig is unit tested

- **GIVEN** `createBootstrapGraphConfig` is called with `{ projectRoot: '/tmp/project', vcsRoot: '/tmp/project' }`
- **WHEN** the returned config is inspected
- **THEN** `workspaces` contains exactly one workspace named `default`
- **AND** `workspaces[0].codeRoot` is `/tmp/project`
