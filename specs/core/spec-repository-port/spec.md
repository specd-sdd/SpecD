# SpecRepository Port

## Purpose

Use cases need to read and write specs without knowing how or where they are stored on disk, so a port boundary is essential for testability and storage-strategy independence. `SpecRepository` is the application-layer port for reading and writing specs within a single workspace, extending the shared `Repository` base class with immutable `workspace()`, `ownership()`, and `isExternal()` accessors set at construction time. Use cases that need multiple workspaces receive a separate `SpecRepository` instance per workspace.

## Requirements

### Requirement: Inheritance from Repository base

`SpecRepository` MUST extend `Repository`. The `workspace()`, `ownership()`, and `isExternal()` accessors MUST reflect the values provided at construction time and MUST NOT change during the lifetime of the instance.

### Requirement: Workspace scoping

Each `SpecRepository` instance is bound to exactly one workspace. All operations (`get`, `list`, `artifact`, `save`, `delete`, `resolveFromPath`) MUST operate within the scope of that workspace. A use case requiring access to specs in multiple workspaces MUST receive multiple `SpecRepository` instances.

### Requirement: get returns a Spec or null

`get(name)` MUST accept a `SpecPath` and return the `Spec` metadata for that name within
this workspace, or `null` if no such spec exists. Artifact **content** MUST NOT be
loaded by `get`.

The returned `Spec` MUST include:

- `workspace` — workspace name bound to the repository instance
- `name` — `SpecPath` identity within the workspace
- `artifacts` — ordered list of `SpecArtifactEntry` values for schema artifacts present
  in the spec directory. Each entry MUST include:
  - `filename` — artifact basename
  - `lastModified` — contractual last-modified stamp for that file (ISO-8601 string or
    an equivalent stable string representation defined by the adapter family)
  - `size` — artifact file size in bytes observed from the same stat as `lastModified`.
    Optional on the wire for adapter families without cheap file metadata; when present
    it MUST reflect the byte length of the file at the moment of the stamp. Consumers
    MAY use it as a cheap identity pre-filter before requesting a content hash.
- `persistedStateStamp` — `{ present: boolean, lastModified: string | null }` for the
  persisted semantic lock sidecar (`present: false` and `lastModified: null` when
  absent)
- `generatedMetadataStamp` — `{ present: boolean, lastModified: string | null }` for the
  generated `metadata.json` sidecar. This stamp is **not** authored spec content; it
  exists so consumers can hard-gate caches without calling `metadata()` (which parses
  JSON and may re-hash artifacts for freshness).

`SpecArtifactEntry` MUST NOT be confused with the content-bearing `SpecArtifact` value
object returned by `artifact()`.

`Spec` MUST expose derived `filenames` and `hasArtifact(filename)` helpers computed from
`artifacts` (e.g. `artifacts[].filename`). These preserve the prior presence API; stamp
metadata remains on `SpecArtifactEntry` entries only.

`get` MUST NOT return content hashes, `persistedStateHash`, or `specFingerprint`.

### Requirement: list returns spec metadata with optional prefix filter

`list(prefix?, options?)` MUST return `ListResult<SpecListEntry>` for specs in this workspace.

When a `SpecPath` prefix is provided, only specs whose capability path starts with that prefix MUST be included (e.g. prefix `auth` returns `auth/login`, `auth/oauth`, etc.).

`SpecListOptions` extends `ListOptions` with:

- `includeSummary?: boolean` — when `true`, projected entries MAY include `summary`; when `false` or omitted, `summary` MUST NOT appear
- `includeMeta?: boolean` — when `true`, projected entries MUST include cheap lastModified Meta fields for present schema artifacts and for the persisted-state / generated-metadata observations; when `false` or omitted, those Meta fields MUST NOT appear. `list` MUST NEVER populate `hash` on any Meta field.

Sort order MUST be canonical: capability path ascending (lexicographic).

Pagination semantics MUST follow [`core:repository-port`](../repository-port/spec.md): no default `limit`; when `limit` is omitted the full matching set is returned and `meta.limit` equals `meta.total`.

`list()` MUST NOT return lightweight `Spec` metadata alone. Each item MUST be a port-level `SpecListEntry` with resolved `title` and optional projected fields.

`meta.total` and `count()` MUST read from the same index source.

### Requirement: SpecListEntry port shape

`SpecListEntry` is a port-level contract. Each entry MUST include these **required** fields:

