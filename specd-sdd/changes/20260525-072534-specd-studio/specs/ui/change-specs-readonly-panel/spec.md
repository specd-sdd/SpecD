# Change Specs Readonly Panel

## Purpose

Read-only presentation of a change’s **spec scope** and per-spec **`dependsOn`** on the Overview tab. Editing happens only via [`ui:change-scope-dialog`](../change-scope-dialog/spec.md).

## Requirements

### Requirement: panel lists each spec in scope with dependencies

For every `specId` on `ChangeDetailDto`, the panel MUST show the spec ID and its `specDependsOn[specId]` entries (or an explicit empty state). Data MUST come from the loaded detail DTO only. Flat spec and dependency lists MUST follow [`ui:design-system`](../design-system/spec.md) ascending order.

### Requirement: panel is read-only

The component MUST NOT call mutating port methods and MUST NOT render add/remove controls.

## Spec Dependencies

- [`client:dto-change-detail`](../../client/dto-change-detail/spec.md) — `specIds`, `specDependsOn`
- [`ui:design-system`](../design-system/spec.md) — flat spec id sort order
- [`ui:change-tab-overview`](../../ui/change-tab-overview/spec.md) — hosts the panel
