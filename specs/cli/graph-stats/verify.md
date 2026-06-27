# Verification: Graph Stats

## Requirements

### Requirement: Command signature

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph stats --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly

#### Scenario: Explicit path enters bootstrap mode

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph stats --path /tmp/repo` is run
- **THEN** config discovery is ignored
- **AND** the command opens the graph for a synthetic single workspace `default` rooted at `/tmp/repo`

#### Scenario: Mutually exclusive context flags fail fast

- **WHEN** `specd graph stats --config ./specd.yaml --path .` is run
- **THEN** the command exits with code 1 before any graph provider is opened

### Requirement: Statistics retrieval

#### Scenario: Command delegates health to GetGraphHealth

- **WHEN** `specd graph stats` is executed in configured mode with kernel available
- **THEN** it calls `GetGraphHealth.execute()` with workspaces from `ListWorkspaces`
- **AND** it does not call `isGraphStale` or `detectFingerprintMismatch` directly in the command handler

#### Scenario: Command obtains orchestrated project structure

- **WHEN** `specd graph stats` is executed in configured mode
- **THEN** it calls `ListWorkspaces` to obtain the rich workspace list
- **AND** it passes that list to `GetGraphHealth` for fingerprint comparison

### Requirement: Concurrent indexing guard

#### Scenario: Stats fail fast while the indexing lock is present

- **GIVEN** a `graph index` process currently holds the shared graph indexing lock
- **WHEN** `specd graph stats` is run
- **THEN** the command exits with code 3 before opening the provider
- **AND** it prints a short retry-later message explaining that the graph is currently being indexed

### Requirement: Output format

#### Scenario: Text output with fresh graph

- **GIVEN** `lastIndexedRef` equals the current VCS ref
- **WHEN** `graph stats` is run in text mode
- **THEN** no staleness warning line SHALL be shown

#### Scenario: Text output with stale graph

- **GIVEN** `lastIndexedRef` is `"abc1234def"` and the current VCS ref is `"fff9999aaa"`
- **WHEN** `graph stats` is run in text mode
- **THEN** a line `⚠ Graph is stale (indexed at abc1234, current: fff9999)` SHALL appear after `Last indexed`

#### Scenario: Text output with null ref

- **GIVEN** `lastIndexedRef` is `null`
- **WHEN** `graph stats` is run in text mode
- **THEN** no staleness line SHALL be shown

#### Scenario: Text output with derivation fingerprint mismatch

- **GIVEN** the stored derivation fingerprint differs from the fingerprint computed for the current effective graph configuration
- **WHEN** `graph stats` is run in text mode
- **THEN** stderr contains `⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index`

#### Scenario: Text output includes document counts

- **GIVEN** the graph contains 459 files, 18 documents, 1497 symbols, and 122 specs
- **WHEN** `graph stats` is run in text mode
- **THEN** stdout contains `Files:     459`
- **AND** stdout contains `Documents: 18`
- **AND** stdout contains `Symbols:   1497`

#### Scenario: JSON output includes staleness fields

- **WHEN** `graph stats --format json` is run
- **THEN** the output SHALL include `stale` (boolean or null), `currentRef` (string or null), and `fingerprintMismatch`

#### Scenario: JSON stale field values

- **GIVEN** the graph is stale
- **WHEN** `graph stats --format json` is run
- **THEN** `stale` SHALL be `true`
- **AND** `currentRef` SHALL be the current VCS ref string

### Requirement: Error cases

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened (e.g. database file is corrupted)
- **WHEN** `specd graph stats` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3