- `workspace` (string) — workspace name bound to the repository instance
- `path` (string) — capability path with `/` separators
- `title` (string) — resolved when indexing in this fixed order (first hit wins):
  1. non-empty trimmed `title` from spec metadata when present and valid
  2. else the last segment of `path`

When `includeSummary` is set, the entry MAY include `summary` resolved in this fixed order (first hit wins; omit the field if none):

1. non-empty trimmed `optimizedDescription` from spec metadata
2. non-empty trimmed `description` from spec metadata
3. extract from `spec.md` via the existing core pure helper: (a) first non-empty paragraph after `# H1`; (b) first paragraph of first `## Overview` / `## Summary` / `## Purpose` section

When `includeMeta` is set, the entry MUST include:

- `artifacts` — array of `{ filename, lastModified }` for present schema artifact files only (not sidecars); MUST NOT include `hash`
- `persistedStateMeta` — `PersistedStateMeta | null` where `null` means the persisted-state observation is absent; MUST NOT include `hash`
- `generatedMetadataMeta` — `GeneratedMetadataMeta | null` where `null` means the generated metadata cache observation is absent; MUST NOT include `hash`

When `includeMeta` is false or omitted, `artifacts`, `persistedStateMeta`, and `generatedMetadataMeta` MUST be omitted (not present as `undefined`/`null` fields).

Errors while resolving title, summary, or Meta fields for an individual spec MUST be swallowed; the entry still appears with the title fallback.

`include*` flags are response projection only. The filesystem index MUST materialize the full CLI-usable payload (including Meta stamps from existing index source stamps); implementations MUST NOT perform extra I/O when a flag is set.

### Requirement: artifact loads a single artifact file

`artifact(spec, filename)` MUST load the content of the specified artifact file within the spec directory. It MUST return a `SpecArtifact` with the file content, or `null` if the file does not exist. When loaded from storage, the `SpecArtifact`'s `originalHash` MUST be set to enable conflict detection on subsequent saves.

### Requirement: Spec artifact access is limited to expected artifact files

`artifact(spec, filename)` and `save(spec, artifact, options?)` MUST operate only on
artifact filenames that are valid for that spec under the active schema.

Adapter-owned metadata sidecars are outside that generic artifact surface. In particular:

- `spec-lock.json` MUST NOT appear in `Spec.artifacts`
- `spec-lock.json` MUST NOT be readable or writable through `artifact()` / `save()`
- sidecar persistence MUST instead flow through the repository's semantic persisted-state
  operations

The repository MUST NOT treat the spec directory as a general-purpose file container for
arbitrary extra filenames when serving the normal artifact API.

### Requirement: Spec artifact path confinement

`artifact(spec, filename)` and `save(spec, artifact, options?)` MUST enforce strict confinement to the target spec directory.

The repository MUST reject any filename that would escape the spec directory or address a non-artifact path outside the permitted artifact set.

### Requirement: Spec artifact resolution debug logging

Implementations SHOULD emit debug-level logs when resolving expected spec artifact files, rejecting unsupported filenames, or rejecting a path-confinement violation.

These logs MUST follow the project's global logging conventions.

### Requirement: save persists a single artifact with conflict detection

`save(spec, artifact, options?)` MUST first check `this.ownership()`. If the ownership is `readOnly`, the method MUST throw `ReadOnlyWorkspaceError` with a message indicating the spec ID and workspace name. This check MUST occur before any filesystem operation or conflict detection.

If the ownership is `owned` or `shared`, `save` proceeds normally: it MUST write a single artifact file within the spec directory. If the spec directory does not exist, it MUST be created. If `artifact.originalHash` is set and does not match the current file hash on disk, the save MUST be rejected by throwing `ArtifactConflictError` to prevent silently overwriting concurrent modifications. When `options.force` is `true`, the conflict check MUST be skipped and the file MUST be overwritten unconditionally.

### Requirement: delete removes the entire spec directory

`delete(spec)` MUST remove the entire spec directory and all its artifact files.

### Requirement: resolveFromPath resolves storage paths to spec identity

`resolveFromPath(inputPath, from?)` MUST resolve a storage path to a spec identity within this workspace. The method MUST support both absolute paths and relative spec links. When `inputPath` is relative (e.g. `../storage/spec.md`), `from` MUST be provided as the reference spec. The method MUST return one of three results:

- `{ specPath, specId }` — the path resolved to a spec within this workspace
- `{ crossWorkspaceHint }` — the relative path escaped this workspace; the caller SHOULD try other repositories with the hint segments
- `null` — the input is not a valid spec link

