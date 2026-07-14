---
    "@specd/core": patch
    "@specd/cli": patch
    "@specd/api": patch
    "@specd/studio-desktop": patch
    "@specd/code-graph-electron": patch
    "@specd/client": patch
---

20260714 - align-user-interface-with-main-conventions: Merged the post-2026-07-03 mainline composition, config-loading, VCS, and host-bootstrap conventions into feat/user-interface while preserving the branch-only API, desktop, client, artifact, validation, and log-readback capabilities. The branch now uses the canonical resolver-backed core composition, SDK host bootstrap for API and desktop, and a single shared project-status mapper in @specd/client so HTTP and IPC expose the same DTO contract.

Specs affected:

- `core:composition`
- `core:kernel`
- `core:config`
- `core:config-loader`
- `core:get-project-context`
- `core:get-spec-context`
- `core:validate-specs`
- `sdk:composition`
- `core:get-change-artifact`
- `core:get-read-only-change-artifact`
- `core:outline-change-artifact`
- `core:read-log`
- `core:save-change-artifact`
- `core:validate-change-batch`
- `cli:entrypoint`
- `api:composition-create-api-server`
- `api:routes-project-logs`
- `studio-desktop:ipc-handler-registry`
- `studio-desktop:main-kernel-lifecycle`
- `code-graph-electron:composition`
- `client:dto-project-status`
- `api:dto-project-status`
- `api:presenter-project`
- `api:handler-project`
- `sdk:host-context`
