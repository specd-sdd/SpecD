# Verification: change deps

## Requirements

### Requirement: Command signature

#### Scenario: Add deps to a spec in the change

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth auth/login --add auth/shared --add auth/jwt`
- **THEN** the command exits with code 0
- **AND** the output is:

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

#### Scenario: List all dependencies in the change

- **GIVEN** a change with multiple specs and some dependencies
- **WHEN** `specd change deps <name>` is run without `<specId>` or flags
- **THEN** the command exits with code 0
- **AND** the output lists all specs in the change and their dependencies

#### Scenario: Display dependencies for a specific spec

- **GIVEN** a change with `specIds: ['core:a']` and some dependencies for it
- **WHEN** `specd change deps <name> core:a` is run without flags
- **THEN** the command exits with code 0
- **AND** the output shows the dependencies for `core:a`

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

#### Scenario: Error when removing non-existent dep

- **GIVEN** a change `add-auth` with no deps for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --remove auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the dep was not found

#### Scenario: Error when modification flags provided without specId

- **WHEN** `specd change deps <name> --add core:other`
- **THEN** the command exits with code 1
- **AND** stderr indicates modification flags require a specId
