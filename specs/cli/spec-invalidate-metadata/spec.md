# Spec Invalidate-Metadata

## Purpose

**Removed.** The `specd spec invalidate-metadata` command forced a spec's metadata stale by stripping `contentHashes`, delegating to the (now removed) `InvalidateSpecMetadata` use case. `MaterializeSpecMetadata` now compares persisted provenance against current source state on every read and regenerates automatically, so there is no supported way — nor any need — to manually mark a cache stale. A guaranteed rebuild is available through `specd spec generate-metadata`, which forces regeneration via `RegenerateSpecMetadata`.

## Requirements

### Requirement: spec invalidate-metadata is removed

The CLI MUST NOT register an `invalidate-metadata` command, or any alias of it, on the `spec` parent command. Callers that need a guaranteed rebuild MUST use `specd spec generate-metadata` instead.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — adapter packages contain no business logic
- [`default:_global/conventions`](../../_global/conventions/spec.md) — error types, named exports
