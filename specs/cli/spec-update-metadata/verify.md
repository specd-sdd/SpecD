# Verification: spec update-metadata command

## Requirements

### Requirement: Command signature

#### Scenario: Rejects missing spec ID

- **WHEN** `specd spec update-metadata` is run without arguments
- **THEN** it exits with code 1

### Requirement: Partial schema input

#### Scenario: Reads from stdin

- **WHEN** `echo 'optimizedDescription: "test"' | specd spec update-metadata core:config` is run
- **THEN** it parses the YAML from stdin successfully

#### Scenario: Reads from --file

- **GIVEN** a file `payload.yaml` with `optimizedDescription: "test"`
- **WHEN** `specd spec update-metadata core:config --file payload.yaml` is run
- **THEN** it reads the file successfully

### Requirement: Delegation

#### Scenario: Invokes use case

- **WHEN** a valid partial payload is provided
- **THEN** the command invokes `UpdateSpecMetadata.execute()` with the correct spec ID and payload
