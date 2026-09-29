# Verification: List Guides Query

## Requirements

### Requirement: GuideCatalogPort Contract

#### Scenario: Mock catalog port returns summaries

- **GIVEN** an in-memory test implementation of `GuideCatalogPort` containing 3 guide summaries
- **WHEN** `listGuides()` is called on the port
- **THEN** it resolves to an array of 3 `GuideSummary` objects
- **AND** does not throw

#### Scenario: Port handles empty catalog gracefully

- **GIVEN** a catalog port initialized with 0 guides
- **WHEN** `listGuides()` is called
- **THEN** it returns an empty array `[]` without error

### Requirement: ListGuidesQuery Implementation

#### Scenario: Guides are ordered by sidebar_position ascending

- **GIVEN** guides with orders `[10, 1, 5, 2]`
- **WHEN** `ListGuidesQuery.execute()` is invoked
- **THEN** the returned summaries are ordered strictly with orders `[1, 2, 5, 10]`

#### Scenario: Guides with identical order are sorted alphabetically by topic

- **GIVEN** two guides both having `order: 5`, with topics `"workflow"` and `"deltas"`
- **WHEN** `ListGuidesQuery.execute()` is invoked
- **THEN** `"deltas"` appears before `"workflow"` in the returned array

#### Scenario: Guides with sparse or non-consecutive order values

- **GIVEN** guides with order values `[100, 1, 50]`
- **WHEN** `ListGuidesQuery.execute()` runs
- **THEN** the sort correctly places order `1` first, `50` second, and `100` third

#### Scenario: Immutability of returned array

- **GIVEN** the array returned by `ListGuidesQuery.execute()`
- **WHEN** an external caller attempts to mutate or push to the array
- **THEN** TypeScript marks the returned array as `readonly GuideSummary[]`
- **AND** internal catalog storage remains unaffected by external operations
