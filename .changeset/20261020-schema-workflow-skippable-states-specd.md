---
'@specd/specd': patch
---

20261020 - schema-workflow-skippable-states: Schemas can now declare workflow steps as optional or disabled, with declarative checks (entry) and skipChecks (bypass) governed by monotonic allow\* locks, so lightweight workflows can skip verification or implementation without hardcoded lifecycle assumptions. A core:workflow-topology service, a single-cascade binding resolver and the shared ResolveChangeSchema make lifecycle guidance, validity reconciliation, archive and skills follow the change's own schema; status, CLI and skills render and route from structured status instead of fixed sequences.

Modified packages:

- @specd/core
- @specd/schema-std
- @specd/cli
- @specd/skills

Specs affected:

- `core:workflow-model`
- `core:check-registry`
- `core:transition-checks`
- `core:transition-change`
- `core:lifecycle-engine`
- `schema-std:standard-schema`
- `cli:change-status`
- `cli:change-transition`
- `skills:workflow-automation`
- `core:workflow-topology`
- `core:change-manifest`
- `core:validate-artifacts`
- `core:run-step-hooks`
- `core:preview-spec`
- `core:get-status`
- `core:archive-change`
- `core:approve-spec`
- `core:approve-signoff`
- `core:compile-context`
- `core:get-artifact-instruction`
- `core:get-hook-instructions`
- `core:edit-change`
- `core:invalidate-change`
- `core:count-tasks`
- `core:change`
- `core:resolve-change-schema`
- `core:fs-change-repository`
- `cli:change-validate`
- `cli:change-spec-preview`
- `cli:change-artifacts`
- `core:generate-metadata`
- `core:materialize-spec-metadata`
