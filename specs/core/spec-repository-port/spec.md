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
- `includeMetadataStatus?: boolean` — when `true`, projected entries MAY include `metadataStatus`; when `false` or omitted, `metadataStatus` MUST NOT appear

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

When `includeMetadataStatus` is set, the entry MAY include `metadataStatus`: `'missing' | 'invalid' | 'stale' | 'fresh'` with these semantics:

- `'missing'` — no metadata exists
- `'invalid'` — metadata exists but fails structural validation
- `'stale'` — metadata exists and is structurally valid, but content hashes are absent, mismatch, or hashing encountered I/O errors
- `'fresh'` — metadata exists, is structurally valid, and all content hashes match current files

Errors while resolving title, summary, or status for an individual spec MUST be swallowed; the entry still appears with the title fallback.

`include*` flags are response projection only. The filesystem index MUST materialize the full CLI-usable payload; implementations MUST NOT perform extra I/O when a flag is set.

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

### Requirement: metadata returns parsed metadata or null

`metadata(spec)` MUST read the persisted metadata for the given spec and distinguish absence from staleness.

Read rules:

1. If no metadata exists on disk, return `null`.
2. If metadata exists, return the parsed `SpecMetadata` content together with:
   - `originalHash` — SHA-256 of the raw stored metadata file for conflict detection
   - `freshness` — `'fresh'` or `'stale'`
3. `freshness: 'stale'` means persisted metadata exists but no longer matches the repository's staleness checks defined by the spec-metadata spec.
4. `metadata()` MUST NOT regenerate metadata, rewrite metadata, or silently replace stale persisted content with reconstructed content.

This method remains the canonical persisted metadata read surface. Consumers decide whether stale metadata is acceptable for their use case or whether they must perform deterministic fallback or fail explicitly.

### Requirement: saveMetadata persists metadata with conflict detection

`saveMetadata(spec, content, options?)` MUST first check `this.ownership()`. If the ownership is `readOnly`, the method MUST throw `ReadOnlyWorkspaceError` with a message indicating the spec ID and workspace name. This check MUST occur before any filesystem operation or conflict detection.

If the ownership is `owned` or `shared`, `saveMetadata` proceeds normally: it MUST write the metadata content for the given spec. The `content` parameter is a JSON string. If `originalHash` is set on the content and does not match the current file hash on disk, the save MUST be rejected by throwing `ArtifactConflictError`. When `options.force` is `true`, the conflict check MUST be skipped. If the metadata directory does not exist, it MUST be created. This method replaces the previous pattern of `save(spec, new SpecArtifact('.specd-metadata.yaml', content))` for metadata writes.

### Requirement: persisted spec semantics, persistedStateHash, and specFingerprint

`SpecRepository` MUST NOT expose raw sidecar filesystem shapes (like `SpecLockData`) to
use cases. Instead, it MUST provide semantic operations for reading and writing
persisted spec state:

1. `readPersistedSchema(spec)` — returns the schema identity `{ name, version }` stored
   with the spec, or `null`.
2. `readPersistedDependsOn(spec)` — returns the dependency list `string[]` stored with
   the spec, or `null`.
3. `readPersistedImplementation(spec)` — returns implementation links stored with the
   spec, or `null`.
4. `updatePersistedState(spec, patch, options?)` — updates one or more persisted
   semantics atomically with conflict detection.
5. `persistedStateHash(spec)` — returns a stable SHA-256 hash of the spec's **persisted
   semantic lock state** (the lock sidecar content), or `null` when that state is
   absent. This replaces the former `specHash` name, which MUST NOT remain as the
   public method name.
6. `specFingerprint(spec)` — returns a stable digest of the authored/persisted Spec
   inputs. The canonical payload MUST be sorted-key JSON of: Construction rules:
   1. Presence set MUST be the current `Spec.artifacts` entries (present schema
      artifacts only — not a derived `filenames` list and not schema-wide missing
      slots).
   2. For each entry, `contentHash` MUST be the content hash of that artifact's
      bytes.
   3. `artifacts` MUST be sorted by `filename` ascending before serialization.
   4. `persistedStateHash` MUST be `persistedStateHash(spec)`, or the literal
      `"__absent__"` when that API returns `null`.
   5. `specFingerprint` MUST be the content hash of that canonical JSON string.

Generated `metadata.json` MUST NOT be an input to `specFingerprint`.

These methods are the only application-facing API for persisted sidecar state and Spec
content fingerprinting at the repository boundary. Callers MUST NOT depend on sidecar
filenames, spec-directory scans, or invent validate-cache stamp helpers on this port
to discover or mutate persisted semantics.

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

`SpecRepository` MUST be defined as an `abstract class`, not an `interface`. All storage operations (`get`, `list`, `count`, `reindex`, `artifact`, `save`, `delete`, `resolveFromPath`, `metadata`, `saveMetadata`, persisted spec semantic read/write operations, stable spec hash lookup, `search`) MUST be declared as `abstract` methods. This follows the architecture spec requirement that ports with shared construction are abstract classes.

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

- Each instance is bound to a single workspace; workspace is immutable after construction
- `get` returns lightweight `Spec` metadata including `SpecArtifactEntry` lastModified
  stamps, `persistedStateStamp`, and `generatedMetadataStamp` — artifact **content** is never
  loaded by `get`
- `list` returns `ListResult<SpecListEntry>` rows with host-controlled pagination (no default `limit`); artifact content is never loaded by `list`
- `search` loads artifact content as needed to perform matching — it is more expensive than `list`
- `save` creates the spec directory if it does not already exist
- `ArtifactConflictError` is the sole error type for concurrent modification detection on `save`, `saveMetadata`, and semantic `update` operations
- `resolveFromPath` with a relative path and no `from` parameter is invalid and the implementation MUST handle this as an error or return `null`
- `originalHash` on loaded artifacts MUST use `sha256` of the file content as read from disk
- `metadata` and `saveMetadata` operate on a storage location determined by the adapter — callers MUST NOT assume metadata lives alongside spec content
- `metadata` returns parsed content; `artifact` returns raw content — they are not interchangeable
- `generatedMetadataStamp` on `Spec` is a lastModified/presence stamp only — it is not the parsed metadata document
- `save`, `saveMetadata`, and semantic `update` operations MUST throw `ReadOnlyWorkspaceError` before any I/O when ownership is `readOnly`
- Read operations (`get`, `list`, `count`, `artifact`, `metadata`, `resolveFromPath`, `search`, `persistedStateHash`, `specFingerprint`, and semantic `read` operations) are not affected by ownership — readOnly workspaces can always be read
- Use cases MUST interact with specs through semantic repository operations only.
- Sidecar files (like `spec-lock.json`) are an implementation detail of the repository adapter and MUST NOT be accessed directly by application logic.
- `persistedStateHash()` MUST be stable and deterministic across multiple calls for the same persisted semantic state.
- `specFingerprint()` MUST be stable and deterministic across multiple calls for the same artifact contents and persisted semantic state.
- `specsPath` is a repository capability for filesystem-backed adapters only; consumers MUST NOT assume it exists for every `SpecRepository`
- This port MUST NOT grow validate-cache-specific helpers such as `validationSourceStamps` or `readValidationSidecar`

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
