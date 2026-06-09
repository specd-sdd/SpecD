# Verification: project context command

## Requirements

### Requirement: Optimization warning signal

#### Scenario: Displays warning when project cache is stale

- **GIVEN** `llmOptimizedContext: true`
- **AND** project metadata is stale
- **WHEN** `specd project context --format text` is run
- **THEN** a warning is displayed at the top
