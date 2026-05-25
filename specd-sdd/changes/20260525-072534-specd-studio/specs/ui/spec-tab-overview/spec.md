# Spec Tab Overview

## Purpose

Studio UI for **Spec Tab Overview**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Overview**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the Overview tab is visible, the view MUST refresh spec detail via `getSpec` on tab-scoped poll ticks. New specs in the tree are already discovered by the global workspace poll.

### Requirement: linked changes tab lists overlaps for current spec

When the user selects the **Linked Changes** center tab, Studio MUST call `detectOverlaps` and MUST render only changes whose overlap entry matches the open spec's `specId`. The list MUST NOT show all active and draft changes unfiltered.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
