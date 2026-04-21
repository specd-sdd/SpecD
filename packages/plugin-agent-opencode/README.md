# @specd/plugin-agent-opencode

Open Code agent plugin for specd. Installs specd skills into `.opencode/skills/` with Open Code-specific YAML frontmatter.

## Install

```bash
specd plugins install @specd/plugin-agent-opencode
```

## Supported frontmatter fields

| Field           | Required | Description         |
| --------------- | -------- | ------------------- |
| `name`          | Yes      | Display skill name  |
| `description`   | Yes      | Skill description   |
| `license`       | Optional | License declaration |
| `compatibility` | Optional | Compatibility hint  |
| `metadata`      | Optional | Metadata map        |

## Install target

Skills are written to `.opencode/skills/<skill-name>/` under the project root.

## License

MIT
