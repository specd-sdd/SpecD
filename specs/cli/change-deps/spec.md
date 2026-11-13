# change deps

## Purpose

When a spec depends on other specs for context, those relationships need to be declared so that `CompileContext` can include them automatically. `specd change deps <name> <specId>` manages the `dependsOn` dependencies for a single spec within an active change, stored in the change manifest's `specDependsOn` field and used as the highest-priority source for `dependsOn` resolution.

## Requirements

### Requirement: Command signature

```
specd change deps <name> [<specId>]
  [--add <id>...]
  [--remove <id>...]
  [--set <id>...]
  [--clear]
  [--force]
  [--format text|json|toon]
  [--config <path>]
```

- `<name>` — required positional; the change name
- `[<specId>]` — optional positional; the spec within the change whose dependencies are being managed (must be in `change.specIds`)
- `--add <id>` — repeatable; adds dependency spec IDs to this spec's `dependsOn`
- `--remove <id>` — repeatable; removes dependency spec IDs
- `--set <id>` — repeatable; replaces all dependencies (mutually exclusive with `--add`/`--remove`/`--clear`)
- `--clear` — removes every dependency of the spec (mutually exclusive with `--add`/`--remove`/`--set`)
- `--force` — skips the confirmation required by `--clear`

Each `--add`, `--remove`, and `--set` value is one whole spec ID, passed to the use case unchanged and never split on commas. The command does not validate, qualify, or normalize IDs; `UpdateSpecDeps` does. In listing and display mode the positional `<specId>` is likewise forwarded raw and is not checked or normalized by the command: the command MUST NOT call `parseSpecId` or any other spec ID parser. A core operation reached through `@specd/sdk` (the one that returns the change's declared dependencies for a spec) validates the ID, resolves a bare ID such as `auth/login` to its fully-qualified form (`default:auth/login`), matches it against `change.specIds`, and returns the normalized ID and dependencies for the command to render. An unknown or invalid ID fails with the typed core error.

### Requirement: Clear confirmation

`--clear` removes dependencies and MUST be confirmed. On an interactive terminal the command SHALL ask for confirmation before calling the use case; `--force` skips the question. When there is no interactive terminal and `--force` is absent, the command MUST fail with exit code 1 and an error stating that `--clear` requires confirmation and that `--force` skips it, without changing anything. When the user declines, the command MUST change nothing, print that it was cancelled, and exit with code 0. After confirmation the command calls `UpdateSpecDeps` with `clear: true`. Confirmation is the command's only own logic; the clear semantics belong to the use case.

### Requirement: Output

**Text format (default):**

When modifying a specific spec:

```
updated deps for <specId> in change <name>
dependsOn: dep1, dep2, dep3
```

When displaying a specific spec (`change deps <name> <specId>` with no flags):

```
spec dependencies for <specId> in change <name>:
dependsOn: dep1, dep2
```

When listing all dependencies (`change deps <name>` with no `<specId>` and no flags):

```
spec dependencies for change <name>:
- workspace:spec-path-1: dep1, dep2
- workspace:spec-path-2: (none)
```

**JSON/toon format:**

When targeting a specific spec (modify or display):

```json
{
  "result": "ok",
  "name": "<name>",
  "specId": "<specId>",
  "dependsOn": ["dep1", "dep2"]
}
```

When listing all:

```json
{
  "result": "ok",
  "name": "<name>",
  "specDependsOn": {
    "spec1": ["dep1"],
    "spec2": []
  }
}
```

### Requirement: Output shows the normalized spec ID

In every output format the command MUST show the fully-qualified spec ID returned by the use case (`default:auth/login` for a typed `auth/login`), never the raw typed value, so text, JSON, and TOON agree.

### Requirement: Error cases

All errors exit with code 1 and write to stderr:

- Change not found
- `specId` not in `change.specIds`
- `--set`, `--clear`, and `--add`/`--remove` combined in a way that is not allowed
- `--remove` value not in current deps
- Modification flags (`--add`, `--remove`, `--set`, `--clear`) provided without a `<specId>`
- An invalid spec ID (empty, blank, or malformed; for example `--set ""`) is rejected with the `InvalidSpecIdError` message quoting the full value, and nothing is stored
- An unknown workspace is rejected with the `WorkspaceNotFoundError` message

## Constraints

- `--set` is mutually exclusive with `--add`, `--remove`, and `--clear`; `--clear` is mutually exclusive with `--add` and `--remove`
- The command delegates to the `UpdateSpecDeps` use case in `@specd/core` for modifications and holds no spec ID rule.
- Any option-conflict check in the command is a fast-fail only; the use case remains the authority.
- Listing and display modes use `GetChangeSpecDeps` to retrieve dependencies; the command holds no spec-ID rule of its own.

## Spec Dependencies

- [`core:change`](../../core/change/spec.md) — `specDependsOn` field on the Change entity
- [`core:change-manifest`](../../core/change-manifest/spec.md) — `specDependsOn` field in the manifest
- [`core:compile-context`](../../core/compile-context/spec.md) — dependsOn resolution order (manifest-first)
