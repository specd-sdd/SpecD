# Invalidate Spec Metadata

## Purpose

**Removed.** `InvalidateSpecMetadata` forced a spec's cached metadata to be treated as stale by stripping `contentHashes`. Explicit invalidation is unnecessary and insufficient now: `MaterializeSpecMetadata` compares persisted metadata provenance (artifact hashes, lock hash, schema identity, projection version, and projection fingerprint) against current source state on every read and regenerates automatically when anything has drifted. An editor, Git, another process, or a database client can change source state without passing through the current process, so a manual invalidation command could never be a complete freshness signal.

## Requirements

### Requirement: InvalidateSpecMetadata is removed

`InvalidateSpecMetadata` MUST NOT be exported from `@specd/core`, MUST NOT be mounted on `Kernel`, and MUST NOT have a public `createInvalidateSpecMetadata` composition factory. There is no supported way to force a metadata cache stale independent of its actual source state — callers that need a guaranteed rebuild MUST use `RegenerateSpecMetadata` (forced policy), which regenerates and persists a fresh projection rather than merely marking the existing one untrustworthy.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:storage`](../storage/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
