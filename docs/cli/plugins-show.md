# plugins show

`specd plugins show` prints metadata for one plugin package.

## Command

```bash
specd plugins show <plugin>
```

Options:

- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Loads the plugin runtime through plugin manager.
- Displays:
  - `name`
  - `type`
  - `version`
  - `configSchema`
  - runtime-derived capabilities (`init`, `destroy`, and when present `install`/`uninstall`)
- Exits with code `1` when the plugin cannot be loaded.
- Does not mutate config or plugin files.

## Output

Text output example:

```text
name: @specd/plugin-agent-claude
type: agent
version: 0.0.1
capabilities: init, destroy, install, uninstall
configSchema: {}
```

JSON/TOON output example:

```json
{
  "name": "@specd/plugin-agent-claude",
  "type": "agent",
  "version": "0.0.1",
  "configSchema": {},
  "capabilities": ["init", "destroy", "install", "uninstall"]
}
```