Relative resolution MUST be pure computation (no I/O). Absolute resolution MAY require filesystem access.

### Requirement: readMetadataSnapshot and writeMetadataSnapshot

`SpecRepository` MUST expose storage-only metadata persistence through:

1. `readMetadataSnapshot(spec)` — returns a `MetadataSnapshot` discriminated by
   `kind`: `present`, `missing`, and `invalid` are persistence/parse kinds only — they
   are NOT freshness states. The repository MUST NOT return, infer, or encode
   `fresh` or `stale` here; it does not own the generator inputs or policy
   needed to make that determination.
   - `{ kind: 'missing', revision: null }` when no metadata is persisted for the
     spec
   - `{ kind: 'invalid', revision: string, error: SpecMetadataParseError }` when
     persisted content exists but fails to parse
   - `{ kind: 'present', metadata: SpecMetadata, revision: string }` when
     persisted content exists and parses successfully
2. `writeMetadataSnapshot(spec, metadata, options)` — writes one complete
   `SpecMetadata` projection, guarded by `options.expectedRevision`.
   `expectedRevision: null` means the caller observed metadata as absent and
   intends to create it; a present value means the caller intends to replace
   exactly that previously observed revision. This method MUST NOT patch or
   merge individual fields — every write is a complete replacement. It returns
   the newly persisted `MetadataSnapshot`.

`revision` is an adapter-defined concurrency token, deliberately distinct from
`originalHash`, so that an adapter is not required to version a metadata record
through raw file bytes. A filesystem adapter MAY serialize stable canonical JSON
and use the resulting raw-byte SHA-256 as `revision`; a database adapter MAY use
a row version, transaction revision, or ETag. Serialization is therefore an
adapter concern — this port accepts a `SpecMetadata` value, never a
pre-serialized JSON string.

`readMetadataSnapshot()` and `writeMetadataSnapshot()` replace the former
`metadata()` and `saveMetadata()` methods. The repository MUST NOT generate
metadata, classify its freshness, or decide whether a stale-looking snapshot
should be regenerated — those are application-layer responsibilities.
`readMetadataSnapshot()` is reserved for materialization and diagnostics that
intentionally inspect persisted cache state; normal consumers obtain usable
metadata through Core materialization instead of calling this method directly.

### Requirement: Aggregate persisted state, Meta observations, and specFingerprint

`SpecRepository` MUST NOT expose raw sidecar filesystem shapes (like
`SpecLockData`) to use cases. Instead, it MUST provide one aggregate semantic
operation for reading persisted spec state and one conditional semantic
operation for writing it, plus a family of cheap physical `*Meta` observations:

1. `readPersistedState(spec)` — returns the complete `PersistedSpecStateSnapshot`
   for the spec, or `null` when no persisted state exists. The snapshot includes
   `schema`, `dependsOn`, `implementation`, an optional `optimizations` block,
   and the sidecar's `originalHash`.
2. `writePersistedState(spec, state, options)` — conditionally replaces the
   complete persisted state with `state: PersistedSpecState` in one atomic
   operation, guarded by `options.expectedRevision`. `expectedRevision: null`
   means the caller observed persisted state as absent and intends to create it;
   a present `expectedRevision` means the caller intends to replace exactly that
   previously observed snapshot. Absence MUST be compared as its own state, not
   as the hash of an empty document. A mismatch MUST reject with the
   repository's conflict error rather than silently rebasing the write. The
   method returns the newly persisted `PersistedSpecStateSnapshot`.
3. `persistedStateMeta(spec, options?)` — returns `PersistedStateMeta | null`
   for the persisted semantic state sidecar. `PersistedStateMeta` MUST include
   `lastModified` and MAY include `hash` only when `options.includeHash === true`.
   Absence of the sidecar MUST return `null`. There MUST NOT be a separate
   `persistedStateHash(spec)` method on this port; callers that need the hash
   MUST use `persistedStateMeta(spec, { includeHash: true })?.hash ?? null`.
   (The provenance **field** named `persistedStateHash` inside generated
   metadata is unrelated and MAY remain.)
4. `generatedMetadataMeta(spec, options?)` — returns `GeneratedMetadataMeta | null`
   for the generated metadata cache observation (not the snapshot body). Same
   `lastModified` / optional `hash` rules as `PersistedStateMeta`.
