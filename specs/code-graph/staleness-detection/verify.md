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

### Requirement: Health orchestration use case

#### Scenario: Hosts use GetGraphHealth for diagnostics assembly

- **GIVEN** a host needs graph statistics with staleness and fingerprint fields
- **WHEN** it assembles health output
- **THEN** it delegates to `GetGraphHealth` rather than calling `isGraphStale` and fingerprint helpers inline

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

### Requirement: Current-content and coverage freshness

#### Scenario: Matching ref with dirty file is not fully fresh

- **GIVEN** VCS refs match but disk content differs or coverage failed
- **WHEN** health is computed
- **THEN** distinct dirty/coverage reason codes make absence inconclusive

#### Scenario: Dirty working tree fully represented by the index is current

- **GIVEN** tracked or untracked files differ from the current VCS revision
- **AND** the persisted index contains the same discovered file set and content hashes
- **WHEN** health is computed after indexing
- **THEN** content freshness is true even though the working tree is not clean
- **AND** derivation compatibility is computed from the effective workspace configuration

### Requirement: Code Graph version invalidation

#### Scenario: Package version changes derivation only

- **WHEN** the released Code Graph version changes
- **THEN** project/workspace fingerprints mismatch
- **AND** backend schema and `schema-std` versions remain independent

### Requirement: Monotonic workspace and graph freshness

#### Scenario: Proven stale state latches and short-circuits

- **GIVEN** the aggregate latch is false
- **WHEN** assessment proves one workspace or project-global input stale
- **THEN** the applicable workspace latch and aggregate latch are set atomically
- **AND** later health calls return stale without rescanning inputs

#### Scenario: Unknown evidence is transient

- **GIVEN** no input is proven stale
- **WHEN** stat, read, hash, repository, or VCS assessment fails
- **THEN** freshness is `unknown`
- **AND** no stale flag or latch is persisted
- **AND** a later assessment retries the evidence

### Requirement: Indexed resource freshness assessment

#### Scenario: Fast metadata path avoids hashing

- **GIVEN** an indexed input has matching mtime and size
- **WHEN** exact resource freshness is assessed
- **THEN** its content is not read or hashed
- **AND** the resource remains current

#### Scenario: Changed stamps distinguish equal and different content

- **GIVEN** an indexed input has changed mtime or size
- **WHEN** its current content is hashed
- **THEN** an equal hash refreshes the observation without marking stale
- **AND** a different or missing input is monotonically marked stale

#### Scenario: Targeted current evidence does not prove corpus completeness

- **GIVEN** an exact resource is current while another graph scope is stale or unknown
- **WHEN** an exact-resource consumer and a corpus-wide absence consumer assess freshness
- **THEN** the exact consumer may use the targeted current evidence
- **AND** the corpus-wide consumer retains global stale or unknown diagnostics

### Requirement: VCS and filesystem freshness scopes

#### Scenario: Shared repository diff is evaluated once

- **GIVEN** multiple workspaces share one VCS root
- **WHEN** their freshness is assessed
- **THEN** one normalized modified-path evaluation serves the group
- **AND** each workspace retains an independent latch
- **AND** persisted scope identity contains sorted workspace names but no absolute path

#### Scenario: Excluded-only VCS changes do not dirty the graph

- **GIVEN** `modifiedFiles` returns only paths excluded from every effective code, document, and spec channel
- **WHEN** Code Graph filters the complete adapter result
- **THEN** no file is statted or hashed for graph freshness
- **AND** workspace and aggregate latches remain unchanged

#### Scenario: Visible rename and deletion affect the fingerprint

- **GIVEN** a mixed diff contains excluded paths plus a visible deletion or rename side
- **WHEN** the scope fingerprint is built
- **THEN** only visible normalized `{ path, state, contentHash }` entries participate
- **AND** present and missing states remain distinct

#### Scenario: Non-VCS and hybrid scopes stop on proof

- **GIVEN** a non-VCS workspace or a VCS workspace indexing ignored untracked files
- **WHEN** visible membership and observations are compared
- **THEN** filesystem or hybrid assessment is used as applicable
- **AND** evaluation stops after the first proven mismatch
