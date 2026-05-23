---
    "@specd/core": patch
    "@specd/cli": patch
---

20260523 - move-impl-tracking-to-cli: Refresh tracked implementation files from ImplementationDetector before lifecycle reads/transitions.

Specs affected:

- `core:get-status`
- `core:transition-change`
- `cli:change-status`
- `cli:change-transition`
- `core:refresh-implementation-tracking`
- `core:compile-context`
- `cli:change-context`
- `core:implementation-detector-port`
