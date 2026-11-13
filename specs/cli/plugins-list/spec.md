# cli:plugins-list

## Purpose

Defines the CLI contract for listing installed plugins. The command reads the plugin configuration and reports on each declared plugin's status.

## Requirements

### Requirement: Command signature

The command takes no plugin-type filter:

```bash
specd plugins list
```

The former `--type` flag is removed: plugins are a flat list and have no type.

### Requirement: Declaration source

The command MUST enumerate declared plugins from the loaded `SpecdConfig.plugins` field (via `loadConfig` or an equivalent config snapshot). It MUST NOT call `kernel.project.listPlugins` or re-read `specd.yaml` through `ConfigWriter.listPlugins` when a config snapshot is already available.

The command MUST list every entry of the flat `config.plugins` list. It MUST obtain its host context with plugins disabled (`resolveCliContext({ plugins: false })`), so that listing never fails because of a broken configured plugin.

### Requirement: Plugin status detection

For each plugin declared in `specd.yaml`:

- **installed**: The plugin is in config and can be loaded by the plugin manager (`ListPlugins` use case, loaded state).
- **not_found**: The plugin is in config but the npm package is not installed.
- **error**: The plugin is in config but fails to load (show error message as detail).

For a `not_found` or `error` plugin the manifest is unavailable, so `contributions.declared` MUST be an empty list and `contributions.selected` MUST be the entry's `contributions` allowlist, or an empty list when the entry has none.

### Requirement: Output format

The command MUST output:

- Plugin name
- Contributions: the declared ids of the manifest and which of them are selected (the entry's `contributions` allowlist, or all when absent; see the status rules for unavailable manifests)
- Version (the version of the loaded plugin, which equals the `version` of its `specd-plugin.json`; absent when the plugin could not be loaded); text output MUST show `-` when unknown
- Status (`installed`, `not_found`, or `error`), with a detail message for `error`

The format MUST be machine-parseable when invoked with `--format json` (or `toon`): `{ plugins: [{ name, contributions: { declared, selected }, status, version?, detail? }] }`.

In text format, whenever at least one plugin is declared, the output starts with the line `Installed plugins:` (also when every row is `not_found` or `error`) followed by one line per plugin (name, status, version or `-`, then the selected contribution ids); a detail message is shown for `error` and `not_found` rows. When no plugin is declared the command MUST print `no plugins declared`; JSON output is `{ plugins: [] }`.

## Constraints

- The command MUST NOT modify any state.

## Spec Dependencies

- [`plugin-manager:load-plugin-use-case`](../../plugin-manager/load-plugin-use-case/spec.md) — runtime load status per declared plugin
- [`core:get-config`](../../core/get-config/spec.md) — readonly `SpecdConfig` snapshot; `plugins` holds declarations
- [`cli:host-context`](../host-context/spec.md) — host bootstrap with `plugins: false`
