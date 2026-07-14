# FsSchemaRepository

## Purpose

`FsSchemaRepository` is the filesystem-backed implementation of the `SchemaRepository` port. It manages schemas on the filesystem, validating configuration options strictly against its Zod schema.

## Requirements

### Requirement: Validate options at construction

`FsSchemaRepository` SHALL accept:

1. `context: RepositoryConfig` containing workspace metadata (`workspace`, `ownership`, `isExternal`, `configPath`).
2. `config: FsSchemaRepositoryConfig` containing filesystem configuration options (`path`).

It MUST validate the `config` parameter using a Zod schema to ensure that only configuration properties originating from `specd.yaml` are validated, and that no workspace context properties are included in the configuration schema.

The configuration schema MUST support:

- `path: string`

The constructor MUST verify that the physical directory for schemas (`path`) exists on disk. If it does not exist, it MUST throw a `StorageDirectoryNotFoundError`.

### Requirement: Storage factory registration

`FsSchemaRepository` SHALL expose a creator function `createFsSchemaStorageFactory()` that returns a `SchemaStorageFactory` instance.

This factory SHALL construct and return `FsSchemaRepository` instances when `create(context, config)` is called, forwarding the parameters without merging.

## Constraints

- `FsSchemaRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `SchemaRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
