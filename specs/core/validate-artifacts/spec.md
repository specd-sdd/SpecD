# ValidateArtifacts

## Purpose

Artifacts must be structurally valid and conflict-free before a change can progress, yet no other code path is allowed to mark an artifact complete — a single chokepoint is needed to enforce this invariant. `ValidateArtifacts` is that chokepoint: it checks a change's artifact files against the active schema, enforces required artifacts, validates structural rules, detects delta conflicts, invalidates any outstanding approval when content has changed, and is the only path through which an artifact may reach `complete` status.

## Requirements

### Requirement: Ports and constructor

`ValidateArtifacts` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, `ArtifactParserRegistry`, `ExtractorTransformRegistry`, `ActorResolver`, `ContentHasher`, `LifecycleEngine`, and `SpecWorkspaceRoute[]`.

```typescript
class ValidateArtifacts {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    extractorTransforms: ExtractorTransformRegistry,
    actor: ActorResolver,
    hasher: ContentHasher,
    lifecycle: LifecycleEngine,
    workspaceRoutes: readonly SpecWorkspaceRoute[],
  )
}
```

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

`ArtifactParserRegistry` resolves the parser used to validate concrete artifact content. `ExtractorTransformRegistry` is the shared runtime registry for metadata extraction transforms; `ValidateArtifacts` uses it when validating extracted metadata from merged spec content. `SpecWorkspaceRoute[]` provides the workspace-routing metadata needed to build extraction contexts for transforms that resolve spec references.

`ActorResolver` supplies the identity recorded on approval invalidation events. `ContentHasher` is used both for approval drift detection and for the cleaned hashes persisted when validation succeeds. `LifecycleEngine` is used only for schema-aware dependency interpretation; structural validation, delta preview, metadata extraction, and artifact completion remain owned by `ValidateArtifacts`.

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

Before validating an artifact, `ValidateArtifacts` must check that all artifact IDs in its `requires` list are either `complete` or `skipped`.

The dependency-aware status lookup SHALL be interpreted through `LifecycleEngine`, since recursive parent blocking and schema DAG semantics do not belong on the `Change` entity. If a required dependency is neither `complete` nor `skipped`, validation of the dependent artifact is skipped and reported as a dependency-blocked failure. A `skipped` optional artifact satisfies the dependency. `skipped` artifacts are not validated — there is no file to check.

Dependency-blocked failures MUST include the dependency artifact ID and its effective status as observed at validation time.

When the dependency status is `pending-parent-artifact-review`, the failure description MUST also include the upstream parent blocker context (artifact ID and status) when available from recursive blocker resolution.

For blockers outside review-propagation (`missing` and `in-progress`), the failure description MUST still include the dependency status and MUST NOT degrade to generic "incomplete dependency" wording.

`pending-review` and `drifted-pending-review` are review blockers. For these statuses, the failure description MUST present them as review-state blockers (not generic incompleteness) and MUST include the status explicitly.

### Requirement: Approval invalidation on content change

If the change has an active spec approval (`change.activeSpecApproval` is defined) and any artifact file's current content hash (after `preHashCleanup`) differs from the hash recorded in that approval's `artifactHashes`, `ValidateArtifacts` must collect the full set of drifted files before proceeding.

Approval hash keys use the `type:key` format (e.g. `"proposal:proposal"`, `"specs:default:auth/login"`), where `type` is the artifact type ID and `key` is the file key within that artifact.

The same check applies to active signoff (`change.activeSignoff`): if any artifact file's current hash differs from what was recorded in `activeSignoff.artifactHashes`, the validation pass identifies that file as drifted.

A single invalidation call is made per `execute` invocation even if multiple files drift. Before that call, `ValidateArtifacts` MUST:

1. Scan every candidate file and collect all drifted file keys grouped by artifact type.
2. Mark each drifted file as `drifted-pending-review`.
3. Recompute the affected parent artifact states.
4. Invalidate the change with a single structured invalidation covering the full grouped set.

