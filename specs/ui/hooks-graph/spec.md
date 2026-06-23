# Hooks Graph

## Purpose

React data hooks for **Hooks Graph**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: graph hooks expose port-graph operations to views

Consumers MUST receive graph status, search, impact, spec coverage, and linkage data exclusively via `client:port-graph`.

### Requirement: stale graph index shows warning affordances

When `getGraphStatus` reports a stale index, hooks MUST expose a boolean consumed by `ui:sidebar-graph-entry` and graph tabs.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-graph`](../../client/port-graph/spec.md) — port methods
