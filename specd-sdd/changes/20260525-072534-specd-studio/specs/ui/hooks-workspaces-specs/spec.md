# Hooks Workspaces Specs

## Purpose

React data hooks for **Hooks Workspaces Specs**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: hooks load workspaces and spec tree metadata

The hooks MUST call `listWorkspaces` and spec tree/list methods on `client:port-workspaces-specs`.

### Requirement: workspace tree refreshes on global poll

Tree metadata MUST refresh on the global poll interval; per-spec detail loads when a spec tab becomes visible.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-workspaces-specs`](../../client/port-workspaces-specs/spec.md) — port methods
