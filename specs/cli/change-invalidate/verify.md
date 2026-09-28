# Verification: Change Invalidate

## Requirements

### Requirement: Command signature

Scenarios:

#### Scenario: Independent overrides map to core input

- **WHEN** artifact and workflow flags are supplied independently
- **THEN** the CLI delegates their structured values and validates target compatibility

#### Scenario: Missing reason remains an input error

- **WHEN** structured policy flags are supplied without `--reason`
- **THEN** the command exits with no mutation

### Requirement: Effective policy resolution

Scenarios:

#### Scenario: Legacy adaptation remains in core

- **WHEN** persisted configuration originated from the legacy key
- **THEN** CLI displays the effective structured policy returned by core without reinterpreting it

#### Scenario: Invocation overrides are shown as effective only for the request

- **WHEN** core returns an overlaid policy
- **THEN** output shows it without claiming the persisted default changed

### Requirement: Target syntax

Scenarios:

#### Scenario: Scope-incompatible artifact-at-spec target is rejected

- **WHEN** `specd changes invalidate <name> --reason "review" --artifact-policy surgical --target design@core:change` is run
- **THEN** the command exits with code `1`
- **AND** the error explains that the target form is invalid for a `scope: change` artifact
- **AND** no mutation occurs

### Requirement: Policy-dependent target requirements

Scenarios:

#### Scenario: Downstream requires at least one target

- **WHEN** `specd changes invalidate <name> --reason "review" --artifact-policy downstream` is run
- **THEN** the command exits with code `1`
- **AND** no mutation occurs

#### Scenario: Global rejects explicit targets

- **WHEN** `specd changes invalidate <name> --reason "review" --artifact-policy global --target specs` is run
- **THEN** the command exits with code `1`
- **AND** no mutation occurs

### Requirement: Target normalization and validation

#### Scenario: All invalid targets are reported together

- **WHEN** the command is run with multiple malformed, unknown, or scope-incompatible targets
- **THEN** the command reports every invalid target combination it found
- **AND** no mutation occurs

### Requirement: Approval guard

Scenarios:

#### Scenario: Refusal names exact gates and targets

- **GIVEN** the request would revoke current consent and force is absent
- **WHEN** the command evaluates its guard
- **THEN** it performs no mutation and names each affected gate and canonical recovery
- **AND** CLI does not hard-code `designing` for sign-off-only or no-return cases

#### Scenario: Stale historical evidence needs no force

- **WHEN** only already-stale evidence is affected
- **THEN** the approval guard does not request confirmation solely for history

### Requirement: Change-level invalidation

Scenarios:

#### Scenario: CLI does not choose recovery

- **WHEN** guarded invalidation succeeds
- **THEN** lifecycle and projection consequences exactly match the core result

#### Scenario: Artifact and workflow effects are reported independently

- **WHEN** core preserves state while reopening focused artifacts
- **THEN** CLI reports both facts without synthesizing a design return

### Requirement: none semantics

Scenarios:

#### Scenario: None reopens nothing and forgives nothing

- **WHEN** artifact policy `none` is effective
- **THEN** no additional files reopen while existing drift, stale evidence, and workflow recovery remain visible

#### Scenario: None with redesign still moves lifecycle

- **WHEN** artifact policy is `none` and workflow policy is `redesign`
- **THEN** output reports no reopened files and the independently committed design recovery

### Requirement: Reporting

Scenarios:

#### Scenario: Preserve output still reports blockers

- **WHEN** invalidation preserves lifecycle state with unresolved drift
- **THEN** output shows both policy dimensions, affected evidence, and the forward blocker

#### Scenario: Recovery output names committed state

- **WHEN** core commits gate-driven recovery
- **THEN** text, JSON, and TOON render that state, cause, blockers, and next action

#### Scenario: Structured success preserves the operator reason

- **WHEN** invalidation succeeds with a human-readable reason
- **THEN** JSON and TOON expose that exact value in a named `reason` field
- **AND** text output includes it without replacing canonical recovery guidance

### Requirement: Error handling

#### Scenario: Missing force is treated as command failure

- **GIVEN** an active signoff on the change
- **WHEN** the command is run without `--force`
- **THEN** it exits with code `1`
