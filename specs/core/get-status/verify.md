# Verification: GetStatus

## Requirements

### Requirement: Returns the change and its artifact statuses

#### Scenario: Result includes artifact state, effective status, and file state

- **GIVEN** a change with one artifact in `pending-review`
- **WHEN** `execute({ name: 'add-login' })` is called
- **THEN** the artifact entry includes its persisted `state`
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
- **THEN** the `effectiveStatus` for `spec` is `in-progress` (cascaded from its dependency)
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
- **AND** event A was caused by archiving change `alpha` overlapping `core:core/config`
- **AND** event B was caused by archiving change `beta` overlapping `core:core/kernel`
- **AND** no `transitioned` event with `to` not equal to `'designing'` appears after either
- **WHEN** `execute()` is called
- **THEN** `review.overlapDetail` has two entries
- **AND** the entries are ordered newest-first
- **AND** one entry references `beta` with `core:core/kernel`
- **AND** the other references `alpha` with `core:core/config`

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
