# Verification: plugin-manager:install-plugin-use-case

## Requirements

### Requirement: Input

#### Scenario: Input includes pluginName and config

- **WHEN** `InstallPlugin.execute()` is called
- **THEN** the input includes `pluginName` and `config`
- **AND** optional plugin-specific options

### Requirement: Output

#### Scenario: Output indicates success or failure

- **WHEN** `InstallPlugin.execute()` completes
- **THEN** output includes `success: boolean`, `message: string`, and optional `data`

### Requirement: Behavior

#### Scenario: Plugin not found

- **WHEN** InstallPlugin is executed with non-existent plugin
- **THEN** PluginNotFoundError is thrown

#### Scenario: Successful install

- **GIVEN** a valid `SpecdConfig` is provided
- **WHEN** InstallPlugin is executed with valid plugin and configuration
- **THEN** it returns success with message

#### Scenario: Loads plugin via PluginLoader

- **WHEN** InstallPlugin is executed
- **THEN** it loads the plugin via `PluginLoader`
- **AND** validates it is an `AgentPlugin`

### Requirement: Error handling

#### Scenario: Non-agent plugin rejected

- **GIVEN** a loaded plugin that is a valid SpecdPlugin but not an AgentPlugin
- **WHEN** `InstallPlugin.execute()` is called
- **THEN** `PluginValidationError` is thrown

### Requirement: Agent Initialization Phase

#### Scenario: Install delegates to AgentPlugin.install() which injects base prompt and deploys native assets

- **GIVEN** an `AgentPlugin` with target file `CLAUDE.md` and hook asset `specd-agent-init.sh`
- **WHEN** `InstallPlugin.execute()` runs
- **THEN** `plugin.install()` is executed
- **AND** `CLAUDE.md` contains the `<!-- <specd> -->` base prompt block
- **AND** `.claude/hooks/specd-agent-init.sh` is written to the project root

#### Scenario: Uninstall removes plugin-specific block from shared file while other plugins remain

- **GIVEN** `AGENTS.md` containing `<!-- <specd> -->` shared by two agent plugins with markers `<!-- <specd-plugin:opencode> -->` and `<!-- <specd-plugin:codex> -->`
- **WHEN** `UninstallPlugin.execute()` runs for the opencode plugin
- **THEN** `<!-- <specd-plugin:opencode> -->` is removed from `AGENTS.md`
- **AND** `AGENTS.md` retains the `<!-- <specd> -->` base block (codex still registered)

#### Scenario: Uninstall removes base block when last plugin is removed from shared file

- **GIVEN** `AGENTS.md` containing `<!-- <specd> -->` with only one remaining plugin marker `<!-- <specd-plugin:codex> -->`
- **WHEN** `UninstallPlugin.execute()` runs for the codex plugin
- **THEN** `<!-- <specd-plugin:codex> -->` is removed
- **AND** `<!-- <specd> -->` base block is also removed from `AGENTS.md`
