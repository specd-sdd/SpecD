# Verification: Workflow Model

## Requirements

### Requirement: Step names reference domain lifecycle states

#### Scenario: Invalid step name rejected

- **GIVEN** a schema with `workflow: [{ step: "designing" }, { step: "reviewing" }]`
- **WHEN** the schema is built or resolved
- **THEN** `buildSchema` throws `SchemaValidationError` because `reviewing` is not a valid Change lifecycle state
- **AND** `TransitionChange` is never invoked with that name

#### Scenario: Drain-state row rejected

- **GIVEN** a schema with a `workflow` row `{ step: "pending-spec-approval" }` (or any other drain-only approval state)
- **WHEN** the schema is built or resolved
- **THEN** `buildSchema` throws `SchemaValidationError`
- **AND** the drain state never occupies a pipeline slot

#### Scenario: Omitted workflow row does not delete the protocol state

- **GIVEN** a schema whose `workflow[]` lists `designing` and `ready` but not `implementing`
- **WHEN** `workflowStep("implementing")` is resolved
- **THEN** the result is null (no extras)
- **AND** `implementing` remains enabled in the pipeline and `ready → implementing` remains legal

#### Scenario: A workflow row may attach archiveChecks

- **GIVEN** a `workflow[]` row with `step: archiving` and `archiveChecks`
- **WHEN** the schema is built
- **THEN** the row attaches those declarations without introducing a new lifecycle state

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

### Requirement: Optional and disabled step declarations

#### Scenario: Schema parses optional and disabled properties

- **GIVEN** a schema workflow step declaring `optional: true` and `disabled: false`
- **WHEN** the schema is built and resolved
- **THEN** `workflowStep.optional` is `true`
- **AND** `workflowStep.disabled` is `false`

#### Scenario: Bedrock states cannot be disabled

- **GIVEN** a schema attempting to set `optional: true` or `disabled: true` on `designing`, `done`, or `archivable`
- **WHEN** `buildSchema` or schema resolution executes
- **THEN** a `SchemaValidationError` is thrown

#### Scenario: Done remains mandatory when signoff is disabled

- **GIVEN** `approvals.signoff: false`
- **WHEN** Core builds the active workflow
- **THEN** `done` remains a mandatory state between delivery and `archivable`
- **AND** `approval.signoff` skips on `done -> archivable`

#### Scenario: Active approval anchors cannot be disabled

- **GIVEN** `approvals.spec: true`
- **AND** a schema declaring `ready: { disabled: true }`
- **WHEN** the schema is built or resolved with the project approvals, including `specd schema validate`
- **THEN** a `SchemaValidationError` is thrown at build/resolve time
- **AND** the error is not deferred until the first topology query of a change

#### Scenario: Disabling every configurable delivery step is valid

- **GIVEN** `approvals.spec: false`
- **AND** a schema declaring `ready`, `implementing`, and `verifying` as `disabled: true`
- **WHEN** the schema is built and resolved
- **THEN** no error is thrown
- **AND** the active path is `designing → done → archivable`

#### Scenario: Optional step with no effective skip checks is unconditional

- **GIVEN** a workflow step declared `optional: true`
- **AND** the registry and schema contribute no effective `step-skip` binding for that step
- **WHEN** Core evaluates a shortcut across it
- **THEN** the bypass is permitted

#### Scenario: Skills cannot redefine optionality

- **GIVEN** Core projects a shortcut across an optional step in `availableTransitions`
- **WHEN** an agent skill selects its next hop
- **THEN** it consumes the projection without adding an undeclared task or check condition

### Requirement: Workflow step checks and skip-checks declarations

#### Scenario: Schema builds step checks and skip-checks declarations

- **GIVEN** a workflow step declaring valid `checks` and `skipChecks` with known IDs
- **WHEN** `buildSchema` builds the schema
- **THEN** `workflowStep.checks` contains the parsed transition check declarations
- **AND** `workflowStep.skipChecks` contains the parsed skip check declarations

#### Scenario: Referencing unknown check ID throws UnknownCheckError

- **GIVEN** a workflow step declaring a check or skipCheck with ID `@unknown.check`
- **WHEN** `buildSchema` executes
- **THEN** `UnknownCheckError` is thrown identifying `@unknown.check`

