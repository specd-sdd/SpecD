---
'@specd/core': patch
---

20260419 - refactor-async-spec-reference-resolution: This change refactors spec-reference normalization so metadata extraction can use repository-backed resolution asynchronously without coupling to filesystem-specific path math. It updates the extraction pipeline to await transform callbacks end-to-end and injects a shared cross-workspace resolver runtime that normalizes escaped references like ../../\_global/architecture/spec.md to default:\_global/architecture. The same awaited resolver path is applied consistently across GenerateSpecMetadata and metadata-fallback flows used by compile-context, project-context, and artifact validation.

Specs affected:

- `core:core/content-extraction`
- `core:core/generate-metadata`
- `core:core/spec-repository-port`
