# ConfigWriter Port

## Purpose

Project initialisation and plugin declaration mutation must create and update `specd.yaml`, but the application layer cannot depend on filesystem or YAML libraries directly. `ConfigWriter` is the application-layer port that defines the contract for these write operations — `initProject`, `addPlugin`, and `removePlugin` — complementing the read-only `ConfigLoader`. Delivery mechanisms obtain a wired instance via `createConfigWriter()` from the composition layer.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `ConfigWriter` with four methods: `initProject`, `addPlugin`, `removePlugin`, and `listPlugins`. It SHALL NOT be an abstract class.

### Requirement: InitProject method signature

The `initProject` method MUST accept a single parameter:

1. `options: InitProjectOptions` — an object containing `projectRoot`, `schemaRef`, `workspaceId`, `specsPath`, and optional `force`

It MUST return `Promise<InitProjectResult>`.

### Requirement: InitProjectOptions shape

The `InitProjectOptions` interface MUST contain:

- `projectRoot: string` — the directory to initialise (absolute path)
- `schemaRef: string` — schema reference string (e.g. `"@specd/schema-std"`)
- `workspaceId: string` — the default workspace name (e.g. `"default"`)
- `specsPath: string` — relative path for the specs directory (e.g. `"specs/"`)
- `force?: boolean` — when `true`, overwrite an existing `specd.yaml` without error

### Requirement: InitProjectResult shape

The `InitProjectResult` interface MUST contain:

- `configPath: string` — absolute path to the created `specd.yaml` file
- `schemaRef: string` — schema reference as written
- `workspaces: readonly string[]` — workspace IDs created

### Requirement: InitProject behaviour

The `initProject` method MUST:

1. Create a `specd.yaml` file in `projectRoot` with the schema and default workspace configuration. The `storage` block is omitted by default, allowing storage paths to resolve automatically to standard `fs` defaults under `specdPath`.
2. Create the workspace specs directory (e.g. `specs/`) and the required default storage directories (`.specd/changes/`, `.specd/drafts/`, `.specd/discarded/`, `.specd/archive/`)
3. Append both `specd.local.yaml` and the `specd.local.*.yaml` local-variant pattern to `.gitignore` if not already present

### Requirement: InitProject already-initialised guard

When `specd.yaml` already exists in `projectRoot` and `force` is not `true`, the method MUST throw an `AlreadyInitialisedError`. When `force` is `true`, the existing file MUST be overwritten without error.

### Requirement: AddPlugin

The `addPlugin` method accepts four parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `type: string` — the plugin type (e.g. `"agents"`)
3. `name: string` — the plugin package name (e.g. `"@specd/plugin-agent-claude"`)
4. `config?: Record<string, unknown>` — optional plugin configuration (e.g. `{ commandsDir: '.claude/commands' }`)

It MUST return `Promise<void>`. The method MUST add the plugin to the `plugins.<type>` array in `specd.yaml`. If the plugin is already present, the method MUST NOT duplicate it. When `config` is provided, it MUST be written alongside the `name` in the plugin entry.

### Requirement: RemovePlugin

The `removePlugin` method accepts three parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `type: string` — the plugin type (e.g. `"agents"`)
3. `name: string` — the plugin package name

It MUST return `Promise<void>`. The method MUST remove the named plugin from `plugins.<type>` in `specd.yaml`.

### Requirement: Delivery access via createConfigWriter

Delivery mechanisms (CLI, MCP, plugins) MUST obtain a `ConfigWriter` instance through `createConfigWriter()` exported from `@specd/core`. They MAY call `initProject`, `addPlugin`, and `removePlugin` on that instance. They MUST NOT import `FsConfigWriter` or construct port implementations directly.

`listPlugins` on the port remains for infrastructure compatibility but delivery MUST NOT use it for declaration reads when a `SpecdConfig` snapshot is already available.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node:fs`, the `yaml` package, or any I/O at the port level
- `AlreadyInitialisedError` is an application-layer error
- The `plugins` key in `specd.yaml` follows the schema `plugins: { agents: Array<{ name: string, config?: Record<string, unknown> }> }`

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`core:config`](../config/spec.md) — `specd.yaml` configuration structure