That invalidation rolls the change back to `designing`, preserves `drifted-pending-review` on the drifted files, and downgrades the remaining files to `pending-review` as part of the redesign pass.

### Requirement: Policy-aware drift materialization

When ValidateArtifacts compares the current file state to the validated baseline, it SHALL treat any mismatch as drift evidence for that file. This includes changed content and file absence.

For drift handling, ValidateArtifacts SHALL:

1. collect the focused set of mismatching files grouped by artifact type
2. preserve canonical `missing` when a file is absent rather than forcing a drift-derived canonical state
3. call `Change.invalidate()` exactly once per execution with cause `artifact-drift` and the focused grouped payload
4. rely on the `Change` entity to apply the effective invalidation policy and materialize `hasDrift=true` for the affected files

Under policy `none`, ValidateArtifacts SHALL still detect and report mismatch, but artifact/file reopening is not materialized beyond canonical file-state rules such as `missing`.

### Requirement: Per-file validation

If the expected artifact file does not exist in the change directory and the artifact is required, validation SHALL treat the canonical file state as `missing`.

File presence and canonical file state MUST be established before any interpretation of `validatedHash`.

A missing file MAY still imply `hasDrift=true` because the current file state no longer matches the validated baseline, but it MUST NOT surface as `complete-with-drift` because the canonical state is no longer `complete`.

For spec-scoped artifacts, the expected file is determined by Requirement: Expected file path validation.

### Requirement: Expected file path validation

Before validating a file for a spec-scoped artifact, `ValidateArtifacts` MUST determine the artifact's expected change-directory path using the target spec's existence and the schema artifact's delta capability.

For an existing spec with a delta-capable artifact, the expected path is `deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml`. `ValidateArtifacts` MUST validate that delta file and MUST NOT accept a direct artifact file at `specs/<workspace>/<capability-path>/<artifact-filename>` as a fallback.

For a new spec, the expected path is `specs/<workspace>/<capability-path>/<artifact-filename>`. In that case `ValidateArtifacts` MUST validate the direct artifact file and MUST NOT require a delta.

For change-scoped artifacts, the expected path remains the artifact output basename at the change directory root.

If the expected file does not exist and the artifact is not optional, validation MUST record a failure that includes the expected file path. The file MUST NOT be marked complete.

### Requirement: Delta eligibility uses artifact-level base existence

For a delta-capable spec-scoped artifact, delta eligibility MUST be decided at the concrete artifact-file level, not by a coarse "the spec exists" check.

A spec having one existing artifact file (for example `spec.md`) MUST NOT make a different artifact file (for example `verify.md`) delta-eligible unless that specific base artifact file already exists in the target spec repository.

When the concrete base artifact file is absent, validation MUST treat a delta file for that artifact as invalid even if some other artifact file already exists for the same spec ID.

### Requirement: Invalid mixed representation for new specs

When a spec is new to the target repository, `ValidateArtifacts` MUST reject any artifact representation that mixes direct `specs/...` files with delta-backed files for the same new spec unless the concrete base artifact exists for each delta-backed artifact.

For a new spec:

- direct `specs/...` files are valid
- delta files are valid only when the concrete target base artifact already exists for that artifact file

A new spec with `spec.md` authored directly under `specs/...` and `verify.md` authored as a delta without an existing base `verify.md` MUST fail validation before archive.

### Requirement: Delta validation

