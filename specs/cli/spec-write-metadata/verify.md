# Verification: Spec Write-Metadata

## Requirements

### Requirement: spec write-metadata is removed

#### Scenario: write-metadata command is not registered

- **WHEN** the CLI `spec` parent command's subcommands are inspected
- **THEN** no `write-metadata` command, or any alias of it, is registered

#### Scenario: No command accepts arbitrary metadata content

- **WHEN** any `spec` subcommand is inspected for stdin, `--file`, or `--input` handling
- **THEN** none accepts arbitrary metadata content through those channels

#### Scenario: Agents persist optimized fields through spec optimizations set

- **GIVEN** an agent needs to persist an LLM-optimized description or context
- **WHEN** the agent looks for a supported CLI command
- **THEN** it uses `specd spec optimizations set`
- **AND** `specd spec write-metadata` is not available
