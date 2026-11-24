# Verification: plugin-manager:agent-plugin-type

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

#### Scenario: Has install and uninstall

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** `install(context)` or `uninstall(context)` is called with `context.config` and `context.options`
- **THEN** the plugin executes the requested operation using the provided configuration

#### Scenario: Selected contributions are passed

- **GIVEN** `specd.yaml` selects only the agent contribution `claude`
- **WHEN** the plugin is installed
- **THEN** `context.contributions` is `['claude']`

### Requirement: Agents contribution kind handler

#### Scenario: Agents block validated

- **GIVEN** a manifest with `contributes.agents.claude` set to `{}`
- **WHEN** the plugin is loaded
- **THEN** the block is accepted

#### Scenario: Unknown field rejected

- **GIVEN** `contributes.agents.claude` contains an unknown field
- **WHEN** the plugin is loaded
- **THEN** loading fails with `PluginValidationError`

#### Scenario: No runtime activation

- **GIVEN** an agent plugin is configured
- **WHEN** a host registers plugins at runtime
- **THEN** nothing is registered on the kernel builder for the `agents` kind
- **AND** `init` is still called on the plugin

#### Scenario: Built-in handler needs no host wiring

- **GIVEN** a loader or `registerPlugins` created without any handlers
- **WHEN** a plugin declaring `contributes.agents` is loaded
- **THEN** loading succeeds

#### Scenario: Invalid id key rejected

- **GIVEN** `contributes.agents` has the key `Bad.Id`
- **WHEN** the plugin is loaded
- **THEN** `PluginValidationError` is thrown

#### Scenario: Declaring agents without install or uninstall rejected

- **GIVEN** a manifest declaring `agents` and a plugin without `uninstall`
- **WHEN** the plugin is loaded
- **THEN** `PluginValidationError` naming the plugin is thrown

### Requirement: isAgentPlugin type guard

#### Scenario: Rejects plugin without install method

- **GIVEN** a SpecdPlugin with no `install` method
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`

#### Scenario: Rejects plugin without uninstall method

- **GIVEN** a SpecdPlugin with `install` but no `uninstall`
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`

#### Scenario: Accepts plugin with install and uninstall

- **GIVEN** a SpecdPlugin with `install` and `uninstall` functions
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `true`

### Requirement: AgentInstallOptions

#### Scenario: Options include skills and agents filter, recursive variables, and capability identifiers

- **GIVEN** a request to install specific skills and agents
- **WHEN** `AgentInstallOptions` is provided
- **THEN** it can filter by `skills` and `agents` arrays
- **AND** it includes `variables` and `capabilities`

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

### Requirement: Agent installation and fallback

#### Scenario: Agent installed in agents directory

- **GIVEN** `capabilities` includes `agents`
- **WHEN** the plugin installs an agent
- **THEN** the agent file is written to the runtime's agents directory

#### Scenario: Agent fallback to shared directory

- **GIVEN** `capabilities` does not include `agents`
- **WHEN** the plugin installs an agent
- **THEN** the agent file is written next to `shared.md` and not to the agents directory
