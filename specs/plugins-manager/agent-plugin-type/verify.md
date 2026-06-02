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

#### Scenario: Options include skills filter, recursive variables, and capability identifiers

- **WHEN** `AgentInstallOptions` is used
- **THEN** it accepts an optional `skills` array
- **AND** it accepts optional recursive `variables`
- **AND** it accepts optional `capabilities` as a list of strings

#### Scenario: Initial capability identifiers are required by the contract

- **WHEN** the install-time agent capability contract is reviewed
- **THEN** it defines `mcp`, `agents`, and `frontmatter` as the initial required capability identifiers

#### Scenario: Plugins do not pass pre-normalized capability objects

- **WHEN** an agent plugin prepares install options
- **THEN** it passes capability identifiers only
- **AND** it does not pass pre-normalized capability objects into `@specd/skills`

#### Scenario: Frontmatter data travels through variables.frontmatter

- **WHEN** an agent plugin prepares install options
- **THEN** frontmatter data is stored under `variables.frontmatter`
- **AND** nested frontmatter data remains addressable as template variables

#### Scenario: sharedFolder travels through variables.sharedFolder

- **WHEN** an agent plugin overrides the shared template install location
- **THEN** it passes that value through `variables.sharedFolder`
- **AND** the value remains relative to the project root

### Requirement: AgentInstallResult

#### Scenario: Result tracks installed and skipped skills

- **WHEN** `AgentInstallResult` is returned
- **THEN** it contains `installed` array with skill and path
- **AND** `skipped` array with skill and reason
