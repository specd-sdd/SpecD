# Verification: GetStatus

## Requirements

### Requirement: Returns the change and its artifact statuses

#### Scenario: Result includes artifact state, effective status, and file state

- **GIVEN** a change with one artifact in `pending-review`
- **WHEN** `execute({ name: 'add-login' })` is called
- **THEN** `GetStatus` uses `evaluateLifecycle` to derive lifecycle interpretation
- **AND** the artifact entry includes its persisted `state`
- **AND** it includes `effectiveStatus`
- **AND** each file entry includes its own persisted `state`

#### Scenario: Non-task pending review routes by policy and gate priority

- **GIVEN** a non-task file is in `pending-review` with no required stale spec consent
- **WHEN** active status reconciles the change
- **THEN** `review.required` is `true` with reason `artifact-review-required`
- **AND** workflow `preserve` retains the current lifecycle state (no automatic return) and blocks forward progress, while `nextAction` recommends the design skill for the review (`intent: 'design'`, `targetStep: 'designing'`)
- **AND** workflow `redesign` routes to committed `designing`
- **AND** required stale spec consent in a state after `ready` routes to `designing` regardless of preserve
- **AND** stale spec consent in `ready` commits no recovery and the change stays in `ready`

#### Scenario: Task-only content change does not open artifact review

- **GIVEN** only an artifact marked `hasTasks: true` changed after validation
- **WHEN** active status reconciles artifact validity
- **THEN** it does not mark non-task artifact review required solely from that change
- **AND** live task completion remains a separate blocker where applicable

#### Scenario: review.reason prefers artifact-drift when any file drifted

- **GIVEN** a change with one file in `drifted-pending-review`
- **WHEN** `execute()` is called
- **THEN** `review.required` is `true`
- **AND** `review.reason` is `'artifact-drift'`
- **AND** `review.affectedArtifacts` includes that artifact with the affected file's `filename` and absolute `path`

#### Scenario: review.required is false when no file needs review

- **GIVEN** a change whose files are all `complete`, `skipped`, `missing`, or `in-progress`
- **WHEN** `execute()` is called
- **THEN** `review.required` is `false`
- **AND** `review.route` is `null`

#### Scenario: Result includes blockers array

- **GIVEN** a change with artifact drift
- **WHEN** `execute()` is called
- **THEN** the result includes a `blockers` array
- **AND** it contains at least one entry with `code: 'ARTIFACT_DRIFT'`

#### Scenario: Result includes specDependsOn

- **GIVEN** a change with declared spec dependencies in its manifest
- **WHEN** `execute()` is called for that change
- **THEN** `result.specDependsOn` matches the change's `specDependsOn` map

### Requirement: Revision evaluation for conditional status queries

Scenarios:

#### Scenario: Matching manifest timestamp does not hide external drift

- **GIVEN** `ifModifiedSince` matches the manifest but a linked file changed externally
- **WHEN** active status is requested
- **THEN** refresh and reconciliation run before any unchanged response decision

#### Scenario: Draft status may retain read-only timestamp shortcut

- **WHEN** conditional status targets a draft with an unchanged revision
- **THEN** it may return the existing read-only unchanged projection without reconciliation

### Requirement: Drafted change read-only status

#### Scenario: Draft-only name returns draftView

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `execute({ name })` is called
- **THEN** `result.draftView` is defined and satisfies `DraftedChangeView`
- **AND** `result.change` is undefined

#### Scenario: Drafted status has no available transitions

- **GIVEN** a change exists only under `drafts/`
- **WHEN** `execute({ name })` is called
- **THEN** `availableTransitions` is empty
- **AND** `nextAction.intent` is `null` and `nextAction.action` is undefined

#### Scenario: Active name returns change not draftView

- **GIVEN** a change exists under `changes/`
- **WHEN** `execute({ name })` is called
- **THEN** `result.change` is defined
- **AND** `result.draftView` is undefined

#### Scenario: Discarded-only name is not found

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `execute({ name })` is called
- **THEN** it throws `ChangeNotFoundError`
- **AND** `ChangeRepository.getDiscarded` is not invoked

#### Scenario: Draft resolution uses getDraft not get

- **GIVEN** spies on `ChangeRepository.get` and `getDraft`
- **WHEN** `execute({ name })` runs for a drafted-only name
- **THEN** `getDraft` is invoked
- **AND** `get` is not used to populate `result.change`

