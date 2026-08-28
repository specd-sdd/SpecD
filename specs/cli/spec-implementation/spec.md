# cli:spec-implementation

## Purpose

Archived implementation traceability sometimes needs manual correction after archive, so it needs a canonical-spec command surface parallel to `changes implementation` but scoped to persisted lock state instead of an active change's draft tracking. `specd specs implementation` is that CLI command group: it parses input, calls the corresponding Core use case, formats the result, and maps typed errors, without owning any link-normalization or file-existence logic itself.

## Requirements

### Requirement: Command signature

Persisted implementation-link features SHALL be exposed under the `specd specs implementation` command group:

```
specs implementation list <spec-id>
specs implementation add <spec-id> --file <path> [--symbol <name>...]
specs implementation remove <spec-id> --file <path> [--symbol <name>...]
```

Every subcommand accepts `--format text|json|toon` (default `text`) per [`cli:entrypoint`](../entrypoint/spec.md).

### Requirement: List subcommand

`specs implementation list <spec-id>` MUST call `Kernel.specs.getPersistedImplementation` and print the resulting implementation link list, distinguishing file-level entries (no `symbols`) from symbol-level entries (`symbols` present).

When the spec has no persisted state, the command MUST report that the spec is not yet initialized rather than printing an empty list indistinguishably. Text output MUST distinguish these two cases; JSON/TOON output MUST include an `initialized` field.

### Requirement: Add subcommand

`specs implementation add <spec-id> --file <path> [--symbol <name>...]` MUST call `Kernel.specs.updatePersistedImplementation` with `action: 'add'`, the raw `--file` value, and any supplied `--symbol` values, then print the resulting persisted implementation link list.

### Requirement: Remove subcommand

`specs implementation remove <spec-id> --file <path> [--symbol <name>...]` MUST call `Kernel.specs.updatePersistedImplementation` with `action: 'remove'`, the raw `--file` value, and any supplied `--symbol` values, then print the resulting persisted implementation link list.

### Requirement: No repeated CLI-owned mutation logic

Handlers in this command group MUST NOT perform file-existence checks, canonical `workspace:path` normalization, workspace-boundary validation, or persisted-state writes themselves. Every mutation MUST be expressed as one call to `Kernel.specs.updatePersistedImplementation` with the parsed flags mapped directly onto its `UpdatePersistedSpecImplementationInput`.

### Requirement: Shared path semantics with change-time tracking

Users supply the same raw project-relative file-path form accepted by `specd changes implementation`. This command group MUST NOT require users to enter canonical `workspace:path` identities — that normalization is performed by `UpdatePersistedSpecImplementation`.

### Requirement: Error mapping

`SpecNotFoundError` MUST map to exit code 1 with an `error:` message naming the unresolved spec. `ImplementationFileNotFoundError` and `ImplementationWorkspaceBoundaryError` MUST map to exit code 1 with an `error:` message describing the invalid path. `ArtifactConflictError` MUST map to exit code 1 with an `error:` message indicating a concurrent modification and instructing the user to retry. `ReadOnlyWorkspaceError` MUST map to exit code 1 without suggesting a configuration workaround.

### Requirement: Suggest subcommand

`specd specs implementation suggest [<spec-id>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--yes|-y] [--confidence <HIGH|MEDIUM|MED|LOW>] [--rebuild-cache]` MUST invoke `SuggestImplementationLinks` in `@specd/sdk`.

When `--apply` is passed:

- In interactive text format (TTY) without `--yes`/`-y`, the CLI MUST iterate sequentially spec-by-spec across target specifications. For each specification:
  - Any candidate links already present in `spec-lock.json` MUST be displayed informatively above the prompt with the spec ID emphasized in brackets (`[specId]`) and excluded from interactive choices.
  - Discovered new candidates MUST be presented via an interactive checkbox prompt (`multiselect`), with `HIGH` confidence items pre-selected by default and the target spec ID formatted as `[specId]`.
  - Clear navigation hints (`space: toggle`, `enter: confirm and next spec` or `enter: confirm` for the last/only spec, `ctrl+c: abort`) MUST be rendered in the prompt.
  - If the user aborts (`Ctrl+C`), prompt iteration halts gracefully and previously confirmed mutations remain saved.
- When `--yes` or `-y` is provided (or in non-interactive execution / machine formats `json` and `toon`), candidates MUST be applied automatically without interactive prompts. When `--confidence` is not explicitly specified, `--yes` MUST default to the `HIGH` confidence threshold to prevent applying ambiguous lower-confidence links without human review. If `--confidence <level>` is explicitly provided, that threshold governs auto-application.
- Mutating `spec-lock.json` MUST perform an additive set union via `UpdatePersistedSpecImplementation`, preserving existing confirmed links.

In interactive text format, execution MUST be framed with unified Clack components:

- Session start MUST display `SpecD — Suggest implementation links`.
- Cache warming and discovery phases MUST show progress using inline spinners.
- Text summary output MUST be formatted inside a bordered note with long lines wrapped preserving hierarchical indentation and continuation ellipsis markers (`...`), and closed with an outro summary.
- The target specification identifier MUST be enclosed in brackets and bolded in prompt headers and result output.

Each suggestion in the text output MUST display its inclusion status: `[already included]` for files already present in `spec-lock.json`, `[new]` for newly discovered candidates.

The subcommand MUST support `--format text|json|toon`. Machine formats `json` and `toon` MUST NEVER prompt or block stdin.

### Requirement: Suggest structured-output help schema

The `suggest` leaf command MUST register JSON and TOON help examples and response-shape documentation using the shared structured-output help mechanism required by `cli:entrypoint`. Help for `--format json` and `--format toon` MUST describe the actual suggestion result shape and MUST remain available without executing the command.

## Constraints

- These commands never read or write `spec-lock.json` directly — every operation flows through `Kernel.specs.getPersistedImplementation` / `Kernel.specs.updatePersistedImplementation`
- This command group is distinct from `changes implementation`; it operates on canonical persisted state after archive, not a change's in-progress tracked files and confirmed links
- Every leaf subcommand calls `.allowExcessArguments(false)`

## Spec Dependencies

- [`core:update-persisted-spec-implementation`](../../core/update-persisted-spec-implementation/spec.md) — persisted implementation-link mutation semantics
- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:get-persisted-spec-implementation`](../../core/get-persisted-spec-implementation/spec.md) — read-only persisted implementation query
- [`sdk:suggest-implementation-links`](../../sdk/suggest-implementation-links/spec.md) — orchestration use case for inferring spec implementation links
