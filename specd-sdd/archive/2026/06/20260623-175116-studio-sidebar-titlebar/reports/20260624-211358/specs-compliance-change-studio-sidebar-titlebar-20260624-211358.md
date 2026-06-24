# Spec Compliance Audit: `studio-sidebar-titlebar`

**Change:** `20260623-175116-studio-sidebar-titlebar`  
**Date:** 2026-06-24  
**Mode:** Change audit (`--change studio-sidebar-titlebar`)  
**State at audit:** `archivable`  
**Tests run:** `@specd/ui` 43/43 pass

---

## Executive Summary

| Verdict | **Partial compliance** — core UX implemented; artifact/code gaps are mostly polish, tests, and one intentional design vs delta mismatch |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |

| Category                                | Count                                    |
| --------------------------------------- | ---------------------------------------- |
| Specs audited                           | 10                                       |
| Requirements fully met                  | ~24                                      |
| Partial                                 | ~8                                       |
| Not met (in change scope)               | ~3                                       |
| Pre-existing (out of change scope)      | 2 (desktop window title, close-on-dirty) |
| Verify scenarios without automated test | ~13                                      |

**Strengths:** Platform-specific chrome (darwin vs web/Win/Linux), stacked sidebar panels, center hubs, graph rail-only, poll gating + cache retention, opaque tooltips, Electron titlebar overlay alignment.

**Highest priority before archive (recommended):**

1. Reconcile `ui:sidebar-workspaces-tree` delta with stacked-sidebar design (artifact drift).
2. Fix `ui:sidebar-graph-entry` verify scenario (“expands to Graph section” → center navigation only).
3. Add tests: sidebar persistence restore, poll gating integration, titlebar darwin slot.

---

## Spec: `ui:shell-layout`

### Requirements Summary

Unified titlebar + shadcn sidebar; stacked Changes/Workspaces when expanded; platform layout split; domain hubs; ⌘B + IUserStorage persistence; workspace poll gating.

### Implementation Status — ✅ Substantially compliant

| Requirement                  | Status | Evidence                                          |
| ---------------------------- | ------ | ------------------------------------------------- |
| SidebarProvider + regions    | ✅     | `ShellLayout.tsx`                                 |
| Stacked Changes + Workspaces | ✅     | `StudioSidebarPanels.tsx`                         |
| Platform titlebar layout     | ✅     | `ShellLayout.tsx` `isDarwinChrome`                |
| Embedded toggle (non-darwin) | ✅     | `StudioShellSidebar.tsx`, `StudioSidebarRail.tsx` |
| Hubs with full names/paths   | ✅     | `ChangesHubView.tsx`, `WorkspacesHubView.tsx`     |
| Poll gating                  | ✅     | `ShellLayout.tsx` `workspacesPollEnabled`         |
| Rail does not auto-expand    | ✅     | Test + `handleSelectSidebarSection`               |

### Discrepancies

| ID   | Finding                                                                                                           | Likely cause                                |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| SL-1 | Titlebar secondary icons hidden below `md` (`hidden md:inline-flex`) while spec says inline on all desktop widths | **Partial code** — narrow viewport behavior |
| SL-2 | `useDocumentPlatform()` undefined until first effect → possible one-frame wrong layout                            | **Code polish**                             |
| SL-3 | Dual persistence: shadcn cookie + IUserStorage                                                                    | **Minor** — spec silent on cookie           |

### Test Coverage Gaps

- Sidebar restore from `IUserStorage` ❌
- Shell-level poll gating integration ❌
- Darwin titlebar traffic slot ❌
- Hub row click handlers ❌
- E2E workspaces hub ✅ (`studio.ui.spec.ts`)

---

## Spec: `ui:design-system`

### Implementation Status — ✅ Mostly compliant

