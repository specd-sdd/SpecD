---
'@specd/specd': minor
---

20261012 - code-graph-file-categories: Categorize code graph files into source, test, and ignored with configurable project/workspace patterns. Exclude test callers and candidates from production blast radius risk calculations and hotspot rankings by default with physical SQL pushdown. Provide --category, --include-tests, --include-ignored, and --all CLI flags with clear omission notices in impact, hotspots, and search commands.

Modified packages:

- @specd/core
- @specd/code-graph
- @specd/cli

Specs affected:

- `core:config`
- `code-graph:graph-store`
- `code-graph:traversal`
- `code-graph:hotspots`
- `cli:graph-impact`
- `cli:graph-hotspots`
- `cli:graph-search`
