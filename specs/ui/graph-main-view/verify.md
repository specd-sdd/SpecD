# Verification: Graph Main View

## Requirements

### Requirement: view renders graph overview and index controls

#### Scenario: Graph status is rendered

- **GIVEN** `GraphMainView` is active
- **WHEN** the view loads
- **THEN** it reads `projectStatus.graph` from the project poll session store
- **AND** it renders the "Ready", "Stale", or "Off" status
- **AND** it renders counts for Specs, Files & Docs, and Symbols from the graph slice

### Requirement: view surfaces graph health diagnostics in index status

#### Scenario: Stale graph shows warning messages in Index Status card

- **GIVEN** project poll session returns `graph.stale: true` and `graph.warnings` with `{ type: 'graph-stale', message: '...' }`
- **WHEN** `GraphMainView` renders
- **THEN** Index Status shows Stale label
- **AND** the warning `message` is visible in the card

#### Scenario: Fingerprint mismatch shows dedicated diagnostic

- **GIVEN** project poll session returns `graph.fingerprintMismatch: true` with a `graph-fingerprint-mismatch` warning
- **WHEN** `GraphMainView` renders
- **THEN** Index Status card shows the fingerprint warning message
- **AND** copy is distinct from stale-only messaging

#### Scenario: Healthy graph shows Ready without warning lines

- **GIVEN** project poll session returns `graph.stale: false`, `graph.fingerprintMismatch: false`, and `graph.warnings: []`
- **WHEN** `GraphMainView` renders
- **THEN** Index Status shows Ready
- **AND** no diagnostic warning lines are shown

### Requirement: view surfaces high-impact graph hotspots

#### Scenario: Hotspots are loaded and rendered

- **GIVEN** `GraphMainView` is active
- **WHEN** the view loads
- **THEN** it calls `getHotspots`
- **AND** renders the symbols with their risk levels (e.g., `CRITICAL`) and dependency counts

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: View uses hooks exclusively

- **WHEN** UI package dependency graph is inspected
- **THEN** `GraphMainView` imports from `context/specd-data-context.js`
- **AND** it does not import from `@specd/core`

### Requirement: view surfaces loading and error states

#### Scenario: Loading state is shown for hotspots

- **GIVEN** `getHotspots` is in flight
- **WHEN** the view renders
- **THEN** a loading indicator is displayed in the Hotspots section
