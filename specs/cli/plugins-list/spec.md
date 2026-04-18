# cli:cli/plugins-list

## Purpose

Defines the CLI contract for listing installed plugins. The command reads the plugin configuration and reports on each declared plugin's status.

## Requirements

### Requirement: Command signature

The command MUST accept an optional `--type` flag to filter by plugin type:

```bash
specd plugins list [--type <type>]
```

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

- [`plugin-manager:load-plugin-use-case`](../plugin-manager/load-plugin-use-case/spec.md) — loads and validates plugins
- [`core:core/config-writer-port`](../core/config-writer-port/spec.md) — reads declared plugins
