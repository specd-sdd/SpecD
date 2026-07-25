# cli:spec-schema

## Purpose

Changing the schema of an already-initialized spec is a deliberate, guarded decision distinct from initial adoption, so it needs its own inspection and mutation surface. `specd specs schema` is the CLI command group that reads the schema identity recorded in a spec's persisted state and explicitly reassigns it to a compatible resolved schema, by delegating entirely to the corresponding Core use cases.

## Requirements

### Requirement: Command signature

```
specs schema get <spec-id>
specs schema set <spec-id> --schema <schema-ref>
```

Both subcommands accept `--format text|json|toon` (default `text`) per [`cli:entrypoint`](../entrypoint/spec.md). `--schema` is required on `set`.

### Requirement: Get subcommand

`specs schema get <spec-id>` MUST call `Kernel.specs.getPersistedSchema` and print the resulting `{ name, version }` schema identity.

When the spec has no persisted state, the command MUST propagate `SpecNotInitializedError` as an exit-code-1 failure rather than printing a default or empty schema identity.

### Requirement: Set subcommand

`specs schema set <spec-id> --schema <schema-ref>` MUST call `Kernel.specs.updatePersistedSchema` with the given `schemaRef`, and print the resulting schema identity and persisted `dependsOn` list, including whether the operation was a no-op (`changed: false`) because the target schema equaled the currently persisted schema.

`set` MUST require an existing lock; it MUST NOT create one. When the spec has no persisted state, the command MUST propagate `SpecNotInitializedError`.

### Requirement: No repeated CLI-owned reassignment logic

This command group MUST NOT resolve schema references, parse artifacts under a candidate schema, extract or compare dependencies, or write persisted state itself. Every decision MUST be delegated to `Kernel.specs.getPersistedSchema` / `Kernel.specs.updatePersistedSchema`.

### Requirement: Error mapping

`SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec. `SpecNotInitializedError` MUST map to exit code 1 with an `error:` message instructing the user to run `specs init` first. `PersistedSchemaDependencyConflictError` MUST map to exit code 1 with an `error:` message showing both the current and extracted dependency lists, and MUST instruct the user to reconcile dependencies explicitly through `specs deps` rather than retrying the schema change. `ArtifactConflictError` MUST map to exit code 1 with an `error:` message indicating a concurrent modification. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround.

## Constraints

- `specs schema set` never fabricates or discards implementation links or optimization values; it only changes `schema` and, when required by extraction compatibility, leaves `dependsOn` unchanged
- `specs schema set` is the only supported path for changing an initialized spec's persisted schema identity; there is no implicit reassignment through `specs init` or any mutation command
- Every leaf subcommand calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`core:get-persisted-spec-schema`](../../core/get-persisted-spec-schema/spec.md) — read-only persisted schema query
- [`core:update-persisted-spec-schema`](../../core/update-persisted-spec-schema/spec.md) — guarded schema-reassignment semantics
- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