| Requirement                  | Status | Evidence                                     |
| ---------------------------- | ------ | -------------------------------------------- |
| Safe zones / titlebar height | ✅     | `globals.css`, `StudioTitlebar.tsx`          |
| 48px icon rail               | ✅     | `--sidebar-width-icon: 3rem`                 |
| Sidebar → panel tokens       | ✅     | `globals.css` `--sidebar-*`                  |
| Popover in Tailwind          | ✅     | `tailwind.config.ts`                         |
| Opaque rail tooltips         | ✅     | `StudioSidebarRail.tsx` `RAIL_TOOLTIP_CLASS` |

### Discrepancies

| ID   | Finding                                                                                   | Likely cause    |
| ---- | ----------------------------------------------------------------------------------------- | --------------- |
| DS-1 | Hub lifecycle badges use ad-hoc Tailwind colors (`sky`, `violet`) not `--studio-*` tokens | **Code polish** |
| DS-2 | Safe-zone pixel tests not automated                                                       | **Test gap**    |

---

## Spec: `ui:hooks-workspaces-specs`

### Implementation Status — ✅ Compliant (poll + cache)

| Requirement                     | Status | Evidence                            |
| ------------------------------- | ------ | ----------------------------------- |
| Tree via `listSpecs`            | ✅     | `use-workspace-specs-collection.ts` |
| Poll when expanded / hub / spec | ✅     | `ShellLayout.tsx`                   |
| Cache when `enabled: false`     | ✅     | `use-async-resource.ts`             |
| Catch-up on re-enable           | ✅     | Tests `use-async-resource.spec.ts`  |

### Discrepancies

| ID   | Finding                                                             | Likely cause                                             |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| HW-1 | Verify mentions `listWorkspaces`; UI uses `getProject().workspaces` | **Spec-drift** — architectural indirection, pre-existing |

### Test Coverage Gaps

- `refreshKey` no-op while `enabled: false` ❌
- Selection preserved across refresh ❌

---

## Spec: `ui:sidebar-changes-in-progress` (+ drafts/archive/discarded no-op)

### Implementation Status — ⚠️ Partial

| Requirement                          | Status | Evidence                                   |
| ------------------------------------ | ------ | ------------------------------------------ |
| Card + ghost Button, navigation only | ✅     | `ChangesSidebar.tsx`                       |
| Truncation                           | ⚠️     | `truncate` present; **no `title` tooltip** |
| Loading state                        | ⚠️     | Error ✅; loading ❌                       |
| SpecdDataPort boundary               | ✅     | Presentational; data from shell            |

---

## Spec: `ui:sidebar-graph-entry`

### Implementation Status — ⚠️ Partial (verify drift)

| Requirement                              | Status | Evidence                             |
| ---------------------------------------- | ------ | ------------------------------------ |
| Stale dot (collapsed) / badge (expanded) | ✅     | `StudioSidebarRail.tsx` + tests      |
| Rail → Graph Main View                   | ✅     | `ShellLayout.tsx`                    |
| No Graph sidebar body                    | ✅     | `StudioSidebarPanels.tsx`            |
| Baseline expanded `GraphSidebarEntry`    | ❌     | Dead code in `WorkspacesSidebar.tsx` |

### Discrepancies

| ID   | Finding                                                                                      | Likely cause                                               |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| SG-1 | Verify says “sidebar expands to Graph section”; implementation opens center only (no expand) | **Artifact drift** — verify contradicts spec body + design |
| SG-2 | `GraphSidebarEntry` unused                                                                   | **Dead code** — baseline superseded by rail-only model     |

---

## Spec: `ui:sidebar-workspaces-tree`

### Implementation Status — ❌ Delta vs implementation mismatch

| Requirement                                   | Status | Evidence                                                      |
| --------------------------------------------- | ------ | ------------------------------------------------------------- |
| Card + ghost Button tree                      | ✅     | `WorkspacesSidebar.tsx`                                       |
| **Tree only when Workspaces section active**  | ❌     | `StudioSidebarPanels` always mounts both blocks when expanded |
| **Poll disabled when Changes section active** | ❌     | `workspacesPollEnabled` true whenever sidebar expanded        |
| Truncation tooltip                            | ⚠️     | `truncate` without `title`                                    |

