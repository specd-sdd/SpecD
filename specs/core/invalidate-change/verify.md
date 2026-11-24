# Verification: InvalidateChange

## Requirements

### Requirement: Input contract

Scenarios:

#### Scenario: Override dimensions remain independent

- **WHEN** a request overrides only workflow policy
- **THEN** persisted artifact policy supplies the other dimension and target rules remain artifact-policy-driven

#### Scenario: Invalid policy value is rejected before mutation

- **WHEN** either override dimension contains an unsupported value
- **THEN** input validation fails and the change remains untouched

### Requirement: Effective policy resolution

Scenarios:

#### Scenario: Execution override is not persisted

- **WHEN** invalidation applies a valid structured override
- **THEN** that execution uses the overlaid policy and the change default remains unchanged

#### Scenario: Workflow override does not alter target normalization

- **WHEN** workflow policy changes but artifact policy does not
- **THEN** target requirements and expansion remain those of the artifact policy

### Requirement: Policy-dependent target rules

#### Scenario: Target required for downstream execution

- **WHEN** `InvalidateChange.execute` is called with effective policy `downstream` and no targets
- **THEN** execution fails before mutating the change
- **AND** the error message uses host-neutral terms without `--target`

#### Scenario: Target forbidden for global execution

- **WHEN** `InvalidateChange.execute` is called with effective policy `global` and any target
- **THEN** execution fails before mutating the change
- **AND** the error message uses host-neutral terms without `--target`

### Requirement: Target normalization and validation

#### Scenario: Invalid target set reports every problem before aborting

- **GIVEN** a request containing an unknown artifact target and a `scope: change` artifact targeted as `<artifactId>@<specId>`
- **WHEN** `InvalidateChange.execute` normalizes the request
- **THEN** the failure reports both invalid target combinations
- **AND** the change is not mutated

### Requirement: Approval guard

Scenarios:

#### Scenario: Force is required only for current consent

- **GIVEN** a request affects valid approval
- **WHEN** force is absent
- **THEN** no mutation occurs and `InvalidateRequiresForceError` reports `gates` and `recoveries` with a host-neutral message that does not mention `--force`
- **AND** already-stale historical evidence does not trigger that guard

#### Scenario: Force preview is one combined recovery for the revoked set

- **GIVEN** a change in `archivable` with valid spec approval and valid sign-off, and workflow `preserve`
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` lists both gates (`spec` and `signoff`) in `recoveries`
- **AND** every entry reports the target `designing`, the single recovery the reconciler commits with `force`

#### Scenario: Valid consent of a disabled gate is revoked without force and moves nothing

- **GIVEN** a change in `implementing` whose configured approvals have `approvals.spec` disabled and a valid spec approval record
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` is not thrown
- **AND** the spec approval record is revoked and the change state remains `implementing`

#### Scenario: Disabled sign-off gate with valid consent is revoked without force

- **GIVEN** a change in `archivable` whose configured approvals have `approvals.signoff` disabled and a valid sign-off record
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` is not thrown
- **AND** the sign-off record is revoked, the change state remains `archivable` and no automatic recovery is reported

#### Scenario: Revocation of a disabled gate consent is recorded in history

- **GIVEN** a change whose configured approvals have `approvals.spec` disabled and a valid spec approval record
- **WHEN** `InvalidateChange.execute` revokes that consent without `force`
- **THEN** the change history gains one `approval-invalidated` event for gate `spec` with status `revoked` and cause `manual-invalidation`
- **AND** the result's `projectionChanges` contains the `specApproval` transition from `valid` to `revoked` with cause `manual-invalidation`

#### Scenario: Disabled gate consent revoked with redesign policy still moves nothing

- **GIVEN** a change in `implementing` with `approvals.spec` disabled, a valid spec approval record, effective workflow `redesign`, artifact policy `none` and no drifted or pending-review non-task artifacts
- **WHEN** `InvalidateChange.execute` revokes the consent without `force`
- **THEN** the spec approval record is revoked and the change state remains `implementing`
- **AND** `automaticReturn` is null

#### Scenario: Re-enabling a gate does not restore a revoked consent

- **GIVEN** a change in `implementing` whose valid spec approval record was revoked by an invalidation while `approvals.spec` was disabled
- **WHEN** `approvals.spec` is later enabled and the change is reconciled
- **THEN** the spec approval is treated as revoked, not valid
- **AND** the reconciler returns the change to `designing` and spec approval must be recorded again

#### Scenario: Re-enabling a gate in ready keeps the change in ready

- **GIVEN** a change in `ready` whose valid spec approval record was revoked by an invalidation while `approvals.spec` was disabled
- **WHEN** `approvals.spec` is later enabled and the change is reconciled
- **THEN** the spec approval is treated as revoked and the change stays in `ready`
- **AND** spec approval is recorded again in `ready`

#### Scenario: Re-enabling a gate in designing moves nothing

- **GIVEN** a change in `designing` whose valid spec approval record was revoked by an invalidation while `approvals.spec` was disabled
- **WHEN** `approvals.spec` is later enabled and the change is reconciled
- **THEN** the change stays in `designing`

#### Scenario: Legacy parking state after ready recovers to designing when the spec gate is re-enabled

- **GIVEN** a change in the legacy parking state `pending-spec-approval` (which follows `ready`) whose valid spec approval record was revoked by an invalidation while `approvals.spec` was disabled
- **WHEN** `approvals.spec` is later enabled and the change is reconciled
- **THEN** the change returns to `designing`

#### Scenario: Re-enabling the sign-off gate returns a change after done to done

- **GIVEN** a change after `done` (for example `archivable`) whose valid sign-off record was revoked by an invalidation while `approvals.signoff` was disabled
- **WHEN** `approvals.signoff` is later enabled and the change is reconciled
- **THEN** the sign-off is treated as revoked and the change returns to `done`

#### Scenario: Mixed enabled and disabled gate consent requires force and revokes nothing

- **GIVEN** a change with valid spec approval (gate enabled) and a valid sign-off record whose gate `approvals.signoff` is disabled
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` is thrown listing only the enabled gate
- **AND** neither the spec approval nor the disabled gate's sign-off record is revoked
- **AND** with `force` both consents are revoked

