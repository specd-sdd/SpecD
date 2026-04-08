# ValidateArtifacts

## Purpose

Artifacts must be structurally valid and conflict-free before a change can progress, yet no other code path is allowed to mark an artifact complete — a single chokepoint is needed to enforce this invariant. `ValidateArtifacts` is that chokepoint: it checks a change's artifact files against the active schema, enforces required artifacts, validates structural rules, detects delta conflicts, invalidates any outstanding approval when content has changed, and is the only path through which an artifact may reach `complete` status.

## Requirements

### Requirement: Ports and constructor

`ValidateArtifacts` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, `ArtifactParserRegistry`, and `VcsAdapter`.

```typescript
class ValidateArtifacts {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    vcs: VcsAdapter,
  )
}
```

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

### Requirement: Input

`ValidateArtifactsInput.specPath` is optional when validating `scope: change` artifacts. For `scope: change` artifacts (like `design`, `tasks`), the artifact is uniquely identified by its artifact ID alone — there is no ambiguity about which spec it belongs to.

For `scope: spec` artifacts, `specPath` is still required because the same artifact type (e.g., `specs`) exists for multiple specs.

When `specPath` is provided and the artifact is `scope: change`, the specPath is ignored — the artifact ID is sufficient.

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `ValidateArtifacts` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`. This MUST happen before any artifact validation logic.

### Requirement: Required artifacts check

Before validating structure, `ValidateArtifacts` must verify that all non-optional artifact IDs are present in the change (status not `missing`). Optional artifacts with status `skipped` (`validatedHash === "__skipped__"`) are considered resolved and do not cause a failure. If any non-optional artifact is absent, `ValidateArtifacts` must return a failure result listing the missing artifact IDs. It must not throw — missing required artifacts are a validation failure, not an error.

This check is skipped when `artifactId` is provided — single-artifact validation does not enforce completeness of the full artifact set.

### Requirement: Dependency order check

Before validating an artifact, `ValidateArtifacts` must check that all artifact IDs in its `requires` list are either `complete` or `skipped` (via `change.effectiveStatus(type)`). If a required dependency is neither `complete` nor `skipped`, validation of the dependent artifact is skipped and reported as a dependency-blocked failure. A `skipped` optional artifact satisfies the dependency. `skipped` artifacts are not validated — there is no file to check.

### Requirement: Approval invalidation on content change

If the change has an active spec approval (`change.activeSpecApproval` is defined) and any artifact file's current content hash (after `preHashCleanup`) differs from the hash recorded in that approval's `artifactHashes`, `ValidateArtifacts` must collect the artifact type IDs of all drifted artifacts and call `change.invalidate('artifact-change', actor, driftedArtifactIds)` before proceeding with validation. This rolls the change back to `designing`, records the invalidation in history, and selectively resets only the drifted artifacts and their downstream dependents — upstream artifacts remain validated.

Approval hash keys use the `type:key` format (e.g. `"proposal:proposal"`, `"specs:default:auth/login"`), where `type` is the artifact type ID and `key` is the file key within that artifact.

The same check applies to active signoff (`change.activeSignoff`): if any artifact's current hash differs from what was recorded in `activeSignoff.artifactHashes`, `change.invalidate('artifact-change', actor, driftedArtifactIds)` must be called.

A single invalidation call is made per `execute` invocation even if multiple artifacts have changed — all drifted artifact IDs are collected first, then a single `invalidate()` call is made with the full set of drifted IDs.

### Requirement: Per-file validation

If the artifact file does not exist in the change directory and the artifact is not optional, validation MUST record a failure before skipping. Only optional artifacts may be silently skipped when their file is missing.

### Requirement: Delta validation

If the schema artifact declares `deltaValidations[]` and a delta file exists for the artifact at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`, `ValidateArtifacts` must validate the delta file before attempting application.

**No-op delta bypass:** If the parsed delta entries consist exclusively of `no-op` operations, `ValidateArtifacts` MUST skip `deltaValidations`, delta application preview, and structural validation entirely. Instead, it proceeds directly to hash computation and `markComplete` using the raw delta file content. This is because `no-op` declares that the existing artifact content is already valid — there are no operations to validate or apply.

