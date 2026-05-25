# Spec Tab Metadata

## Purpose

Studio UI for **Spec Tab Metadata**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Metadata**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the Metadata tab is visible, the view MUST refresh spec detail via `getSpec` on tab-scoped poll ticks. New specs in the tree are already discovered by the global workspace poll. The tab MUST render spec ID, workspace, path, title, and description from `SpecDetailDto`.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
