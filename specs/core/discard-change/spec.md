# DiscardChange

## Overview

The `DiscardChange` use case permanently abandons a change by appending a `discarded` event to its history. The repository implementation moves the change directory to `discarded/` when persisted. Discarding is a terminal operation — discarded changes cannot be restored.

## Requirements

### Requirement: Input contract

`DiscardChange.execute` SHALL accept a `DiscardChangeInput` with the following fields:

- `name` (string, required) — the change to permanently discard
- `reason` (string, required) — mandatory explanation for discarding
- `supersededBy` (string[], optional) — names of changes that supersede this one

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Actor resolution

The use case MUST resolve the current actor identity via the `ActorResolver` port. The resolved actor is recorded in the `discarded` event.

### Requirement: Discarded event appended to history

The use case MUST call `change.discard(reason, actor, supersededBy)` to append a `discarded` event to the change's history. The event records:

- `type`: `'discarded'`
- `at`: the current timestamp
- `by`: the resolved actor identity
- `reason`: the mandatory discard reason
- `supersededBy`: included only when provided in the input

### Requirement: Persistence

After appending the discarded event, the use case MUST persist the change via `ChangeRepository.save` and return the updated `Change` instance. The repository implementation is responsible for relocating the change directory to `discarded/`.

### Requirement: Dependencies

`DiscardChange` depends on two ports injected via constructor:

- `ChangeRepository` — for loading and persistence
- `ActorResolver` — for resolving the current actor identity

## Constraints

- The use case MUST NOT perform any state transitions — discarding is orthogonal to lifecycle state
- The `reason` field is mandatory — the use case input type enforces this at the type level
- The use case delegates directory relocation entirely to the repository layer

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
