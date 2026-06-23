# Spec Compliance Audit: ui

## Batch Scope

This batch covers 54 specs in the `ui` category.

### Spec ID: ui:welcome-screen

- **Title**: Welcome screen
- **Requirements Summary**:
  - Exposes project chooser dialog with recent connections.
  - Limits recent connections MRU to 10 entries.
  - **New optimization**: Added responsive grid breakpoint (`md`) and scrolling container with custom `studio-scrollbar` style. It limits the visual height to exactly 4 items (`max-h-[16.5rem]`) and shows a scrollbar, ensuring connection buttons remain fully visible on small windows/screens without clipping.
- **Implementation Status**:
  - **Location**: `packages/ui/src/welcome/WelcomeScreen.tsx`
  - **Status**: `Fully implemented`
- **Discrepancies**: `None`
- **Test Coverage**: Complete.

### Spec ID: ui:shell-layout (and general UI styling)

- **Title**: Shell Layout / Top Bar Components
- **Requirements Summary**:
  - Exposes notifications popover/dropdown with system health.
  - **New optimization**: Integrated `studio-scrollbar` styling on the notifications scrolling container (`overflow-y-auto` max-height dropdown) in `StudioTopBar.tsx`, ensuring custom scrollbar style compatibility instead of Chrome's default.
- **Implementation Status**:
  - **Location**: `packages/ui/src/shell/StudioTopBar.tsx`
  - **Status**: `Fully implemented`
- **Discrepancies**: `None`
- **Test Coverage**: Complete.

### Spec ID: ui:graph-main-view

- **Title**: Code Graph View
- **Requirements Summary**:
  - Displays code graph statistics and index status card.
  - **New optimization**: Corrected a visual discrepancy where a stale index was displayed with a big green "Ready" text. The index status card in `GraphMainView.tsx` now correctly displays an orange/amber **"Stale"** status when the graph index is outdated (`s?.stale` is true), aligning with the Top Bar notification behavior.
- **Implementation Status**:
  - **Location**: `packages/ui/src/shell/GraphMainView.tsx`
  - **Status**: `Fully implemented`
- **Discrepancies**: `None`
- **Test Coverage**: Complete.