If the schema artifact declares `deltaValidations[]` and a delta file exists for the artifact at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`, `ValidateArtifacts` must validate the delta file before attempting application.

**No-op delta bypass:** If the parsed delta entries consist exclusively of `no-op` operations, `ValidateArtifacts` MUST skip `deltaValidations`, delta application preview, and structural validation entirely. Instead, it proceeds directly to hash computation and `markComplete` using the raw delta file content. This is because `no-op` declares that the existing artifact content is already valid — there are no operations to validate or apply.

For non-no-op deltas, the delta file is parsed by the YAML adapter to produce a normalized YAML AST. Each `deltaValidations` rule is then evaluated against this AST using the same algorithm as structural validation (see Requirement: Structural validation), with the delta AST as the document root.

For each rule in `deltaValidations[]`, apply the rule evaluation algorithm (identical for both `validations` and `deltaValidations`; only the document root differs):

1. Select candidate nodes from the document root using one of:
   - **Selector fields** (`type`, `matches`, `contains`, `parent`, `index`, `where`): apply the selector model defined in [`core:selector-model`](../selector-model/spec.md) against the AST.
   - **`path`** (JSONPath string): evaluate the JSONPath expression against the document root.
2. If zero nodes are selected: if `required: true`, record a failure; if `required: false`, record a warning. Skip `children` and `contentMatches` evaluation.
3. If one or more nodes are selected:
   - If the rule declares `count`, evaluate total cardinality (`exactly` or `min`/`max`) and, when declared, unique cardinality (`unique.by` with optional `minUnique`/`maxUnique`/`exactlyUnique`), recording failures for any mismatch.
   - For each matched node:
     - If `contentMatches` is present: call `parser.renderSubtree(node)` to serialize the subtree to its native format, then test the regex against the result. A non-matching node records a failure.
     - Evaluate any `children` rules recursively, using the matched node as the document root.

If any `required: true` delta validation rule fails, the artifact is not advanced to the delta application preview step — the failure is reported immediately.

### Requirement: Delta application preview and conflict detection

For artifacts with `delta: true` and an existing base spec in `SpecRepository`:

1. Load the base artifact file from `SpecRepository` using the spec path and artifact filename.
2. Load the expected delta file from the change directory at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`.
3. Resolve the `ArtifactParser` adapter for `artifact.format`.
4. Call `parser.parse(baseContent)` to produce the base AST.
5. Call `parser.apply(baseAST, deltaEntries)` to produce the merged AST.
6. If `apply` throws `DeltaApplicationError`, record it as a validation failure and do not proceed to `validations[]` or `markComplete`.

**No-op bypass:** When the expected delta contains only `no-op` entries, steps 1–6 are skipped entirely. The delta application preview is not needed because `no-op` produces no changes. `ValidateArtifacts` proceeds directly to hash computation on the raw delta file content.

The merged AST (from `parser.serialize(mergedAST)`) is used for `validations[]` checks. The base spec in `SpecRepository` is **not modified** — archive is the step that writes the merged content.

For new files being created in the change, `ValidateArtifacts` validates the expected direct artifact file under `specs/<workspace>/<capability-path>/<filename>` against `validations[]`.

### Requirement: Structural validation

After a successful delta application preview (or for non-delta artifacts), `ValidateArtifacts` runs all rules in the artifact's `validations[]` against the merged (or direct) content:

1. Parse the content via `ArtifactParser.parse()` to produce a normalized AST (if not already parsed during delta application preview).
2. For each rule in `validations[]`, apply the rule evaluation algorithm: select nodes using selector fields or `path`; if zero nodes matched, record failure or warning per `required` and skip `children`/`contentMatches`; if the rule declares `count`, evaluate total and unique cardinality constraints; for each matched node, evaluate `contentMatches` against the serialized subtree (`parser.renderSubtree(node)`), then evaluate `children` rules recursively with that node as root.

`ValidateArtifacts` collects all failures and warnings for the artifact before moving on — it does not stop at the first failure.

A locally valid parsed artifact output is the prerequisite input for Requirement: Cross-artifact structural validation.

**No-op bypass:** When the delta contains only `no-op` entries, structural validation is skipped. The `no-op` operation declares that the existing artifact content is already valid, so re-validating the base content against `validations[]` is not required.

### Requirement: Cross-artifact structural validation

After local artifact validation succeeds, `ValidateArtifacts` MUST evaluate any applicable `crossArtifactValidations` declared by the schema.

Applicability rules:

- only rules whose `scope` matches the artifact scope being validated are eligible
- only rules whose participants all belong to the same target spec and the same scope are eligible
- when `artifactId` is provided, only cross-artifact rules that reference that artifact are eligible for evaluation in that invocation

