# Verification: Lifecycle Engine

## Requirements

### Requirement: Stateless domain lifecycle verdict

#### Scenario: No LifecycleEngine class

- **WHEN** domain lifecycle evaluation runs
- **THEN** it is invoked as `evaluateLifecycleVerdict` (plain function)
- **AND** there is no `LifecycleEngine` class and no `LifecycleEngineOptions` alias
- **AND** there is no injected debug callback or logger port on the input

### Requirement: Centralized validation logic

#### Scenario: Verdict unifies three validation dimensions

- **GIVEN** a change in `designing` state with a missing required artifact
- **WHEN** `evaluateLifecycleVerdict` is called
- **THEN** it returns an `INCOMPLETE_ARTIFACT` blocker (structural)
- **AND** `isReady` is `false` for the target state
- **AND** `isPermitted` is `true` (protocol allowing the move if artifacts were ready)
- **AND** it does not emit `MISSING_ARTIFACT`

#### Scenario: Verdict projects CheckResults without I/O

- **GIVEN** predicate `CheckResult`s are supplied by the caller
- **WHEN** `evaluateLifecycleVerdict` projects availability
- **THEN** it does not open artifact files or spec repositories
- **AND** `availableTransitions` reflects those results

#### Scenario: availableSteps is lookup rows not protocol membership

- **GIVEN** `workflow[]` omits `implementing`
- **AND** the change is in `ready`
- **WHEN** `evaluateLifecycle` runs with hop `CheckResult`s
- **THEN** `validTransitions` includes `implementing`
- **AND** `availableSteps` does not include an `implementing` extras row

#### Scenario: Requested-target blockers do not dual-write MISSING_ARTIFACT

- **GIVEN** `requestedTarget` check results include a failed `workflow.requires` with code `INCOMPLETE_ARTIFACT`
- **AND** the required artifact is effectively `missing`
- **WHEN** `evaluateLifecycleVerdict` projects `blockers`
- **THEN** the blocker codes include `INCOMPLETE_ARTIFACT`
- **AND** they do not also include `MISSING_ARTIFACT` for the same artifact

### Requirement: Effective artifact status computation

#### Scenario: Recursive block through dependency chain

- **GIVEN** Spec B depends on Spec A
- **AND** Spec A is in `pending-review`
- **AND** Spec B is physically `complete`
- **WHEN** `evaluateLifecycleVerdict` is called
- **THEN** the returned verdict reports Spec B with effective status `pending-parent-artifact-review`
- **AND** the blockers identify Spec A as the cause

#### Scenario: Mixed review and incomplete parents prefer parent-review

- **GIVEN** an artifact is physically `complete`
- **AND** one required parent is `pending-review`
- **AND** another required parent is `in-progress`
- **WHEN** `projectArtifacts` derives effective status
- **THEN** the artifact effective status is `pending-parent-artifact-review`

### Requirement: Canonical-state-only lifecycle interpretation

#### Scenario: Complete-with-drift does not create a new blocker state

- **GIVEN** a file that is canonically `complete`
- **AND** status rendering would project it as `complete-with-drift`
- **WHEN** `projectArtifacts` derives effective artifact status
- **THEN** it treats the file as `complete`

#### Scenario: Missing still blocks through canonical state

- **GIVEN** a file with canonical state `missing`
- **AND** `hasDrift` is also `true`
- **WHEN** `projectArtifacts` derives effective artifact status
- **THEN** it uses `missing` as the blocking state

### Requirement: Machine-readable blockers

#### Scenario: Detailed affected artifacts for drift

- **GIVEN** a change with two spec-scoped files in the `specs` artifact
- **AND** one file has drifted on disk
- **WHEN** `evaluateLifecycleVerdict` is called
- **THEN** it returns a blocker with code `ARTIFACT_DRIFT`
- **AND** `affectedArtifacts` contains exactly the drifted filename and spec ID

### Requirement: Available steps and domain next hop

#### Scenario: Skip bypass allows transition despite blocker

- **GIVEN** an `OVERLAP_CONFLICT` blocker that is skippable
- **AND** the `--allow-overlap` bypass flag is provided
- **WHEN** `evaluateLifecycleVerdict` is called
- **THEN** `OVERLAP_CONFLICT` is absent from `blockers`
- **AND** the verdict does not include a warning object for that overlap
- **AND** `isPermitted` for the target step is `true`

#### Scenario: Overlap review hop is designing

- **GIVEN** a change with an unhandled `spec-overlap-conflict` invalidation
- **WHEN** `evaluateLifecycleVerdict` runs
- **THEN** `review.reason` is `spec-overlap-conflict`
- **AND** `nextHop.targetStep` is `designing`

#### Scenario: Incomplete tasks exclude verifying from availableTransitions

