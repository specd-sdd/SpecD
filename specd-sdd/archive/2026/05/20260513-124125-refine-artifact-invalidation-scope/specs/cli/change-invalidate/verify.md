# Verification: Change Invalidate

## Requirements

### Requirement: Command signature

#### Scenario: Missing reason is rejected

- **WHEN** `specd changes invalidate <name>` is run without `--reason`
- **THEN** the command exits with code `1`
- **AND** it prints a usage or validation error

### Requirement: Effective policy resolution

#### Scenario: CLI override becomes the effective policy

- **GIVEN** a change persisted with `invalidationPolicy: downstream`
- **WHEN** `specd changes invalidate <name> --reason "review" --policy surgical --target specs`
- **THEN** execution uses effective policy `surgical`

### Requirement: Target syntax

#### Scenario: Scope-incompatible artifact-at-spec target is rejected

- **WHEN** `specd changes invalidate <name> --reason "review" --policy surgical --target design@core:change`
- **THEN** the command exits with code `1`
- **AND** the error explains that the target form is invalid for a `scope: change` artifact

### Requirement: Policy-dependent target requirements

#### Scenario: Downstream requires at least one target

- **WHEN** `specd changes invalidate <name> --reason "review" --policy downstream`
- **THEN** the command exits with code `1`

#### Scenario: Global rejects explicit targets

- **WHEN** `specd changes invalidate <name> --reason "review" --policy global --target specs`
- **THEN** the command exits with code `1`

### Requirement: Target normalization and validation

#### Scenario: All invalid targets are reported together

- **WHEN** the command is run with multiple malformed, unknown, or scope-incompatible targets
- **THEN** the command reports every invalid target combination it found
- **AND** no mutation occurs

### Requirement: Approval guard

#### Scenario: Active approval requires force even under policy none

- **GIVEN** the change currently has an active approval
- **WHEN** `specd changes invalidate <name> --reason "review" --policy none` is run without `--force`
- **THEN** the command exits with code `1`
- **AND** the warning says the change would return to `designing` and invalidate the approval

### Requirement: Change-level invalidation

#### Scenario: Successful command always returns the change to designing

- **WHEN** `specd changes invalidate <name> --reason "review"` succeeds
- **THEN** the change is invalidated
- **AND** it returns to `designing`

### Requirement: `none` semantics

#### Scenario: Policy none reports no artifact invalidation

- **WHEN** `specd changes invalidate <name> --reason "review" --policy none` succeeds
- **THEN** output says the change returned to `designing`
- **AND** it says no artifacts were invalidated because the effective policy is `none`

### Requirement: Reporting

#### Scenario: Downstream output reports only the final affected set

- **GIVEN** repeated targets normalize to one set and downstream expansion reaches additional files
- **WHEN** the command succeeds
- **THEN** output reports the effective policy
- **AND** it lists each affected artifact/file at most once
- **AND** downstream-expanded entries are clearly labeled

### Requirement: Error handling

#### Scenario: Missing force is treated as command failure

- **GIVEN** an active signoff on the change
- **WHEN** the command is run without `--force`
- **THEN** it exits with code `1`
