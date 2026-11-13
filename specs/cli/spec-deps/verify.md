# Verification: specs deps

## Requirements

### Requirement: Command signature

#### Scenario: Every subcommand accepts --format

- **WHEN** `specd specs deps list core:auth/login --format json` is run
- **THEN** the output is valid JSON

### Requirement: List subcommand

#### Scenario: List prints the persisted dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:auth/shared']`
- **WHEN** `specd specs deps list core:auth/login` is run
- **THEN** the command exits with code 0
- **AND** the output includes `core:auth/shared`

#### Scenario: List on an uninitialized spec reports not-yet-initialized distinctly

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs deps list core:auth/login` is run
- **THEN** the text output reports the spec is not yet initialized rather than printing an empty list
- **AND** `specd specs deps list core:auth/login --format json` includes `initialized: false`

### Requirement: Add subcommand

#### Scenario: Add appends every supplied dependency ID

- **GIVEN** a spec with persisted `dependsOn: ['core:a']`
- **WHEN** `specd specs deps add core:auth/login --dep core:b --dep core:c` is run
- **THEN** the command exits with code 0
- **AND** the resulting `dependsOn` list includes `core:a`, `core:b`, and `core:c`

### Requirement: Remove subcommand

#### Scenario: Remove drops the given dependency

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps remove core:auth/login --dep core:b` is run
- **THEN** the resulting `dependsOn` list is `['core:a']`

#### Scenario: Remove on an uninitialized spec reports a no-op, not an error

- **GIVEN** a spec with no persisted state
- **WHEN** `specd specs deps remove core:auth/login --dep core:b` is run
- **THEN** the command reports the no-op outcome
- **AND** the command does not exit with an error

### Requirement: Set subcommand

#### Scenario: Set replaces the entire dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps set core:auth/login --dep core:c` is run
- **THEN** the resulting `dependsOn` list is exactly `['core:c']`

#### Scenario: Set with no --dep flags clears the list

- **GIVEN** a spec with persisted `dependsOn: ['core:a']`
- **WHEN** `specd specs deps set core:auth/login` is run with no `--dep` flags
- **THEN** the resulting `dependsOn` list is empty

### Requirement: Clear subcommand

#### Scenario: Clear empties the dependsOn list

- **GIVEN** a spec with persisted `dependsOn: ['core:a', 'core:b']`
- **WHEN** `specd specs deps clear core:auth/login` is run
- **THEN** the resulting `dependsOn` list is empty

#### Scenario: Clear confirmed on a terminal

- **GIVEN** an interactive terminal
- **WHEN** `specd specs deps clear core:x` is run and the user confirms
- **THEN** the persisted dependencies are cleared

#### Scenario: Clear declined

- **WHEN** the user declines
- **THEN** nothing changes, the command prints that it was cancelled, and exits with code 0

#### Scenario: Clear with --force

- **WHEN** `specd specs deps clear core:x --force` is run
- **THEN** the dependencies are cleared without prompting

#### Scenario: No terminal and no force

- **GIVEN** no interactive terminal
- **WHEN** `specd specs deps clear core:x` is run
- **THEN** the command exits with code 1 stating that clearing requires confirmation and that `--force` skips it

### Requirement: No repeated CLI-owned mutation logic

#### Scenario: Add, remove, and set map directly onto UpdatePersistedSpecDepsInput

- **WHEN** any of `specs deps add`, `specs deps remove`, or `specs deps set` is run
- **THEN** the handler performs exactly one call to `Kernel.specs.updatePersistedDeps` with the parsed flags mapped directly onto its input
- **AND** the handler does not compute add/remove/set merge semantics itself

#### Scenario: Add, remove, and clear map onto the use case input

- **WHEN** `add core:x --dep core:a --dep core:b`, `remove core:x --dep core:a`, and `clear core:x --force` are run
- **THEN** `updatePersistedDeps` receives respectively `add: ['core:a','core:b']`, `remove: ['core:a']`, and `clear: true`

#### Scenario: Set without --dep sends an empty list

- **WHEN** `specd specs deps set core:x` is run
- **THEN** `updatePersistedDeps` receives `set: []`

#### Scenario: List on an uninitialized spec

- **GIVEN** the spec has no persisted state
- **WHEN** `specd specs deps list core:x` is run
- **THEN** text output says the spec is not initialized and `--format json` carries `initialized: false`

#### Scenario: Unknown spec on list

- **WHEN** `specd specs deps list core:no-such-spec` is run
- **THEN** the command exits with code 1 with a `SpecNotFoundError` message

