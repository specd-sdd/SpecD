---
'@specd/specd': patch
---

20260508 - harden-archive-reload-consistency: This change hardens archive execution around issue #55 in new-spec archive/reload handling, so invalid artifact shapes are rejected before permanent spec writes begin and partial archive state is avoided on failure. It also preserves tracked artifact filenames across reloads, confines filesystem access to tracked or expected artifact paths, and records explicit archive-failed history for diagnostics and recovery.

Modified packages:

- @specd/core

Specs affected:

- `core:archive-change`
- `core:change-layout`
- `core:validate-artifacts`
- `core:change-manifest`
- `core:change-repository-port`
- `core:spec-repository-port`
- `core:archive-repository-port`
- `core:storage`
- `core:change`
