# Change Tab Validation

## Purpose

**Superseded:** workflow and validation status (blockers, next action, lifecycle, artifact checks from `getChangeStatus`) are shown on **Change Tab Overview** (`ui:change-tab-overview`), not as a separate tab.

## Requirements

### Requirement: no dedicated Validation change tab

The change tab strip MUST NOT include a **Validation** tab. Status and validation workflow data MUST render inside Overview under a workflow section.

### Requirement: overview owns status polling semantics

Overview MUST satisfy the former validation-tab polling rules: while Overview is visible, call `getChangeStatus` with `ifModifiedSince`, respect `unchanged`, pause when hidden, and refetch after save.

## Spec Dependencies

- [`ui:change-tab-overview`](../change-tab-overview/spec.md) — hosts workflow status UI
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
