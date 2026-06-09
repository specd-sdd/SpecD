# Change Tab Coverage

## Purpose

Studio UI for **Change Tab Coverage**: implementation footprint for an active change — manifest
**accepted links** and **tracked files**, merged with change-scoped **code-graph** coverage.
Studio UI component: **Change Tab Coverage**.

## Requirements

### Requirement: coverage tab loads manifest tracking and graph view

While this change tab is visible for an **active** change, the view MUST load:

1. `getImplementationReview(name)` — manifest `implementationTracking.links` and `implementationTracking.trackedFiles`
2. `getChangeGraphView(name)` — per-spec `coveredFiles` / `coveredSymbols`

Both MUST refresh on tab-scoped poll ticks. Polling MUST pause when the tab is hidden or the window lacks focus. Archived changes MUST NOT call these endpoints (read-only messaging only).

The visible tab label MUST be `Coverage`.

For **drafted**, **discarded**, and **archived** changes, implementation coverage is not available
in Studio v1. The Coverage tab MUST be hidden (not selectable) for these sections.

### Requirement: coverage is grouped by spec

The UI MUST render one card per spec ID (union of change `specIds`, manifest links, and graph coverage), ordered per [`ui:design-system`](../design-system/spec.md). Within each card, subsections appear in order:

1. **Accepted links** — manifest links for that spec, merged with matching code-graph files/symbols for the link file
2. **Graph (not linked)** — graph symbols first, then graph files, for that spec not covered by an accepted link (omitted when empty)
3. **Tracked · resolved**, then **open**, then **ignored** — tracked files assigned to that spec when uniquely matchable via links or graph paths

Tracked files that match zero or multiple specs MUST appear under a final **Tracked files (unassigned)** section.

### Requirement: empty specs are omitted

Spec cards with no accepted links, no graph-only rows, and no tracked files MUST NOT be rendered.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`ui:design-system`](../design-system/spec.md) — flat spec id sort order
- [`client:port-changes-read`](../../client/port-changes-read/spec.md) — `getImplementationReview`
- [`client:dto-implementation-review`](../../client/dto-implementation-review/spec.md) — wire shape for manifest tracking
- [`client:dto-change-graph-view`](../../client/dto-change-graph-view/spec.md) — graph coverage rows
- [`client:port-graph`](../../client/port-graph/spec.md) — `getChangeGraphView`
- [`api:dto-implementation-review`](../api/dto-implementation-review/spec.md) — `GET .../implementation-review` JSON
