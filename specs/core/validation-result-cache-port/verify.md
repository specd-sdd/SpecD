# Verification: Validation Result Cache Port

## Requirements

### Requirement: Abstract port shape

#### Scenario: Port cannot be instantiated directly

- **WHEN** code attempts to instantiate `ValidationResultCache` directly
- **THEN** it fails because `ValidationResultCache` is abstract

### Requirement: Workspace-scoped instances

#### Scenario: Multi-workspace validation uses distinct cache instances

- **GIVEN** two workspaces `core` and `cli`
- **WHEN** composition wires `ValidateSpecs`
- **THEN** each workspace has its own `ValidationResultCache` instance
- **AND** a cache write for `core` MUST NOT appear in the `cli` bucket

### Requirement: SpecRepository injected at construction

#### Scenario: Repository is a constructor dependency

- **GIVEN** composition creates a `ValidationResultCache` for workspace `core`
- **WHEN** the instance is constructed
- **THEN** it receives the `core` `SpecRepository` (or deps that include it) at
  construction
- **AND** `lookup` / `upsert` signatures do not accept a `SpecRepository` argument

#### Scenario: Cache uses contractual SpecRepository APIs only

- **GIVEN** a wired `ValidationResultCache` instance
- **WHEN** it evaluates freshness for lookup or upsert
- **THEN** it loads stamps via the injected repository's `get()` and fingerprint pieces
  via `specFingerprint()` / metadata content hashing
- **AND** it MUST NOT require inventing SpecRepository helpers such as
  `validationSourceStamps` or `readValidationSidecar`

### Requirement: Cached entry payload

#### Scenario: Failed validation is persisted with failures and warnings

- **GIVEN** a completed validation whose `passed` is `false` and that includes failures
  and warnings
- **WHEN** the outcome is upserted through the port
- **THEN** a subsequent hard hit returns the same `failures` and `warnings`
- **AND** MUST NOT drop either array

### Requirement: Bucket validity inputs

#### Scenario: Schema fingerprint mismatch forces miss

- **GIVEN** a stored bucket whose `schemaFingerprint` differs from the current schema
  fingerprint
- **WHEN** a lookup is attempted for any spec in that workspace
- **THEN** the lookup misses
- **AND** full validation MUST run before any new upsert

#### Scenario: Engine version mismatch forces miss

- **GIVEN** a stored bucket whose `engineVersion` differs from the current engine version
- **WHEN** a lookup is attempted
- **THEN** the lookup misses

### Requirement: Stored freshness fields

#### Scenario: Stored stamps cover artifacts and sidecars via Spec shape

- **GIVEN** a spec with artifact files, generated metadata, and persisted lock state
- **WHEN** a row is upserted
- **THEN** stored stamps include `SpecArtifactEntry.lastModified` values,
  `persistedStateStamp`, and `generatedMetadataStamp`
- **AND** a `cacheFingerprint` is stored alongside those stamps

#### Scenario: Absent sidecars are encoded explicitly

- **GIVEN** a spec that has no generated metadata and no persisted lock state
- **WHEN** a row is upserted
- **THEN** stamps and `cacheFingerprint` encode explicit absence for those sidecars
- **AND** MUST NOT treat missing sidecars as identical to present empty files unless the
  adapter defines that equivalence

### Requirement: cacheFingerprint canonical form

#### Scenario: cacheFingerprint nests specFingerprint and metadata hash

- **GIVEN** a spec with known `specFingerprint` and raw `metadata.json` bytes
- **WHEN** `cacheFingerprint` is computed
- **THEN** it equals the content hash of sorted-key JSON
  `{ specFingerprint, metadataContentHash }` where `metadataContentHash` is the hash of
  those raw bytes
- **AND** it MUST NOT re-flatten artifact filenames + lock + metadata into one payload

#### Scenario: Absent metadata uses absent sentinel

