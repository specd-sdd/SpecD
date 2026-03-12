# Schema Extend

## Overview

Defines the `specd schema extend` command, which creates a new local schema that extends an existing schema. Unlike `fork`, the new schema has an `extends` relationship with the source — it inherits all definitions and can selectively override or add to them.

## Requirements

### Requirement: Command signature

```
specd schema extend <ref> [--name <name>] [--workspace <workspace>]
```

- `<ref>` (required) — the schema reference to extend (npm package, workspace-qualified, bare name, or path).
- `--name <name>` (optional) — the name for the new schema. Defaults to `<source-name>-custom`.
- `--workspace <workspace>` (optional) — the workspace whose `schemas.fs.path` is used as the target directory. Defaults to `default`.

### Requirement: Extend behaviour

The command must:

1. Resolve the source schema via `SchemaRegistry.resolve(ref, workspaceSchemasPaths)` to verify it exists and has `kind: schema`.
2. Create a new schema directory at `<target-schemas-path>/<name>/`.
3. Write a minimal `schema.yaml` with:
   - `kind: schema`
   - `name: <name>`
   - `version: 1`
   - `extends: <ref>` — referencing the source schema
   - `artifacts: []` — empty (all inherited from parent)
4. Print the path to the new schema directory.

If the target directory already exists, the command must exit with an error and not overwrite.

### Requirement: Error cases

- Source schema not found — exits with code 3
- Source schema has `kind: schema-plugin` — exits with code 1, message explains that only schemas can be extended
- Target directory already exists — exits with code 1
- Target workspace has no `schemas` section — exits with code 1

## Constraints

- The new schema starts minimal — only `extends` and metadata; no artifacts, workflow, or templates are copied
- The command does not modify `specd.yaml` — the user must update the `schema` field manually
- Templates are not copied — the child schema inherits templates from the parent

## Examples

```
$ specd schema extend @specd/schema-std
Created specd/schemas/schema-std-custom/schema.yaml
  extends: @specd/schema-std

$ specd schema extend @specd/schema-std --name my-workflow
Created specd/schemas/my-workflow/schema.yaml
  extends: @specd/schema-std
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/schema-format/spec.md`](../../core/schema-format/spec.md) — schema structure, `kind`, `extends`
- [`specs/core/port-schema-registry/spec.md`](../../core/port-schema-registry/spec.md) — schema resolution
