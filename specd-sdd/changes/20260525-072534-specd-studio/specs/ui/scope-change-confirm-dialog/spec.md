# Scope Change Confirm Dialog

## Purpose

Second step inside [`ui:change-metadata-editor`](../change-metadata-editor/spec.md) **`ChangeScopeDialog`**: when the user saves a **scope** change (add/remove `specIds`), Studio MUST confirm before PATCH because approvals are invalidated and removed specs lose scaffolded artifacts.

## Requirements

### Requirement: scope confirm is a step inside ChangeScopeDialog

When **Save changes** includes `addSpecIds` or `removeSpecIds`, the dialog MUST switch to a confirm view with copy from `buildScopeChangeConfirmMessage` and **Back** / **Apply scope change** actions — not a separate top-level modal on Overview.

### Requirement: dependency-only saves skip scope confirm

When only `specDependsOn` values changed, **Save changes** MUST apply dependency PATCHes without the scope confirm step.

### Requirement: modal copy explains scope invalidation

The confirm sub-step body MUST explain that approvals are invalidated and list specs to add (`+ id`) and remove (`− id`) using copy from `buildScopeChangeConfirmMessage`.

## Spec Dependencies

- [`ui:change-metadata-editor`](../change-metadata-editor/spec.md) — parent dialog
- [`ui:design-system`](../design-system/spec.md) — `StudioDialog` chrome
