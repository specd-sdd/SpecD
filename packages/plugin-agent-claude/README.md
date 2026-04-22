# @specd/plugin-agent-claude

Claude agent plugin for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Installs specd skills into `.claude/skills/` with Claude-specific YAML frontmatter.

## Install

```bash
specd plugins install @specd/plugin-agent-claude
```

## Supported frontmatter fields

| Field                      | Required | Description                |
| -------------------------- | -------- | -------------------------- |
| `name`                     | Optional | Display skill name         |
| `description`              | Yes      | Skill description          |
| `allowed_tools`            | Optional | Allowed tools declaration  |
| `argument_hint`            | Optional | Argument hint              |
| `when_to_use`              | Optional | Usage guidance for routing |
| `disable_model_invocation` | Optional | Disable model invocation   |
| `user_invocable`           | Optional | Mark user invocability     |
| `model`                    | Optional | Model hint                 |
| `effort`                   | Optional | Effort hint                |
| `context`                  | Optional | Context hint               |
| `agent`                    | Optional | Agent hint                 |
| `hooks`                    | Optional | Hooks map                  |
| `paths`                    | Optional | Path selector              |
| `shell`                    | Optional | Shell hint                 |

## Install target

Skills are written to `.claude/skills/<skill-name>/` under the project root.

## License

MIT
