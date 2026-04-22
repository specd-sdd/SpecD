---
'@specd/specd': patch
---

20260422 - fix-config-compliance: Align config behavior with current spec contracts by removing legacy artifactRules/skills handling, enforcing plugins validation at load time, and tightening workspace contextMode errors. The change also adds unknown-template warning callbacks and updates config show/docs so runtime output, verification scenarios, and documentation all reflect the same model. This closes the compliance gaps without changing the broader plugin-manager workflow.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:core/config`
- `cli:cli/config-show`
- `core:core/template-variables`
- `core:core/config-writer-port`
