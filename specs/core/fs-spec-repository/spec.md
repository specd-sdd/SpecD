# FsSpecRepository

## Purpose

`FsSpecRepository` is the filesystem-backed implementation of the `SpecRepository` port. It manages specifications and their associated metadata on the filesystem, validating configuration options strictly against its Zod schema.

## Requirements

### Requirement: Validate options at construction

`FsSpecRepository` SHALL accept:

1. `context: SpecRepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`, `prefix`).
2. `config: FsSpecRepositoryConfig` containing filesystem configuration options (`path`, `metadataPath`).

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` are validated, and that no workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`
- `metadataPath: string`

The constructor MUST verify that the physical directories for specs (`path`) and metadata (`metadataPath`) exist on disk. If either does not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsSpecRepository` SHALL expose a creator function `createFsSpecStorageFactory()` that returns a `SpecStorageFactory` instance.

This factory SHALL construct and return `FsSpecRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

## Constraints

- `FsSpecRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `SpecRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
