# Verification: core:get-spec-metadata

## Requirements

### Requirement: Input and delegation

#### Scenario: GetSpecMetadata performs no independent freshness logic

- **GIVEN** a call to `GetSpecMetadata.execute()` for a spec
- **WHEN** it processes the request
- **THEN** it delegates entirely to `MaterializeSpecMetadata` with `policy: 'if-needed'`
- **AND** it implements no freshness comparison, generation, or persistence logic of its own

### Requirement: Result contract

#### Scenario: Result shape is passed through unchanged

- **GIVEN** `MaterializeSpecMetadata` returns a result with `metadata`, `metadataFingerprint`, `source`, `regenerated`, and `warnings`
- **WHEN** `GetSpecMetadata` returns its result to the caller
- **THEN** all five fields are present and unmodified
- **AND** none of them is narrowed, renamed, or dropped

### Requirement: Failure semantics

#### Scenario: Metadata-cache-write-failed warning does not fail the call

- **GIVEN** materialization succeeds in-memory but the underlying cache write fails
- **WHEN** `GetSpecMetadata.execute()` returns
- **THEN** the call succeeds
- **AND** the `metadata-cache-write-failed` warning is reported on the successful result rather than causing a typed failure

#### Scenario: Failure to read the spec's artifacts or lock state fails the call

- **GIVEN** reading the spec's artifacts or persisted lock state fails
- **WHEN** `GetSpecMetadata.execute()` is called
- **THEN** it surfaces a typed failure

### Requirement: Construction and composition

#### Scenario: Config-based factory delegates through the resolver

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createGetSpecMetadata(config, options?)` is called
- **THEN** exactly one `CompositionResolver` is created
- **AND** dependencies are derived via `resolveGetSpecMetadataDeps(resolver)` before delegating to the canonical `createGetSpecMetadata(deps)` form

#### Scenario: Hosts obtain metadata through Kernel.specs.getMetadata rather than reading the repository directly

- **GIVEN** a host such as `specs metadata` or the code graph indexer
- **WHEN** it needs usable metadata for a spec
- **THEN** it calls `Kernel.specs.getMetadata`
- **AND** it does not read a repository metadata snapshot directly