#### Scenario: Drafted result still includes artifact statuses

- **GIVEN** a drafted change with `proposal` in `pending-review`
- **WHEN** `execute({ name })` is called
- **THEN** `result.artifactStatuses` includes the `proposal` entry with that state
- **AND** `result.draftView` is defined

### Requirement: Implementation status projection

#### Scenario: Result includes tracked files and links

- **GIVEN** implementation tracking is active for a change
- **WHEN** `GetStatus.execute()` returns
- **THEN** the result includes tracked implementation files with review state
- **AND** confirmed implementation links including file-level links and symbol-level refinements

### Requirement: Optional pre-read implementation tracking refresh

Scenarios:

#### Scenario: Refresh is configurable only for active status

- **WHEN** active status runs with refresh enabled
- **THEN** it delegates to `RefreshImplementationTracking` before reconciliation
- **AND** drafted status never refreshes or mutates

#### Scenario: Explicit refresh false is honored

- **WHEN** active status disables implementation refresh
- **THEN** it skips `RefreshImplementationTracking` but still performs configured validity reconciliation

### Requirement: Operational status reconciliation

#### Scenario: Active status persists detected recovery once

- **GIVEN** external drift invalidates required spec consent
- **WHEN** active status is requested twice
- **THEN** the first request atomically persists staleness and design recovery
- **AND** the second reports the committed state without duplicate events

#### Scenario: Schema resolution failure is reachable and read only

- **GIVEN** the real schema provider fails before active refresh
- **WHEN** status is requested
- **THEN** it returns `SCHEMA_RESOLUTION_FAILED` with non-mutating guidance
- **AND** neither implementation refresh nor reconciliation is invoked
- **AND** the manifest and history remain byte-for-byte unchanged

### Requirement: Drift-aware display status

#### Scenario: Complete plus drift renders complete-with-drift

- **GIVEN** an artifact file with canonical state `complete` and `hasDrift: true`
- **WHEN** `GetStatus` builds the read model
- **THEN** the file status includes `displayStatus: 'complete-with-drift'`
- **AND** canonical state remains `complete`

#### Scenario: Aggregated artifact display status prefers real workflow states

- **GIVEN** one artifact file is `pending-review`
- **AND** another file is display-visible as `complete-with-drift`
- **WHEN** `GetStatus` aggregates artifact display state
- **THEN** the artifact `displayStatus` is `pending-review`

### Requirement: Reports task completion counts for task-capable artifacts

#### Scenario: Task completion counts returned for task-capable artifacts

- **GIVEN** a task-capable artifact contains one complete and two incomplete checkbox items
- **WHEN** `GetStatus.execute()` is called
- **THEN** its artifact status maps the matching `CountTasksResult.byArtifact` entry as `taskCompletion`
- **AND** `taskCompletion.complete` is `1`, `taskCompletion.incomplete` is `2`, and `taskCompletion.total` is `3`

#### Scenario: Task completion omitted when no qualifying content exists

- **GIVEN** a task-capable artifact has no existing or non-empty file
- **WHEN** `GetStatus.execute()` is called
- **THEN** its artifact status omits `taskCompletion`

#### Scenario: Omitted complete pattern uses the default

- **GIVEN** a task-capable artifact declares only `incompletePattern`
- **AND** its content contains two incomplete checkbox items
- **WHEN** `GetStatus.execute()` is called
- **THEN** `taskCompletion.incomplete` is `2` and `taskCompletion.total` is `2`

#### Scenario: CountTasks runs inside task-completion execute

- **GIVEN** a change in `implementing` with incomplete tasks
- **WHEN** `GetStatus.execute()` is called
- **THEN** `workflow.taskCompletion.execute` invokes `CountTasks`
- **AND** `GetStatus` does not invoke `CountTasks` again after evaluate
- **AND** `availableTransitions` omits `verifying`
- **AND** `GetStatus` does not pass a global snapshot bag into `evaluateLifecycle`

### Requirement: Execute matching predicates then project

#### Scenario: Enter-ready deps check omits ready when extract mismatches

- **GIVEN** a change in `designing` whose extracted `dependsOn` mismatches persisted values
- **WHEN** `GetStatus.execute()` is called
- **THEN** `deps.consistent.execute` fails
- **AND** `ready` is omitted from `availableTransitions`

#### Scenario: Status exposes check rows

