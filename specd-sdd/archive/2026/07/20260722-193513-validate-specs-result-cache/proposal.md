# Proposal: validate-specs-result-cache

## Motivation

`spec validate --all` (and any host calling `ValidateSpecs` across many specs) re-runs
expensive structural validation even when most specs and the active schema are unchanged.
Repeated full passes waste agent/CI time without improving correctness. A first
implementation added a result cache but invented SpecRepository helpers and modeled
freshness outside the Spec contract — that approach is being corrected so caching rests
on contractual, cheap `get()` metadata plus explicit hash/fingerprint APIs.

## Current behaviour

`ValidateSpecs` discovers specs through `SpecRepository.list` / `get`, then for each spec
loads artifact content, parses ASTs, evaluates schema validations and cross-artifact rules,
and checks metadata consistency (including possible `dependsOn` re-extraction via
persisted semantic state / `spec-lock.json`).

Today `get()` returns a lightweight `Spec` with `workspace`, `name`, and `filenames`
— no last-modified data. There is no contractual way to cheaply compare “did this spec’s
inputs change?” without reading content. `specHash()` exists but hashes only the
persisted lock sidecar, despite a name that suggests broader meaning; it is barely used
outside tests. This change adds stamp metadata on `artifacts` and sidecars while keeping
derived `filenames` / `hasArtifact` for the existing presence API.

An in-flight cache design used ad hoc `validationSourceStamps` /
`readValidationSidecar` on `SpecRepository` without updating `core:spec-repository-port`.
That must not ship.

The FS list-index under `{configPath}/tmp/fs-cache/specs/<workspace>/` speeds discovery
only; it does not memoize validation outcomes.

## Proposed solution

### 1. Extend the Spec contract (cheap freshness on `get`)

Evolve `Spec` / `get()` so callers can hard-gate caches without opening file contents:

- `artifacts`: list of `SpecArtifactEntry` `{ filename, lastModified }` for schema
  artifacts present in the spec directory (`lastModified` contractual; ISO or
  equivalent string). Name is distinct from content-bearing `SpecArtifact`.
- `persistedStateStamp`: `{ present, lastModified }` **stamp** for the lock sidecar — not
  the semantic lock payload (use `readPersisted*` / `persistedStateHash` on the repo)
- `generatedMetadataStamp`: `{ present, lastModified }` **stamp** for the generated
  `metadata.json` sidecar — **not** the parsed metadata document (use `metadata()` on
  the repo). Exposed only so ValidateSpecs caching can hard-hit without parsing JSON.
- **Keep** derived `filenames` and `hasArtifact(filename)` computed from `artifacts`
  (same presence API as today; no duplicate storage)

No hashes or fingerprints on `get()` / `Spec`.

### 2. Rename and add hash APIs on SpecRepository

- Rename `specHash` → **`persistedStateHash`**: SHA-256 of the persisted semantic lock
  state (what FS does today for `spec-lock.json`)
- Add **`specFingerprint`**: digest over the authored/persisted Spec inputs. Canonical
  payload (sorted-key JSON, then hashed):

  ```text
  {
    artifacts: [ { filename, contentHash }, ... ],  // only Spec.artifacts present
                                                 // sorted by filename ascending
    persistedStateHash: <digest> | "__absent__"
  }
  ```

  - `contentHash` = content hash of that artifact’s bytes (same hasher family as elsewhere)
  - Presence set comes from **`Spec.artifacts`** entries (same filenames as
    `Spec.filenames`; sorted by filename ascending)
  - Generated `metadata.json` is **not** an input

- **`cacheFingerprint`** (ValidationResultCache only) — separate from
  `specFingerprint`. Canonical payload (sorted-key JSON, then hashed):

  ```text
  {
    specFingerprint: <digest from SpecRepository.specFingerprint>,
    metadataContentHash: <hash of raw metadata.json bytes> | "__absent__"
  }
  ```

  Metadata is hashed as **raw file bytes** (not via `metadata()` parse). This is why
  the cache signature is not “just `specFingerprint`”: ValidateSpecs’ verdict also
  depends on generated metadata consistency.

