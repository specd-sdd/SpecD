# Inspector Delta Full Diff

## Purpose

Studio UI for **Inspector Delta Full Diff**: unified diff of canonical base vs merged result from `PreviewSpec`, honoring **draft** overrides when the editor is dirty.

## Requirements

### Requirement: diff uses same preview source as Preview tab

Diff MUST use `previewHook.data.base` and `previewHook.data.merged` from the same preview load as Preview (including `previewChangeDraft` when dirty).

### Requirement: diff tab only for change deltas

The Diff tab MUST appear only when `showsInspectorDiffTab(filename)` is true (change-directory paths under `deltas/` with spec-preview merge). It MUST NOT render as a disabled control.

The Diff tab MUST NOT appear for workspace **spec** artifacts, **archived** change artifacts, change `specs/` (new spec) paths, or non-preview artifacts (e.g. `proposal.md`).

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

## Spec Dependencies

- [`ui:inspector-delta-preview`](../inspector-delta-preview/spec.md)
- [`ui:inspector-unsaved-draft`](../inspector-unsaved-draft/spec.md)
