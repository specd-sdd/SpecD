# SchemaRepository Port

## Purpose

Use cases that resolve workspace schemas currently receive a raw `Map<string, string>` of workspace names to filesystem paths, which the `SchemaRegistry` uses to perform direct I/O. This couples the registry to the internal storage layout of each workspace and prevents swapping the storage backend per workspace. `SchemaRepository` is the application-layer port for reading and listing schemas within a single workspace, extending the shared `Repository` base class so that workspace identity, ownership, and locality are handled uniformly with other repository ports.

## Requirements

### Requirement: Inheritance from Repository base

`SchemaRepository` MUST extend `Repository`. The `workspace()`, `ownership()`, and `isExternal()` accessors MUST reflect the values provided at construction time and MUST NOT change during the lifetime of the instance.

### Requirement: Workspace scoping

Each `SchemaRepository` instance is bound to exactly one workspace. All operations (`resolveRaw`, `resolve`, `list`) MUST operate within the scope of that workspace. A consumer requiring access to schemas in multiple workspaces MUST receive multiple `SchemaRepository` instances.

### Requirement: Abstract class with abstract methods

`SchemaRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`resolveRaw`, `resolve`, `list`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

### Requirement: resolveRaw method signature

`resolveRaw(name: string)` MUST accept a single schema name (the segment after prefix stripping — e.g. `"spec-driven"` from `#default:spec-driven`) and return `Promise<SchemaRawResult | null>`.

`SchemaRawResult` is the same type used by `SchemaRegistry` — an object containing:

- `data: SchemaYamlData` — the parsed and Zod-validated intermediate data (before domain construction)
- `templates: ReadonlyMap<string, string>` — loaded template content keyed by relative path
- `resolvedPath: string` — the absolute path of the resolved schema file (used for extends cycle detection)

A `null` return indicates the schema does not exist in this workspace.

### Requirement: resolve method signature

`resolve(name: string)` MUST accept a single schema name and return `Promise<Schema | null>`. It loads and builds the full domain `Schema` entity from the workspace's storage. A `null` return indicates the schema does not exist.

### Requirement: list method signature

`list()` MUST accept no parameters and return `Promise<SchemaEntry[]>`. The method SHALL NOT load or validate schema file contents — only discover available schemas within this workspace and return their metadata. Each `SchemaEntry` MUST have `source` set to `'workspace'` and `workspace` set to this repository's workspace name.

### Requirement: SchemaRawResult and SchemaEntry re-export

The port module MUST re-export the `SchemaRawResult` and `SchemaEntry` types so that consumers can import them from a single location. These types are defined in the `SchemaRegistry` port module.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on filesystem APIs or any I/O at the port level
- Each instance is bound to a single workspace; workspace is immutable after construction
- `list` returns lightweight `SchemaEntry` metadata — schema content is never loaded by this method
- All methods are explicit methods, not property signatures (per architecture spec)

## Spec Dependencies

- [`core:core/repository-port`](../repository-port/spec.md) — `Repository` base class, `RepositoryConfig`, shared accessors
- [`default:_global/architecture`](../../_global/architecture/spec.md) — ports as abstract classes, application layer uses ports only
- [`core:core/schema-registry-port`](../schema-registry-port/spec.md) — `SchemaRawResult`, `SchemaEntry` types; `SchemaRegistry` delegates workspace operations to this port
- [`core:core/parse-schema-yaml`](../parse-schema-yaml/spec.md) — `SchemaYamlData` type returned within `SchemaRawResult`
- [`core:core/workspace`](../workspace/spec.md) — workspace identity and scoping semantics
