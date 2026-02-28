# @specd/core — Overview

`@specd/core` is the domain library for SpecD. It contains all business logic — entities, use cases, ports, and errors — with zero I/O dependencies. The CLI, MCP server, and plugins are adapters that translate between their delivery mechanism and the core.

## Who this documentation is for

`docs/core/` targets integrators: developers who want to build a new delivery adapter (a CLI, an HTTP API, an IDE extension), implement a custom port (a database-backed repository, a remote schema registry), or consume the core as a standalone SDK.

If you are using the `specd` CLI or MCP server, you do not need to read these documents — the [configuration reference](../config/config-reference.md) and [schema format reference](../schemas/schema-format.md) are the right starting points.

## Architecture

`@specd/core` is organized in three layers. The dependency flow is strictly one-way: domain has no dependencies, application depends on domain, infrastructure depends on application and domain.

```
┌──────────────────────────────────────────┐
│               domain/                    │
│  Entities · Value objects · Errors       │
│  No I/O. No external dependencies.       │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│             application/                 │
│  Use cases · Ports (interfaces)          │
│  Depends on domain only.                 │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│           infrastructure/                │
│  Fs adapters · Git · Hooks               │
│  Internal. Never imported directly.      │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│            composition/                  │
│  Factory functions for adapter creation  │
│  Exported. Returns abstract port types.  │
└──────────────────────────────────────────┘
```

The `infrastructure/` layer is internal — never import from it directly. Infrastructure adapters are created exclusively through the factory functions in `composition/`, which is the only layer permitted to instantiate them. Factories accept a discriminated union config (e.g. `{ type: 'fs', ... }`) and return the abstract port type, keeping callers decoupled from the concrete implementation.

## Public exports

`@specd/core` exports from a single entry point:

```typescript
import { ... } from '@specd/core'       // domain + application + composition
```

Everything exported is a domain type (entity, value object, error), an application type (use case class, port interface, error), or a composition factory function.

### What is exported

**From the domain layer:**

| Export                        | Kind           | Description                                                 |
| ----------------------------- | -------------- | ----------------------------------------------------------- |
| `Change`                      | class          | The central entity representing an in-progress spec change. |
| `Spec`                        | class          | Metadata for a spec directory.                              |
| `ChangeArtifact`              | class          | A single artifact file tracked within a change.             |
| `ArchivedChange`              | class          | An immutable historical record of a completed change.       |
| `Delta`                       | class          | A delta file record.                                        |
| `ChangeState`                 | type           | Union of all valid lifecycle state strings.                 |
| `ArtifactStatus`              | type           | `'missing' \| 'in-progress' \| 'complete' \| 'skipped'`     |
| `GitIdentity`                 | interface      | `{ name: string; email: string }` — git actor identity.     |
| `ChangeEvent`                 | type           | Discriminated union of all change history event types.      |
| `VALID_TRANSITIONS`           | const          | Map of valid transitions per state.                         |
| `isValidTransition`           | function       | Returns whether a state transition is permitted.            |
| `SpecPath`                    | class          | Validated, immutable spec path value object.                |
| `SpecdError`                  | abstract class | Base class for all domain and application errors.           |
| `InvalidStateTransitionError` | class          | Thrown on disallowed lifecycle transitions.                 |
| `ApprovalRequiredError`       | class          | Thrown when archiving requires approval.                    |
| `HookFailedError`             | class          | Thrown when a `run:` hook exits non-zero.                   |
| `ArtifactConflictError`       | class          | Thrown on concurrent artifact modification.                 |
| `hashFiles`                   | function       | Computes SHA-256 hashes for a map of file contents.         |

**From the application layer:**

| Export                      | Kind           | Description                                                       |
| --------------------------- | -------------- | ----------------------------------------------------------------- |
| `Repository`                | abstract class | Base class for all repository ports.                              |
| `SpecRepository`            | abstract class | Port for reading and writing specs.                               |
| `ChangeRepository`          | abstract class | Port for reading and writing changes.                             |
| `ArchiveRepository`         | abstract class | Port for archiving and querying archived changes.                 |
| `SchemaRegistry`            | interface      | Port for discovering and resolving schemas.                       |
| `HookRunner`                | interface      | Port for executing `run:` hook commands.                          |
| `GitAdapter`                | interface      | Port for querying git repository state.                           |
| `FileReader`                | interface      | Port for reading files by absolute path.                          |
| `ArtifactParser`            | interface      | Port for parsing, applying deltas, and serialising artifacts.     |
| `ArtifactParserRegistry`    | type           | `ReadonlyMap<string, ArtifactParser>`                             |
| `DeltaApplicationError`     | class          | Thrown by `ArtifactParser.apply` on selector or conflict failure. |
| `CreateChange`              | class          | Use case: create a new change.                                    |
| `GetStatus`                 | class          | Use case: load a change and report artifact statuses.             |
| `TransitionChange`          | class          | Use case: advance the change lifecycle.                           |
| `DraftChange`               | class          | Use case: shelve a change to `drafts/`.                           |
| `RestoreChange`             | class          | Use case: recover a drafted change.                               |
| `DiscardChange`             | class          | Use case: permanently abandon a change.                           |
| `ApproveSpec`               | class          | Use case: record a spec approval.                                 |
| `ApproveSignoff`            | class          | Use case: record a sign-off.                                      |
| `ArchiveChange`             | class          | Use case: finalize and archive a completed change.                |
| `ValidateArtifacts`         | class          | Use case: validate artifact files against the schema.             |
| `CompileContext`            | class          | Use case: assemble the AI instruction block for a lifecycle step. |
| `ChangeNotFoundError`       | class          | Thrown when a requested change does not exist.                    |
| `ChangeAlreadyExistsError`  | class          | Thrown when a change name is already taken.                       |
| `ApprovalGateDisabledError` | class          | Thrown when an approval operation targets a disabled gate.        |
| `SchemaNotFoundError`       | class          | Thrown when a schema reference cannot be resolved.                |

**From the composition layer:**

| Export                          | Kind     | Description                                                                                |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `createSpecRepository`          | function | Constructs a `SpecRepository` for the given adapter type (`'fs'`).                         |
| `CreateSpecRepositoryConfig`    | type     | Discriminated union config for `createSpecRepository`.                                     |
| `createChangeRepository`        | function | Constructs a `ChangeRepository` for the given adapter type (`'fs'`).                       |
| `CreateChangeRepositoryConfig`  | type     | Discriminated union config for `createChangeRepository`.                                   |
| `createArchiveRepository`       | function | Constructs an `ArchiveRepository` for the given adapter type (`'fs'`).                     |
| `CreateArchiveRepositoryConfig` | type     | Discriminated union config for `createArchiveRepository`.                                  |
| `createArtifactParserRegistry`  | function | Creates the default `ArtifactParserRegistry` with all built-in format adapters registered. |

## Where to go next

| Document                                                           | Read when you need to…                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [domain-model.md](domain-model.md)                                 | Understand the entities and value objects you receive as return values. |
| [ports.md](ports.md)                                               | Implement a repository, schema registry, or other port.                 |
| [use-cases.md](use-cases.md)                                       | Wire and call use cases from your adapter.                              |
| [errors.md](errors.md)                                             | Handle errors from use cases and ports in your delivery layer.          |
| [services.md](services.md)                                         | Use `hashFiles` for computing artifact content hashes.                  |
| [examples/implementing-a-port.md](examples/implementing-a-port.md) | See a full port implementation from scratch.                            |
