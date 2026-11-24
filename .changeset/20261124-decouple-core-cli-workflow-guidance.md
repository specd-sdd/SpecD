---
    "@specd/core": minor
    "@specd/cli": minor
    "@specd/skills": patch
---

20261124 - decouple-core-cli-workflow-guidance: Replaces CLI command strings, slash commands and bypass flags in the @specd/core lifecycle, status and validity projections with host-neutral phase intents and check-declared actions, which the CLI renders through a guidance presenter. Checks now own their failure reporting and skippability, legacy parking states are gated by checks, spec consent is renewed in `ready`, and committed recoveries are rendered as repair guides. Status, transition, archive, invalidate, approve, edit and verification output is aligned across text, JSON and TOON.

Specs affected:

- `core:lifecycle-engine`
- `core:get-status`
- `cli:change-status`
- `cli:change-transition`
- `cli:change-invalidate`
- `core:transition-checks`
- `core:transition-change`
- `core:invalidate-change`
- `cli:change-verification`
- `default:_global/error-handling-conventions`
- `core:change`
- `core:workflow-topology`
- `core:approve-spec`
- `core:approve-signoff`
- `core:archive-change`
- `core:workflow-model`
- `cli:change-archive`
- `skills:skill-templates-source`
- `cli:change-approve`
- `core:edit-change`
- `cli:change-edit`
- `core:create-change`