Participant readiness rules:

- a participant is ready only when its expected file exists, its local structural validation has already passed, and its parsed artifact output is available
- for `scope: spec`, the parsed artifact output MUST be the merged/materialized artifact preview produced by delta application or direct-file validation
- for `scope: change`, the parsed artifact output MUST come from the direct change artifact file
- when a participant is not being structurally validated in the current invocation, `ValidateArtifacts` MUST rehydrate it from the expected artifact content if that participant is already in `complete` state and the rule being evaluated requires it
- rehydration MUST reconstruct the same parsed/materialized output shape that the participant would have contributed if it had been validated in the current invocation
- `ValidateArtifacts` MUST NOT defer a rule solely because a required participant was validated in an earlier invocation, provided that participant can be rehydrated from its current complete artifact state

Evaluation rules:

1. Resolve each participant's `selector` against its artifact AST.
2. If the participant declares `keySelector`, resolve it relative to each node matched by the main `selector`; otherwise use the main selector matches directly as key-producing nodes.
3. Extract comparable keys using `key.from`, then apply any `capture` and `strip` normalization declared by the schema.
4. Evaluate the participant key collections using `relation.kind`, `relation.between`, and any operator-specific `relation.options`.

Relation semantics:

- `all-equal` compares all aliases named in `between`
- `subset` is directional: `between: [A, B]` means all keys from `A` MUST appear in `B`
- `superset` is directional: `between: [A, B]` means all keys from `B` MUST appear in `A`
- `relation.options.ordering: ignore` performs unordered comparison
- `relation.options.ordering: strict` performs ordered comparison; for `subset` and `superset`, strict ordering means relative-order preservation rather than exact positional alignment

If every participant required by a rule is ready, `ValidateArtifacts` MUST evaluate the rule and record any mismatch as a validation failure for the participating artifact set.

If one or more required participants are not ready yet, `ValidateArtifacts` MUST defer that cross-artifact rule for the current invocation and MUST surface a non-failing validation output entry explaining that the rule was not evaluated because all participants were not yet available as locally valid parsed outputs. Participants that are missing, not yet locally valid, or not rehydratable from complete state remain not ready for this purpose.

### Requirement: MetadataExtraction validation

After building the merged preview, `ValidateArtifacts` MUST also validate the extracted metadata:

1. Get `schema.metadataExtraction()`
2. If defined, call `extractMetadata(extraction, astsByArtifact, renderers, transforms, transformContext, artifactType.id)`
3. Validate the result against `strictSpecMetadataSchema`
4. If validation fails, record it as a validation failure

`transforms` is the shared extractor-transform registry assembled by kernel composition. `transformContext` is the caller-owned origin context bag for the artifact being validated. If a declared transform is unknown, or if a registered transform fails because its required context is absent or invalid, that failure is a validation failure for this artifact.

The extracted metadata is validated only for the artifact being validated — not for all artifacts.

### Requirement: Hash computation and markComplete

If all delta validations, conflict detection, and structural validations pass for a file within an artifact, `ValidateArtifacts` must:

1. Compute the cleaned hash: apply each `preHashCleanup` substitution in declaration order to the raw file content (not the merged content), then compute SHA-256 of the result.
2. Call `change.getArtifact(type).markComplete(key, cleanedHash)` on the corresponding `ChangeArtifact`, where `key` is the file key (artifact type id for `scope: change`, spec ID for `scope: spec`).

A successful completion sets the file state to `complete`, updates `validatedHash`, and recomputes the persisted aggregate artifact state.

If any validation step fails, `markComplete` must not be called for that file, and the file keeps its current non-complete state.

### Requirement: Result shape

`ValidateArtifacts.execute` must return a result object — it must not throw for validation failures. The result must include:

- `passed: boolean` — `true` only if all required artifacts are present and all validations pass with no errors
- `failures: ValidationFailure[]` — one entry per failed local rule, failed cross-artifact rule, missing artifact, or `DeltaApplicationError`
- `warnings: ValidationWarning[]` — one entry per `required: false` local rule that was absent and any non-failing deferred cross-artifact validation notice
- `files: ValidationFileResult[]` — one entry per artifact file considered by validation, including `artifactId`, `key`, `filename`, and whether the file was validated, skipped, or missing

