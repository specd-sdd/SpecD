# Verification: Config Show

## Requirements

### Requirement: Output format

#### Scenario: Text output shows all sections

- **GIVEN** a valid config with one workspace, storage paths, and optional fields set (`contextIncludeSpecs`, `workflow`, `llmOptimizedContext`)
- **WHEN** `specd config show` is run
- **THEN** stdout contains `projectRoot`, `schemaRef`, `approvals`, `workspaces`, and `storage` sections
- **AND** stdout contains `contextIncludeSpecs` line
- **AND** stdout contains `llmOptimizedContext` line
- **AND** stdout contains `workflow` section with step entries
- **AND** all paths are absolute
- **AND** the process exits with code 0

#### Scenario: Approval gates shown correctly

- **GIVEN** `specd.yaml` has `approvals: { spec: true, signoff: false }`
- **WHEN** `specd config show` is run
- **THEN** stdout shows `spec=true` and `signoff=false`

#### Scenario: JSON output is full SpecdConfig

- **GIVEN** a config with `workflow`, `contextIncludeSpecs`, `context`, and `llmOptimizedContext` set
- **WHEN** `specd config show --format json` is run
- **THEN** stdout is valid JSON containing `projectRoot`, `schemaRef`, `workspaces`, `storage`, `approvals`
- **AND** JSON contains `workflow` array with step entries
- **AND** JSON contains `contextIncludeSpecs` array
- **AND** JSON contains `context` array
- **AND** JSON contains `llmOptimizedContext` boolean
- **AND** all path values are absolute strings
- **AND** the process exits with code 0

#### Scenario: Optional fields omitted when not set

- **GIVEN** a config with no `workflow`, `context`, `schemaOverrides`, or `schemaPlugins` set
- **WHEN** `specd config show --format json` is run
- **THEN** the JSON output does not contain `workflow`, `context`, `schemaOverrides`, or `schemaPlugins` keys

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
