# Change Scope Dialog

## Purpose

High-impact editor for change **spec scope** (`addSpecIds` / `removeSpecIds`) and per-spec **`dependsOn`**, opened from Overview via **Edit spec scope…**. Uses [`ui:scope-change-confirm-dialog`](../scope-change-confirm-dialog/spec.md) as an in-dialog confirm step when scope changes.

## Requirements

### Requirement: dialog shows high-impact warning

The dialog MUST open with a visible warning (`role="alert"`) stating that **removing** specs drops scaffolded artifact directories and **invalidates** spec approval and sign-off; **adding** specs may require new artifact work; **dependency** edits affect compiled context only and do not invalidate approvals.

### Requirement: each spec is one card with scope remove and dependencies

The dialog MUST list each spec in scope as a shadcn **`Card`** (ascending order per [`ui:design-system`](../design-system/spec.md)): header shows `specId` and ✕ to **remove the spec from scope** (using a shadcn **`Button`**); body shows `dependsOn` as add/remove chips implemented with shadcn **`Badge`** components following the same ordering rule.

**Add spec** and **Add dep** MUST be implemented using a high-performance **`RemoteMultiCombobox`** component:

- The component MUST be built using **Base UI** primitives (`Combobox`, `ComboboxChips`, etc.) integrated into Studio's shadcn theme.
- It MUST support **remote fetching** (debounced 300-500ms) using the `searchGraph` API.
- Selected items MUST appear as **visual chips** within or immediately below the combobox trigger.
- The trigger MUST include a **Search** icon and a **Clear** button (when items are selected).
- Selection MUST NOT be final until the user clicks the adjacent **"Add Spec"** or **"Add dep"** button, which performs the batch update.
- The dialog MUST NOT add a spec as its own dependency. There MUST NOT be a separate chip row duplicating the card list.

### Requirement: dialog persists scope and dependsOn on save

Scope changes use `patchChange`; per-spec dependency changes use `updateSpecDependencies(name, { specId, set: [...] })`.

### Requirement: scope save uses PATCH and confirm step

When draft scope differs from persisted `specIds`, **Save changes** MUST show the confirm sub-step (see `ui:scope-change-confirm-dialog`) then `patchChange` with `addSpecIds` / `removeSpecIds`. Dependency-only saves MUST skip the confirm sub-step.

### Requirement: dialog uses StudioDialog chrome

`data-testid="studio-change-scope-dialog"`. Large layout (`max-w-2xl`) with scrollable body using shadcn `ScrollArea`. Actions: **Cancel**, **Save changes**; confirm sub-step: **Back**, **Apply scope change**. Actions MUST use shadcn `Button` components.

### Requirement: view uses SpecdDataPort hooks only

MUST use `usePatchChange` and `port.updateSpecDependencies`; MUST NOT import `@specd/core`.

## Spec Dependencies

- [`ui:hooks-change-scope-patch`](../hooks-change-scope-patch/spec.md) — delta + confirm copy
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — `patchChange`, `updateSpecDependencies`
- [`api:routes-changes-mutate`](../../api/routes-changes-mutate/spec.md) — PATCH routes
- [`ui:scope-change-confirm-dialog`](../scope-change-confirm-dialog/spec.md) — confirm sub-step
- [`ui:design-system`](../design-system/spec.md) — `StudioDialog`, flat spec id sort order
