# Verification: Spec Outline

## Requirements

### Requirement: Command Interface

#### Scenario: Basic usage with defaults

- **WHEN** running `specd specs outline core:core/config`
- **THEN** it resolves ALL spec-scoped artifacts (e.g. `spec.md`, `verify.md`)
- **AND** outputs the default compact outline subset for each one that exists

#### Scenario: Use artifactId filter

- **WHEN** running `specd specs outline core:core/config --artifact verify`
- **THEN** it resolves `verify` to `verify.md`
- **AND** outputs the outline of `verify.md`

#### Scenario: Full mode

- **WHEN** running `specd specs outline core:core/config --artifact specs --full`
- **THEN** the output includes all selector-addressable node families for that parser

#### Scenario: Hints mode

- **WHEN** running `specd specs outline core:core/config --artifact specs --hints`
- **THEN** the response includes root-level `selectorHints` keyed by returned node type
- **AND** hint values are placeholders

#### Scenario: Canonical plural command form

- **WHEN** workflow instructions reference this command
- **THEN** they use `specd specs outline <specPath> --artifact <artifactId>` as canonical form

### Requirement: Output Rendering

#### Scenario: Text format is JSON

- **WHEN** running with `--format text`
- **THEN** the output is a formatted JSON string

#### Scenario: JSON/TOON format structure

- **WHEN** running with `--format json`
- **THEN** the output is an array of objects
- **AND** each object contains `filename` and `outline`

### Requirement: On-demand outline retrieval for workflows

#### Scenario: Available outline reference resolved on demand

- **GIVEN** another workflow output provides `availableOutlines: ["core:core/config"]`
- **WHEN** `specd specs outline core:core/config --artifact specs` is executed
- **THEN** outline content is returned for that spec/artifact
- **AND** no embedded outline payload is required in the source command

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
