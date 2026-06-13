# Edit Change Dialog

## Purpose

Unified editor for change **metadata** (name, description, invalidation policy) and **spec scope** (`addSpecIds` / `removeSpecIds` / `dependsOn`). This dialog serves dual purposes: modifying an existing change from its Overview tab via **Edit Change…**, and creating a brand new change via **New change** in the Command Palette. Uses [`ui:scope-change-confirm-dialog`](../scope-change-confirm-dialog/spec.md) as an in-dialog confirm step when scope changes. Studio UI component: **Edit Change Dialog** (formerly Change Scope Dialog).

## Requirements

### Requirement: dialog supports creation mode

When opened without an active change context, the dialog MUST operate in "Create" mode. In this mode, the dialog MUST require a **Change Name** input field. Upon saving, it MUST invoke `createChange` with the provided name, description, invalidation policy, and selected specs/dependencies.

### Requirement: dialog manages metadata edits

The dialog MUST provide inputs for the change's **Description** (Textarea) and **Invalidation Policy** (shadcn `Select`). These fields MUST be prepopulated with the active change's current values in edit mode.

### Requirement: dialog shows high-impact warning

In edit mode, the dialog MUST open with a visible warning (`role="alert"`) stating that **removing** specs drops scaffolded artifact directories and **invalidates** spec approval and sign-off; **adding** specs may require new artifact work; **dependency** edits affect compiled context only and do not invalidate approvals. This warning MUST NOT be shown in creation mode.

### Requirement: each spec is one card with scope remove and dependencies

The dialog MUST list each spec in scope as a shadcn **`Card`** (ascending order per [`ui:design-system`](../design-system/spec.md)): header shows `specId` and ✕ to **remove the spec from scope** (using a shadcn **`Button`**); body shows `dependsOn` as add/remove chips implemented with shadcn **`Badge`** components following the same ordering rule.

**Add spec** and **Add dep** MUST be implemented using a high-performance **`RemoteMultiCombobox`** component:

- The component MUST be built using **Base UI** primitives (`Combobox`, `ComboboxChips`, etc.) integrated into Studio's shadcn theme.
- It MUST support **remote fetching** (debounced 300-500ms) using the `searchGraph` API.
- Selected items MUST appear as **visual chips** within or immediately below the combobox trigger.
- The trigger MUST include a **Search** icon and a **Clear** button (when items are selected).
- Selection MUST NOT be final until the user clicks the adjacent **"Add Spec"** or **"Add dep"** button, which performs the batch update.
- The dialog MUST NOT add a spec as its own dependency. There MUST NOT be a separate chip row duplicating the card list.

### Requirement: dialog persists scope, dependsOn, and metadata on save

In edit mode, scope and metadata changes use `patchChange`; per-spec dependency changes use `updateSpecDependencies(name, { specId, set: [...] })`. In creation mode, `createChange` is used, followed by `updateSpecDependencies`.

### Requirement: scope save uses PATCH and confirm step

When draft scope differs from persisted `specIds`, **Save changes** MUST show the confirm sub-step (see `ui:scope-change-confirm-dialog`) then `patchChange` with `addSpecIds` / `removeSpecIds`. Dependency-only or metadata-only saves MUST skip the confirm sub-step. Creation mode MUST skip the confirm sub-step entirely.

### Requirement: dialog uses StudioDialog chrome

`data-testid="studio-change-scope-dialog"`. Large layout (`max-w-2xl`) with scrollable body using shadcn `ScrollArea`. The dialog title MUST indicate the active mode (e.g., "Create new change") and, in edit mode, MUST explicitly include the name of the change being edited (e.g., "Edit change: feat-user-auth"). Actions: **Cancel**, **Save changes**; confirm sub-step: **Back**, **Apply scope change**. Actions MUST use shadcn `Button` components.

### Requirement: view uses SpecdDataPort hooks only

MUST use `usePatchChange` and `port.updateSpecDependencies`; MUST NOT import `@specd/core`.

## Spec Dependencies

- [`ui:hooks-change-scope-patch`](../hooks-change-scope-patch/spec.md) — delta + confirm copy
- [`client:port-changes-mutate`](../../client/port-changes-mutate/spec.md) — `patchChange`, `updateSpecDependencies`
- [`api:routes-changes-mutate`](../../api/routes-changes-mutate/spec.md) — PATCH routes
- [`ui:scope-change-confirm-dialog`](../scope-change-confirm-dialog/spec.md) — confirm sub-step
- [`ui:design-system`](../design-system/spec.md) — `StudioDialog`, flat spec id sort order
