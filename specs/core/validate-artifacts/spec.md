# ValidateArtifacts

## Overview

`ValidateArtifacts` is the application use case that checks a change's artifact files against the active schema and marks them complete. It is the only path through which an artifact may reach `complete` status. It enforces required artifacts, validates structural rules, detects delta conflicts, and invalidates any outstanding approval when artifact content has changed since the approval was recorded.

## Requirements

### Requirement: Ports and constructor

`ValidateArtifacts` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaRegistry`, `ArtifactParserRegistry`, `VcsAdapter`, `schemaRef`, and `workspaceSchemasPaths`.

```typescript
class ValidateArtifacts {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    parsers: ArtifactParserRegistry,
    git: VcsAdapter,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  )
}
```

`schemaRef` is the schema reference string from `specd.yaml`. `workspaceSchemasPaths` is the resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`. Both are injected at kernel composition time, not passed per invocation.

`specs` is keyed by workspace name. When loading a base spec for delta application preview, `ValidateArtifacts` looks up the `SpecRepository` for the spec ID's workspace. `ArtifactParserRegistry` maps format names to `ArtifactParser` adapters and is used for both `deltaValidations` checks and delta application preview.

### Requirement: Input

`ValidateArtifacts.execute` receives:

- `name` — the change name to validate
- `specPath` — the spec ID to validate (one spec per execution); must be one of the IDs in `change.specIds`

Validating all specs in a change requires calling `execute` once per spec ID. Use cases that need to validate all specs call `execute` in a loop.

### Requirement: Schema name guard

After resolving the schema from config, `ValidateArtifacts` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before any validation or artifact processing.

### Requirement: Required artifacts check

Before validating structure, `ValidateArtifacts` must verify that all non-optional artifact IDs are present in the change (status not `missing`). Optional artifacts with status `skipped` (`validatedHash === "__skipped__"`) are considered resolved and do not cause a failure. If any non-optional artifact is absent, `ValidateArtifacts` must return a failure result listing the missing artifact IDs. It must not throw — missing required artifacts are a validation failure, not an error.

### Requirement: Dependency order check

Before validating an artifact, `ValidateArtifacts` must check that all artifact IDs in its `requires` list are either `complete` or `skipped` (via `change.effectiveStatus(type)`). If a required dependency is neither `complete` nor `skipped`, validation of the dependent artifact is skipped and reported as a dependency-blocked failure. A `skipped` optional artifact satisfies the dependency. `skipped` artifacts are not validated — there is no file to check.

### Requirement: Approval invalidation on content change

If the change has an active spec approval (`change.activeSpecApproval` is defined) and any artifact file's current content hash (after `preHashCleanup`) differs from the hash recorded in that approval's `artifactHashes`, `ValidateArtifacts` must call `change.invalidate('artifact-change', actor)` before proceeding with validation. This rolls the change back to `designing` and records the invalidation in history.

The same check applies to active signoff (`change.activeSignoff`): if any artifact's current hash differs from what was recorded in `activeSignoff.artifactHashes`, `change.invalidate('artifact-change', actor)` must be called.

A single invalidation call is made per `execute` invocation even if multiple artifacts have changed — the first hash mismatch triggers invalidation and the remaining artifacts are checked against the now-cleared approval state.

### Requirement: Delta validation

If the schema artifact declares `deltaValidations[]` and a delta file exists for the artifact at `deltas/<workspace>/<capability-path>/<filename>.delta.yaml`, `ValidateArtifacts` must validate the delta file before attempting application.

The delta file is parsed by the YAML adapter to produce a normalized YAML AST. Each `deltaValidations` rule is then evaluated against this AST using the same algorithm as structural validation (see Requirement: Structural validation), with the delta AST as the document root.

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

The merged AST (from `parser.serialize(mergedAST)`) is used for `validations[]` checks. The base spec in `SpecRepository` is **not modified** — archive is the step that writes the merged content.

For artifacts without a delta file (new files being created in the change), `ValidateArtifacts` validates the artifact content directly against `validations[]`.

### Requirement: Structural validation

After a successful delta application preview (or for non-delta artifacts), `ValidateArtifacts` runs all rules in the artifact's `validations[]` against the merged (or direct) content:

1. Parse the content via `ArtifactParser.parse()` to produce a normalized AST (if not already parsed during delta application preview).
2. For each rule in `validations[]`, apply the rule evaluation algorithm: select nodes using selector fields or `path`; if zero nodes matched, record failure or warning per `required` and skip `children`/`contentMatches`; for each matched node, evaluate `contentMatches` against the serialized subtree (`parser.renderSubtree(node)`), then evaluate `children` rules recursively with that node as root.

`ValidateArtifacts` collects all failures and warnings for the artifact before moving on — it does not stop at the first failure.

### Requirement: Hash computation and markComplete

If all delta validations, conflict detection, and structural validations pass for an artifact, `ValidateArtifacts` must:

1. Compute the cleaned hash: apply each `preHashCleanup` substitution in declaration order to the artifact file content, then compute SHA-256 of the result.
2. Call `change.getArtifact(type).markComplete(cleanedHash)` on the corresponding `ChangeArtifact`.

If any validation step fails, `markComplete` must not be called for that artifact.

### Requirement: Result shape

`ValidateArtifacts.execute` must return a result object — it must not throw for validation failures. The result must include:

- `passed: boolean` — `true` only if all required artifacts are present and all validations pass with no errors
- `failures: ValidationFailure[]` — one entry per failed rule, missing artifact, or `DeltaApplicationError`
- `warnings: ValidationWarning[]` — one entry per `required: false` rule that was absent

Each `ValidationFailure` must include the artifact ID, the rule or error description, and enough context for the CLI to produce a useful error message.

### Requirement: Save after validation

After all artifacts have been evaluated, `ValidateArtifacts` must call `changeRepository.save(change)` to persist any `markComplete` calls (updated `validatedHash` values) and any invalidation events appended to history. The save must happen even if some artifacts failed — partial progress must be persisted.

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

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, artifact model, approval invalidation, `effectiveStatus`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — artifact definition, `validations[]`, `deltaValidations[]`, `delta`, `format`, `preHashCleanup`
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `apply()`, `DeltaApplicationError`, delta file location
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector fields used in `validations[]` and `deltaValidations[]`
- [`specs/core/storage/spec.md`](../storage/spec.md) — `ValidateArtifacts` is the sole path to `complete`; artifact status derivation
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format for spec IDs
