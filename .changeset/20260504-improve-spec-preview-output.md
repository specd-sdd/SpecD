---
    "@specd/cli": patch
    "@specd/core": patch
---

20260504 - improve-spec-preview-output: Enhances specd changes spec-preview by rendering explicit status labels (merged, no-op, missing) for all schema artifacts. Improves error handling to suggest alternative commands when a spec is not in the active change.

Specs affected:

- `cli:cli/change-spec-preview`
- `core:core/preview-spec`
