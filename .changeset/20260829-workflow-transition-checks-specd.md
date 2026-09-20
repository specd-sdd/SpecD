---
'@specd/specd': patch
---

20260829 - workflow-transition-checks: Evaluate each lifecycle transition as an ordered list of workflow checks (protocol, schema-derived, core binding) so status, nextAction, and execute share one contract, including dependency consistency at ready.

Modified packages:

- @specd/core
- @specd/cli
- @specd/skills

Specs affected:

- `core:lifecycle-engine`
- `core:get-status`
- `core:transition-change`
- `core:workflow-model`
- `core:archive-change`
- `cli:change-status`
- `cli:change-transition`
- `core:transition-checks`
- `core:change`
- `skills:skill-templates-source`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `cli:change-approve`
- `core:config`
- `cli:change-archive`
- `core:validate-artifacts`
- `core:get-artifact-instruction`
- `core:schema-format`
- `core:storage`
- `default:_global/logging`
- `default:_global/architecture`
