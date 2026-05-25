# Change Metadata Editor

## Purpose

Orchestrates change metadata editing on the **Overview** tab: safe inline fields plus a gated dialog for high-impact scope/dependency changes.

## Requirements

### Requirement: overview composes metadata child components

For **active** changes, Overview MUST compose:

- [`ui:change-description-editor`](../change-description-editor/spec.md)
- [`ui:change-invalidation-policy-editor`](../change-invalidation-policy-editor/spec.md)
- [`ui:change-specs-readonly-panel`](../change-specs-readonly-panel/spec.md) with **Edit spec scope…** opening [`ui:change-scope-dialog`](../change-scope-dialog/spec.md)

**Archived** changes MUST show read-only description (if any) and read-only specs panel without edit controls.

### Requirement: metadata saves append to Output panel

Successful saves from description, policy, or scope dialog MUST append to shell **Output** and select that tab ([`ui:shell-layout`](../shell-layout/spec.md)).

### Requirement: view uses SpecdDataPort hooks only

Child components MUST consume `SpecdDataPort` hooks; MUST NOT import `@specd/core`.

## Spec Dependencies

- [`ui:change-tab-overview`](../change-tab-overview/spec.md) — host tab
- [`ui:change-description-editor`](../change-description-editor/spec.md)
- [`ui:change-invalidation-policy-editor`](../change-invalidation-policy-editor/spec.md)
- [`ui:change-specs-readonly-panel`](../change-specs-readonly-panel/spec.md)
- [`ui:change-scope-dialog`](../change-scope-dialog/spec.md)
- [`client:specd-data-port`](../../client/specd-data-port/spec.md)
