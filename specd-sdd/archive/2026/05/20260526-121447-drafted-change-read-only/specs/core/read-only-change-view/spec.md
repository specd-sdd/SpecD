# ReadOnlyChangeView

## Purpose

Drafted and discarded changes are loaded for display and audit without exposing a mutable `Change` aggregate. `ReadOnlyChangeView` is the shared read-only contract for those projections. `DraftedChangeView` and `DiscardedChangeView` extend it with storage-specific fields.

## Requirements

### Requirement: Shared read-only surface

`ReadOnlyChangeView` MUST define the common read accessors required for non-active change display:

- `name`, `createdAt`, `description`
- `state` (derived lifecycle state at time of load)
- `specIds`, `workspaces`
- `schemaName`, `schemaVersion`
- `artifacts` — read-only view of artifact aggregate state (status, file keys; not file content)
- `history` — read-only view of append-only events when needed for display

Types that extend `ReadOnlyChangeView` MUST NOT add mutating methods. They MUST NOT expose `transition`, `updateSpecIds`, `draft`, `restore`, `discard`, `invalidate`, approval mutators, or any other operation that appends events or mutates artifact state.

### Requirement: No escape hatch to mutable Change

Implementations of `ReadOnlyChangeView` (including `DraftedChangeView` and `DiscardedChangeView`) MUST NOT provide a public accessor that returns the wrapped `Change` instance (for example `change`, `unwrap`, or `toChange`).

Only `ChangeRepository` internals (`mutateDraft`, `save` during allowed draft mutations, and the shared read-only facade factory) MAY hold the mutable aggregate.

### Requirement: Shared implementation

The core package MUST provide a single internal facade class (for example `ReadOnlyChangeFacade`) that implements both `DraftedChangeView` and `DiscardedChangeView` by wrapping one loaded `Change`.

The package MUST expose factory functions:

- `toDraftedChangeView(change: Change): DraftedChangeView` — throws if `!change.isDrafted`
- `toDiscardedChangeView(change: Change): DiscardedChangeView` — throws if the latest history event is not `discarded`

`ChangeRepository.getDraft`, `getDiscarded`, `listDrafts`, and `listDiscarded` MUST map persisted manifests through these factories (or equivalent private construction in the same module). Callers MUST NOT construct facades from arbitrary in-memory `Change` instances in production code.

### Requirement: Artifact content

Loading artifact file content remains the responsibility of `ChangeRepository.artifact` and related port methods when invoked with the correct storage context. `ReadOnlyChangeView` types MUST NOT include artifact body content.

## Constraints

- `ReadOnlyChangeView` is a TypeScript interface contract, not a replacement for the `Change` entity.
- Active changes continue to use `Change` via `get` / `mutate`.

## Spec Dependencies

- [`core:change`](../../../../specs/core/change/spec.md) — source aggregate
