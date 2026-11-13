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

`specs deps remove <spec-id> --dep <dependency-id>...` MUST call `Kernel.specs.updatePersistedDeps` with `remove` set to the supplied dependency IDs, and print the resulting persisted `dependsOn` list. When the spec has no persisted state, the use case result has `initialized: false`; the command MUST then report the no-op outcome (text states the spec is not initialized and nothing was removed; JSON/TOON carry `initialized: false`) rather than an error and rather than an empty list as if state existed.

### Requirement: Set subcommand

`specs deps set <spec-id> --dep <dependency-id>...` MUST call `Kernel.specs.updatePersistedDeps` with `set` equal to the supplied dependency IDs (which may be empty to clear via `set`), and print the resulting persisted `dependsOn` list.

### Requirement: Clear subcommand

`specs deps clear <spec-id> [--force]` MUST call `Kernel.specs.updatePersistedDeps` with `clear: true`, and print the resulting (empty) persisted `dependsOn` list, after confirmation.

Clearing MUST be confirmed. On an interactive terminal the command SHALL ask before calling the use case; `--force` skips the question. When there is no interactive terminal and `--force` is absent, the command MUST fail with exit code 1 and an error stating that clearing requires confirmation and that `--force` skips it, changing nothing; the message MUST NOT mention a `--clear` option, which this command does not have. When the user declines, the command changes nothing, prints that it was cancelled, and exits with code 0. This is the same behaviour as `--clear` of `change deps`.

### Requirement: Mutation output reflects the real initialized state

After `add`, `remove`, `set`, and `clear` the command MUST render the `initialized` value returned by `Kernel.specs.updatePersistedDeps` (see `core:update-persisted-spec-deps`) and MUST NOT hard-code it. `initialized` is `true` whenever the call left persisted state in place and `false` only for the no-op of `remove` (or an empty `add`) on a spec with no persisted state.

### Requirement: No repeated CLI-owned mutation logic

Handlers in this command group MUST NOT implement add/remove/set merge semantics, initial-state derivation, or persisted-state writes themselves. Every mutation MUST be expressed as one call to `Kernel.specs.updatePersistedDeps` with the parsed flags mapped directly onto its `UpdatePersistedSpecDepsInput`.

### Requirement: Raw spec IDs

Every subcommand MUST pass `<spec-id>` and each `--dep` value to the use case exactly as typed. The command MUST NOT validate, qualify, or normalize spec IDs, and no value is split on commas; the use cases apply `parseSpecId` (`core:spec-id-format`). A bare path is resolved by the core to the `default` workspace.

### Requirement: Error mapping

`SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec (including a dependency target that does not exist). `InvalidSpecIdError` and `WorkspaceNotFoundError` MUST map to exit code 1 with the typed error message, which quotes the full original value. `InvalidSpecLockError` MUST map to exit code 1 with the typed error message naming the spec, the lock location, and the failing field path. When the failing field is under `dependsOn`, the command MUST add a repair hint on a following line naming `specd specs deps remove`, `specd specs deps set`, and `specd specs deps clear` as the ways to fix it, and MUST NOT add any other text to the hint: no parenthetical, no mention of `--force`, and no other repair instruction. The hint is added by the command layer of `specs deps` only: the core error carries no repair command (see `core:spec-lock`), and other commands surfacing the same error print the typed message without a hint. In JSON and TOON output the hint is not folded into the typed error `message`. When the failing field is not under `dependsOn`, no hint is added. `ArtifactConflictError` MUST map to exit code 1 with an `error:` message indicating a concurrent modification and instructing the user to retry. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround, per [`core:workspace`](../../core/workspace/spec.md) readOnly error-message conventions.

## Constraints

- These commands never read or write `spec-lock.json` directly — every operation flows through `Kernel.specs.getPersistedDeps` / `Kernel.specs.updatePersistedDeps`
- This command group is distinct from `changes` scope editing (`change edit --add-spec`); it operates on canonical persisted state, not a change's draft `specDependsOn`
- Every leaf subcommand calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`core:get-persisted-spec-deps`](../../core/get-persisted-spec-deps/spec.md) — read-only persisted dependency query
- [`core:update-persisted-spec-deps`](../../core/update-persisted-spec-deps/spec.md) — persisted dependency mutation semantics
- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