5. `specFingerprint(spec)` — returns a stable digest of the authored/persisted
   Spec inputs. The canonical payload MUST be sorted-key JSON of: Construction
   rules:
   1. Presence set MUST be the current `Spec.artifacts` entries (present schema
      artifacts only — not a derived `filenames` list and not schema-wide
      missing slots).
   2. For each entry, `contentHash` MUST be the content hash of that artifact's
      bytes.
   3. `artifacts` MUST be sorted by `filename` ascending before serialization.
   4. The fingerprint payload's `persistedStateHash` field MUST be
      `persistedStateMeta(spec, { includeHash: true })?.hash`, or the literal
      `"__absent__"` when that API returns `null`.
   5. `specFingerprint` MUST be the content hash of that canonical JSON string.
6. `artifactMeta(spec, filename, options?)` — returns `ArtifactMeta | null`
   describing the current physical state of one schema-declared artifact,
   without loading or returning its content. `ArtifactMeta` MUST include
   `lastModified` and `size` (byte length from the same stat observation);
   it MAY include `hash` only when `options.includeHash === true`. The `size`
   field lets cache consumers run a cheap size/mtime identity pre-filter
   before paying for a content hash. It MUST reuse the same artifact stat/hash
   path used to populate `SpecArtifactEntry.lastModified` and artifact content
   hashes elsewhere on this port — it is not a second hashing implementation. A
   database-backed adapter MAY answer from stored columns without reading
   artifact content.

Generated `metadata.json` MUST NOT be an input to `specFingerprint`.

`readPersistedState` and `writePersistedState` are the only application-facing
API for persisted sidecar state at the repository boundary. Callers MUST NOT
depend on sidecar filenames, spec-directory scans, field-wise persisted
read/write methods, or invent validate-cache stamp helpers on this port to
discover or mutate persisted semantics.

### Requirement: search returns specs matching a text query

`search(query, options?)` MUST accept a text query string and return an array of `SpecSearchResult` objects for specs within this workspace whose content matches the query. The search MUST cover spec artifact content (at minimum `spec.md` and `verify.md`).

`SpecSearchResult` MUST contain:

- `spec` — the `Spec` metadata object (same type as returned by `get()`)
- `score` — a relevance score (number, higher is more relevant)
- `matches` — an array of `SpecSearchMatch` objects, each containing:
  - `filename` — the artifact filename where the match was found (e.g. `"spec.md"`)
  - `line` — the 1-based line number of the best match within that file
  - `snippet` — a short text excerpt around the match (max 120 characters)

The `options` parameter MAY include:

- `limit` — maximum number of results to return (default: implementation-defined)

Results MUST be sorted by `score` descending. The implementation MAY use case-insensitive matching. When no specs match, an empty array MUST be returned (not an error).

This method is the port-level search primitive — it performs a content scan within a single workspace. Cross-workspace orchestration is handled by a use case.

### Requirement: Abstract class with abstract methods

`SpecRepository` MUST be defined as an `abstract class`, not an `interface`. All
storage operations (`get`, `list`, `count`, `reindex`, `artifact`, `save`,
`delete`, `resolveFromPath`, `readMetadataSnapshot`, `writeMetadataSnapshot`,
`readPersistedState`, `writePersistedState`, `artifactMeta`,
`persistedStateMeta`, `generatedMetadataMeta`, `specFingerprint`, `search`)
MUST be declared as `abstract` methods. This follows the architecture spec
requirement that ports with shared construction are abstract classes. There
MUST NOT be a `persistedStateHash` abstract method.

### Requirement: Spec counting

The repository MUST provide a `count()` method that returns the total number of specs in this workspace. The value MUST match `list().meta.total` and MUST be served from the same index source. `count()` MUST NOT load metadata for every spec via repeated `list()` materialization.

### Requirement: Spec list reindex

`SpecRepository` MUST expose `reindex()` which forces a full rebuild of the workspace spec list index under `{configPath}/tmp/fs-cache/specs/<workspace>/`. Implementations MUST NOT require callers to know JSONL layout.

### Requirement: Filesystem-backed specs capability

A `SpecRepository` implementation whose source of truth lives on a local or mounted filesystem MUST expose its canonical `specsPath` as an absolute path.

This capability exists so application services and graph indexers can reason about the physical root that owns the repository's spec directories without depending on adapter-specific sidecar layout.

Repositories that are not backed by a directly addressable filesystem MUST NOT be required to expose `specsPath`.

When `specsPath` is exposed:

