# Inspector Edit Preview

## Purpose

Studio UI for **Inspector Edit Preview**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Inspector Edit Preview**.

## Requirements

### Requirement: inspector mode selects preview delta or read-only canonical

The inspector MUST support preview, edit/raw, metadata/schema, outline, and read-only modes appropriate to context. **Diff** is limited to active-change delta artifacts per [`ui:inspector-delta-full-diff`](../inspector-delta-full-diff/spec.md). Canonical workspace spec artifacts MUST be read-only in Studio v1.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
