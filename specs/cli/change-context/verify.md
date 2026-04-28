# Verification: Change Context

## Requirements

### Requirement: Command signature

#### Scenario: Missing step argument

- **WHEN** `specd change context my-change` is run
- **THEN** the command exits with code 1
- **AND** stderr contains a usage error

#### Scenario: --mode flag accepted

- **WHEN** `specd change context my-change designing --mode summary` is run
- **THEN** the command proceeds normally and overrides the config mode

#### Scenario: --depth without --follow-deps

- **WHEN** `specd change context my-change designing --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --fingerprint flag accepted

- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123...` is run
- **THEN** the command proceeds normally

#### Scenario: --include-change-specs flag accepted

- **WHEN** `specd change context my-change designing --include-change-specs` is run
- **THEN** the command proceeds normally and requests direct change-spec seeding

### Requirement: Output

#### Scenario: Text output begins with fingerprint before context sections

- **GIVEN** the current context fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --format text` is called
- **THEN** the first rendered line is `Context Fingerprint: sha256:abc123...`

#### Scenario: Text output shows unchanged message when fingerprint matches

- **GIVEN** the current context fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123... --format text` is called
- **THEN** the output includes `Context unchanged since last call.`
- **AND** no spec content is printed

#### Scenario: Text output labels full-mode specs explicitly

- **GIVEN** `CompileContext` returns a full-mode spec entry
- **WHEN** `specd change context <name> <step> --format text` is called
- **THEN** the rendered block includes an explicit full-mode label

#### Scenario: Text output labels summary-mode specs explicitly

- **GIVEN** `CompileContext` returns a summary-mode spec entry
- **WHEN** `specd change context <name> <step> --format text` is called
- **THEN** the rendered block includes an explicit summary-mode label

#### Scenario: Text output labels list-mode specs explicitly

- **GIVEN** `CompileContext` returns a list-mode spec entry
- **WHEN** `specd change context <name> <step> --format text` is called
- **THEN** the rendered block includes an explicit list-mode label

#### Scenario: Non-full output instructs spec-preview usage

- **GIVEN** the output contains summary-mode or list-mode entries
- **WHEN** text output is rendered
- **THEN** it includes guidance to run `specd change spec-preview <change-name> <specId>` for merged full content

#### Scenario: JSON output includes list-mode entries

- **GIVEN** `CompileContext` returns `mode: "list"` entries
- **WHEN** `specd change context <name> <step> --format json` is called
- **THEN** JSON includes those entries with mode and source fields

#### Scenario: Section flags have no effect on list and summary entries

- **GIVEN** the result is rendered in list mode or summary mode
- **WHEN** `--rules` or `--constraints` are passed
- **THEN** output remains list/summary shaped without full content blocks

#### Scenario: include-change-specs false still allows reinjection

- **GIVEN** `--include-change-specs` is omitted
- **AND** a change spec matches include patterns or traversal
- **WHEN** the command is executed
- **THEN** that spec can still appear in emitted context entries

#### Scenario: Full mode defaults to Description + Rules + Constraints

- **GIVEN** a spec is rendered in `full` mode (due to `--mode full` or being a change spec in `hybrid` mode)
- **WHEN** `specd change context` is run without section flags
- **THEN** output includes Description, Rules, and Constraints for that spec

### Requirement: Step availability warning

#### Scenario: Step not yet available

- **GIVEN** the step `implementing` has blocking artifacts
- **WHEN** `specd change context my-change implementing` is run
- **THEN** stderr contains a `warning:` line listing the blocking artifacts
- **AND** stdout still contains the context output
- **AND** the process exits with code 0

### Requirement: Context warnings

#### Scenario: Stale metadata warning

- **GIVEN** a spec included in context has stale metadata
- **WHEN** `specd change context my-change designing` is run
- **THEN** stderr contains a `warning:` line for the stale spec
- **AND** the context output is still printed to stdout
- **AND** the process exits with code 0

#### Scenario: dependsOn cycles do not produce warning lines

- **GIVEN** dependency traversal encounters a `dependsOn` cycle while compiling context
- **WHEN** `specd change context my-change designing --follow-deps` is run
- **THEN** stderr does not include a warning line solely for the cycle
- **AND** the command still returns the compiled context

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change context nonexistent designing` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
