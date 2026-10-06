---
'@specd/specd': patch
---

20260929 - fix-config-spec-drift: Fix spec drift in core:config, core:config-loader, and core:config-writer-port to align normative specs with existing implementation. Resolves Issue #57 by correcting initProject and listPlugins signatures and removing obsolete hook mapping scenarios.

Modified packages:

- @specd/core

Specs affected:

- `core:config`
- `core:config-loader`
- `core:config-writer-port`
