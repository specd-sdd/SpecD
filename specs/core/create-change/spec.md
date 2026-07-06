# CreateChange

## Purpose

Every spec workflow begins with a named change, so the system needs a single entry point that guarantees uniqueness and records provenance from the start. The `CreateChange` use case creates a new change entity, enforces name uniqueness, resolves the current actor, and records a single `created` event as the initial history entry.

## Requirements

### Requirement: Input contract

`CreateChange.execute` SHALL accept a `CreateChangeInput` with the following fields:

- `name` (string, required) — unique slug name for the change (kebab-case)
- `description` (string, optional) — free-text description of the change's purpose
- `specIds` (readonly string\[], required) — spec paths being created or modified
- `schemaName` (string, optional) — explicit schema name override
- `schemaVersion` (number, optional) — explicit schema version override
- `invalidationPolicy` (optional) — initial invalidation policy for the new change
- `includeOverlapCheck` (boolean, optional) — when `true` and `specIds` is non-empty, run overlap detection after persistence and include the report on the result

When `schemaName` and `schemaVersion` are both absent, the use case MUST resolve the project's active schema via `GetActiveSchema.execute()` (project mode) and derive `schemaName` and `schemaVersion` from the returned `Schema`.

When both `schemaName` and `schemaVersion` are provided, the use case MUST use them directly without calling `GetActiveSchema`.

Providing only one of `schemaName` or `schemaVersion` MUST be rejected before persistence (the use case throws a validation error).

### Requirement: Active schema resolution

When `CreateChange.execute` is called without explicit `schemaName` and `schemaVersion`, the use case MUST call `GetActiveSchema.execute()` with no arguments.

The use case MUST extract `schemaName` from `schema.name()` and `schemaVersion` from `schema.version()` on the resolved `Schema` entity.

The use case MUST NOT implement schema resolution logic itself — it delegates entirely to `GetActiveSchema` for project-mode resolution.

Schema resolution errors from `GetActiveSchema` (for example `SchemaNotFoundError`, `SchemaValidationError`) MUST propagate to the caller unchanged.

### Requirement: Optional overlap check

When `includeOverlapCheck` is `true` and `specIds` contains at least one entry, `CreateChange` MUST invoke `DetectOverlap.execute({ name: input.name })` after the change is persisted and scaffolded.

When overlap detection succeeds, the returned `OverlapReport` MUST be included on `CreateChangeResult` as `overlapReport`.

When overlap detection throws, creation MUST still succeed and `overlapReport` MUST be omitted.

When `includeOverlapCheck` is absent or `false`, or when `specIds` is empty, the use case MUST NOT call `DetectOverlap`.

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
- `schemaName`: the effective schema name (from input override or active schema resolution)
- `schemaVersion`: the effective schema version (from input override or active schema resolution)

### Requirement: Change construction

The `Change` entity MUST be constructed with `name`, `createdAt`, `specIds`, and `history` from the input and the created event. The `description` field MUST be included only when provided in the input.

### Requirement: Initial specDependsOn seeding

When `CreateChange.execute` is called with spec IDs that already exist in a configured spec repository, the newly constructed `Change` MUST seed `change.specDependsOn` for each such spec before persistence.

Seeding rules:

- If the repository exposes persisted dependency state for the spec via `readPersistedDependsOn(spec)`, that value MUST be used.
- Otherwise, if canonical `metadata.json.dependsOn` exists for the spec, that value MUST be used as the legacy fallback even when the persisted metadata file is stale.
- Otherwise, the seeded value is an empty array.
- Specs that do not yet exist in the repository do not require a seeded dependency entry at creation time.

This ensures a change created against existing specs starts from the current persisted dependency snapshot without depending on raw sidecar filenames or generic artifact reads.

### Requirement: Persistence and scaffolding

After construction, the use case MUST persist the change via `ChangeRepository.save`. After saving, it MUST call `ChangeRepository.scaffold(change, specExists)` to create the artifact directory structure. The `specExists` callback checks workspace spec repositories via `ListWorkspaces`.

When `includeOverlapCheck` is `true` and `specIds` is non-empty, after scaffolding the use case MUST call `DetectOverlap.execute({ name: input.name })` and include the returned `OverlapReport` on the result. When overlap detection throws, the use case MUST NOT fail creation — it omits `overlapReport` from the result.

Finally, the use case returns an object containing the newly created `Change` instance, the `changePath` (obtained via `ChangeRepository.changePath(change)`), and optionally `overlapReport`.

The return type is `{ change: Change; changePath: string; overlapReport?: OverlapReport }`.

### Requirement: Dependencies

`CreateChange` depends on the following ports and use cases injected via constructor:

- `ChangeRepository` — for existence checks, persistence, and scaffolding
- `ListWorkspaces` — orchestrated workspace map for spec existence checks and persisted dependency seeding
- `ActorResolver` — for resolving the current actor identity
- `GetActiveSchema` — for resolving the project's active schema when `schemaName` / `schemaVersion` are not provided on input
- `DetectOverlap` — for optional post-create overlap detection when `includeOverlapCheck` is `true`

## Constraints

- The use case MUST NOT perform any state transitions — the change starts in `drafting` state (the default when no `transitioned` event exists)
- The use case MUST NOT modify or read any artifact files (scaffolding only creates directories)
- The `created` event timestamp and the `Change.createdAt` field MUST use the same `Date` instance

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:get-active-schema`](../get-active-schema/spec.md) — project-mode active schema resolution
- [`core:spec-overlap`](../spec-overlap/spec.md) — overlap report structure and detection semantics
- [`default:_global/architecture`](../../_global/architecture/spec.md)
