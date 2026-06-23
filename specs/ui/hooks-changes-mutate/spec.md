# Hooks Changes Mutate

## Purpose

React data hooks for **Hooks Changes Mutate**: loading state, error propagation, and polling rules for `SpecdDataPort`. Hooks keep components free of transport details and `@specd/core` imports.

## Requirements

### Requirement: mutate hooks delegate to port-changes-mutate

Validate, transition, patch, and lifecycle actions MUST invoke the corresponding methods on `client:port-changes-mutate`.

### Requirement: mutate hooks surface save conflicts to the inspector

HTTP 409 responses from save MUST be forwarded to `ui:hooks-inspector-save` for conflict UI; hooks MUST NOT swallow `ArtifactConflictError`.

### Requirement: usePatchChange delegates metadata PATCH

`usePatchChange` MUST call `port.patchChange` and expose `isPatching`, `error`, and optional `onPatched` callback for description, invalidation policy, and scope changes.

### Requirement: scope dialog uses updateSpecDependencies

[`ui:change-scope-dialog`](../change-scope-dialog/spec.md) MUST call `port.updateSpecDependencies(name, { specId, set })` per spec whose `dependsOn` list changed, then refetch `getChange` for fresh detail.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — port methods
