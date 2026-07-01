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

#### Scenario: Spec tabs use graph hooks for coverage and impact

- **WHEN** user opens spec `Coverage` or `Impact`
- **THEN** the hooks call `getSpecGraphView` and `getImpact({ spec })` through `client:port-graph`
- **AND** the view does not import graph or core logic directly

### Requirement: stale graph index shows warning affordances

#### Scenario: Stale flag shows warning badge

- **GIVEN** project poll session `projectStatus.graph.stale: true`
- **WHEN** graph entry renders
- **THEN** warning affordance visible
- **AND** copy suggests rebuild

#### Scenario: Fresh index hides warning

- **GIVEN** project poll session `projectStatus.graph.stale: false`
- **WHEN** graph entry renders
- **THEN** no stale banner
- **AND** last indexed time shown when available

#### Scenario: Rebuild clears warning after success

- **GIVEN** index was stale
- **WHEN** user completes index rebuild and project poll refetches
- **THEN** session store shows fresh graph slice
- **AND** warning removed
