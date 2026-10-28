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

#### Scenario: Interrupted by SIGINT

- **WHEN** the process receives `SIGINT` and cleanup completes
- **THEN** the process exits with code 130

#### Scenario: Terminated by SIGTERM

- **WHEN** the process receives `SIGTERM` and cleanup completes
- **THEN** the process exits with code 143

### Requirement: Cleanup runs before the process exits

#### Scenario: Cleanup runs after normal completion

- **GIVEN** a command that opened a host and completed successfully
- **WHEN** `parseAsync` settles
- **THEN** `runCliCleanup()` is awaited before the process exits with code 0

#### Scenario: Helpers throw CliExitError instead of exiting

- **WHEN** `cliError('message', undefined, 1)` is called
- **THEN** it writes its output and throws a `CliExitError` carrying exit code 1
- **AND** it does not call `process.exit`

#### Scenario: Cleanup runs before an error exit

- **GIVEN** a command that opened a host and then throws a `CliExitError` with code 1
- **WHEN** the entrypoint handles it
- **THEN** `runCliCleanup()` is awaited and the process then exits with code 1

#### Scenario: Unhandled errors still clean up

- **GIVEN** a command that opened a host and then rejects with an unexpected error
- **WHEN** the entrypoint handles it
- **THEN** cleanup is awaited and the process exits with code 3 after printing a `fatal:` message

#### Scenario: A failing error handler still cleans up and exits 3

- **GIVEN** a command that opened a host and then rejects with an unexpected error
- **AND** reporting that error throws something other than a `CliExitError`
- **WHEN** the entrypoint handles it
- **THEN** cleanup is awaited and the process exits with code 3
- **AND** the run does not end as an unhandled rejection

#### Scenario: process.exitCode is respected

- **GIVEN** a command that sets `process.exitCode = 1` and returns normally
- **WHEN** `parseAsync` settles
- **THEN** cleanup is awaited and the process exits with code 1

#### Scenario: Commands do not swallow CliExitError

- **GIVEN** a command that wraps its work in a generic `try`/`catch`
- **WHEN** a nested helper throws a `CliExitError`
- **THEN** the command rethrows it unchanged

#### Scenario: Only the entrypoint terminates the process

- **WHEN** the CLI sources are inspected
- **THEN** `process.exit` is called only from the entrypoint

### Requirement: Signal handling

#### Scenario: First SIGINT runs cleanup

- **GIVEN** a running command that opened a host
- **WHEN** the process receives `SIGINT`
- **THEN** `runCliCleanup()` is awaited and the process exits with code 130

#### Scenario: Second signal forces exit

- **GIVEN** cleanup is still running after a first `SIGTERM`
- **WHEN** a second `SIGTERM` arrives
- **THEN** the process exits immediately with code 143 without waiting

#### Scenario: A different second signal keeps the first exit code

- **GIVEN** cleanup is still running after a first `SIGINT`
- **WHEN** a `SIGTERM` arrives
- **THEN** the process exits immediately with code 130, the code of the first signal

#### Scenario: SIGTERM handler is installed on every platform

- **WHEN** the executable entrypoint installs its signal handlers on Windows
- **THEN** a `SIGTERM` handler is registered like on other platforms
- **AND** nothing relies on that signal being delivered there

#### Scenario: createProgram installs no handlers

- **WHEN** `createProgram()` is called by a test or documentation tool
- **THEN** no `SIGINT` or `SIGTERM` handler is installed

#### Scenario: Prompts keep their own cancellation

- **GIVEN** an interactive prompt is active
- **WHEN** the user presses Ctrl-C
- **THEN** the prompt library's own cancellation behaviour is not suppressed by the entrypoint handlers

### Requirement: Process exit grace period

#### Scenario: Clean exit prints nothing

- **GIVEN** a command whose process ends by itself right after cleanup
- **WHEN** the run finishes in under 1000 ms after cleanup
- **THEN** no grace-period warning is written to stderr
- **AND** `process.exit` is not called by the grace-period logic

