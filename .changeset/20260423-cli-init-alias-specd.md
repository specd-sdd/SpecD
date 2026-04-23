---
'@specd/specd': patch
---

20260423 - cli-init-alias: Add specd init as a top-level CLI alias that delegates to specd project init, giving new users a shorter, conventional command to bootstrap a project. Both invocation forms share the same handler, flags, interactive wizard, and output — no duplication needed since registerProjectInit() already parameterises the parent command.

Modified packages:

- @specd/cli

Specs affected:

- `cli:cli/project-init`
- `cli:cli/entrypoint`