- **WHEN** `GetStatus.execute()` completes a full evaluation
- **THEN** the result includes check rows with `id`, `kind`, and `outcome`
- **AND** `effect` rows are not required for `allowed`

#### Scenario: Archive predicates come from the effective archive bindings

- **GIVEN** a change in `archivable` and a schema declaring `archiveChecks: [{ id: spec.overlap, disabled: true }]`
- **AND** another active change overlaps its specs
- **WHEN** `GetStatus` projects blockers
- **THEN** no `OVERLAP_CONFLICT` blocker is produced because the check is not evaluated

#### Scenario: Schema-hardened overlap carries no bypass flag

- **GIVEN** a change in `archivable` and a schema declaring `archiveChecks: [{ id: spec.overlap, skippable: false }]`
- **AND** another active change overlaps its specs
- **WHEN** `GetStatus` projects blockers
- **THEN** `OVERLAP_CONFLICT` is present with `isSkippable: false`
- **AND** the blocker carries no `bypassFlag`
- **AND** `nextAction.reason` does not suggest a bypass

#### Scenario: Locked archive check carries no bypass flag

- **GIVEN** a change in `archivable` that contains a spec from a `readOnly` workspace
- **WHEN** `GetStatus` projects blockers
- **THEN** the `workspace.readOnly` blocker has `isSkippable: false` and no `bypassFlag`

#### Scenario: Plugin archive check follows its resolved skippability

- **GIVEN** a plugin check bound to `scope: 'archive'` that fails for an `archivable` change
- **WHEN** its resolved binding is skippable
- **THEN** the blocker carries `isSkippable: true` and `checkId: '@plugin.check'`
- **AND** when it is not skippable the blocker carries `isSkippable: false`
- **AND** the blocker carries no `bypassFlag` in either case

#### Scenario: Archive predicates run without user bypass

- **GIVEN** a change in `archivable` with a skippable failing archive check
- **WHEN** `GetStatus` evaluates it
- **THEN** the check is evaluated with an empty `skipChecks` and its failure is reported

### Requirement: Shared transition candidate evaluation

#### Scenario: Passing bypass predicates advertise the shortcut

- **GIVEN** a protocol-legal shortcut over an optional step
- **AND** all normal and effective `step-skip` predicates pass
- **WHEN** status is projected
- **THEN** the target is present in `availableTransitions`
- **AND** `checksByTarget` contains the complete candidate results

#### Scenario: Failed bypass predicate suppresses the shortcut

- **GIVEN** a protocol-legal shortcut whose normal predicates pass
- **AND** one effective `step-skip` predicate fails
- **WHEN** status is projected
- **THEN** the target is absent from `availableTransitions`
- **AND** its failed check remains visible in `checksByTarget`

#### Scenario: Empty bypass predicate set is allowed

- **GIVEN** a bypassed optional step with no effective `step-skip` predicates
- **WHEN** status evaluates the shortcut
- **THEN** no synthetic blocker is created
- **AND** the shortcut is available when its normal predicates pass

#### Scenario: Status evaluation has no transition effects

- **WHEN** status evaluates every candidate
- **THEN** it runs no hook, aggregate mutation, or persistence
- **AND** a later transition must reevaluate the candidate against fresh state

### Requirement: Throws ChangeNotFoundError for unknown changes

#### Scenario: Change does not exist

- **WHEN** `execute({ name: 'nonexistent' })` is called
- **THEN** a `ChangeNotFoundError` is thrown with code `CHANGE_NOT_FOUND`
- **AND** the error message contains `'nonexistent'`

### Requirement: Reports effective status for every artifact

#### Scenario: Effective status cascades through dependencies

- **GIVEN** a change has artifact `spec` that depends on `proposal`
- **AND** `spec` hashes match (would be `complete` in isolation)
- **AND** `proposal` is `in-progress`
- **WHEN** `execute()` is called for this change
- **THEN** the `effectiveStatus` for `spec` is `in-progress` (cascaded from its dependency as derived by `projectArtifacts`)
- **AND** the `effectiveStatus` for `proposal` is `in-progress`

#### Scenario: Skipped artifacts satisfy dependencies

- **GIVEN** a change has artifact `spec` that depends on `proposal`
- **AND** `proposal` is `skipped`
- **AND** `spec` hashes match
- **WHEN** `execute()` is called for this change
- **THEN** the `effectiveStatus` for `spec` is `complete`
- **AND** the `effectiveStatus` for `proposal` is `skipped`

