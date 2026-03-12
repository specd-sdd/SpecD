# Verification: Config Show

## Requirements

### Requirement: Output format

#### Scenario: Text output shows all sections

- **GIVEN** a valid `specd.yaml` with one workspace and storage paths configured
- **WHEN** `specd config show` is run
- **THEN** stdout contains `projectRoot`, `schemaRef`, `approvals`, `workspaces`, and `storage` sections
- **AND** all paths are absolute
- **AND** the process exits with code 0

#### Scenario: Approval gates shown correctly

- **GIVEN** `specd.yaml` has `approvals: { spec: true, signoff: false }`
- **WHEN** `specd config show` is run
- **THEN** stdout shows `spec=true` and `signoff=false`

#### Scenario: JSON output is full SpecdConfig

- **WHEN** `specd config show --format json` is run
- **THEN** stdout is valid JSON containing `projectRoot`, `schemaRef`, `workspaces`, `storage`, and `approvals`
- **AND** all path values are absolute strings
- **AND** the process exits with code 0

#### Scenario: Multiple workspaces listed

- **GIVEN** `specd.yaml` declares two workspaces `default` and `billing-ws`
- **WHEN** `specd config show` is run
- **THEN** both workspaces appear in the `workspaces` section with their `specsPath` and `ownership`

### Requirement: Error cases

#### Scenario: Config not found

- **GIVEN** CWD is not under any directory containing `specd.yaml`
- **WHEN** `specd config show` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message describing the discovery failure
