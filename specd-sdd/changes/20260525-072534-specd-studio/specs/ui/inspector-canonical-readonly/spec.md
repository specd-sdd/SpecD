# Inspector Canonical Readonly

## Purpose

Studio UI for **Inspector Canonical Readonly**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Inspector Canonical Readonly**.

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

The inspector MUST support preview, delta edit, metadata/schema, outline, and canonical read-only modes for workspace specs. **Diff** MUST appear only for active-change `deltas/` artifacts ([`ui:inspector-delta-full-diff`](../inspector-delta-full-diff/spec.md)); it MUST NOT render (even disabled) for workspace specs or archived changes.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
