---
    "@specd/core": patch
    "@specd/cli": patch
---

20260522 - fix-validate-all-dag: Add Schema.artifactDag() and make changes validate --all follow schema DAG order with complete-file skip and shared DAG consumers.

Specs affected:

- `core:schema-format`
- `core:validate-artifacts`
- `cli:change-validate`
- `core:change`
- `core:invalidate-change`
- `core:lifecycle-engine`
- `cli:change-status`
- `core:get-artifact-instruction`
