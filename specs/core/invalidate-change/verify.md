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

#### Scenario: Target forbidden for global execution

- **WHEN** `InvalidateChange.execute` is called with effective policy `global` and any target
- **THEN** execution fails before mutating the change

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
- **THEN** no mutation occurs and affected gates and recovery targets are reported
- **AND** already-stale historical evidence does not trigger that guard

#### Scenario: Forced revocation commits evidence and recovery together

- **WHEN** force authorizes revoking valid consent
- **THEN** projection, audit event, artifact effects, and recovery are atomic

### Requirement: Canonical gate-safe invalidation and recovery

Scenarios:

#### Scenario: Gate priority wins over preserve

- **GIVEN** forced invalidation affects valid spec approval and signoff under workflow `preserve`
- **WHEN** reconciliation applies it
- **THEN** both projections retain audit evidence and spec recovery returns to `designing`
- **AND** repeating the request does not duplicate effects

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
- **AND** the factory delegates to canonical `createInvalidateChange(deps)`
