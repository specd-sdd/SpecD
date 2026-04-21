---
    "@specd/plugin-agent-codex": minor
    "@specd/plugin-agent-copilot": minor
    "@specd/skills": minor
    "@specd/cli": patch
---

20260421 - complete-agent-plugins-codex-copilot-open-code: Replace stub Codex and Copilot agent plugins with real install/uninstall behavior at parity with Claude, create a new Open Code plugin package following the same architecture, update CLI wizard and metapackage wiring, and expand the skills template source spec to cover all four runtimes' frontmatter contracts.

Specs affected:

- `plugin-agent-codex:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `skills:skill-templates-source`
- `plugin-agent-opencode:plugin-agent`
- `cli:cli/project-init`
- `specd:meta-package`
