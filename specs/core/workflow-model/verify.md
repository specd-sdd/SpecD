# Verification: Workflow Model

## Requirements

### Requirement: Step names reference domain lifecycle states

#### Scenario: Invalid step name rejected

- **GIVEN** a schema with `workflow: [{ step: "designing" }, { step: "reviewing" }]`
- **WHEN** the schema is built or resolved
- **THEN** `buildSchema` throws `SchemaValidationError` because `reviewing` is not a valid Change lifecycle state
- **AND** `TransitionChange` is never invoked with that name

#### Scenario: Omitted workflow row does not delete the protocol state

- **GIVEN** a schema whose `workflow[]` lists `designing` and `ready` but not `implementing`
- **AND** `VALID_TRANSITIONS` still allows `ready → implementing`
- **WHEN** `workflowStep("implementing")` is resolved
- **THEN** the result is null (no extras)
- **AND** the hop remains protocol-legal

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

#### Scenario: Status and execute share requires evaluation

- **GIVEN** a step whose `requires` are unsatisfied
- **WHEN** `GetStatus` and `TransitionChange` evaluate the same attempt
- **THEN** both reject via `workflow.requires`
- **AND** they do not disagree on `availableTransitions` versus execute

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

#### Scenario: Task-completion check consumes CountTasks rather than the verdict walking files

- **GIVEN** `requiresTaskCompletion` applies to `tasks`
- **WHEN** predicate evaluation runs
- **THEN** `workflow.taskCompletion.execute` uses `CountTasks`
- **AND** `evaluateLifecycleVerdict` does not read the tasks file itself

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

### Requirement: Step-to-state mapping

#### Scenario: Step name is the target state name

- **GIVEN** a workflow step with `step: "implementing"`
- **WHEN** `TransitionChange` transitions to this step
- **THEN** the Change entity transitions to the `implementing` lifecycle state
- **AND** there is no indirection or mapping table between step and state

### Requirement: Hook execution at step boundaries

#### Scenario: Pre-hooks execute before state change

- **GIVEN** a workflow step with `pre: [{ id: "setup", run: "echo setup" }]`
- **WHEN** `TransitionChange` transitions to this step
- **THEN** pre-hooks execute before the state change occurs

#### Scenario: Post-hooks execute before persist

- **GIVEN** a workflow step with `post: [{ id: "teardown", run: "echo teardown" }]`
- **AND** the attempt is `along = forward`
- **WHEN** `TransitionChange` transitions from this step
- **THEN** those post effects execute after predicates pass and before persist
- **AND** they do not run after the state change is already persisted

#### Scenario: Post run effects only match along forward

- **GIVEN** `implementing.hooks.post` is configured
- **WHEN** the attempt is `implementing → designing`
- **THEN** those post effects do not match
- **AND** `along` is `redesign`

### Requirement: Step requires reference artifact IDs

#### Scenario: Requires contains artifact IDs not step names

- **GIVEN** a workflow step with `requires: ["specs", "verify"]`
- **WHEN** the step's requires are evaluated
- **THEN** they reference artifact IDs (`specs`, `verify`)
- **AND** they do not reference other step names

#### Scenario: Step-to-step circular dependencies are impossible

- **GIVEN** a schema where step A requires step B
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` because step gating only accepts artifact IDs

### Requirement: Workflow array order is display order and progress axis

#### Scenario: Later step available before earlier step

- **GIVEN** a workflow with steps `[designing (requires: []), implementing (requires: [tasks]), verifying (requires: [verify])]`
- **AND** `verify` is `complete` but `tasks` is `in-progress`
- **WHEN** step availability is evaluated for all steps
- **THEN** `designing` is available (empty requires)
- **AND** `implementing` is not available (tasks incomplete)
- **AND** `verifying` is available (verify complete)

#### Scenario: Axis classifies along without sequential locking

- **GIVEN** `workflow[]` order designing, ready, implementing, verifying
- **WHEN** the attempt is `verifying → implementing`
- **THEN** `along` is `backward`
- **AND** consecutive-step occupancy is not required for that classification

#### Scenario: designing is redesign not previous step

- **WHEN** the attempt is `ready → designing`
- **THEN** `along` is `redesign`

#### Scenario: Omitted listed step still classifies along via fallback

- **GIVEN** `workflow[]` omits `implementing`
- **WHEN** the attempt is `ready → verifying`
- **THEN** `along` is `forward`
- **AND** `implementing` remains a protocol state

#### Scenario: Omitted implementing keeps retry backward

- **GIVEN** `workflow[]` omits `implementing`
- **WHEN** the attempt is `verifying → implementing`
- **THEN** `along` is `backward`

### Requirement: Two execution modes

#### Scenario: Agent-driven step requires explicit hook invocation

- **GIVEN** an agent-driven step whose `run:` hooks the skill will run manually
- **WHEN** `TransitionChange` is invoked with `skipHookPhases` covering those effects
- **THEN** auto-hooks for those phases are skipped
- **AND** predicates still run
- **AND** without skip flags, matching `run:` effects still auto-execute

#### Scenario: TransitionChange auto-runs matching run effects

- **GIVEN** a forward transition with matching `run:` post hooks
- **AND** `skipHookPhases` is empty
- **WHEN** `TransitionChange` executes
- **THEN** those effects run after predicates pass
- **AND** the agent is not required to call `run-hooks` for the default path

#### Scenario: Deterministic step executes hooks internally

- **GIVEN** the archiving step with `run:` pre-hooks
- **WHEN** `specd change archive` is executed
- **THEN** `ArchiveChange` executes the pre-hooks internally before performing the archive
