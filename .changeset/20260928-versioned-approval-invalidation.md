---
    "@specd/core": minor
    "@specd/cli": minor
    "@specd/skills": minor
---

20260928 - versioned-approval-invalidation: Introduces versioned v2 change manifests with append-only audit history and explicit materialized validity for spec approval, sign-off, and verification, while preserving read compatibility with legacy v1 manifests. Separates artifact reopening from workflow recovery, adds scope-aware and normalized whole-file implementation fingerprints, and centralizes reconciliation so gates and drift produce precise, phase-aware recovery. Exposes verification lifecycle commands and aligns CLI, skills, documentation, and archive preflight with the same validity protocol.

Specs affected:

- `core:change`
- `core:change-repository-port`
- `core:config`
- `core:approve-spec`
- `core:approve-signoff`
- `core:validate-artifacts`
- `core:invalidate-change`
- `core:edit-change`
- `core:transition-change`
- `core:get-status`
- `core:archive-change`
- `cli:change-status`
- `cli:change-invalidate`
- `cli:change-approve`
- `cli:change-transition`
- `core:change-manifest`
- `core:schema-format`
- `core:transition-checks`
- `skills:workflow-automation`
- `skills:skill-templates-source`
- `core:create-change`
- `cli:change-create`
- `cli:change-edit`
- `cli:change-verification`
- `core:invalidate-verification`
