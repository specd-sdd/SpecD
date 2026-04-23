# Verification: CLI Entrypoint

## Requirements

### Requirement: Configuration discovery

#### Scenario: Config found by walking up from CWD

- **GIVEN** CWD is a subdirectory of a project containing `specd.yaml` at the project root
- **WHEN** any `specd` command is run without `--config`
- **THEN** `specd.yaml` at the project root is loaded

#### Scenario: No config found

- **GIVEN** CWD is not under any directory containing `specd.yaml`
- **WHEN** any `specd` command is run without `--config`
- **THEN** the command exits with code 1 and prints an `error:` message to stderr

### Requirement: Config flag override

#### Scenario: Valid explicit config before subcommand (global position)

- **WHEN** `specd --config /abs/path/specd.yaml change list` is run and the file exists
- **THEN** that file is loaded and the subcommand executes successfully

#### Scenario: Valid explicit config after subcommand (local position)

- **WHEN** `specd change list --config /abs/path/specd.yaml` is run and the file exists
- **THEN** that file is loaded and the subcommand executes successfully

#### Scenario: Global config takes effect when subcommand has no local --config

- **GIVEN** `--config /abs/path/specd.yaml` is provided before the subcommand
- **AND** the subcommand does not also specify `--config`
- **WHEN** the action handler runs
- **THEN** `opts.config` is populated with the root-level value via `preAction` propagation

#### Scenario: --config specified twice uses the last value

- **GIVEN** `specd --config /root/specd.yaml change list --config /local/specd.yaml` is run
- **WHEN** Commander parses the command line
- **THEN** the last `--config` value (`/local/specd.yaml`) is used (Commander option override semantics)
- **AND** the command executes normally — no error is produced

#### Scenario: Explicit config file missing

- **WHEN** `specd --config /nonexistent/specd.yaml change list` is run
- **THEN** the command exits with code 1 and prints an `error:` message to stderr

### Requirement: Output conventions

#### Scenario: Normal output goes to stdout

- **WHEN** a command succeeds and produces output
- **THEN** the output is written to stdout only; stderr is empty

#### Scenario: Error goes to stderr

- **WHEN** a command encounters a domain error
- **THEN** the error message is written to stderr only; stdout is empty

### Requirement: Exit codes

#### Scenario: Successful command

- **WHEN** a command completes without error
- **THEN** the process exits with code 0

#### Scenario: Change not found

- **WHEN** a command references a change name that does not exist
- **THEN** the process exits with code 1

#### Scenario: Hook failure

- **WHEN** a `run:` hook exits with a non-zero status during a transition
- **THEN** the process exits with code 2 and the hook's output is forwarded to stdout/stderr

#### Scenario: Unhandled system error

- **WHEN** an unexpected I/O error occurs
- **THEN** the process exits with code 3 and prints a `fatal:` message to stderr

### Requirement: Error message format

#### Scenario: Domain error prefix

- **WHEN** a domain error occurs (e.g. change not found)
- **THEN** stderr contains a line starting with `error:`

#### Scenario: System error prefix

- **WHEN** a system error occurs
- **THEN** stderr contains a line starting with `fatal:`

#### Scenario: Stack trace gated on SPECD_DEBUG

- **GIVEN** `SPECD_DEBUG` is not set
- **WHEN** a system error occurs
- **THEN** no stack trace is printed to stderr

### Requirement: Excess arguments rejected

#### Scenario: Extra positional argument rejected

- **WHEN** any leaf command is run with an unexpected extra positional argument (e.g. `specd change list some-name`)
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Banner in help

#### Scenario: Banner appears in root help output

- **WHEN** `specd --help` is run
- **THEN** stdout contains the SpecD ASCII art banner before the Commander-generated help text

#### Scenario: Banner does not appear in subcommand help

- **WHEN** `specd change --help` or any other subcommand `--help` is run
- **THEN** stdout does not contain the SpecD ASCII art banner

### Requirement: Auto-show dashboard

#### Scenario: Bare specd invocation with config present shows dashboard

- **GIVEN** `specd.yaml` is discoverable from CWD
- **WHEN** `specd` is run with no subcommand
- **THEN** the project dashboard output is displayed (same as `specd project dashboard`)
- **AND** the process exits with code 0

#### Scenario: specd with only --config and no subcommand shows dashboard

