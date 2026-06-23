# Sidebar Changes Archive

## Purpose

Studio UI for **Sidebar Changes Archive**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Studio UI component: **Sidebar Changes Archive**.

## Requirements

### Requirement: sidebar renders global poll data and wires actions

The sidebar MUST render lists from global poll hooks (`hooks-changes-collection`, `hooks-workspaces-specs`, etc.). Row actions (open, restore, discard) MUST call the appropriate mutate port methods.

### Requirement: archive row opens archived snapshot not active change

When the user selects a row in the Archive section, Studio MUST call `getArchivedChange(name)` via `port-archived-changes` and MUST NOT call `getChange` or `getChangeStatus` for that name. The shell MUST mark the center context as archived read-only.

### Requirement: archive rows show name only without per-row state or archive action chrome

Rows in the Archive section MUST display the change `name` only. They MUST NOT repeat an `archived` state label on each row (the section heading already identifies the list). They MUST NOT show a hover archive icon or other row action that implies archiving again.

### Requirement: view uses SpecdDataPort hooks only

Components MUST consume data through `SpecdDataPort` hooks and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While requests are in flight or fail, the UI MUST show loading indicators and human-readable errors (including HTTP 409 on save conflicts where applicable).

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
