# GetDiscarded

## Purpose

Callers need to load a single discarded change by name for audit and CLI display. `GetDiscarded` resolves a name in `discarded/` only. It exists because `ChangeRepository.get` and `GetStatus` intentionally exclude discarded storage (so discarded names may be reused and terminal changes are not mutable via `mutate`).

## Requirements

### Requirement: Input contract

`GetDiscarded.execute` SHALL accept a `GetDiscardedInput` with:

- `name` (string, required) — the discarded change slug to load

### Requirement: Resolution

The use case MUST call `ChangeRepository.getDiscarded(name)`.

- If a discarded change exists, the use case MUST return `{ view: DiscardedChangeView }`.
- If no discarded change exists with that name, the use case MUST throw `ChangeNotFoundError`.

The use case MUST NOT fall back to `ChangeRepository.get(name)` or `getDraft(name)`.

### Requirement: Read-only

`GetDiscarded` MUST NOT mutate persistence, append history events, or invoke `mutate`, `mutateDraft`, `save`, or `saveArtifact`.

### Requirement: Dependencies

`GetDiscarded` depends on `ChangeRepository` injected via constructor.

## Constraints

- Listing all discarded changes remains `ListDiscarded`.
- This use case does not validate that a name is unused for `CreateChange`; name reuse is governed by active and drafted collision checks only.

## Spec Dependencies

- [`core:discarded-change-view`](discarded-change-view/spec.md) — return type
- [`core:change`](../../../../specs/core/change/spec.md) — discard semantics and `discarded` event
- [`core:change-repository-port`](../../../../specs/core/change-repository-port/spec.md) — `getDiscarded`
