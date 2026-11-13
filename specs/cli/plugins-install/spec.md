# cli:plugins-install

## Purpose

Defines the CLI contract for installing specd plugins. The command reads the current plugin configuration, validates each requested plugin, installs it via the plugin manager, and records the installation in the project configuration.

## Requirements

### Requirement: Command signature

The command MUST accept one or more plugin names as positional arguments:

```bash
specd plugins install <plugin> [<plugin>...] [--contributions <id>[,<id>...]]
```

Each `plugin` is a scoped npm package name (e.g., `@specd/plugin-agent-claude`). A name that does not satisfy the plugin name rule of `plugin-manager:specd-plugin-type` MUST be rejected before any load or install is attempted. `--contributions` restricts the installed contributions to the listed ids and is only valid with a single plugin; without it all contributions declared by the manifest are selected. An empty `--contributions` value (empty string, or only commas and blanks) MUST be rejected as invalid input with a CLI error and exit code 1, before any context is resolved, so nothing is loaded, installed or written. The command registers no contribution-kind handlers beyond the built-in `agents` handler, so a plugin whose manifest declares any other kind fails with `UnknownContributionKindError` (reported as that plugin's `error` result) and nothing is recorded for it.

### Requirement: Declaration source

When the command needs the set of declared plugins (for example to detect already-installed plugins), it MUST read from the loaded `SpecdConfig.plugins` field. It MUST NOT call `kernel.project.listPlugins` or `ConfigWriter.listPlugins` when a config snapshot is already available.

For already-installed detection, the command MUST look for the plugin name in the flat `config.plugins` list; there is no type bucket.

### Requirement: Display name

The command MUST display a suitable header above any tabular output. The header MUST be `Installed plugins` with a trailing colon, followed by newline-separated details.

### Requirement: Already-installed handling

When a plugin name is already declared in the `specd.yaml` `plugins` list:

- The command MUST emit a warning message containing the string `already installed` and the word `update` (in that order).
- The command SHOULD suggest using `update` to reinstall.
- The command MUST NOT re-install the plugin.

### Requirement: Installation workflow

For each plugin name that is not already installed:

1. The command MUST call the `InstallPlugin` use case from `@specd/plugin-manager`, passing the selected contribution ids when `--contributions` was given.
2. On success, the command MUST call `createConfigWriter().addPlugin(configPath, name, options)` to record the plugin in `specd.yaml`. `options.contributions` MUST be written only when `--contributions` was given. `options.config` MUST be the manifest `defaultConfig` returned by `InstallPlugin`, written only when the plugin declares one; the command MUST NOT write an empty `config`.
3. On failure, the command MUST emit the error message and continue with the remaining plugins.

The command MUST NOT call `kernel.project.addPlugin`. It MUST NOT call the plugin's `init`.

### Requirement: Host bootstrap without plugins

The command MUST obtain its host context with plugins disabled (`resolveCliContext({ plugins: false })`), so that a broken or missing configured plugin never prevents installing, replacing or repairing plugins.

### Requirement: Exit code

The command MUST exit with code 1 if any plugin fails to install, but continue processing the remaining plugins.

### Requirement: Output format

The command MUST output:

- Plugin name
- Installation status (`installed`, `skipped`, or `error` with its message)
- Any additional details

The format MUST be machine-parseable when invoked with `--format json` (or `toon`). The structured output MUST be an object `{ plugins: [...], hasErrors: boolean }`, where each entry carries `name`, `status` and optional `detail`, and `hasErrors` is `true` when at least one plugin failed. The same object shape is used by `specd plugins update` and `specd project update`.

## Constraints

- The command MUST NOT mutate `specd.yaml` for plugins that are already installed.
- The command MUST validate plugin names before attempting installation.

## Spec Dependencies

- [`plugin-manager:install-plugin-use-case`](../../plugin-manager/install-plugin-use-case/spec.md) — loads, validates and installs the plugin (the CLI does not call `LoadPlugin` separately)
- [`plugin-manager:specd-plugin-type`](../../plugin-manager/specd-plugin-type/spec.md) — plugin name rule and contribution ids
- [`core:composition`](../../core/composition/spec.md) — `createConfigWriter()` factory
- [`core:config-writer-port`](../../core/config-writer-port/spec.md) — persists plugin declarations via `addPlugin`
- [`core:get-config`](../../core/get-config/spec.md) — readonly `SpecdConfig` snapshot for declaration reads
- [`cli:host-context`](../host-context/spec.md) — host bootstrap with `plugins: false`
