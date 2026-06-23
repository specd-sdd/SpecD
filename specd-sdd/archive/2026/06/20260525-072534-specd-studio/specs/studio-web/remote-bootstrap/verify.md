# Verification: Remote Bootstrap

## Requirements

### Requirement: connection is required before SpecdApp mounts

#### Scenario: Cold start shows connect panel

- **WHEN** standalone web app loads
- **THEN** connect panel is visible
- **AND** `SpecdApp` is not mounted yet

#### Scenario: Successful health mounts IDE

- **WHEN** `GET /v1/project` succeeds
- **THEN** connect panel closes
- **AND** IDE layout renders

#### Scenario: Failed test keeps gate

- **WHEN** health check fails
- **THEN** connect panel remains
- **AND** error explains failure

### Requirement: connection profile persists locally

#### Scenario: Saved profile restores URL on reload

- **GIVEN** user saved remote profile
- **WHEN** browser reloads standalone web app
- **THEN** URL prefilled from localStorage
- **AND** user can connect without retyping host

#### Scenario: Token persistence follows remember setting

- **WHEN** user connects without remember token
- **THEN** token not in localStorage
- **AND** session may keep token in memory only

#### Scenario: Clear profile removes stored entry

- **WHEN** user clears saved connection
- **THEN** localStorage entry removed
- **AND** connect gate shows on next load
