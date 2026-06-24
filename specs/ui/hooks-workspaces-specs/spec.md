# Hooks Workspaces Specs

## Purpose

React data hooks for **Hooks Workspaces Specs**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: hooks load workspaces and spec tree metadata

The hooks MUST call `listWorkspaces` and spec tree/list methods on `client:port-workspaces-specs`.

When a spec detail view is active, the spec hooks MUST also load structured spec context through `getSpecContext()` and preserve that structure for the consuming component.

### Requirement: workspace tree refreshes on global poll

Tree metadata MUST refresh on the global poll interval when:

- the sidebar is expanded (stacked Workspaces block visible), OR
- the center context is **workspaces-hub**.

When the sidebar is collapsed **and** the center is not workspaces-hub or an open spec,
tree hooks MUST NOT refetch on poll ticks; cached metadata MUST be retained until
Workspaces becomes visible again or the workspaces hub opens.

Pausing poll via `enabled: false` MUST NOT discard in-memory tree data; re-enabling
MUST show cached data immediately and MAY catch up when `refreshKey` has advanced.

Per-spec detail loads when a spec tab becomes visible — unchanged.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-workspaces-specs`](../../client/port-workspaces-specs/spec.md) — port methods
