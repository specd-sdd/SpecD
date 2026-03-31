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

#### Scenario: Command retrieves statistics and resolves VCS ref in configured mode

- **WHEN** `graph stats` is executed with discovered or explicit config
- **THEN** the command SHALL create a provider, open it, call `getStatistics()`, resolve the current VCS ref, output results, close the provider, and exit with code 0

#### Scenario: Missing config falls back to bootstrap mode

- **GIVEN** no `specd.yaml` is found by autodiscovery
- **WHEN** `graph stats` is executed inside a repository
- **THEN** the command SHALL resolve the VCS root and open the graph in bootstrap mode as workspace `default`

#### Scenario: VCS detection failure is graceful

- **GIVEN** the project has no VCS (e.g. no `.git/` directory)
- **WHEN** `graph stats` is executed
- **THEN** `currentRef` SHALL be `null`
- **AND** the command SHALL proceed without error

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

#### Scenario: JSON output includes staleness fields

- **WHEN** `graph stats --format json` is run
- **THEN** the output SHALL include `stale` (boolean or null) and `currentRef` (string or null) fields

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
