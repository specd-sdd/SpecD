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

#### Scenario: Blocker skippability comes from resolved bindings without bypassFlag

- **GIVEN** a failed `spec.overlap` check with code `OVERLAP_CONFLICT`
- **AND** the resolved `spec.overlap` binding has `skippable: false` (via schema `archiveChecks` or `resolvedBindings`)
- **WHEN** `evaluateLifecycleVerdict` projects `blockers`
- **THEN** the `OVERLAP_CONFLICT` blocker has `isSkippable: false`
- **AND** the blocker carries no CLI `bypassFlag`

#### Scenario: Blocker propagates CheckAction from failed check

- **GIVEN** a failed `approval.spec` check with `action: { kind: 'approve-spec' }`
- **WHEN** `evaluateLifecycleVerdict` projects `blockers`
- **THEN** the projected `LifecycleBlocker` preserves `action: { kind: 'approve-spec' }`

#### Scenario: CLI flag syntax is not interpreted by core

- **GIVEN** a skippable `spec.overlap` blocker
- **WHEN** the verdict input `skippedCheckIds` contains `--skip-checks spec.overlap` instead of `spec.overlap`
- **THEN** the blocker is NOT omitted
- **AND** only the host-neutral id `spec.overlap` omits it

#### Scenario: Every verification validity blocker carries an action

- **GIVEN** the `verification.current` check fails with each of `VERIFICATION_STALE`, `VERIFICATION_REQUIRED`, `VERIFICATION_IN_PROGRESS`, and `VERIFICATION_VALIDITY_UNAVAILABLE`
- **WHEN** `evaluateLifecycleVerdict` projects `blockers`
- **THEN** each blocker carries `action: { kind: 'start-verification' }` or `action: { kind: 'refresh-status' }` with `params.changeName`
- **AND** none carries `details.command` or any CLI or slash-command string

### Requirement: Available steps and domain next hop

#### Scenario: Skip bypass allows transition despite blocker

- **GIVEN** an `OVERLAP_CONFLICT` blocker that is skippable
- **AND** `spec.overlap` is listed in the verdict input `skippedCheckIds`
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
- **AND** `nextAction.intent` is `'implement'`
- **AND** `nextAction.targetStep` is `implementing`

#### Scenario: Complete tasks recommend verify

- **GIVEN** a change in `implementing` with complete gated tasks
- **AND** verifying requires are satisfied
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` includes `verifying`
- **AND** `nextAction.intent` is `'verify'`
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
- **AND** `nextAction.intent` is `'design'`

#### Scenario: verifying with done available targets done

- **GIVEN** a change in `verifying`
- **AND** `done` is in `availableTransitions`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `done`
- **AND** `nextAction.intent` is `'verify'`

#### Scenario: done lists backward hops without making them nextAction

- **GIVEN** a change in `done` with signoff satisfied or disabled
- **WHEN** `evaluateLifecycle` runs
- **THEN** `availableTransitions` includes `implementing` and `verifying`
- **AND** `nextAction.targetStep` is `archivable`
- **AND** `nextAction.intent` is `'archive'`

#### Scenario: archivable recommends archive skill

- **GIVEN** a change in `archivable`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `archiving`
- **AND** `nextAction.intent` is `'archive'`

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

### Requirement: Next hop derives from candidate evaluation

#### Scenario: Missing approval keeps the hop in place without reading approval state

- **GIVEN** a change in `ready` whose forward candidate is absent from `availableTransitions` because `approval.spec` failed
- **WHEN** `evaluateLifecycleVerdict` resolves `nextHop`
- **THEN** `nextHop.targetStep` is `ready` and `actionType` is `mechanical`
- **AND** the reason does not mention approval
- **AND** the verdict did not read `activeSpecApproval` or `approvals.spec`

#### Scenario: Parked state recommends its delivery edge when available

- **GIVEN** a change in `pending-spec-approval` with `implementing` in `availableTransitions`
- **WHEN** the verdict resolves `nextHop`
- **THEN** `nextHop.targetStep` is `implementing`
- **AND** the same rule applies to `spec-approved` and to `pending-signoff` / `signed-off` toward `archivable`

#### Scenario: Parked state stays in place when its exit is blocked

- **GIVEN** a change in `pending-signoff` whose `archivable` hop is blocked by `approval.signoff`
- **WHEN** the verdict resolves `nextHop`
- **THEN** `nextHop.targetStep` is `pending-signoff`
- **AND** `blockers` contains the `APPROVAL_REQUIRED` blocker with the `approve-signoff` action

#### Scenario: Illegal target reports a generic invalid transition

- **GIVEN** a change in `ready`
- **WHEN** a transition to `pending-spec-approval` is requested
- **THEN** the verdict reports `INVALID_TRANSITION` from topology
- **AND** the message uses the same template as for every other illegal target (the target name may be interpolated) and no target-specific wording

#### Scenario: Verification boundary has one derivation

- **GIVEN** reconciliation and verification invalidation evaluate a change in `pending-signoff` with `verifying` enabled
- **WHEN** each decides whether verification evidence is required
- **THEN** both use `isAtOrAfterVerificationBoundary`
- **AND** neither consults a local list of states

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
- **THEN** it reports the first failed predicate as `CheckPredicateFailedError`
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

#### Scenario: Domain verdict exposes nextHop without command or intent

- **GIVEN** a change in `implementing` with incomplete tasks
- **WHEN** `evaluateLifecycleVerdict` runs
- **THEN** `nextHop.targetStep` is `implementing`
- **AND** the domain result has no `command` or `intent` field on `nextHop`

#### Scenario: evaluateLifecycle attaches host-neutral intent via guidance

- **GIVEN** the same change and check results
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `implementing`
- **AND** `nextAction.intent` is `'implement'`
- **AND** `nextAction` carries no CLI or slash command string

#### Scenario: Disabled verifying routes intent forward to archive

- **GIVEN** a change in `implementing` with all tasks complete
- **AND** a schema where `verifying` is `disabled: true`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.intent` resolves to `'archive'`
- **AND** it does not loop infinitely on `'implement'`

