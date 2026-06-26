# cli:plugins-update

## Purpose

Defines the CLI contract for updating installed plugins. The command reinstalls plugins to pick up new versions or configuration changes.

## Requirements

### Requirement: Command signature

The command MUST accept optional plugin names as positional arguments:

```bash
specd plugins update [<plugin>...]
```

### Requirement: Declaration source

The command MUST enumerate declared plugins from the loaded `SpecdConfig.plugins` field (via `loadConfig` or an equivalent config snapshot). It MUST NOT call `kernel.project.listPlugins` or `ConfigWriter.listPlugins` when a config snapshot is already available.

When no plugin names are provided, the command MUST derive the update set from `config.plugins.agents` (or the appropriate declared type buckets).

### Requirement: Update behavior

- **Without arguments**: Updates all declared plugins in `specd.yaml`.
- **With plugin names**: Updates only the specified plugins.
- The command MUST be idempotent — running update multiple times produces the same result.
- The command MUST NOT mutate the plugin configuration in `specd.yaml`.

### Requirement: Exit code

The command MUST exit with code 1 if any plugin fails to update.

### Requirement: Output

For each plugin, the command MUST output:

- Plugin name
- Update status (`updated`, `skipped`, or error message)

The format MUST be machine-parseable when invoked with `--format json`.

## Constraints

- The command MUST be idempotent.
- The command MUST NOT add or remove plugins from config.

## Spec Dependencies

- [`plugin-manager:update-plugin-use-case`](../../plugin-manager/update-plugin-use-case/spec.md) — orchestrates plugin update
- [`core:get-config`](../../core/get-config/spec.md) — readonly `SpecdConfig` snapshot; `plugins` holds declarations
