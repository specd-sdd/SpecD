# plugins uninstall

`specd plugins uninstall` removes installed plugin effects and declaration entries.

## Command

```bash
specd plugins uninstall <plugin> [<plugin>...]
```

Options:

- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- For each plugin:
  - Loads runtime to determine plugin type.
  - Runs uninstall use case.
  - Removes declaration from `specd.yaml` through `ConfigWriter.removePlugin()`.
- Continues processing remaining plugins if one fails.
- Exits with code `1` if any uninstall fails.

## Output

Text output:

```text
<plugin-name>  <uninstalled|error>  <detail>
```

JSON/TOON output:

```json
{
  "plugins": [
    {
      "name": "@specd/plugin-agent-claude",
      "status": "uninstalled",
      "detail": "uninstalled '@specd/plugin-agent-claude'"
    }
  ]
}
```
