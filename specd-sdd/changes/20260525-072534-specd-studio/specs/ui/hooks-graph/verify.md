# Verification: Hooks Graph

## Requirements

### Requirement: graph hooks expose port-graph operations to views

#### Scenario: Graph status hook calls port-graph

- **WHEN** graph sidebar entry mounts
- **THEN** `getGraphStatus` invoked
- **AND** freshness shown in UI

#### Scenario: Search hook delegates to port

- **WHEN** user runs symbol search in graph view
- **THEN** `searchGraph` called
- **AND** results rendered from DTO

#### Scenario: Index action uses mutate path

- **WHEN** user clicks rebuild index
- **THEN** `indexGraph` port method runs
- **AND** status refetch follows

### Requirement: stale graph index shows warning affordances

#### Scenario: Stale flag shows warning badge

- **GIVEN** status returns `stale: true`
- **WHEN** graph entry renders
- **THEN** warning affordance visible
- **AND** copy suggests rebuild

#### Scenario: Fresh index hides warning

- **GIVEN** status returns `stale: false`
- **WHEN** graph entry renders
- **THEN** no stale banner
- **AND** last indexed time shown

#### Scenario: Rebuild clears warning after success

- **GIVEN** index was stale
- **WHEN** user completes index rebuild
- **THEN** status refetch shows fresh
- **AND** warning removed
