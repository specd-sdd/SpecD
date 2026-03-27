# Schema Extend

## Purpose

Teams that want to add or override a few artifacts without duplicating an entire schema need an inheritance mechanism. The `specd schema extend` command creates a new local schema that extends an existing one -- it inherits all definitions from the source and allows selective overrides or additions.

## Requirements

### Requirement: Command signature

```
specd schema extend <ref> <name> [--workspace <workspace> | --output <path>]
```

- `<ref>` (required) — the schema reference to extend (npm package, workspace-qualified, bare name, or path).
- `<name>` (required) — the name for the new schema. Used as the directory name under the workspace's `schemasPath` and written into the new `schema.yaml`'s `name` field.
- `--workspace <workspace>` (optional) — the workspace whose `schemas.fs.path` is used as the target directory. Defaults to `default`. Mutually exclusive with `--output`.
- `--output <path>` (optional) — explicit target directory for the extended schema. The directory is created recursively if it does not exist. Mutually exclusive with `--workspace`.

### Requirement: Extend behaviour

The command must:

1. Resolve the source schema via the kernel's `SchemaRegistry.resolveRaw(ref)` — the same registry used by all other schema commands, properly wired with the CLI's `node_modules` paths. Verify it exists and has `kind: schema`.
2. Create the target directory.
3. Write a minimal `schema.yaml` with:
   - `kind: schema`
   - `name: <name>` (the required positional argument)
   - `version: 1`
   - `extends: <ref>` — referencing the source schema
   - `artifacts: []` — empty (all inherited from parent)
4. Print the path to the new schema directory.

Target directory resolution:

- If `--output <path>` is provided, use that path directly. Create it recursively if it does not exist.
- Otherwise, resolve `<workspace>.schemasPath` and append `<name>/` to form the target. If the workspace has no `schemasPath`, exit with an error.

`--workspace` and `--output` are mutually exclusive — if both are provided, the command SHALL exit with code 1.

If the target directory already exists, the command must exit with an error and not overwrite.

No templates are copied — the child schema inherits templates from the parent via the `extends` mechanism.

### Requirement: Error cases

- Source schema not found — exits with code 3
- Source schema has `kind: schema-plugin` — exits with code 1, message explains that only schemas can be extended
- Target directory already exists — exits with code 1
- Target workspace has no `schemas` section and no `--output` provided — exits with code 1
- Both `--workspace` and `--output` provided — exits with code 1, message explains mutual exclusion

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
- [`specs/core/schema-registry-port/spec.md`](../../core/schema-registry-port/spec.md) — schema resolution
