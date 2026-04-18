# project update

`specd project update` updates project-managed assets for currently declared plugins.

## Command

```bash
specd project update [options]
```

Options:

- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Reads declarations from `specd.yaml` (`plugins.agents`).
- Runs plugin update orchestration for each declared plugin.
- Emits `plugins:`-prefixed text rows to show per-plugin status.
- Returns empty plugin list when project has no declared plugins.
- Exits with code `1` if any plugin update fails.

## Output

Text output:

```text
plugins: updated <plugin-name>
plugins: <skipped|error> <plugin-name> (<detail>)
```

When no plugins are declared:

```text
project is up to date
```

JSON/TOON output:

```json
{
  "plugins": [
    {
      "name": "@specd/plugin-agent-claude",
      "status": "updated",
      "detail": "updated '@specd/plugin-agent-claude'"
    }
  ]
}
```
