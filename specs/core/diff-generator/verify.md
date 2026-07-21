# Verification: DiffGenerator

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `DiffGenerator`
- **WHEN** the class implements `generate(input): string`
- **THEN** it compiles and can be instantiated

### Requirement: Input contract

#### Scenario: Existing file diff uses provided input fields

- **GIVEN** `filename`, `base`, and `merged` strings for an existing artifact file
- **WHEN** `generate` is called with that input
- **THEN** the implementation can produce a unified diff using those values

#### Scenario: New file diff accepts empty base

- **GIVEN** a previewed artifact that has no canonical base file yet
- **WHEN** `generate` is called with `base: ""`
- **THEN** the implementation accepts the input without requiring a separate missing-file sentinel

### Requirement: Output contract

#### Scenario: Returned diff is plain text

- **WHEN** `generate` returns a unified diff
- **THEN** the returned value is a plain string
- **AND** it contains no ANSI color codes or terminal control sequences

#### Scenario: Returned diff labels both sides with preview filename

- **GIVEN** `filename: "spec.md"`
- **WHEN** `generate` returns a unified diff
- **THEN** the diff identifies the base side as `a/spec.md (base)`
- **AND** it identifies the merged side as `b/spec.md (merged)`

### Requirement: Error contract

#### Scenario: Default implementation raises DiffGenerationError for unusable diff results

- **GIVEN** the concrete diff-generation mechanism fails to produce a usable unified diff
- **WHEN** the default `DiffGenerator` implementation handles that failure
- **THEN** it raises `DiffGenerationError`
- **AND** it does not leak an anonymous library-specific error as the caller-facing contract

#### Scenario: Callers can distinguish diff-surface failure from merge failure

- **GIVEN** `PreviewSpec` invokes `DiffGenerator` after merge already succeeded
- **WHEN** `DiffGenerator` raises `DiffGenerationError`
- **THEN** the caller can treat that failure as a non-fatal review-surface problem
- **AND** the caller can preserve the successful merged preview result separately from the diff failure

### Requirement: Default context lines

#### Scenario: Omitted contextLines uses default of 3

- **WHEN** `generate` is called without `contextLines`
- **THEN** the default implementation produces a diff with 3 lines of context

### Requirement: Default implementation

#### Scenario: Config-based composition can obtain a default implementation

- **GIVEN** core composition constructs `PreviewSpec` from project configuration
- **WHEN** no custom diff generator is supplied by the caller
- **THEN** the composition layer provides a default `DiffGenerator` implementation

#### Scenario: Library choice stays hidden behind the port

- **WHEN** the default implementation uses a concrete diff library
- **THEN** callers still depend only on the `DiffGenerator` interface

### Requirement: Usage boundary

#### Scenario: PreviewSpec can use DiffGenerator without host presentation concerns

- **GIVEN** a merged preview entry with `filename`, `base`, and `merged`
- **WHEN** `PreviewSpec` invokes `DiffGenerator`
- **THEN** it receives plain diff data suitable for host-specific rendering