#### Scenario: Preview lists only enabled gates

- **GIVEN** a change past `done` with `approvals.signoff` enabled, `approvals.spec` disabled, and both a valid sign-off and a valid spec approval record
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` lists only `signoff` in `recoveries`
- **AND** the target of that entry is `done`

#### Scenario: Only sign-off revoked previews done

- **GIVEN** a change in `archivable` with only a valid sign-off enabled and valid
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** `InvalidateRequiresForceError` lists only `signoff` with target `done`

#### Scenario: Consent stale per fingerprint does not require force

- **GIVEN** a change whose persisted spec approval projection is `valid` but whose artifact fingerprint no longer matches
- **WHEN** `InvalidateChange.execute` runs without `force`
- **THEN** the reconciler's pre-pass has already recovered the consent as stale and `InvalidateRequiresForceError` is not thrown
- **AND** the invalidation and recovery are applied

#### Scenario: Force preview uses the effective policy of the request

- **GIVEN** a change in `ready` with a valid spec approval and persisted workflow `preserve`
- **WHEN** `InvalidateChange.execute` runs without `force` and with an execution override of workflow `redesign`
- **THEN** `InvalidateRequiresForceError` reports the spec recovery target `designing`, matching what the reconciler commits with `force`
- **AND** the same request without the override reports no move and the change stays in `ready` when forced

#### Scenario: Forced revocation commits evidence and recovery together

- **WHEN** force authorizes revoking valid consent
- **THEN** projection, audit event, artifact effects, and recovery are atomic

### Requirement: Canonical gate-safe invalidation and recovery

Scenarios:

#### Scenario: Gate priority wins over preserve

- **GIVEN** a change after `ready` (for example `implementing`) and forced invalidation affects valid spec approval and signoff under workflow `preserve`
- **WHEN** reconciliation applies it
- **THEN** both projections retain audit evidence and spec recovery returns to `designing`
- **AND** repeating the request does not duplicate effects

#### Scenario: Forced spec revocation from ready stays in ready

- **GIVEN** a change in `ready` with a valid spec approval, the spec gate on, and effective workflow `preserve`
- **WHEN** a forced invalidation revokes the spec approval
- **THEN** projection and audit evidence are committed and the change stays in `ready`
- **AND** `nextAction.action` is `{ kind: 'approve-spec' }`

#### Scenario: Forced revocation from ready under redesign returns to designing

- **GIVEN** a change in `ready` with a valid spec approval and the spec gate on
- **AND** the invalidation leaves non-task artifact review pending (for example a surgical or downstream target)
- **WHEN** a forced invalidation with effective workflow `redesign` revokes the spec approval
- **THEN** the change returns to `designing`
- **AND** with no pending artifact review (policy `none` and no drift) the change stays in `ready`

#### Scenario: Ungated preserve retains lifecycle state

- **GIVEN** invalidation affects no required consent under workflow `preserve`
- **WHEN** it is applied
- **THEN** lifecycle state remains and artifact reopening follows only artifact policy

### Requirement: Manual invalidation cause

#### Scenario: Manual invalidation records artifact-review-required

- **WHEN** `InvalidateChange.execute` succeeds
- **THEN** the appended invalidated event uses cause `artifact-review-required`
- **AND** the event message contains the supplied human-readable reason

### Requirement: Policy-aware artifact effects

#### Scenario: Downstream policy expands from the normalized target set

- **GIVEN** a change whose artifact DAG has descendants below target `specs@core:change`
- **WHEN** `InvalidateChange.execute` succeeds with effective policy `downstream`
- **THEN** the final affected set includes the normalized target file
- **AND** it includes every DAG descendant reached from that target

### Requirement: Manual invalidation does not invent drift

#### Scenario: Manual invalidation leaves hasDrift unchanged

- **GIVEN** a targeted file with `hasDrift: false`
- **WHEN** manual invalidation succeeds
- **THEN** `hasDrift` remains `false`

### Requirement: Idempotence on already reopened targets

#### Scenario: Reopened targets remain valid inputs

- **GIVEN** a targeted file already in `pending-review`
- **WHEN** `InvalidateChange.execute` succeeds
- **THEN** the file remains in a reopened state
- **AND** the operation does not fail because of that prior state

### Requirement: Output contract

Scenarios:

#### Scenario: Result reports committed canonical effects

- **WHEN** invalidation succeeds
- **THEN** its result includes reason, effective policy, normalized targets, projection changes, blockers, next action, and any committed return

#### Scenario: Output reflects idempotent repetition

- **WHEN** unchanged invalidity is applied again
- **THEN** result reports no new projection or recovery effects

### Requirement: Affected-set traversal order

#### Scenario: Reported artifacts follow DAG topological order

- **GIVEN** a downstream invalidation whose expanded affected set spans `specs`, `verify`, and `design`
- **WHEN** `InvalidateChange.execute` succeeds
- **THEN** human-facing reporting orders artifact types in `schema.artifactDag().topologicalOrder()` among affected types

### Requirement: Config-based factory delegates through resolveInvalidateChangeDeps

#### Scenario: createInvalidateChange config form derives InvalidateChangeDeps through resolveInvalidateChangeDeps

- **WHEN** `createInvalidateChange(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `InvalidateChangeDeps` through `resolveInvalidateChangeDeps(resolver)`
- **AND** `resolveInvalidateChangeDeps(resolver)` resolves:
- `changes: ChangeRepository`
- `actor: ActorResolver`
- `schemaProvider: SchemaProvider`
- `resolveChangeSchema: ResolveChangeSchema`
- `reconcile: ReconcileChangeValidity`
- `approvals` (the configured approval gate flags)
- `transitionBindings` (and `checkRegistry` when present) from the shared workflow check registry
- **AND** the factory delegates to canonical `createInvalidateChange(deps)`

### Requirement: Sovereign schema resolution

#### Scenario: Invalidation targets come from the change schema

- **GIVEN** a change whose `schemaName` is `custom-workflow`
- **AND** its schema and the workspace default define different artifact DAG targets
- **WHEN** `InvalidateChange` computes focused, downstream, or global targets
- **THEN** it calls `SchemaProvider.get('custom-workflow')`
- **AND** selects targets exclusively from the custom schema DAG

#### Scenario: Schema resolution failure precedes persistence

- **GIVEN** resolving the schema recorded on the change fails
- **WHEN** invalidation is requested
- **THEN** the error propagates
- **AND** no invalidation event or artifact state change is persisted

### Requirement: Next action follows lifecycle guidance

#### Scenario: Recovery with verifying disabled never recommends verification

- **GIVEN** a change whose schema disables `verifying`
- **AND** an invalidation commits an automatic recovery to `done`
- **WHEN** `InvalidateChange` returns its `nextAction`
- **THEN** the intent and action come from lifecycle guidance for `done`
- **AND** `nextAction.intent` is not `'verify'` and no action has kind `start-verification`

#### Scenario: Recovery with verifying enabled still routes to verification

- **GIVEN** a change whose schema enables `verifying`
- **AND** an invalidation commits an automatic recovery to `done`
- **AND** the completed verification is also stale
- **WHEN** `InvalidateChange` returns its `nextAction`
- **THEN** `nextAction.action` is `{ kind: 'approve-signoff' }` and `nextAction.intent` is `null`, because the committed recovery check-declared action takes precedence over the phase intent
- **AND** the stale verification is still reported as a blocker carrying the `start-verification` action
- **AND** `nextAction` carries no CLI or slash command string

#### Scenario: Recovery to done with current verification asks for sign-off renewal

- **GIVEN** a change whose schema enables `verifying` and whose sign-off gate is on
- **AND** an invalidation commits an automatic recovery to `done` because sign-off is stale
- **AND** the completed verification is still current
- **WHEN** `InvalidateChange` returns its `nextAction`
- **THEN** `nextAction.action` is `{ kind: 'approve-signoff' }` and `nextAction.intent` is `null`
- **AND** `InvalidateChange` did not pass an empty `checksByTarget`

#### Scenario: Recovery to designing reports the design intent

- **GIVEN** a spec gate is enabled and an invalidation commits an automatic recovery to `designing` because spec consent is stale
- **WHEN** `InvalidateChange` returns its `nextAction`
- **THEN** `nextAction.intent` is `'design'` and `nextAction.action` is undefined
- **AND** `nextAction` carries no CLI or slash command string
