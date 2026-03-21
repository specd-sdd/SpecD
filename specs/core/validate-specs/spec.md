# Validate Specs

## Purpose

Spec artifacts can drift from the schema's structural expectations over time, and there is no other mechanism to catch these violations before they cause downstream failures. The `ValidateSpecs` use case validates spec artifacts against the active schema's structural rules, supporting three scoping modes: a single spec by qualified path, all specs in a workspace, or all specs across all workspaces. Only spec-scoped artifact types from the schema are validated; change-scoped artifacts are excluded.

## Requirements

### Requirement: Resolve the active schema

The use case SHALL obtain the schema via `SchemaProvider.get()`. If the schema cannot be resolved (returns `null`), the use case MUST throw a `SchemaNotFoundError`.

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
4. If the file exists and the artifact type has no validation rules, skip.
5. If the file exists and has rules: infer the format (from `artifactType.format` or filename), obtain the parser from `ArtifactParserRegistry`, parse the content into an AST, and evaluate the schema's validation rules via `evaluateRules`.

### Requirement: Aggregated result

The use case SHALL return a `ValidateSpecsResult` containing:

- `entries` — array of `SpecValidationEntry` objects, one per validated spec.
- `totalSpecs` — total number of specs validated.
- `passed` — number of specs with zero failures.
- `failed` — number of specs with one or more failures.

Each `SpecValidationEntry` MUST include:

- `spec` — qualified label in `workspace:capabilityPath` format.
- `passed` — `true` if `failures` is empty.
- `failures` — array of `ValidationFailure` objects.
- `warnings` — array of `ValidationWarning` objects.

### Requirement: Format inference and parser resolution

When an artifact type does not specify an explicit `format`, the use case SHALL infer it from the filename via `inferFormat`. If no parser is found for the resolved format, the artifact MUST be skipped without recording a failure or warning.

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- `input.specPath` takes precedence: when provided, `input.workspace` is ignored.
- Validation rules come exclusively from the resolved schema — the use case does not define its own rules.
- The `ValidationFailure` and `ValidationWarning` types are shared with the `ValidateArtifacts` use case.

## Spec Dependencies

- [`specs/core/validate-artifacts/spec.md`](../validate-artifacts/spec.md) — shared `ValidationFailure` and `ValidationWarning` types, `evaluateRules` behaviour
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — schema structure, artifact types, and scope semantics
- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` contract
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace resolution
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — `parseSpecId` behaviour
