# Hooks Change Scope Patch

## Purpose

Pure helpers for [`ui:change-scope-dialog`](../change-scope-dialog/spec.md): compute `addSpecIds` / `removeSpecIds` deltas and build confirm copy.

## Requirements

### Requirement: computeSpecScopeDelta returns symmetric diff

Given saved and draft `specIds` arrays, MUST return `addSpecIds` (in draft not saved) and `removeSpecIds` (in saved not draft).

### Requirement: buildScopeChangeConfirmMessage warns invalidation

Message MUST name the change, warn that scope changes invalidate approvals and may remove scaffolded dirs, and list `+` / `−` spec IDs per [`ui:design-system`](../design-system/spec.md) ascending order.

## Spec Dependencies

- [`ui:change-scope-dialog`](../change-scope-dialog/spec.md) — consumer
- [`ui:design-system`](../design-system/spec.md) — flat spec id sort order
