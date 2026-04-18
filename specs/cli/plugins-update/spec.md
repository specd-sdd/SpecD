# cli:cli/plugins-update

## Purpose

Defines the CLI contract for updating installed plugins. The command reinstalls plugins to pick up new versions or configuration changes.

## Requirements

### Requirement: Command signature

The command MUST accept optional plugin names as positional arguments:

```bash
specd plugins update [<plugin>...]
```

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

- [`plugin-manager:update-plugin-use-case`](../plugin-manager/update-plugin-use-case/spec.md) — orchestrates plugin update
- [`core:core/config-writer-port`](../core/config-writer-port/spec.md) — reads declared plugins