#### Scenario: Duplicate coordinate throws DuplicateCheckBindingError

- **GIVEN** a workflow step declaring two checks with the same ID, scope, and direction
- **WHEN** `buildSchema` executes
- **THEN** `DuplicateCheckBindingError` is thrown

#### Scenario: Unknown checks from state is rejected

- **GIVEN** a workflow `checks[]` declaration whose `from` value is neither `*` nor a known lifecycle state
- **WHEN** schema parsing and semantic validation execute
- **THEN** a typed schema validation error identifies the invalid source state

#### Scenario: Embedding locked check throws CheckEmbeddingForbiddenError

- **GIVEN** a check registered with `allowSchemaEmbedding: false`
- **WHEN** a schema declares this check in `checks` or `skipChecks` at a coordinate none of its code-defined bindings serves
- **THEN** `CheckEmbeddingForbiddenError` is thrown

#### Scenario: Declaring a check at its own code-defined coordinate is accepted

- **GIVEN** a built-in or plugin check with `allowSchemaEmbedding: false` and a code-defined binding entering step `verifying` along `forward`
- **WHEN** a schema declares the check in `verifying.checks` with `along: forward` and an allowed `config`
- **THEN** schema validation succeeds for both the built-in and the plugin check

#### Scenario: Later schema layer may change a schema-owned declaration

- **GIVEN** a base schema declaring a Category C check on a step where no code-defined binding serves it
- **WHEN** a later schema layer changes that declaration's `onFailure` or `skippable`
- **THEN** `buildSchema` validates the merged declaration without `CheckBindingOverrideForbiddenError`

#### Scenario: Overriding locked binding policy throws CheckBindingOverrideForbiddenError

- **GIVEN** a code-defined binding registered with `allowBindingOverride: false`
- **WHEN** a schema attempts to modify `onFailure` or `skippable`
- **THEN** `CheckBindingOverrideForbiddenError` is thrown

#### Scenario: Overriding locked configuration throws CheckConfigOverrideForbiddenError

- **GIVEN** a check or binding registered with `allowConfigOverride: false`
- **WHEN** a schema supplies a non-empty `config` object
- **THEN** `CheckConfigOverrideForbiddenError` is thrown

#### Scenario: Disabling locked check throws CheckDisableForbiddenError

- **GIVEN** a check or binding registered with `allowDisable: false`
- **WHEN** a schema declares `disabled: true`
- **THEN** `CheckDisableForbiddenError` is thrown

#### Scenario: Declaring skipChecks on disabled step throws SchemaValidationError

- **GIVEN** a workflow step declared with `disabled: true` and a non-empty `skipChecks` array
- **WHEN** `buildSchema` executes
- **THEN** `SchemaValidationError` is thrown indicating skipChecks cannot be declared on disabled steps

#### Scenario: archiveChecks on the archiving step

- **GIVEN** `step: archiving` with `archiveChecks: [{ id: spec.overlap, skippable: false }]`
- **WHEN** the schema is built
- **THEN** the declaration applies at the `{ id: spec.overlap, scope: 'archive' }` coordinate

#### Scenario: archiveChecks on another step is rejected

- **GIVEN** `step: verifying` with `archiveChecks`
- **WHEN** the schema is built
- **THEN** `SchemaValidationError` is thrown naming `verifying`

#### Scenario: archiveChecks with an unregistered id

- **GIVEN** `archiveChecks: [{ id: '@nope.check' }]`
- **WHEN** the schema is built
- **THEN** `UnknownCheckError` is thrown

#### Scenario: Duplicate archive coordinate

- **GIVEN** `archiveChecks` listing `spec.overlap` twice
- **WHEN** the schema is built
- **THEN** `DuplicateCheckBindingError` is thrown

#### Scenario: Archive locks are enforced for archiveChecks

- **GIVEN** `archiveChecks` that disable `workspace.readOnly`, make `impl.filesResolved` skippable, or configure `deps.consistent`
- **WHEN** the schema is built
- **THEN** `CheckDisableForbiddenError`, `CheckBindingOverrideForbiddenError`, and `CheckConfigOverrideForbiddenError` are thrown respectively

#### Scenario: Placement lock applies to archiveChecks

