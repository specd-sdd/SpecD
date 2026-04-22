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

Skills are written to `.codex/skills/<skill-name>/` under the project root.

## License

MIT
