# Verification: Change Transition

## Requirements

### Requirement: Command signature

#### Scenario: Missing arguments

- **WHEN** `specd change transition my-change` is run without the target state
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: Next flag resolves a transition target without a positional step

- **GIVEN** the change is in `drafting` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command resolves `designing` as the target state
- **AND** executes the normal transition flow

#### Scenario: Next flag cannot be combined with an explicit step

- **WHEN** `specd change transition my-change designing --next` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message explaining that `<step>` and `--next` are mutually exclusive

### Requirement: Next-transition resolution

#### Scenario: Next flag advances designing to ready

- **GIVEN** the change is in `designing` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command requests transition to `ready`

#### Scenario: Next flag honors approval routing from ready

- **GIVEN** `approvals.spec: true` and the change is in `ready` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command resolves `implementing` as the logical next target
- **AND** the change transitions to `pending-spec-approval`

#### Scenario: Next flag fails in pending spec approval state

- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message explaining that the change is waiting for human spec approval

#### Scenario: Next flag fails in pending signoff state

- **GIVEN** the change is in `pending-signoff` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message explaining that the change is waiting for human signoff

#### Scenario: Next flag fails in archivable state

- **GIVEN** the change is in `archivable` state
- **WHEN** `specd change transition my-change --next` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message explaining that archiving is not a lifecycle transition

### Requirement: Delegates refresh policy to TransitionChange

#### Scenario: Transition command does not call refresh directly

- **GIVEN** `specd change transition <name> <step>` is executed for an active change
- **WHEN** the command handler runs
- **THEN** it does not invoke `RefreshImplementationTracking` directly
- **AND** it does not invoke `ImplementationDetector` directly

#### Scenario: Pre-transition GetStatus skips refresh

- **GIVEN** an active change transition is starting
- **WHEN** the command reads the current state before `TransitionChange`
- **THEN** it calls `GetStatus` with `refreshImplementationTracking: false`

#### Scenario: Repair guide GetStatus does not double-refresh

- **GIVEN** a transition attempt failed after `TransitionChange` already refreshed
- **WHEN** the command fetches status for the repair guide
- **THEN** it calls `GetStatus` with `refreshImplementationTracking: false`

### Requirement: Approval-gate routing

#### Scenario: Spec approval gate active

- **GIVEN** `approvals.spec: true` and the change is in `ready` state
- **WHEN** `specd change transition my-change implementing` is run
- **THEN** the change transitions to `pending-spec-approval`
- **AND** stdout shows `transitioned my-change: ready → pending-spec-approval`

#### Scenario: Signoff gate active

- **GIVEN** `approvals.signoff: true` and the change is in `done` state
- **WHEN** `specd change transition my-change archivable` is run
- **THEN** the change transitions to `pending-signoff`
- **AND** stdout shows `transitioned my-change: done → pending-signoff`

### Requirement: Output on success

#### Scenario: Successful direct transition

- **WHEN** `specd change transition my-change designing` succeeds
- **THEN** stdout contains `transitioned my-change: drafting → designing`
- **AND** the process exits with code 0

### Requirement: Invalid transition error

#### Scenario: Illegal state transition

- **GIVEN** the change is in `drafting` state
- **WHEN** `specd change transition my-change done` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Approval-required reason is surfaced in stderr

- **GIVEN** the change is in `pending-signoff` state
- **WHEN** `specd change transition my-change signed-off` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message explaining that the change is waiting for human signoff

#### Scenario: Transition failure renders Repair Guide

- **GIVEN** a transition to `ready` fails because an artifact is missing
- **WHEN** the command is run in text mode
- **THEN** it prints an error message to stderr
- **AND** it renders a `repair guide:` section to stdout
- **AND** the guide includes the blocker code (e.g., `! MISSING_ARTIFACT`) and the recommended command

### Requirement: Incomplete tasks error

#### Scenario: Unchecked checkboxes block verifying

- **GIVEN** the change is in `implementing` and a task artifact has unchecked checkboxes
- **WHEN** `specd change transition my-change verifying` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message naming the blocking artifact

#### Scenario: JSON output on successful transition

- **WHEN** `specd change transition my-change designing --format json` succeeds and the change was in `drafting` state
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `name` equal to `"my-change"`, `from` equal to `"drafting"`, and `to` equal to `"designing"`
- **AND** the process exits with code 0

### Requirement: Hook execution

#### Scenario: --skip-hooks all skips all hooks

- **GIVEN** the change is in `implementing` state and `implementing.post` has hooks configured
- **WHEN** `specd change transition my-change verifying --skip-hooks all` is run
- **THEN** no hooks are executed
- **AND** the transition succeeds

#### Scenario: --skip-hooks target.pre skips only pre hooks

- **GIVEN** the schema declares `verifying.pre` and `implementing.post` hooks
- **AND** the change is in `implementing` state
- **WHEN** `specd change transition my-change verifying --skip-hooks target.pre` is run
- **THEN** `verifying.pre` hooks are skipped
- **AND** `implementing.post` hooks still execute

#### Scenario: --skip-hooks source.post skips only post hooks

- **GIVEN** the schema declares `verifying.pre` and `implementing.post` hooks
- **AND** the change is in `implementing` state
- **WHEN** `specd change transition my-change verifying --skip-hooks source.post` is run
- **THEN** `implementing.post` hooks are skipped
- **AND** `verifying.pre` hooks still execute

#### Scenario: --skip-hooks accepts comma-separated values

- **WHEN** `specd change transition my-change verifying --skip-hooks target.pre,source.post` is run
- **THEN** both target pre and source post hooks are skipped

### Requirement: Progress output

#### Scenario: Text mode renders progress feedback

- **WHEN** `specd change transition my-change designing` is run in text mode
- **THEN** lifecycle progress feedback may be rendered to stdout while the transition runs

### Requirement: Post-hook failure warning

#### Scenario: Hook failure exits with error instead of post-transition warning

- **GIVEN** a hook fails during transition execution
- **WHEN** the command runs
- **THEN** it exits with code 1 and prints an `error:` message instead of a separate post-hook warning state

### Requirement: Unsatisfied requires error

#### Scenario: Requires blocker is surfaced to the user

- **GIVEN** a required artifact is incomplete
- **WHEN** `specd change transition my-change ready` is run
- **THEN** the command exits with code 1 and surfaces the requires blocker

#### Scenario: Repair guide uses blocker and next-action data from core

- **GIVEN** `TransitionChange` fails
- **AND** a follow-up `GetStatus` call returns blocker codes and a next action
- **WHEN** `specd change transition my-change <step>` is run in text mode
- **THEN** the repair guide shows those blocker codes and that next action
- **AND** the CLI does not invent an alternative repair route
