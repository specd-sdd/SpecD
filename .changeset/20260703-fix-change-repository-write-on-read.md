---
'@specd/core': patch
---

20260703 - fix-change-repository-write-on-read: This change decouples manifest write operations from change repository read paths, preventing side effects during ordinary reads (e.g. status commands). When drift or sync updates are detected during a read by an initialized repository, the invalidation is safely written under a process-level change lock. Uninitialized repositories bypass drift checking and status derivation entirely, preventing disk writes and state corruption.

Specs affected:

- `core:storage`
- `core:change-repository-port`
