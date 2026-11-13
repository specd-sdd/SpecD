---
'@specd/specd': minor
---

20261009 - core-validate-change-batch: Extract batch change validation orchestration into canonical @specd/core use case ValidateChangeBatch with existence and schema guards, topological DAG execution, and CLI delegation.

Modified packages:

- @specd/core
- @specd/cli

Specs affected:

- `core:validate-change-batch`
- `cli:change-validate`
