# ConfigWriter Port

## Purpose

Project initialisation and skill installation must create and mutate `specd.yaml`, but the application layer cannot depend on filesystem or YAML libraries directly. `ConfigWriter` is the application-layer port that defines the contract for these write operations — initialising a project, recording skill installations, and reading the skills manifest — complementing the read-only `ConfigLoader`.

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

1. Create a `specd.yaml` file in `projectRoot` with the schema, workspace, and storage configuration
2. Create the required storage directories (`.specd/changes/`, `.specd/drafts/`, `.specd/discarded/`, `.specd/archive/`)
3. Append `specd.local.yaml` to `.gitignore` if not already present

### Requirement: InitProject already-initialised guard

When `specd.yaml` already exists in `projectRoot` and `force` is not `true`, the method MUST throw an `AlreadyInitialisedError`. When `force` is `true`, the existing file MUST be overwritten without error.

### Requirement: AddPlugin

The `addPlugin` method MUST accept three parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `type: string` — the plugin type (e.g. `"agents"`)
3. `name: string` — the plugin package name (e.g. `"@specd/plugin-agent-claude"`)

It MUST return `Promise<void>`. The method MUST add the plugin to the `plugins.<type>` array in `specd.yaml`. If the plugin is already present, the method MUST NOT duplicate it.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node:fs`, the `yaml` package, or any I/O at the port level
- `AlreadyInitialisedError` is an application-layer error
- The `plugins` key in `specd.yaml` follows the schema `plugins: { agents: Array<{ name: string, config?: Record<string, unknown> }> }`

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`core:core/config`](../config/spec.md) — `specd.yaml` configuration structure
