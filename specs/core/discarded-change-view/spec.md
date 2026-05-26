# DiscardedChangeView

## Purpose

Callers that inspect a discarded change need read access to persisted state without receiving a mutable `Change` aggregate. `DiscardedChangeView` extends [`core:read-only-change-view`](read-only-change-view/spec.md) for terminal changes stored under `discarded/`. It is constructed by the repository or `GetDiscarded` and MUST NOT expose mutating `Change` methods.

## Requirements

### Requirement: Extends ReadOnlyChangeView

`DiscardedChangeView` MUST extend `ReadOnlyChangeView` with all shared read accessors defined there.

### Requirement: Discarded-specific surface

`DiscardedChangeView` MUST additionally expose read accessors derived from the terminal `discarded` history event, including at minimum:

- `discardReason` — the `reason` from the latest `discarded` event
- `discardedAt` — the `at` timestamp from that event
- `discardedBy` — the `by` actor from that event
- `supersededBy` — optional `supersededBy` from that event when present

Every `DiscardedChangeView` instance MUST correspond to a change whose latest history event is `discarded`.

### Requirement: Construction

Only `ChangeRepository` (or test doubles of the port) and `GetDiscarded` MAY construct `DiscardedChangeView` instances from a persisted discarded change, using `toDiscardedChangeView` from the shared inspection module.

Callers MUST obtain views through `getDiscarded`, `listDiscarded`, or `GetDiscarded.execute`, not by instantiating the type against arbitrary in-memory `Change` objects in production code.

### Requirement: No mutation path

There is no `mutateDiscarded`. Discarded changes are irreversible. `DiscardedChangeView` exists for audit and CLI display only.

## Constraints

- Terminology uses **Discard** / **Discarded**, consistent with [`core:change`](../../../../specs/core/change/spec.md).
- Name reuse for new active changes is unaffected; collision checks do not consult discarded storage.

## Spec Dependencies

- [`core:read-only-change-view`](read-only-change-view/spec.md) — shared read-only contract and facade
- [`core:change`](../../../../specs/core/change/spec.md) — discard semantics and `discarded` event
- [`core:change-repository-port`](../../../../specs/core/change-repository-port/spec.md) — `getDiscarded` / `listDiscarded` construction contract
