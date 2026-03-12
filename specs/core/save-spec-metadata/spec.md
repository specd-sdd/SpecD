# SaveSpecMetadata

## Overview

`SaveSpecMetadata` is a use case in the application layer of `@specd/core` that writes a `.specd-metadata.yaml` file for a given spec. It validates the incoming YAML content, protects curated `dependsOn` entries from silent overwrite, delegates conflict detection to the repository layer, and persists the artifact to disk. It is invoked by `ArchiveChange` during deterministic metadata generation and may also be called directly by tooling (e.g. the LLM refining metadata).

## Requirements

### Requirement: Input contract

`SaveSpecMetadata.execute()` accepts a `SaveSpecMetadataInput` with the following fields:

- `workspace` (string, required) — the workspace name (e.g. `'default'`, `'billing'`)
- `specPath` (SpecPath, required) — the spec path within the workspace (e.g. `'auth/oauth'`)
- `content` (string, required) — raw YAML string to write as `.specd-metadata.yaml`
- `force` (boolean, optional) — when `true`, skip conflict detection and `dependsOn` overwrite protection

### Requirement: Output contract

On success, `execute()` SHALL return a `SaveSpecMetadataResult` containing:

- `spec` (string) — the qualified spec label in the form `workspace:specName` (e.g. `'default:auth/oauth'`)

### Requirement: Content validation before write

The use case MUST validate the incoming `content` before any other operation:

1. Parse the YAML string via the injected `YamlSerializer`
2. Reject the content with `MetadataValidationError` if the parsed result is `null`, `undefined`, or not an object (i.e. not a YAML mapping)
3. Validate the parsed object against `strictSpecMetadataSchema` (the Zod schema defined in the domain layer)
4. If validation fails, throw `MetadataValidationError` with the Zod issues formatted as a human-readable string
5. The file MUST NOT be written when validation fails

### Requirement: Workspace resolution

The use case MUST resolve the workspace from the injected `specRepos` map. If the workspace name does not match any entry in the map, the use case SHALL throw `WorkspaceNotFoundError`.

### Requirement: Spec existence check

After resolving the workspace, the use case MUST look up the spec via `SpecRepository.get(specPath)`. If the spec does not exist (returns `null`), the use case SHALL throw `SpecNotFoundError` with the qualified spec identifier (`workspace:specPath`).

### Requirement: Conflict detection via originalHash

When `force` is not set, the use case MUST load the existing `.specd-metadata.yaml` artifact (if any) via `SpecRepository.artifact()` and capture its `originalHash`. This hash is passed to the `SpecArtifact` constructor so that the repository layer can detect concurrent modifications during `save()`. When `force` is set, this step is skipped entirely — no existing artifact is loaded.

### Requirement: dependsOn overwrite protection

When `force` is not set and an existing `.specd-metadata.yaml` exists on disk, the use case MUST check whether the incoming content would change the `dependsOn` array:

1. Parse the existing artifact's content and validate it against `specMetadataSchema` (the lenient schema)
2. Extract the `dependsOn` arrays from both existing and incoming metadata
3. Compare the two arrays using `DependsOnOverwriteError.areSame()`, which performs order-independent comparison
4. If the existing metadata has a non-empty `dependsOn` and the incoming `dependsOn` differs, throw `DependsOnOverwriteError`
5. If the existing metadata has no `dependsOn` (absent or empty), any incoming `dependsOn` is allowed

When `force` is set, this check MUST be skipped entirely.

### Requirement: Artifact persistence

After all validations pass, the use case MUST construct a `SpecArtifact` with filename `.specd-metadata.yaml`, the raw YAML content, and the `originalHash` (if captured). It SHALL then delegate to `SpecRepository.save()` with `{ force: true }` when `force` is set, or with an empty options object otherwise.

### Requirement: Constructor dependencies

`SaveSpecMetadata` MUST be constructed with:

- `specRepos` — a `ReadonlyMap<string, SpecRepository>` mapping workspace names to their repositories
- `yaml` — a `YamlSerializer` for parsing YAML content

These are injected by the kernel at composition time. The use case MUST NOT construct its own infrastructure adapters.

## Constraints

- Content validation uses `strictSpecMetadataSchema` (write-time), not the lenient `specMetadataSchema` (read-time) — this ensures metadata on disk always meets the strict schema requirements
- The existing artifact is parsed with `specMetadataSchema` (lenient) for the `dependsOn` check, because on-disk metadata may predate strict schema requirements
- The use case does not handle `ArtifactConflictError` — it propagates from the repository layer to the caller
- The use case does not create spec directories — `SpecRepository.save()` handles directory creation
- Validation order is: content schema validation, workspace resolution, spec existence, conflict detection / dependsOn check, then persist

## Spec Dependencies

- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — defines the `.specd-metadata.yaml` format, the strict and lenient schemas, and the `dependsOn` overwrite protection rules
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — use case layer conventions and dependency injection rules
