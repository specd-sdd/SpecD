# SaveSpecMetadata

## Purpose

Writing metadata to disk without validation risks corrupting the spec's machine-readable summary, and silently overwriting curated `dependsOn` entries can discard human-verified dependency decisions. `SaveSpecMetadata` guards against both: it validates incoming YAML content against the strict schema, protects curated `dependsOn` from silent overwrite, delegates conflict detection to the repository layer, and persists the metadata via `SpecRepository.saveMetadata()`. It is invoked by `ArchiveChange` during deterministic metadata generation and may also be called directly by tooling (e.g. the LLM refining metadata).

## Requirements

### Requirement: Input contract

`SaveSpecMetadata.execute()` accepts a `SaveSpecMetadataInput` with the following fields:

- `workspace` (string, required) — the workspace name (e.g. `'default'`, `'billing'`)
- `specPath` (SpecPath, required) — the spec path within the workspace (e.g. `'auth/oauth'`)
- `content` (string, required) — raw YAML string to write as metadata
- `force` (boolean, optional) — when `true`, skip conflict detection and `dependsOn` overwrite protection

### Requirement: Output contract

On success, `execute()` SHALL return a `SaveSpecMetadataResult` containing:

- `spec` (string) — the qualified spec label in the form `workspace:specName` (e.g. `'default:auth/oauth'`)

### Requirement: Content validation before write

Before writing, the use case parses the input `content` string with `JSON.parse()`. If parsing fails or the result is not an object, a `MetadataValidationError` is thrown with `content must be a JSON object`. The parsed object is validated against `strictSpecMetadataSchema`. If validation fails, a `MetadataValidationError` is thrown listing the Zod issues. This validation uses the strict schema — the read path (`metadata()`) uses the lenient schema.

### Requirement: Workspace resolution

The use case MUST resolve the workspace from the injected `specRepos` map. If the workspace name does not match any entry in the map, the use case SHALL throw `WorkspaceNotFoundError`.

### Requirement: Spec existence check

After resolving the workspace, the use case MUST look up the spec via `SpecRepository.get(specPath)`. If the spec does not exist (returns `null`), the use case SHALL throw `SpecNotFoundError` with the qualified spec identifier (`workspace:specPath`).

### Requirement: Conflict detection via originalHash

When `force` is not set, the use case MUST load the existing metadata (if any) via `SpecRepository.metadata()` and capture its `originalHash`. This hash is passed to `SpecRepository.saveMetadata()` so that the repository layer can detect concurrent modifications. When `force` is set, this step is skipped entirely — no existing metadata is loaded.

### Requirement: dependsOn overwrite protection

When `force` is not set and existing metadata exists on disk, the use case MUST check whether the incoming content would change the `dependsOn` array:

1. Parse the existing metadata content (loaded via `SpecRepository.metadata()` in the conflict detection step) and validate it against `specMetadataSchema` (the lenient schema)
2. Extract the `dependsOn` arrays from both existing and incoming metadata
3. Compare the two arrays using `DependsOnOverwriteError.areSame()`, which performs order-independent comparison
4. If the existing metadata has a non-empty `dependsOn` and the incoming `dependsOn` differs, throw `DependsOnOverwriteError`
5. If the existing metadata has no `dependsOn` (absent or empty), any incoming `dependsOn` is allowed

When `force` is set, this check MUST be skipped entirely.

### Requirement: Artifact persistence

After all validations pass, the use case MUST delegate to `SpecRepository.saveMetadata()` with the raw YAML content, the `originalHash` (if captured), and `{ force: true }` when `force` is set, or with an empty options object otherwise.

### Requirement: Constructor dependencies

The use case receives:

- `specRepos: ReadonlyMap<string, SpecRepository>` — workspace-keyed spec repositories

The `YamlSerializer` dependency is no longer needed — metadata content is JSON, parsed with `JSON.parse()`.

## Constraints

- Content validation uses `strictSpecMetadataSchema` (write-time), not the lenient `specMetadataSchema` (read-time) — this ensures metadata on disk always meets the strict schema requirements
- The existing metadata is parsed with `specMetadataSchema` (lenient) for the `dependsOn` check, because on-disk metadata may predate strict schema requirements
- The use case does not handle `ArtifactConflictError` — it propagates from the repository layer to the caller
- Validation order is: content schema validation, workspace resolution, spec existence, conflict detection / dependsOn check, then persist
- Metadata is persisted via `SpecRepository.saveMetadata()`, not via the generic `save()` method

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — defines the `.specd-metadata.yaml` format, the strict and lenient schemas, and the `dependsOn` overwrite protection rules
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — use case layer conventions and dependency injection rules
