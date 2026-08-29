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

#### Scenario: review.required becomes true when any file is pending review

- **GIVEN** a change with one file in `pending-review`
- **WHEN** `execute()` is called
- **THEN** `review.required` is `true`
- **AND** `review.route` is `'designing'`
- **AND** `review.reason` is `'artifact-review-required'`

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

#### Scenario: Revision matches updatedAt

- **GIVEN** a change with `updatedAt`
- **WHEN** `GetStatus` is called with `ifModifiedSince` equal to `updatedAt.toISOString()`
- **THEN** the result has `unchanged: true`
- **AND** `artifactStatuses` is an empty array
- **AND** `RefreshImplementationTracking` is not invoked
- **AND** the result still includes the loaded `change` and `specDependsOn`
- **AND** `blockers` is an empty array
- **AND** `review.required` is `false`

#### Scenario: Revision exceeds updatedAt

- **GIVEN** a change with `updatedAt`
- **WHEN** `GetStatus` is called with `ifModifiedSince` strictly later than `updatedAt`
- **THEN** the result has `unchanged: true`
- **AND** `artifactStatuses` is an empty array
- **AND** `RefreshImplementationTracking` is not invoked
- **AND** the result still includes the loaded `change` and `specDependsOn`
- **AND** `blockers` is an empty array
- **AND** `review.required` is `false`

#### Scenario: Revision older than updatedAt evaluates full status

- **GIVEN** a change with `updatedAt`
- **WHEN** `GetStatus` is called with `ifModifiedSince` strictly earlier than `updatedAt`
- **THEN** `unchanged` is absent or not `true`
- **AND** full status evaluation runs (non-empty `artifactStatuses` for a change that has artifacts)

#### Scenario: Unparseable ifModifiedSince evaluates full status

- **GIVEN** a change with `updatedAt`
- **WHEN** `GetStatus` is called with `ifModifiedSince` that `Date.parse` cannot parse
- **THEN** `unchanged` is absent or not `true`
- **AND** full status evaluation runs

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

#### Scenario: GetStatus does not invoke detector directly

- **GIVEN** a change has entered `implementing` at least once
- **WHEN** `GetStatus.execute()` is called
- **THEN** it does not invoke `ImplementationDetector` directly
- **AND** it does not duplicate refresh merge logic

#### Scenario: Active change refreshes by default

- **GIVEN** an active change exists in `changes/` storage
- **WHEN** `GetStatus.execute({ name })` is called without `refreshImplementationTracking`
- **THEN** it invokes `RefreshImplementationTracking.execute({ name })` before loading status

#### Scenario: Draft-only read skips refresh

- **GIVEN** a change exists only under `drafts/` storage
- **WHEN** `GetStatus.execute({ name })` is called
- **THEN** it does not invoke `RefreshImplementationTracking`

#### Scenario: Explicit opt-out skips refresh

- **GIVEN** an active change exists in `changes/` storage
- **WHEN** `GetStatus.execute({ name, refreshImplementationTracking: false })` is called
- **THEN** it does not invoke `RefreshImplementationTracking`

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

#### Scenario: Available transitions require persisted complete or skipped state

