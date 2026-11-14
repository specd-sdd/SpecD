# Verification: change deps

## Requirements

### Requirement: Command signature

#### Scenario: Add deps to a spec in the change

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth auth/login --add auth/shared --add auth/jwt`
- **THEN** the command exits with code 0
- **AND** the output includes `updated deps for default:auth/login`
- **AND** the output includes `dependsOn: default:auth/shared, default:auth/jwt`

#### Scenario: Remove deps from a spec in the change

- **GIVEN** a change `add-auth` with `specDependsOn: { "default:auth/login": ["default:auth/shared", "default:auth/jwt"] }`
- **WHEN** `specd change deps add-auth auth/login --remove auth/jwt`
- **THEN** the command exits with code 0
- **AND** the output includes `dependsOn: default:auth/shared`

#### Scenario: Set (replace) deps for a spec

- **GIVEN** a change `add-auth` with existing deps for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --set auth/session`
- **THEN** the command exits with code 0
- **AND** the output includes `dependsOn: default:auth/session`
- **AND** previous deps are fully replaced

#### Scenario: List all dependencies in the change

- **GIVEN** a change with multiple specs and some dependencies
- **WHEN** `specd change deps <name>` is run without `<specId>` or flags
- **THEN** the command exits with code 0
- **AND** the output lists all specs in the change and their dependencies

#### Scenario: Display dependencies for a specific spec

- **GIVEN** a change with `specIds: ['core:a']` and some dependencies for it
- **WHEN** `specd change deps <name> core:a` is run without flags
- **THEN** the command exits with code 0
- **AND** the output shows the dependencies for `core:a`

#### Scenario: Help lists --clear and --force

- **WHEN** `specd changes deps --help` is run
- **THEN** the help lists `--clear` and `--force`

#### Scenario: set value with a comma is one ID

- **WHEN** `specd changes deps my-change core:x --set "core:a,b"` is run
- **THEN** the value is passed as one ID and rejected as invalid, quoting `core:a,b`

#### Scenario: Values are passed unchanged

- **WHEN** `--add auth/login` is run
- **THEN** the command forwards `auth/login` to `UpdateSpecDeps` and does not qualify it

### Requirement: Output

#### Scenario: JSON output format

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth auth/login --add auth/shared --format json`
- **THEN** the output is valid JSON with `result: "ok"`, `name`, `specId`, and `dependsOn` array

#### Scenario: No deps remaining shows none

- **GIVEN** a change with deps `["default:auth/shared"]` for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --remove auth/shared`
- **THEN** the output includes `dependsOn: (none)`

### Requirement: Error cases

#### Scenario: Error when change not found

- **WHEN** `specd change deps nonexistent auth/login --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the change was not found

#### Scenario: Error when specId not in change.specIds

- **GIVEN** a change `add-auth` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change deps add-auth billing/invoices --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the specId is not part of the change

#### Scenario: Error when --set used with --add

- **WHEN** `specd change deps add-auth auth/login --set auth/session --add auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates --set is mutually exclusive with --add/--remove

#### Scenario: Error when removing non-existent dep

- **GIVEN** a change `add-auth` with no deps for `auth/login`
- **WHEN** `specd change deps add-auth auth/login --remove auth/shared`
- **THEN** the command exits with code 1
- **AND** stderr indicates the dep was not found

#### Scenario: Error when modification flags provided without specId

- **WHEN** `specd change deps <name> --add core:other`
- **THEN** the command exits with code 1
- **AND** stderr indicates modification flags require a specId

#### Scenario: --set with an empty value is rejected

- **WHEN** `specd changes deps my-change core:x --set ""` is run
- **THEN** the command exits with code 1 with the `InvalidSpecIdError` message
- **AND** the stored dependencies are unchanged

#### Scenario: --add with a blank value is rejected

- **WHEN** `specd changes deps my-change core:x --add " "` is run
- **THEN** the command exits with code 1 and stores nothing

#### Scenario: Unknown workspace in a dependency

- **WHEN** `--add nope:auth/login` is run
- **THEN** the command exits with code 1 with the `WorkspaceNotFoundError` message

#### Scenario: Dependency on a spec not created yet is accepted

- **WHEN** `--add core:brand-new-spec` is run and that spec does not exist
- **THEN** the dependency is stored

#### Scenario: Display mode accepts a bare spec ID

- **GIVEN** the change holds `default:auth/login`
- **WHEN** `specd changes deps my-change auth/login` is run with no operation option
- **THEN** the dependencies of `default:auth/login` are displayed
- **AND** the command does not fail with a not-in-scope error

### Requirement: Clear confirmation

#### Scenario: Confirmed on a terminal

- **GIVEN** an interactive terminal and a spec with dependencies
- **WHEN** `specd changes deps my-change core:x --clear` is run and the user confirms
- **THEN** the dependencies are cleared
- **AND** the output shows `dependsOn: (none)`

#### Scenario: Declined on a terminal

- **WHEN** the user declines the confirmation
- **THEN** nothing changes, the command prints that it was cancelled, and exits with code 0

#### Scenario: --force skips the question

- **WHEN** `specd changes deps my-change core:x --clear --force` is run
- **THEN** the dependencies are cleared without prompting

#### Scenario: No terminal and no force fails

- **GIVEN** no interactive terminal
- **WHEN** `specd changes deps my-change core:x --clear` is run
- **THEN** the command exits with code 1 stating that `--clear` requires confirmation and that `--force` skips it
- **AND** nothing changes

#### Scenario: clear conflicts with add, remove, and set

- **WHEN** `--clear --add core:y`, `--clear --remove core:y`, and `--clear --set core:y` are run
- **THEN** each exits with code 1

#### Scenario: clear requires a specId

- **WHEN** `specd changes deps my-change --clear` is run without a spec
- **THEN** the command exits with code 1

### Requirement: Output shows the normalized spec ID

#### Scenario: Display mode holds no spec ID parser

- **WHEN** the source of `change deps` is inspected
- **THEN** it does not import or call `parseSpecId` or any other spec ID parser
- **AND** the raw positional `<specId>` is passed to the core operation that resolves it

#### Scenario: Help lists --clear and --force

- **WHEN** `specd change deps --help` is run
- **THEN** the output lists `--clear` and `--force`

#### Scenario: Blank --add value

- **WHEN** `--add " "` is passed
- **THEN** the command exits with code 1 with the `InvalidSpecIdError` message

#### Scenario: Unknown workspace in a dependency

- **WHEN** `--add nope:auth/login` is passed
- **THEN** the command exits with code 1 with the `WorkspaceNotFoundError` message

#### Scenario: Raw forwarding of every modification flag

- **WHEN** `--add`, `--remove`, and `--set` values are passed
- **THEN** each is forwarded to `UpdateSpecDeps` unchanged

#### Scenario: Text output prints the normalized spec ID

- **WHEN** a modification is run with a bare `<specId>` such as `auth/login`
- **THEN** the text output shows `default:auth/login`, the same value JSON output carries

### Requirement: CLI-rendered dependency operation flag hints

#### Scenario: UpdateSpecDeps validation error renders CLI flag hint

- **GIVEN** `UpdateSpecDeps` throws `InvalidInputError` for conflicting or missing operations
- **WHEN** `specd changes deps` handles the error
- **THEN** the CLI renders flag guidance referencing `--set`, `--add`, `--remove`, and `--clear` via the centralized hint-resolution helper
