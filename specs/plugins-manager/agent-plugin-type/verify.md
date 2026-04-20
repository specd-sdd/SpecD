# Verification: plugin-manager:agent-plugin-type

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

#### Scenario: Has install and uninstall

- **WHEN** an AgentPlugin is created
- **THEN** it has `install()` and `uninstall()` methods

### Requirement: isAgentPlugin type guard

#### Scenario: Rejects plugin without install method

- **GIVEN** a SpecdPlugin with `type: 'agent'` but no `install` method
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`

#### Scenario: Rejects plugin with wrong type

- **GIVEN** a SpecdPlugin with `install` and `uninstall` methods but `type` is not `'agent'`
- **WHEN** `isAgentPlugin` is called
- **THEN** it returns `false`
