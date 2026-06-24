# Proposal: studio-sidebar-titlebar

## Motivation

SpecD Studio's shell still uses a marketing-style top bar with embedded branding and a
always-visible sidebar split into three vertically resizable panels. That layout wastes
horizontal space, does not match the Cursor/VS Code IDE pattern users expect, and places
secondary chrome on the right where native window controls on Windows and Linux will
overlap interactive buttons.

## Current behaviour

- `StudioTopBar` (48px) shows **SpecD Studio** branding, search, New Change, Docs,
  Notifications, and Theme toggle.
- The left sidebar is a horizontal `ResizablePanel` containing a vertical split of
  **Changes**, **Workspaces – Specs**, and **Graph** sections — all visible at once.
- There is no collapse/expand toggle; sidebar width is resizable but never hides content
  behind an activity rail.
- Electron desktop uses a standard `BrowserWindow` with no custom titlebar integration;
  the renderer does not receive platform safe-area hints for traffic lights or window
  controls.
- `ui:hooks-workspaces-specs` verify already describes skipping tree poll when the
  workspace panel is hidden, but the shell never hides that panel today.

## Proposed solution

Replace the current top bar + stacked sidebar with a **Cursor-like shell**:

| Area                  | Change                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Titlebar**          | Lean **44px** bar spanning full shell width: traffic-light slot (macOS) + sidebar toggle, command-palette search (⌘K), New Change, **inline** Docs/Bell/Theme on all hosts; no branding |
| **Sidebar expanded**  | ~16rem; header shows **SpecD Studio** (+ optional project label); rail icons; **Changes + Workspaces stacked** (both visible); no Graph sidebar body                                    |
| **Sidebar collapsed** | Fixed **48px** icon rail with badges and tooltips                                                                                                                                       |
| **Center hubs**       | Changes / Workspaces rail → full-name hub views in center; Graph → center graph only                                                                                                    |
| **Platform chrome**   | CSS safe zones: **~96px** left slot on macOS (traffic lights + toggle gap), ~138px right on Windows/Linux; sidebar starts below titlebar                                                |
| **Keyboard**          | ⌘B / Ctrl+B toggles expanded ↔ collapsed; state persisted in `IUserStorage`                                                                                                             |
| **Desktop**           | `titleBarStyle: hiddenInset` (macOS) / `titleBarOverlay` 44px (Windows); expose `platform` to renderer                                                                                  |

Web and desktop hosts show titlebar secondary actions **inline** (no default overflow menu).

## Specs affected

### New specs

- none

### Modified specs

- `ui:shell-layout`: Replace vertically stacked resizable Changes/Workspaces panels with
  activity-rail navigation and collapsible sidebar; integrate unified titlebar; wire poll
  skip when workspace section is not visible.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:design-system`: Add titlebar height, platform safe-area tokens, activity-rail chrome,
  sidebar collapse transition, and overflow-menu pattern for desktop hosts.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:hooks-workspaces-specs`: Clarify poll-skip when sidebar is collapsed or Workspaces
  section is not the active rail selection.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-changes-in-progress`: Render inside the Changes section of the new sidebar
  model; no layout change to list behaviour.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-changes-drafts`: Same — section host changes only.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-changes-archive`: Same — section host changes only.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-changes-discarded`: Same — section host changes only.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-workspaces-tree`: Render inside the Workspaces section; poll only when that
  section is visible in expanded sidebar.
  - Depends on (added): none
  - Depends on (removed): none

- `ui:sidebar-graph-entry`: Provide rail icon + stale badge signal; open Graph main view
  unchanged.
  - Depends on (added): none
  - Depends on (removed): none

- `studio-desktop:main-window-manager`: Custom titlebar (hiddenInset / titleBarOverlay),
  traffic-light positioning, and renderer `platform` exposure for safe-area CSS.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

| Area             | Files / packages                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UI shell         | `packages/ui/src/shell/ShellLayout.tsx`, new/refactored titlebar + sidebar components, `StudioTopBar.tsx` (migrate or replace), `globals.css` |
| Sidebar sections | `ChangesSidebar.tsx`, `WorkspacesSidebar.tsx`, `GraphSidebarEntry` wiring                                                                     |
| Desktop          | `apps/specd-studio-desktop/src/main/index.ts`, preload bridge (`platform` field)                                                              |
| Web              | `apps/specd-studio-web` — consumes same `@specd/ui` shell; no separate layout                                                                 |
| Tests            | Studio e2e / component tests for collapse, safe zones, ⌘B                                                                                     |
| Storage          | `IUserStorage` keys for sidebar collapsed state and expanded width                                                                            |

No API, core, or `SpecdDataPort` contract changes. Graph risk: **LOW** (ShellLayout,
StudioTopBar, desktop main entry).

## Technical context

Decisions from discovery (see `.specd-exploration.md`):

- **Collapsed state = 48px icon rail**, not 0px — changes/specs/graph are primary nav.
- **Branding moves to sidebar header** when expanded; hidden when collapsed.
- **One active sidebar section** replaces three vertically resizable stacked panels.
- **Overflow menu (⋯)** on desktop for Docs, Notifications, Theme — avoids Win/Linux
  window-control overlap (~138px right safe zone).
- **New Change stays visible** in titlebar on all hosts.
- **Toggle placement:** macOS titlebar after traffic lights; Windows/Linux left titlebar
  (never in the right safe zone).
- **⌘B / Ctrl+B** toggle; persist collapsed + width in `IUserStorage`.
- Electron: `titleBarStyle: 'hiddenInset'` + `trafficLightPosition` on darwin;
  `titleBarOverlay` on win32.

Rejected alternatives:

- Fully hidden sidebar (0px) — too much reliance on command palette.
- Keeping branding in both titlebar and sidebar — redundant.
- Placing Docs/Bell/Theme on the right on desktop without safe zone — eaten by window
  controls.

## Open questions

All resolved for design:

1. **Overflow vs status bar for secondary actions?** → **Overflow menu (⋯)** on desktop;
   web shows inline buttons.
2. **New Change in Changes section header?** → **Titlebar only** in v1; Changes section
   header shows section title only.
3. **Web vs desktop parity?** → **Web inline, desktop overflow** for Docs/Notifications/Theme.
