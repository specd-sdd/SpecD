# Verification: Validate Specs

## Requirements

### Requirement: Resolve the active schema

#### Scenario: Schema resolution failure propagates

- **WHEN** `SchemaProvider.get()` throws `SchemaNotFoundError`
- **THEN** the error propagates — the use case does not catch it

### Requirement: Filter to spec-scoped artifact types

#### Scenario: Change-scoped artifacts excluded

- **GIVEN** a schema with both `scope: 'spec'` and `scope: 'change'` artifact types
- **WHEN** validation runs
- **THEN** only `scope: 'spec'` artifact types are checked

### Requirement: Single spec validation mode

#### Scenario: Validate a single spec by qualified path

- **GIVEN** a spec at `default:auth/login` with a required `spec.md` present
- **WHEN** `execute({ specPath: 'default:auth/login' })` is called
- **THEN** the result contains exactly one entry for `'default:auth/login'`

#### Scenario: Unknown workspace in specPath throws WorkspaceNotFoundError

- **WHEN** `execute({ specPath: 'nonexistent:auth/login' })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown

#### Scenario: Spec not found throws SpecNotFoundError

- **GIVEN** workspace `'default'` exists but has no spec at `auth/login`
- **WHEN** `execute({ specPath: 'default:auth/login' })` is called
- **THEN** a `SpecNotFoundError` is thrown

### Requirement: Workspace validation mode

#### Scenario: All specs in workspace validated

- **GIVEN** workspace `'default'` contains three specs
- **WHEN** `execute({ workspace: 'default' })` is called
- **THEN** the result contains three entries

#### Scenario: Unknown workspace throws WorkspaceNotFoundError

- **WHEN** `execute({ workspace: 'nonexistent' })` is called
- **THEN** a `WorkspaceNotFoundError` is thrown

### Requirement: All-workspaces validation mode

#### Scenario: All specs across all workspaces validated

- **GIVEN** two workspaces with two specs each
- **WHEN** `execute({})` is called
- **THEN** the result contains four entries

### Requirement: Per-spec artifact validation

#### Scenario: Missing required artifact recorded as failure

- **GIVEN** a spec-scoped artifact type `spec.md` that is not optional, and the spec has no `spec.md`
- **WHEN** validation runs for that spec
- **THEN** a `ValidationFailure` is recorded with `artifactId` matching the artifact type and a description indicating the artifact is missing

#### Scenario: Missing optional artifact skipped silently

- **GIVEN** an optional spec-scoped artifact type, and the spec does not have that file
- **WHEN** validation runs for that spec
- **THEN** no failure or warning is recorded for that artifact

#### Scenario: Artifact with no validation rules skipped

- **GIVEN** a spec-scoped artifact type with an empty `validations` array, and the file exists
- **WHEN** validation runs for that spec
- **THEN** no failure or warning is recorded for that artifact

#### Scenario: Artifact with no local rules is still parsed for cross-artifact validation

- **GIVEN** a spec-scoped artifact file has no local `validations`
- **AND** a schema `crossArtifactValidations` rule references that artifact
- **WHEN** `ValidateSpecs` validates the spec
- **THEN** the artifact is parsed so it can participate in the cross-artifact rule

#### Scenario: Validation rules evaluated against parsed AST

- **GIVEN** a spec-scoped artifact type with validation rules, and the file exists and parses successfully
- **WHEN** validation runs
- **THEN** `evaluateRules` results are included in the entry's `failures` and `warnings`

### Requirement: Per-spec cross-artifact validation

#### Scenario: Cross-artifact mismatch becomes a spec failure

- **GIVEN** `spec.md` and `verify.md` for one spec both parse successfully
- **AND** a schema `crossArtifactValidations` rule requires `all-equal` requirement IDs between them
- **WHEN** `ValidateSpecs` evaluates that spec
- **THEN** any key mismatch is recorded as a `ValidationFailure` on that spec entry

#### Scenario: Deferred rule is surfaced when a participant is not locally valid

- **GIVEN** one participant artifact for the spec failed local validation
- **WHEN** `ValidateSpecs` evaluates a cross-artifact rule that needs that participant
- **THEN** the rule is deferred
- **AND** the spec entry includes a non-failing warning explaining the deferral

#### Scenario: ValidateSpecs reuses ValidateArtifacts cross-artifact semantics

- **GIVEN** a cross-artifact rule using `keySelector`, `subset`, and `options.ordering: strict`
- **WHEN** the same spec content is evaluated through `ValidateArtifacts` and `ValidateSpecs`
- **THEN** both use cases apply the same participant key extraction and relation semantics

### Requirement: Aggregated result

#### Scenario: Counts reflect validation outcomes

- **GIVEN** three specs validated where two pass and one fails
- **WHEN** the result is returned
- **THEN** `totalSpecs` is `3`, `passed` is `2`, `failed` is `1`

#### Scenario: Cross-artifact failures and deferred warnings are aggregated per spec

- **GIVEN** one spec has a cross-artifact mismatch
- **AND** another spec has a deferred cross-artifact rule because one participant is invalid
- **WHEN** `ValidateSpecs` returns its result
- **THEN** the first spec entry includes the relational failure
- **AND** the second spec entry includes the deferred warning

### Requirement: Format inference and parser resolution

#### Scenario: Format inferred from filename when not explicit

- **GIVEN** an artifact type with no explicit `format` and filename `spec.md`
- **WHEN** validation runs
- **THEN** the format is inferred as markdown and the corresponding parser is used

#### Scenario: No parser available skips artifact silently

- **GIVEN** an artifact type whose inferred format has no registered parser
- **WHEN** validation runs
- **THEN** no failure or warning is recorded for that artifact

### Requirement: Metadata materialization and validation

#### Scenario: Stale persisted metadata is self-healed, not a failure

- **GIVEN** a spec has `metadata.json` whose `contentHashes` no longer match the current required artifacts
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** `GetSpecMetadata` self-heals a fresh in-memory projection (delegating with `policy: 'if-needed'`)
- **AND** no `ValidationFailure` is recorded solely because the persisted cache was stale

#### Scenario: Materialization failure becomes a validation failure

- **GIVEN** `GetSpecMetadata` cannot produce a valid metadata projection for a spec (for example, a source read failure or a projection that fails structural validation even after regeneration)
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` indicating that metadata could not be materialized

