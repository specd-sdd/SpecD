# plugins install

`specd plugins install` installs one or more plugins and records them in `specd.yaml`.

## Command

```bash
specd plugins install <plugin> [<plugin>...]
```

Options:

- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Validates plugin package names before attempting install.
- Skips plugins already declared in config and prints a warning containing `already installed` and `update`.
- For non-declared plugins:
  - Loads plugin runtime through plugin manager.
  - Runs install use case.
  - Persists declaration via `ConfigWriter.addPlugin()` under `plugins.agents`.
- Continues after per-plugin failures.
- Exits with code `1` if at least one plugin fails.

## Output

Text output prints:

```text
Installed plugins:
<plugin-name>  <installed|skipped|error>  <detail>
```

JSON/TOON output:

```json
{
  "plugins": [
    {
      "name": "@specd/plugin-agent-claude",
      "status": "installed",
      "detail": "installed '@specd/plugin-agent-claude'"
    }
  ],
  "hasErrors": false
}
```
