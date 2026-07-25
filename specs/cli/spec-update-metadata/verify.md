# Verification: spec update-metadata command

## Requirements

### Requirement: spec update-metadata is removed

#### Scenario: update-metadata command is not registered

- **WHEN** the CLI `spec` parent command's subcommands are inspected
- **THEN** no `update-metadata` command, or any alias of it, is registered

#### Scenario: Agents persist optimized fields through spec optimizations set

- **GIVEN** an agent needs to persist an LLM-optimized description or context
- **WHEN** the agent looks for a supported CLI command
- **THEN** it uses `specd spec optimizations set`
- **AND** `specd spec update-metadata` is not available