- **GIVEN** a change in `designing` state
- **AND** an artifact required by `ready` is `pending-review`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.availableTransitions` does not include `ready`

#### Scenario: Next artifact resolves from persisted state

- **GIVEN** a change with `proposal` in `complete`, `specs` in `complete`, and `verify` in `missing`
- **WHEN** `execute()` is called
- **THEN** `lifecycle.nextArtifact` is `'verify'`

#### Scenario: Skipped artifacts still satisfy lifecycle gating

- **GIVEN** a change whose required optional artifact is `skipped`
- **WHEN** `execute()` is called
- **THEN** that artifact does not block `availableTransitions`

#### Scenario: Review reason is spec-overlap-conflict with single unhandled invalidation

- **GIVEN** a change in `designing` state with files in `pending-review`
- **AND** history contains one `invalidated` event with `cause: 'spec-overlap-conflict'`
- **AND** no `transitioned` event with `to` not equal to `'designing'` appears after it
- **WHEN** `execute()` is called
- **THEN** `review.required` is `true`
- **AND** `review.reason` is `'spec-overlap-conflict'`
- **AND** `review.overlapDetail` has one entry with the archived change name and overlapping spec IDs

#### Scenario: Overlap detail merges multiple unhandled invalidations

- **GIVEN** a change in `designing` state with files in `pending-review`
- **AND** history contains two `invalidated` events with `cause: 'spec-overlap-conflict'`
- **AND** event A was caused by archiving change `alpha` overlapping `core:config`
- **AND** event B was caused by archiving change `beta` overlapping `core:kernel`
- **AND** no `transitioned` event with `to` not equal to `'designing'` appears after either
- **WHEN** `execute()` is called
- **THEN** `review.overlapDetail` has two entries
- **AND** the entries are ordered newest-first
- **AND** one entry references `beta` with `core:kernel`
- **AND** the other references `alpha` with `core:config`

#### Scenario: Overlap scan stops at forward transition boundary

- **GIVEN** a change with history: `invalidated(spec-overlap-conflict, alpha)`, `transitioned(designing)`, `transitioned(ready)`, `invalidated(spec-overlap-conflict, beta)`, `transitioned(designing)`
- **AND** files are in `pending-review`
- **WHEN** `execute()` is called
- **THEN** `review.overlapDetail` has only one entry referencing `beta`
- **AND** the `alpha` invalidation is excluded because `transitioned(ready)` appears before it in reverse scan order

#### Scenario: Review reason is artifact-drift when drift exists even with overlap invalidation

- **GIVEN** a change with at least one file in `drifted-pending-review`
- **AND** unhandled `spec-overlap-conflict` invalidations exist
- **WHEN** `execute()` is called
- **THEN** `review.reason` is `'artifact-drift'` (drift takes priority)
- **AND** `review.overlapDetail` is an empty array

#### Scenario: Review overlapDetail is empty for non-overlap reasons

- **GIVEN** a change in `designing` state with files in `pending-review`
- **AND** the latest `invalidated` event has `cause: 'artifact-review-required'`
- **WHEN** `execute()` is called
- **THEN** `review.overlapDetail` is an empty array

#### Scenario: No invalidation event produces empty overlapDetail

- **GIVEN** a change with no `invalidated` events in history
- **WHEN** `execute()` is called
- **THEN** `review.overlapDetail` is an empty array

#### Scenario: availableTransitions is not protocol-only

- **GIVEN** protocol allows `verifying` but tasks are incomplete
- **WHEN** `GetStatus.execute()` returns lifecycle context
- **THEN** `validTransitions` includes `verifying`
- **AND** `availableTransitions` does not

### Requirement: Graceful degradation when schema resolution fails

#### Scenario: Schema resolution failure degrades lifecycle fields

- **GIVEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **WHEN** `execute()` is called
- **THEN** the result does not throw
- **AND** `lifecycle.validTransitions` is populated normally
- **AND** `lifecycle.availableTransitions` is an empty array
- **AND** `lifecycle.blockers` is an empty array
- **AND** `lifecycle.approvals` is populated normally
- **AND** `lifecycle.nextArtifact` is `null`
- **AND** `lifecycle.changePath` is populated normally
- **AND** `lifecycle.schemaInfo` is `null`

### Requirement: Accepts a change name as input

#### Scenario: Input accepts a named change identifier

- **WHEN** `GetStatus.execute({ name: 'add-login' })` is called
- **THEN** the use case resolves the named change from the repository

#### Scenario: refreshImplementationTracking defaults to enabled

- **GIVEN** an active change exists
- **WHEN** `GetStatus.execute({ name })` is called without `refreshImplementationTracking`
- **THEN** refresh runs before status projection

### Requirement: Constructor dependencies

#### Scenario: GetStatus is constructed without LifecycleEngine

- **WHEN** `GetStatus` is constructed
- **THEN** it does not receive `LifecycleEngine` or `evaluateLifecycle` as constructor arguments
- **AND** it receives `transitionBindings` and `archiveBindings`

#### Scenario: Constructor composes create-star checks

- **WHEN** `GetStatus` is constructed
- **THEN** it receives composed `Check` instances from `create*`
- **AND** `CountTasks` is a dep of `createWorkflowTaskCompletion`, not a global snapshot gatherer
- **AND** `transitionBindings` is injected from the workflow check registry

#### Scenario: Drafted status DAG-projects effective status

- **GIVEN** a drafted change whose `proposal` is complete and `specs` is blocked only by that parent being `pending-review`
- **WHEN** `GetStatus.execute()` runs for that draft-only name
- **THEN** `effectiveStatus` for the dependent artifact is `pending-parent-artifact-review`
- **AND** `availableTransitions` is empty

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
