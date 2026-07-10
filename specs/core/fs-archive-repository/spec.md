# FsArchiveRepository

## Purpose

`FsArchiveRepository` is the filesystem-backed implementation of the `ArchiveRepository` port. It manages archived changes, validating configuration options strictly against its Zod schema while receiving runtime dependencies (like paths of active changes and drafts) via its `context: ArchiveRepositoryConfig` parameter.

## Requirements

### Requirement: Validate options at construction

`FsArchiveRepository` SHALL accept:

1. `context: ArchiveRepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`) and core runtime dependencies (`changesPath`, `draftsPath`).
2. `config: FsArchiveRepositoryConfig` containing filesystem configuration options (`path`, `pattern`).

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` are validated, and that no runtime dependencies or workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`
- `pattern?: string`

The constructor MUST verify that the physical directories for the archive (`path`), active changes (`context.changesPath`), and drafts (`context.draftsPath`) exist on disk. If any of these paths do not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsArchiveRepository` SHALL expose a creator function `createFsArchiveStorageFactory()` that returns an `ArchiveStorageFactory` instance.

This factory SHALL construct and return `FsArchiveRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

## Constraints

- `FsArchiveRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `ArchiveRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
