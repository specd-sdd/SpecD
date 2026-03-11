# Verification: change deps

## Requirements

### Requirement: Command signature

#### Scenario: Add deps to a spec in the change

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth auth/login --add auth/shared --add auth/jwt`
- **THEN** the command exits with code 0
- **AND** the output is:
  ```
  updated deps for auth/login in change add-auth
  dependsOn: auth/shared, auth/jwt
  ```

#### Scenario: Remove deps from a spec in the change

- **GIVEN** a change `add-auth` with `specDependsOn: { "default:auth/login": ["default:auth/shared", "default:auth/jwt"] }`
- **WHEN** `specd change deps add-auth auth/login --remove auth/jwt`
- **THEN** the command exits with code 0
- **AND** the output includes `dependsOn: auth/shared`

#### Scenario: Set (replace) deps for a spec

- **GIVEN** a change `add-auth` with existing deps for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --set auth/session`
- **THEN** the command exits with code 0
- **AND** the output includes `dependsOn: auth/session`
- **AND** previous deps are fully replaced

### Requirement: Output

#### Scenario: JSON output format

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth auth/login --add auth/shared --format json`
- **THEN** the output is valid JSON with `result: "ok"`, `name`, `specId`, and `dependsOn` array

#### Scenario: No deps remaining shows none

- **GIVEN** a change with deps `["default:auth/shared"]` for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --remove auth/shared`
- **THEN** the output includes `dependsOn: (none)`

### Requirement: Error cases

#### Scenario: Error when change not found

- **WHEN** `specd change deps nonexistent auth/login --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the change was not found

#### Scenario: Error when specId not in change.specIds

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth billing/invoices --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the specId is not part of the change

#### Scenario: Error when --set used with --add

- **WHEN** `specd change deps add-auth auth/login --set auth/session --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates --set is mutually exclusive with --add/--remove

#### Scenario: Error when no flags provided

- **WHEN** `specd change deps add-auth auth/login`
- **THEN** the command exits with code 1
- **AND** stderr indicates at least one of --add, --remove, or --set is required

#### Scenario: Error when removing non-existent dep

- **GIVEN** a change `add-auth` with no deps for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --remove auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the dep was not found
