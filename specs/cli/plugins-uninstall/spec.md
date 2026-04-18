# cli:cli/plugins-uninstall

## Purpose

Defines the CLI contract for uninstalling plugins. The command calls the plugin's uninstall hook and removes the plugin declaration from configuration.

## Requirements

### Requirement: Command signature

The command MUST accept one or more plugin names as positional arguments:

```bash
specd plugins uninstall <plugin> [<plugin>...]
```

### Requirement: Uninstall workflow

For each plugin name:

1. The command MUST load the plugin via `LoadPlugin` use case.
2. The command MUST call the plugin's `uninstall()` method.
3. The command MUST call `ConfigWriter.removePlugin()` to remove from `specd.yaml`.

### Requirement: Exit code

The command MUST exit with code 1 if any plugin fails, but continue processing the remaining plugins.

### Requirement: Output

For each plugin, the command MUST output:

- Plugin name
- Uninstall status (`uninstalled` or error message)

The format MUST be machine-parseable when invoked with `--format json`.

## Constraints

- The command MUST remove the plugin declaration from config on success.
- The command MUST call the plugin's uninstall hook before removing from config.

## Spec Dependencies

- [`plugin-manager:uninstall-plugin-use-case`](../plugin-manager/uninstall-plugin-use-case/spec.md) — orchestrates plugin removal
- [`plugin-manager:load-plugin-use-case`](../plugin-manager/load-plugin-use-case/spec.md) — loads plugin before uninstall
- [`core:core/config-writer-port`](../core/config-writer-port/spec.md) — removes plugin declaration
