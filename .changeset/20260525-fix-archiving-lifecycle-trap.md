---
'@specd/core': patch
---

20260525 - fix-archiving-lifecycle-trap: Defer archivable→archiving until preflight passes; add escape transitions from archiving to archivable and designing.

Specs affected:

- `core:change`
- `core:archive-change`
- `core:lifecycle-engine`
- `core:transition-change`
