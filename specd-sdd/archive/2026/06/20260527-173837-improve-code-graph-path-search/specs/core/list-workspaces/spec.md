# List Workspaces

## Purpose

The project configuration defines workspaces as isolated units of specs, code, and ownership, but consumers need a unified way to discover and interact with these workspaces alongside their initialized storage adapters. The `ListWorkspaces` use case orchestrates the project configuration with the available repository instances, providing a rich, single source of truth for project traversal. It is the foundational query for discovery UIs, CLI status reporting, and graph indexing.

## Requirements

### Requirement: Orchestrate workspaces with repositories

`ListWorkspaces.execute()` SHALL iterate through all workspaces defined in the project configuration and pair each one with its corresponding `SpecRepository` instance. The results SHALL be returned as an array of `ProjectWorkspace` entities, preserving the declaration order from the configuration.

### Requirement: ProjectWorkspace entity properties

Each `ProjectWorkspace` entity MUST include the following immutable properties derived from the project configuration and kernel internals:

- `name` — the unique workspace identifier (e.g., `default`, `core`, `cli`)
- `codeRoot` — the absolute path to the directory containing the implementation code
- `isExternal` — boolean indicating if the workspace specs are stored outside the repository root
- `ownership` — the project's relationship to the workspace (`owned`, `shared`, or `readOnly`)
- `specRepo` — the initialized `SpecRepository` instance for reading and writing this workspace's specs

### Requirement: Handle all configured workspaces

The use case MUST include every workspace declared in the `specd.yaml` (or its local overrides). If a workspace is configured but its repository cannot be initialized, the use case SHALL still include the workspace in the list but MAY mark the repository as unavailable or throw a project-level initialization error, depending on the failure severity.

## Constraints

- The use case MUST NOT modify the configuration or the repository states.
- The `ProjectWorkspace` entity SHALL be considered a read-only view of the project structure for high-level orchestration.
- The use case SHALL NOT pre-load any spec content or metadata; it only provides access to the repository ports.

## Spec Dependencies

- [`core:config`](../config/spec.md) — defines the workspace configuration schema
- [`core:workspace`](../workspace/spec.md) — defines workspace identity and ownership semantics
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — defines the interface for spec storage and counting
