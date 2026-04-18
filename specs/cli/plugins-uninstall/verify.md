# Verification: cli:cli/plugins-uninstall

## Requirements

### Requirement: Command signature

#### Scenario: Uninstall multiple plugins

- **WHEN** `specd plugins uninstall @specd/plugin-agent-claude @specd/plugin-agent-copilot` is invoked
- **THEN** both plugins are uninstalled

### Requirement: Exit code

#### Scenario: Uninstall failure

- **WHEN** any plugin fails to uninstall
- **THEN** the command exits with code 1
