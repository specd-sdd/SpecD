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

### Requirement: FsSpecIndexCache helper

`FsSpecRepository` MUST delegate `list`, `count`, `reindex`, and cache invalidation to an `FsSpecIndexCache` instance under `{configPath}/tmp/fs-cache/specs/<workspace>/`.

The repository MUST NOT read or write `.specd-index.jsonl` or `.specd-index-meta.json` directly.

Canonical sort: capability path lexicographic ascending.

The helper uses the same `mutate`/lock, atomic publish, and freshness rules as change index helpers, with `sourceFiles` (per-file mtimes) instead of `sourceMtime`.

### Requirement: SpecListEntry materialization in index

When building or refreshing index rows, `FsSpecIndexCache` MUST materialize the full CLI-usable `SpecListEntry` payload:

- **Always:** `workspace`, `path`, `title` — title resolution order: (1) non-empty trimmed metadata `title`; (2) last segment of `path`.
- **Stored for projection:** `summary` and `metadataStatus` using the same resolution rules as [`core:spec-repository-port`](../spec-repository-port/spec.md) / [`core:list-specs`](../list-specs/spec.md).

Errors while resolving title, summary, or status for an individual spec MUST be swallowed; the entry still appears with title fallback.

Port `includeSummary` / `includeMetadataStatus` flags MUST project cached fields only — no extra file reads at list time.

Spec create/delete/publish and content/metadata/lock changes that affect cached fields MUST refresh via upsert or bucket invalidation according to helper rules.

## Constraints

- `FsSpecRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `SpecRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout and index wire shapes
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `SpecListEntry` and list/count/reindex port contract
