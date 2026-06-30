# cli:plugins-install

## Purpose

Defines the CLI contract for installing specd plugins. The command reads the current plugin configuration, validates each requested plugin, installs it via the plugin manager, and records the installation in the project configuration.

## Requirements

### Requirement: Command signature

The command MUST accept one or more plugin names as positional arguments:

```bash
specd plugins install <plugin> [<plugin>...]
```

Each `plugin` is an npm package name (e.g., `@specd/plugin-agent-claude`).

### Requirement: Declaration source

When the command needs the set of declared plugins (for example to detect already-installed plugins), it MUST read from the loaded `SpecdConfig.plugins` field. It MUST NOT call `kernel.project.listPlugins` or `ConfigWriter.listPlugins` when a config snapshot is already available.

For already-installed detection, the command MUST consult the appropriate type bucket in `config.plugins` (`agents` for agent plugins, `ui` for UI plugins) after the plugin type is known from `LoadPlugin`.

### Requirement: Display name

The command MUST display a suitable header above any tabular output. The header MUST be `Installed plugins` with a trailing colon, followed by newline-separated details.

### Requirement: Already-installed handling

When a plugin name is already declared in `specd.yaml` under the appropriate type:

- The command MUST emit a warning message containing the string `already installed` and the word `update` (in that order).
- The command SHOULD suggest using `update` to reinstall.
- The command MUST NOT re-install the plugin.

### Requirement: Installation workflow

For each plugin name that is not already installed in its type bucket:

1. The command MUST load the plugin via `LoadPlugin` to determine `plugin.type`.
2. For `agent` plugins, the command MUST call `InstallPlugin` from `@specd/plugin-manager`.
3. For `ui` plugins, the command MUST call `InstallUiPlugin` from `@specd/plugin-manager`.
4. On success, the command MUST call `createConfigWriter().addPlugin(configPath, type, name, config)` where `type` is `agents` for agent plugins and `ui` for UI plugins.
5. On failure, the command MUST emit the error message and continue with the remaining plugins.

The command MUST NOT call `kernel.project.addPlugin`. It SHOULD construct a kernel only when subsequent domain operations require one.

The command MUST NOT route UI plugins through `InstallPlugin` or persist them under `plugins.agents`.

### Requirement: Plugin type bucket mapping

Runtime `plugin.type` MUST map to config buckets as follows:

| `plugin.type` | `plugins` bucket |
| ------------- | ---------------- |
| `agent`       | `agents`         |
| `ui`          | `ui`             |

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

- [`plugin-manager:install-plugin-use-case`](../../plugin-manager/install-plugin-use-case/spec.md) — agent plugin installation
- [`plugin-manager:ui-plugin-type`](../../plugin-manager/ui-plugin-type/spec.md) — UI plugin installation via `InstallUiPlugin`
- [`plugin-manager:load-plugin-use-case`](../../plugin-manager/load-plugin-use-case/spec.md) — validates plugin before installation
- [`core:composition`](../../core/composition/spec.md) — `createConfigWriter()` factory
- [`core:config-writer-port`](../../core/config-writer-port/spec.md) — persists plugin declarations via `addPlugin`
- [`core:get-config`](../../core/get-config/spec.md) — readonly `SpecdConfig` snapshot for declaration reads
