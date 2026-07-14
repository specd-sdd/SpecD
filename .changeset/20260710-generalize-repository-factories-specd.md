---
'@specd/specd': patch
---

20260710 - generalize-repository-factories: Track future refactor to remove hardcoded fs dispatch from public repository factories and route adapter resolution through extensible composition wiring.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:composition`
- `sdk:composition`
- `core:composition-resolver`
- `core:kernel-builder`
- `core:kernel`
- `core:config`
- `core:config-writer-port`
- `cli:config-show`
- `core:fs-change-repository`
- `core:fs-spec-repository`
- `core:fs-archive-repository`
- `core:fs-schema-repository`
