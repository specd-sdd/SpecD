# Inspector Delta Edit

## Purpose

Studio UI for **Inspector Delta Edit**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Inspector Delta Edit**.

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

The inspector MUST support preview, delta edit, full diff, metadata/schema, and canonical read-only modes. Canonical workspace spec artifacts MUST be read-only in Studio v1.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
