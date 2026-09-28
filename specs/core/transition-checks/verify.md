# Verification: Transition Checks

## Requirements

### Requirement: Check identity and result

#### Scenario: Failed predicate carries existing error code

- **GIVEN** a transition attempt whose `workflow.taskCompletion` predicate fails
- **WHEN** the evaluation is returned
- **THEN** the failing check has `id` `workflow.taskCompletion`
- **AND** `label` is `Checking task completion`
- **AND** `kind` is `predicate`
- **AND** `outcome` is `fail`
- **AND** `code` is `INCOMPLETE_TASKS`

#### Scenario: Every registered check declares a gerund label

- **WHEN** the built-in check registry is inspected
- **THEN** each check has a non-empty `label`
- **AND** no label starts with `Executing:`

#### Scenario: Instruction hooks are not checks

- **GIVEN** a workflow step with only `instruction:` entries
- **WHEN** a transition attempt is evaluated
- **THEN** no check row is emitted for those instructions

### Requirement: Check ABI create and WorkflowCheck

#### Scenario: Factory returns WorkflowCheck-compatible instance

- **WHEN** `createWorkflowTaskCompletion({ countTasks })` is called
- **THEN** the result has `id` `workflow.taskCompletion`
- **AND** `kind` is `predicate`
- **AND** `execute` is a function
- **AND** the instance is compatible with `WorkflowCheck`

#### Scenario: Execute does not take a global snapshot bag

- **WHEN** `execute` is invoked
- **THEN** its argument is `CheckExecutionContext` (change, schema, attempt, baked `approvals`, skip flags)
- **AND** it does not accept `PredicateSnapshots`

#### Scenario: CountTasks memo lives on passMemo not the check instance

- **GIVEN** one `createWorkflowTaskCompletion` instance used across two evaluation passes
- **WHEN** each pass creates a fresh `passMemo` on `CheckExecutionContext`
- **THEN** `CountTasks` may run at most once per pass
- **AND** the second pass recounts even if the instance is the same

### Requirement: One implementation file per check

#### Scenario: Each check id has a dedicated module

- **WHEN** the checks package is inspected
- **THEN** each registered check id is defined in its own implementation file
- **AND** that check’s class declares `id` and `kind`
- **AND** `kind` is `'predicate'` or `'effect'` (never omitted)
- **AND** a `create*` factory returns a `Check` compatible with `WorkflowCheck`
- **AND** that file does not declare applicability
- **AND** registry bindings declare `from` / `to` / `along` or operation `archive` for every attached check, including archive-only ones
- **AND** no check’s `execute` body lives inside another check’s file

### Requirement: Applicability from, to, and along

#### Scenario: Spec approval does not apply to redesign

- **GIVEN** `approval.spec` bound as `from = ready`, `to = *`, `along = forward`
- **AND** the spec gate is on
- **WHEN** the attempt is `ready → designing`
- **THEN** `along` is `redesign`
- **AND** `approval.spec` does not match

#### Scenario: Recovery is not backward

- **WHEN** the attempt is `archiving → archivable`
- **THEN** `along` is `recovery`
- **AND** it is not classified as `backward`

#### Scenario: Omitted workflow row is not removed from the axis

- **GIVEN** `workflow[]` omits `implementing`
- **WHEN** the attempt is `ready → verifying`
- **THEN** `along` is `forward`
- **AND** `VALID_TRANSITIONS` still lists `implementing` as a state

#### Scenario: Omitted implementing keeps retry backward

- **GIVEN** `workflow[]` omits `implementing`
- **WHEN** the attempt is `verifying → implementing`
- **THEN** `along` is `backward`

#### Scenario: Omitted ready stays forward into implementing

- **GIVEN** `workflow[]` lists `designing`, `implementing`, `verifying` and omits `ready`
- **WHEN** the attempt is `ready → implementing`
- **THEN** `along` is `forward`

#### Scenario: Unknown workflow step does not occupy the axis

- **GIVEN** `workflow[]` includes `step: reviewing` among known states
- **WHEN** `along` is classified for `ready → implementing`
- **THEN** `reviewing` is not an axis slot
- **AND** the hop is still `forward`

### Requirement: Archive is an operation not an edge

#### Scenario: Signoff is not an archive predicate

- **WHEN** `ArchiveChange` evaluates operation `archive`
- **THEN** `approval.signoff` is not in the attached predicate list

### Requirement: Binding pipeline phase and failure policy

#### Scenario: Archive post runs after persist because of phase

- **GIVEN** archive `hook.post` bound with `phase = after-persist` and `onFailure = collect`
- **WHEN** `ArchiveChange` executes and publication succeeds
- **THEN** that effect runs after `archiveRepository.archive()`
- **AND** `ArchiveChange` does not select it by `check.id === 'hook.post'`

