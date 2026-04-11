# Verification: Workflow Model

## Requirements

### Requirement: Step names reference domain lifecycle states

#### Scenario: Invalid step name rejected

- **GIVEN** a schema with `workflow: [{ step: "designing" }, { step: "reviewing" }]`
- **WHEN** an agent attempts to transition a change to `reviewing`
- **THEN** `TransitionChange` throws `InvalidStateTransitionError` because `reviewing` is not a valid Change lifecycle state

### Requirement: Step semantics

#### Scenario: implementation-failure returns to implementing

- **GIVEN** a verifying step where artifacts remain correct
- **AND** the required fix fits within the existing task set
- **WHEN** verification concludes with `implementation-failure`
- **THEN** the workflow routes back to `implementing`

#### Scenario: artifact-review-required returns to designing

- **GIVEN** a verifying step where artifacts must be revised
- **WHEN** verification concludes with `artifact-review-required`
- **THEN** the workflow routes back to `designing`

#### Scenario: drifted file forces redesign

- **GIVEN** at least one file is `drifted-pending-review`
- **WHEN** workflow routing is evaluated after verification
- **THEN** the change must return to `designing`

### Requirement: Requires-based gating

#### Scenario: Step with all requires complete is available

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** both artifacts have persisted `state: 'complete'`
- **WHEN** step availability is evaluated
- **THEN** the step is available

#### Scenario: pending-review blocks requires

- **GIVEN** a workflow step with `requires: [specs]`
- **AND** `specs` has persisted `state: 'pending-review'`
- **WHEN** step availability is evaluated
- **THEN** the step is not available

#### Scenario: drifted-pending-review blocks requires

- **GIVEN** a workflow step with `requires: [specs]`
- **AND** `specs` has persisted `state: 'drifted-pending-review'`
- **WHEN** step availability is evaluated
- **THEN** the step is not available

#### Scenario: Skipped optional artifact satisfies requires

- **GIVEN** a workflow step with `requires: [design, tasks]`
- **AND** `design` is `skipped`
- **AND** `tasks` is `complete`
- **WHEN** step availability is evaluated
- **THEN** the step is available

### Requirement: Task completion gating

#### Scenario: Transition blocked when requiresTaskCompletion artifact has incomplete tasks

- **GIVEN** a workflow step with `requires: [verify, tasks]` and `requiresTaskCompletion: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck.incompletePattern: '^\s*-\s+\[ \]'`
- **AND** the tasks file contains `- [ ] implement login`
- **WHEN** a transition to that step is attempted
- **THEN** `InvalidStateTransitionError` is thrown with reason `incomplete-tasks`

#### Scenario: Transition allowed when all tasks are complete

- **GIVEN** a workflow step with `requiresTaskCompletion: [tasks]`
- **AND** the tasks file contains only `- [x] implement login`
- **WHEN** a transition to that step is attempted
- **THEN** the transition proceeds

#### Scenario: No gating when requiresTaskCompletion is absent

- **GIVEN** a workflow step with `requires: [tasks]` but no `requiresTaskCompletion`
- **AND** the `tasks` artifact type declares `taskCompletionCheck`
- **AND** the tasks file contains incomplete items
- **WHEN** a transition to that step is attempted
- **THEN** the transition proceeds — `taskCompletionCheck` is not enforced without `requiresTaskCompletion`

#### Scenario: Missing artifact file is skipped

- **GIVEN** a workflow step with `requiresTaskCompletion: [tasks]`
- **AND** the tasks file does not exist in the change directory
- **WHEN** a transition to that step is attempted
- **THEN** the check is skipped and the transition proceeds

#### Scenario: Invalid regex pattern is treated as non-matching

- **GIVEN** a workflow step with `requiresTaskCompletion: [tasks]`
- **AND** `incompletePattern` is an invalid regex
- **WHEN** a transition to that step is attempted
- **THEN** the check is skipped and the transition proceeds

#### Scenario: Error includes incomplete and complete counts

- **GIVEN** a workflow step with `requiresTaskCompletion: [tasks]`
- **AND** the `tasks` artifact declares both `incompletePattern` and `completePattern`
- **AND** the tasks file contains 3 complete items and 2 incomplete items
- **WHEN** the transition fails
- **THEN** the error reason includes `incomplete: 2`, `complete: 3`, `total: 5`

### Requirement: Step availability evaluation

#### Scenario: Availability reads persisted artifact state

- **GIVEN** a workflow step with `requires: [specs]`
- **AND** the `specs` artifact has persisted `state: 'complete'`
- **WHEN** step availability is evaluated
- **THEN** the step is available

#### Scenario: Availability is recomputed on each invocation

- **GIVEN** a workflow step with `requires: [specs]`
- **AND** `specs` changes from `complete` to `pending-review`
- **WHEN** step availability is evaluated again
- **THEN** the step is no longer available

### Requirement: Workflow array order is display order

#### Scenario: Later step available before earlier step

- **GIVEN** a workflow with steps `[designing (requires: []), implementing (requires: [tasks]), verifying (requires: [verify])]`
- **AND** `verify` is `complete` but `tasks` is `in-progress`
- **WHEN** step availability is evaluated for all steps
- **THEN** `designing` is available (empty requires)
- **AND** `implementing` is not available (tasks incomplete)
- **AND** `verifying` is available (verify complete)

### Requirement: Two execution modes

#### Scenario: Agent-driven step requires explicit hook invocation

- **GIVEN** an agent-driven step `implementing` with `run:` pre-hooks
- **WHEN** the agent enters the step
- **THEN** hooks are NOT automatically executed by the transition
- **AND** the agent must call `specd change run-hooks` to execute them

#### Scenario: Deterministic step executes hooks internally

- **GIVEN** the archiving step with `run:` pre-hooks
- **WHEN** `specd change archive` is executed
- **THEN** `ArchiveChange` executes the pre-hooks internally before performing the archive
