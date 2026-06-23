# Shell Layout

## Purpose

SpecD Studio is a spec-work IDE: sidebars for changes and workspaces, a tabbed editor area, inspector for artifacts, and a bottom panel (Output, Problems, Logs). The shell also orchestrates global polling so agent activity off-screen (new changes, specs on disk) appears without keeping every change tab on a heavy refresh loop.

## Requirements

### Requirement: shell provides sidebar tabs inspector and bottom panel regions

The layout MUST render a left sidebar (changes, workspaces, graph entry), a central tab workspace, a right-hand inspector host, and a bottom panel host with three tabs in order **Output**, **Problems**, **Logs** (full studio output stream; warn/error filter; specd in-memory log readback). The default selected bottom tab MUST be **Output**.

The left sidebar sections for **Changes** and **Workspaces - Specs** MUST be vertically resizable. The shell MUST implement this using shadcn **`Resizable`** panel group components, allowing the user to adjust the proportion of the sidebar allocated to each section.

### Requirement: shell orchestrates global polling while focused

While the Studio window has focus, a **global poll** every **2–3 seconds** refreshes project scope without requiring an open change tab:

- `ui:hooks-project` → `getProject`, `getProjectStatus`
- `ui:hooks-changes-collection` + sidebars → list changes, drafts, discarded, archived, overlaps
- `ui:hooks-workspaces-specs` + workspace tree → spec tree metadata
- Graph entry → cheap `graph/status`

### Requirement: editor area tabs support horizontal scrolling and navigation arrows

When the central tab workspace or right-hand inspector host contains more tabs than the available width, the tab bar MUST support fluid horizontal scrolling (e.g. via trackpad or mouse wheel). Navigation arrows (← and →) MUST appear at the right end of the tab bar when desbordamiento exists, allowing the user to scroll programmatically. Arrows MUST be disabled visually when the scroll limit is reached in their respective direction.

### Requirement: tab views display context via breadcrumbs

To stabilize tab bar height and provide persistent context, change and spec tab views MUST display their qualified name or path (e.g. `CHANGES / <name>` or `SPECS / <path>`) in a thin breadcrumb header immediately above the horizontal tab bar. The tab bar itself MUST remain single-line and MUST NOT contain trailing name/path metadata that could cause height jumps on narrow viewports.

### Requirement: global polling pauses when the window is unfocused

The global poll interval MUST NOT run while the browser window or Electron app lacks focus.

### Requirement: shell never imports @specd/core

All data MUST flow through `SpecdDataPort` hooks; direct `@specd/core` imports are forbidden.

### Requirement: shell applies design-system theme at application root

`SpecdApp` MUST import the centralized theme from `ui:design-system` (CSS variables or equivalent) before any feature chrome renders. Shell regions (sidebar, tabs, inspector, bottom panel, status bar) MUST consume design tokens—not ad hoc colors or card-dashboard styling.

### Requirement: shell routes archived changes through archived read port

When the user opens a change from the Archive sidebar section, the shell MUST load detail via `getArchivedChange`, MUST skip active-change status polling, and MUST disable inspector save and validate. Archived artifact body reads MUST use the archived read-only artifact route, not active `getChangeArtifact`.

### Requirement: shell routes drafted and discarded changes through read-only ports

When the open change name appears in the **Drafts** or **Discarded** sidebar collection (and not archived), the shell MUST set `listSection` to `draft` or `discarded` and MUST pass it to [`ui:hooks-changes-read`](../hooks-changes-read/spec.md) (`useChangesRead`, `useChangeArtifact`, and artifact list hooks). The shell MUST NOT call `getChange` or `getChangeStatus` for that name while it is shelved or discarded. Shelved read-only MUST mirror archived UX boundaries: banner in the center column, no Save/Validate in the inspector, Monaco `readOnly`, Overview editors disabled — without altering the archived snapshot flow (`getArchivedChange`, archived banner, archived artifact list/body reads).

### Requirement: read-only change tabs load once (no per-change polling)

Global sidebar polling continues to refresh the lists, but the open drafted/discarded/archived change views are static. The shell MUST NOT schedule per-change polling (status, artifacts, tab refresh keys) for these read-only sections. Drafted changes MAY load workflow status once on open, but MUST NOT poll while kept open.

### Requirement: validate requires drift confirmation

**Validate** and **Validate All** MUST show [`ui:validate-confirm-dialog`](../validate-confirm-dialog/spec.md) before calling `validateChange`. Scoped validate MUST pass `specId` and `artifactId` derived from the open change artifact; **Validate All** MUST validate each spec in `change.specIds`.

The **Validate All** action MUST be offered from the change **Artifacts** tab and the **Command Palette** (as "Validate change artifacts"), but only when a valid, editable change is currently selected. Change tabs that require live change APIs (Tasks, Coverage, Context) MUST show read-only messaging for archived context. Workflow and validation status from `getChangeStatus` MUST appear on the Overview tab only (not a separate Validation tab).

### Requirement: shell delegates tab-scoped polling to visible center tabs

The global poll refresh key MUST NOT force every change or spec tab to refetch. Child views MUST adopt the latest global tick only while their tab is visible (frozen refresh key while hidden) so Artifacts, Tasks, spec Overview/Dependencies, and similar tabs do not reload in the background.

### Requirement: opening a spec auto-selects the primary artifact

When the user opens a spec in the workspace tree and that spec exposes a canonical `spec.md` artifact, the shell MUST preselect that `spec.md` artifact in the right inspector automatically.

### Requirement: bottom panel polls only the remote logs channel

`readProjectLogs` polling MUST run only while **Logs** is active. **Output** and **Problems** MUST render from local session state and MUST NOT poll a dedicated studio-specific output endpoint. Switching bottom tabs MUST NOT append output lines.

### Requirement: metadata and artifact saves log to Output

Artifact save ([`ui:hooks-inspector-save`](../hooks-inspector-save/spec.md)), description/policy PATCH, successful scope dialog save, and validation MUST append to the local output buffer consumed by [`ui:bottom-panel-output`](../bottom-panel-output/spec.md). Debug traces MUST call `appendProjectLog` with the **action id** as the message and user text in `context` only (not a duplicate log line). Validation with warnings or errors SHOULD select the **Problems** tab; other actions SHOULD select **Output**.

### Requirement: graph sidebar opens central overview

Opening the graph entry from the sidebar MUST switch the central workspace to the **Graph Main View**; it MUST NOT append a graph status line to the local output buffer.

### Requirement: shell orchestrates global command and search navigation

The shell MUST host a global **Command Palette** (⌘K) and orchestrate navigation from search results:

- Selection of a **Specification** in the palette MUST open that spec in the central workspace.
- Selection of a **Code Symbol** MUST (in v1) log the selection to Output; subsequent versions MAY implement direct source file navigation.
- Selection of a **Document** MUST (in v1) log the selection to Output.

## Spec Dependencies

- [`ui:design-system`](../design-system/spec.md) — visual tokens, IDE layout chrome, motion
- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
