# Verification: Workflow Model

## Requirements

### Requirement: Step names reference domain lifecycle states

#### Scenario: Invalid step name rejected

- **GIVEN** a schema with `workflow: [{ step: "designing" }, { step: "reviewing" }]`
- **WHEN** an agent attempts to transition a change to `reviewing`
- **THEN** `TransitionChange` throws `InvalidStateTransitionError` because `reviewing` is not a valid Change lifecycle state

### Requirement: Requires-based gating

#### Scenario: Step with all requires complete is available

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** `change.effectiveStatus('specs')` returns `complete`
- **AND** `change.effectiveStatus('tasks')` returns `complete`
- **WHEN** step availability is evaluated
- **THEN** the step is available

#### Scenario: Step blocked by incomplete artifact

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** `change.effectiveStatus('specs')` returns `complete`
- **AND** `change.effectiveStatus('tasks')` returns `in-progress`
- **WHEN** step availability is evaluated
- **THEN** the step is not available
- **AND** `tasks` is reported as a blocking artifact

#### Scenario: Skipped optional artifact satisfies requires

- **GIVEN** a workflow step with `requires: [design, tasks]`
- **AND** `design` is `optional: true` with effective status `skipped`
- **AND** `tasks` has effective status `complete`
- **WHEN** step availability is evaluated
- **THEN** the step is available

#### Scenario: Empty requires means always available

- **GIVEN** a workflow step with `requires: []`
- **AND** the change is in any state
- **WHEN** step availability is evaluated
- **THEN** the step is available

### Requirement: Task completion gating

#### Scenario: Transition blocked when required artifact has incomplete tasks

- **GIVEN** a workflow step with `requires: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck.incompletePattern: '^\s*-\s+\[ \]'`
- **AND** the tasks file contains `- [ ] implement login`
- **WHEN** a transition to that step is attempted
- **THEN** `InvalidStateTransitionError` is thrown

#### Scenario: Transition allowed when all tasks are complete

- **GIVEN** a workflow step with `requires: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck`
- **AND** the tasks file contains only `- [x] implement login`
- **WHEN** a transition to that step is attempted
- **THEN** the transition proceeds

#### Scenario: Missing artifact file is skipped

- **GIVEN** a workflow step with `requires: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck`
- **AND** the tasks file does not exist in the change directory
- **WHEN** a transition to that step is attempted
- **THEN** the check is skipped and the transition proceeds

#### Scenario: Required artifact without taskCompletionCheck is not content-checked

- **GIVEN** a workflow step with `requires: [specs, tasks]`
- **AND** the `specs` artifact type has no `taskCompletionCheck`
- **AND** the `tasks` artifact type declares `taskCompletionCheck`
- **WHEN** a transition to that step is attempted
- **THEN** only `tasks` is content-checked; `specs` is checked only via `effectiveStatus`

#### Scenario: Generic gating applies to any step, not just implementing to verifying

- **GIVEN** a workflow step `archiving` with `requires: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck`
- **AND** the tasks file contains incomplete items
- **WHEN** a transition to `archiving` is attempted
- **THEN** `InvalidStateTransitionError` is thrown

#### Scenario: Invalid regex pattern is treated as non-matching

- **GIVEN** a workflow step with `requires: [tasks]`
- **AND** the `tasks` artifact type declares `taskCompletionCheck.incompletePattern` as an invalid regex
- **WHEN** a transition to that step is attempted
- **THEN** the check is skipped and the transition proceeds

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
