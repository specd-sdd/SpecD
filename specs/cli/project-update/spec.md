# Project Update

## Purpose

After upgrading specd, installed skill files and other project artifacts can fall out of sync with the new package version. The `specd project update` command provides a single entry point for post-upgrade maintenance; in v1 it runs `specd skills update` for all agents declared in `specd.yaml`, and is designed so future tasks (plugin sync, config migration, etc.) can be added without changing the user's workflow.

## Requirements

### Requirement: Command signature

```
specd project update [--format text|json|toon]
```

- `--format text|json|toon` — optional; output format, defaults to `text`.

### Requirement: Skills update step

The command runs the plugin update logic for all plugins declared in `specd.yaml`'s `plugins` section (equivalent to `specd plugins update` with no plugin filter). The update is idempotent.

### Requirement: Output on success

In `text` mode, the command prefixes each sub-step's output with a step label:

```
plugins: updated @specd/plugin-agent-claude
plugins: updated @specd/plugin-agent-copilot
```

If there is nothing to update (no plugins declared, all steps are no-ops), the command prints `project is up to date` and exits with code 0.

### Requirement: Partial failure

If the skills update step produces warnings (skill no longer in bundle), those warnings are printed to stderr as they are in `specd skills update`. The command still exits with code 0. No step causes a non-zero exit in v1.

## Constraints

- `specd project update` requires an existing `specd.yaml`; if none is found it exits with code 1 with an `error:` message
- In v1 the only update step is skills; future versions may add plugin sync, config schema migration, etc.
- The command does not modify `specd.yaml` itself — it only updates file-system artifacts (skill files) recorded in it

## Examples

```
# Update everything after upgrading specd
specd project update

# Machine-readable output (useful in CI)
specd project update --format json
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`cli:cli/skills-update`](../skills-update/spec.md) — skills update logic and output format
- [`core:core/config`](../../core/config/spec.md) — specd.yaml structure and skills manifest
