# Verification: project update-metadata command

## Requirements

### Requirement: Input payload

#### Scenario: Accepts optimized context via stdin

- **WHEN** `specd project update-metadata` is called with `{ "optimizedContext": "..." }` via stdin
- **THEN** it passes the payload to the use case

#### Scenario: Accepts optimized context via --file

- **GIVEN** a file `payload.json` with `{ "optimizedContext": "..." }`
- **WHEN** `specd project update-metadata --file payload.json` is run
- **THEN** it reads the file and passes the payload to the use case

### Requirement: Delegation

#### Scenario: Invokes use case

- **WHEN** the command is run
- **THEN** it calls `UpdateProjectMetadata.execute()`
