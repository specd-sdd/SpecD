# core:update-spec-metadata

## Purpose

**Removed.** `UpdateSpecMetadata` merged agent-provided `optimizedDescription`/`optimizedContext` into a freshly-extracted metadata document and persisted the merged result. Persisted optimizations are now owned directly by `spec-lock.json` per-field optimization records (see [`core:spec-optimization`](../spec-optimization/spec.md)) and mutated only through `UpdatePersistedSpecOptimizations` (`specs optimizations set`/`clear`). Metadata has no external editor after this change — `UpdateSpecMetadata` MUST NOT exist as a Core public use case.

## Requirements

### Requirement: UpdateSpecMetadata is removed

`UpdateSpecMetadata` MUST NOT be exported from `@specd/core`, MUST NOT be mounted on `Kernel`, and MUST NOT have a `createUpdateSpecMetadata` composition factory. Callers that need to persist an LLM-optimized field MUST use `UpdatePersistedSpecOptimizations` instead, which writes directly to the spec's lock-owned optimization state and captures its own artifact/schema baseline.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
