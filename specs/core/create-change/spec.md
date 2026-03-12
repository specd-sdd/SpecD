# CreateChange

## Overview

The `CreateChange` use case creates a new change entity and persists it to the repository. It enforces name uniqueness, resolves the current actor, and records a single `created` event as the initial history entry.

## Requirements

### Requirement: Input contract

`CreateChange.execute` SHALL accept a `CreateChangeInput` with the following fields:

- `name` (string, required) — unique slug name for the change (kebab-case)
- `description` (string, optional) — free-text description of the change's purpose
- `specIds` (readonly string[], required) — spec paths being created or modified
- `schemaName` (string, required) — the active schema name from configuration
- `schemaVersion` (number, required) — the active schema version from configuration

### Requirement: Name uniqueness enforcement

The use case MUST query the `ChangeRepository` for an existing change with the given name before creating a new one. If a change with that name already exists, the use case MUST throw `ChangeAlreadyExistsError`.

### Requirement: Actor resolution

The use case MUST resolve the current actor identity via the `ActorResolver` port before constructing the change. The resolved actor is recorded in the initial `created` event.

### Requirement: Initial history contains a single created event

The newly constructed `Change` MUST have a history containing exactly one event of type `created`. This event SHALL record:

- `type`: `'created'`
- `at`: the current timestamp
- `by`: the resolved actor identity
- `specIds`: the input spec paths
- `schemaName`: the input schema name
- `schemaVersion`: the input schema version

### Requirement: Change construction

The `Change` entity MUST be constructed with `name`, `createdAt`, `specIds`, and `history` from the input and the created event. The `description` field MUST be included only when provided in the input.

### Requirement: Persistence

After construction, the use case MUST persist the change via `ChangeRepository.save` and return the newly created `Change` instance.

### Requirement: Dependencies

`CreateChange` depends on two ports injected via constructor:

- `ChangeRepository` — for existence checks and persistence
- `ActorResolver` — for resolving the current actor identity

## Constraints

- The use case MUST NOT perform any state transitions — the change starts in `drafting` state (the default when no `transitioned` event exists)
- The use case MUST NOT modify or read any artifact files
- The `created` event timestamp and the `Change.createdAt` field MUST use the same `Date` instance

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md)
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md)
