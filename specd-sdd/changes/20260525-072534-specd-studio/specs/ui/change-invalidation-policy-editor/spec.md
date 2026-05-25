# Change Invalidation Policy Editor

## Purpose

Inline editor for change **invalidation policy** on Overview. Updates drift behaviour for future edits; does not invalidate approvals by itself (`core:edit-change`).

## Requirements

### Requirement: select policy and save when dirty

MUST offer `none`, `surgical`, `downstream`, `global` (default display `downstream` when DTO omits field). **Save** (`studio-change-invalidation-policy-save`) MUST call `patchChange({ invalidationPolicy })`.

### Requirement: helper copy explains non-invalidating save

MUST state that the policy affects future drift invalidation only, not current approvals.

### Requirement: view uses SpecdDataPort hooks only

MUST NOT import `@specd/core`.

## Spec Dependencies

- [`client:dto-change-detail`](../../client/dto-change-detail/spec.md) — `invalidationPolicy`
- [`ui:hooks-changes-mutate`](../hooks-changes-mutate/spec.md) — `usePatchChange`
- [`core:edit-change`](../../../../../../specs/core/edit-change/spec.md) — policy semantics