#### Scenario: Invalid and unknown-workspace IDs

- **WHEN** the spec ID or a `--dep` value is malformed, or names an unknown workspace
- **THEN** the command exits with code 1 with the `InvalidSpecIdError` or `WorkspaceNotFoundError` message quoting the full value

#### Scenario: Concurrent modification maps to a retry message

- **GIVEN** the use case throws `ArtifactConflictError`
- **WHEN** any mutating subcommand runs
- **THEN** the command exits with code 1 and tells the user to retry

#### Scenario: Read-only workspace gives no configuration workaround

- **GIVEN** the use case throws `ReadOnlyWorkspaceError`
- **WHEN** any mutating subcommand runs
- **THEN** the command exits with code 1 and the message suggests no configuration change

#### Scenario: Repair hint is exactly the three commands

- **GIVEN** an `InvalidSpecLockError` whose field is under `dependsOn`
- **WHEN** the error is printed
- **THEN** the hint names `specs deps remove`, `specs deps set`, and `specs deps clear` and contains no `--force` text and no parenthetical

#### Scenario: No hint for other lock fields

- **GIVEN** an `InvalidSpecLockError` whose field is `implementation.0.file`
- **WHEN** the error is printed
- **THEN** no repair hint is added

#### Scenario: Non-interactive clear message names no --clear option

- **GIVEN** no interactive terminal
- **WHEN** `specd specs deps clear core:x` is run
- **THEN** the error states that clearing requires confirmation and that `--force` skips it and does not contain `--clear`

### Requirement: Error mapping

#### Scenario: Unknown spec maps to exit code 1

- **WHEN** `specd specs deps list core:unknown/spec` is run
- **THEN** the command exits with code 1
- **AND** stderr names the unresolved spec

#### Scenario: Concurrent modification maps to exit code 1 with retry guidance

- **GIVEN** a concurrent write causes `Kernel.specs.updatePersistedDeps` to throw `ArtifactConflictError`
- **WHEN** `specd specs deps add core:auth/login --dep core:c` is run
- **THEN** the command exits with code 1
- **AND** stderr indicates a concurrent modification and instructs the user to retry

#### Scenario: Read-only workspace maps to exit code 1 without a configuration workaround

- **GIVEN** the spec's workspace is `readOnly`
- **WHEN** `specd specs deps add core:auth/login --dep core:c` is run
- **THEN** the command exits with code 1
- **AND** stderr does not suggest a configuration workaround

#### Scenario: Invalid lock maps to exit 1 with field path

- **GIVEN** the lock of `core:x` has an invalid `dependsOn.0`
- **WHEN** `specd specs deps list core:x` is run
- **THEN** the command exits with code 1 and the message names the spec, the lock location, and `dependsOn.0`
- **AND** no stack trace or raw validation dump is printed
- **AND** a following hint names `specd specs deps remove`, `specd specs deps set`, and `specd specs deps clear` as the ways to repair it, and no other repair instruction appears

#### Scenario: Invalid and unknown workspace IDs map to exit 1

- **WHEN** an invalid ID or an unknown workspace is given
- **THEN** the command exits with code 1 with the typed error message quoting the full value

### Requirement: Raw spec IDs

#### Scenario: Bare spec ID passed unchanged

- **WHEN** `specd specs deps list _global/architecture` is run
- **THEN** the command forwards `_global/architecture` and the core resolves it to `default:_global/architecture`

#### Scenario: Dependency with a comma is one value

- **WHEN** `specd specs deps add core:x --dep "core:a,b"` is run
- **THEN** the value is forwarded as one ID and rejected with `InvalidSpecIdError` quoting it

#### Scenario: Empty dependency value rejected

- **WHEN** `specd specs deps set core:x --dep ""` is run
- **THEN** the command exits with code 1 and nothing is written

#### Scenario: Missing dependency target rejected

- **WHEN** `specd specs deps add core:x --dep core:no-such-spec` is run
- **THEN** the command exits with code 1 with a `SpecNotFoundError` message

### Requirement: Mutation output reflects the real initialized state

#### Scenario: Remove on an uninitialized spec renders initialized false

- **GIVEN** the use case returns `{ dependsOn: [], created: false, initialized: false }`
- **WHEN** `specd specs deps remove core:x --dep core:a` is run
- **THEN** text output states the spec is not initialized and nothing was removed, the exit code is 0, and `--format json` shows `initialized: false`

#### Scenario: Add, set, and clear render initialized true

- **GIVEN** the use case returns `initialized: true`
- **WHEN** `add`, `set`, or `clear` completes
- **THEN** the output renders `initialized: true`