- **GIVEN** a change in `implementing` with incomplete tasks
- **WHEN** `evaluateLifecycle` projects from those check results
- **THEN** `validTransitions` includes `verifying`
- **AND** `availableTransitions` does not include `verifying`
- **AND** `nextAction` recommends `/specd-implement`
- **AND** `nextAction.targetStep` is `implementing`

#### Scenario: Complete tasks recommend verify

- **GIVEN** a change in `implementing` with complete gated tasks
- **AND** verifying requires are satisfied
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` includes `verifying`
- **AND** `nextAction` recommends `/specd-verify`
- **AND** `nextAction.targetStep` is `verifying`

#### Scenario: Passing skip checks recommend bypassing optional implementing

- **GIVEN** a change in `ready`
- **AND** `implementing` is optional
- **AND** its effective `step-skip` predicates pass
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` contains both `implementing` and the legal shortcut target
- **AND** `nextAction.targetStep` is the shortcut target

#### Scenario: Failed skip check recommends entering optional implementing

- **GIVEN** a change in `ready`
- **AND** `implementing` is optional
- **AND** one effective `step-skip` predicate fails
- **WHEN** `evaluateLifecycle` runs
- **THEN** the shortcut target is absent from `availableTransitions`
- **AND** `nextAction.targetStep` is `implementing`

#### Scenario: checksByTarget contains the complete failed shortcut evidence

- **GIVEN** a legal shortcut whose normal predicates pass and whose bypassed-step predicate fails
- **WHEN** `evaluateLifecycle` projects the candidate
- **THEN** `checksByTarget` includes both the normal and `step-skip` results
- **AND** the shortcut is absent from `availableTransitions`

#### Scenario: Empty skip-check set recommends unconditional bypass

- **GIVEN** a change whose immediate next step is optional
- **AND** that step has no effective `step-skip` bindings
- **WHEN** `evaluateLifecycle` runs
- **THEN** Core recommends the first later available target
- **AND** entering the optional step remains an explicit available alternative

#### Scenario: Consecutive optional steps use the furthest passing shortcut

- **GIVEN** two consecutive optional steps after the current state
- **AND** every effective skip predicate for both steps passes
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is the first later mandatory available step

#### Scenario: Disabled verifying recommends done

- **GIVEN** a change in `implementing` with complete tasks
- **AND** a schema where `verifying` is `disabled: true`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` includes `done`
- **AND** `nextAction.targetStep` is `done`

#### Scenario: designing with ready available targets ready

- **GIVEN** a change in `designing` with all required design artifacts complete
- **AND** `ready` is in `availableTransitions`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `ready`
- **AND** `nextAction.command` is `/specd-design`

#### Scenario: verifying with done available targets done

- **GIVEN** a change in `verifying`
- **AND** `done` is in `availableTransitions`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `done`
- **AND** `nextAction.command` is `/specd-verify`

#### Scenario: done lists backward hops without making them nextAction

- **GIVEN** a change in `done` with signoff satisfied or disabled
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` includes `implementing` and `verifying`
- **AND** `nextAction.targetStep` is `archivable`
- **AND** `nextAction.command` is `/specd-archive`

#### Scenario: archivable recommends archive skill

- **GIVEN** a change in `archivable`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `archiving`
- **AND** `nextAction.command` is `/specd-archive`

#### Scenario: Non-recommended available target remains explicit alternative

- **GIVEN** `nextAction` recommends a forward lifecycle target
- **AND** `designing` is also present in `availableTransitions`
- **WHEN** lifecycle guidance is projected
- **THEN** the recommendation remains unchanged
- **AND** the advertised redesign target remains selectable by an explicit skill invocation

#### Scenario: availableSteps follow canonical order regardless of row order

- **GIVEN** a schema whose `workflow` rows are declared as `verifying`, `implementing`, `ready`
- **WHEN** `evaluateLifecycleVerdict` projects `availableSteps`
- **THEN** the steps appear as `ready`, `implementing`, `verifying`

### Requirement: Archiving escape transitions in lifecycle verdict

#### Scenario: Archiving exposes archivable and designing transitions

- **GIVEN** a change in `archiving` state with no blocking restore failure
- **WHEN** `evaluateLifecycle` runs
- **THEN** `validTransitions` includes `archivable` and `designing`
- **AND** `availableTransitions` includes `archivable` and `designing`

#### Scenario: Incomplete restore recommends designing escape

