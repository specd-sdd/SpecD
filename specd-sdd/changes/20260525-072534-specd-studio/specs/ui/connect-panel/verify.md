# Verification: Connect Panel

## Requirements

### Requirement: view is composed using shadcn primitives

#### Scenario: Form built with shadcn primitives

- **WHEN** component renders
- **THEN** it uses shadcn `Input`, `Label`, `Button`, and `Card`/`Dialog` primitives
- **AND** standard focus and validation styles apply

### Requirement: connect panel collects API URL and optional token

#### Scenario: Test connection calls GET /v1/project

- **WHEN** user enters base URL and clicks Test connection
- **THEN** request succeeds before profile save
- **AND** auth type is shown from response

#### Scenario: Saved profile restores on reload

- **GIVEN** user saved URL and token
- **WHEN** app reloads
- **THEN** profile loads from storage
- **AND** IDE can mount without re-entry

#### Scenario: Invalid URL shows connection error

- **WHEN** Test connection targets unreachable host
- **THEN** human-readable error is shown
- **AND** profile is not saved

### Requirement: connect panel displays auth type from API only

#### Scenario: Auth type shown from API response

- **GIVEN** test connection succeeded
- **WHEN** connect panel renders status
- **THEN** UI shows `auth.type` from JSON
- **AND** specd.yaml is not read in renderer

#### Scenario: Secrets are not displayed

- **GIVEN** response includes auth metadata only
- **WHEN** panel renders
- **THEN** no tokens from server are shown
- **AND** user token field remains local

#### Scenario: Mismatching auth type still allows connect

- **GIVEN** remote server uses `disabled`
- **WHEN** user saves profile
- **THEN** Studio stores profile
- **AND** client omits Bearer for disabled

### Requirement: embedded Studio skips connect panel gating

#### Scenario: Embedded mode opens IDE directly

- **GIVEN** `specd ui serve` embedded configuration
- **WHEN** user opens the served URL
- **THEN** `<SpecdApp>` renders without connect form

#### Scenario: Embedded API calls use same-origin /v1

- **GIVEN** embedded profile is active
- **WHEN** hooks load project data
- **THEN** requests target `/v1` on the served origin
- **AND** no remote base URL is configured

#### Scenario: Connect panel is not mounted in embedded mode

- **WHEN** shell renders for embedded bootstrap
- **THEN** connect form component is absent
- **AND** user lands directly in the IDE layout