For non-no-op deltas, the delta file is parsed by the YAML adapter to produce a normalized YAML AST. Each `deltaValidations` rule is then evaluated against this AST using the same algorithm as structural validation (see Requirement: Structural validation), with the delta AST as the document root.

For each rule in `deltaValidations[]`, apply the rule evaluation algorithm (identical for both `validations` and `deltaValidations`; only the document root differs):

1. Select candidate nodes from the document root using one of:
   - **Selector fields** (`type`, `matches`, `contains`, `parent`, `index`, `where`): apply the selector model defined in [`specs/core/selector-model/spec.md`](../selector-model/spec.md) against the AST.
   - **`path`** (JSONPath string): evaluate the JSONPath expression against the document root.
2. If zero nodes are selected: if `required: true`, record a failure; if `required: false`, record a warning. Skip `children` and `contentMatches` evaluation.
3. If one or more nodes are selected: for each matched node:
   - If `contentMatches` is present: call `parser.renderSubtree(node)` to serialize the subtree to its native format, then test the regex against the result. A non-matching node records a failure.
   - Evaluate any `children` rules recursively, using the matched node as the document root.

A rule passes vacuously when zero nodes are selected. If any `required: true` delta validation rule fails, the artifact is not advanced to the delta application preview step — the failure is reported immediately.

### Requirement: Delta application preview and conflict detection

For artifacts with `delta: true` and an existing base spec in `SpecRepository`:

