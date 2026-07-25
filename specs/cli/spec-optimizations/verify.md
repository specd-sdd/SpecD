# Verification: specs optimizations

## Requirements

### Requirement: Command signature

#### Scenario: Every subcommand accepts --format

- **WHEN** `specd specs optimizations get core:auth/login --format json` is run
- **THEN** the output is valid JSON

### Requirement: Get subcommand

#### Scenario: Text output marks a stale field with its staleness reasons

- **GIVEN** `optimizedContext` is stale with reasons `['artifact-changed', 'schema-changed']`
- **WHEN** `specd specs optimizations get core:auth/login` is run
- **THEN** the text output marks the field `STALE`
- **AND** the output lists both reasons

#### Scenario: JSON output includes full per-field and aggregate freshness unchanged

- **GIVEN** a mix of fresh and stale optimization fields
- **WHEN** `specd specs optimizations get core:auth/login --format json` is run
- **THEN** the JSON output includes each field's `freshness` and `reasons`, and the aggregate `fresh` value, exactly as returned by the use case

#### Scenario: Get on an uninitialized spec reports not-yet-initialized

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs optimizations get core:auth/login` is run
- **THEN** the command reports the spec is not yet initialized

#### Scenario: Get with --field for an absent field reports missing, not an error

- **GIVEN** persisted optimizations has only `optimizedDescription`
- **WHEN** `specd specs optimizations get core:auth/login --field optimizedContext` is run
- **THEN** the command reports the field as missing
- **AND** the command does not exit with an error

### Requirement: Set subcommand

#### Scenario: Set reads JSON from stdin with --input -

- **GIVEN** `{"optimizedDescription": "text"}` is piped to stdin
- **WHEN** `specd specs optimizations set core:auth/login --input -` is run
- **THEN** the command calls `Kernel.specs.updatePersistedOptimizations` with `set` equal to the parsed object

#### Scenario: Set rejects an unknown-key JSON shape at the CLI boundary

- **GIVEN** an `--input` file containing `{"unexpectedKey": "value"}`
- **WHEN** `specd specs optimizations set core:auth/login --input file.json` is run
- **THEN** the command exits with code 1 with an `error:` message
- **AND** `Kernel` is never called

#### Scenario: Set rejects invalid JSON before calling Core

- **GIVEN** an `--input` file containing malformed JSON
- **WHEN** `specd specs optimizations set core:auth/login --input file.json` is run
- **THEN** the command exits with code 1 with an `error: invalid JSON: <message>`
- **AND** `Kernel.specs.updatePersistedOptimizations` is never called

### Requirement: Clear subcommand

#### Scenario: Clear accepts multiple --field flags

- **WHEN** `specd specs optimizations clear core:auth/login --field optimizedDescription --field optimizedContext` is run
- **THEN** the command calls `Kernel.specs.updatePersistedOptimizations` with `clear` equal to both field names

#### Scenario: Clear result may be empty when the last field is removed

- **GIVEN** clearing removes the last remaining optimization field
- **WHEN** `specd specs optimizations clear core:auth/login --field optimizedDescription` is run
- **THEN** the printed result shows no remaining optimization values

### Requirement: No repeated CLI-owned mutation or freshness logic

#### Scenario: Handler never computes hashes or staleness reasons itself

- **WHEN** `specd specs optimizations get core:auth/login` is run
- **THEN** the handler performs exactly one call to `Kernel.specs.getPersistedOptimizations`
- **AND** the handler does not compute artifact hashes or staleness reasons directly

### Requirement: Error mapping

#### Scenario: Unknown spec maps to exit code 1

- **WHEN** `specd specs optimizations get core:unknown/spec` is run
- **THEN** the command exits with code 1
- **AND** stderr names the unresolved spec

#### Scenario: Concurrent modification maps to exit code 1 with retry guidance

- **GIVEN** `ArtifactConflictError` is thrown by the use case
- **WHEN** `specd specs optimizations set core:auth/login --input file.json` is run
- **THEN** the command exits with code 1
- **AND** stderr indicates a concurrent modification and instructs the user to retry

#### Scenario: Read-only workspace maps to exit code 1 without a configuration workaround

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** `specd specs optimizations set core:auth/login --input file.json` is run
- **THEN** the command exits with code 1
- **AND** stderr does not suggest a configuration workaround
