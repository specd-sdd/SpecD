# CreateChange

## Purpose

Every spec workflow begins with a named change, so the system needs a single entry point that guarantees uniqueness and records provenance from the start. The `CreateChange` use case creates a new change entity, enforces name uniqueness, resolves the current actor, and records a single `created` event as the initial history entry.

## Requirements

### Requirement: Input contract

`CreateChange.execute` SHALL accept a `CreateChangeInput` with the following fields:

- `name` (string, required) — unique slug name for the change (kebab-case)
- `description` (string, optional) — free-text description of the change's purpose
- `specIds` (readonly string\[], required) — spec paths being created or modified
- `schemaName` (string, required) — the active schema name from configuration
- `schemaVersion` (number, required) — the active schema version from configuration

### Requirement: Initial invalidation policy

CreateChange.execute SHALL accept the project-level default invalidation policy as input and persist it on the newly created change.

The persisted initial value MUST be one of:

- `none`
- `surgical`
- `downstream`
- `global`

This value becomes the change's default invalidation policy until a later EditChange operation overrides it.

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

### Requirement: Initial specDependsOn seeding

When `CreateChange.execute` is called with spec IDs that already exist in a configured spec repository, the newly constructed `Change` MUST seed `change.specDependsOn` for each such spec before persistence.

Seeding rules:

- If a canonical `spec-lock.json` exists for the spec, its `dependsOn` value MUST be used.
- Otherwise, if legacy `metadata.json.dependsOn` exists for the spec, that value MUST be used.
- Otherwise, the seeded value is an empty array.
- Specs that do not yet exist in the repository do not require a seeded dependency entry at creation time.

This ensures a change created against existing specs starts from the current persisted dependency set instead of leaving `specDependsOn` absent by default.

### Requirement: Persistence and scaffolding

After construction, the use case MUST persist the change via `ChangeRepository.save`. After saving, it MUST call `ChangeRepository.scaffold(change, specExists)` to create the artifact directory structure. The `specExists` callback checks the `SpecRepository` map for each spec ID's workspace. Finally, the use case returns an object containing the newly created `Change` instance and the `changePath` (obtained via `ChangeRepository.changePath(change)`).

The return type is `{ change: Change; changePath: string }`.

### Requirement: Dependencies

`CreateChange` depends on the following ports injected via constructor:

- `ChangeRepository` — for existence checks, persistence, and scaffolding
- `ActorResolver` — for resolving the current actor identity
- `specs: ReadonlyMap<string, SpecRepository>` — spec repositories keyed by workspace name, used for the `specExists` check during scaffolding and for reading persisted dependency state when seeding `change.specDependsOn`

## Constraints

- The use case MUST NOT perform any state transitions — the change starts in `drafting` state (the default when no `transitioned` event exists)
- The use case MUST NOT modify or read any artifact files (scaffolding only creates directories)
- The `created` event timestamp and the `Change.createdAt` field MUST use the same `Date` instance

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
