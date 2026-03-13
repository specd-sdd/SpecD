# Config Loader

## Purpose

Delivery mechanisms need to load and validate `specd.yaml` without knowing the details of filesystem discovery, YAML parsing, Zod validation, or path resolution. `createConfigLoader` is the composition factory that encapsulates all of this and produces a `ConfigLoader` instance. This spec covers the public contract of config loading as consumed by CLI and MCP adapters — it does not duplicate the `SpecdConfig` structure or field semantics already specified in `specs/core/config/spec.md`.

## Requirements

### Requirement: Factory signature and return type

`createConfigLoader(options)` SHALL accept an `FsConfigLoaderOptions` discriminated union and return a `ConfigLoader`. The options union has two forms:

- `{ startDir: string }` — discovery mode
- `{ configPath: string }` — forced mode

The returned `ConfigLoader` exposes a single method `load(): Promise<SpecdConfig>`.

### Requirement: Discovery mode

When constructed with `{ startDir }`, the loader MUST walk up from `startDir` to locate a config file, bounded by the nearest git repository root. At each directory level the loader MUST check for `specd.local.yaml` first; if it exists, that file is used immediately and `specd.yaml` at the same level is not consulted. If neither file exists at a level, the search continues to the parent directory.

The walk MUST stop at the git repository root — it SHALL NOT traverse above it. If no config file is found before or at the git root, `load()` MUST throw `ConfigValidationError`.

When `startDir` is not inside a git repository, the loader MUST check only the starting directory itself (both `specd.local.yaml` and `specd.yaml`, in that order) and SHALL NOT walk further up. If neither file exists, `load()` MUST throw `ConfigValidationError`.

### Requirement: Forced mode

When constructed with `{ configPath }`, the loader MUST resolve the path to an absolute path and use it directly. No `specd.local.yaml` lookup SHALL take place. If the file does not exist, `load()` MUST throw `ConfigValidationError`.

### Requirement: YAML parsing and structural validation

The loader MUST parse the config file as YAML. If the file contains invalid YAML syntax, `load()` MUST throw `ConfigValidationError` with a message describing the parse error.

After parsing, the loader MUST validate the resulting object against a Zod schema that enforces the structural shape defined in `specs/core/config/spec.md`. Any structural mismatch — missing required fields, wrong types, unknown adapter values — MUST produce a `ConfigValidationError` with the Zod issue path and message. Validation MUST occur before any path resolution or domain object construction.

The Zod schema MUST additionally enforce:

- `schemaPlugins` is an optional array of strings
- `schemaOverrides` is an optional object with five optional keys: `create`, `remove`, `set`, `append`, `prepend`

The loader MUST NOT accept `artifactRules` or `workflow` at the top level of `specd.yaml` — these fields have been removed. If either field is present, the loader SHOULD emit a warning suggesting migration to `schemaOverrides`.

### Requirement: Default workspace is required

The loader MUST verify that `workspaces.default` exists in the parsed config. If the `default` workspace is absent, `load()` MUST throw `ConfigValidationError` with a message indicating that `workspaces.default` is required.

### Requirement: Path resolution relative to config directory

All relative paths in the parsed config — `specs.fs.path`, `schemas.fs.path`, `codeRoot`, and all `storage.*.fs.path` values — MUST be resolved relative to the directory containing the active config file. The resolved `SpecdConfig.projectRoot` MUST be set to the config file's parent directory.

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

The loader MUST map raw `context` entries preserving their `{ file }` or `{ instruction }` shape.

### Requirement: Approvals default to false

When the `approvals` section is absent or individual approval gates (`spec`, `signoff`) are omitted, the loader MUST default them to `false`.

### Requirement: All errors are ConfigValidationError

Every validation failure during `load()` — missing config file, invalid YAML, structural mismatch, missing required fields, path containment violations, invalid patterns — MUST be surfaced as a `ConfigValidationError`. No other error type SHALL be thrown for validation failures.

## Constraints

- `createConfigLoader` is the only public entry point for config loading — `FsConfigLoader` MUST NOT be exported from `@specd/core`
- The factory returns a `ConfigLoader` port interface, not the concrete `FsConfigLoader` class
- Discovery mode never reads `specd.yaml` when `specd.local.yaml` is present at the same directory level — the local file is used exclusively with no merging
- Forced mode never performs `specd.local.yaml` lookup
- Zod validation precedes all path resolution and domain construction
- `projectRoot` is always the directory containing the active config file, not `startDir`

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — `SpecdConfig` structure, field semantics, YAML format, and validation rules
- [`specs/core/composition/spec.md`](../composition/spec.md) — composition layer design and factory conventions
- [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md) — schema merge operations and `schemaOverrides` structure
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port and adapter design
