# Verification: Serve Ui

## Requirements

### Requirement: ui serve inherits serve-api flags plus open and ui-dist

#### Scenario: ui serve accepts port host auth flags

- **WHEN** `specd ui serve --port 4500 --auth disabled` runs
- **THEN** API listens on 4500
- **AND** auth behavior matches serve-api

#### Scenario: open flag launches default browser

- **WHEN** `specd ui serve --open` runs
- **THEN** browser opens served URL
- **AND** process keeps serving

#### Scenario: ui-dist flag forwarded to static middleware

- **WHEN** `specd ui serve --ui-dist ./dist` runs
- **THEN** static handler reads ./dist
- **AND** SPA fallback uses same root

### Requirement: ui serve mounts static UI distribution

#### Scenario: Root path serves Studio shell

- **WHEN** browser requests `/`
- **THEN** `index.html` returned
- **AND** asset links resolve under `/assets`

#### Scenario: API and static share process

- **WHEN** `specd ui serve` is running
- **THEN** `/v1/project` responds
- **AND** static and API ports match

#### Scenario: Missing ui-dist fails at startup

- **GIVEN** `--ui-dist` points to empty directory
- **WHEN** ui serve starts
- **THEN** non-zero exit or warning
- **AND** user told to build UI first

### Requirement: embedded Studio skips remote connect gate

#### Scenario: Same-origin load mounts SpecdApp immediately

- **GIVEN** UI served from same host as API
- **WHEN** browser opens served URL
- **THEN** connect panel skipped
- **AND** IDE layout visible

#### Scenario: Remote profile still shows connect gate in web build

- **GIVEN** standalone web bundle against remote API
- **WHEN** app loads without stored profile
- **THEN** connect panel shown
- **AND** SpecdApp not mounted until health succeeds

#### Scenario: Embedded profile uses relative /v1 base

- **WHEN** hook fetches project
- **THEN** fetch URL is same-origin `/v1/project`
- **AND** no manual host entry required