#### Scenario: Waiting hint after 1 second

- **GIVEN** an open handle keeps the process alive after cleanup
- **WHEN** 1000 ms elapse
- **THEN** a `warning:` line on stderr says the entrypoint is waiting for open handles to close and when the exit will be forced
- **AND** the exit code is not changed

#### Scenario: Exit forced after 5 seconds

- **GIVEN** an open handle still keeps the process alive 5000 ms after cleanup
- **WHEN** the force timer fires
- **THEN** a `warning:` line on stderr says the process did not exit after cleanup and the exit is being forced
- **AND** `process.exit` is called with the exit code the run would have used

#### Scenario: Grace timers do not keep the process alive

- **WHEN** the grace-period timers are armed and nothing else keeps the event loop busy
- **THEN** the process ends without waiting for them

### Requirement: Error message format

#### Scenario: Domain error prefix

- **WHEN** a domain error occurs (e.g. change not found)
- **THEN** stderr contains a line starting with `error:`

#### Scenario: System error prefix

- **WHEN** a system error occurs
- **THEN** stderr contains a line starting with `fatal:`

#### Scenario: Stack trace gated on SPECD_DEBUG

- **GIVEN** logger debug level is not enabled
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

### Requirement: JSON/TOON output schema in help

#### Scenario: JSON/TOON output schema documented in help text

- **WHEN** any command that supports `--format json|toon` has its `--help` displayed
- **THEN** the help text includes a `JSON/TOON output schema:` section
- **AND** it shows the output shape as a TypeScript-style type annotation

### Requirement: Host package SDK dependency boundary

#### Scenario: MCP depends on SDK only

- **WHEN** `packages/mcp/package.json` dependencies are inspected
- **THEN** `@specd/sdk` is the specd platform dependency
- **AND** `@specd/core` is absent

### Requirement: Banner version labels

#### Scenario: Root banner shows CLI SDK core and code-graph versions

- **WHEN** `specd --help` is run with a configured project
- **THEN** stdout includes `cli  v`, `sdk   v`, `core  v`, and `graph v` version labels from installed packages

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

- **WHEN** the CLI is executed with `--format json` and a `SpecdError` is caught
- **THEN** it emits a structured JSON error to stdout

#### Scenario: CLI validation error produces structured output

- **GIVEN** an invalid output format `--format invalid` is provided
- **WHEN** the CLI is executed with `--format json`
- **THEN** it emits a structured error to stdout
- **AND** the error code is `INVALID_FORMAT` (from `SpecdCliError`)
- **AND** no stack trace is shown in stderr

#### Scenario: Stack trace shown when logger debug level is enabled

- **GIVEN** a `SpecdError` occurs
- **AND** the logger level is set to `debug`
- **WHEN** the error is reported
- **THEN** the stack trace is included in the stderr output

### Requirement: Terminal-aware table rendering

#### Scenario: Table columns reduce right-to-left when terminal is constrained

- **GIVEN** a table with columns whose total width exceeds the terminal width
- **WHEN** `renderTable` or `fitColumnsToTerminal` is invoked with a constrained terminal width
- **THEN** the rightmost column width is reduced first down to the minimum threshold (default 10)
- **AND** preceding columns are reduced progressively only after subsequent columns reach the minimum threshold

#### Scenario: Unconstrained non-TTY rendering preserves natural widths

- **GIVEN** a non-interactive environment where `process.stdout.columns` is undefined
- **WHEN** `renderTable` is called without explicit terminal width override
- **THEN** column widths are preserved at their natural unconstrained dimensions

### Requirement: Decoupled program instantiation

#### Scenario: Factory returns executable Commander instance without argument parsing

- **WHEN** `createProgram()` is invoked
- **THEN** a fully assembled Commander `Command` instance is returned with all top-level commands registered
- **AND** the instance can be introspected without parsing CLI arguments or calling `process.exit`
