# cli:spec-init

## Purpose

Imported repositories and future multi-schema projects need an explicit way to adopt existing, lock-less spec artifacts into persisted semantic state — without silently treating an incidental first mutation as adoption. `specd specs init` is the CLI command that exposes one-spec and batch persisted-state initialization by delegating directly to `InitializePersistedSpecState`.

## Requirements

### Requirement: Command signature

```
specs init <spec-id> [--schema <schema-ref>]
specs init --all [--workspace <name>...] [--schema <schema-ref>]
```

- `<spec-id>` — mutually exclusive with `--all`; exactly one of the two target forms MUST be used
- `--schema <schema-ref>` — optional; when omitted, the effective project schema is used
- `--workspace <name>` — optional, repeatable, valid only with `--all`; restricts batch initialization to the named workspaces
- `--format text|json|toon` (default `text`) per [`cli:entrypoint`](../entrypoint/spec.md)

### Requirement: Single-spec initialization

`specs init <spec-id> [--schema <schema-ref>]` MUST call `Kernel.specs.initializePersistedState` with `target: { kind: 'spec', specId }` and the optional `schemaRef`.

The command MUST NOT create spec artifacts; it operates only on artifacts that already exist. When the spec already has persisted state, the command MUST propagate `SpecAlreadyInitializedError` as an exit-code-1 failure rather than silently succeeding or reassigning the schema.

### Requirement: Batch initialization

`specs init --all [--workspace <name>...] [--schema <schema-ref>]` MUST call `Kernel.specs.initializePersistedState` with `target: { kind: 'all', workspaces }` (omitting `workspaces` when no `--workspace` flags were given) and the optional `schemaRef`.

The command MUST print per-spec `initialized`/`failed` results plus the `existingSkipped` count returned by the use case. It MUST NOT pretend to initialize specs that already have persisted state — those are reported under `existingSkipped`, not `initialized` or `failed`.

### Requirement: Batch exit code

When the batch result contains at least one `failed` entry among eligible (lock-less) targets, the command MUST exit with code 1. A batch run whose only non-`initialized` entries are `existingSkipped` MUST exit with code 0.

### Requirement: No repeated CLI-owned initialization logic

This command MUST NOT resolve schemas, discover raw spec identities, verify artifact parseability, derive initial dependencies, or write persisted state itself. Every initialization decision MUST be delegated to `Kernel.specs.initializePersistedState`.

### Requirement: Error mapping

`SpecAlreadyInitializedError` MUST map to exit code 1 with an `error:` message naming the already-initialized spec, for the single-spec form. `SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround; in batch mode, a read-only workspace failure MUST appear as a `failed` entry rather than being silently skipped.

## Constraints

- `specs init` never rewrites an existing lock; schema reassignment is exposed only through `specs schema set`
- `--schema` and `--workspace` are the only supported input refinements; there is no `--force` flag for this command
- Every leaf subcommand form calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`core:initialize-persisted-spec-state`](../../core/initialize-persisted-spec-state/spec.md) — one-time adoption semantics, batch selection, and error contract
- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
