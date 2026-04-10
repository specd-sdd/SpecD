# InitProject

## Purpose

Before a project can use specd, it needs a valid `specd.yaml`, storage directories, and gitignore entries — bootstrapping that must happen through a single coordinated operation. `InitProject` is the use case that handles this by delegating to the `ConfigWriter` port to write `specd.yaml`, create required storage directories, and update `.gitignore`. It is the entry point for `specd init` and the only use case that creates a project configuration from scratch.

## Requirements

### Requirement: Accepts InitProjectOptions as input

`execute(input)` MUST accept an `InitProjectOptions` object with the following fields:

- `projectRoot` (string, required) — absolute path to the directory to initialise.
- `schemaRef` (string, required) — schema reference string to write into `specd.yaml` (e.g. `"@specd/schema-std"`).
- `workspaceId` (string, required) — the default workspace name (e.g. `"default"`).
- `specsPath` (string, required) — relative path for the specs directory (e.g. `"specs/"`).
- `force` (boolean, optional) — when `true`, overwrite an existing `specd.yaml` without error.

### Requirement: Returns InitProjectResult on success

On successful execution, `execute` MUST return an `InitProjectResult` containing:

- `configPath` — absolute path to the created `specd.yaml`.
- `schemaRef` — the schema reference as written.
- `workspaces` — array of workspace IDs created.

### Requirement: Delegates entirely to ConfigWriter

The use case MUST delegate all filesystem operations to the `ConfigWriter.initProject` method. It SHALL NOT perform any filesystem I/O directly. The use case is a thin orchestration layer over the port.

### Requirement: Throws AlreadyInitialisedError when config exists

When `specd.yaml` already exists at the target path and `force` is not `true`, the use case MUST propagate the `AlreadyInitialisedError` thrown by the `ConfigWriter` port.

### Requirement: Side effects performed by the port

The `ConfigWriter.initProject` implementation MUST:

- Write `specd.yaml` with the provided schema reference, workspace, and specs path.
- Create standard storage directories (`changes/`, `drafts/`, `discarded/`, `archive/`).
- Append `specd.local.yaml` to `.gitignore`.
- Create a `.gitignore` inside the archive directory to exclude `.specd-index.jsonl`.

## Constraints

- The use case has no business logic beyond delegation — it is a pass-through to the port.
- `InitProject` is constructed with a single dependency: a `ConfigWriter` instance.
- The use case is async — it returns `Promise<InitProjectResult>`.

## Spec Dependencies

- [`core:core/config`](../config/spec.md) — defines `ConfigWriter` port contract, `InitProjectOptions`, and `InitProjectResult`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port/adapter design constraints
