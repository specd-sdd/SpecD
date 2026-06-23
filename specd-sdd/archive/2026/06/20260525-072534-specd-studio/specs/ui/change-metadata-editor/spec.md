# Change Metadata Editor

## Purpose

Orchestrates change metadata editing on the **Overview** tab: safe inline fields plus a gated dialog for high-impact scope/dependency changes.

## Requirements

### Requirement: overview composes metadata child components

For **active** changes, Overview MUST compose:

- [`ui:change-description-editor`](../change-description-editor/spec.md)
- [`ui:change-invalidation-policy-editor`](../change-invalidation-policy-editor/spec.md)
- [`ui:change-specs-readonly-panel`](../change-specs-readonly-panel/spec.md) inside the **Specs & dependencies** card with helper copy **Read-only on Overview — use the dialog to edit scope safely.** and **Edit spec scope…** (`studio-edit-spec-scope`) opening [`ui:change-scope-dialog`](../change-scope-dialog/spec.md)

For **draft**, **discarded**, and **archived** changes, Overview MUST show read-only description (if any) and the read-only specs panel only. It MUST NOT render description or invalidation editors, MUST NOT render the scope-edit helper line, and MUST NOT render **Edit spec scope…** or open the scope dialog from Overview.

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
