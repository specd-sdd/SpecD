# Verification: Graph Hotspots

## Requirements

### Requirement: Command signature

#### Scenario: Default hotspot filters apply when no explicit overrides are provided

- **WHEN** `specd graph hotspots` is run with no explicit filter flags
- **THEN** the command queries hotspots with default kinds `class,method,function`, importer-only symbols excluded, `minScore > 0`, `minRisk >= MEDIUM`, and `limit = 20`

#### Scenario: Explicit limit changes only the limit

- **WHEN** `specd graph hotspots --limit 50` is run
- **THEN** the command uses the explicit `limit = 50`
- **AND** it preserves the implicit default kind set, importer-only exclusion, and `minRisk >= MEDIUM`

#### Scenario: Explicit min-risk changes only the risk threshold

- **WHEN** `specd graph hotspots --min-risk HIGH` is run
- **THEN** the command uses the explicit `minRisk = HIGH`
- **AND** it preserves the implicit default kind set, importer-only exclusion, and limit `20`

#### Scenario: Explicit min-score changes only the score threshold

- **WHEN** `specd graph hotspots --min-score 0` is run
- **THEN** the command uses the explicit `minScore = 0`
- **AND** it preserves the implicit default kind set and importer-only exclusion

#### Scenario: Explicit importer-only inclusion widens the query

- **WHEN** `specd graph hotspots --include-importer-only` is run
- **THEN** importer-only symbols may be returned
- **AND** the command keeps the default kind set unless `--kind` is also provided

### Requirement: Context resolution

#### Scenario: Explicit config path bypasses discovery

- **GIVEN** the current directory would autodiscover a different `specd.yaml`
- **WHEN** `specd graph hotspots --config /tmp/other/specd.yaml` is run
- **THEN** the command uses `/tmp/other/specd.yaml` directly
- **AND** config autodiscovery is skipped

#### Scenario: Bootstrap mode via explicit path ignores config discovery

- **GIVEN** a `specd.yaml` exists under the current repository
- **WHEN** `specd graph hotspots --path /tmp/repo` is run
- **THEN** the command ignores config discovery
- **AND** it behaves as if `/tmp/repo` were a synthetic single-workspace project with workspace `default`

#### Scenario: Missing config falls back to bootstrap mode

- **GIVEN** no `specd.yaml` is found by autodiscovery
- **WHEN** `specd graph hotspots` is run inside a repository
- **THEN** the command falls back to bootstrap mode
- **AND** the resolved VCS root becomes the synthetic workspace `default` code root

### Requirement: Kind filter semantics

#### Scenario: Comma-separated kind list is preserved as multiple kinds

- **WHEN** `specd graph hotspots --kind class,method,function` is run
- **THEN** the command trims and validates the three tokens
- **AND** it passes all three kinds to the hotspot query layer

#### Scenario: Omitted --kind uses the default hotspot kind set

- **WHEN** `specd graph hotspots` is run without `--kind`
- **THEN** the command uses the default kind set `class,method,function`

#### Scenario: Explicit --kind replaces the default set

- **WHEN** `specd graph hotspots --kind interface` is run
- **THEN** the command queries only `interface` symbols
- **AND** it does not merge in `class`, `method`, or `function`
- **AND** it preserves the default risk threshold and limit unless they are also overridden

#### Scenario: Invalid kind token fails before querying

- **WHEN** `specd graph hotspots --kind class,unknownKind` is run
- **THEN** the command exits with a CLI error
- **AND** hotspot retrieval is not attempted

### Requirement: Hotspot retrieval

#### Scenario: All requested filters are delegated to the provider

- **WHEN** `specd graph hotspots --workspace core --kind class,method --file "src/*" --exclude-path "test/*" --exclude-workspace cli --limit 15 --min-score 3 --min-risk HIGH` is run
- **THEN** the provider receives the workspace, kind list, file, exclusion filters, limit, score threshold, and risk threshold exactly as requested

### Requirement: Concurrent indexing guard

#### Scenario: Hotspots fail fast while the indexing lock is present

- **GIVEN** a `graph index` process currently holds the shared graph indexing lock
- **WHEN** `specd graph hotspots` is run
- **THEN** the command exits with code 3 before opening the provider
- **AND** it prints a short retry-later message explaining that the graph is currently being indexed

### Requirement: Output format

#### Scenario: Text output shows ranked hotspot table

- **GIVEN** hotspot results exist
- **WHEN** `specd graph hotspots` is run in text mode
- **THEN** stdout shows the total returned entry count and total symbol count
- **AND** each row includes score, risk level, cross-workspace caller count, kind, symbol name, and workspace-qualified file location

#### Scenario: Empty result set in text mode

- **GIVEN** no hotspots match the active filters
- **WHEN** `specd graph hotspots` is run in text mode
- **THEN** stdout shows `No hotspots found.`

#### Scenario: JSON output includes derived workspace field

- **WHEN** `specd graph hotspots --format json` is run
- **THEN** stdout is a JSON object containing `totalSymbols` and `entries`
- **AND** each entry includes `symbol`, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, `riskLevel`, and `workspace`

### Requirement: Error cases

#### Scenario: Mutually exclusive context flags fail fast

- **WHEN** `specd graph hotspots --config ./specd.yaml --path .` is run
- **THEN** the command exits with a CLI error before any graph provider is opened

#### Scenario: Infrastructure error exits with code 3

- **GIVEN** the provider cannot be opened or hotspot retrieval fails due to an infrastructure error
- **WHEN** `specd graph hotspots` is run
- **THEN** stderr contains a `fatal:` prefixed error message
- **AND** the process exits with code 3

### Requirement: CLI reference documentation

#### Scenario: Command help documents default and explicit kind semantics

- **WHEN** `specd graph hotspots --help` is inspected
- **THEN** the help text documents `--kind` as a comma-separated list
- **AND** it documents the default kind set used when `--kind` is omitted
- **AND** it explains that an explicit `--kind` value fully replaces the default set
- **AND** it documents `--include-importer-only` as the explicit widening switch

#### Scenario: CLI reference documents graph hotspots bootstrap and kind semantics

- **WHEN** `docs/cli/cli-reference.md` is inspected
- **THEN** the `graph hotspots` documentation includes the command signature
- **AND** it documents `--kind` as a comma-separated list
- **AND** it documents the default kind set used when `--kind` is omitted
- **AND** it explains that an explicit `--kind` value fully replaces the default set
- **AND** it documents `--include-importer-only` as the explicit widening switch
- **AND** it documents `--config` and `--path`
- **AND** it states that `--path` and no-config fallback are bootstrap-only modes rather than the normal configured mode
