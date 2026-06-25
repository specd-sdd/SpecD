---
'@specd/specd': minor
---

20260625 - 01-core-kernel-get-config: Introduces GetConfig as kernel.project.getConfig so hosts that only receive a Kernel can read a detached Readonly<SpecdConfig> snapshot without keeping a parallel config reference. The use case clones config at construction time; execute() returns a stable readonly view with no disk I/O. Adds core:get-config spec and extends core:kernel wiring; CLI migration remains a later change.

Modified packages:

- @specd/core

Specs affected:

- `core:kernel`
- `core:get-config`
