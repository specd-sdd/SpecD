# cli:plugins-uninstall

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

1. The command MUST verify that the name is declared in `config.plugins`.
2. The command MUST resolve the plugin's selected contributions from its entry in `config.plugins` (the `contributions` allowlist) and call the `UninstallPlugin` use case with it, passing `contributions` only when the entry has an allowlist (when absent the use case selects every declared id) (the use case loads the plugin itself), which calls the plugin's `uninstall()` when implemented.
3. The command MUST call `createConfigWriter().removePlugin(configPath, name)` to remove it from `specd.yaml`. A plugin name listed more than once is processed once; each repeat is reported as `skipped` with the detail `already processed` and the hook runs once. When the plugin cannot be loaded at all (the package is missing, `PluginNotFoundError`, or it fails validation or import for any other reason) no hook can run: the declaration is still removed from `specd.yaml` and the result is `uninstalled` with the detail `package not found; only the declaration was removed` for a missing package and `plugin failed to load (<reason>); only the declaration was removed` for any other load failure. A failure of the uninstall hook itself is different: the declaration is retained and the result is `error`.

The command MUST NOT call `kernel.project.removePlugin`. It MUST NOT depend on any plugin type bucket, and it MUST NOT call the plugin's `init`.

A plugin name that is not declared in `config.plugins` MUST be reported as an error for that name without calling the plugin. If the uninstall hook throws, the declaration MUST be retained in `specd.yaml` (`removePlugin` is not called) and the error is reported for that name.

### Requirement: Host bootstrap without plugins

The command MUST obtain its host context with plugins disabled (`resolveCliContext({ plugins: false })`), so that a broken configured plugin can still be uninstalled.

### Requirement: Exit code

The command MUST exit with code 1 if any plugin fails, but continue processing the remaining plugins.

### Requirement: Output

For each plugin, the command MUST output:

- Plugin name
- Uninstall status (`uninstalled`, `skipped` or `error`, with its message or detail)

The format MUST be machine-parseable when invoked with `--format json` (or `toon`); the structured output is an object `{ plugins: [...] }`.

## Constraints

- The command MUST remove the plugin declaration from config on success.
- The command MUST call the plugin's uninstall hook before removing from config.

## Spec Dependencies

- [`plugin-manager:uninstall-plugin-use-case`](../../plugin-manager/uninstall-plugin-use-case/spec.md) — loads the plugin and orchestrates its removal
- [`core:composition`](../../core/composition/spec.md) — `createConfigWriter()` factory
- [`core:config-writer-port`](../../core/config-writer-port/spec.md) — removes plugin declaration
- [`cli:host-context`](../host-context/spec.md) — host bootstrap with `plugins: false`
