# @specd/plugin-agent-opencode

Open Code agent plugin for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Installs specd skills into `.opencode/skills/` with Open Code-specific YAML frontmatter.

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

Skill-local files are written to `.opencode/skills/<skill-name>/` under the project root.
Files marked as shared are written once to `.opencode/skills/_specd-shared/`.

## Uninstall behavior

- `specd plugins uninstall @specd/plugin-agent-opencode --skills <name>` removes only selected skill directories and keeps `_specd-shared/`.
- `specd plugins uninstall @specd/plugin-agent-opencode` removes `.opencode/skills/` completely, including `_specd-shared/`.

## License

MIT
