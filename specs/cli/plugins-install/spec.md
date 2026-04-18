# cli:cli/plugins-install

## Purpose

Defines the CLI contract for installing specd plugins. The command reads the current plugin configuration, validates each requested plugin, installs it via the plugin manager, and records the installation in the project configuration.

## Requirements

### Requirement: Command signature

The command MUST accept one or more plugin names as positional arguments:

```bash
specd plugins install <plugin> [<plugin>...]
```

Each `plugin` is an npm package name (e.g., `@specd/plugin-agent-claude`).

### Requirement: Display name

The command MUST display a suitable header above any tabular output. The header MUST be `Installed plugins` with a trailing colon, followed by newline-separated details.

### Requirement: Already-installed handling

When a plugin name is already declared in `specd.yaml` under the appropriate type:

- The command MUST emit a warning message containing the string `already installed` and the word `update` (in that order).
- The command SHOULD suggest using `update` to reinstall.
- The command MUST NOT re-install the plugin.

### Requirement: Installation workflow

For each plugin name that is not already installed:

1. The command MUST call the `InstallPlugin` use case from `@specd/plugin-manager`.
2. On success, the command MUST call `ConfigWriter.addPlugin()` to record the plugin in `specd.yaml`.
3. On failure, the command MUST emit the error message and continue with the remaining plugins.

### Requirement: Exit code

The command MUST exit with code 1 if any plugin fails to install, but continue processing the remaining plugins.

### Requirement: Output format

The command MUST output:

- Plugin name
- Installation status (`installed`, `skipped`, or error message)
- Any additional details

The format MUST be machine-parseable when invoked with `--format json`.

## Constraints

- The command MUST NOT mutate `specd.yaml` for plugins that are already installed.
- The command MUST validate plugin names before attempting installation.

## Spec Dependencies

- [`plugin-manager:install-plugin-use-case`](../plugin-manager/install-plugin-use-case/spec.md) — orchestrates plugin installation
- [`plugin-manager:load-plugin-use-case`](../plugin-manager/load-plugin-use-case/spec.md) — validates plugin before installation
- [`core:core/config-writer-port`](../core/config-writer-port/spec.md) — persists plugin declarations
