# Tasks: studio-sidebar-titlebar

## 1. Design tokens and platform attribute

- [x] 1.1 Add titlebar safe-zone, popover, and shadcn sidebar width CSS tokens
      `packages/ui/src/styles/globals.css` — `--studio-safe-*`, `--popover`,
      `--sidebar-width-icon: 3rem`, `--studio-titlebar-height: 2.75rem` (44px), darwin left inset **6rem** (~96px)
      (Req: titlebar respects platform window-control safe zones, activity rail density)

- [x] 1.2 Set data-platform on web hosts
      `packages/ui/src/SpecdApp.tsx` — `data-platform` on mount
      (Req: titlebar respects platform window-control safe zones)

- [x] 1.3 Align sidebar theme tokens with Studio panel palette
      `globals.css` — `--sidebar-*` alias `--panel`, `--accent`, `--border`; remove shadcn `.dark` zinc override
      (Req: activity rail and titlebar use IDE-native density)

## 2. Desktop window chrome

- [x] 2.1 Configure custom titlebar in Electron main process
      `apps/specd-studio-desktop/src/main/index.ts` — `hiddenInset` / `titleBarOverlay` height **44**
      aligned with CSS; `trafficLightPosition` `{ x: 12, y: 16 }` on darwin
      (Req: main window uses integrated custom titlebar on desktop)

- [x] 2.2 Expose platform via preload bridge
      `apps/specd-studio-desktop/src/preload/bridge.ts` + renderer `data-platform`
      (Req: main window uses integrated custom titlebar on desktop)

## 3. shadcn Sidebar primitive

- [x] 3.1 Add shadcn Sidebar component to @specd/ui
      `packages/ui/src/components/ui/sidebar.tsx`
      (Req: shell provides sidebar tabs inspector and bottom panel regions)

## 4. Titlebar component

- [x] 4.1 Create StudioTitlebar from StudioTopBar
      `packages/ui/src/shell/StudioTitlebar.tsx` — `SidebarTrigger`, safe-zone padding
      (Req: shell provides unified titlebar for global actions)

- [x] 4.2 Desktop titlebar: inline secondary icons (remove default overflow)
      `StudioTitlebar.tsx` — Docs, Notifications, Appearance inline on **all** hosts;
      search bar flex-shrinks; reserve `--studio-safe-right` on win32 only for window buttons
      (Req: shell provides unified titlebar for global actions)

- [x] 4.3 Wire titlebar full-width above sidebar + main split
      `ShellLayout.tsx` — titlebar as first child of `SidebarProvider` (not inside `SidebarInset` only)
      (Req: shell provides unified titlebar for global actions)

- [x] 4.4 macOS desktop: traffic-light slot before sidebar toggle
      `StudioTitlebar.tsx` + `globals.css` — `studio-titlebar-traffic-slot` on darwin desktop;
      `SidebarTrigger` immediately after semaphore zone
      (Req: shell provides unified titlebar for global actions)

## 5. Modular studio sidebar (`studio-sidebar/`)

- [x] 5.1 Split sidebar into focused modules
      Create `shell/studio-sidebar/studio-sidebar-types.ts`,
      `StudioSidebarRail.tsx`, `StudioSidebarPanels.tsx`; slim `StudioShellSidebar.tsx` facade;
      remove monolithic `shell/StudioShellSidebar.tsx`
      (Req: shell provides sidebar tabs inspector and bottom panel regions)

- [x] 5.2 Stack Changes + Workspaces blocks when expanded
      `StudioSidebarPanels.tsx` — vertical stack of `ChangesSidebar` + `WorkspacesSidebar`;
      both visible when sidebar open (no single-section swap)
      (Req: shell provides sidebar tabs inspector and bottom panel regions)

- [x] 5.3 Rail badges and graph action
      `StudioSidebarRail.tsx` — `SidebarMenuBadge` corner badges (change count, graph stale dot);
      Graph click → center graph only; Changes/Workspaces → hub + optional expand
      (Req: graph activity rail icon reflects stale index state)

- [x] 5.4 Fix sidebar tooltips
      Theme popover tokens + rail tooltip classes (`bg-panel`, opaque)
      (Req: activity rail and titlebar use IDE-native density)

