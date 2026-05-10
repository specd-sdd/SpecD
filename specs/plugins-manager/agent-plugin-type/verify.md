# Verification: plugin-manager:agent-plugin-type

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

#### Scenario: Has install and uninstall

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** `install(config, options)` or `uninstall(config, options)` is called
- **THEN** the plugin executes the requested operation using the provided configuration

### Requirement: isAgentPlugin type guard

#### Scenario: Rejects plugin without install method

- **GIVEN** a SpecdPlugin with `type: 'agent'` but no `install` method
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`

#### Scenario: Rejects plugin with wrong type

- **GIVEN** a SpecdPlugin with `install` and `uninstall` methods but `type` is not `'agent'`
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`

### Requirement: AgentInstallOptions

#### Scenario: Options include skills filter and variables

- **WHEN** `AgentInstallOptions` is used
- **THEN** it accepts optional `skills` array and `variables` record

### Requirement: AgentInstallResult

#### Scenario: Result tracks installed and skipped skills

- **WHEN** `AgentInstallResult` is returned
- **THEN** it contains `installed` array with skill and path
- **AND** `skipped` array with skill and reason