### 3. Transparent ValidateSpecs result cache

Keep a result cache used only by `ValidateSpecs`:

- Application port `ValidationResultCache`; v1 FS adapter under
  `{configPath}/tmp/fs-cache/validate-specs/<workspace>/`
- Store full `SpecValidationEntry` (`passed`, `failures`, `warnings`)
- The cache is **purpose-built for ValidateSpecs** (not a general memoizer). It may
  know that use case’s freshness model and own the full cascade, including lazy I/O.
- Freshness cascade **owned by the cache** (ValidateSpecs does not precompute
  fingerprints or drive soft-hit refresh):
  1. Bucket meta (`schemaFingerprint`, `engineVersion`, invalidation)
  2. Load cheap stamps via `SpecRepository.get()` (`artifacts` /
     `SpecArtifactEntry.lastModified`, `persistedStateStamp`, `generatedMetadataStamp`)
  3. Hard-hit on stamps → return entry (no content reads)
  4. Soft path: compute **`cacheFingerprint`** lazily from the locked formula above
     (`specFingerprint` + raw metadata content hash / `"__absent__"`)
  5. Soft-hit → return entry and **the cache itself** refreshes stored stamps
  6. Miss → ValidateSpecs runs full validate → calls cache `upsert` with the
     result entry (plus bucket validity inputs and spec identity); the cache
     itself reloads stamps / fingerprint and persists the row
- **`lookup` result (cache → ValidateSpecs):** only **hit** (with `entry`) or
  **miss**. Soft-hit stamp refresh is invisible to the use case — no
  `refreshStamps` (or equivalent) flag. On hit, ValidateSpecs returns/uses `entry`
  as the per-spec outcome; on miss it validates then `upsert`s.
- **`upsert` inputs (ValidateSpecs → cache):** `entry` (`SpecValidationEntry`),
  spec identity (or `Spec`), `schemaFingerprint`, `engineVersion`. The use case
  does **not** pass stamps or fingerprint; the cache materializes those via
  `SpecRepository` the same way `lookup` does.
- ValidateSpecs supplies what composition needs (e.g. workspace cache instance +
  `SpecRepository` / spec identity + schema/engine bucket inputs), then branches on
  hit vs miss. It must not interpret cache wire format or implement the cascade.
- Remove invented SpecRepository helpers (`validationSourceStamps`,
  `readValidationSidecar`); stamps come from the Spec contract; fingerprint pieces
  from `specFingerprint` + metadata file hash via normal repo APIs the
  ValidateSpecs-specific cache is allowed to call.
- Hosts MUST NOT learn the cache exists (no flags / reindex surfaces)

### 4. Consumers of Spec.filenames / hasArtifact

Keep `Spec.filenames` and `hasArtifact` for presence. Migrate call sites only where
**stamp** metadata is needed (cache cascade, index materialization). Do not iterate
`artifacts` for simple “does spec.md exist?” checks when `hasArtifact('spec.md')` suffices.

Sidecar semantic content stays on `SpecRepository` read/hash APIs; `Spec.*Stamp` getters
are filesystem presence + mtime only.

## Specs affected

### New specs

- `core:validation-result-cache-port`: application port for persisting and looking up
  validation result cache entries per workspace. Hosts never consume this port; only
  `ValidateSpecs` (via composition) does.
  - Depends on: `default:_global/architecture`

### Modified specs

- `core:spec-repository-port`: extend `Spec` / `get()` with artifact lastModified,
  `persistedStateStamp`, and `generatedMetadataStamp` stamps; rename `specHash` →
  `persistedStateHash`; add `specFingerprint`; forbid inventing validate-cache stamp
  helpers on the port.
  - Depends on (added): none
  - Depends on (removed): none