### Requirement: Returns lifecycle context

Scenarios:

#### Scenario: Preserve routes artifact review through the active skill

- **GIVEN** ungated artifact drift with workflow `preserve`
- **WHEN** status projects review and lifecycle context
- **THEN** review is required, the lifecycle state is retained without an automatic return, and forward progress is blocked
- **AND** `nextAction` recommends the design skill for the review (`intent: 'design'`, `targetStep: 'designing'`)
- **AND** required stale spec consent in a state after `ready` instead commits a return to `designing`

#### Scenario: Stale spec consent in ready stays in ready

- **GIVEN** a change in `ready` with the spec gate on and a stale or revoked spec approval
- **WHEN** active status reconciles the change
- **THEN** no recovery to `designing` is committed and the change remains in `ready`
- **AND** `blockers` includes `APPROVAL_REQUIRED` or `APPROVAL_STALE` carrying `action: { kind: 'approve-spec' }`
- **AND** `nextAction.action` is `{ kind: 'approve-spec' }`

#### Scenario: Redesign policy routes review to design

- **GIVEN** non-task drift under workflow `redesign`
- **WHEN** lifecycle context is projected
- **THEN** review route and committed state point to `designing`

#### Scenario: Blocked ready without check action has no intent

- **GIVEN** a change in `ready` whose forward hop fails a check that declares no `action`
- **WHEN** `GetStatus.execute()` projects `nextAction`
- **THEN** `nextAction.targetStep` is `ready`, `nextAction.intent` is `null`, and `nextAction.action` is undefined

#### Scenario: Stale verification at archivable chooses the verify phase

- **GIVEN** a change in `archivable` with `verifying` enabled and reconciled validity reporting stale verification with no committed recovery
- **WHEN** `GetStatus.execute()` projects `nextAction`
- **THEN** `nextAction.intent` is `'verify'`

### Requirement: Graceful degradation when schema resolution fails

#### Scenario: Schema resolution failure returns actionable read-only status

- **GIVEN** `SchemaProvider.get(change.schemaName)` throws `SchemaNotFoundError`
- **WHEN** `GetStatus.execute()` is called
- **THEN** the result does not throw
- **AND** `lifecycle.validTransitions` and `lifecycle.availableTransitions` are empty arrays
- **AND** `lifecycle.approvals` is populated normally
- **AND** `lifecycle.blockers` is an empty array
- **AND** the public `blockers` array contains `SCHEMA_RESOLUTION_FAILED` with recovery guidance
- **AND** `lifecycle.nextArtifact` is `null`, `lifecycle.changePath` is populated normally, and `lifecycle.schemaInfo` is `null`
- **AND** the result does not enable a lifecycle mutation

#### Scenario: Resolves change sovereign schema when workspace default differs

- **GIVEN** an active change with `schemaName: 'custom-workflow'`
- **AND** workspace default schema is `@specd/schema-std`
- **WHEN** `GetStatus.execute()` is called
- **THEN** it resolves `custom-workflow` via `SchemaProvider.get('custom-workflow')`
- **AND** reports workflow steps and artifact projection defined by `custom-workflow`

#### Scenario: Provider identity mismatch has a distinct blocker

- **GIVEN** named resolution returns a schema whose canonical name differs from `change.schemaName`
- **WHEN** `GetStatus.execute()` is called
- **THEN** the result does not throw
- **AND** public blockers contain `SCHEMA_IDENTITY_MISMATCH`
- **AND** `lifecycle.validTransitions` and `lifecycle.availableTransitions` are empty arrays
- **AND** no topology or action is projected from the untrusted schema

#### Scenario: Identity mismatch blocker carries structured names

- **GIVEN** a schema provider that returns `other-schema` when `custom-workflow` is requested (the provider returns a wrong-name schema; it does not throw itself)
- **WHEN** `GetStatus.execute()` runs
- **THEN** the public blockers contain `SCHEMA_IDENTITY_MISMATCH` with `details.requestedName: 'custom-workflow'` and `details.returnedName: 'other-schema'`

#### Scenario: Drafted status degrades instead of throwing

