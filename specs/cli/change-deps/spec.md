# change deps

## Purpose

When a spec depends on other specs for context, those relationships need to be declared so that `CompileContext` can include them automatically. `specd change deps <name> <specId>` manages the `dependsOn` dependencies for a single spec within an active change, stored in the change manifest's `specDependsOn` field and used as the highest-priority source for `dependsOn` resolution.

## Requirements

### Requirement: Command signature

```
specd change deps <name> <specId>
  [--add <id>...]
  [--remove <id>...]
  [--set <id>...]
  [--format text|json|toon]
  [--config <path>]
```

- `<name>` — required positional; the change name
- `<specId>` — required positional; the spec within the change whose dependencies are being managed (must be in `change.specIds`)
- `--add <id>` — repeatable; adds dependency spec IDs to this spec's `dependsOn`
- `--remove <id>` — repeatable; removes dependency spec IDs
- `--set <id>` — repeatable; replaces all dependencies (mutually exclusive with `--add`/`--remove`)
- At least one of `--add`, `--remove`, or `--set` is required

### Requirement: Output

**Text format (default):**

```
updated deps for <specId> in change <name>
dependsOn: dep1, dep2, dep3
```

When no dependencies remain: `dependsOn: (none)`

**JSON/toon format:**

```json
{
  "result": "ok",
  "name": "<name>",
  "specId": "<specId>",
  "dependsOn": ["dep1", "dep2"]
}
```

### Requirement: Error cases

All errors exit with code 1 and write to stderr:

- Change not found
- `specId` not in `change.specIds`
- `--set` used with `--add` or `--remove`
- `--remove` value not in current deps
- No flags provided

## Constraints

- `--set` is mutually exclusive with `--add` and `--remove`
- At least one modification flag must be provided
- The command delegates to the `UpdateSpecDeps` use case in `@specd/core`

## Spec Dependencies

- [`specs/core/change/spec.md`](../../core/change/spec.md) — `specDependsOn` field on the Change entity
- [`specs/core/change-manifest/spec.md`](../../core/change-manifest/spec.md) — `specDependsOn` field in the manifest
- [`specs/core/compile-context/spec.md`](../../core/compile-context/spec.md) — dependsOn resolution order (manifest-first)
