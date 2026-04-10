# DraftChange

## Purpose

Users need to pause work on a change without losing its state or history — for example, to context-switch or wait on a dependency. The `DraftChange` use case shelves an existing change by appending a `drafted` event to its history, and the repository implementation moves the change directory from `changes/` to `drafts/` when persisted.

## Requirements

### Requirement: Input contract

`DraftChange.execute` SHALL accept a `DraftChangeInput` with the following fields:

- `name` (string, required) — the change to shelve
- `reason` (string, optional) — explanation for shelving the change

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Actor resolution

The use case MUST resolve the current actor identity via the `ActorResolver` port. The resolved actor is recorded in the `drafted` event.

### Requirement: Drafted event appended to history

The use case MUST call `change.draft(actor, reason)` to append a `drafted` event to the change's history. The event records:

- `type`: `'drafted'`
- `at`: the current timestamp
- `by`: the resolved actor identity
- `reason`: included only when provided in the input

### Requirement: Persistence

After appending the drafted event, the use case MUST persist the change through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`; the use case calls `change.draft(actor, reason)` on that instance and returns it. When the callback resolves, the repository persists the updated manifest and performs any required directory relocation to `drafts/`.

`DraftChange.execute` returns the updated `Change` instance produced by that serialized mutation.

### Requirement: Dependencies

`DraftChange` depends on two ports injected via constructor:

- `ChangeRepository` — for loading and persistence
- `ActorResolver` — for resolving the current actor identity

## Constraints

- The use case MUST NOT perform any state transitions — drafting is orthogonal to lifecycle state
- The use case delegates directory relocation entirely to the repository layer
- The `isDrafted` property on the `Change` entity is derived from the most recent `drafted` or `restored` event in history

## Spec Dependencies

- [`core:core/change`](../change/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
