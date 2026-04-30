# @specd/plugin-agent-standard

[Agent Skills](https://agentskills.io/) standard plugin for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Installs specd skills into `.agents/skills/` with YAML frontmatter compliant with the [Agent Skills specification](https://agentskills.io/specification).

## Install

```bash
specd plugins install @specd/plugin-agent-standard
```

## Supported frontmatter fields

| Field           | Required | Description                        |
| --------------- | -------- | ---------------------------------- |
| `name`          | Yes      | Display skill name                 |
| `description`   | Yes      | Skill description                  |
| `license`       | Optional | License declaration                |
| `compatibility` | Optional | Compatibility hint                 |
| `metadata`      | Optional | Metadata map                       |
| `allowed-tools` | Optional | Space-separated pre-approved tools |

## Install target

Skill-local files are written to `.agents/skills/<skill-name>/` under the project root.
Files marked as shared are written once to `.agents/skills/_specd-shared/`.

## Supported agents

This plugin targets the open [Agent Skills](https://agentskills.io/) standard, supported by 30+ agent clients including:

- [Claude Code](https://claude.ai/code)
- [OpenAI Codex](https://developers.openai.com/codex)
- [GitHub Copilot](https://github.com/features/copilot)
- [Cursor](https://cursor.com/)
- [Gemini CLI](https://geminicli.com)
- [Amp](https://ampcode.com/)
- [Roo Code](https://roocode.com)
- [OpenCode](https://opencode.ai/)
- [OpenHands](https://openhands.dev/)
- [Goose](https://block.github.io/goose/)
- [Kiro](https://kiro.dev/)
- [VS Code](https://code.visualstudio.com/)
- [JetBrains Junie](https://junie.jetbrains.com/)
- [Mistral Vibe](https://github.com/mistralai/mistral-vibe)
- [Mux](https://mux.coder.com/)
- [Letta](https://www.letta.com/)
- [Factory](https://factory.ai/)
- [Emdash](https://emdash.sh)
- [Spring AI](https://docs.spring.io/spring-ai/reference)

See the full list at [agentskills.io/clients](https://agentskills.io/clients).

## Uninstall behavior

- `specd plugins uninstall @specd/plugin-agent-standard --skills <name>` removes only selected skill directories and keeps `_specd-shared/`.
- `specd plugins uninstall @specd/plugin-agent-standard` removes `.agents/skills/` completely, including `_specd-shared/`.

## License

MIT
