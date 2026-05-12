# Verification: plugin-agent-copilot:plugin-agent

## Requirements

### Requirement: Stub implementation

#### Scenario: Returns valid AgentPlugin

- **WHEN** `create()` is called
- **THEN** it returns an AgentPlugin with type 'agent'
