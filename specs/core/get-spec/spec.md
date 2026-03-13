# Get Spec

## Purpose

Delivery mechanisms need to display or process a complete spec with all its artifacts, but loading and assembling those pieces requires coordinating workspace lookup, spec resolution, and multi-file artifact loading. The `GetSpec` use case handles this by loading a single spec and all of its artifact files by workspace name and spec path, serving as the primary query for reading a complete spec.

## Requirements

### Requirement: Resolve workspace from input

The use case SHALL look up the `SpecRepository` for the given `workspace` name. If the workspace does not exist in the configured repository map, the use case MUST throw a `WorkspaceNotFoundError`.

### Requirement: Load spec by path

The use case SHALL call `repo.get(specPath)` to load the spec metadata. If the spec does not exist (returns `null`), the use case MUST throw a `SpecNotFoundError` with a qualified identifier in the format `workspace:capabilityPath`.

### Requirement: Load all artifact files

When the spec exists, the use case SHALL iterate over `spec.filenames` and load each artifact via `repo.artifact(spec, filename)`. Only artifacts that return non-null are included in the result map. The result `artifacts` map MUST be keyed by filename.

### Requirement: Return spec and artifacts

The use case SHALL return a `GetSpecResult` containing:

- `spec` — the `Spec` entity as returned by the repository.
- `artifacts` — a `Map<string, SpecArtifact>` of all successfully loaded artifacts.

### Requirement: Input shape

`GetSpecInput` MUST include:

- `workspace` — the workspace name (string).
- `specPath` — a `SpecPath` value object identifying the spec within the workspace.

## Constraints

- The use case receives a `ReadonlyMap<string, SpecRepository>` — it MUST NOT modify the map or the repositories.
- The use case throws on missing workspace or missing spec — it does not return `null` for these cases.
- Artifacts that fail to load (return `null` from `repo.artifact`) are silently omitted from the result map; no error is thrown for individual missing artifact files.

## Spec Dependencies

- [`specs/core/storage/spec.md`](../storage/spec.md) — `SpecRepository` and `SpecArtifact` contracts
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace resolution
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — qualified spec identifier format
