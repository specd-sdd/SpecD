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

The helper uses the same `mutate`/lock, atomic publish, and freshness rules as change index helpers — invalidation flag, then per-file mtime comparison via `sourceFiles` — with no max-age TTL. Freshness MUST NOT depend on `generatedAt` age alone.

### Requirement: SpecListEntry materialization in index

When building or refreshing index rows, `FsSpecIndexCache` MUST materialize the full
CLI-usable `SpecListEntry` payload:

- **Always:** `workspace`, `path`, `title` — title resolution order: (1) non-empty
  trimmed metadata `title`; (2) last segment of `path`.
- **Stored for projection:** `summary` and `metadataStatus` using the same resolution
  rules as [`core:spec-repository-port`](../spec-repository-port/spec.md) /
  [`core:list-specs`](../list-specs/spec.md).

When inspecting whether `spec.md` exists for summary fallback, implementations MUST
use `Spec.artifacts` (presence of an entry whose `filename` is `spec.md`).

Errors while resolving title, summary, or status for an individual spec MUST be
swallowed; the entry still appears with title fallback.

Port `includeSummary` / `includeMetadataStatus` flags MUST project cached fields only —
no extra file reads at list time.

Spec create/delete/publish and content/metadata/lock changes that affect cached fields
MUST refresh via upsert or bucket invalidation according to helper rules.

### Requirement: Spec stamp population on get

`FsSpecRepository.get()` MUST populate the contractual `Spec` stamp fields using
filesystem metadata without reading artifact contents:

- For each allowed schema artifact file present in the spec directory, emit a
  `SpecArtifactEntry` with `filename` and `lastModified` from `stat` (ISO-8601 from
  `mtime`, consistent within the FS adapter family).
- Set `persistedStateStamp` from the lock sidecar path: `present` / `lastModified` via
  `stat`, or `present: false` and `lastModified: null` when absent.
- Set `generatedMetadataStamp` from the configured metadata file path the same way.

`get` MUST NOT read file contents to build these stamps. Content reads remain the
responsibility of `artifact()`, `metadata()`, `persistedStateHash()`, and
`specFingerprint()`.

### Requirement: persistedStateHash and specFingerprint on FS

`FsSpecRepository` MUST implement:

- `persistedStateHash(spec)` as the SHA-256 of the raw lock sidecar bytes, or `null`
  when the sidecar is absent (formerly exposed as `specHash`).
- `specFingerprint(spec)` per
  [`core:spec-repository-port`](../spec-repository-port/spec.md): per-artifact content
  hashes bound to filenames, ordered by filename alphabetically, combined with
  `persistedStateHash` or an absent sentinel, then hashed. Generated metadata MUST NOT
  be included.

The repository MUST NOT own or write
`{configPath}/tmp/fs-cache/validate-specs/<workspace>/` rows; that bucket belongs to
the `ValidationResultCache` filesystem adapter.

## Constraints

- `FsSpecRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `SpecRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout and index wire shapes
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `SpecListEntry` and list/count/reindex port contract
