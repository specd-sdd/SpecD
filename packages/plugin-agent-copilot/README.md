# @specd/plugin-agent-copilot

GitHub Copilot agent plugin for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Installs specd skills into `.github/skills/` with Copilot-specific YAML frontmatter.

## Install

```bash
specd plugins install @specd/plugin-agent-copilot
```

## Supported frontmatter fields

| Field                      | Required | Description               |
| -------------------------- | -------- | ------------------------- |
| `name`                     | Yes      | Display skill name        |
| `description`              | Yes      | Skill description         |
| `license`                  | Optional | License declaration       |
| `allowed-tools`            | Optional | Allowed tools declaration |
| `user-invocable`           | Optional | Mark user invocability    |
| `disable-model-invocation` | Optional | Disable model invocation  |

## Install target

Skills are written to `.github/skills/<skill-name>/` under the project root.

## License

MIT
