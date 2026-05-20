# Config Loader

## Purpose

Delivery mechanisms need to load and validate `specd.yaml` without knowing the details of filesystem discovery, YAML parsing, Zod validation, or path resolution. `createConfigLoader` is the composition factory that encapsulates all of this and produces a `ConfigLoader` instance. This spec covers the public contract of config loading as consumed by CLI and MCP adapters — it does not duplicate the `SpecdConfig` structure or field semantics already specified in `specs/core/config/spec.md`.

## Requirements

### Requirement: Factory signature and return type

`createConfigLoader(options)` SHALL accept an `FsConfigLoaderOptions` discriminated union and return a `ConfigLoader`. The options union has two forms:

- `{ startDir: string }` — discovery mode
- `{ configPath: string }` — forced mode

The returned `ConfigLoader` exposes two methods:

- `load(): Promise<SpecdConfig>` — loads, validates, and returns the fully-resolved config. Throws `ConfigValidationError` on any failure.
- `resolvePath(): Promise<string | null>` — resolves and returns the path to the active config file without loading or parsing it. Returns `null` when no config file can be located (discovery mode) or when the adapter has no concept of a file path. Never throws.

### Requirement: Path probe

`resolvePath()` SHALL return the absolute path to the config file that `load()` would use, without reading or parsing it.

- **Discovery mode** (`{ startDir }`): runs the same directory walk as `load()` (honouring `specd.local.yaml`, bounded by git root). Returns the found path, or `null` if no file is found. Never throws.
- **Forced mode** (`{ configPath }`): returns the resolved absolute path directly. Does not check whether the file exists — existence is validated only by `load()`.

Adapters that have no concept of a local file path (e.g. remote adapters) SHALL return `null`.

The purpose of `resolvePath()` is to allow delivery mechanisms to probe for config presence before deciding to dispatch to a default action (such as auto-showing the project dashboard), without paying the cost of a full load and without silencing load errors for explicitly-provided paths.

### Requirement: Discovery mode

When constructed with `{ startDir }`, the loader MUST walk up from `startDir` to locate the nearest directory containing discoverable config candidates, bounded by the nearest git repository root.

Discoverable candidates within one directory are evaluated in this order:

1. `specd.yaml`
2. `specd.*.yaml` in ascending alphabetical order
3. `specd.local.yaml`
4. `specd.local.*.yaml` in ascending alphabetical order

The loader MUST build an active chain from those candidates rather than selecting a single winning file.

Candidate activation rules are:

- a file with no `extends` becomes a standalone root from that point
- a file with `extends: true` attaches to the previous active layer
- a file with `extends: <path>` attaches only when the referenced base file is already active in the current chain; otherwise that candidate is skipped in normal discovery

The walk MUST stop at the git repository root and SHALL NOT traverse above it. If no config candidates are found before or at the git root, `load()` MUST throw `ConfigValidationError`.

When `startDir` is not inside a git repository, the loader MUST check only the starting directory and SHALL NOT walk further up. If no discoverable candidates exist there, `load()` MUST throw `ConfigValidationError`.

### Requirement: Forced mode

When constructed with `{ configPath }`, the loader MUST resolve the path to an absolute path and treat that file as the single explicit entrypoint.

If the selected file declares `extends`, the loader MUST resolve the file's full `extends` chain. No additional filename-discovered layers SHALL be added on top of that explicit chain.

`extends: true` in forced mode MUST resolve to the previous candidate file in the directory's sorted candidate list, skipping any already-visited files. This allows forced mode to reconstruct the same layered chain that discovery mode would build, starting from the last link and walking backwards.

If the entry file or any file in its `extends` chain does not exist, `load()` MUST throw `ConfigValidationError`. This applies to both explicit `extends: <path>` references and `extends: true`.

### Requirement: Layer merge semantics

After resolving the active config chain, the loader MUST merge layers in chain order from lowest to highest precedence.

Merge rules are:

- scalars: later active layer wins
- objects: deep merge by key
- arrays: append by default
- `remove.root`: delete optional top-level fields from the accumulated config
- `remove.<mapName>`: delete named keys from keyed object maps such as `workspaces` and `storage`
- `remove.<arrayName>`: delete inherited array entries using that array's defined identity keys

A standalone layer without `extends` resets the accumulated base from that point and discards any earlier inherited state outside the current chain.

### Requirement: Native environment file support

The loader MUST attempt to load environment variables from `.env` and `.env.local` files in the project root using Node.js native `process.loadEnvFile()` (or equivalent).

- `.env.local` SHALL have higher priority than `.env`.
- Files absence MUST NOT be treated as an error.

### Requirement: YAML parsing and structural validation

The loader MUST parse the config file as YAML. After parsing, the loader MUST validate the resulting object against a Zod schema.

Before validation, the loader MUST merge supported environment variables into the configuration object. Environment variables MUST take precedence over file-based configuration.

### Requirement: Default workspace is required

