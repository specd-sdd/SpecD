# Hooks Artifact Outline

## Purpose

**Hooks Artifact Outline** centralizes inspector and tab outline fetching: change artifacts via `outlineChangeArtifact`, workspace specs via `getSpecOutline` / `outlineSpecDraft`, always passing the current editor buffer when outlining the open file.

## Requirements

### Requirement: hook selects port method by context

- Change artifact: `outlineChangeArtifact(changeName, filename, { content })`
- Workspace spec: `outlineSpecDraft` when buffer provided; else `getSpecOutline` with `filename` query

### Requirement: hook refetches when buffer length changes on Outline tab

While Outline inspector mode is active, refetch MUST occur when editor content changes so structure tracks unsaved edits (debounce optional; correctness required).

### Requirement: hook uses SpecdDataPort only

MUST NOT import `@specd/core`.

## Spec Dependencies

- [`client:port-changes-read`](../../client/port-changes-read/spec.md)
- [`client:port-workspaces-specs`](../../client/port-workspaces-specs/spec.md)
- [`ui:inspector-metadata-schema`](../inspector-metadata-schema/spec.md)