- `core:fs-spec-repository`: implement the new Spec stamps via directory listing +
  `stat` (and lock/metadata path resolution); implement `persistedStateHash` /
  `specFingerprint` without exposing raw sidecar APIs to use cases beyond the port
  contract.
  - Depends on (added): none
  - Depends on (removed): none

- `core:get-spec`: iterate `spec.filenames` and load via `repo.artifact()` (unchanged
  presence surface).
  - Depends on (added): none
  - Depends on (removed): none

- `core:search-specs`: presence checks via `spec.hasArtifact('spec.md')` (or
  `filenames`).
  - Depends on (added): none
  - Depends on (removed): none

- `core:spec-lock`: align naming/docs with `persistedStateStamp` / `persistedStateHash`;
  sidecar MUST NOT appear in `Spec.artifacts` (was `Spec.filenames`).
  - Depends on (added): none
  - Depends on (removed): none

- `code-graph:workspace-integration`: resolve artifact presence from `spec.filenames`;
  align freshness with `persistedStateHash` (was `specHash`).
  - Depends on (added): none
  - Depends on (removed): none

- `default:_global/conventions`: lazy-loading verify scenario continues to describe
  `get()` returning lightweight `Spec` metadata including `filenames` (no artifact bytes).
  - Depends on (added): none
  - Depends on (removed): none

- `core:spec-metadata`: clarify that `generatedMetadataStamp` on `Spec` is not the
  parsed metadata document; `metadata()` remains the only parse/freshness surface for
  generated metadata content.
  - Depends on (added): none
  - Depends on (removed): none

- `core:validate-specs`: use the ValidateSpecs-specific result cache for hit/miss;
  on miss run full validation and upsert; do not precompute cascade fingerprints or
  soft-hit refresh; host-transparent.
  - Depends on (added): `core:validation-result-cache-port`, `core:spec-lock`,
    `core:spec-repository-port`
  - Depends on (removed): none

- `core:storage`: document `validate-specs/<workspace>/` fs-cache bucket (v1), extended
  meta (`schemaFingerprint`, `engineVersion`), JSONL rows; host opacity.
  - Depends on (added): none
  - Depends on (removed): none

- `core:validation-result-cache-port`: ValidateSpecs-specific cache port; may depend on
  `SpecRepository` to load stamps and compute fingerprint lazily
  (`specFingerprint` + metadata hash); soft-hit stamp refresh inside the cache;
  remove SpecRepository inventing stamp helpers.
  - Depends on (added): `core:spec-repository-port`
  - Depends on (removed): none

## Impact

- `@specd/core` domain: `Spec` entity shape (and presence VO naming distinct from
  content-bearing `SpecArtifact`).
- `@specd/core` application: SpecRepository port APIs; ValidateSpecs cache wiring;
  `ValidationResultCache` port.
- `@specd/core` infrastructure: `FsSpecRepository` / spec list index materialization;
  `FsValidationResultCache`.
- Callers keep `Spec.filenames` / `hasArtifact` for presence; use `artifacts` / `*Stamp`
  getters when stamp metadata is needed (cache, index materialization).
- No intentional host-facing CLI/MCP cache APIs.
- Runtime files under `{configPath}/tmp/fs-cache/validate-specs/` (tmp / gitignored).

## Technical context

### Locked decisions

1. **Spec = contract for cheap freshness** — `get()` exposes lastModified/presence for
   artifacts (`SpecArtifactEntry`), `persistedStateStamp`, and `generatedMetadataStamp`;
   never content hashes.
2. **`generatedMetadataStamp` on Spec** — needed so ValidateSpecs hard-hit does not call
   `metadata()` (parse + content-hash freshness). Metadata remains a generated sidecar,
   not authored spec content.
3. **`persistedStateHash`** — rename of today’s lock content hash API; not a whole-spec
   hash.
4. **`SpecArtifactEntry`** — presence row type on `Spec` (`filename` + `lastModified`),
   distinct from content VO `SpecArtifact`.
