# Inspector Metadata & Outline

## Purpose

Studio UI for **Inspector Metadata & Outline**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Inspector Metadata & Outline**.

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

The inspector MUST support preview, delta edit, full diff, **Metadata**, **Outline**, and canonical read-only modes (UI labels: Edit/Raw, Preview, Diff, Metadata, Outline). Canonical workspace spec artifacts MUST be read-only in Studio v1.

### Requirement: metadata mode shows artifact file metadata

Metadata mode MUST render artifact file metadata (path, kind, hash when present) and MUST show readonly YAML body when the filename is a metadata artifact (`metadata.yaml` or under `metadata/`).

### Requirement: outline mode uses draft-aware endpoints

Outline mode MUST load navigable structure for the open artifact:

- **Change artifacts:** `outlineChangeArtifact(change, filename, { content })` so in-progress (unsaved) bodies are outlined from the editor buffer.
- **Workspace spec artifacts (read-only):** `getSpecOutline` or `outlineSpecDraft` when the buffer differs from saved.

When outline is unavailable for the file type, the UI MUST show a clear empty state. The tab MUST be labeled **Outline**, not Schema.

### Requirement: preview and diff honor unsaved editor buffer

For spec-scoped change artifacts, Preview and Diff MUST call `previewChangeDraft` with `artifactOverrides` mapping the open filename to the current editor buffer when the artifact is dirty. Non–spec-preview artifacts MUST render Preview from the editor buffer directly.

### Requirement: unsaved changes are visible and guarded

When editor buffer differs from last loaded `originalHash` content, the inspector MUST show an unsaved indicator beside Save. Closing the artifact panel or navigating away MUST prompt to Save, Discard, or Cancel.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