#### Scenario: Post-materialization dependsOn mismatch becomes a validation failure

- **GIVEN** the materialized metadata's normalized `dependsOn` differs from `SpecRepository.readPersistedState(spec).dependsOn` (or `[]` for a lock-less spec)
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` describing the internal inconsistency

#### Scenario: Extracted dependsOn mismatch becomes a validation failure

- **GIVEN** the schema declares `metadataExtraction.dependsOn`
- **AND** extraction yields a dependency set different from the persisted dependency state
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure`

#### Scenario: Persisted dependency projection remains valid without extraction

- **GIVEN** the schema omits `metadataExtraction.dependsOn`
- **AND** `metadata.json.dependsOn` matches the persisted dependency state
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** no dependency-projection failure is recorded for that check

#### Scenario: metadata-cache-write-failed is a warning, not a failure

- **GIVEN** materialization returns a `metadata-cache-write-failed` warning while still producing a valid in-memory projection
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the warning is surfaced as a `ValidationWarning` on the spec's entry
- **AND** it is not recorded as a `ValidationFailure`

### Requirement: Persisted optimization staleness is an independent failure

#### Scenario: Stale optimization field fails validation independently

- **GIVEN** a spec's persisted `optimizedDescription` or `optimizedContext` is stale against its current artifacts or schema identity
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry includes a `ValidationFailure` identifying the stale field(s) and reason(s)

#### Scenario: Optimization staleness failure is reported even when metadata materialization succeeds

- **GIVEN** metadata materialization succeeds and all other checks pass for a spec
- **AND** a persisted optimization field is stale
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the spec entry still fails due to the stale optimization field

#### Scenario: No optimizations or only fresh optimizations does not fail this check