- **GIVEN** a spec with no generated metadata file
- **WHEN** `cacheFingerprint` is computed
- **THEN** `metadataContentHash` is the literal `"__absent__"`

#### Scenario: Metadata content change changes cacheFingerprint only

- **GIVEN** unchanged authored artifacts and persisted lock state
- **AND** a change to raw `metadata.json` bytes
- **WHEN** `specFingerprint` and `cacheFingerprint` are recomputed
- **THEN** `specFingerprint` is unchanged
- **AND** `cacheFingerprint` differs

### Requirement: Lookup cascade owned by the cache

#### Scenario: Matching stamps produce a hard hit

- **GIVEN** a stored row whose stamps match current stamps and whose bucket is valid
- **WHEN** `lookup` is called
- **THEN** it returns `{ kind: 'hit', entry }` without computing `cacheFingerprint`

#### Scenario: Optional stamps skip get for hard-hit comparison

- **GIVEN** `lookup` is called with `stamps` derived from `list({ includeMeta: true })`
  that match the stored stamps
- **WHEN** the cache evaluates hard-hit
- **THEN** it does not call `SpecRepository.get()` solely to load stamps
- **AND** it returns a hard hit

#### Scenario: Soft hit refreshes stamps inside the cache

- **GIVEN** a stored row whose stamps differ but whose `cacheFingerprint` still matches
- **WHEN** `lookup` is called
- **THEN** the cache may load repository state needed for `cacheFingerprint`
- **AND** the cache persists refreshed stamps without changing `cacheFingerprint` or
  `entry`
- **AND** it returns `{ kind: 'hit', entry }`

#### Scenario: Miss when stamps and fingerprint both differ

- **GIVEN** a stored row whose stamps and `cacheFingerprint` both differ from current
- **WHEN** `lookup` is called
- **THEN** it returns `{ kind: 'miss' }`

### Requirement: Lookup result shape

#### Scenario: Lookup returns only hit or miss

- **WHEN** `lookup` completes for any freshness outcome
- **THEN** the result is exactly `{ kind: 'hit', entry }` or `{ kind: 'miss' }`
- **AND** MUST NOT expose `refreshStamps` or equivalent soft-hit signalling

### Requirement: Method signatures

#### Scenario: lookup accepts optional stamps but not cacheFingerprint or repository

- **WHEN** the port method signatures are examined
- **THEN** `lookup` MAY accept optional `stamps`
- **AND** MUST NOT accept `cacheFingerprint`, `refreshStamps`, or a `SpecRepository`
  argument

#### Scenario: Upsert still materializes stamps itself

- **WHEN** `upsert` is called after a full validation miss
- **THEN** the cache materializes current stamps and `cacheFingerprint` via its
  injected `SpecRepository`
- **AND** the use case MUST NOT pass stamps or `cacheFingerprint` on upsert

### Requirement: Upsert inputs

#### Scenario: Upsert materializes stamps and fingerprint itself

- **GIVEN** a cache miss for a selected spec
- **WHEN** full validation completes and `upsert` is called with `entry`, `spec`,
  `schemaFingerprint`, and `engineVersion`
- **THEN** the cache materializes current stamps and `cacheFingerprint` via its
  injected `SpecRepository`
- **AND** the use case MUST NOT pass stamps or `cacheFingerprint`

### Requirement: Host opacity

#### Scenario: Host APIs do not expose cache controls

- **WHEN** delivery hosts invoke spec validation through their public commands or APIs
- **THEN** those surfaces MUST NOT require cache-specific flags, paths, or options
- **AND** observable inputs and outputs match a cache-unaware caller

### Requirement: No side-channel through SpecRepository list cache

#### Scenario: SpecRepository list cache remains separate

- **WHEN** `SpecRepository.list` or `count` runs
- **THEN** it MUST NOT read or write `validate-specs/<workspace>/` validation-result rows
- **AND** validation-result persistence MUST go through `ValidationResultCache` only
