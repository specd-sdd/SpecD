# Project Update

## Purpose

After upgrading specd or a plugin, the files that plugins installed into the project can fall out of sync with the new package versions. The `specd project update` command provides a single entry point for post-upgrade maintenance; it updates every plugin declared in `specd.yaml` through the plugin manager, and is designed so future steps (config migration, etc.) can be added without changing the user's workflow.

## Requirements

### Requirement: Command signature

```
specd project update [--format text|json|toon]
```

- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Plugin update step

The command runs the plugin update logic for all plugins declared in the `plugins` list of `specd.yaml` (equivalent to `specd plugins update` with no plugin filter), sharing the same implementation. Each plugin is updated through the `UpdatePlugin` use case of `@specd/plugin-manager` (not by re-running `install()`), honouring each entry's `contributions` allowlist. The update is idempotent. The command opens its host with plugins disabled (`plugins: false`) like `specd plugins update`, and MUST NOT modify `specd.yaml`.

### Requirement: Output on success

In `text` mode, the command prefixes each plugin's output line with the step label `plugins:`:

```
plugins: updated @specd/plugin-agent-claude
plugins: updated @specd/plugin-agent-copilot
```

A plugin with an `error` status is printed as `plugins: error <name> (<detail>)`.

If no plugins are declared, the command prints `project is up to date` and exits with code 0. When plugins are declared, one line per plugin is printed.

In `json` or `toon` mode the output is an object `{ plugins: [...], hasErrors: boolean }` (same shape as `specd plugins update`), where each entry carries `name`, `status` and optional `detail`.

### Requirement: Partial failure

Per-plugin result lines (`updated` or `error`) are printed to stdout. If any plugin update reports an error, the command still processes every remaining plugin and then exits with code 1; `hasErrors` is `true` in structured output.

## Constraints

- `specd project update` requires an existing `specd.yaml`; if none is found it exits with code 1 with an `error:` message
- The only update step is plugin update; future versions may add config schema migration, etc.
- The command does not modify `specd.yaml` itself — it only updates the file-system artifacts that the declared plugins installed

## Examples

```
# Update everything after upgrading specd
specd project update

# Machine-readable output (useful in CI)
specd project update --format json
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`cli:plugins-update`](../plugins-update/spec.md) — plugin update logic and output format
- [`cli:host-context`](../host-context/spec.md) — host bootstrap with `plugins: false`
- [`core:config`](../../core/config/spec.md) — specd.yaml structure and the `plugins` list