- it MUST identify the repository root that contains the workspace's spec directories
- it MUST remain stable for the lifetime of the repository instance
- it MUST be safe for consumers to compare against `projectRoot`, workspace `codeRoot`, and other filesystem-backed repository roots when computing discovery exclusions
- exposing `specsPath` MUST NOT require callers to know or depend on sidecar filenames such as `spec-lock.json`

## Constraints

- Each instance is bound to a single workspace; workspace is immutable after
  construction
- `get` returns lightweight `Spec` metadata including `SpecArtifactEntry`
  lastModified stamps, `persistedStateStamp`, and `generatedMetadataStamp` —
  artifact **content** is never loaded by `get`
- `list` returns `ListResult<SpecListEntry>` rows with host-controlled
  pagination (no default `limit`); artifact content is never loaded by `list`
- `search` loads artifact content as needed to perform matching — it is more
  expensive than `list`
- `save` creates the spec directory if it does not already exist
- `ArtifactConflictError` is the sole error type for concurrent modification
  detection on `save` and conflicting `writePersistedState`/
  `writeMetadataSnapshot` calls
- `resolveFromPath` with a relative path and no `from` parameter is invalid and
  the implementation MUST handle this as an error or return `null`
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as
  read from disk
- `readMetadataSnapshot` and `writeMetadataSnapshot` operate on a storage
  location determined by the adapter — callers MUST NOT assume metadata lives
  alongside spec content
- `readMetadataSnapshot` returns parsed content plus an adapter-defined
  `revision`; `artifact` returns raw content — they are not interchangeable
- `generatedMetadataStamp` on `Spec` is a lastModified/presence stamp only — it
  is not the parsed metadata document
- `save` and `writePersistedState` MUST throw `ReadOnlyWorkspaceError` before
  any I/O when ownership is `readOnly`; a `readOnly` workspace still forbids
  canonical artifact and persisted-state mutation
- `writeMetadataSnapshot` is NOT subject to the `readOnly` ownership guard: a
  `readOnly` source workspace MAY still persist its generated metadata cache,
  because canonical source ownership and disposable cache ownership are
  distinct concerns
- Read operations (`get`, `list`, `count`, `artifact`, `readMetadataSnapshot`,
  `readPersistedState`, `artifactMeta`, `persistedStateMeta`,
  `generatedMetadataMeta`, `resolveFromPath`, `search`, `specFingerprint`) are
  not affected by ownership — readOnly workspaces can always be read
- Use cases MUST interact with specs through semantic repository operations
  only.
- Sidecar files (like `spec-lock.json`) are an implementation detail of the
  repository adapter and MUST NOT be accessed directly by application logic.
- `persistedStateMeta({ includeHash: true })?.hash` MUST be stable and
  deterministic across multiple calls for the same persisted semantic state.
- `specFingerprint()` MUST be stable and deterministic across multiple calls for
  the same artifact contents and persisted semantic state.
- `specsPath` is a repository capability for filesystem-backed adapters only;
  consumers MUST NOT assume it exists for every `SpecRepository`
- This port MUST NOT grow validate-cache-specific helpers such as
  `validationSourceStamps` or `readValidationSidecar`
- The repository MUST NOT classify metadata freshness (`fresh`/`stale`) or
  generate metadata content — those are application-layer responsibilities of
  Core materialization
- `list({ includeMeta: true })` MUST NEVER compute or return content hashes;
  hash remains opt-in on the point Meta methods only

## Spec Dependencies

- [`core:repository-port`](../repository-port/spec.md) — shared abstract-port conventions and list pagination types
- [`default:_global/architecture`](../../../_global/architecture/spec.md) — port and adapter boundary rules
- [`core:change`](../change/spec.md) — change identity and archived implementation semantics
- [`core:storage`](../storage/spec.md) — repository rooting and filesystem ownership
- [`core:workspace`](../workspace/spec.md) — workspace identity and ownership semantics
- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec identity parsing
- [`core:spec-metadata`](../spec-metadata/spec.md) — metadata interactions exposed through the repository and title/summary resolution
- [`core:content-extraction`](../content-extraction/spec.md) — summary extraction helper used when indexing entries
- [`core:search-specs`](../search-specs/spec.md) — repository-backed search semantics
- [`default:_global/logging`](../../../_global/logging/spec.md) — logging expectations for adapters
- [`core:spec-lock`](../spec-lock/spec.md) — persisted spec state and sidecar semantics hidden behind repository methods
