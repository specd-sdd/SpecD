# Verification: plugin-manager:agent-plugin-type

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

#### Scenario: Has install and uninstall

- **WHEN** an AgentPlugin is created
- **THEN** it has `install()` and `uninstall()` methods