- **GIVEN** a change in `archiving` state
- **AND** the latest `archive-failed` event has `commitStarted: true`
- **AND** batch restore did not complete successfully
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction` recommends transition to `designing` for manual recovery

#### Scenario: archiving to archivable skips requires

- **GIVEN** a change in `archiving`
- **AND** the `archivable` step declares `requires`
- **WHEN** `evaluateLifecycleVerdict` considers `archivable`
- **THEN** `along` is `recovery`
- **AND** those `requires` do not block the hop

### Requirement: Review summary integration

#### Scenario: Overlap conflict detection from history

- **GIVEN** a change history containing a recent `invalidated` event with `cause: 'spec-overlap-conflict'`
- **AND** no subsequent transition out of `designing` has occurred
- **WHEN** `evaluateLifecycleVerdict` is called
- **THEN** it does not identify an `OVERLAP_CONFLICT` blocker
- **AND** `review.reason` is `spec-overlap-conflict`

### Requirement: Shared lifecycle interpretation for consumers

#### Scenario: Consumers rely on one shared lifecycle verdict

- **GIVEN** `GetStatus`, `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction`
- **WHEN** each consumer needs DAG-aware lifecycle answers for the same change
- **THEN** they obtain DAG answers from `evaluateLifecycleVerdict` or public answers from `evaluateLifecycle`
- **AND** none of them reimplements dependency-aware lifecycle interpretation locally
- **AND** `CompileContext` is not in that consumer list

#### Scenario: TransitionChange does not re-walk requires after green evaluate

- **GIVEN** `evaluateLifecycleVerdict` already applied `workflow.requires` for the attempt
- **WHEN** `TransitionChange` executes the same attempt
- **THEN** it maps the first failed predicate to `InvalidStateTransitionError`
- **AND** it does not compute a different effective-status walk for the same artifacts

#### Scenario: CompileContext is not an evaluate consumer

- **WHEN** `CompileContext` assembles agent context
- **THEN** it does not call `evaluateLifecycleVerdict`
- **AND** it does not compute hop `availableTransitions`

#### Scenario: ValidateArtifacts evaluates with empty checksByTarget

- **WHEN** `ValidateArtifacts` needs DAG-aware artifact status
- **THEN** it calls `evaluateLifecycleVerdict` with empty `checksByTarget`
- **AND** it still receives `projectArtifacts` / `nextArtifact` answers

### Requirement: Application lifecycle guidance

#### Scenario: Domain verdict exposes nextHop without command

- **GIVEN** a change in `implementing` with incomplete tasks
- **WHEN** `evaluateLifecycleVerdict` runs
- **THEN** `nextHop.targetStep` is `implementing`
- **AND** the domain result has no `command` field on `nextHop`

#### Scenario: evaluateLifecycle attaches command via guidance

- **GIVEN** the same change and check results
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `implementing`
- **AND** `nextAction.command` is `/specd-implement`

#### Scenario: Disabled verifying routes command forward to archive

- **GIVEN** a change in `implementing` with all tasks complete
- **AND** a schema where `verifying` is `disabled: true`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.command` resolves to `/specd-archive`
- **AND** it does not loop infinitely on `/specd-implement`

#### Scenario: Historical overlap command comes from guidance

- **GIVEN** a change history containing unhandled `spec-overlap-conflict` invalidation
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.command` is `/specd-design`
- **AND** `evaluateLifecycleVerdict` did not embed that command string

#### Scenario: Blocked done with verifying disabled never routes to verify

- **GIVEN** a change in `done` whose schema disables `verifying`
- **AND** the signoff gate is on and sign-off is missing
- **WHEN** `evaluateLifecycle` runs with the real validity verdict (not an injected `verification: 'absent'` fixture)
- **THEN** `nextAction.command` is the sign-off command
- **AND** `nextAction.command` is never `/specd-verify` or `specd changes verification start`

#### Scenario: Guidance verification boundary follows topology

- **GIVEN** a schema whose `workflow[]` rows are declared in noncanonical order and disable `verifying`
- **WHEN** guidance resolves commands for `implementing`, `done`, and `archivable`
- **THEN** no command routes to `/specd-verify` and each command is derived from the active pipeline rather than a fixed state list

#### Scenario: Blocked done with verifying disabled routes to the real blocker

- **GIVEN** a change in `done` whose schema disables `verifying`
- **AND** the real reconciler (no injected verification verdict) with the sign-off gate on and no sign-off recorded
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.command` is the sign-off approval command, not `/specd-verify` and not a fallback `/specd-archive`

### Requirement: Next artifact topological order

#### Scenario: Next artifact prefers DAG order over declaration order

- **GIVEN** schema-std where `proposal` is effectively complete, `design` is incomplete but its only incomplete dependency is `specs`, and `specs` is incomplete
- **WHEN** `evaluateLifecycleVerdict` derives the next artifact
- **THEN** the next artifact is `specs` (not `design`)

#### Scenario: All artifacts complete yields null next artifact

- **GIVEN** every artifact is effectively `complete` or `skipped`
- **WHEN** `evaluateLifecycleVerdict` derives the next artifact
- **THEN** the next artifact is `null`

### Requirement: Predicate blocker artifact identity

#### Scenario: Failed workflow requires exposes its artifact

- **GIVEN** a matching `workflow.requires` predicate fails with an artifact ID in its details
- **WHEN** the lifecycle verdict projects transition blockers
- **THEN** the blocker contains that artifact ID in `blocking`
