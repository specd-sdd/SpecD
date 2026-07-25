# Verification: Spec Invalidate-Metadata

## Requirements

### Requirement: spec invalidate-metadata is removed

#### Scenario: invalidate-metadata command is not registered

- **WHEN** the CLI `spec` parent command's subcommands are inspected
- **THEN** no `invalidate-metadata` command, or any alias of it, is registered

#### Scenario: Callers needing a guaranteed rebuild use generate-metadata instead

- **GIVEN** a caller needs a guaranteed metadata rebuild
- **WHEN** the caller looks for a supported CLI command
- **THEN** it uses `specd spec generate-metadata`
- **AND** `specd spec invalidate-metadata` is not available
