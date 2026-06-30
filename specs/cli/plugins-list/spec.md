# cli:plugins-list

## Purpose

Defines the CLI contract for listing installed plugins. The command reads the plugin configuration and reports on each declared plugin's status.

## Requirements

### Requirement: Command signature

The command MUST accept an optional `--type` flag to filter by plugin type:

```bash
specd plugins list [--type <type>]
```

### Requirement: Declaration source

The command MUST enumerate declared plugins from the loaded `SpecdConfig.plugins` field (via `loadConfig` or an equivalent config snapshot). It MUST NOT call `kernel.project.listPlugins` or re-read `specd.yaml` through `ConfigWriter.listPlugins` when a config snapshot is already available.

When `--type` is omitted, the command MUST default to type `agents`. When `--type <type>` is provided, the command MUST read only `config.plugins.<type>` (or an empty list when that type is absent).

### Requirement: Plugin status detection

For each plugin declared in `specd.yaml`:

- **installed**: The plugin is in config and can be loaded via `LoadPlugin`.
- **not_found**: The plugin is in config but the npm package is not installed.
- **error**: The plugin is in config but fails to load (show error message).

### Requirement: Output format

The command MUST output:

- Plugin name
- Plugin type (from the type key in config)
- Version (if available from the npm package)
- Status (`installed`, `not_found`, or `error`)

The format MUST be machine-parseable when invoked with `--format json`.

## Constraints

- The command MUST NOT modify any state.

## Spec Dependencies

- [`plugin-manager:load-plugin-use-case`](../../plugin-manager/load-plugin-use-case/spec.md) — runtime load status per declared plugin
- [`core:get-config`](../../core/get-config/spec.md) — readonly `SpecdConfig` snapshot; `plugins` holds declarations
