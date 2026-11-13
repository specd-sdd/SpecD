---
'@specd/guide': patch
---

20261103 - cross-platform-guide-bundler: Fix Windows CI failures in @specd/guide by normalizing TypeDoc entrypoints and all guide topic/source paths to POSIX. Add separator-independent workspace membership checks so API topic generation works on Windows and macOS/Linux alike. Update guide:bundle-guides with the cross-platform requirements and verification scenarios.

Specs affected:

- `guide:bundle-guides`
