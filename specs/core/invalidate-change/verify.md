# Verification: InvalidateChange

## Requirements

### Requirement: Input contract

#### Scenario: Targets accept artifact and artifact-at-spec forms

- **WHEN** `InvalidateChange.execute` is called with `targets: ['design', 'specs@core:change']`
- **THEN** the use case accepts both target forms in one request
- **AND** it preserves them for later normalization and validation

### Requirement: Effective policy resolution

#### Scenario: Explicit override wins over persisted policy

- **GIVEN** a change persisted with `invalidationPolicy: 'downstream'`
- **WHEN** `InvalidateChange.execute` is called with `policyOverride: 'surgical'`
- **THEN** the effective invalidation policy is `surgical`

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

#### Scenario: Active approval blocks execution until forced

- **GIVEN** a change with an active spec approval
- **WHEN** `InvalidateChange.execute` is called without `force: true`
- **THEN** execution fails without mutating the change

### Requirement: Change-level invalidation is unconditional

#### Scenario: Policy none still returns the change to designing

- **GIVEN** a change outside `designing`
- **WHEN** `InvalidateChange.execute` succeeds with effective policy `none`
- **THEN** the change is invalidated
- **AND** it returns to `designing`

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

#### Scenario: Success returns the deduplicated final affected set

- **GIVEN** two requested targets converge on one downstream file
- **WHEN** `InvalidateChange.execute` succeeds
- **THEN** the returned affected set includes that file only once
- **AND** it also returns the effective invalidation policy and updated change
