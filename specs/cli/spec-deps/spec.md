# cli:spec-deps

## Purpose

Persisted dependencies are canonical lock state, not a change-time draft, so they need a dedicated command surface distinct from `changes` scope editing. `specd specs deps` is the CLI command group that inspects and mutates the canonical `dependsOn` list recorded in a spec's persisted semantic state, by parsing input, calling the corresponding Core use case, formatting the result, and mapping typed errors.

## Requirements

### Requirement: Command signature

Persisted dependency features SHALL be exposed under the `specd specs deps` command group:

```
specs deps list <spec-id>
specs deps add <spec-id> --dep <dependency-id>...
specs deps remove <spec-id> --dep <dependency-id>...
specs deps set <spec-id> --dep <dependency-id>...
specs deps clear <spec-id>
```

Every subcommand accepts `--format text|json|toon` (default `text`) per [`cli:entrypoint`](../entrypoint/spec.md).

### Requirement: List subcommand

`specs deps list <spec-id>` MUST call `Kernel.specs.getPersistedDeps` and print the resulting `dependsOn` list.

When the spec has no persisted state, the command MUST report that the spec is not yet initialized rather than printing an empty list indistinguishably. Text output MUST distinguish these two cases; JSON/TOON output MUST include an `initialized` field.

### Requirement: Add subcommand

`specs deps add <spec-id> --dep <dependency-id>...` MUST call `Kernel.specs.updatePersistedDeps` with `add` set to the supplied dependency IDs, and print the resulting persisted `dependsOn` list.

### Requirement: Remove subcommand

`specs deps remove <spec-id> --dep <dependency-id>...` MUST call `Kernel.specs.updatePersistedDeps` with `remove` set to the supplied dependency IDs, and print the resulting persisted `dependsOn` list. When the spec has no persisted state, the command MUST report the no-op outcome rather than an error.

### Requirement: Set subcommand

`specs deps set <spec-id> --dep <dependency-id>...` MUST call `Kernel.specs.updatePersistedDeps` with `set` equal to the supplied dependency IDs (which may be empty to clear via `set`), and print the resulting persisted `dependsOn` list.

### Requirement: Clear subcommand

`specs deps clear <spec-id>` MUST call `Kernel.specs.updatePersistedDeps` with `clear: true`, and print the resulting (empty) persisted `dependsOn` list.

### Requirement: No repeated CLI-owned mutation logic

Handlers in this command group MUST NOT implement add/remove/set merge semantics, initial-state derivation, or persisted-state writes themselves. Every mutation MUST be expressed as one call to `Kernel.specs.updatePersistedDeps` with the parsed flags mapped directly onto its `UpdatePersistedSpecDepsInput`.

### Requirement: Error mapping

`SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec. `ArtifactConflictError` MUST map to exit code 1 with an `error:` message indicating a concurrent modification and instructing the user to retry. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround, per [`core:workspace`](../../core/workspace/spec.md) readOnly error-message conventions.

## Constraints

- These commands never read or write `spec-lock.json` directly — every operation flows through `Kernel.specs.getPersistedDeps` / `Kernel.specs.updatePersistedDeps`
- This command group is distinct from `changes` scope editing (`change edit --add-spec`); it operates on canonical persisted state, not a change's draft `specDependsOn`
- Every leaf subcommand calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`core:get-persisted-spec-deps`](../../core/get-persisted-spec-deps/spec.md) — read-only persisted dependency query
- [`core:update-persisted-spec-deps`](../../core/update-persisted-spec-deps/spec.md) — persisted dependency mutation semantics
- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
