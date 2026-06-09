---
    "@specd/skills": patch
    "@specd/plugin-agent-claude": patch
    "@specd/plugin-agent-copilot": patch
    "@specd/plugin-agent-codex": patch
    "@specd/plugin-agent-standard": patch
---

20260602 - route-agent-plugin-installs-through-resolve-bundle: Centralize built-in install-time render defaults by routing all agent-plugin skill bundle resolutions through the ResolveBundle use case. This refactor removes duplication across five agent plugins and ensures that defaults like sharedFolder and configPath are consistently applied and protected against project-root escapes.

Specs affected:

- `skills:resolve-bundle`
- `plugin-agent-claude:plugin-agent`
- `plugin-agent-copilot:plugin-agent`
- `plugin-agent-codex:plugin-agent`
- `plugin-agent-opencode:plugin-agent`
- `plugin-agent-standard:plugin-agent`
