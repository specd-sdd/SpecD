---
    "@specd/core": minor
    "@specd/cli": minor
---

20260715 - hook-live-progress: Add live hook progress streaming so long-running workflow hooks remain observable to both humans and agents while they execute. The change extends the core hook runner and hook progress pipeline, unifies transition and run-hooks presentation through a shared CLI presenter, and finalizes the stdout/stderr split for text versus structured hook output.

Specs affected:

- `core:hook-runner-port`
- `core:run-step-hooks`
- `cli:change-run-hooks`
- `cli:change-transition`
