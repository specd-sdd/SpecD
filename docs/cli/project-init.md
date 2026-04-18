# project init

`specd project init` initializes `specd.yaml` and can install plugins in the same flow.

## Command

```bash
specd project init [options]
```

Options:

- `--schema <ref>` schema reference (default: `@specd/schema-std`)
- `--workspace <id>` default workspace id (default: `default`)
- `--workspace-path <path>` specs path (default: `specs/`)
- `--plugin <name>` plugin to install after init (repeatable)
- `--force` overwrite existing `specd.yaml`
- `--format <text|json|toon>` output format (default: `text`)

## Behavior

- Initializes project config and storage via core `InitProject`.
- Supports interactive setup when run in TTY text mode with no flags:
  - asks schema/workspace/specs path
  - offers multi-select plugin installation
- Plugin installation after init uses the same orchestration as `plugins install`.
- Plugin declarations are persisted under `plugins.agents`.
- Exits with code `1` if any selected plugin installation fails.

## Output

Text output:

```text
initialized specd in <project-root>
plugins: <status> <plugin-name> (<detail>)
```

JSON/TOON output:

```json
{
  "result": "ok",
  "configPath": "/abs/path/specd.yaml",
  "schema": "@specd/schema-std",
  "workspaces": ["default"],
  "plugins": []
}
```
