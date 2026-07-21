---
    "@specd/studio-desktop": minor
    "@specd/api": minor
---

20260721 - merge-main-adapt-ui-branch: Adapts feat/user-interface to main’s graph/SDK composition seams after merge. Introduces @specd/code-graph-sqlite-electron (sqlite-electron backend) for Electron-native SQLite graph storage, wires Studio desktop and the HTTP API to long-lived graph providers with stale reopen, and leaves @specd/code-graph-electron unused on this path.

Specs affected:

- `code-graph-sqlite-electron:sqlite-electron-store`
- `studio-desktop:main-kernel-lifecycle`
- `studio-desktop:ipc-handler-registry`
- `api:composition-create-api-server`
- `api:composition-graph-provider`
- `api:composition-create-api-context`
- `api:handler-graph`
