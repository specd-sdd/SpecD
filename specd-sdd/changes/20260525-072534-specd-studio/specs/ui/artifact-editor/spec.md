# Artifact Editor

## Purpose

Human review happens in Monaco: open a tracked artifact, edit, Save with optimistic concurrency, Validate, and find-in-file. The editor coordinates with `hooks-inspector-save` and mutate hooks so conflicts surface as 409 UX instead of silent overwrites.

## Requirements

### Requirement: editor loads artifact via section-aware read hook

Opening a tracked change artifact MUST fetch `{ content, originalHash }` through `useChangeArtifact` (or equivalent), which MUST call `getChangeArtifact` for **active** changes, `getDraftArtifact` for **drafted**, and `getDiscardedArtifact` for **discarded**, matching the shell `listSection`. Content MUST bind to Monaco state.

### Requirement: save button uses inspector save hook

Save MUST call `ui:hooks-inspector-save` and MUST be disabled while a save is in flight or the artifact is read-only.

### Requirement: validate button runs ValidateArtifacts for current scope

Validate MUST call the mutate hook for the current file, artifact type, or whole change per the active tab context.

### Requirement: editor supports in-file find and replace

Monaco find/replace MUST be available in-editor without a dedicated core use case.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:hooks-inspector-save`](../hooks-inspector-save/spec.md) — save flow
- [`core:save-change-artifact`](../../core/save-change-artifact/spec.md) — save semantics
