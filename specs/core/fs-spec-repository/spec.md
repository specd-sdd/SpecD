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

When building or refreshing index rows, `FsSpecIndexCache` MUST materialize the
full CLI-usable `SpecListEntry` payload:

- **Always:** `workspace`, `path`, `title` — title resolution order: (1) non-empty
  trimmed metadata `title`; (2) last segment of `path`.
- **Stored for projection:** `summary` using the same resolution rules as
  [`core:spec-repository-port`](../spec-repository-port/spec.md) /
  [`core:list-specs`](../list-specs/spec.md).
- **Stored for Meta projection:** lastModified stamps for present schema
  artifacts and for the persisted-state / generated-metadata observations,
  derived from the existing index `sourceFiles` freshness stamps. The adapter
  MUST NOT enrich the index wire format solely for Meta — project existing
  `sourceFiles` into public Meta shapes.

When inspecting whether `spec.md` exists for summary fallback, implementations
MUST use `Spec.artifacts` (presence of an entry whose `filename` is `spec.md`).

Errors while resolving title, summary, or Meta fields for an individual spec
MUST be swallowed; the entry still appears with title fallback.

Port `includeSummary` / `includeMeta` flags MUST project cached fields only —
no extra file reads at list time. `includeMeta` MUST NEVER populate `hash` on
any Meta field. `includeMetadataStatus` MUST NOT exist.

Spec create/delete/publish and content/metadata/lock changes that affect cached
fields MUST refresh via upsert or bucket invalidation according to helper rules.

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
responsibility of `artifact()`, `readMetadataSnapshot()`,
`persistedStateMeta(..., { includeHash: true })`, and `specFingerprint()`.

### Requirement: Aggregate persisted-state operations and canonical lock serialization

`FsSpecRepository` MUST implement `readPersistedState(spec)` and
`writePersistedState(spec, state, options)` against `spec-lock.json` using one
canonical serializer/writer shared internally with staged `publish()`.

The canonical serializer/writer MUST:

- validate that `state` is a complete `PersistedSpecState` before serializing
- emit stable, deterministic JSON
- write through the existing atomic file writer used elsewhere in this adapter
- compute the resulting `originalHash` / `persistedStateHash` from the exact
  serialized bytes it wrote

`FsSpecRepository` MUST NOT choose schema identity, extract dependencies, apply
patches, or invent default values while serializing; it persists exactly the
complete state it is given. In particular, it MUST NOT construct or emit the
legacy fallback `{ schema: { name: 'unknown', version: 0 } }` for a spec with no
lock — a lock-less spec MUST be represented as `readPersistedState` returning
`null`, never as a lock containing placeholder schema values.

`writePersistedState` MUST enforce `options.expectedRevision`: `null` requires
that no `spec-lock.json` currently exists for the spec, and a present value must
match the current sidecar's hash, or the write MUST fail with the repository's
conflict error. On success it returns the newly persisted
`PersistedSpecStateSnapshot`.

`readPersistedState` and `writePersistedState` MUST throw
`ReadOnlyWorkspaceError` before any I/O when `ownership()` is `readOnly`,
consistent with `save()`.

### Requirement: Metadata snapshot persistence

`FsSpecRepository` MUST implement `readMetadataSnapshot(spec)` and
`writeMetadataSnapshot(spec, metadata, options)` against the configured
metadata file location.

`readMetadataSnapshot` MUST return `{ kind: 'missing', revision: null }` when
the file does not exist, `{ kind: 'invalid', revision, error }` when the file
exists but fails to parse, or `{ kind: 'present', metadata, revision }` when it
parses successfully. `FsSpecRepository` MUST NOT compute or return freshness
here.

`FsSpecRepository` MAY use the raw-byte SHA-256 of the serialized metadata JSON
as `revision`. `writeMetadataSnapshot` MUST enforce `options.expectedRevision`
the same way `writePersistedState` enforces its own: `null` requires current
absence, a present value must match the current file's revision, and a mismatch
MUST fail with the repository's conflict error.

Unlike `save()` and `writePersistedState()`, `writeMetadataSnapshot()` MUST NOT
apply the authored-source ownership guard: it MUST NOT throw
`ReadOnlyWorkspaceError` when `ownership()` is `readOnly`. A `readOnly` source
workspace may still persist its generated metadata cache because canonical
source ownership and disposable cache ownership are distinct concerns.

`FsSpecRepository` MUST reuse the existing artifact stat/hash path for
`artifactMeta(spec, filename)` rather than implementing a second hashing
routine.

### Requirement: Meta observations and specFingerprint on FS

`FsSpecRepository` MUST implement:

- `persistedStateMeta(spec, options?)` observing the lock sidecar: `lastModified`
  from `stat`, and `hash` (SHA-256 of the exact bytes written by the canonical
  lock serializer) only when `options.includeHash === true`. Return `null` when
  the sidecar is absent. There MUST NOT be a `persistedStateHash(spec)` method.
- `generatedMetadataMeta(spec, options?)` observing the configured metadata cache
  file with the same `lastModified` / optional `hash` rules; `null` when absent.
- `artifactMeta(spec, filename, options?)` by reusing the existing artifact
  stat/hash path that populates `SpecArtifactEntry.lastModified` and artifact
  content hashes elsewhere on this adapter — it MUST NOT be a second hashing
  implementation. `hash` only when `includeHash === true`.
- `specFingerprint(spec)` per
  [`core:spec-repository-port`](../spec-repository-port/spec.md): per-artifact
  content hashes bound to filenames, ordered by filename alphabetically,
  combined with `persistedStateMeta(spec, { includeHash: true })?.hash` or an
  absent sentinel, then hashed. Generated metadata MUST NOT be included.

The repository MUST NOT own or write
`{configPath}/tmp/fs-cache/validate-specs/<workspace>/` rows; that bucket
belongs to the `ValidationResultCache` filesystem adapter.

## Constraints

- `FsSpecRepository` is infrastructure-level and lives in `infrastructure/fs/`
- It MUST implement the `SpecRepository` abstract port class

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) —
  composition and infrastructure rules
- [`core:composition`](../composition/spec.md) — public factories and storage
  factory interfaces
- [`core:storage`](../storage/spec.md) — fs-cache layout and index wire shapes
- [`core:spec-repository-port`](../spec-repository-port/spec.md) —
  `SpecListEntry`, aggregate persisted-state, and metadata-snapshot port
  contracts
- [`core:spec-lock`](../spec-lock/spec.md) — persisted state shape serialized to
  `spec-lock.json`
- [`core:spec-metadata`](../spec-metadata/spec.md) — generated metadata
  document shape persisted as a metadata snapshot
- [`core:spec-optimization`](../spec-optimization/spec.md) — optimization field
  and artifact-baseline shape included in persisted state
