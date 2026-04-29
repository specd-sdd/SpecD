# @specd/plugin-agent-codex

Codex agent plugin for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Installs specd skills into `.codex/skills/` with Codex-specific YAML frontmatter.

## Install

```bash
specd plugins install @specd/plugin-agent-codex
```

## Supported frontmatter fields

| Field         | Required | Description        |
| ------------- | -------- | ------------------ |
| `name`        | Yes      | Display skill name |
| `description` | Yes      | Skill description  |

## Install target

Skill-local files are written to `.codex/skills/<skill-name>/` under the project root.
Files marked as shared are written once to `.codex/skills/_specd-shared/`.

## Uninstall behavior

- `specd plugins uninstall @specd/plugin-agent-codex --skills <name>` removes only selected skill directories and keeps `_specd-shared/`.
- `specd plugins uninstall @specd/plugin-agent-codex` removes `.codex/skills/` completely, including `_specd-shared/`.

## License

MIT
