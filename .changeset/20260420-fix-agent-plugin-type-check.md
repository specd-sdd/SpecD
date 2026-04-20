---
'@specd/plugin-manager': patch
---

20260420 - fix-agent-plugin-type-check: The `isAgentPlugin` type guard now validates that `plugin.type === 'agent'` in addition to checking for `install` and `uninstall` methods, ensuring runtime consistency with the `AgentPlugin` interface definition.
