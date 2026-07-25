# Verification: core:spec-optimization

## Requirements

### Requirement: Optimization fields are independent

#### Scenario: Invalidating optimizedContext does not affect optimizedDescription

- **GIVEN** a spec with fresh `optimizedDescription` and fresh `optimizedContext`
- **WHEN** an artifact contributing only to `optimizedContext`'s baseline changes
- **THEN** `optimizedContext` becomes stale
- **AND** `optimizedDescription` remains fresh with its baseline untouched

#### Scenario: Clearing optimizedDescription leaves optimizedContext's baseline untouched

- **GIVEN** a spec with both optimization fields present
- **WHEN** `optimizedDescription` is cleared
- **THEN** `optimizedContext`'s value and baseline are unchanged
- **AND** `optimizedContext`'s freshness is still reported independently

### Requirement: Optimization field shape

#### Scenario: A field with an empty artifactState is a valid baseline

- **GIVEN** a spec whose active schema declares no `scope: spec` artifacts present on disk when a field baseline is captured
- **WHEN** the optimization field is persisted
- **THEN** `artifactState` is an empty map
- **AND** the field is still considered structurally valid

#### Scenario: artifactState entries carry both hash and lastModified per artifact

- **GIVEN** a persisted optimization field baseline over two artifacts
- **WHEN** the field is read back
- **THEN** each `PersistedArtifactStateEntry` contains both `hash` and `lastModified`
- **AND** `schema` is the `{ name, version }` pair active at baseline capture time

### Requirement: Baseline content and ordering

#### Scenario: Change-scoped artifacts are excluded from the baseline

- **GIVEN** a spec directory containing schema-declared `scope: spec` artifacts and separate change-scoped artifacts
- **WHEN** an optimization field baseline is captured
- **THEN** the baseline includes only the `scope: spec` artifacts
- **AND** change-scoped artifacts do not appear in `artifactState`

#### Scenario: Absent optional artifacts are excluded from the baseline

- **GIVEN** a schema declaring an optional `scope: spec` artifact that is not present on disk
- **WHEN** an optimization field baseline is captured
- **THEN** the absent optional artifact is omitted from `artifactState`

#### Scenario: Baseline entries are serialized in filename-ascending order

- **GIVEN** a spec with artifacts named `verify.md` and `spec.md`
- **WHEN** an optimization field baseline is captured and persisted
- **THEN** the serialized `artifactState` keys appear in ascending filename order regardless of discovery order

### Requirement: Content hash identity

#### Scenario: Only lastModified differing does not indicate a content change

- **GIVEN** a baseline entry for an artifact with a known hash
- **WHEN** the artifact's `lastModified` stamp changes but its raw UTF-8 bytes do not
- **THEN** the recomputed hash equals the baseline hash
- **AND** identity comparison treats the artifact as unchanged

### Requirement: Per-field freshness reasons

#### Scenario: Added artifact is classified artifact-added

- **GIVEN** a field baseline that does not include a newly created `scope: spec` artifact
- **WHEN** freshness is compared against current state
- **THEN** that artifact is classified `artifact-added`
- **AND** the field is reported stale

#### Scenario: Removed artifact is classified artifact-removed

- **GIVEN** a field baseline that includes an artifact no longer present on disk
- **WHEN** freshness is compared against current state
- **THEN** that artifact is classified `artifact-removed`
- **AND** the field is reported stale

#### Scenario: lastModified-only difference is diagnostic-only and does not cause staleness

- **GIVEN** a field baseline entry whose hash matches the current artifact hash but whose `lastModified` differs
- **WHEN** freshness is compared
- **THEN** that artifact is reported as unchanged for staleness purposes
- **AND** the `lastModified` difference is surfaced only as a diagnostic

#### Scenario: A field with no persisted value is reported missing, not stale

- **GIVEN** a spec whose `optimizations` block has no `optimizedContext` entry
- **WHEN** freshness is queried for `optimizedContext`
- **THEN** the field is reported `missing`
- **AND** this is not treated as a validation error

### Requirement: Schema reassignment invalidates baselines

#### Scenario: Reassigning schema stales both fields with no artifact changes

- **GIVEN** a spec with fresh `optimizedDescription` and `optimizedContext` under schema version 1
- **WHEN** the spec's persisted schema is reassigned to version 2 with no artifact bytes changed
- **THEN** both `optimizedDescription` and `optimizedContext` become stale
- **AND** the staleness reason is the schema mismatch, not an artifact classification

### Requirement: Clearing the last field removes the optimizations block

#### Scenario: Clearing the only remaining field omits optimizations entirely

- **GIVEN** a spec with only `optimizedDescription` present in `optimizations`
- **WHEN** `optimizedDescription` is cleared
- **THEN** the persisted state omits `optimizations` entirely
- **AND** it is not persisted as an empty object

### Requirement: Backward compatibility with lock-less optimizations

#### Scenario: A lock written before optimizations existed remains valid

- **GIVEN** a `spec-lock.json` written before this capability existed, lacking `optimizations`
- **WHEN** it is read by current logic
- **THEN** it is treated identically to a lock whose `optimizations` block has no fields set
- **AND** no validation error is raised for the missing block

### Requirement: No implicit migration from metadata

#### Scenario: Regenerating metadata does not seed persisted optimizations

- **GIVEN** a spec with no persisted `optimizations` but with `optimizedDescription` present in generated `metadata.json`
- **WHEN** metadata is regenerated
- **THEN** `PersistedSpecOptimizations` remains absent
- **AND** no value or freshness signal is copied from `metadata.json` into the lock