- **GIVEN** a valid `specd.yaml` exists at `/path/to/specd.yaml`
- **WHEN** `specd --config /path/to/specd.yaml` is run with no subcommand
- **THEN** the project dashboard output is displayed
- **AND** the process exits with code 0

#### Scenario: Bare specd invocation without config shows help

- **GIVEN** no `specd.yaml` is discoverable from CWD
- **WHEN** `specd` is run with no subcommand
- **THEN** the standard help text is shown
- **AND** the process exits with code 0

### Requirement: Top-level init alias

#### Scenario: specd init appears in root help output

- **WHEN** `specd --help` is run
- **THEN** the help text includes `init` as a top-level command

#### Scenario: specd init delegates to project init handler

- **GIVEN** a clean directory with no existing `specd.yaml`
- **WHEN** `specd init --workspace default` is run
- **THEN** the command exits with code 0
- **AND** `specd.yaml` is written to the target directory

#### Scenario: specd init rejects excess arguments

- **WHEN** `specd init extra-arg` is run
- **THEN** the command exits with code 1
- **AND** stderr contains a usage error

#### Scenario: specd init --force overwrites existing config

- **GIVEN** a `specd.yaml` already exists
- **WHEN** `specd init --force --workspace default` is run
- **THEN** the command exits with code 0
- **AND** `specd.yaml` is overwritten

### Requirement: Output format flag

#### Scenario: Text format produces human-readable output

- **WHEN** a command is run with `--format text` (or without `--format`)
- **THEN** stdout contains human-readable text output

#### Scenario: JSON format produces valid JSON to stdout

- **WHEN** a command is run with `--format json`
- **THEN** stdout contains valid JSON
- **AND** the JSON can be parsed by a standard JSON parser

#### Scenario: TOON format produces TOON encoding to stdout

- **WHEN** a command is run with `--format toon`
- **THEN** stdout contains a TOON-encoded representation of the same data model as the JSON output

#### Scenario: Errors go to stderr regardless of format

- **GIVEN** a domain error occurs during a command run with `--format json`
- **WHEN** the command fails
- **THEN** stderr contains an `error:` line in plain text

#### Scenario: Errors in text format produce empty stdout

- **GIVEN** a domain error occurs during a command run with `--format text`
- **WHEN** the command fails
- **THEN** stderr contains an `error:` line in plain text
- **AND** stdout is empty

### Requirement: Structured error output

#### Scenario: JSON format produces structured error on stdout

- **GIVEN** a domain error with code `CHANGE_NOT_FOUND` occurs
- **WHEN** the command was run with `--format json`
- **THEN** stdout contains valid JSON: `{"result": "error", "code": "CHANGE_NOT_FOUND", "message": "...", "exitCode": 1}`
- **AND** stderr still contains the `error:` line in plain text

#### Scenario: TOON format produces structured error on stdout

- **GIVEN** a domain error occurs
- **WHEN** the command was run with `--format toon`
- **THEN** stdout contains a TOON-encoded error object with `result`, `code`, `message`, and `exitCode`
- **AND** stderr still contains the `error:` line in plain text

#### Scenario: Schema error produces structured error in JSON format

- **GIVEN** a `SchemaNotFoundError` occurs
- **WHEN** the command was run with `--format json`
- **THEN** stdout contains `{"result": "error", "code": "SCHEMA_NOT_FOUND", "message": "...", "exitCode": 3}`
- **AND** stderr contains a `fatal:` line in plain text

#### Scenario: Unexpected system error does not produce structured stdout

- **GIVEN** an unexpected error (not a `SpecdError` subclass) occurs
- **WHEN** the command was run with `--format json`
- **THEN** stderr contains a `fatal:` line in plain text
- **AND** stdout is empty

#### Scenario: Hook failure produces structured error in JSON format

- **GIVEN** a hook failure occurs
- **WHEN** the command was run with `--format json`
- **THEN** stdout contains `{"result": "error", "code": "HOOK_FAILED", "message": "...", "exitCode": 2}`
- **AND** stderr contains the hook error in plain text

#### Scenario: Text format errors do not produce structured stdout

- **GIVEN** a domain error occurs
- **WHEN** the command was run with `--format text` (or without `--format`)
- **THEN** stdout is empty
- **AND** stderr contains the `error:` line in plain text
