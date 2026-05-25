# Spec Tab Graph

## Purpose

Studio UI for **Spec Tab Graph**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Graph**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the Graph tab is visible, the view MUST load spec-scoped graph view JSON via `getSpecGraphView(workspace, specPath)` on tab-scoped poll ticks. New specs in the tree are already discovered by the global workspace poll.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
