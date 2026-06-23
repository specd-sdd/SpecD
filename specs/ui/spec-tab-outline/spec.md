# Spec Tab Outline

## Purpose

Studio UI for **Spec Tab Outline** (tab label **Outline**, not Schema): navigable structure for a workspace canonical spec via `getSpecOutline`.

## Requirements

### Requirement: tab label is Outline

The spec center tab strip MUST display **Outline** for this view. Requirements MUST NOT refer to “schema” for navigable artifact structure.

### Requirement: spec tab polls outline while visible

While the Outline tab is visible, the view MUST load outline JSON via `getSpecOutline(workspace, specPath)` on tab-scoped poll ticks.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`core:get-spec-outline-draft`](../../core/get-spec-outline-draft/spec.md) — optional draft POST (inspector only in v1)