#### Scenario: Historical overlap intent comes from guidance

- **GIVEN** a change history containing unhandled `spec-overlap-conflict` invalidation
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.intent` is `'design'`
- **AND** `evaluateLifecycleVerdict` did not embed any command string

#### Scenario: Blocked done with verifying disabled never routes to verify

- **GIVEN** a change in `done` whose schema disables `verifying`
- **AND** the signoff gate is on and sign-off is missing
- **WHEN** `evaluateLifecycle` runs with the real validity verdict (not an injected `verification: 'absent'` fixture)
- **THEN** `nextAction.action` is `{ kind: 'approve-signoff' }` and `nextAction.intent` is `null`
- **AND** `nextAction.intent` is never `'verify'`

#### Scenario: Guidance verification boundary follows topology

- **GIVEN** a schema whose `workflow[]` rows are declared in noncanonical order and disable `verifying`
- **WHEN** guidance resolves intents for `implementing`, `done`, and `archivable`
- **THEN** no intent routes to `'verify'` and each intent is derived from the active pipeline rather than a fixed state list

#### Scenario: First failed action on the waiting hop wins

- **GIVEN** a change in `ready` whose forward hop fails two predicates, the first in binding order declaring `{ kind: 'approve-spec' }` and the second declaring a plugin action
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.action` is `{ kind: 'approve-spec' }` and `nextAction.intent` is `null`

#### Scenario: Actions of other hops never contribute

- **GIVEN** a change in `implementing` with incomplete tasks, where a plugin check bound only to a different candidate hop fails
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.intent` is `'implement'` and `nextAction.action` is undefined

#### Scenario: Informational action keeps the phase intent

- **GIVEN** a change in `verifying` whose `verification.current` fails with `{ kind: 'start-verification', supersedesIntent: false }`
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.intent` is `'verify'` and `nextAction.action.kind` is `'start-verification'`

#### Scenario: Stale spec approval in designing with incomplete artifacts recommends design

- **GIVEN** a change in `designing` with the spec gate on and a stale spec approval after committed recovery
- **AND** a required design artifact is incomplete
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.targetStep` is `designing` and `nextAction.intent` is `'design'` with no `action`
- **AND** neither `lifecycle-guidance.ts` nor the domain `nextHop` read `validity.specApproval`

#### Scenario: Stale spec approval in designing with complete artifacts recommends ready

- **GIVEN** a change in `designing` with the spec gate on and a stale spec approval after committed recovery
- **AND** all required design artifacts are complete and `ready` is in `availableTransitions`
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.targetStep` is `ready` and `nextAction.intent` is `'design'`
- **AND** the recommendation is not `designing`

#### Scenario: Stale spec approval in ready resolves through the check

- **GIVEN** a change in `ready` with the spec gate on and a stale or revoked spec approval that has not been renewed and for which reconciliation commits no recovery
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.targetStep` is `ready` and `nextAction.action` is `{ kind: 'approve-spec' }` with `nextAction.intent` equal to `null`
- **AND** the recommendation is not `designing`

#### Scenario: Legacy pending states resolve to the phase intent

- **GIVEN** a change found in `pending-spec-approval`
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** guidance applies no gate-specific rule and returns the phase intent of that pipeline position

#### Scenario: Blocked legacy pending state without hop action keeps the phase intent

- **GIVEN** a change found in `pending-signoff` whose forward hop is blocked and declares no action, and whose exit exists in the active pipeline
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.intent` is the phase intent of that pipeline position and is not `null`

