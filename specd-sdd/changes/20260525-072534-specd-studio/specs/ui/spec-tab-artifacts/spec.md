# Spec Tab Artifacts

## Purpose

Studio UI for **Spec Tab Artifacts**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Artifacts**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the spec tab is visible, the view MUST refresh spec metadata for that path on a light interval. New specs in the tree are already discovered by the global workspace poll.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
