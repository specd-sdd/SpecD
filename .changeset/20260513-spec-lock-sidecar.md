---
'@specd/core': patch
---

20260513 - spec-lock-sidecar: Add durable spec-lock sidecars for archived specs so schema identity and dependsOn persist independently of metadata extraction. Seed persisted dependencies when specs enter a change, validate sidecar consistency before publication, and publish spec artifacts plus spec-lock atomically per spec while keeping metadata.json as a derived read model.

Specs affected:

- `core:archive-change`
- `core:spec-metadata`
- `core:save-spec-metadata`
- `core:validate-artifacts`
- `core:change-manifest`
- `core:edit-change`
- `core:create-change`
- `core:spec-repository-port`
