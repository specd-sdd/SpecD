---
    "@specd/core": minor
    "@specd/cli": minor
---

20260623 - harden-implementation-tracking: Harden implementation tracking so removed files become a first-class persisted review state, refresh can resurrect them safely, and manual tracking commands enforce tracked-only existence rules in core. The change also aligns manifest and repository contracts, resets artifact state after writes, and makes CLI review stricter by preserving tracked-link ignores and requiring kind-aware stale-symbol fallback.

Specs affected:

- `core:refresh-implementation-tracking`
- `core:change-manifest`
- `cli:change-implementation`
- `core:change-repository-port`
- `core:archive-repository-port`
- `core:implementation-detector-port`
- `core:change`
- `core:repository-port`
