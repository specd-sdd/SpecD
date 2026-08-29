---
'@specd/specd': minor
---

20260827 - package-fasttrack-skill: Packages specd-fasttrack as a canonical, capability-aware @specd/skills template, replacing the independently maintained local source. All supported agent plugins now discover and install it through ResolveBundle with runtime-specific structured frontmatter, while its prompt enforces incremental journaling for resumable code-first sessions.

Modified packages:

- @specd/skills
- @specd/plugin-agent-claude
- @specd/plugin-agent-copilot
- @specd/plugin-agent-codex
- @specd/plugin-agent-standard

Specs affected:

- `skills:skill-templates-source`
- `skills:skill-repository`
- `skills:resolve-bundle`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
