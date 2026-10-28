---
    "@specd/core": minor
    "@specd/sdk": minor
    "@specd/cli": minor
---

20261028 - host-lifecycle-dispose: Adds an idempotent dispose() and AsyncDisposable support (await using) to the Kernel and SdkHostContext, with named disposers, ordered and isolated teardown and a 5 s per-disposer timeout. The CLI now releases every host it opens through a cleanup registry on all exit paths and on SIGINT/SIGTERM (exit codes 130/143), with a 1 s/5 s exit grace period for leaked handles, and declares Node >=22 as the supported floor. This is the base lifecycle for upcoming runtime plugins.

Specs affected:

- `core:kernel`
- `sdk:host-context`
- `cli:host-context`
- `core:kernel-builder`
- `cli:entrypoint`
- `default:_global/conventions`
