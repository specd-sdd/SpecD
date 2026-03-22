# SchemaRegistry Port

## Purpose

Schemas can originate from npm packages, workspace directories, or arbitrary filesystem paths, so use cases need a single resolution interface to avoid coupling to any one source. `SchemaRegistry` is the application-layer port that defines the contract for routing schema references and resolving schemas, delegating workspace schema access to `SchemaRepository` instances. npm resolution and direct path resolution remain within the registry.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `SchemaRegistry` with three methods: `resolve`, `resolveRaw`, and `list`. It SHALL NOT be an abstract class, because there are no invariant constructor arguments shared across all implementations. Implementations MUST receive a `ReadonlyMap<string, SchemaRepository>` at construction time, mapping workspace names to their corresponding `SchemaRepository` instances.

### Requirement: Resolve method signature

The `resolve` method MUST accept one parameter:

1. `ref: string` — the schema reference as declared in `specd.yaml`

It MUST return `Promise<Schema | null>`. A `null` return indicates the resolved file does not exist; the caller is responsible for converting `null` to `SchemaNotFoundError`.

Workspace schema resolution MUST be delegated to the `SchemaRepository` instance for the target workspace.

### Requirement: Resolve prefix routing

The `resolve` method MUST route references by prefix:

- `@scope/name` — npm package; loaded from `node_modules/@scope/name/schema.yaml`. This resolution remains within the registry implementation.
- `#workspace:name` — workspace-qualified; delegated to `SchemaRepository` for the given workspace
- `#name` or bare name (no prefix) — equivalent to `#default:name`; delegated to `SchemaRepository` for the `default` workspace
- Relative or absolute filesystem path — loaded directly from that path. This resolution remains within the registry implementation.

There SHALL be no implicit multi-level fallback between these resolution strategies.

When a workspace-qualified reference targets a workspace with no corresponding `SchemaRepository` (not present in the constructor map), the registry MUST return `null`.

### Requirement: ResolveRaw method signature

The `resolveRaw` method MUST accept one parameter:

1. `ref: string` — the schema reference

It MUST return `Promise<SchemaRawResult | null>`. `SchemaRawResult` is an object containing:

- `data: SchemaYamlData` — the parsed and Zod-validated intermediate data (before domain construction)
- `templates: ReadonlyMap<string, string>` — loaded template content keyed by relative path
- `resolvedPath: string` — the absolute path of the resolved schema file (used for extends cycle detection)

This method is used by `ResolveSchema` to obtain the intermediate representation needed for the merge pipeline. The existing `resolve` method continues to return the fully-built `Schema` entity for consumers that do not need the merge pipeline.

A `null` return indicates the resolved file does not exist.

Workspace schema resolution MUST be delegated to the corresponding `SchemaRepository` instance, using the same prefix routing as `resolve`.

### Requirement: List method signature

The `list` method MUST accept no parameters.

It MUST return `Promise<SchemaEntry[]>`. The method SHALL NOT load or validate schema file contents — only discover available schemas and return their metadata.

Workspace schema entries MUST be obtained by calling `list()` on each `SchemaRepository` instance provided at construction time.

### Requirement: List result ordering

Results from `list` MUST be grouped by source: workspace entries first (in workspace declaration order), npm entries last.

### Requirement: SchemaEntry shape

Each `SchemaEntry` returned by `list` MUST contain:

- `ref: string` — the full reference string that can be passed to `resolve()` (e.g. `"@specd/schema-std"`, `"#spec-driven"`, `"#billing:my-schema"`)
- `name: string` — the schema name suitable for display, without prefix or workspace qualifier
- `source: 'npm' | 'workspace'` — where the schema was discovered
- `workspace?: string` — the workspace name; present only when `source` is `"workspace"`

### Requirement: Schema re-export

The port module MUST re-export the `Schema` type from `domain/value-objects/schema.ts` so that consumers can import both the port and the value object from a single location.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node_modules` resolution, filesystem APIs, or any I/O at the port level
- The `Schema` type is defined in the domain layer and only re-exported by this port module

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`specs/core/parse-schema-yaml/spec.md`](../parse-schema-yaml/spec.md) — `SchemaYamlData` type returned by `resolveRaw`
- [`specs/core/resolve-schema/spec.md`](../resolve-schema/spec.md) — consumer of `resolveRaw` for the merge pipeline
- [`specs/core/schema-repository-port/spec.md`](../schema-repository-port/spec.md) — `SchemaRepository` port for workspace schema access, delegated to by the registry
