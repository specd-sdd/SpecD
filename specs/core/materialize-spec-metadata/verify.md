# Verification: core:materialize-spec-metadata

## Requirements

### Requirement: Input and result contract

#### Scenario: Default policy is if-needed when omitted

- **GIVEN** a `MaterializeSpecMetadataInput` with no `policy` specified
- **WHEN** `execute()` is called
- **THEN** the operation behaves as `policy: 'if-needed'`

#### Scenario: Result always reports fingerprint and source together

- **GIVEN** any successful materialization
- **WHEN** the result is returned
- **THEN** it includes `metadata`, `metadataFingerprint`, `source`, `regenerated`, and `warnings`
- **AND** `source` is exactly one of `'persisted'` or `'generated'`

### Requirement: if-needed reuses fresh metadata and self-heals everything else

#### Scenario: Fresh persisted snapshot is reused without generation

- **GIVEN** a structurally valid persisted metadata snapshot that is fresh against current artifacts, schema, and lock
- **WHEN** `execute()` is called with `policy: 'if-needed'`
- **THEN** the persisted snapshot is returned unchanged
- **AND** `source` is `'persisted'` and `regenerated` is `false`
- **AND** no generation occurs

#### Scenario: Missing, invalid, and stale snapshots are all regenerated identically

- **GIVEN** three specs whose persisted snapshots are respectively missing, structurally invalid, and stale
- **WHEN** `execute()` is called with `policy: 'if-needed'` for each
- **THEN** each triggers generation from a consistent loaded artifact set and lock snapshot
- **AND** none of the three conditions is exposed to the caller as a distinct public status

#### Scenario: Source changes between generation and persistence abort the write

- **GIVEN** generation completes using one fingerprint of artifacts, schema, and lock
- **WHEN** the source fingerprint is re-read immediately before persisting and no longer matches
- **THEN** the stale-relative-to-newer-source result is not persisted
- **AND** the generated in-memory projection is still returned with `source: 'generated'`

### Requirement: force always regenerates and persists

#### Scenario: Force regenerates even when the persisted snapshot is fresh

- **GIVEN** a structurally valid, fresh persisted metadata snapshot
- **WHEN** `execute()` is called with `policy: 'force'`
- **THEN** metadata is regenerated unconditionally without first checking whether the persisted snapshot is fresh

#### Scenario: Force reports a persistence failure to the caller

- **GIVEN** `policy: 'force'` regeneration succeeds but the subsequent persistence attempt fails for a non-conflict reason
- **WHEN** `execute()` returns
- **THEN** the failure is reported to the caller rather than returned as a silent in-memory-only success

### Requirement: Concurrent writer conflict handling

#### Scenario: Fresh winner is returned without a retry

- **GIVEN** persistence fails because another writer already replaced the observed revision
- **WHEN** the current persisted metadata (the winner) is re-read and found fresh against current source state
- **THEN** that winner is returned with `source: 'persisted'`
- **AND** no retry of generate-and-persist occurs

#### Scenario: Stale winner triggers exactly one bounded retry

- **GIVEN** a revision conflict where the re-read winner is not fresh
- **WHEN** materialization retries
- **THEN** at most one additional generate-and-persist attempt is performed
- **AND** if that retry also loses the race or is still not fresh, a typed conflict failure is returned

#### Scenario: Source conflict does not persist a stale-input projection

- **GIVEN** a revision conflict caused by artifacts, schema, or lock changing during materialization
- **WHEN** this is detected
- **THEN** no metadata write occurs from the generation attempt based on the stale inputs
- **AND** the conflict is surfaced without persisting a projection generated from stale inputs

### Requirement: Reuse of generation output

#### Scenario: Provenance is taken from the same generation attempt, not re-hashed

- **GIVEN** `GenerateSpecMetadata` returns artifact hashes and a snapshot `originalHash` for one generation attempt
- **WHEN** `MaterializeSpecMetadata` records provenance for the persisted write
- **THEN** it reuses exactly those values
- **AND** it does not re-read or re-hash artifact content a second time

### Requirement: Metadata-cache-write-failed warning on if-needed

#### Scenario: Non-conflict cache write failure yields a warning, not a failed result

- **GIVEN** `policy: 'if-needed'` generation succeeds but the cache write fails for a reason other than a revision conflict
- **WHEN** `execute()` returns
- **THEN** the fresh in-memory generated metadata is returned as a successful result
- **AND** `warnings` contains a `metadata-cache-write-failed` entry with the spec identity and storage error diagnostics
- **AND** exactly one `Logger.warn` call is emitted with that spec identity and storage error diagnostics

### Requirement: No public freshness status surface

#### Scenario: Result never exposes missing, invalid, or stale

- **GIVEN** any materialization outcome, including regeneration triggered by a missing, invalid, or stale persisted snapshot
- **WHEN** the result is inspected
- **THEN** it contains no `missing`, `invalid`, or `stale` field or value
- **AND** only `source`, `regenerated`, and `warnings` describe the outcome

### Requirement: Construction and composition

#### Scenario: Config-based factory delegates through the resolver

- **GIVEN** a `SpecdConfig` and no explicit deps
- **WHEN** `createMaterializeSpecMetadata(config, options?)` is called
- **THEN** exactly one `CompositionResolver` is created
- **AND** dependencies are derived via `resolveMaterializeSpecMetadataDeps(resolver)` before delegating to the canonical `createMaterializeSpecMetadata(deps)` form

#### Scenario: Kernel exposes materializeMetadata

- **GIVEN** a constructed `Kernel`
- **WHEN** `Kernel.specs.materializeMetadata` is invoked
- **THEN** it behaves as the `MaterializeSpecMetadata` use case's `execute()`
