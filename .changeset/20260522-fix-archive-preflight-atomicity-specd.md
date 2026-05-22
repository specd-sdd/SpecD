---
'@specd/specd': patch
---

20260522 - fix-archive-preflight-atomicity: Archive now performs a full batch preflight before any canonical spec publication begins, so archive-time failures cannot leave earlier specs partially merged. The implementation refactors ArchiveChange into separate planning, preflight, and publication phases, updates metadata consistency checks to run before commit, and adds regressions that prove later-spec failures block all prior publication.

Modified packages:

- @specd/core

Specs affected:

- `core:archive-change`
- `core:spec-metadata`
- `core:save-spec-metadata`
