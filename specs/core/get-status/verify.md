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
- **AND** workflow `preserve` retains the current-phase review route and blocks forward progress
- **AND** workflow `redesign` routes to committed `designing`
- **AND** required stale spec consent routes to `designing` regardless of preserve

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
- **AND** `nextAction.command` does not recommend transition or validate commands

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
- **THEN** `result.artifacts` includes the `proposal` entry with that state
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
- **THEN** review is required in the current skill and forward progress is blocked
- **AND** required stale spec consent instead routes to `designing`

#### Scenario: Redesign policy routes review to design

- **GIVEN** non-task drift under workflow `redesign`
- **WHEN** lifecycle context is projected
- **THEN** review route and committed state point to `designing`

### Requirement: Graceful degradation when schema resolution fails

#### Scenario: Schema resolution failure returns actionable read-only status

- **GIVEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **WHEN** `GetStatus.execute()` is called
- **THEN** the result does not throw
- **AND** `lifecycle.validTransitions` and `lifecycle.approvals` are populated normally
- **AND** `lifecycle.availableTransitions` is an empty array
- **AND** `lifecycle.blockers` is an empty array
- **AND** the public `blockers` array contains `SCHEMA_RESOLUTION_FAILED` with recovery guidance
- **AND** `lifecycle.nextArtifact` is `null`, `lifecycle.changePath` is populated normally, and `lifecycle.schemaInfo` is `null`
- **AND** the result does not enable a lifecycle mutation

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
- **THEN** the blocker does not include `bypassFlag` `--allow-out-of-scope`

#### Scenario: Links-in-scope IMPLEMENTATION_STATE keeps out-of-scope bypass

- **GIVEN** a failed `impl.linksInScope` check with code `IMPLEMENTATION_STATE`
- **WHEN** `GetStatus` merges blockers from checks
- **THEN** the blocker is skippable with `bypassFlag` `--allow-out-of-scope`

#### Scenario: Invalidation overlap is review not OVERLAP_CONFLICT blocker

- **GIVEN** `review.reason` is `'spec-overlap-conflict'`
- **AND** the change is not in `archivable`
- **WHEN** `GetStatus.execute()` identifies blockers
- **THEN** `blockers` does not include code `OVERLAP_CONFLICT`
- **AND** `review.message` is human prose about archived overlapping specs
- **AND** `nextAction.command` is `/specd-design`

#### Scenario: Archivable status runs archive predicates

- **GIVEN** a change in `archivable` whose specs overlap another active change
- **WHEN** `GetStatus.execute()` is called
- **THEN** `spec.overlap.execute` fails
- **AND** `blockers` includes skippable `OVERLAP_CONFLICT` with `--allow-overlap`

#### Scenario: Archivable live overlap does not advertise Ready to archive

- **GIVEN** a change in `archivable` with a public `OVERLAP_CONFLICT` blocker
- **WHEN** `GetStatus.execute()` projects `nextAction`
- **THEN** `nextAction.command` is `/specd-archive`
- **AND** `nextAction.targetStep` is `archivable`
- **AND** `nextAction.reason` is not `Ready to archive`
- **AND** `nextAction.reason` names overlap and `--allow-overlap`

#### Scenario: CountTasks memo is per evaluation pass

- **GIVEN** a long-lived `createWorkflowTaskCompletion` instance
- **WHEN** `GetStatus.execute()` runs twice with different task file contents
- **THEN** each execute counts tasks afresh
- **AND** the check instance does not reuse a previous CountTasks result

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
- **AND** it does not resolve `lifecycle` or `LifecycleEngine`
- **AND** the factory delegates to canonical `createGetStatus(deps)`
