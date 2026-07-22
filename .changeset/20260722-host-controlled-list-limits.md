---
    "@specd/core": minor
    "@specd/cli": patch
---

20260722 - host-controlled-list-limits: Remove default list limit from repository ports; CLI defaults limit to 100 for change buckets only, spec list remains unlimited for agents.

Specs affected:

- `core:repository-port`
- `core:list-specs`
- `core:spec-repository-port`
- `core:change-repository-port`
- `core:archive-repository-port`
- `cli:spec-list`
- `cli:change-list`
- `cli:drafts-list`
- `cli:archive-list`
- `cli:discarded-list`
