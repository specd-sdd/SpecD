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
  - Loads plugin runtime through plugin manager (`LoadPlugin`).
  - Runs `InstallPlugin` for agent plugins or `InstallUiPlugin` for UI plugins (`pluginType: "ui"` in `specd-plugin.json`).
  - Persists declaration via `ConfigWriter.addPlugin()` under `plugins.agents` or `plugins.ui`.
- Continues after per-plugin failures.
- Exits with code `1` if at least one plugin fails.

For agent plugins that install skills (`@specd/plugin-agent-codex`, `@specd/plugin-agent-claude`,
`@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`):

- Skill-local files are installed under the agent root at `<agent-skills-dir>/<skill-name>/`.
- Files marked as shared are installed once under `<agent-skills-dir>/_specd-shared/`.
- Shared markdown files are written as-is (no skill frontmatter injection).

For UI plugins (SpecD Studio):

- `@specd/plugin-ui-studio` — published static bundle; use with `specd ui serve` (embedded SPA).
- `@specd/studio-web` — Vite dev-server plugin for local UI development.

After install, run `specd ui serve` to start API + UI. See [ui serve](./ui-serve.md) and [Studio getting started](../studio/getting-started.md).

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