### Discrepancies

| ID   | Finding                                                                                     | Likely cause                                                        |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| SW-1 | Delta requires section-gated tree; design/tasks implement **stacked** panels always visible | **Artifact drift** — delta not updated for stacked sidebar decision |
| SW-2 | Unit test asserts both panels mounted when Changes active — **contradicts delta**           | **Test aligns with design, not delta**                              |

**Recommendation:** Update `ui:sidebar-workspaces-tree` spec/verify deltas to require stacked visibility + poll when sidebar expanded (matching `ui:shell-layout`), **or** revert implementation to section-gated body (rejected by design).

---

## Spec: `studio-desktop:main-window-manager`

### Implementation Status — ✅ New titlebar requirements met; legacy gaps remain

| Requirement (change delta)           | Status | Evidence        |
| ------------------------------------ | ------ | --------------- |
| macOS `hiddenInset` + traffic lights | ✅     | `main/index.ts` |
| Windows `titleBarOverlay` 44px       | ✅     | `main/index.ts` |
| Preload `platform`                   | ✅     | `bridge.ts`     |
| Drag regions                         | ✅     | `globals.css`   |

| Requirement (baseline, pre-existing)    | Status                                            |
| --------------------------------------- | ------------------------------------------------- |
| Dynamic window title (project/API host) | ❌ Not in this change                             |
| Close prompt on dirty editors           | ❌ In-app guard only; no Electron `close` handler |

---

## Cross-Cutting: Global Specs

### `default:_global/testing`

New tests follow Vitest conventions (`.spec.ts`, given/when/then, no snapshots). Coverage gaps vs verify scenarios documented above — acceptable for MVP but below exhaustive verify coverage.

---

## Detailed Findings by Priority

### P0 — Artifact drift (fix specs, not code)

1. **SW-1** — `sidebar-workspaces-tree` delta vs stacked sidebar design.
2. **SG-1** — Graph verify “expand to Graph section” vs rail-only center navigation.

### P1 — Tests (implementation correct; add coverage)

1. Sidebar collapsed state restore from storage.
2. Poll gating: no fetch when collapsed + changes-hub.
3. `StudioTitlebar` darwin traffic slot / non-darwin no titlebar toggle.
4. Hub view unit tests.

### P2 — Polish (optional)

1. **DS-1** — Hub badge semantic tokens.
2. **SL-2** — Sync `data-platform` read on first render.
3. **Changes/Workspaces** — `title` on truncated rows; loading indicators.
4. Remove dead `GraphSidebarEntry` or document as legacy.

### P3 — Pre-existing / follow-up change

1. Desktop dynamic window title.
2. Desktop close-on-dirty window handler.

---

## Aggregate Counts

| Spec                               | Met | Partial | Not met |
| ---------------------------------- | --- | ------- | ------- |
| ui:shell-layout                    | 5   | 2       | 0       |
| ui:design-system                   | 3   | 1       | 0       |
| ui:hooks-workspaces-specs          | 1   | 1       | 0       |
| ui:sidebar-changes-in-progress     | 2   | 2       | 0       |
| ui:sidebar-graph-entry             | 4   | 1       | 1       |
| ui:sidebar-workspaces-tree         | 2   | 1       | 2       |
| studio-desktop:main-window-manager | 7   | 0       | 2\*     |

\*Desktop title/close are baseline gaps, not regressions from this change.

---

## Recommended Next Steps

Per compliance audit policy — choose one:

1. **Update Specs** — Fix `sidebar-workspaces-tree` + `sidebar-graph-entry` verify deltas to match stacked-sidebar / rail-only design (`/specd-design studio-sidebar-titlebar`).
2. **Fix Implementation** — Only if you want section-gated workspace tree (contradicts approved design).
3. **Both** — Update artifacts first, then add P1 tests via `/specd-implement`.
4. **Proceed** — Accept partial compliance; archive with known test/artifact follow-ups.

---

_Report generated by specd-compliance audit. Read-only — no code or spec files modified._