- **GIVEN** a spec has no persisted optimizations, or only fresh optimization fields
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** this check does not fail for that spec

### Requirement: Transparent validation result cache

#### Scenario: Hard hit skips full validation work

- **GIVEN** a valid cache row for a spec whose stamps still match
- **WHEN** `ValidateSpecs` validates that spec via
  `lookup({ spec, schemaFingerprint, engineVersion, stamps? })`
- **THEN** the cached `SpecValidationEntry` is returned for that spec
- **AND** artifact parse, rule evaluation, cross-artifact evaluation, and metadata
  consistency checks are not re-run for that spec

#### Scenario: Soft hit is invisible to ValidateSpecs

- **GIVEN** a cache row whose stamps changed but whose `cacheFingerprint` still matches
- **WHEN** `ValidateSpecs` validates that spec
- **THEN** the result is a hit with the cached entry
- **AND** ValidateSpecs does not receive a soft-hit / `refreshStamps` signal
- **AND** full validation is not re-run

#### Scenario: Miss runs full validation and upserts including failures

- **GIVEN** no usable cache row for a spec (bucket invalid, stamp+fingerprint miss, or
  absent)
- **WHEN** `ValidateSpecs` validates that spec and records failures and warnings
- **THEN** the full validation path runs
- **AND** `upsert({ entry, spec, schemaFingerprint, engineVersion })` is called
- **AND** ValidateSpecs does not pass stamps or `cacheFingerprint` on upsert

#### Scenario: Lock content change forces miss via cacheFingerprint

- **GIVEN** two otherwise identical specs whose persisted lock sidecar contents differ
- **WHEN** each is validated after an initial cached pass
- **THEN** the second validation cannot hard/soft-hit on the first row's fingerprint
  path (lock feeds persisted-state hash inside `specFingerprint`)

#### Scenario: Hosts observe identical public behaviour on hit or miss

- **WHEN** a host invokes validation with the same public inputs
- **THEN** returned `ValidateSpecsResult` shape and fields are unchanged by whether a
  cache hit occurred
- **AND** the host is not required to pass cache-specific options

#### Scenario: Workspace discovery lists with includeMeta

- **GIVEN** workspace validation mode
- **WHEN** specs are discovered for validation
- **THEN** the repository is listed with `{ includeMeta: true }`

#### Scenario: Warm hard hit does not N×get solely for stamps

- **GIVEN** workspace or all-workspaces validation with list Meta available
- **AND** the validation result cache would hard-hit from those stamps
- **WHEN** `ValidateSpecs` looks up the cache for each listed spec
- **THEN** it passes the list Meta stamps into `lookup`
- **AND** it does not call `repo.get()` solely to obtain stamps for those hard hits

### Requirement: Config-based factory delegates through resolveValidateSpecsDeps

#### Scenario: createValidateSpecs config form derives ValidateSpecsDeps through resolveValidateSpecsDeps

- **WHEN** `createValidateSpecs(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ValidateSpecsDeps` through `resolveValidateSpecsDeps(resolver)`
- **AND** `resolveValidateSpecsDeps(resolver)` resolves:
  - `specs: ReadonlyMap<string, SpecRepository>`
  - `schemaProvider: SchemaProvider`
  - `parsers: ArtifactParserRegistry`
  - `contentHasher: ContentHasher`
  - `extractorTransforms: ExtractorTransformRegistry`
  - `workspaceRoutes: readonly SpecWorkspaceRoute[]`
  - `validationResultCaches: ReadonlyMap<string, ValidationResultCache>`
  - `getMetadata: ReadonlyMap<string, GetSpecMetadata>`
- **AND** the factory delegates to canonical `createValidateSpecs(deps)`

#### Scenario: resolveValidateSpecsDeps wires one GetSpecMetadata instance per workspace

- **WHEN** `resolveValidateSpecsDeps(resolver)` runs
- **THEN** the resolved deps include `getMetadata: ReadonlyMap<string, GetSpecMetadata>` with one instance per configured workspace
- **AND** it is used to self-heal metadata before normalized-content validation
