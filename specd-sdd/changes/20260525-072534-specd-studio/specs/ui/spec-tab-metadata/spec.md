# Spec Metadata Presentation

## Purpose

Studio UI for spec metadata presentation: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio MUST present spec identity and descriptive metadata without a dedicated **Metadata** center tab.

## Requirements

### Requirement: overview owns spec metadata presentation

Studio MUST NOT expose a separate **Metadata** center tab for specs.

The spec **Overview** tab MUST surface the metadata that matters for normal reading:

- spec identity (`specId`)
- title
- description
- workspace/path context when relevant inside the overview content itself, not in a dedicated spec header bar

Tab-scoped detail polling remains owned by the visible Overview and sibling detail tabs; there is no metadata-only poll loop.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
