# plugins list

`specd plugins list` reports declared plugins and their runtime status.

## Command

```bash
specd plugins list [--type <type>]
```

Options:

- `--type <type>` declaration bucket filter (for example, `agents`)
- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Reads declared plugins from `specd.yaml` via `ConfigWriter.listPlugins()`.
- Attempts runtime load through plugin manager for each declaration.
- Emits status:
  - `installed` when plugin loads.
  - `not_found` when package is not installed.
  - `error` when load fails for another reason.
- Does not mutate config or plugin files.

## Output

Text output prints:

```text
Installed plugins:
<plugin-name>  <type>  <version-or-dash>  <status>  <optional-detail>
```

If no declarations exist, text output is:

```text
no plugins declared
```

JSON/TOON output:

```json
{
  "plugins": [
    {
      "name": "@specd/plugin-agent-claude",
      "type": "agents",
      "status": "installed",
      "version": "0.0.1"
    }
  ]
}
```
