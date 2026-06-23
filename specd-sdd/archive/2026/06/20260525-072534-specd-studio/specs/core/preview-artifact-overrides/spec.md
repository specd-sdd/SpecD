# Preview Artifact Overrides

## Purpose

Studio must preview and diff **unsaved** delta edits without writing to disk. This extends workspace [`core:preview-spec`](../../../../../../specs/core/preview-spec/spec.md) with optional in-memory overrides keyed by change-directory `filename`.

## Requirements

### Requirement: PreviewSpec input accepts artifactOverrides

`PreviewSpecInput` MAY include `artifactOverrides?: Readonly<Record<string, string>>` mapping change-relative filename → content string.

### Requirement: override replaces disk read for matching files

When processing an `ArtifactFile` whose `filename` exists in `artifactOverrides`, `PreviewSpec` MUST use the override string as artifact content and MUST NOT call `ChangeRepository.artifact` for that file.

### Requirement: non-overridden files unchanged

Files without an override MUST continue to load from the change repository (or record missing per existing rules).

### Requirement: overrides do not mutate manifest or disk

Applying overrides MUST be read-only with respect to persistence; no save, no `updatedAt` bump.

## Spec Dependencies

- [`core:preview-spec`](../../../../../../specs/core/preview-spec/spec.md) — base merge logic
- [`core:save-change-artifact`](../save-change-artifact/spec.md) — distinct from save; preview never writes
