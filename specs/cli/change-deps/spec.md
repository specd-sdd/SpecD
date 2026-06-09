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
  [--format text|json|toon]
  [--config <path>]
```

- `<name>` — required positional; the change name
- `[<specId>]` — optional positional; the spec within the change whose dependencies are being managed (must be in `change.specIds`)
- `--add <id>` — repeatable; adds dependency spec IDs to this spec's `dependsOn`
- `--remove <id>` — repeatable; removes dependency spec IDs
- `--set <id>` — repeatable; replaces all dependencies (mutually exclusive with `--add`/`--remove`)

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

### Requirement: Error cases

All errors exit with code 1 and write to stderr:

- Change not found
- `specId` not in `change.specIds`
- `--set` used with `--add` or `--remove`
- `--remove` value not in current deps
- Modification flags (`--add`, `--remove`, `--set`) provided without a `<specId>`

## Constraints

- `--set` is mutually exclusive with `--add` and `--remove`
- The command delegates to the `UpdateSpecDeps` use case in `@specd/core` for modifications.
- Listing and display modes use `GetStatus` or direct repository access to retrieve dependencies.

## Spec Dependencies

- [`core:change`](../../core/change/spec.md) — `specDependsOn` field on the Change entity
- [`core:change-manifest`](../../core/change-manifest/spec.md) — `specDependsOn` field in the manifest
- [`core:compile-context`](../../core/compile-context/spec.md) — dependsOn resolution order (manifest-first)
