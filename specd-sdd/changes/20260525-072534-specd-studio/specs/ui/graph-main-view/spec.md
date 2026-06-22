# Graph Main View

## Purpose

Studio UI for **Graph Main View**: the central workspace view for the Code Graph. It surfaces global graph statistics, index status, and provides a centralized view of high-risk architectural hotspots. Studio UI component: **Graph Main View**.

## Requirements

### Requirement: view renders graph overview and index controls

When `GraphMainView` is active in the central workspace, it MUST display a high-level summary of the codebase's graph state.
The view MUST show the current index status (`getGraphStatus`), distinguishing between "Ready", "Stale", and "Off".
It MUST provide a manual "Reindex" button that triggers `indexGraph({ force: false })` and displays the progress/result in the global Output panel.
It MUST display aggregate counts for Specifications, Files & Docs (code files and documents), and Code Symbols sourced from the graph status.

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