- **GIVEN** a drafted change whose schema resolution fails or returns a wrong-name schema
- **WHEN** `GetStatus.execute()` runs
- **THEN** it does not throw
- **AND** `schemaInfo` is `null` and the matching `SCHEMA_RESOLUTION_FAILED` or `SCHEMA_IDENTITY_MISMATCH` blocker is reported

#### Scenario: Version advisory appears on the status result

- **GIVEN** `ResolveChangeSchema` returns a same-name version advisory
- **WHEN** `GetStatus.execute()` runs
- **THEN** the result exposes that advisory as a structured warning

### Requirement: Accepts a change name as input

#### Scenario: Input accepts a named change identifier

- **WHEN** `GetStatus.execute({ name: 'add-login' })` is called
- **THEN** the use case resolves the named change from the repository

#### Scenario: refreshImplementationTracking defaults to enabled

- **GIVEN** an active change exists
- **WHEN** `GetStatus.execute({ name })` is called without `refreshImplementationTracking`
- **THEN** refresh runs before status projection

### Requirement: Constructor dependencies

Scenarios:

#### Scenario: Composition resolves one reconciliation path

- **WHEN** either supported `GetStatus` factory signature is used
- **THEN** it resolves refresh, reconciliation, repository, schema, gates, and checks through standard composition
- **AND** does not construct adapters or a second invalidation path

#### Scenario: Draft composition remains read only

- **WHEN** status resolves a drafted change
- **THEN** it uses the draft view without reconciliation or active mutation ports

#### Scenario: Missing reconciler fails instead of falling back

- **WHEN** direct dependencies omit the mandatory reconciler
- **THEN** status construction or execution fails explicitly
- **AND** no legacy `Change.invalidate` mutation occurs

### Requirement: Config-based factory preserves complete repository bootstrap

#### Scenario: Config-wired status path preserves schema-driven artifact-state derivation

- **GIVEN** `createGetStatus(config)` wires `GetStatus` from `SpecdConfig`
- **WHEN** `GetStatus.execute()` loads a persisted change whose artifact-state derivation depends on schema-driven artifact-type behavior
- **THEN** the returned artifact statuses reflect complete schema-driven artifact-state derivation for that change
- **AND** the config-based factory does not report status through a weaker or partial repository bootstrap path

### Requirement: Identifies blockers

#### Scenario: Blockers are surfaced from lifecycle interpretation

- **GIVEN** lifecycle interpretation finds artifact drift or missing required artifacts
- **WHEN** `execute()` is called
- **THEN** the returned `blockers` array contains machine-readable blocker entries describing those conditions

#### Scenario: Incomplete tasks produce INCOMPLETE_TASKS

- **GIVEN** a change in `implementing` with incomplete gated tasks
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** a blocker with code `INCOMPLETE_TASKS` is present

#### Scenario: Open-file IMPLEMENTATION_STATE has no out-of-scope bypass

- **GIVEN** a failed `impl.filesResolved` check with code `IMPLEMENTATION_STATE`
- **WHEN** `GetStatus` merges blockers from checks
- **THEN** the blocker is not skippable and carries no CLI `bypassFlag`

#### Scenario: Links-in-scope IMPLEMENTATION_STATE keeps out-of-scope bypass

- **GIVEN** a failed `impl.linksInScope` check with code `IMPLEMENTATION_STATE`
- **WHEN** `GetStatus` merges blockers from checks
- **THEN** the blocker has `isSkippable: true` and `checkId: 'impl.linksInScope'`
- **AND** carries no CLI `bypassFlag`

#### Scenario: Schema-declared skippability drives isSkippable on the blocker

- **GIVEN** a schema that declares a Category C check with `skippable: true` on the evaluated step, overriding a non-skippable code default that permits overrides
- **WHEN** that check fails and `GetStatus` merges blockers
- **THEN** the blocker has `isSkippable: true` and `checkId` matching that check
- **AND** carries no CLI `bypassFlag`

#### Scenario: Invalidation overlap is review not OVERLAP_CONFLICT blocker