5. **`specFingerprint`** (SpecRepository) — `hash(sortedKeyJson({ artifacts:
[{filename,contentHash}…] sorted by filename, persistedStateHash | "__absent__" }))`.
   Presence from `Spec.artifacts` only. Not metadata.
6. **`cacheFingerprint`** (ValidationResultCache) —
   `hash(sortedKeyJson({ specFingerprint, metadataContentHash | "__absent__" }))`.
   Metadata hash = raw `metadata.json` bytes. Computed lazily on soft path; owned by
   the cache (not ValidateSpecs). Replaces the old flat
   `computeInputFingerprint(sorted filenames + metadata + lock)` helper.
7. **Remove** `validationSourceStamps` / `readValidationSidecar`.
8. **Cache everything** — full `SpecValidationEntry` on completed validation.
9. **Port + FS adapter** — not inside `FsSpecRepository` list-index; host-opaque.
10. **Derived presence API** — keep `filenames` and `hasArtifact` computed from
    `artifacts`; stamp metadata lives on `SpecArtifactEntry` only.
11. **Cascade owned by the cache** — stamps via `get()`, soft-hit refresh inside the
    cache, fingerprint computed by the cache when needed. ValidateSpecs only sees
    hit/miss (+ entry) and upserts after a full miss validation.
12. **`upsert` is entry-centric** — ValidateSpecs passes `entry` + spec identity +
    `schemaFingerprint` / `engineVersion`. Stamps and cache fingerprint are
    gathered inside the cache, not assembled by the use case.
13. **`lookup` is hit/miss only** — returns cached `entry` on hit, or miss. No
    soft-hit protocol exposed to ValidateSpecs.
14. **Cache constructor takes `SpecRepository`** — composition injects the same-workspace
    repository once; `lookup`/`upsert` do not receive the repo (nor stamps/fingerprint).
    Port surface:

    ```ts
    abstract class ValidationResultCache {
      constructor(deps: { specRepository: SpecRepository /* + storage deps in adapter */ })
      workspace(): string
      lookup(input: {
        spec: Spec
        schemaFingerprint: string
        engineVersion: number
      }): Promise<{ kind: 'hit'; entry } | { kind: 'miss' }>
      upsert(input: {
        entry: SpecValidationEntry
        spec: Spec
        schemaFingerprint: string
        engineVersion: number
      }): Promise<void>
    }
    ```

### Rejected

- Putting hashes/fingerprints on `get()` / `Spec`.
- Taking metadata lastModified from `metadata()` for the hard-hit path (use
  `generatedMetadataStamp` stamps from `get()` instead).
- Treating generated metadata as part of the authored Spec / `specFingerprint`.
- Keeping the old flat input fingerprint that sorted artifact + `metadata.json` +
  `spec-lock.json` filenames into one payload (lock moves into `persistedStateHash`
  inside `specFingerprint`; metadata moves into `cacheFingerprint` only).
- Embedding validation results in `FsSpecIndexCache` / `SpecListEntry`.
- Host-visible cache flags or validate-only `storage reindex` surfaces.
- Leaving SpecRepository API changes undocumented outside
  `core:validation-result-cache-port`.
- Soft-hit refresh driven by ValidateSpecs via a `refreshStamps` / second upsert
  protocol the use case must understand (including returning `refreshStamps` from
  `lookup`).
- Forcing ValidateSpecs to precompute the cache fingerprint before every lookup
  (kills hard-hit savings).
- Treating the validation result cache as a general-purpose cache that must stay
  ignorant of ValidateSpecs’ input model.
- Require ValidateSpecs to pass stamps / fingerprint into `upsert` (wire-format
  knowledge in the use case).

## Open questions

- none for proposal scope; exact port method signatures and composition wiring
  (how the cache receives `SpecRepository` for `lookup`/`upsert`) live in
  design/deltas.
