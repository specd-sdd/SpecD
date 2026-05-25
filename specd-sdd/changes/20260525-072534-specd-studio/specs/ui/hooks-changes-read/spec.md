# Hooks Changes Read

## Purpose

Open change tabs need fresh status and artifacts when an agent edits `manifest.json`, but refetching the full DAG every second is wasteful. These hooks poll `getChangeStatus` with `ifModifiedSince` against manifest `updatedAt` and only reload the data each tab actually displays.

## Requirements

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-read`](../../client/port-changes-read/spec.md) — port methods
