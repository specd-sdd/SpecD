---
'@specd/specd': minor
---

20260429 - shared-skill-bundle-targets: Adds first-class shared file support for skill bundles so plugin installers can route shared templates to a dedicated shared directory while preserving compatibility when no shared target is configured. Agent plugin installers now install and uninstall only specd-managed skills, keeping unrelated user skills untouched during full uninstall operations. The change also standardizes shared template references and verifies end-to-end behavior across codex, claude, copilot, and opencode plugin workflows.

Modified packages:

- @specd/skills
- @specd/plugin-manager
- @specd/plugin-agent-codex
- @specd/plugin-agent-claude
- @specd/plugin-agent-copilot

Specs affected:

- `skills:skill-bundle`
- `skills:skill-repository-port`
- `skills:skill-repository-infra`
- `skills:resolve-bundle`
- `plugin-manager:agent-plugin-type`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
