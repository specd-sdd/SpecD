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

#### Scenario: --optimized and --no-optimized flags accepted

- **WHEN** `specd change context my-change designing --optimized` is run
- **THEN** the command proceeds normally and forces optimization preference
- **WHEN** `specd change context my-change designing --no-optimized` is run
- **THEN** the command proceeds normally and suppresses optimization preference

### Requirement: Implementation tracking refresh before context compilation

#### Scenario: Context command refreshes before CompileContext

- **GIVEN** `specd change context <name> <step>` is executed
- **WHEN** the command handler runs
- **THEN** it calls `RefreshImplementationTracking` before `CompileContext`

#### Scenario: Fingerprint short-circuit still refreshes first

- **GIVEN** `--fingerprint` is provided
- **WHEN** the command handler runs
- **THEN** it calls `RefreshImplementationTracking` before comparing fingerprints

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

#### Scenario: Text output omits lifecycle availability

- **GIVEN** the change has unavailable workflow steps
- **WHEN** `specd change context <name> <step> --format text` is called
- **THEN** stdout contains no available-step section, lifecycle state, or blocker list
- **AND** stderr contains no lifecycle-availability warning

#### Scenario: Structured output omits lifecycle fields

- **WHEN** `specd change context <name> <step> --format toon` is called
- **THEN** the result contains context fingerprint, context entries, specs, and context warnings
- **AND** it omits `stepAvailable`, `blockingArtifacts`, and `availableSteps`

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

- **GIVEN** a spec is rendered in `full` mode
- **WHEN** `specd change context` is run without section flags
- **THEN** output includes Description, Rules, and Constraints for that spec

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

### Requirement: Behaviour

#### Scenario: CLI does not build CompileContextConfig inline

- **WHEN** `specd change context` is run
- **THEN** the command does not construct a `CompileContextConfig` object from `SpecdConfig`
- **AND** it invokes `CompileContext.execute` with runtime overrides only

#### Scenario: CLI forwards traversal and fingerprint options to CompileContext

- **WHEN** `specd change context` is run with flags such as `--include-change-specs`, `--follow-deps`, `--depth`, or `--fingerprint`
- **THEN** the command forwards those options into the `CompileContext.execute` input

#### Scenario: --no-optimized suppresses preference for optimized context

- **GIVEN** `llmOptimizedContext: true` in configuration
- **WHEN** `specd change context my-change designing --no-optimized` is executed
- **THEN** the CLI passes `llmOptimizedContext: false` as a runtime override on `CompileContext.execute`

#### Scenario: --optimized forces preference for optimized context

- **GIVEN** `llmOptimizedContext: false` in configuration
- **WHEN** `specd change context my-change designing --optimized` is executed
- **THEN** the CLI passes `llmOptimizedContext: true` as a runtime override on `CompileContext.execute`

#### Scenario: Section flags forwarded without CLI llmOptimizedContext override

- **GIVEN** `llmOptimizedContext: true` in configuration
- **WHEN** `specd change context my-change designing --rules` is executed
- **THEN** the CLI forwards `sections: ['rules']` on `CompileContext.execute`
- **AND** the CLI does not pass `llmOptimizedContext` when it matches the yaml default
- **AND** optimization bypass behaviour is verified by `core:compile-context`

### Requirement: Optimization warning signal

#### Scenario: Displays warnings when optimizations are missing

- **GIVEN** `llmOptimizedContext: true`
- **AND** some specs (or the project) are missing optimization
- **WHEN** `specd change context` is run
- **THEN** standard CLI warnings are emitted
- **AND** they include remediation instructions for the agent

#### Scenario: Warnings suppressed when raw sections or --no-optimized are requested

- **GIVEN** `llmOptimizedContext: true`
- **AND** some specs are missing optimization
- **WHEN** `specd change context my-change designing --no-optimized` or `specd change context my-change designing --rules` is executed
- **THEN** stale-optimization warnings for missing or stale spec optimized fields are suppressed
