# Schema Fork

## Purpose

Teams that need full control over a schema's artifacts and workflow cannot get it through extension alone -- they need a standalone copy they can modify freely. The `specd schema fork` command copies an existing schema into the project's local schemas directory as a new independent schema with no `extends` relationship.

## Requirements

### Requirement: Command signature

```
specd schema fork <ref> [--name <name>] [--workspace <workspace>]
```

- `<ref>` (required) — the schema reference to fork (npm package, workspace-qualified, bare name, or path). Uses the same reference conventions as the `schema` field in `specd.yaml`.
- `--name <name>` (optional) — the name for the forked schema directory. Defaults to the source schema's `name` field.
- `--workspace <workspace>` (optional) — the workspace whose `schemas.fs.path` is used as the target directory. Defaults to `default`.

### Requirement: Fork behaviour

The command must:

1. Resolve the source schema via `SchemaRegistry.resolve(ref, workspaceSchemasPaths)`.
2. Copy the entire source schema directory (including `schema.yaml`, `templates/`, and any other files) into `<target-schemas-path>/<name>/`.
3. In the copied `schema.yaml`, ensure `kind: schema` is present and remove any `extends` field — the fork is a standalone schema.
4. Print the path to the new schema directory.

If the target directory already exists, the command must exit with an error and not overwrite.

### Requirement: Error cases

- Source schema not found — exits with code 3
- Target directory already exists — exits with code 1, message identifies the existing path
- Target workspace has no `schemas` section — exits with code 1

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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/schema-format/spec.md`](../../core/schema-format/spec.md) — schema structure, `kind`, `extends`
- [`specs/core/port-schema-registry/spec.md`](../../core/port-schema-registry/spec.md) — schema resolution
