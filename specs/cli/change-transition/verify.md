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

#### Scenario: Transition execute omits approval flags

- **GIVEN** `config.approvals.spec: true`
- **WHEN** `specd change transition my-change implementing` runs
- **THEN** `TransitionChange.execute` is called with `{ name, to }` only
- **AND** approval gate flags are not passed on the input object

### Requirement: Output on success

#### Scenario: Successful direct transition

- **WHEN** `specd change transition my-change designing` succeeds
- **THEN** stdout contains `transitioned my-change: drafting → designing`
- **AND** the process exits with code 0

#### Scenario: Structured success result is emitted as terminal complete record

- **GIVEN** `specd change transition my-change designing --format json` succeeds from `drafting`
- **WHEN** the command finishes
- **THEN** the final stdout record is `stream: "change-transition"`
- **AND** its event type is `complete`
- **AND** its result contains `result: "ok"`, `name: "my-change"`, `from: "drafting"`, and `to: "designing"`

#### Scenario: Structured failure result is emitted as terminal complete record

- **GIVEN** a transition fails in `json` mode with lifecycle blockers
- **WHEN** the command finishes
- **THEN** the final stdout record is `stream: "change-transition"`
- **AND** its event type is `complete`
- **AND** its result contains `result: "failure"`, `blockers`, and `nextAction`

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

#### Scenario: Text mode renders active hook status with recent output

- **GIVEN** a transition hook emits output while it is still running
- **WHEN** `specd change transition my-change designing` is run in text mode
- **THEN** the progress feedback shows the active hook and command
- **AND** recent hook output remains visible while the hook is running

#### Scenario: Text mode preserves completed hook history

- **GIVEN** multiple hooks execute during the transition
- **WHEN** progress is rendered in text mode
- **THEN** previously completed hooks remain understandable after later hooks start
- **AND** the currently active hook does not fully overwrite the earlier hook history

#### Scenario: Text mode shows liveness for quiet hook

- **GIVEN** a transition hook remains active without new output for a meaningful interval
- **WHEN** progress is rendered in text mode
- **THEN** the output still signals that the hook remains active before completion

#### Scenario: Structured formats emit progress on stdout

- **GIVEN** a transition emits hook and lifecycle progress events
- **WHEN** `specd change transition my-change designing --format json` is run
- **THEN** stdout emits newline-delimited structured records during the transition
- **AND** hook lifecycle events use `stream: "hook-progress"`
- **AND** transition lifecycle events use `stream: "change-transition"`

### Requirement: Transition hook observability

#### Scenario: Transition exposes hook progress before hook-triggered failure

- **GIVEN** a transition hook emits progress and then fails before the state transition completes
- **WHEN** `specd change transition my-change <step>` is run
- **THEN** hook progress is surfaced before the failure is reported
- **AND** the caller can identify which hook was active when the failure occurred

### Requirement: Shared hook progress presentation

#### Scenario: Equivalent hook events render with the same presentation contract as run-hooks

- **GIVEN** `specd change transition` and `specd change run-hooks` observe the same sequence of hook events
- **WHEN** both commands render hook progress in the same output format
- **THEN** running status, recent output, liveness, and failed-hook output follow the same presentation rules

### Requirement: Post-hook failure warning

#### Scenario: Hook failure exits with error instead of post-transition warning

- **GIVEN** a hook fails during transition execution
- **WHEN** the command runs
- **THEN** it exits with code 2 and prints an `error:` message instead of a separate post-hook warning state

#### Scenario: Hook failure leaves visible execution context

- **GIVEN** progress was rendered for the active hook before failure
- **WHEN** the transition aborts on hook failure
- **THEN** the visible output still identifies the hook that failed
- **AND** retains enough preceding hook context to understand the failure

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