Each `ValidationFailure` must include the artifact ID, the rule or error description, and enough context for the CLI to produce a useful error message. Missing-file failures MUST include the expected `filename`.

`ValidationFileResult.filename` MUST be the expected path used by validation. It MUST NOT report an alternate file path that was present but intentionally ignored.

### Requirement: Save after validation

After all artifacts have been evaluated, `ValidateArtifacts` MUST persist any `markComplete` calls (updated `validatedHash` values), invalidation events appended to history, and `setSpecDependsOn` updates through `ChangeRepository.mutate(name, fn)` rather than through an unsynchronized `get() -> save()` sequence.

The mutation callback MUST operate on the fresh persisted `Change` instance provided by `mutate()`. All change-state mutations performed by validation — including approval invalidation, artifact completion, and dependency extraction side effects — MUST happen against that fresh instance before the repository persists it.

The mutation MUST still persist partial progress when some artifacts fail. Validation returns a result object rather than rolling back successful `markComplete` updates for other artifacts.

### Requirement: MetadataExtraction validation failures are validation failures

If metadataExtraction validation fails, `ValidateArtifacts` MUST record the failure in `result.failures` with the artifact ID. The artifact is NOT marked complete.

### Requirement: In-change dependsOn persistence

When validation of a `scope: spec` artifact succeeds and metadata extraction yields a valid `dependsOn` value, `ValidateArtifacts` MUST persist that value into `change.specDependsOn` for the spec.

Validation rules for this update:

- The extracted value becomes the in-change dependency snapshot used by later workflow steps.
- If transform execution for extracted `dependsOn` fails, validation fails and the dependency snapshot is not updated.
- `ValidateArtifacts` MUST NOT fail solely because the current in-change `dependsOn` value differs from the canonical persisted `spec-lock.json` for that spec.
- Hard consistency checks between archive output and canonical sidecar state are reserved for `ArchiveChange`.

## Constraints

- ValidateArtifacts is the only code path that may call Artifact.markComplete(hash) — enforced by convention and test coverage
- The merged spec is never written to SpecRepository during validate — only during ArchiveChange
- ValidateArtifacts calls change.invalidate('artifact-drift', actor, ...) at most once per execute invocation, even if multiple files have drifted
- The drift invalidation payload is focused to the concrete mismatching artifact/files rather than an implicit global artifact set
- deltaValidations evaluate rules against the normalized YAML AST of the delta file; validations evaluate rules against the normalized artifact AST; both use the same rule evaluation algorithm
- validations run against the merged artifact content (or direct content for non-delta artifacts)
- preHashCleanup substitutions are applied only for hash computation, never to the actual file content on disk
- A missing deltaValidations\[] is not an error — the step is skipped
- A missing validations\[] is not an error — the step is skipped
- A missing expected delta file for an existing spec with a delta: true artifact is a validation failure; direct files under specs/... are valid only for new specs or non-delta artifacts

## Spec Dependencies

- [`core:change`](../change/spec.md) — change entity, approval invalidation, and artifact state
- [`core:change-layout`](../change-layout/spec.md) — expected file paths for new spec artifacts and delta artifacts
- [`core:change-manifest`](../change-manifest/spec.md) — persisted artifact filenames used by validation
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md) — schema-aware dependency interpretation and recursive blocker resolution
- [`core:schema-format`](../schema-format/spec.md) — artifact definition, validations, delta behavior, and pre-hash cleanup
- [`core:delta-format`](../delta-format/spec.md) — parser contract and delta application errors
- [`core:selector-model`](../selector-model/spec.md) — selector rules for validations and delta validations
- [`core:storage`](../storage/spec.md) — validation as the only path to `complete`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port-per-workspace and manual DI constraints
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec ID format for spec-scoped artifacts
