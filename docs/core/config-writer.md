# ConfigWriter Port

`ConfigWriter` is the core write boundary for project configuration (`specd.yaml`).

Location:

- `packages/core/src/application/ports/config-writer.ts`
- filesystem adapter: `packages/core/src/infrastructure/fs/config-writer.ts`

## Methods

### `initProject(options)`

Creates a new project config and required `.specd/` directories.

Input:

- `projectRoot`
- `schemaRef`
- `workspaceId`
- `specsPath`
- `force?`

Output:

- `configPath`
- `schemaRef`
- `workspaces`

### `addPlugin(configPath, type, name, config?)`

Adds or updates one declaration under `plugins.<type>`.

Rules:

- idempotent by plugin name inside the same type bucket
- updates config payload when entry exists and `config` is provided
- preserves unrelated YAML structure

### `removePlugin(configPath, type, name)`

Removes a declaration from `plugins.<type>` by plugin name.

Rules:

- no-op when entry is absent
- preserves unrelated YAML structure

### `listPlugins(configPath, type?)`

Returns declared plugin entries.

Rules:

- with `type`: returns only that bucket
- without `type`: flattens all buckets
- returns `[]` when config file is missing or plugin section is absent/invalid

## Adapter guarantees (`FsConfigWriter`)

- YAML parse/serialize via `yaml` document model.
- Atomic writes through `writeFileAtomic`.
- Plugin section validation through Zod before returning declarations.
