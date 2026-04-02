# RestoreChange

## Purpose

Drafted changes are only useful if they can be brought back into the active working set when the user is ready to resume. The `RestoreChange` use case recovers a drafted change by appending a `restored` event to its history, and the repository implementation moves the change directory from `drafts/` back to `changes/` when persisted.

## Requirements

### Requirement: Input contract

`RestoreChange.execute` SHALL accept a `RestoreChangeInput` with the following field:

- `name` (string, required) — the drafted change to restore

### Requirement: Change must exist

The use case MUST load the change from the `ChangeRepository` by name. If no change exists with the given name, it MUST throw `ChangeNotFoundError`.

### Requirement: Actor resolution

The use case MUST resolve the current actor identity via the `ActorResolver` port. The resolved actor is recorded in the `restored` event.

### Requirement: Restored event appended to history

The use case MUST call `change.restore(actor)` to append a `restored` event to the change's history. The event records:

- `type`: `'restored'`
- `at`: the current timestamp
- `by`: the resolved actor identity

### Requirement: Persistence

After appending the restored event, the use case MUST persist the change through `ChangeRepository.mutate(name, fn)`.

Inside the mutation callback, the repository supplies the fresh persisted `Change` for `name`; the use case calls `change.restore(actor)` on that instance and returns it. When the callback resolves, the repository persists the updated manifest and performs any required directory relocation back to `changes/`.

`RestoreChange.execute` returns the updated `Change` instance produced by that serialized mutation.

### Requirement: Dependencies

`RestoreChange` depends on two ports injected via constructor:

- `ChangeRepository` — for loading and persistence
- `ActorResolver` — for resolving the current actor identity

## Constraints

- The use case MUST NOT perform any state transitions — restoring is orthogonal to lifecycle state
- The use case delegates directory relocation entirely to the repository layer
- The `isDrafted` property on the `Change` entity is derived from the most recent `drafted` or `restored` event in history

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/core/draft-change/spec.md`](../draft-change/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
