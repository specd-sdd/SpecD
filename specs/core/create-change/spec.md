# CreateChange

## Purpose

Every spec workflow begins with a named change, so the system needs a single entry point that guarantees uniqueness and records provenance from the start. The `CreateChange` use case creates a new change entity, enforces name uniqueness, resolves the current actor, and records a single `created` event as the initial history entry.

## Requirements

### Requirement: Input contract

`CreateChange.execute` SHALL accept the existing name, description, spec IDs, optional paired schema override, and overlap-check fields, plus optional structured `invalidation` with `artifacts: none | surgical | downstream | global` and `workflow: preserve | redesign`.

When the schema override pair is absent, the active schema is resolved through `GetActiveSchema`; supplying only one schema field is invalid. The use case receives already resolved project policy defaults from its composition boundary and MUST NOT parse legacy config aliases itself.

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

`CreateChange` SHALL persist the effective structured invalidation policy in a new v2 manifest. Explicit input wins; otherwise the resolved project default is used. When neither supplies a value, the new-change default is `{ artifacts: downstream, workflow: preserve }`.

The created change MUST NOT persist the legacy scalar `invalidationPolicy`. The policy becomes the change-local default for later reconciliation and may be changed through `EditChange` without retroactively inventing drift or recovery.

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

After construction, the use case MUST persist the change via `ChangeRepository.create`. After creating, it MUST call `ChangeRepository.scaffold(change, specExists)` to create the artifact directory structure. The `specExists` callback checks workspace spec repositories via `ListWorkspaces`.

When `includeOverlapCheck` is `true` and `specIds` is non-empty, after scaffolding the use case MUST call `DetectOverlap.execute({ name: input.name })` and include the returned `OverlapReport` on the result. When overlap detection throws, the use case MUST NOT fail creation — it omits `overlapReport` from the result.

Finally, the use case returns an object containing the newly created `Change` instance, the `changePath` (obtained via `ChangeRepository.changePath(change)`), and optionally `overlapReport`.

The return type is `{ change: Change; changePath: string; overlapReport?: OverlapReport }`.

### Requirement: Dependencies

`CreateChange` SHALL receive `ChangeRepository`, `ListWorkspaces`, `ActorResolver`, `GetActiveSchema`, optional `DetectOverlap`, and a resolved structured `defaultInvalidation` policy through its constructor/dependency object. The workspace orchestrator supplies spec existence and persisted dependency views; schema resolution and optional overlap detection retain their existing use-case ownership.

Explicit `execute` input policy takes precedence over the injected default. If neither exists, the native `{ artifacts: downstream, workflow: preserve }` default applies. No application or CLI caller may silently substitute the native default when config-based composition supplied a different project default.

### Requirement: Config-based factory delegates through resolveCreateChangeDeps

The config-based `createCreateChange(config, options?)` form MUST obtain `CreateChangeDeps` through `resolveCreateChangeDeps(resolver)` and delegate to canonical `createCreateChange(deps)`. The resolver MUST supply `changes`, `listWorkspaces`, `actor`, `getActiveSchema`, optional `detectOverlap`, and the effective project `defaultInvalidation` derived from the resolved configuration, including legacy alias adaptation.

`Kernel.changes.create` MUST use the same resolver path. With omitted input policy, config-based factory and kernel creation MUST persist the project default rather than falling back to the native default. Explicit input policy still wins. The factory MUST NOT rebuild filesystem wiring or depend on CLI preprocessing to satisfy this behavior.

## Constraints

- The use case MUST NOT perform any state transitions — the change starts in `drafting` state (the default when no `transitioned` event exists)
- The use case MUST NOT modify or read any artifact files (scaffolding only creates directories)
- The `created` event timestamp and the `Change.createdAt` field MUST use the same `Date` instance

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:get-active-schema`](../get-active-schema/spec.md)
- [`core:spec-overlap`](../spec-overlap/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
