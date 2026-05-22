# Verification: Lifecycle Engine

## Requirements

### Requirement: Centralized validation logic

#### Scenario: Engine unifies three validation dimensions

- **GIVEN** a change in `designing` state with a missing required artifact
- **WHEN** `LifecycleEngine.evaluate` is called
- **THEN** it returns a `MISSING_ARTIFACT` blocker (structural)
- **AND** `isReady` is `false` for the target state
- **AND** `isPermitted` is `true` (protocol allowing the move if artifacts were ready)

### Requirement: Effective artifact status computation

#### Scenario: Recursive block through dependency chain

- **GIVEN** Spec B depends on Spec A
- **AND** Spec A is in `pending-review`
- **AND** Spec B is physically `complete`
- **WHEN** `LifecycleEngine.evaluate` is called
- **THEN** the returned verdict reports Spec B with effective status `pending-parent-artifact-review`
- **AND** the blockers identify Spec A as the cause

### Requirement: Canonical-state-only lifecycle interpretation

#### Scenario: Complete-with-drift does not create a new blocker state

- **GIVEN** a file that is canonically `complete`
- **AND** status rendering would project it as `complete-with-drift`
- **WHEN** LifecycleEngine derives effective artifact status
- **THEN** it treats the file as `complete`

#### Scenario: Missing still blocks through canonical state

- **GIVEN** a file with canonical state `missing`
- **AND** `hasDrift` is also `true`
- **WHEN** LifecycleEngine derives effective artifact status
- **THEN** it uses `missing` as the blocking state

### Requirement: Machine-readable blockers

#### Scenario: Detailed affected artifacts for drift

- **GIVEN** a change with two spec-scoped files in the `specs` artifact
- **AND** one file has drifted on disk
- **WHEN** `LifecycleEngine.evaluate` is called
- **THEN** it returns a blocker with code `ARTIFACT_DRIFT`
- **AND** `affectedArtifacts` contains exactly the drifted filename and spec ID

### Requirement: Available steps and next action

#### Scenario: Skip bypass allows transition despite blocker

- **GIVEN** an `OVERLAP_CONFLICT` blocker that is skippable
- **AND** the `--allow-overlap` bypass flag is provided
- **WHEN** `LifecycleEngine.evaluate` is called
- **THEN** the blocker is downgraded to a warning
- **AND** `isPermitted` for the target step is `true`

### Requirement: Review summary integration

#### Scenario: Overlap conflict detection from history

- **GIVEN** a change history containing a recent `invalidated` event with `cause: 'spec-overlap-conflict'`
- **AND** no subsequent transition out of `designing` has occurred
- **WHEN** `LifecycleEngine.evaluate` is called
- **THEN** it identifies an `OVERLAP_CONFLICT` blocker
- **AND** includes details about the overlapping archived change

### Requirement: Shared lifecycle interpretation for consumers

#### Scenario: Consumers rely on one shared lifecycle verdict

- **GIVEN** `GetStatus`, `CompileContext`, `TransitionChange`, `ValidateArtifacts`, and `GetArtifactInstruction`
- **WHEN** each consumer needs DAG-aware lifecycle answers for the same change
- **THEN** they all obtain those answers from `LifecycleEngine.evaluate`
- **AND** none of them reimplements dependency-aware lifecycle interpretation locally

### Requirement: Next artifact topological order

#### Scenario: Next artifact prefers DAG order over declaration order

- **GIVEN** schema-std where `proposal` is effectively complete, `design` is incomplete but its only incomplete dependency is `specs`, and `specs` is incomplete
- **WHEN** `LifecycleEngine` derives the next artifact
- **THEN** the next artifact is `specs` (not `design`)

#### Scenario: All artifacts complete yields null next artifact

- **GIVEN** every artifact is effectively `complete` or `skipped`
- **WHEN** `LifecycleEngine` derives the next artifact
- **THEN** the next artifact is `null`
