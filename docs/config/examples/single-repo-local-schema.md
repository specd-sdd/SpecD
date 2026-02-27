# Example: Single-repo project with a local schema

## When to use this setup

Use this setup when your team has a spec workflow that does not match any published npm schema, or when you want full control over artifact types, validation rules, and lifecycle steps without publishing a package. The schema lives inside your repository alongside your specs and can be evolved with your project.

## specd.yaml

```yaml
schema: 'spec-driven'  # resolved from specd/schemas/spec-driven/schema.yaml

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    schemas:
      adapter: fs
      fs:
        path: specd/schemas  # contains spec-driven/schema.yaml

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  drafts:
    adapter: fs
    fs:
      path: specd/drafts
  discarded:
    adapter: fs
    fs:
      path: specd/discarded
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

## What this configuration does

**Schema reference** — the bare name `spec-driven` resolves from the `default` workspace's `schemas.fs.path`. specd looks for the schema at `specd/schemas/spec-driven/schema.yaml`. The full resolution path is:

```
specd/schemas/
└── spec-driven/
    ├── schema.yaml
    └── templates/
        ├── proposal.md
        ├── spec.md
        └── tasks.md
```

You can also write the schema reference as `'#spec-driven'` (with the hash prefix) — it is equivalent to the bare name and also resolves from the `default` workspace.

**Schemas directory** — the `schemas` block under `default` is shown explicitly here for clarity, but it is not required: specd defaults to `adapter: fs` with `fs.path: specd/schemas` for the `default` workspace. You only need to declare it if you want to use a different path.

**Schema authoring** — the schema file at `specd/schemas/spec-driven/schema.yaml` is committed to your repository and versioned alongside your specs. When you evolve the schema, changes take effect for all new changes created after the update. Existing changes record the `schemaName` and `schemaVersion` they were created with; specd emits a warning if the active schema version differs from what a change was created with, but the change remains fully usable.

For the full schema file format, see [docs/schemas/schema-format.md](../../schemas/schema-format.md).
