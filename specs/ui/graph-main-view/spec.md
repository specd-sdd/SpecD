# Graph Main View

## Purpose

Studio UI for **Graph Main View**: the central workspace view for the Code Graph. It surfaces global graph statistics, index status, and provides a centralized view of high-risk architectural hotspots. Studio UI component: **Graph Main View**.

## Requirements

### Requirement: view renders graph overview and index controls

When `GraphMainView` is active in the central workspace, it MUST display a high-level summary of the codebase's graph state.
The view MUST show the current index status from `projectStatus.graph` on the project poll session store, distinguishing between "Ready", "Stale", and "Off".
When the graph slice includes `warnings[]`, `fingerprintMismatch`, or `currentRef`, the Index Status card MUST surface those diagnostics (not only the coarse Ready/Stale/Off label).
It MUST provide a manual "Reindex" button that triggers `indexGraph({ force: false })` and displays the progress/result in the global Output panel.
It MUST display aggregate counts for Specifications, Files & Docs (code files and documents), and Code Symbols sourced from `projectStatus.graph` (same fields as [`client:dto-project-status`](../../client/dto-project-status/spec.md) graph summary).

### Requirement: view surfaces graph health diagnostics in index status

The Index Status card in `GraphMainView` MUST render graph health diagnostics from `useProjectPollSession().projectStatus.graph`:

- When `warnings[]` is non-empty, MUST show each warning's `message` under the status label (distinct styling per `type` when multiple).
- When `warnings[]` is empty but `stale` or `fingerprintMismatch` is true, MUST show human-readable fallback copy equivalent to Bell notifications.
- When `currentRef` and `lastIndexedRef` are present, MAY show ref context in the card subtitle.

Diagnostics MUST use the same `type` / `message` semantics as [`client:dto-project-status`](../../client/dto-project-status/spec.md); the view MUST NOT recompute staleness or fingerprint mismatch locally and MUST NOT call `getGraphStatus` for the Index Status card.

### Requirement: view surfaces high-impact graph hotspots

The view MUST fetch and display architectural hotspots using the `getHotspots` port method.
It MUST render a list of the most critical symbols (e.g., top 10), showing their `riskLevel` as a Badge (e.g., `CRITICAL` in red), the symbol name and kind, direct/indirect dependencies, and the specs that currently cover them.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:design-system`](../design-system/spec.md) — visual tokens and IDE layout chrome
