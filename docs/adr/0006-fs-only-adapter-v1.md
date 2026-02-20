# ADR-0006: Filesystem-Only Storage Adapter in v1

## Status

Accepted

## Context

The storage ports (`SpecRepository`, `ChangeRepository`, `ArchiveRepository`, `SchemaRegistry`) are designed to support multiple adapter implementations. Future adapters could target databases, remote APIs, or object storage. However, implementing multiple adapters before the domain and CLI are stable risks building adapters against an unstable interface.

## Decision

Ship only the `fs` (filesystem) adapter in v1. All four storage ports are implemented with `FsSpecRepository`, `FsChangeRepository`, `FsArchiveRepository`, and `FsSchemaRegistry`. The adapter lives in `@specd/core/infrastructure/fs/`. Future adapters (database, remote) will be introduced in later versions, potentially as separate packages or as an enterprise offering.

## Consequences

- v1 is simpler to implement and test
- The port interfaces are validated against one real implementation before being considered stable
- Teams requiring shared or remote storage must wait for a future release
- The `allowExternalPaths` guardrail in the fs adapter mitigates the main risk of filesystem-based storage (paths outside the project root)

## Spec

- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
