---
'@specd/specd': patch
---

20260722 - long-lived-hosts-run-index-provider: Adapt API and Studio desktop long-lived graph hosts to index via runIndexProjectGraph({ provider }), dropping release/refresh cycles and manual IndexProjectGraph orchestration.

Modified packages:

- @specd/api
- @specd/studio-desktop

Specs affected:

- `api:handler-graph`
- `api:composition-create-api-context`
- `api:composition-graph-provider`
- `studio-desktop:ipc-handler-registry`
- `studio-desktop:main-kernel-lifecycle`
