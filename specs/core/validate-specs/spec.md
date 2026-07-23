# Validate Specs

## Purpose

Spec artifacts can drift from the schema's structural expectations over time, and there is no other mechanism to catch these violations before they cause downstream failures. The `ValidateSpecs` use case validates spec artifacts against the active schema's structural rules, supporting three scoping modes: a single spec by qualified path, all specs in a workspace, or all specs across all workspaces. Only spec-scoped artifact types from the schema are validated; change-scoped artifacts are excluded.

## Requirements

### Requirement: Resolve the active schema

The use case SHALL obtain the schema via `SchemaProvider.get()`. If the schema cannot be resolved, `get()` throws `SchemaNotFoundError` or `SchemaValidationError` — the use case does not catch these.

### Requirement: Filter to spec-scoped artifact types

The use case SHALL call `schema.artifacts()` and retain only those artifact types where `scope === 'spec'`. Change-scoped artifact types MUST be excluded from validation.

### Requirement: Single spec validation mode

When `input.specPath` is provided (format: `workspace:capabilityPath`), the use case SHALL:

1. Parse the spec identifier via `parseSpecId`.
2. Look up the workspace's `SpecRepository`. If not found, throw `WorkspaceNotFoundError`.
3. Load the spec via `repo.get(specPath)`. If not found, throw `SpecNotFoundError`.
4. Validate only that single spec.

### Requirement: Workspace validation mode

When `input.workspace` is provided (and `input.specPath` is not), the use case SHALL:

1. Look up the workspace's `SpecRepository`. If not found, throw `WorkspaceNotFoundError`.
2. List all specs in the workspace via `repo.list()`.
3. Validate each spec.

### Requirement: All-workspaces validation mode

When neither `input.specPath` nor `input.workspace` is provided, the use case SHALL iterate all configured workspaces and validate every spec in each.

### Requirement: Per-spec artifact validation

For each spec, the use case SHALL check every spec-scoped artifact type from the schema:

1. Determine the expected filename from `path.basename(artifactType.output)`.
2. If the file is missing and the artifact type is not optional, record a `ValidationFailure` with description indicating the required artifact is missing.
3. If the file is missing and the artifact type is optional, skip silently.
4. If the file exists and the artifact type has no validation rules, parse it when a matching `crossArtifactValidations` rule may need it; otherwise skip.
5. If the file exists and has local rules: infer the format (from `artifactType.format` or filename), obtain the parser from `ArtifactParserRegistry`, parse the content into an AST, and evaluate the schema's validation rules via `evaluateRules`.
6. Any artifact whose local validation passes and whose AST is available becomes an eligible participant input for Requirement: Per-spec cross-artifact validation.

### Requirement: Per-spec cross-artifact validation

After local per-artifact validation for one spec, `ValidateSpecs` SHALL evaluate the same schema `crossArtifactValidations` engine used by `ValidateArtifacts` for all rules whose `scope` is `spec`.

Evaluation rules:

- rules are evaluated independently for each spec being validated
- only participants belonging to the current spec are considered
- participant key extraction and relation semantics MUST match `ValidateArtifacts`
- `ValidateSpecs` MUST reuse the same underlying cross-artifact evaluation machinery as `ValidateArtifacts` rather than redefining a separate comparison model

Participant readiness rules:

- a participant is ready only when its artifact file exists, its artifact has passed local structural validation for this spec, and its parsed AST is available
- if every participant for a rule is ready, the rule MUST be evaluated and any mismatch recorded as a `ValidationFailure`
- if one or more participants are not ready, the rule MUST be deferred for that spec and surfaced as a non-failing validation output entry

### Requirement: Aggregated result

The use case SHALL return a `ValidateSpecsResult` containing:

- `entries` — array of `SpecValidationEntry` objects, one per validated spec.
- `totalSpecs` — total number of specs validated.
- `passed` — number of specs with zero failures.
- `failed` — number of specs with one or more failures.

Each `SpecValidationEntry` MUST include:

- `spec` — qualified label in `workspace:capabilityPath` format.
- `passed` — `true` if `failures` is empty.
- `failures` — array of `ValidationFailure` objects from both local artifact validation and per-spec cross-artifact validation.
- `warnings` — array of `ValidationWarning` objects, including deferred cross-artifact validation notices.

### Requirement: Format inference and parser resolution

When an artifact type does not specify an explicit `format`, the use case SHALL infer it from the filename via `inferFormat`. If no parser is found for the resolved format, the artifact MUST be skipped without recording a failure or warning.

### Requirement: Canonical metadata consistency validation

