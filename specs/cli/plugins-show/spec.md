# cli:cli/plugins-show

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
- Plugin type
- Version (from the npm package)
- Configuration schema (if any)
- Capabilities

The format MUST be machine-parseable when invoked with `--format json`.

### Requirement: Error handling

If the plugin cannot be loaded, the command MUST emit an error message and exit with code 1.

## Constraints

- The command MUST NOT modify any state.

## Spec Dependencies

- [`plugin-manager:load-plugin-use-case`](../plugin-manager/load-plugin-use-case/spec.md) — loads and returns plugin details