#### Scenario: Archive pre abort comes from onFailure

- **GIVEN** archive `hook.pre` bound with `phase = before-persist` and `onFailure = abort`
- **AND** the effect fails
- **WHEN** `ArchiveChange` executes
- **THEN** persist does not occur
- **AND** the failure is not collected as `postHookFailures`

### Requirement: Predicate versus effect

#### Scenario: Status allowed ignores effects

- **GIVEN** matching `run:` post-hooks exist for a forward exit
- **WHEN** `GetStatus` evaluates the same edge
- **THEN** `allowed` does not wait on those hooks

#### Scenario: Skip-hooks still runs predicates

- **GIVEN** `skipHookPhases` contains `all`
- **AND** `workflow.taskCompletion` would fail
- **WHEN** `TransitionChange` executes
- **THEN** the transition is still rejected for incomplete tasks
- **AND** no `run:` hook is invoked

### Requirement: Evaluation of a transition attempt

#### Scenario: Protocol fails fast before other predicates

- **GIVEN** a requested pair absent from `VALID_TRANSITIONS`
- **WHEN** the attempt is evaluated
- **THEN** `protocol.edge` fails first with `INVALID_TRANSITION`

#### Scenario: No routing to pending

- **GIVEN** spec gate on and no spec approval recorded
- **AND** the change is in `ready`
- **WHEN** `TransitionChange` is invoked with `to: 'implementing'`
- **THEN** the change remains in `ready`
- **AND** `approval.spec` fails with `APPROVAL_REQUIRED`
- **AND** the persisted state is not `pending-spec-approval`

### Requirement: Shared validity verdict and recovery priority

#### Scenario: Identical facts produce identical recovery

- **GIVEN** the same fresh change, schema, gates, policy, artifacts, and implementation files
- **WHEN** status, validation, transition, and archive evaluate validity
- **THEN** each receives the same blockers, affected inputs, recovery priority, and next action

#### Scenario: Verification staleness blocks without moving lifecycle

- **GIVEN** stale verification at a boundary that requires current evidence
- **WHEN** validity is evaluated
- **THEN** progress is blocked with in-place verification guidance
- **AND** no verification-driven lifecycle return is selected

### Requirement: Single validity reconciliation owner

#### Scenario: Repeated observation is idempotent

- **GIVEN** reconciliation already persisted projection changes and required recovery
- **WHEN** another entry point reconciles unchanged facts
- **THEN** it appends no duplicate invalidation or transition events
- **AND** returns the same canonical verdict

#### Scenario: Missing reconciler never selects a legacy path

- **WHEN** a mutating use case is constructed without the required reconciler
- **THEN** construction or execution fails with the typed configuration error
- **AND** `Change.invalidate` is not invoked as a fallback

### Requirement: Registry bindings for this capability

Scenarios:

#### Scenario: Verification exit uses a non-mutating registered check

- **GIVEN** `verifying → done` is evaluated with only an active attempt
- **WHEN** `verification.current` executes
- **THEN** it fails with actionable structured detail
- **AND** it neither completes the attempt nor changes projections

#### Scenario: Fresh completed evidence passes through shared evaluation

- **GIVEN** completed evidence matches fresh resolved inputs
- **WHEN** both `CompleteVerification` freshness evaluation and `verification.current` evaluate that snapshot
- **THEN** both produce the same freshness verdict
- **AND** only explicit completion is allowed to persist success

#### Scenario: Missing verification verdict fails closed

- **GIVEN** a verification-requiring boundary has no canonical verification verdict
- **WHEN** `verification.current` executes
- **THEN** it fails with unavailable-validity guidance rather than skipping

#### Scenario: Explicit not-required verdict skips

- **WHEN** the canonical verdict explicitly marks verification `not-required`
- **THEN** `verification.current` skips without fabricating completed evidence

#### Scenario: Overlapping implementation bindings are deduplicated

- **GIVEN** `implementing → verifying` matches forward-exit and verifying-entry applicability
- **WHEN** registered checks are evaluated
- **THEN** `impl.filesResolved` and `impl.linksInScope` each execute exactly once

#### Scenario: Each implementation boundary remains independently guarded

- **WHEN** a permitted transition enters `verifying` from another state or exits `implementing` forward to another state
- **THEN** both implementation readiness checks execute for the applicable boundary

#### Scenario: Verification start uses operation context

- **WHEN** explicit start runs outside `verifying`
- **THEN** it executes the registered implementation checks through operation context
- **AND** does not fabricate a lifecycle edge or self-transition

### Requirement: Projections

