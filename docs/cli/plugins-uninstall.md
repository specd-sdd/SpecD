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
  - Loads the plugin through the real loader first.
  - If the load succeeds, runs the uninstall use case (a hook failure keeps the declaration and reports `error`).
  - Removes declaration from `specd.yaml` through `ConfigWriter.removePlugin()`.
- A plugin name listed more than once is processed once; the repeat is reported as `skipped` with the detail `already processed`.
- When a declared plugin cannot be loaded for any reason (missing package, invalid `specd-plugin.json`, import failure) no uninstall hook can run: the declaration is still removed from `specd.yaml` and the result is `uninstalled` with the detail `package not found; only the declaration was removed` for a missing package, or `plugin failed to load (<reason>); only the declaration was removed` for any other load failure. A plugin that is not declared is an error and nothing is removed.
- Agent plugins only ever delete what specd installed: a filtered uninstall validates the selected skill and agent names against the specd-managed ones, and anything else (an unknown name, a path separator, `..`) is skipped and never touched. A full uninstall removes the managed agent files from both the runtime agents directory and the shared folder.
- Continues processing remaining plugins if one fails.
- Exits with code `1` if any uninstall fails.

## Output

Text output:

```text
<plugin-name>  <uninstalled|skipped|error>  <detail>
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
