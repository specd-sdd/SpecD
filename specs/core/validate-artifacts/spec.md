# ValidateArtifacts

## Purpose

Artifacts must be structurally valid and conflict-free before a change can progress, yet no other code path is allowed to mark an artifact complete — a single chokepoint is needed to enforce this invariant. `ValidateArtifacts` is that chokepoint: it checks a change's artifact files against the active schema, enforces required artifacts, validates structural rules, detects delta conflicts, invalidates any outstanding approval when content has changed, and is the only path through which an artifact may reach `complete` status.

## Requirements

### Requirement: Ports and constructor

`ValidateArtifacts` receives at construction time: `ChangeRepository`, `ListWorkspaces`, `SchemaProvider`, `ArtifactParserRegistry`, `ActorResolver`, `ContentHasher`, `ExtractorTransformRegistry`, and `SpecWorkspaceRoute[]`.

```typescript
class ValidateArtifacts {
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    actor: ActorResolver,
    hasher: ContentHasher,
    extractorTransforms: ExtractorTransformRegistry,
    workspaceRoutes: readonly SpecWorkspaceRoute[],
  )
}
```

Workspace lookup uses `ListWorkspaces`, not a `ReadonlyMap` of `SpecRepository` on the use case. `SchemaProvider` is a lazy, caching port that returns the fully-resolved schema. DAG interpretation uses `evaluateLifecycleVerdict` with empty `checksByTarget` (imported as a module function, not a constructor dependency). Structural validation, delta preview, metadata extraction, and artifact completion remain owned by `ValidateArtifacts`.

### Requirement: Input

`ValidateArtifactsInput.specPath` is optional when validating `scope: change` artifacts. For `scope: change` artifacts (like `design`, `tasks`), the artifact is uniquely identified by its artifact ID alone — there is no ambiguity about which spec it belongs to.

For `scope: spec` artifacts, `specPath` is still required because the same artifact type (e.g., `specs`) exists for multiple specs.

When `specPath` is omitted for a `scope: change` artifact, `ValidateArtifacts` MUST NOT require membership in `change.specIds` for routing; it MUST validate the change-scoped artifact files for the requested `artifactId` only.

