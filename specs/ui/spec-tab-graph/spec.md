# Spec Tabs Coverage and Impact

## Purpose

Studio UI for **Spec Tabs Coverage and Impact**: user-visible graph-derived views for a selected
spec, driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tabs Coverage
and Impact**.

## Requirements

### Requirement: spec coverage and impact tabs poll graph data while visible

While the Coverage tab is visible, the view MUST load spec-scoped graph coverage via
`getSpecGraphView(workspace, specPath)` on tab-scoped poll ticks. While the Impact tab is visible,
the view MUST load graph impact via `getImpact({ spec })` on tab-scoped poll ticks. New specs in
the tree are already discovered by the global workspace poll.

The visible graph-derived tab labels MUST be `Coverage` and `Impact`. `Graph` MUST NOT be shown as
the visible tab title.

The Coverage panel MUST render the returned coverage using the same visual language as the change
`Impact` tab rather than raw JSON:

1. spec card header with the current `specId`
2. `Symbols` subsection listing covered graph symbols with location context
3. `Files` subsection listing covered graph files

The Coverage `Files` subsection MUST expand naturally with content and MUST NOT impose an internal
scroll region for ordinary file lists.

The Impact panel MUST render graph impact using the same visual language as the change `Impact`
tab, including aggregate metrics plus ordered subsections:

1. `Specs`
2. `Symbols`
3. `Files`

The Impact summary header MUST expose the same key aggregate counts surfaced by the CLI graph
impact command: risk level, direct/indirect/transitive dependency counts, affected file count, and
affected spec count.

When a graph-derived panel has no data, it MUST show an empty-state message instead of a JSON
block.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