- **GIVEN** a plugin check with `allowSchemaEmbedding: false` and no archive binding
- **WHEN** `archiveChecks` declares it
- **THEN** `CheckEmbeddingForbiddenError` is thrown

#### Scenario: Same id in checks and archiveChecks of the archiving entry

- **GIVEN** `step: archiving` declares `checks: [{ id: impl.linksInScope }]` and `archiveChecks: [{ id: impl.linksInScope }]`
- **WHEN** the schema is built
- **THEN** no duplicate error is raised because the coordinates are `{ scope: 'transition', to: archiving }` and `{ scope: 'archive' }`

#### Scenario: Disabling one coordinate does not affect the other

- **GIVEN** `impl.linksInScope` is declared in `checks` and in `archiveChecks`, with `disabled: true` only in `archiveChecks`
- **WHEN** bindings are resolved for the transition and for the archive operation
- **THEN** the transition coordinate remains and the archive coordinate is removed

#### Scenario: Redundant declaration of a locked archive check is accepted

- **GIVEN** `archiveChecks: [{ id: workspace.readOnly, skippable: false }]`
- **WHEN** the schema is built
- **THEN** no governance error is raised

#### Scenario: Empty archiveChecks is valid

- **GIVEN** `step: archiving` with `archiveChecks: []`
- **WHEN** the schema is built
- **THEN** it builds without error

#### Scenario: Declarations for non-archive checks are unaffected

- **GIVEN** a schema with only `checks` and `skipChecks`
- **WHEN** it is built
- **THEN** its validation outcome is identical to before `archiveChecks` existed

### Requirement: Sovereign change schema authority

#### Scenario: Change preserves its recorded schema identity across project reconfigurations

- **GIVEN** a change created under schema `custom-workflow@1.0.0`
- **WHEN** the project `specd.yaml` config is updated to use `@specd/schema-std`
- **THEN** the change's manifest continues to record schema name `custom-workflow` with version `1`
- **AND** lifecycle and status operations resolve that schema by name via `SchemaProvider.get('custom-workflow')`
- **AND** a resolved same-name schema with a different version produces a `SCHEMA_VERSION_DRIFT` advisory instead of a versioned lookup or an error

#### Scenario: LazySchemaProvider caches schemas by reference

- **GIVEN** a `LazySchemaProvider`
- **WHEN** `get('custom-workflow')` is called multiple times
- **THEN** the schema is resolved once and cached for subsequent requests

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

### Requirement: Step check declarations

#### Scenario: Workflow step accepts check declarations

- **GIVEN** a workflow step schema definition with `checks` array
- **WHEN** loading the workflow model
- **THEN** each step exposes its declared `checks` with `id`, `along`, `onFailure`, `skippable`, `disabled`, and `config`

#### Scenario: Step check declaration defaults along to forward

- **GIVEN** a check declaration `{ id: '@qa.coverage' }` without an explicit `along`
- **WHEN** reading the normalized step check declaration
- **THEN** `along` defaults to `'forward'`

#### Scenario: Step check declaration preserves disabled property

- **GIVEN** a check declaration `{ id: '@qa.coverage', disabled: true }`
- **WHEN** reading the normalized step check declaration
- **THEN** `disabled` is true

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

- **GIVEN** a schema where step A's `requires` lists step name `implementing` and no artifact with that ID exists
- **WHEN** `buildSchema` validates the schema
- **THEN** it throws `SchemaValidationError` because `requires` only accepts declared artifact IDs

### Requirement: Workflow array order is not significant

#### Scenario: Noncanonical row order does not change the axis

- **GIVEN** `workflow[]` rows declared as `verifying`, `implementing`, `ready`
- **WHEN** the progress axis and the status display order are computed
- **THEN** both use the canonical order `designing, ready, implementing, verifying, done`
- **AND** no error is raised for the declared row order
- **AND** the attempt `implementing → verifying` classifies as `forward`

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

#### Scenario: Disabled steps are excluded from progress axis

- **GIVEN** `workflow[]` declares `verifying: { disabled: true }`
- **WHEN** `resolveWorkflowPipeline` computes the progress axis
- **THEN** `verifying` is excluded from the active axis
- **AND** `ready -> done` classifies as `forward`

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
