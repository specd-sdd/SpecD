# Hotspots — Verification Scenarios

## Requirements

### Requirement: Batch hotspot scoring

#### Scenario: Empty graph

- **WHEN** `computeHotspots` is called on an empty graph
- **THEN** it returns `{ entries: [], totalSymbols: 0 }`

#### Scenario: Cross-workspace caller signal outranks same-workspace caller signal

- **GIVEN** two symbols have the same number of same-workspace callers and the same file importer count
- **AND** one of them also has a cross-workspace caller
- **WHEN** `computeHotspots` ranks them
- **THEN** the symbol with cross-workspace caller evidence ranks at least as high as the same-workspace-only symbol

#### Scenario: Direct caller evidence outranks importer-only signal in the default view

- **GIVEN** symbol A has direct caller evidence
- **AND** symbol B has zero direct callers but its file has many importers
- **WHEN** hotspots are computed with the default view
- **THEN** symbol A is eligible for ranking based on its symbol-level evidence
- **AND** symbol B is not included solely because of file importer count

### Requirement: Risk level

#### Scenario: Default filters exclude LOW risk

- **WHEN** a symbol has score > 0 but risk level LOW
- **THEN** it is excluded from the default result (minRisk default is MEDIUM)

### Requirement: Smart defaults with automatic removal

#### Scenario: Default kind set focuses the hotspot view

- **WHEN** `computeHotspots` is called with no explicit kind filter
- **THEN** only `class`, `method`, and `function` symbols are eligible for the default hotspot view

#### Scenario: Default view excludes importer-only symbols

- **WHEN** a symbol has zero direct callers and its file has many importers
- **AND** `computeHotspots` is called with default options
- **THEN** that symbol is excluded from the default result

#### Scenario: Explicit kind filter removes default kind set

- **WHEN** `computeHotspots` is called with an explicit kind filter outside the default set
- **THEN** the explicit kind filter is applied as requested
- **AND** the default kind set is not merged in

#### Scenario: Explicit minRisk changes only the risk threshold

- **WHEN** `computeHotspots` is called with `minRisk: 'HIGH'`
- **THEN** the effective risk threshold is `HIGH`
- **AND** the default kind set and importer-only exclusion still apply

#### Scenario: Explicit limit changes only the result size

- **WHEN** `computeHotspots` is called with `limit: 50`
- **THEN** the effective limit is `50`
- **AND** the default kind set and importer-only exclusion still apply

#### Scenario: Explicit importer-only inclusion widens the query

- **WHEN** `computeHotspots` is called with `includeImporterOnly: true`
- **THEN** importer-only symbols may be included
- **AND** the score and risk thresholds still follow `minScore` and `minRisk` independently

### Requirement: Filtering

#### Scenario: --min-risk filter

- **WHEN** `minRisk` is set to HIGH
- **THEN** only symbols with risk HIGH or CRITICAL are returned

#### Scenario: Workspace filter

- **WHEN** `workspace` is set to "core"
- **THEN** only symbols whose filePath starts with "core:" are returned

#### Scenario: Multi-kind filter

- **WHEN** `kinds` is set to `['class', 'method']`
- **THEN** only symbols with kind `class` or `method` are returned

### Requirement: Output

#### Scenario: Ranking order

- **WHEN** the graph contains symbols A (score 15), B (score 8), C (score 3)
- **THEN** entries are ordered \[A, B, C] by score descending

#### Scenario: Limit

- **WHEN** limit is 5 and there are 20 eligible symbols
- **THEN** only the top 5 by score are returned

#### Scenario: totalSymbols reflects full graph

- **WHEN** the graph has 100 symbols but only 10 pass filters
- **THEN** `totalSymbols` is 100 and `entries` has length 10
