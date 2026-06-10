# Change Tab Events

## Purpose

Studio UI for **Change Tab Events**: lifecycle history from `ChangeDetailDto.history`, loaded through `SpecdDataPort` and rendered as expandable accordions. Works for **active** and **archived** changes (archived detail comes from `getArchivedChange`).

## Requirements

### Requirement: events tab renders change detail history

The Events tab MUST render `history[]` from the loaded `ChangeDetailDto` passed by the shell. It MUST NOT call artifact or graph endpoints. For **active** changes, while Events (or Overview) is visible, the shell MUST refetch detail via `getChange` when the global change poll tick advances (`useChangesRead` with `detailRefreshKey`). For **drafted** and **discarded** changes, the shell MUST refetch via `getDraft` / `getDiscarded` through the same hook with the correct `listSection`. For **archived** changes, history MUST come from the archived snapshot (`getArchivedChange`) without live polling.

### Requirement: history list is newest first

The UI MUST display events in reverse chronological order (most recent at the top) without mutating the DTO order on the wire.

### Requirement: events render as expandable accordions

Each history row MUST be a collapsible accordion item using the shadcn **`Accordion`** component (with `type="multiple"`). The interaction pattern MUST be consistent with change **Artifacts** type groups (`ui:change-tab-artifacts`): chevron, clickable header, `aria-expanded`.

- **Collapsed:** summary shows `type`, `at`, and a single-line actor when `by` is present.
- **Expanded:** panel shows `by` when present, then **all other fields** on `ChangeHistoryEventDto` except `type` and `at` (e.g. `from`/`to`, `cause`, `specIds`, `artifactHashes`, sync deltas) as labeled rows. Object or array values MAY render in a scrollable monospace block (`max-height` capped). When no extra fields exist, the panel MUST show a short empty-state message.
- **Toggle:** clicking the header expands or collapses that row only; multiple rows MUST stay open at once.

### Requirement: view uses SpecdDataPort hooks only

`ChangeEventsTab` MUST receive detail via parent hooks (`useChangesRead` / `useArchivedChange`) and MUST NOT import `@specd/core`.

### Requirement: view surfaces loading and error states

While detail is loading or fails, the tab MUST show `Loading history…`, a human-readable error, or `No change detail` — matching other change tabs.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:dto-change-detail`](../../client/dto-change-detail/spec.md) — `history[]` wire shape
- [`ui:change-tab-artifacts`](../../ui/change-tab-artifacts/spec.md) — accordion interaction pattern
