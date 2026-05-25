# Hooks Changes Collection

## Purpose

React data hooks for **Hooks Changes Collection**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: hooks load change lists through port-changes-collection

The hooks MUST call `listChanges`, `listDrafts`, `listDiscarded`, `listArchived`, and `detectOverlaps` on `client:port-changes-collection`.

### Requirement: hooks refresh change lists on global poll

On each global poll tick, sidebar lists MUST refresh so agent-created, shelved, or discarded changes appear without manual reload.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-collection`](../../client/port-changes-collection/spec.md) — port methods
