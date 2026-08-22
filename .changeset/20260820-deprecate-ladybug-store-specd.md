---
'@specd/specd': major
---

20260820 - deprecate-ladybug-store: Extracts the Ladybug graph-store implementation and its ownership to the independent specd-plugin-graphstore-ladybug project, leaving @specd/code-graph with SQLite as its sole built-in backend. The change preserves the additive graph-store factory seam for future plugins and aligns Code Graph CLI commands with the SDK-managed provider lifecycle.

Modified packages:

- @specd/code-graph
- @specd/cli

Specs affected:

- `code-graph:ladybug-graph-store`
- `code-graph:composition`
- `cli:graph-cli-context`
- `cli:graph-stats`
- `cli:graph-impact`
- `cli:graph-hotspots`
- `cli:graph-search`
- `code-graph:sqlite-graph-store`
