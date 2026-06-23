# Inspector Unsaved Draft

## Purpose

Studio artifact inspector MUST make edit state obvious and prevent silent data loss when the user closes the panel or navigates away with a dirty buffer.

## Requirements

### Requirement: dirty state derived from buffer vs saved content

For editable change artifacts, the UI MUST treat the editor as dirty when `editorBuffer !== loadedArtifactContent` (after initial sync). Workspace canonical artifacts are never dirty in v1 (read-only).

### Requirement: unsaved indicator beside Save

When dirty, the inspector chrome MUST show a visible unsaved indicator adjacent to the Save control (icon or label). The indicator MUST clear after successful save when buffer matches new `originalHash` content.

### Requirement: close and navigation require confirmation when dirty

When dirty, the following MUST open a modal with **Save**, **Discard**, and **Cancel**:

- closing the artifact panel (✕)
- selecting a different artifact in the same change
- selecting a different change or spec in the sidebar

**Cancel** MUST leave the panel open with buffer unchanged. **Discard** MUST proceed without save. **Save** MUST persist via `saveChangeArtifact` then proceed only on success.

### Requirement: preview diff outline use draft pipelines when dirty

While dirty, Preview and Diff MUST use [`core:preview-artifact-overrides`](../core/preview-artifact-overrides/spec.md) (POST preview). Outline MUST pass current buffer to outline draft endpoints. See [`ui:inspector-metadata-schema`](../inspector-metadata-schema/spec.md).

## Spec Dependencies

- [`ui:design-system`](../design-system/spec.md) — `StudioDialog` for unsaved modal
- [`ui:hooks-inspector-save`](../hooks-inspector-save/spec.md)
- [`client:port-changes-read`](../../client/port-changes-read/spec.md)
- [`ui:inspector-metadata-schema`](../inspector-metadata-schema/spec.md)
