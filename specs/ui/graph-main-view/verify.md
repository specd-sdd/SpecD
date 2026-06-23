# Verification: Graph Main View

## Requirements

### Requirement: view renders graph overview and index controls

#### Scenario: Graph status is rendered

- **GIVEN** `GraphMainView` is active
- **WHEN** the view loads
- **THEN** it calls `getGraphStatus`
- **AND** it renders the "Ready", "Stale", or "Off" status
- **AND** it renders counts for Specs, Files & Docs, and Symbols

#### Scenario: Reindex triggers API and output log

- **GIVEN** `GraphMainView` is active
- **WHEN** the user clicks "Force Reindex"
- **THEN** it calls `indexGraph({ force: false })`
- **AND** it pushes an info message to the Output panel

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