#### Scenario: Incomplete tasks hide verifying from availableTransitions

- **GIVEN** a change in `implementing` with incomplete `tasks` items
- **WHEN** `GetStatus` runs
- **THEN** `validTransitions` still includes `verifying`
- **AND** `availableTransitions` does not include `verifying`
- **AND** `nextAction` still recommends `/specd-implement`

#### Scenario: Complete tasks recommend verify skill

- **GIVEN** a change in `implementing` with all gated tasks complete
- **AND** `workflow.requires` for `verifying` is satisfied
- **WHEN** `GetStatus` runs
- **THEN** `availableTransitions` includes `verifying`
- **AND** `nextAction` recommends `/specd-verify` not `/specd-implement`

#### Scenario: Failed spec gate recommends approve not pending

- **GIVEN** a change in `ready` with spec gate on and no spec approval
- **WHEN** `GetStatus` runs
- **THEN** `nextAction` recommends `specd changes approve spec`
- **AND** it does not recommend a transition to `pending-spec-approval`

#### Scenario: Backward hops listed but not happy-path nextAction

- **GIVEN** a change in `done`
- **WHEN** `GetStatus` runs
- **THEN** `availableTransitions` includes `implementing` and `verifying`
- **AND** `nextAction` recommends archive or signoff-approve, not the implement skill

### Requirement: No shared snapshot bag

#### Scenario: Task completion gathers inside its own execute

- **GIVEN** `workflow.taskCompletion` is composed with `CountTasks`
- **WHEN** its `execute` runs for a transition attempt
- **THEN** that instance calls `CountTasks`
- **AND** `GetStatus` does not pass a `PredicateSnapshots` bag into the check
- **AND** no `PredicateSnapshots` type exists in the public or domain ABI
- **AND** `gatherPredicateSnapshots` does not exist
- **AND** `evaluateLifecycleVerdict` does not fall back to `check.run` against a bag

#### Scenario: Archive registry does not bind publication

- **WHEN** operation `archive` bindings are inspected
- **THEN** `archive.publication` is not registered
- **AND** merge/publish preflight remains in `ArchiveChange` after predicates pass

#### Scenario: One binding table

- **WHEN** transition and archive applicability is inspected
- **THEN** `from` / `to` / `along` (and operation `archive`) are declared once
- **AND** domain and application registries do not copy independent row lists

#### Scenario: TransitionChange does not launch hooks by id

- **GIVEN** matching `hook.pre` / `hook.post` bindings
- **WHEN** `TransitionChange` executes
- **THEN** it calls `check.execute` on matching effects
- **AND** it does not branch on `check.id === 'hook.pre'` to invoke `RunStepHooks`

### Requirement: Actionable fail diagnostics

#### Scenario: deps.consistent fail shows extracted versus persisted

- **GIVEN** extracted `dependsOn` for a spec is `[]` and persisted is `['cli:entrypoint', 'core:change']`
- **WHEN** `deps.consistent` fails
- **THEN** `message` includes both the empty extracted list and the persisted ids
- **AND** `details` includes per-spec extracted and persisted arrays

#### Scenario: impl fail text stays a compact summary

- **GIVEN** `impl.filesResolved` or `impl.linksInScope` fails with more than three items
- **WHEN** the fail `message` is rendered for text status / repair / transition failure
- **THEN** the message is a count plus at most three `examples`
- **AND** it does not list the full inventory in that text message

### Requirement: Generic check progress bus

#### Scenario: Predicate emits start and done without stream

- **GIVEN** a matching `deps.consistent` predicate on a transition attempt
- **WHEN** `TransitionChange` executes that attempt
- **THEN** progress includes `check-start` with id `deps.consistent` and label `Checking spec dependencies`
- **AND** progress includes `check-done` with the same id/label and the check outcome
- **AND** no `Executing:` prefix appears in the text rendering of those events

#### Scenario: Hook effect maps onto the same bus

- **GIVEN** matching `hook.post` with a long-running `run:` command
- **WHEN** `TransitionChange` executes
- **THEN** progress includes `check-start` for `hook.post` with label `Running post hooks`
- **AND** `RunStepHooks` output/heartbeats appear as `check-progress` for that id
- **AND** progress includes `check-done` for `hook.post` when the phase finishes

### Requirement: Approval precedence and production registry composition

#### Scenario: Parked approval is reported before protocol edge failure

- **GIVEN** a historic parked approval state receives a non-drain target
- **WHEN** transition checks are evaluated
- **THEN** the public repair reason is the matching approval requirement

#### Scenario: Production composition supplies overlap detection

- **WHEN** status or archive composition resolves its workflow check registry
- **THEN** the registry receives the overlap detector dependency
