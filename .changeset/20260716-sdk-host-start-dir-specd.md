---
'@specd/specd': patch
---

20260716 - sdk-host-start-dir: Expose explicit start-directory bootstrap through openSpecdHost so SDK hosts can discover projects from a chosen root without mutating process.cwd() or forcing a specd.yaml path. The SDK contract now distinguishes configPath from startDir, rejects mixed bootstrap inputs up front, and keeps existing configPath and default-cwd behavior intact. The change also aligns tests and public docs with the new host bootstrap semantics.

Modified packages:

- @specd/core

Specs affected:

- `sdk:host-context`
- `core:config-loader`
- `core:config`
