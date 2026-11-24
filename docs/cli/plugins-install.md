# plugins install

`specd plugins install` installs one or more plugins and records them in `specd.yaml`.

## Command

```bash
specd plugins install <plugin> [<plugin>...] [--contributions <id>[,<id>...]]
```

Options:

- `--contributions <ids>` comma-separated contribution ids to install (one plugin only). An empty value, or one made only of commas and blanks, is rejected with exit code `1` before anything is loaded, installed or written.
- `--format <text|json|toon>` output format (default: `text`)
- `--config <path>` explicit `specd.yaml` path

## Behavior

- Validates plugin package names before attempting install.
- Skips plugins already declared in config and prints a warning containing `already installed` and `update`.
- For non-declared plugins:
  - Loads plugin runtime through plugin manager.
  - Runs install use case.
  - Persists the declaration in the flat `plugins` list. `--contributions` is allowed only when installing one plugin.
- Continues after per-plugin failures.
- Exits with code `1` if at least one plugin fails.

For agent plugins that install skills (`@specd/plugin-agent-codex`, `@specd/plugin-agent-claude`,
`@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`):

- Skill-local files are installed under the agent root at `<agent-skills-dir>/<skill-name>/`.
- Files marked as shared are installed once under the shared folder (default `<configPath>/skills/shared`, i.e. `.specd/config/skills/shared`). Each plugin registers itself in `<shared>/.owners.json` before it writes its first shared file, so an install that fails midway can still be uninstalled cleanly (see [Plugins](../guide/plugins.md)).
- Shared markdown files are written as-is (no skill frontmatter injection).

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
