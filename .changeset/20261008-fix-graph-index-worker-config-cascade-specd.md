---
'@specd/specd': patch
---

20261008 - fix-graph-index-worker-config-cascade: Preserve config-resolution intent across the isolated graph-index boundary so automatic discovery replays local cascade layers in the child. Explicit --config remains forced, bootstrap remains explicit, and the fix adds focused coverage for descriptor transport, reconstruction, fail-fast behavior, and real cascade behavior.

Modified packages:

- @specd/cli
- @specd/code-graph
- @specd/core

Specs affected:

- `cli:graph-index`
- `code-graph:isolated-index-worker`
- `core:config-loader`
