# cli:spec-optimizations

## Purpose

Optimized fields are lock-owned durable state, not metadata to inject through a generic writer, so they need a dedicated command surface used by the spec-context optimizer agent and by humans reviewing optimization freshness. `specd specs optimizations` is the CLI command group that inspects and mutates the persisted `optimizedDescription` and `optimizedContext` fields by parsing input, calling the corresponding Core use case, formatting the result, and mapping typed errors.

## Requirements

### Requirement: Command signature

Persisted optimization features SHALL be exposed under the `specd specs optimizations` command group:

```
specs optimizations get <spec-id> [--field optimizedDescription|optimizedContext]
specs optimizations set <spec-id> [--input <json-file|->] [--optimized-description <text>] [--optimized-context <text>]
specs optimizations clear <spec-id> [--field optimizedDescription|optimizedContext...] [--optimized-description] [--optimized-context]
```

Every subcommand accepts `--format text|json|toon` (default `text`) per [`cli:entrypoint`](../entrypoint/spec.md).

`set` MUST receive either `--input` or at least one direct value option.
`clear` MUST receive either one or more `--field` options or at least one direct clear option.

### Requirement: Get subcommand

`specs optimizations get <spec-id> [--field <name>]` MUST call `Kernel.specs.getPersistedOptimizations` with the optional `field` filter and print each present field's value together with its freshness and staleness reasons.

Text output MUST clearly mark a stale field as `STALE` alongside its reasons (`artifact-added`, `artifact-removed`, `artifact-changed`, `schema-changed`). JSON/TOON output MUST include the full per-field freshness and aggregate `fresh` result from the use case unchanged.

When the spec has no persisted state, the command MUST report that the spec is not yet initialized. When the requested field is absent, the command MUST report it as missing rather than as an error.

### Requirement: Set subcommand

`specs optimizations set <spec-id>` MUST accept exactly one input form:

- `--input <json-file|->` reads JSON from the given file path, or from stdin when `--input -` is used. The JSON MUST be an object whose keys are a subset of `optimizedDescription` and `optimizedContext` with string values.
- `--optimized-description <text>` and `--optimized-context <text>` map their values directly to the corresponding keys in the Core `set` input. Both direct options MAY be provided together to update both fields atomically.

`--input` MUST NOT be combined with either direct value option. Supplying both input forms, or supplying neither form, MUST fail at the CLI boundary before any Kernel call. Unknown JSON keys, non-string values, malformed JSON, and an empty JSON object MUST also fail before any Kernel call.

On success, the command MUST call `Kernel.specs.updatePersistedOptimizations` exactly once with `set` equal to the normalized values and print the resulting persisted optimization values.

### Requirement: Clear subcommand

`specs optimizations clear <spec-id>` MUST accept exactly one selection form:

- repeated `--field optimizedDescription|optimizedContext` options;
- direct `--optimized-description` and `--optimized-context` flags.

Both direct flags MAY be provided together to clear both fields atomically. The repeated `--field` form MAY select both fields.

`--field` MUST NOT be combined with either direct clear flag. Supplying both selection forms, or supplying neither form, MUST fail at the CLI boundary before any Kernel call.

On success, the command MUST call `Kernel.specs.updatePersistedOptimizations` exactly once with `clear` equal to the normalized field names and print the resulting persisted optimization values, which may be empty.

### Requirement: No repeated CLI-owned mutation or freshness logic

Handlers in this command group MUST NOT compute artifact hashes, staleness reasons, or baseline capture themselves, and MUST NOT implement persisted-state writes directly. Every read and mutation MUST be expressed as one call to `Kernel.specs.getPersistedOptimizations` or `Kernel.specs.updatePersistedOptimizations` with the parsed flags mapped directly onto the use case's typed input.

### Requirement: Error mapping

`SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec. Invalid `--input` JSON MUST map to exit code 1 with an `error: invalid JSON: <message>` before any Core call is made. `ArtifactConflictError` MUST map to exit code 1 with an `error:` message indicating a concurrent modification and instructing the user to retry. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround.

## Constraints

- These commands never read or write `spec-lock.json` directly — every operation flows through `Kernel.specs.getPersistedOptimizations` / `Kernel.specs.updatePersistedOptimizations`
- This command group never invokes an LLM and never decides whether optimization work should happen; the effective `llmOptimizedContext` gate is enforced by the caller (skill or agent template), not by this CLI surface
- `specs optimizations set` is the only supported entry point for persisting an optimized value after this change; there is no `write-metadata` equivalent for optimizations
- Every leaf subcommand calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:get-persisted-spec-optimizations`](../../core/get-persisted-spec-optimizations/spec.md) — read-only persisted optimization query and freshness computation
- [`core:update-persisted-spec-optimizations`](../../core/update-persisted-spec-optimizations/spec.md) — persisted optimization mutation semantics
