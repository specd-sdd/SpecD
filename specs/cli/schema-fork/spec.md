# Schema Fork

## Purpose

Teams that need full control over a schema's artifacts and workflow cannot get it through extension alone -- they need a standalone copy they can modify freely. The `specd schema fork` command copies an existing schema into the project's local schemas directory as a new independent schema with no `extends` relationship.

## Requirements

### Requirement: Command signature

```
specd schema fork <ref> <name> [--workspace <workspace> | --output <path>]
```

- `<ref>` (required) — the schema reference to fork (npm package, workspace-qualified, bare name, or path). Uses the same reference conventions as the `schema` field in `specd.yaml`.
- `<name>` (required) — the name for the forked schema. Used as the directory name under the workspace's `schemasPath` and written into the forked `schema.yaml`'s `name` field.
- `--workspace <workspace>` (optional) — the workspace whose `schemas.fs.path` is used as the target directory. Defaults to `default`. Mutually exclusive with `--output`.
- `--output <path>` (optional) — explicit target directory for the forked schema. The directory is created recursively if it does not exist. Mutually exclusive with `--workspace`.

### Requirement: Fork behaviour

The command must:

1. Resolve the source schema via the kernel's `SchemaRegistry.resolveRaw(ref)` — the same registry used by all other schema commands, properly wired with the CLI's `node_modules` paths. The resolved result provides the `schema.yaml` content and loaded templates.
2. Write `schema.yaml` into the target directory with:
   - `name` set to `<name>` (the required positional argument)
   - `kind: schema` present
   - Any `extends` field removed — the fork is a standalone schema
3. Copy all templates from the source schema into the target directory, preserving their relative paths.
4. Print the path to the new schema directory.

Only `schema.yaml` and `templates/` are copied — other files in the source directory (e.g. `package.json`, `src/`, `dist/` from npm packages) are excluded.

Target directory resolution:

- If `--output <path>` is provided, use that path directly. Create parent directories recursively if they do not exist.
- Otherwise, resolve `<workspace>.schemasPath` and append `<name>/` to form the target. If the workspace has no `schemasPath`, exit with an error.

`--workspace` and `--output` are mutually exclusive — if both are provided, the command SHALL exit with code 1.

If the target directory already exists, the command must exit with an error and not overwrite.

### Requirement: Error cases

- Source schema not found — exits with code 3
- Target directory already exists — exits with code 1, message identifies the existing path
- Target workspace has no `schemas` section and no `--output` provided — exits with code 1
- Both `--workspace` and `--output` provided — exits with code 1, message explains mutual exclusion

## Constraints

- The fork is a one-time copy — there is no ongoing link between source and fork
- The command does not modify `specd.yaml` — the user must update the `schema` field manually
- Templates are copied as-is; no content transformation is applied

## Examples

```
$ specd schema fork @specd/schema-std
Forked @specd/schema-std → specd/schemas/schema-std/

$ specd schema fork @specd/schema-std --name my-schema
Forked @specd/schema-std → specd/schemas/my-schema/

$ specd schema fork '#billing:billing-schema' --workspace default --name local-billing
Forked #billing:billing-schema → specd/schemas/local-billing/
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/schema-format`](../../core/schema-format/spec.md) — schema structure, `kind`, `extends`
- [`core:core/schema-registry-port`](../../core/schema-registry-port/spec.md) — schema resolution
