---
'@specd/specd': patch
---

20260929 - include-overlaps-in-project-summary: Add opt-in overlap enrichment to GetProjectSummary so hosts can read project spec-validation health and active-change overlaps from one aggregate.

Modified packages:

- @specd/core
- @specd/cli
- @specd/sdk

Specs affected:

- `core:get-project-summary`
- `cli:project-status`
- `sdk:build-project-status-snapshot`
- `core:kernel`