#### Scenario: Legacy pending state with disabled exit has no intent

- **GIVEN** a change found in `pending-spec-approval` under a schema that disables `implementing` so that `nextWorkflowStep` is `null`
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.intent` is `null` and `nextAction.action` is undefined

#### Scenario: Blocked ready without check action has no intent

- **GIVEN** a change in `ready` whose forward hop fails a check that declares no `action`
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.targetStep` is `ready`, `nextAction.intent` is `null`, and `nextAction.action` is undefined

#### Scenario: Stale verification at archivable chooses the verify phase

- **GIVEN** a change in `archivable` with `verifying` enabled and reconciled validity reporting stale verification with no committed recovery
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.intent` is `'verify'`
- **AND** any `nextAction.action` comes only from the failed check of the waiting hop, not from validity

#### Scenario: Domain nextHop ignores reconciled validity

- **GIVEN** a change in `verifying` with stale verification and a change in `implementing` with pending non-task artifact review
- **WHEN** `evaluateLifecycleVerdict` is called with and without the validity verdict
- **THEN** `nextHop` is identical in both calls
- **AND** the verdict code does not read `validity.specApproval`, `validity.signoff`, `validity.verification`, or `validity.artifactReviewRequired` to compute `nextHop` or filter recommended transitions

#### Scenario: Stale verification in done holds through the check

- **GIVEN** a change in `done` whose verification is stale and whose `verification.current` fails for `archivable`
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is `done`, `nextAction.action` is `{ kind: 'start-verification' }`, and `nextAction.intent` is `'verify'`
- **AND** no validity-based hold was applied

#### Scenario: Pending review under preserve stays out of forward progress

- **GIVEN** a change in `implementing` with pending non-task artifact review under `workflow: preserve` and no committed recovery
- **WHEN** `evaluateLifecycle` runs
- **THEN** `nextAction.targetStep` is not a forward target of `implementing`
- **AND** the recommendation comes from the review summary, not from a validity override

#### Scenario: Intent table carries no schema-dependent facts

- **GIVEN** a schema whose `workflow[]` rows are declared in noncanonical order and disable `verifying`
- **WHEN** guidance resolves intents
- **THEN** the state-to-phase table maps only to `'design'`, `'implement'`, `'verify'`, or `'archive'`
- **AND** enabled steps, the verification boundary, and drain states come from `resolveWorkflowPipeline` and `isWorkflowStepEnabled`

#### Scenario: Blocked done with verifying disabled routes to the real blocker

- **GIVEN** a change in `done` whose schema disables `verifying`
- **AND** the real reconciler (no injected verification verdict) with the sign-off gate on and no sign-off recorded
- **WHEN** `evaluateLifecycle` projects `nextAction`
- **THEN** `nextAction.action` is `{ kind: 'approve-signoff' }` and `nextAction.intent` is `null`, not `'verify'` and not a fallback `'archive'`

#### Scenario: Required review routes to design even under preserve

- **GIVEN** a change in `implementing` with workflow `preserve`, unresolved non-task drift and no committed recovery
- **WHEN** `resolveLifecycleIntent` runs
- **THEN** `intent` is `'design'` and the lifecycle state is not changed by guidance

#### Scenario: Reconciled artifactReviewRequired alone routes to design

- **GIVEN** a verdict with `artifactReviewRequired: true` and no committed recovery while the review summary has `required: false`
- **WHEN** `resolveLifecycleIntent` runs
- **THEN** `intent` is `'design'`

#### Scenario: Live overlap with stale verification keeps the verify next action

- **GIVEN** a change in `archivable` with `verifying` enabled and stale verification, and live `OVERLAP_CONFLICT` from archive predicates alongside the verification blocker
- **WHEN** `GetStatus` projects `nextAction` after guidance
- **THEN** the guidance result is kept unchanged: `intent` is `'verify'`, `nextAction.action` is not set, and the `start-verification` action remains on the verification blocker
- **AND** no overlap-bypass advice is implied

#### Scenario: Live overlap as the only blocker keeps the archive intent

- **GIVEN** a change in `archivable` whose only public blocker is live `OVERLAP_CONFLICT`
- **WHEN** `GetStatus` projects `nextAction` after guidance
- **THEN** `intent` is `'archive'` and `targetStep` is `archivable`
- **AND** `nextAction.action` is undefined

#### Scenario: Stale verification outranks required review at the verification boundary

- **GIVEN** a change in `verifying` with stale verification, required artifact review and no committed recovery
- **WHEN** `resolveLifecycleIntent` runs
- **THEN** `intent` is `'verify'`

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