After per-artifact and cross-artifact validation for one spec, `ValidateSpecs` SHALL validate the canonical metadata state exposed through `SpecRepository.metadata()` and the repository's persisted semantic dependency operations.

Validation rules:

1. If metadata exists and its freshness checks indicate stale content hashes, record a `ValidationFailure` indicating that `metadata.json` must be regenerated.
2. If metadata exists and `metadata.json.dependsOn` differs from `SpecRepository.readPersistedDependsOn(spec)`, record a `ValidationFailure` indicating that the canonical dependency projection is stale or inconsistent.
3. If the active schema declares `metadataExtraction.dependsOn` for the spec and extraction yields a dependency set that differs from the persisted dependency state, record a `ValidationFailure`.
4. If the schema omits dependency extraction, validation MUST still accept `metadata.json.dependsOn` when it matches the persisted dependency state.

These checks validate canonical metadata as a cache of persisted spec semantics without treating `spec-lock.json` as a normal schema artifact.

### Requirement: Transparent validation result cache

`ValidateSpecs` MUST use a workspace `ValidationResultCache` for each selected spec
before running full per-spec validation, and MUST upsert after a completed full
validation on cache miss.

Behaviour:

1. Compute the active `schemaFingerprint` and `engineVersion` for the resolved schema
   and evaluation engine (see fingerprint rules below).
2. For each selected spec, call cache `lookup({ spec, schemaFingerprint, engineVersion })`.
   The cache owns the freshness cascade (via its constructor-injected
   `SpecRepository`) defined by
   [`core:validation-result-cache-port`](../validation-result-cache-port/spec.md).
3. On hit, use the returned `SpecValidationEntry` as the outcome for that spec
   without re-running artifact parse, local rules, cross-artifact rules, or
   metadata consistency checks.
4. On miss, perform the existing full per-spec validation path, then
   `upsert({ entry, spec, schemaFingerprint, engineVersion })` only — not stamps
   or fingerprints.

`ValidateSpecs` MUST NOT precompute cache stamps or `cacheFingerprint`, and MUST NOT
implement soft-hit stamp refresh. Soft-hit persistence is invisible to this use case.

Bucket fingerprint inputs (supplied by ValidateSpecs / composition):

- `schemaFingerprint` MUST cover schema identity plus all `scope: 'spec'` artifact
  validations and `scope: 'spec'` cross-artifact rules, and MUST reflect whether
  `metadataExtraction.dependsOn` is declared.
- `engineVersion` MUST change when evaluation logic changes independently of schema
  YAML.

Host opacity: `ValidateSpecs` MUST remain the only consumer of the cache port for this
behaviour. Delivery hosts MUST observe identical public inputs and outputs whether a
cache hit or miss occurred.

Composition vs direct construction:

- When `validationResultCaches` has no entry for the target workspace, `ValidateSpecs`
  MUST skip cache lookup and upsert and perform full validation. This degraded path
  exists for unit tests and direct `new ValidateSpecs(...)` construction only.
- `resolveValidateSpecsDeps` and config-based `createValidateSpecs` MUST register one
  `ValidationResultCache` per configured workspace so CLI and kernel paths never hit
  the skip path during normal operation.

### Requirement: Config-based factory delegates through resolveValidateSpecsDeps

The config-based `createValidateSpecs(config, options?)` form MUST derive
`ValidateSpecsDeps` through `resolveValidateSpecsDeps(resolver)` and then delegate to
canonical `createValidateSpecs(deps)`.

`resolveValidateSpecsDeps(resolver)` MUST resolve:

- `specs: ReadonlyMap<string, SpecRepository>`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `contentHasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `validationResultCaches: ReadonlyMap<string, ValidationResultCache>` (one port
  instance per workspace, wired with that workspace's `SpecRepository`)

The helper is the only use-case-specific composition entry for config-based bootstrap.
The factory MUST NOT reconstruct fs-shaped wiring inline, including filesystem paths
for the validation result cache.

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- `input.specPath` takes precedence: when provided, `input.workspace` is ignored.
- Validation rules come exclusively from the resolved schema — the use case does not define its own rules.
- The `ValidationFailure` and `ValidationWarning` types are shared with the `ValidateArtifacts` use case.

## Spec Dependencies

- [`core:validate-artifacts`](../validate-artifacts/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:validation-result-cache-port`](../validation-result-cache-port/spec.md) — transparent result memoization
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — Spec stamps and fingerprint APIs used by the cache
- [`core:spec-lock`](../spec-lock/spec.md) — persisted semantic state contributes to freshness
