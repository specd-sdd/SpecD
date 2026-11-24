# cli:plugins-show

## Purpose

Defines the CLI contract for showing detailed plugin information. The command loads a plugin and displays its metadata, configSchema, and capabilities.

## Requirements

### Requirement: Command signature

The command MUST accept a single plugin name as a positional argument:

```bash
specd plugins show <plugin>
```

### Requirement: Output

The command MUST display:

- Plugin name
- Version (the version of the loaded plugin, equal to the `version` of its `specd-plugin.json`)
- Contributions: every declared contribution as kind and id, with its address (`<name>.<id>`)
- Configuration schema and `defaultConfig` (if any)
- Capabilities: the supported lifecycle capabilities (`install`, `uninstall`), shown only when the plugin implements an `install` or `uninstall` hook or declares the `agents` contribution kind. When none applies the capabilities line MUST be omitted entirely (text) and the `capabilities` field omitted (JSON).

The format MUST be machine-parseable when invoked with `--format json`. The command MUST obtain its host context with plugins disabled (`resolveCliContext({ plugins: false })`) and MUST NOT call the plugin's `init`.

### Requirement: Error handling

If the plugin cannot be loaded, the command MUST emit an error message and exit with code 1.

## Constraints

- The command MUST NOT modify any state.

## Spec Dependencies

- [`plugin-manager:load-plugin-use-case`](../../plugin-manager/load-plugin-use-case/spec.md) — loads and returns plugin details
- [`cli:host-context`](../host-context/spec.md) — host bootstrap with `plugins: false`
