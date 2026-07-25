# Verification: specs implementation

## Requirements

### Requirement: Command signature

#### Scenario: Every subcommand accepts --format

- **WHEN** `specd specs implementation list core:auth/login --format toon` is run
- **THEN** the output is rendered in TOON format

### Requirement: List subcommand

#### Scenario: List distinguishes file-level entries from symbol-level entries

- **GIVEN** persisted implementation links with one file-level entry and one symbol-level entry
- **WHEN** `specd specs implementation list core:auth/login` is run
- **THEN** the output shows the file-level entry without symbols
- **AND** the output shows the symbol-level entry with its symbols

#### Scenario: List on an uninitialized spec reports not-yet-initialized distinctly

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs implementation list core:auth/login --format json` is run
- **THEN** the JSON output includes `initialized: false` rather than an empty list

### Requirement: Add subcommand

#### Scenario: Add with --symbol flags creates a symbol-level link

- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts --symbol login --symbol logout` is run
- **THEN** the command calls `Kernel.specs.updatePersistedImplementation` with `action: 'add'`, the raw file path, and both symbols
- **AND** the command prints the resulting persisted implementation link list

#### Scenario: Add without --symbol creates a file-level link

- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts` is run
- **THEN** the resulting link has no `symbols`

### Requirement: Remove subcommand

#### Scenario: Remove drops a single symbol from a multi-symbol link

- **GIVEN** a persisted symbol-level link with symbols `login` and `logout`
- **WHEN** `specd specs implementation remove core:auth/login --file src/login.ts --symbol logout` is run
- **THEN** the resulting link retains only `login`

### Requirement: No repeated CLI-owned mutation logic

#### Scenario: Handler performs no file-existence checks or path normalization itself

- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts` is run
- **THEN** the handler does not perform file-existence checks or canonical path normalization directly
- **AND** the handler delegates entirely to `Kernel.specs.updatePersistedImplementation`

### Requirement: Shared path semantics with change-time tracking

#### Scenario: Raw project-relative path is accepted without a canonical workspace:path form

- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts` is run with a raw relative path
- **THEN** the command does not require the user to supply a canonical `workspace:path` identity
- **AND** normalization is performed by `UpdatePersistedSpecImplementation`, not the CLI handler

### Requirement: Error mapping

#### Scenario: Nonexistent file path maps to exit code 1

- **GIVEN** `ImplementationFileNotFoundError` is thrown for a nonexistent `--file` path
- **WHEN** `specd specs implementation add core:auth/login --file does/not/exist.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr describes the invalid path

#### Scenario: Path outside the workspace boundary maps to exit code 1

- **GIVEN** `ImplementationWorkspaceBoundaryError` is thrown for an out-of-boundary path
- **WHEN** `specd specs implementation add core:auth/login --file ../outside/file.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr describes the invalid path

#### Scenario: Concurrent modification maps to exit code 1 with retry guidance

- **GIVEN** `ArtifactConflictError` is thrown by the use case
- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr indicates a concurrent modification and instructs the user to retry

#### Scenario: Read-only workspace maps to exit code 1 without a configuration workaround

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** `specd specs implementation add core:auth/login --file src/login.ts` is run
- **THEN** the command exits with code 1
- **AND** stderr does not suggest a configuration workaround
