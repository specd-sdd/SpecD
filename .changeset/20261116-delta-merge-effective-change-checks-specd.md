---
'@specd/specd': minor
---

20261116 - delta-merge-effective-change-checks: Fixes silent no-op delta merges across the Markdown, YAML, and Plaintext parsers by invalidating stale cached serialization metadata (\_inlines, \_blockquoteChildren, \_yaml) on mutated nodes and aligning PlaintextParser paragraph descriptors with value updates. Tightens applyDelta and validateRename to reject empty modified entries and rename operations targeting contains-only nodes without a name/label identifier. Adds an in-memory sequential effective-change check in ValidateArtifacts so every non-no-op delta operation must alter the serialized output relative to the preceding state.

Modified packages:

- @specd/core

Specs affected:

- `core:delta-format`
- `core:artifact-parser-port`
- `core:validate-artifacts`