- [x] 5.5 Offset sidebar below titlebar
      `StudioShellSidebar.tsx` — fixed sidebar `top: var(--studio-titlebar-height)` so macOS
      traffic lights do not overlap sidebar header
      (Req: shell provides sidebar tabs inspector and bottom panel regions)

## 6. Center domain hubs (`hubs/`)

- [x] 6.1 Add ChangesHubView
      `shell/hubs/ChangesHubView.tsx` — counts, full-name table, lifecycle badges, row → open change
      (Req: shell provides center domain hubs for changes)

- [x] 6.2 Add WorkspacesHubView
      `shell/hubs/WorkspacesHubView.tsx` — per-workspace spec list, full paths, validation badges
      (Req: shell provides center domain hubs for workspaces specs)

- [x] 6.3 Wire hubs in ShellLayout centerCtx
      `ShellLayout.tsx` — kinds `changes-hub`, `workspaces-hub`; rail dispatches; keep orchestration thin
      (Req: shell provides center domain hubs for changes)

## 7. Collapse state, keyboard, and persistence

- [x] 7.1 SidebarProvider collapse + ⌘B
      (Req: sidebar collapse state is keyboard-toggleable and persisted)

- [x] 7.2 Persist collapse in IUserStorage
      (Req: sidebar collapse state is keyboard-toggleable and persisted)

- [x] 7.3 Update poll gating for stacked sidebar + hubs
      `enabled: sidebarOpen || centerCtx.kind === 'workspaces-hub' || centerCtx.kind === 'spec'`
      (Req: workspace tree poll skips when Workspaces section is not visible)

## 8. Tests and verification

- [x] 8.1 UI tests for collapse and poll gating
      (Req: sidebar collapse state is keyboard-toggleable and persisted)

- [x] 8.2 Tests for hubs and stacked panels
      `test/shell/` — stacked panels mounted when expanded; rail expand on workspaces click
      (Req: shell provides center domain hubs for changes)

- [x] 8.3 Update studio e2e selectors
      `studio.ui.spec.ts` — workspaces hub `data-testid`, rail navigation
      (Req: Layout renders titlebar sidebar and inspector regions)

- [x] 8.4 Manual desktop verification
      macOS traffic-light clearance (no overlap on sidebar), toggle after semaphores, inline icons, 44px titlebar
      (Req: main window uses integrated custom titlebar on desktop)

## 9. Platform chrome, tooltips, and spec cache

- [x] 9.1 Non-darwin layout: sidebar full height, titlebar over main column only
      `ShellLayout.tsx` — `useDocumentPlatform`; darwin keeps full-width titlebar row;
      web/win32/linux wrap `SidebarInset` + titlebar in right column
      (Req: shell provides unified titlebar for global actions)

- [x] 9.2 Embedded sidebar toggle on non-darwin hosts
      `StudioShellSidebar.tsx` + `StudioSidebarRail.tsx` — toggle in header when expanded;
      first collapsed rail item + divider; `StudioTitlebar` `showSidebarTrigger={false}`
      (Req: shell provides unified titlebar for global actions)

- [x] 9.3 Opaque sidebar tooltips
      `tailwind.config.ts` — `popover` theme colors; `StudioSidebarRail.tsx` — shared opaque tooltip class
      (Req: activity rail and titlebar use IDE-native density)

- [x] 9.4 Retain workspace spec cache when poll paused
      `use-async-resource.ts` — keep `data` when `enabled: false`; catch-up refetch when re-enabled
      with newer `refreshKey`; `test/use-async-resource.spec.ts`
      (Req: workspace tree poll skips when Workspaces section is not visible)

## 10. Compliance audit follow-up

- [x] 10.1 Align sidebar-workspaces-tree deltas with stacked sidebar design
      (Req: workspace tree renders in stacked Workspaces panel when sidebar expanded)

- [x] 10.2 Fix sidebar-graph-entry verify (rail opens center, no sidebar expand)
      (Req: graph activity rail icon reflects stale index state)

- [x] 10.3 P1 tests: titlebar platform chrome, poll gating, sidebar persistence
      `test/shell/studio-titlebar.spec.tsx`, `workspaces-poll-enabled.ts`, storage + async-resource tests
      (Req: shell provides unified titlebar; workspace tree poll skips when not visible)
