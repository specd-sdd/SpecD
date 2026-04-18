# plugins update

`specd plugins update` re-runs plugin update logic for declared plugins.

## Command

```bash
specd plugins update [<plugin>...]
```

Options:

- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Without positional plugin names: updates all declared `plugins.agents`.
- With plugin names: updates only the selected names.
- For undeclared names, emits `skipped` with detail.
- Does not add or remove plugin declarations.
- Exits with code `1` if at least one plugin update fails.

## Output

Text output:

```text
<plugin-name>  <updated|skipped|error>  <detail>
```

When nothing is declared:

```text
no plugins to update
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
  ],
  "hasErrors": false
}
```
