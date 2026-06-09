# Spec Tab Overview

## Purpose

Studio UI for **Spec Tab Overview**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Spec Tab Overview**.

## Requirements

### Requirement: spec tab polls metadata while visible

While the Overview tab is visible, the view MUST refresh spec detail via `getSpec` on tab-scoped poll ticks. New specs in the tree are already discovered by the global workspace poll.

The Overview presentation MUST also serve as the primary place for spec metadata summary; Studio MUST NOT require a separate **Metadata** tab to read the current spec's identity and description.

### Requirement: linked changes tab lists active changes referencing the current spec

When the user selects the **Linked Changes** center tab, Studio MUST read the embedded `linkedChanges[]` summaries from the current `getSpec()` detail response and list the active changes whose `specIds` include the open spec's `specId`.

Each row SHOULD show:

- change name
- description when present
- lifecycle state with its corresponding state color

The list MUST NOT show unrelated active changes, drafts, or archived items. If no active change references the current spec, the UI MUST show an explicit empty state instead of throwing.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
