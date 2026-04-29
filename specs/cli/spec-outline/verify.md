# Verification: Spec Outline

## Requirements

### Requirement: Command Interface

#### Scenario: Basic usage with defaults

- **WHEN** running `specd specs outline core:core/config`
- **THEN** it resolves ALL spec-scoped artifacts (e.g. `spec.md`, `verify.md`)
- **AND** outputs the outline for each one that exists

#### Scenario: Use artifactId filter

- **WHEN** running `specd specs outline core:core/config --artifact verify`
- **THEN** it resolves `verify` to `verify.md`
- **AND** outputs the outline of `verify.md`

#### Scenario: Use filename filter

- **WHEN** running `specd specs outline core:core/config --file verify.md`
- **THEN** it outputs the outline of `verify.md`

### Requirement: Output Rendering

#### Scenario: Text format is JSON

- **WHEN** running with `--format text`
- **THEN** the output is a formatted JSON string

#### Scenario: JSON/TOON format structure

- **WHEN** running with `--format json`
- **THEN** the output is an array of objects
- **AND** each object contains `filename` and `outline`

### Requirement: Deduplication

#### Scenario: Deduplicate artifact and file flags

- **WHEN** running `specd specs outline core:core/config --artifact specs --file spec.md`
- **THEN** it only renders the outline for `spec.md` once

### Requirement: Error Handling

#### Scenario: Unknown artifact ID

- **WHEN** running with `--artifact unknown-id`
- **THEN** it fails with a clear error message: "unknown artifact ID 'unknown-id'"

#### Scenario: Invalid artifact scope

- **WHEN** running with `--artifact design` (which has scope: 'change')
- **THEN** it fails with a clear error message indicating the artifact must have scope 'spec'

#### Scenario: File not found

- **WHEN** running with `--file non-existent.md`
- **THEN** it fails with a clear error message: "file 'non-existent.md' not found"