The loader MUST verify that `workspaces.default` exists in the parsed config. If the `default` workspace is absent, `load()` MUST throw `ConfigValidationError` with a message indicating that `workspaces.default` is required.

### Requirement: Path resolution relative to config directory

All relative paths in the parsed config — `specs.fs.path`, `specs.fs.metadataPath`, `schemas.fs.path`, `codeRoot`, and all `storage.*.fs.path` values — MUST be resolved relative to the directory containing the active config file. The resolved `SpecdConfig.projectRoot` MUST be set to the config file's parent directory.

When `specs.fs.metadataPath` is explicitly declared, the loader MUST resolve it relative to the config directory. When `specs.fs.metadataPath` is absent, auto-derivation of `metadataPath` from the VCS root is a kernel composition responsibility (see `kernel-internals.ts`) and is not performed by `config-loader.load()`.

### Requirement: Storage path containment

When inside a git repository, every resolved storage path (`changes`, `drafts`, `discarded`, `archive`) MUST resolve to a location within or equal to the git repository root. If any storage path resolves outside the git root, `load()` MUST throw `ConfigValidationError` identifying the offending storage key.

When not inside a git repository, the containment check SHALL NOT apply — storage paths are accepted as resolved.

### Requirement: isExternal inference for workspaces

For each workspace, the loader MUST infer the `isExternal` flag by comparing the resolved `specsPath` against the git repository root. A workspace is external when its `specsPath` neither equals the git root nor starts with the git root followed by a path separator.

When not inside a git repository, `isExternal` MUST be `false` for all workspaces.

### Requirement: Default values for workspace fields

The loader MUST apply the following defaults when workspace fields are omitted:

- **`ownership`**: `'owned'` for the `default` workspace; `'readOnly'` for all other workspaces.
- **`codeRoot`**: the config file directory for the `default` workspace. For non-default workspaces, `codeRoot` is required — its absence MUST produce `ConfigValidationError`.
- **`schemasPath`**: for the `default` workspace, when `schemas` is omitted, defaults to `<configDir>/specd/schemas`. For non-default workspaces, when `schemas` is omitted, `schemasPath` MUST be `null`.

### Requirement: contextIncludeSpecs and contextExcludeSpecs pattern validation

The loader MUST validate all `contextIncludeSpecs` and `contextExcludeSpecs` patterns at both project level and workspace level. Valid pattern forms are:

- `*` — bare wildcard
- `workspace:*` — wildcard qualified by workspace name
- `prefix/*` — wildcard after a path prefix ending in `/`
- `workspace:prefix/*` — qualified wildcard after path prefix
- `path/name` — exact spec path (no wildcard)
- `workspace:path/name` — qualified exact spec path

`*` SHALL only appear alone, after `workspace:`, or after a path prefix ending in `/`. Any other position MUST produce `ConfigValidationError`.

Workspace qualifiers MUST match `/^[a-z][a-z0-9-]*$/`. Path segments MUST match `/^[a-z_][a-z0-9_-]*$/`. Invalid qualifiers or segments MUST produce `ConfigValidationError`.

### Requirement: Workflow and context entry mapping

The loader MUST map `schemaPlugins` as an array of strings and `schemaOverrides` as a typed operations object preserving the five operation keys (`create`, `remove`, `set`, `append`, `prepend`).

The loader MUST map raw `context` entries preserving their `{ file }`, `{ instruction }`, optional `id`, and layered removal semantics.

The loader MUST preserve `plugins.agents` entries with `name` plus optional `config`, and MUST treat `name` as the array identity key for inherited removal.

### Requirement: Approvals default to false

When the `approvals` section is absent or individual approval gates (`spec`, `signoff`) are omitted, the loader MUST default them to `false`.

### Requirement: All errors are ConfigValidationError

Every validation failure during `load()` — missing config file, invalid YAML, structural mismatch, invalid cascade chain, invalid removal target, missing required fields, path containment violations, invalid patterns — MUST be surfaced as a `ConfigValidationError`.

No generic YAML/runtime exception SHALL escape for configuration validation failures. Cascade-specific failures remain part of the normal `SpecdError` path.

## Constraints

- `createConfigLoader` is the only public entry point for config loading — `FsConfigLoader` MUST NOT be exported from `@specd/core`
- The factory returns a `ConfigLoader` port interface, not the concrete `FsConfigLoader` class
- Discovery mode resolves a layered active chain rather than selecting `specd.local.yaml` as an exclusive winner
- Forced mode resolves only the selected entrypoint plus its `extends` chain
- Zod validation precedes all path resolution and domain construction for each parsed layer
- `projectRoot` is always the directory containing the active root config file for the resolved chain, not `startDir`

## Spec Dependencies

- [`core:config`](../config/spec.md) — `SpecdConfig` structure, field semantics, YAML format, and validation rules
- [`core:composition`](../composition/spec.md) — composition layer design and factory conventions
- [`core:schema-merge`](../schema-merge/spec.md) — schema merge operations and `schemaOverrides` structure
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port and adapter design