- **GIVEN** `review.reason` is `'spec-overlap-conflict'`
- **AND** the change is not in `archivable`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` does not include code `OVERLAP_CONFLICT`
- **AND** `review.message` is human prose about archived overlapping specs
- **AND** `nextAction.intent` is `'design'`

#### Scenario: Archivable status runs archive predicates

- **GIVEN** a change in `archivable` whose specs overlap another active change
- **WHEN** `GetStatus.execute()` is called
- **THEN** `spec.overlap.execute` fails
- **AND** `blockers` includes `OVERLAP_CONFLICT` with `isSkippable: true` and `checkId: 'spec.overlap'`

#### Scenario: Archivable live overlap does not advertise Ready to archive

- **GIVEN** a change in `archivable` whose only public blocker is `OVERLAP_CONFLICT`
- **WHEN** `GetStatus.execute()` projects `nextAction`
- **THEN** `nextAction.intent` is `'archive'`
- **AND** `nextAction.targetStep` is `archivable`
- **AND** `nextAction.reason` is not `Ready to archive`
- **AND** `nextAction.reason` names live overlap without embedding `--skip-checks`

#### Scenario: Failed gate check action reaches blocker and nextAction

- **GIVEN** a change in `ready` with spec gate on and no spec approval
- **WHEN** `GetStatus.execute()` projects blockers and nextAction
- **THEN** the `APPROVAL_REQUIRED` blocker carries `action: { kind: 'approve-spec' }`
- **AND** `nextAction.action` is `{ kind: 'approve-spec' }` and `nextAction.intent` is `null`

#### Scenario: Verification blocker carries start-verification

- **GIVEN** a change in `done` whose verification evidence is stale
- **WHEN** `GetStatus.execute()` projects blockers
- **THEN** the verification blocker carries `action: { kind: 'start-verification', params: { changeName } }`
- **AND** it carries no `details.command`

#### Scenario: CountTasks memo is per evaluation pass

- **GIVEN** a long-lived `createWorkflowTaskCompletion` instance
- **WHEN** `GetStatus.execute()` runs twice with different task file contents
- **THEN** each execute counts tasks afresh
- **AND** the check instance does not reuse a previous CountTasks result

#### Scenario: Validity blocker and spec check failure merge into one blocker

- **GIVEN** the validity verdict reports a spec consent blocker (`APPROVAL_REVOKED`) and the `approval.spec` check fails
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains a single spec-consent entry
- **AND** that entry carries the check's message, label, `checkId: 'approval.spec'` and `action`

#### Scenario: Revoked sign-off yields one blocker

- **GIVEN** the validity verdict reports `SIGNOFF_REVOKED` and the `approval.signoff` check fails with `APPROVAL_STALE`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains exactly one sign-off consent entry, whatever the code difference between the two sides
- **AND** that entry carries `checkId: 'approval.signoff'` and the `approve-signoff` action

#### Scenario: Signed-off change with absent verification yields one verification blocker

- **GIVEN** a signed-off change in `done` with no completed verification
- **AND** the validity verdict reports `VERIFICATION_REQUIRED`, the `verification.current` check fails with `VERIFICATION_REQUIRED` and `approval.signoff` fails with `VERIFICATION_REQUIRED` (`details.gate` `'signoff'`)
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains exactly one verification blocker, with `checkId: 'verification.current'`

#### Scenario: Signed-off change with stale verification yields one verification blocker

- **GIVEN** a signed-off change whose verification evidence is stale, so `verification.current` and `approval.signoff` both fail with `VERIFICATION_STALE`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains exactly one verification blocker, with `checkId: 'verification.current'`

#### Scenario: Signed-off change with in-progress verification yields one verification blocker

- **GIVEN** a signed-off change with an active verification attempt, so `verification.current` and `approval.signoff` both fail with `VERIFICATION_IN_PROGRESS`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains exactly one verification blocker, with `checkId: 'verification.current'`

#### Scenario: Merged blocker adopts the dropped validity blocker action

- **GIVEN** the validity verdict reports `VERIFICATION_STALE` carrying a `start-verification` action and the `verification.current` check fails with no `action`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains a single verification blocker with `checkId: 'verification.current'`
- **AND** it carries the `start-verification` action of the dropped validity blocker

#### Scenario: Same check failing on several targets is skippable only if skippable on all

- **GIVEN** the same check id fails on two targets with the same code and message, and its resolved binding is skippable on one target and not skippable on the other
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** the single merged blocker has `isSkippable: false`

#### Scenario: Different messages of the same check keep their own skippability

- **GIVEN** the same check id fails on two targets with different messages, and its resolved binding is skippable on one target and locked on the other
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains two separate blockers, one per message
- **AND** the blocker of the skippable target has `isSkippable: true` and the blocker of the locked target has `isSkippable: false`

#### Scenario: Verdict blocker without a failing predicate takes no archive skippability

- **GIVEN** the validity verdict reports a blocker carrying a `checkId` and no failing predicate exists for that check on any transition target
- **AND** the same check id is skippable in the archive bindings
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** the verdict blocker does not take its `isSkippable` from the archive bindings and keeps its own `isSkippable` (`false` when absent)

#### Scenario: Same check failing on transition and archive is skippable only if skippable in both

- **GIVEN** a change in `archivable` where the same check fails on a transition target and in the archive checks with the same code and message
- **AND** its transition binding is skippable and its archive binding is locked (not skippable)
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** the single merged blocker has `isSkippable: false`
- **AND** with the transition binding locked and the archive binding skippable the merged blocker also has `isSkippable: false`

#### Scenario: Per-artifact review codes are never merged

- **GIVEN** the validity verdict reports `ARTIFACT_REVIEW_REQUIRED` and a check of another family fails
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `ARTIFACT_REVIEW_REQUIRED` remains a separate blocker

#### Scenario: Sign-off verification failure is kept when verification.current does not fail

- **GIVEN** `approval.signoff` fails with a `VERIFICATION_*` code and no `verification.current` failure exists
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** the `approval.signoff` verification failure is kept as the verification blocker

#### Scenario: Stale spec consent and failing sign-off stay two blockers

- **GIVEN** the validity verdict reports a stale spec approval and the `approval.signoff` check fails with `APPROVAL_STALE`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` contains one spec-consent entry and one sign-off consent entry, because they belong to different families

