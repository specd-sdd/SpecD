---
    "@specd/skills": patch
    "@specd/plugin-manager": patch
    "@specd/plugin-agent-claude": patch
    "@specd/plugin-agent-copilot": patch
    "@specd/plugin-agent-codex": patch
    "@specd/plugin-agent-standard": patch
---

20260602 - add-agent-capability-aware-skill-templates: Move @specd/skills from flat variable replacement to capability-aware Handlebars rendering for agent installs, with skill-owned metadata via skill.meta.json, shared-template resolution through requiredSharedTemplates, and privacy-safe sharedFolder handling. Update plugin-manager and the five agent plugins so they pass capability identifiers plus structured frontmatter/sharedFolder variables, while @specd/skills owns final markdown and frontmatter emission.

Specs affected:

- `skills:skill-templates-source`
- `skills:skill-repository`
- `skills:resolve-bundle`
- `plugin-manager:agent-plugin-type`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
