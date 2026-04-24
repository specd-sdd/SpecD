---
    "@specd/core": patch
    "@specd/cli": patch
---

20260424 - enforce-artifact-path-validation: Ensures change manifests and validation strictly target correct artifact paths (deltas vs specs) from creation time, and enhances CLI output to report explicit file paths with merged-spec preview guidance.

Specs affected:

- `core:core/change-layout`
- `core:core/change-manifest`
- `core:core/validate-artifacts`
- `cli:cli/change-validate`
