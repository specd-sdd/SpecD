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
- `metadataCachePath: string` — project-relative path of the metadata cache directory created or ensured by `initProject` (default `.specd/metadata`)

### Requirement: InitProject behaviour

The `initProject` method MUST:

1. Create a `specd.yaml` file in `projectRoot` with `configVersion: 2`, the schema and default workspace configuration. The `storage` block is omitted by default, allowing storage paths to resolve automatically to standard `fs` defaults under `specdPath`.
2. Create the workspace specs directory (e.g. `specs/`) and the required default storage directories (`.specd/changes/`, `.specd/drafts/`, `.specd/discarded/`, `.specd/archive/`)
3. Create the resolved metadata cache directory (default `.specd/metadata/`) idempotently, so a fresh clone or a deleted cache directory is complete without a separate maintenance command.
4. Append `/.specd/metadata/` to the root `.gitignore` idempotently — without duplicating an existing identical entry and without disturbing other ignore content. The entry MUST be rooted so similarly named nested directories are unaffected. This step applies only to the default filesystem metadata layout; a configured non-filesystem repository is not subject to it, and a custom filesystem `metadataPath` is not rewritten automatically.
5. Create `<config directory>/tmp/.gitignore` idempotently with normative contents (ignoring `*` and un-ignoring `!.gitignore`), so tmp artifacts stay out of version control while the ignore file itself remains trackable. The config directory is the resolved `configPath` of `core:config` (default `<specdPath>/config`, i.e. `.specd/config`); this is the same `{configPath}/tmp` location where repositories own tmp data (fs-cache, change locks). Repositories still ensure the file lazily at runtime if it is missing.
6. Append both `specd.local.yaml` and the `specd.local.*.yaml` local-variant pattern to `.gitignore` if not already present

### Requirement: InitProject already-initialised guard

When `specd.yaml` already exists in `projectRoot` and `force` is not `true`, the method MUST throw an `AlreadyInitialisedError`. When `force` is `true`, the existing file MUST be overwritten without error.

### Requirement: AddPlugin

The `addPlugin` method accepts three parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `name: string` — the scoped plugin package name (e.g. `"@specd/plugin-agent-claude"`)
3. `options?: { config?: Record<string, unknown>; contributions?: readonly string[] }` — optional plugin configuration and contribution allowlist

It MUST return `Promise<void>`. The method MUST add the plugin to the flat `plugins` list in `specd.yaml`. If the plugin is already present, the method MUST NOT duplicate it: it MUST merge into the existing entry, preserving the fields that are omitted from `options` and overwriting only the fields that are provided (an explicit `undefined` value is not allowed in `options`). The `name` MUST be validated against the scoped plugin-name grammar `PLUGIN_NAME_REGEX` owned by core (`domain/plugin-name.ts`); an invalid name MUST throw `ConfigValidationError` before anything is written, and so MUST an empty `contributions` list (omit the option to select every contribution). Both argument checks run before the file is read or written, so a missing config file with an invalid argument reports the argument error. A config document with no root mapping (empty or comment-only) is invalid for `addPlugin` and MUST be rejected with `ConfigValidationError` (a plugin list cannot be added to a project without `schema` and `workspaces`); `removePlugin` and `listPlugins` treat it as declaring no plugins. A file whose `configVersion` is newer than supported and that has no `plugins` key is rejected by `addPlugin` (the loader rejects the version), while `removePlugin` and `listPlugins` treat it as declaring no plugins. A path that exists but cannot be read as a file (for example a directory) is reported as `ConfigValidationError`. An explicit `undefined` in `options` is a type error; at runtime it is treated as omitted. When `specd.yaml` is not valid YAML, or declares `plugins` in the legacy object format or any invalid shape, the method MUST throw a `ConfigValidationError` without rewriting the file. When `specd.yaml` does not exist, the method MUST throw a `ConfigValidationError` as well (it never creates the file; `initProject` does). When `config` is provided, it MUST be written alongside the `name` in the plugin entry; when `contributions` is provided, it MUST be written as the entry's allowlist.

### Requirement: RemovePlugin

The `removePlugin` method accepts two parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `name: string` — the plugin package name

It MUST return `Promise<void>`. The method MUST remove the named plugin from `plugins` in `specd.yaml`. When the named plugin is absent, or the `plugins` key is missing, the method MUST be a no-op: it MUST NOT write the file, leaving it byte-identical (in particular it MUST NOT add a `plugins: []` key). When `plugins` is in the legacy object format or an invalid shape, when the file is not valid YAML, or when the file does not exist, it MUST throw a `ConfigValidationError` like `addPlugin` and leave the file untouched.

### Requirement: ListPlugins

The `listPlugins` method accepts one parameter:

1. `configPath: string` — absolute path to the `specd.yaml` to read

It MUST return `Promise<Array<{ name: string; config?: Record<string, unknown>; contributions?: string[] }>>` with every entry of the flat `plugins` list. If `specd.yaml` does not exist or has no `plugins` key, it MUST return an empty array. If `plugins` is in the legacy object format or has an invalid shape, or the file is not valid YAML, it MUST throw the same error as `addPlugin` and `removePlugin` rather than returning an empty or partial array.

### Requirement: Delivery access via createConfigWriter

Delivery mechanisms (CLI, MCP, plugins) MUST obtain a `ConfigWriter` instance through `createConfigWriter()`, exported from `@specd/core` and re-exported by `@specd/sdk`; hosts that depend on the SDK (the CLI) import it from `@specd/sdk`. They MAY call `initProject`, `addPlugin`, and `removePlugin` on that instance. They MUST NOT import `FsConfigWriter` or construct port implementations directly.

`listPlugins` on the port remains for infrastructure compatibility but delivery MUST NOT use it for declaration reads when a `SpecdConfig` snapshot is already available.

### Requirement: Optional initialization and plugin configuration

`ConfigWriter.initProject` and plugin operations MUST validate only the configuration they require. Optional plugin configuration MUST remain absent unless the selected plugin contract requires it; initialization MUST NOT synthesize unrelated plugin entries.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node:fs`, the `yaml` package, or any I/O at the port level
- `AlreadyInitialisedError` is an application-layer error
- The `plugins` key in `specd.yaml` follows the schema `plugins: Array<{ name: string, config?: Record<string, unknown>, contributions?: string[] }>`; the port has no notion of plugin type or bucket

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`core:config`](../config/spec.md) — `specd.yaml` configuration structure
