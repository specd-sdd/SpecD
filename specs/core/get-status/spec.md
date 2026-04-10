# GetStatus

## Purpose

Users and tooling need a quick way to see where a change stands — both its lifecycle state and which artifacts are actually ready — without loading file content. The `GetStatus` use case loads a single change by name and reports its current lifecycle state along with the effective status of each artifact, cascading through dependency chains so that an artifact whose hashes match may still show `in-progress` if any of its required dependencies are not `complete`.

## Requirements

### Requirement: Accepts a change name as input

`GetStatus.execute()` MUST accept a `GetStatusInput` containing a `name` string that identifies the change to look up.

### Requirement: Returns the change and its artifact statuses

On success, `execute()` MUST return a `GetStatusResult` containing:

- `change` -- the loaded `Change` entity with its current artifact state
- `artifactStatuses` -- an array of `ArtifactStatusEntry` objects, one per artifact attached to the change

Each `ArtifactStatusEntry` MUST contain:

- `type` -- the artifact type identifier (e.g. `'proposal'`, `'spec'`)
- `effectiveStatus` -- the effective `ArtifactStatus` after cascading through required dependencies via `Change.effectiveStatus(type)`
- `files` -- an array of `ArtifactFileStatus` objects, one per file in the artifact

Each `ArtifactFileStatus` MUST contain:

- `key` -- the file key (artifact type id for `scope: change`, spec ID for `scope: spec`)
- `filename` -- the relative filename within the change directory
- `status` -- the `ArtifactStatus` of that individual file

### Requirement: Throws ChangeNotFoundError for unknown changes

If no change with the given name exists in the repository, `execute()` MUST throw a `ChangeNotFoundError` with code `CHANGE_NOT_FOUND`. It MUST NOT return `null`.

### Requirement: Constructor dependencies

`GetStatus` MUST accept the following constructor arguments:

- `changes: ChangeRepository` — for loading changes by name
- `schemaProvider: SchemaProvider` — for obtaining the fully-resolved active schema
- `approvals: { readonly spec: boolean; readonly signoff: boolean }` — whether approval gates are active

It MUST delegate to `ChangeRepository.get(name)` to load the change. `SchemaProvider` replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple, providing the fully-resolved schema with plugins and overrides applied.

### Requirement: Reports effective status for every artifact

The `artifactStatuses` array MUST contain exactly one entry per artifact in the change's artifact map. It MUST NOT omit artifacts and MUST NOT include entries for artifacts that do not exist on the change.

### Requirement: Returns lifecycle context

On success, `GetStatusResult` MUST include a `lifecycle` object with the following fields:

- `validTransitions` — a `readonly ChangeState[]` listing all structurally valid transitions from the current state, as defined by `VALID_TRANSITIONS[state]`
- `availableTransitions` — a `readonly ChangeState[]` listing the subset of `validTransitions` where the target state's workflow `requires` are all satisfied (each required artifact has effective status `complete` or `skipped`). This is a dry-run: it tells the consumer which transitions would succeed right now without attempting them.
- `blockers` — a `readonly` array of blocker entries, one per valid-but-unavailable transition. Each entry MUST contain:
  - `transition: ChangeState` — the blocked target state
  - `reason: 'requires' | 'tasks-incomplete'` — why the transition is blocked
  - `blocking: readonly string[]` — artifact IDs whose effective status is neither `complete` nor `skipped`
- `approvals` — `{ readonly spec: boolean; readonly signoff: boolean }` reflecting whether each approval gate is active in the project config
- `nextArtifact` — `string | null`; the ID of the next artifact in schema-declared order whose `requires` are all satisfied (each required artifact has effective status `complete` or `skipped`) but whose own effective status is neither `complete` nor `skipped`. `null` when all artifacts are done.
- `changePath` — `string`; the filesystem path to the change directory, obtained from `ChangeRepository.changePath(change)`
- `schemaInfo` — `{ readonly name: string; readonly version: number } | null`; the active schema's name and version from schema resolution. `null` when schema resolution fails. Consumers MUST use this for schema mismatch warnings instead of resolving the schema independently.

### Requirement: Graceful degradation when schema resolution fails

If `SchemaProvider.get()` throws, the `lifecycle` object MUST still be present with degraded values:

- `validTransitions` MUST be populated normally (it is a static lookup, independent of schema)
- `availableTransitions` MUST be an empty array
- `blockers` MUST be an empty array
- `approvals` MUST be populated normally (it is injected config, independent of schema)
- `nextArtifact` MUST be `null`
- `changePath` MUST be populated normally
- `schemaInfo` MUST be `null`

The use case MUST NOT throw when schema resolution fails — it degrades the lifecycle fields silently. It MUST wrap the `SchemaProvider.get()` call in a `try/catch` to achieve this.

## Constraints

- The use case does not modify the change — it is a read-only query
- Artifact content is not loaded; only status metadata is returned
- The effective status computation is delegated to the `Change` entity, not performed by the use case itself
- The `lifecycle` computation adds zero additional I/O beyond schema resolution — `VALID_TRANSITIONS` is a static lookup, `effectiveStatus` is already computed, and `schema.workflowStep()` / `schema.artifacts()` are in-memory after resolution
- `changePath` is obtained from `ChangeRepository.changePath(change)` which the repository already exposes

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — Change entity, artifact status derivation, `VALID_TRANSITIONS` map
- [`core:core/kernel`](../kernel/spec.md) — Kernel wiring for `GetStatus` constructor
- [`core:core/transition-change`](../transition-change/spec.md) — `VALID_TRANSITIONS` map, workflow requires enforcement pattern
- [`core:core/schema-format`](../schema-format/spec.md) — `SchemaProvider`, `workflowStep()`, `artifacts()` API
- [`core:core/config`](../config/spec.md) — approvals configuration
