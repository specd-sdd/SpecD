# SaveSpecMetadata

## Purpose

**Removed.** `SaveSpecMetadata` validated and persisted arbitrary caller-supplied metadata JSON, including agent-authored optimized fields. Its guarded-persistence responsibility (validate a complete generated projection, then conditionally write) moves to `PersistSpecMetadata`, an internal collaborator used only by `MaterializeSpecMetadata`. Unlike `SaveSpecMetadata`, `PersistSpecMetadata` accepts only a complete generated projection plus an observed revision — it is not a general-purpose metadata-editing operation and is never exposed on Kernel, Core public exports, SDK, CLI, or MCP.

## Requirements

### Requirement: SaveSpecMetadata is removed

`SaveSpecMetadata` MUST NOT be exported from `@specd/core`, MUST NOT be mounted on `Kernel`, and MUST NOT have a public `createSaveSpecMetadata` composition factory. Arbitrary metadata persistence is no longer an application operation reachable by any host. The only remaining metadata writer is the internal `PersistSpecMetadata` collaborator invoked by `MaterializeSpecMetadata`, which accepts a complete generated projection and observed `revision` — never a caller-supplied partial or arbitrary JSON payload.

## Spec Dependencies

- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`default:_global/architecture`](../../_global/architecture/spec.md)
- [`core:composition-resolver`](../composition-resolver/spec.md)
