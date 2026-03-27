# ValidateSchema

## Purpose

Schema validation logic is currently embedded in the resolution pipeline (`ResolveSchema`) and the domain service (`buildSchema`), but there is no dedicated use case that exposes validation as a first-class operation. Delivery mechanisms that need to validate a schema — whether the project's active schema or an external file — must either duplicate orchestration logic or import infrastructure functions directly, violating the architecture spec. `ValidateSchema` is an application use case that encapsulates schema validation for both modes, keeping delivery mechanisms as thin adapters.

## Requirements

### Requirement: Construction dependencies

`ValidateSchema` MUST be constructed with:

- `schemas` (`SchemaRegistry`) — the registry port for resolving schema references and loading raw schema data
- `buildSchemaFn` (`(ref: string, data: SchemaYamlData, templates: ReadonlyMap<string, string>) => Schema`) — the domain service for semantic validation (injected to avoid coupling the use case to a specific module path)

### Requirement: Project mode — resolved

When `execute` is called with `{ mode: 'project', schemaRef, schemaPlugins, schemaOverrides }`, the use case SHALL validate the project's active schema through the full resolution pipeline:

1. Construct a `ResolveSchema` instance with the provided parameters and the injected `SchemaRegistry`.
2. Call `resolveSchema.execute()` to run the full pipeline (base → extends → plugins → overrides → merge → build).
3. Return a success result with the resolved `Schema`.

If any step throws `SchemaValidationError` or `SchemaNotFoundError`, the use case SHALL catch the error and return a failure result.

### Requirement: Project mode — raw

When `execute` is called with `{ mode: 'project-raw', schemaRef }`, the use case SHALL validate only the base schema without applying plugins or overrides:

1. Call `schemas.resolveRaw(schemaRef)` to get the raw schema data and templates.
2. If `null`, return a failure result with a "schema not found" error.
3. If the schema declares `extends`, resolve the extends chain by walking `resolveRaw` calls until a root schema is reached (same cycle detection as `ResolveSchema`). Cascade data using child-overrides-parent semantics.
4. Call `buildSchemaFn(ref, data, templates)` for semantic validation.
5. Return a success result with the validated `Schema`.

This mode isolates base schema errors from merge-layer errors.

### Requirement: File mode

When `execute` is called with `{ mode: 'file', filePath }`, the use case SHALL validate an external schema file:

1. Call `schemas.resolveRaw(filePath)` to read, parse, and load templates for the file. If `null`, return a failure result with a "file not found" error.
2. If the schema declares `extends`, resolve the extends chain via `schemas.resolveRaw()` (the registry handles path-based refs). Detect cycles by tracking resolved paths. Cascade data using child-overrides-parent semantics.
3. Call `buildSchemaFn(ref, data, templates)` for semantic validation.
4. Return a success result with the validated `Schema` and a list of warnings.
5. No project plugins or overrides are applied — the file is validated with its extends chain only.

### Requirement: Ref mode

When `execute` is called with `{ mode: 'ref', ref: string }`, the use case SHALL validate a schema resolved by reference through the `SchemaRegistry`:

1. Call `schemas.resolveRaw(ref)` to resolve the reference and get raw schema data and templates. If `null`, return a failure result with a "schema not found" error message that includes the ref.
2. If the schema declares `extends`, resolve the extends chain via `schemas.resolveRaw()`. Detect cycles by tracking resolved paths. Cascade data using child-overrides-parent semantics.
3. Call `buildSchemaFn(ref, cascadedData, templates)` for semantic validation.
4. Return a success result with the validated `Schema` and a list of warnings.
5. No project plugins or overrides are applied — the schema is validated with its extends chain only.

The `ref` parameter accepts any format supported by `SchemaRegistry`: npm-scoped (`@scope/name`), workspace-qualified (`#workspace:name`), bare name (`#name` or `name`), or filesystem path.

### Requirement: Result type

`execute` MUST return `Promise<ValidateSchemaResult>` where:

```typescript
type ValidateSchemaResult =
  | { valid: true; schema: Schema; warnings: string[] }
  | { valid: false; errors: string[]; warnings: string[] }
```

The use case MUST NOT throw for validation failures — it catches `SchemaValidationError` and `SchemaNotFoundError` and returns them as structured error results. Only unexpected errors (bugs) propagate as exceptions.

### Requirement: Extends chain warnings in file and ref modes

When validating a file or ref that declares `extends` and the extends chain resolves successfully, the use case SHALL include a warning: `extends '<ref>' resolved from <resolvedPath>`. This helps the user understand which parent schema was used.

When the extends reference cannot be resolved (e.g. the parent is an npm package not installed), the use case SHALL return a failure result with the resolution error — extends resolution is not optional in file or ref mode.

## Constraints

- `ValidateSchema` is an application use case — it lives in `application/use-cases/`
- It imports the `SchemaRegistry` port and the `buildSchema` domain service — it MUST NOT import from `infrastructure/`
- For project mode (resolved), it delegates to `ResolveSchema` rather than reimplementing the pipeline
- For project-raw and file modes, it uses `SchemaRegistry.resolveRaw()` for all I/O
- The use case never throws for validation failures — it returns structured results
- The `buildSchemaFn` parameter is the actual `buildSchema` function, injected to maintain testability

## Spec Dependencies

- [`core:core/resolve-schema`](../resolve-schema/spec.md) — delegated to for project resolved mode
- [`core:core/build-schema`](../build-schema/spec.md) — semantic validation service
- [`core:core/schema-registry-port`](../schema-registry-port/spec.md) — resolution port for all I/O
- [`core:core/parse-schema-yaml`](../parse-schema-yaml/spec.md) — structural validation (internal to registry)
