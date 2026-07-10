# FsChangeRepository

## Purpose

`FsChangeRepository` is the filesystem-backed implementation of the `ChangeRepository` port. It manages active changes, drafts, and discarded changes as distinct subdirectories within local or external storage, validating configuration options strictly against its Zod schema while receiving runtime dependencies via its `context: ChangeRepositoryConfig` parameter.

## Requirements

### Requirement: Validate options at construction

`FsChangeRepository` SHALL accept:

1. `context: ChangeRepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`), core runtime callbacks (`activeSchema`, `resolveArtifactTypes`, `resolveSpecExists`), and external paths (`draftsPath`, `discardedPath`).
2. `config: FsChangeRepositoryConfig` containing filesystem configuration options (`path`) for the active changes storage.

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` for this storage are validated, and that no runtime dependencies, external paths, or workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`

The constructor MUST verify that the physical directories for active changes (`path`), drafts (`context.draftsPath`), and discarded changes (`context.discardedPath`) exist on disk. If any of these paths do not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsChangeRepository` SHALL expose a creator function `createFsChangeStorageFactory()` that returns a `ChangeStorageFactory` instance.

This factory SHALL construct and return `FsChangeRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

## Constraints

- `FsChangeRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `ChangeRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
