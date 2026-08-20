---
'@specd/specd': patch
---

20260820 - fix-graph-cli-context-explicit-config: Fixes graph CLI configured-mode resolution so explicit and discovered specd.yaml projects outside VCS preserve project configuration without repository validation. Bootstrap modes remain VCS-bound, and graph stats now preserves unavailable VCS health as provider output.

Modified packages:

- @specd/cli

Specs affected:

- `cli:graph-cli-context`
- `cli:graph-stats`
