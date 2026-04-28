---
'@specd/cli': minor
---

20260428 - change-spec-preview-artifact-flag: This change adds an optional --artifact <name> flag to specd change spec-preview so reviewers can focus output on a single spec-scoped artifact such as spec.md or verify.md. The CLI now resolves artifact IDs via the active schema, filters merged/diff/json preview output accordingly, and reports consistent errors for unknown, wrong-scope, or missing artifacts.

Specs affected:

- `cli:cli/change-spec-preview`
