# Inspector Delta Preview

## Purpose

Studio UI for **Inspector Delta Preview**: read-only merged markdown for spec-scoped change artifacts via `PreviewSpec`, including **unsaved** delta text.

## Requirements

### Requirement: preview uses saved preview when clean

When the artifact buffer matches saved content, Preview MUST call `previewChange` (GET `/preview`).

### Requirement: preview uses draft when dirty

When the buffer is dirty, Preview MUST call `previewChangeDraft` with `artifactOverrides` mapping the open change filename to `editorBuffer`.

### Requirement: non-spec-preview artifacts preview raw buffer

For change artifacts that do not use spec-preview merge (e.g. `proposal.md`), Preview MUST render `editorBuffer` directly without calling preview endpoints.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

## Spec Dependencies

- [`core:preview-artifact-overrides`](../../core/preview-artifact-overrides/spec.md)
- [`ui:inspector-unsaved-draft`](../inspector-unsaved-draft/spec.md)
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
