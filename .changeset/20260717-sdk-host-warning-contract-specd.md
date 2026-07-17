---
'@specd/specd': patch
---

20260717 - sdk-host-warning-contract: Define a single SDK host-bootstrap contract for configuration warnings by keeping config.warnings as the canonical diagnostic surface exposed through openSpecdHost. The change aligns CLI bootstrap behavior with that contract, reinforces the behavior with SDK and CLI tests, and documents that OpenSpecdHostResult remains a thin wrapper rather than a duplicate warning model.

Modified packages:

- @specd/cli
- @specd/core

Specs affected:

- `sdk:host-context`
- `cli:host-context`
- `core:config`