When `specPath` is provided and the artifact is `scope: change`, the specPath is ignored — the artifact ID is sufficient.

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `ValidateArtifacts` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`. This MUST happen before any artifact validation logic.

### Requirement: Required artifacts check

Before validating structure, `ValidateArtifacts` must verify that all non-optional artifact IDs are present in the change (status not `missing`). Optional artifacts with status `skipped` (`validatedHash === "__skipped__"`) are considered resolved and do not cause a failure. If any non-optional artifact is absent, `ValidateArtifacts` must return a failure result listing the missing artifact IDs. It must not throw — missing required artifacts are a validation failure, not an error.

This check is skipped when `artifactId` is provided — single-artifact validation does not enforce completeness of the full artifact set.

### Requirement: Dependency order check

Before validating an artifact, `ValidateArtifacts` must check that all artifact IDs in its `requires` list are either `complete` or `skipped`.

The dependency-aware status lookup SHALL be interpreted through `evaluateLifecycleVerdict` (empty `checksByTarget`), since recursive parent blocking and schema DAG semantics do not belong on the `Change` entity. If a required dependency is neither `complete` nor `skipped`, validation of the dependent artifact is skipped and reported as a dependency-blocked failure. A `skipped` optional artifact satisfies the dependency. `skipped` artifacts are not validated — there is no file to check.

When `ValidateArtifacts` validates more than one artifact or file in a single `execute` invocation (including batch drivers and full-artifact passes), it MUST call `evaluateLifecycleVerdict` once at execute start (empty `checksByTarget`) and then patch the in-memory DAG verdict after each successful completion (`markVerdictComplete` or equivalent) so later artifacts in topological order observe the parent as `complete`. It MUST NOT persist-and-re-evaluate between files. That in-memory patch MUST NOT re-walk the recursive pending-parent-artifact-review cascade.

Dependency-blocked failures MUST include the dependency artifact ID and its effective status as observed at validation time.

When the dependency status is `pending-parent-artifact-review`, the failure description MUST also include the upstream parent blocker context (artifact ID and status) when available from recursive blocker resolution.

For blockers outside review-propagation (`missing` and `in-progress`), the failure description MUST still include the dependency status and MUST NOT degrade to generic "incomplete dependency" wording.

`pending-review` and `drifted-pending-review` are review blockers. For these statuses, the failure description MUST present them as review-state blockers (not generic incompleteness) and MUST include the status explicitly.

### Requirement: Artifact traversal order

When `ValidateArtifacts` validates multiple artifacts in one `execute` invocation without a single `artifactId` filter, it MUST iterate artifacts in `schema.artifactDag().topologicalOrder()`.

When `artifactId` is provided but the invocation still validates all tracked files for that artifact type across the change (for example CLI batch `--all --artifact`), the outer driver MUST still respect `topologicalOrder()` for artifact-type steps; within each artifact type, spec-scoped files follow the change's `specIds` order.

### Requirement: Complete and skipped file bypass

For each tracked artifact file considered by structural validation, if the file's canonical persisted status is `complete` or `skipped`, `ValidateArtifacts` MUST NOT re-read the file for structure/delta, MUST NOT re-run structural validation or delta preview for that file, and MUST NOT invoke `markComplete` again for that file.

Files in review or drift states (`pending-review`, `drifted-pending-review`, and any other non-terminal canonical state except `missing` when no file exists) MUST still be validated when selected by the invocation.

Baseline `validatedHash` vs disk is not this use case (see [`core:storage`](../storage/spec.md)). Approval/signoff hash comparison (Requirement: Approval invalidation on content change) still scans non-`missing` / non-`skipped` files, including `complete`, when those gates are active.

### Requirement: Approval invalidation on content change

`ValidateArtifacts.execute` MUST load the change through `ChangeRepository.get` first. Load-time baseline drift (if any) has already been applied by the repository.

If the change has an active spec approval (`change.activeSpecApproval` is defined) or an active signoff (`change.activeSignoff` is defined), `ValidateArtifacts` MUST compare each non-`missing` / non-`skipped` file's current content hash (after `preHashCleanup`) to the hash recorded in that record's `artifactHashes`.

That consent-hash scan MUST iterate every artifact in `schema.artifacts()`, not only the `artifactId` being structurally validated. `artifactId` limits structural validation and `markComplete`; it MUST NOT skip consent comparison for other artifact types. Complete files are included in this scan even though structural validation bypasses them.

Approval hash keys use the `type:key` format (e.g. `"proposal:proposal"`, `"specs:default:auth/login"`), where `type` is the artifact type ID and `key` is the file key within that artifact.

When no active approval and no active signoff exist, this scan MUST NOT run and MUST NOT call `Change.invalidate`.

A single invalidation call is made per `execute` invocation even if multiple consent hashes mismatch. That call uses cause `artifact-drift`, the `ActorResolver` identity (not `SYSTEM_ACTOR`), and a focused grouped payload of mismatching artifact/file keys. `Change.invalidate` applies the change's invalidation policy.

### Requirement: Policy-aware drift materialization

`ValidateArtifacts` MUST NOT compare current disk content to `validatedHash` in order to detect baseline artifact drift, MUST NOT mark `hasDrift` for that reason, and MUST NOT call `Change.invalidate` for content/absence mismatch against the validated baseline.

That comparison and invalidation belong to `ChangeRepository` load when artifact types are resolved ([`core:storage`](../storage/spec.md)). By the time `ValidateArtifacts.execute` runs, `get()` has already performed that step for the fs adapter.

Policy `none` vs reopen is the `Change` entity's invalidation policy on whatever caller invoked `invalidate`. It is not a second drift detector inside this use case.

### Requirement: Per-file validation

If the expected artifact file does not exist in the change directory and the artifact is required, validation SHALL treat the canonical file state as `missing`.

File presence and canonical file state MUST be established before any interpretation of `validatedHash`. Whether a previously validated missing file carries `hasDrift` is decided at repository load ([`core:storage`](../storage/spec.md)), not by this use case.

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
2. If defined, call `extractMetadata(extraction, astsByArtifact, renderers, transforms, transformContext, artifactType.id)` so only fields sourced from the artifact under validation are extracted
3. Validate the result against `permissiveSpecMetadataSchema` (shape of fields that are present)
4. If validation fails, record it as a validation failure

`strictSpecMetadataSchema` is the write schema for a complete `metadata.json`. It MUST NOT be used here.

Metadata fields are bound to artifacts (`field.artifact`). A multi-file spec MAY be validated one artifact at a time. Title, description, or `contentHashes` MAY be produced only by an artifact that does not exist yet. Extraction for the current `artifactType.id` is therefore a partial bag. Completeness belongs to persist/archive, not per-artifact validate.

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

### Requirement: Config-based factory delegates through resolveValidateArtifactsDeps

The config-based `createValidateArtifacts(config, options?)` form MUST derive `ValidateArtifactsDeps` through `resolveValidateArtifactsDeps(resolver)` and then delegate to canonical `createValidateArtifacts(deps)`.

`resolveValidateArtifactsDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `actor: ActorResolver`
- `contentHasher: ContentHasher`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`

It MUST NOT resolve `lifecycle` or `LifecycleEngine`.

The constructor parameter remains `hasher`. The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

### Requirement: DAG lifecycle from evaluateLifecycleVerdict

When `ValidateArtifacts` needs DAG-aware artifact status or next-artifact order, it MUST call `evaluateLifecycleVerdict` with empty `checksByTarget` (see [`core:lifecycle-engine`](../lifecycle-engine/spec.md)). That path SHALL use `projectArtifacts` / topological order only. It MUST NOT run hop predicates (`executeChecksByLegalTargets` / matching `execute` for legal targets).

It MUST NOT gather a global snapshot bag. `gatherPredicateSnapshots` MUST NOT exist as a use-case step.

### Requirement: Change must exist

When `ChangeRepository.get(name)` returns `null`, `ValidateArtifacts.execute` MUST throw `ChangeNotFoundError` before running validation. It MUST NOT return a validation result object for a missing change.

## Constraints

- ValidateArtifacts is the only code path that may call Artifact.markComplete(hash) — enforced by convention and test coverage
- The merged spec is never written to SpecRepository during validate — only during ArchiveChange
- Baseline `validatedHash` vs disk drift is owned by `ChangeRepository` load ([`core:storage`](../storage/spec.md)), not by this use case
- When active approval or signoff hashes mismatch, ValidateArtifacts calls `change.invalidate('artifact-drift', actor, ...)` at most once per execute, with a focused artifact/file payload
- deltaValidations evaluate rules against the normalized YAML AST of the delta file; validations evaluate rules against the normalized artifact AST; both use the same rule evaluation algorithm
- validations run against the merged artifact content (or direct content for non-delta artifacts)
- preHashCleanup substitutions are applied only for hash computation, never to the actual file content on disk
- A missing deltaValidations\[] is not an error — the step is skipped
- A missing validations\[] is not an error — the step is skipped
- A missing expected delta file for an existing spec with a delta: true artifact is a validation failure; direct files under specs/... are valid only for new specs or non-delta artifacts
- When `ChangeRepository.get(name)` returns null, `ValidateArtifacts.execute` MUST throw `ChangeNotFoundError` before validation (distinct from returning `passed: false` for validation failures)

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:change-layout`](../change-layout/spec.md)
- [`core:change-manifest`](../change-manifest/spec.md)
- [`core:lifecycle-engine`](../lifecycle-engine/spec.md)
- [`core:delta-format`](../delta-format/spec.md)
- [`core:selector-model`](../selector-model/spec.md)
- [`core:storage`](../storage/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
- [`core:transition-checks`](../transition-checks/spec.md) — no snapshot bag; hop predicates are not this use case