#### Scenario: VERIFICATION_VALIDITY_UNAVAILABLE stays unmerged

- **GIVEN** the `verification.current` check fails with `VERIFICATION_VALIDITY_UNAVAILABLE` while the validity verdict reports a verification blocker
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** both blockers are present

#### Scenario: Live overlap with stale verification keeps the verify next action

- **GIVEN** a change in `archivable` with `verifying` enabled and stale verification, whose archive predicates also report live `OVERLAP_CONFLICT`
- **WHEN** `GetStatus.execute()` projects `nextAction`
- **THEN** `blockers` contains both the verification blocker and `OVERLAP_CONFLICT`
- **AND** `nextAction.intent` is `'verify'`, `nextAction.action` is not set, and the `start-verification` action remains on the verification blocker
- **AND** `nextAction.reason` does not describe an overlap bypass

### Requirement: Approval, verification, and fingerprint status projection

#### Scenario: Attempt and completed evidence are distinct

- **GIVEN** a stale completed verification and a newer unfinished attempt
- **WHEN** status is rendered
- **THEN** both records and their freshness are shown separately
- **AND** the attempt is not presented as successful evidence

#### Scenario: Required boundary recommends in-place verification

- **GIVEN** current verification is missing at `verifying`
- **WHEN** status determines the next action
- **THEN** it recommends the verification skill in the current state
- **AND** does not require a lifecycle self-transition or rollback

#### Scenario: Status exposes the rich projection contract

- **GIVEN** a completed record and a newer active attempt coexist
- **WHEN** `GetStatus` returns validity
- **THEN** the public value is `ValidityStatusProjection` assembled from verdict and committed aggregate
- **AND** neither record is lost by returning the raw evaluator verdict

#### Scenario: Unreadable fingerprint inputs are exposed as non-blocking diagnostics

- **GIVEN** a change has unreadable or missing artifact files
- **WHEN** GetStatus is called
- **THEN** validity.fingerprintIssues lists the failures
- **AND** the unreadable inputs are not reported in blockers

### Requirement: Config-based factory delegates through resolveGetStatusDeps

#### Scenario: createGetStatus config form derives GetStatusDeps through resolveGetStatusDeps

- **WHEN** `createGetStatus(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetStatusDeps` through `resolveGetStatusDeps(resolver)`
- **AND** `resolveGetStatusDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `schemaProvider: SchemaProvider`
- `approvals: { readonly spec: boolean; readonly signoff: boolean }`
- `refreshImplementationTracking: RefreshImplementationTracking`
- `transitionBindings` from the workflow check registry
- `archiveBindings` from the workflow check registry
- `checkRegistry` from the workflow check registry
- **AND** it does not resolve `lifecycle` or `LifecycleEngine`
- **AND** the factory delegates to canonical `createGetStatus(deps)`
