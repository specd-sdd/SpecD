---
'@specd/specd': patch
---

20261022 - archive-schema-checks-and-skip-flag: Make changes archive resolve checks via the shared cascade (schema-declared archive checks under allow\* locks), add generic --skip-checks with resolved-binding skippability, keep --allow-overlap/--allow-out-of-scope as aliases, align status hints and CLI messages

Modified packages:

- @specd/core
- @specd/cli
- @specd/skills

Specs affected:

- `core:archive-change`
- `core:check-registry`
- `core:schema-format`
- `core:transition-checks`
- `cli:change-archive`
- `cli:change-status`
- `core:workflow-model`
- `core:change`
- `core:kernel`
- `core:get-status`
- `core:lifecycle-engine`
- `skills:skill-templates-source`