1. Load the base artifact file from `SpecRepository` using the spec path and artifact filename.
2. Load the delta file from the change directory at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`.
3. Resolve the `ArtifactParser` adapter for `artifact.format`.
4. Call `parser.parse(baseContent)` to produce the base AST.
5. Call `parser.apply(baseAST, deltaEntries)` to produce the merged AST.
6. If `apply` throws `DeltaApplicationError`, record it as a validation failure and do not proceed to `validations[]` or `markComplete`.

**No-op bypass:** When the delta contains only `no-op` entries, steps 1–6 are skipped entirely. The delta application preview is not needed because `no-op` produces no changes. `ValidateArtifacts` proceeds directly to hash computation on the raw delta file content.

The merged AST (from `parser.serialize(mergedAST)`) is used for `validations[]` checks. The base spec in `SpecRepository` is **not modified** — archive is the step that writes the merged content.

For artifacts without a delta file (new files being created in the change), `ValidateArtifacts` validates the artifact content directly against `validations[]`.

### Requirement: Structural validation

After a successful delta application preview (or for non-delta artifacts), `ValidateArtifacts` runs all rules in the artifact's `validations[]` against the merged (or direct) content:

1. Parse the content via `ArtifactParser.parse()` to produce a normalized AST (if not already parsed during delta application preview).
2. For each rule in `validations[]`, apply the rule evaluation algorithm: select nodes using selector fields or `path`; if zero nodes matched, record failure or warning per `required` and skip `children`/`contentMatches`; for each matched node, evaluate `contentMatches` against the serialized subtree (`parser.renderSubtree(node)`), then evaluate `children` rules recursively with that node as root.

`ValidateArtifacts` collects all failures and warnings for the artifact before moving on — it does not stop at the first failure.

**No-op bypass:** When the delta contains only `no-op` entries, structural validation is skipped. The `no-op` operation declares that the existing artifact content is already valid, so re-validating the base content against `validations[]` is not required.

### Requirement: MetadataExtraction validation

After building the merged preview, `ValidateArtifacts` MUST also validate the extracted metadata:

1. Get `schema.metadataExtraction()`
2. If defined, call `extractMetadata(extraction, astsByArtifact, renderers, transforms, artifactType.id)`
3. Validate result against `strictSpecMetadataSchema`
4. If validation fails, record as validation failure

The extracted metadata is validated ONLY for the artifact being validated — not all artifacts.

### Requirement: Hash computation and markComplete

If all delta validations, conflict detection, and structural validations pass for a file within an artifact, `ValidateArtifacts` must:

1. Compute the cleaned hash: apply each `preHashCleanup` substitution in declaration order to the raw file content (not the merged content), then compute SHA-256 of the result.
2. Call `change.getArtifact(type).markComplete(key, cleanedHash)` on the corresponding `ChangeArtifact`, where `key` is the file key (artifact type id for `scope: change`, spec ID for `scope: spec`).

If any validation step fails, `markComplete` must not be called for that file.

### Requirement: Result shape

`ValidateArtifacts.execute` must return a result object — it must not throw for validation failures. The result must include:

- `passed: boolean` — `true` only if all required artifacts are present and all validations pass with no errors
- `failures: ValidationFailure[]` — one entry per failed rule, missing artifact, or `DeltaApplicationError`
- `warnings: ValidationWarning[]` — one entry per `required: false` rule that was absent

Each `ValidationFailure` must include the artifact ID, the rule or error description, and enough context for the CLI to produce a useful error message.

### Requirement: Save after validation

After all artifacts have been evaluated, `ValidateArtifacts` MUST persist any `markComplete` calls (updated `validatedHash` values), invalidation events appended to history, and `setSpecDependsOn` updates through `ChangeRepository.mutate(name, fn)` rather than through an unsynchronized `get() -> save()` sequence.

The mutation callback MUST operate on the fresh persisted `Change` instance provided by `mutate()`. All change-state mutations performed by validation — including approval invalidation, artifact completion, and dependency extraction side effects — MUST happen against that fresh instance before the repository persists it.

The mutation MUST still persist partial progress when some artifacts fail. Validation returns a result object rather than rolling back successful `markComplete` updates for other artifacts.

### Requirement: MetadataExtraction validation failures are validation failures

If metadataExtraction validation fails, `ValidateArtifacts` MUST record the failure in `result.failures` with the artifact ID. The artifact is NOT marked complete.

## Constraints

- `ValidateArtifacts` is the **only** code path that may call `Artifact.markComplete(hash)` — enforced by convention and test coverage
- The merged spec is never written to `SpecRepository` during validate — only during `ArchiveChange`
- `change.invalidate('artifact-change', actor)` is called at most once per `execute` invocation, even if multiple artifacts have changed
- `deltaValidations` evaluate rules against the normalized YAML AST of the delta file; `validations` evaluate rules against the normalized artifact AST; both use the same rule evaluation algorithm
- `validations` run against the merged artifact content (or direct content for non-delta artifacts)
- `preHashCleanup` substitutions are applied only for hash computation, never to the actual file content on disk
- A missing `deltaValidations[]` is not an error — the step is skipped
- A missing `validations[]` is not an error — the step is skipped
- A missing delta file for a `delta: true` artifact is not itself a validation error — the artifact may be new (no existing base spec to delta against); in that case, validate the artifact file directly against `validations[]`

### Requirement: Automatic dependsOn extraction

After successfully validating a `scope: spec` artifact, the use case extracts `dependsOn` from the validated content using the schema's `metadataExtraction` declarations. For delta artifacts, the extraction runs against the **merged** content (base + delta), ensuring dependencies added via deltas are captured.

The extraction uses `extractMetadata` with the artifact's AST, then resolves raw paths to full spec IDs via `SpecRepository.resolveFromPath`. If dependencies are found, they are registered on the change via `change.setSpecDependsOn(specId, deps)`.

This removes the need for agents or users to manually call `change deps --add` — the system extracts dependencies from the artifact content that was already written.

Extraction only runs when:

- The artifact is `scope: spec`
- The schema declares `metadataExtraction.dependsOn` targeting this artifact type
- The artifact passed validation (no failures)

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, artifact model, approval invalidation, `effectiveStatus`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — artifact definition, `validations[]`, `deltaValidations[]`, `delta`, `format`, `preHashCleanup`
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, delta file location
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector fields used in `validations[]` and `deltaValidations[]`
- [`specs/core/storage/spec.md`](../storage/spec.md) — `ValidateArtifacts` is the sole path to `complete`; artifact status derivation
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for spec IDs
