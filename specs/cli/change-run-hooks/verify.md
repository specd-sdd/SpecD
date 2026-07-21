# Verification: Change Run Hooks

## Requirements

### Requirement: Command signature

#### Scenario: Missing --phase flag rejected

- **WHEN** the user runs `specd change run-hooks add-auth implementing`
- **THEN** the command exits with code 1
- **AND** a usage error is printed to stderr

### Requirement: Delegates to RunStepHooks

#### Scenario: Command delegates to use case

- **WHEN** `specd change run-hooks` is invoked
- **THEN** it delegates all hook resolution and execution to `RunStepHooks` use case
- **AND** it does not resolve schemas, collect hooks, or call `HookRunner` directly

### Requirement: Exit code 0 on success

#### Scenario: All hooks succeed with human-readable summary

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase pre` is run
- **THEN** the command exits with code 0
- **AND** stderr shows hook progress while the hook runs
- **AND** stdout ends with a human-readable hook summary

#### Scenario: No hooks to run

- **GIVEN** the implementing step has no `run:` hooks in the post phase
- **WHEN** `specd change run-hooks add-auth implementing --phase post` is run
- **THEN** the command exits with code 0
- **AND** stdout contains `no hooks to run`

### Requirement: Exit code 2 on hook failure

#### Scenario: Pre-hook failure exits code 2

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 1 and emits failure output
- **WHEN** `specd change run-hooks add-auth implementing --phase pre`
- **THEN** the command exits with code 2
- **AND** stderr retains the failed hook context
- **AND** stdout still ends with the final hook summary

### Requirement: Exit code 1 on domain errors

#### Scenario: Change not found

- **GIVEN** no change named `nonexistent` exists
- **WHEN** `specd change run-hooks nonexistent implementing --phase pre`
- **THEN** the command exits with code 1
- **AND** stderr contains `error:` message

#### Scenario: Invalid step name

- **GIVEN** `reviewing` is not a valid lifecycle state
- **WHEN** `specd change run-hooks add-auth reviewing --phase pre`
- **THEN** the command exits with code 1
- **AND** stderr contains an error indicating the step is not valid

#### Scenario: Unknown hook ID with --only

- **GIVEN** the implementing step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --only unknown-hook`
- **THEN** the command exits with code 1
- **AND** stderr contains an error mentioning `unknown-hook` was not found

### Requirement: Text output format

#### Scenario: Mixed success and failure in post-hooks

- **GIVEN** post-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **AND** `pnpm lint` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase post`
- **THEN** the text output keeps both hooks visible in execution order
- **AND** the failed hook remains visibly marked as failed
- **AND** the later successful hook remains visible after it completes

#### Scenario: Running hook shows active status and recent output

- **GIVEN** a hook emits output incrementally while it is still running
- **WHEN** `specd change run-hooks` is executed in text mode
- **THEN** the active hook is rendered with visible running status
- **AND** the command being executed is shown
- **AND** recent output remains visible while the hook is still in flight

#### Scenario: Failed hook shows full output

- **GIVEN** a hook fails after emitting multiple lines of output
- **WHEN** `specd change run-hooks` is executed in text mode
- **THEN** the failed hook output includes the full output for that hook
- **AND** the caller does not need to infer failure context from a single short line

### Requirement: Long-running hook observability

#### Scenario: Quiet long-running hook still surfaces liveness

- **GIVEN** a hook remains active for a meaningful interval without new stdout or stderr
- **WHEN** `specd change run-hooks` is executed
- **THEN** the command still emits observable progress before the hook exits
- **AND** the caller can distinguish "still running" from "finished with no output"

### Requirement: Shared hook progress presentation

#### Scenario: Equivalent hook events render with the same presentation contract as transition

- **GIVEN** `specd change run-hooks` and `specd change transition` observe the same sequence of hook events
- **WHEN** both commands render hook progress in the same output format
- **THEN** running status, recent output, liveness, and failed-hook output follow the same presentation rules

### Requirement: JSON output format

#### Scenario: Structured stdout stream reports hook progress before completion

- **GIVEN** a long-running hook emits output before exit
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format json`
- **THEN** stdout emits newline-delimited `stream: "hook-progress"` records before terminal completion
- **AND** those records preserve which hook is active

#### Scenario: Structured stdout stream reports liveness for quiet hook

- **GIVEN** a hook remains active without emitting new output
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format toon`
- **THEN** stdout emits a liveness signal before the hook exits

#### Scenario: Structured stream ends with complete record carrying final success result

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format json`
- **THEN** the final stdout record is `stream: "run-hooks"`
- **AND** its event type is `complete`
- **AND** its result contains the final hook result array

#### Scenario: Failed pre-hook in structured output retains final failure details

- **GIVEN** pre-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** `pnpm test` exits with code 1
- **WHEN** `specd change run-hooks add-auth implementing --phase pre --format json`
- **THEN** the final stdout record is `stream: "run-hooks"` with `event.type: "complete"`
- **AND** its result identifies `"code": "HOOK_FAILED"`
- **AND** `hooks` contains only the executed pre-hook results
- **AND** `failedHooks` contains the `test` hook result

#### Scenario: Failed post-hooks expose all failures in failedHooks

- **GIVEN** post-hooks `[{ id: "test", run: "pnpm test" }, { id: "lint", run: "pnpm lint" }]`
- **AND** both hooks exit with code 1
- **WHEN** `specd change run-hooks add-auth implementing --phase post --format json` is run
- **THEN** the final structured result has `"result": "error"`
- **AND** `hooks` contains both executed hooks
- **AND** `failedHooks` contains both failed hook results in execution order

### Requirement: Works for any step including archiving

#### Scenario: Pre-archive check via run-hooks

- **GIVEN** the archiving step has pre-hooks `[{ id: "test", run: "pnpm test" }]`
- **AND** `pnpm test` exits with code 0
- **WHEN** `specd change run-hooks add-auth archiving --phase pre`
- **THEN** the command exits with code 0
- **AND** stderr shows hook progress while the hook runs
- **AND** stdout ends with a final human-readable hook summary
- **AND** no archive operation is performed
