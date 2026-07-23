# Design: validate-specs-result-cache

## Non-goals

- No CLI, MCP, plugin, or other host API for cache control, inspection, or reindex of
  `validate-specs/` buckets.
- No embedding of validation results into `FsSpecIndexCache` / `SpecListEntry`.
- No change to public `ValidateSpecsInput` / `ValidateSpecsResult` shapes.
- No `refreshStamps` (or equivalent) returned from `lookup` — soft-hit stamp refresh is
  internal to the cache adapter.
- No stamps / `cacheFingerprint` / `SpecRepository` parameters on `lookup` / `upsert`
  beyond the locked method signatures below.
- No removal of derived `Spec.filenames` / `hasArtifact` — they remain computed from
  `artifacts` so presence checks stay ergonomic; stamp metadata lives on
  `SpecArtifactEntry` only.
- No push invalidation from unrelated write paths in v1; correctness is opportunistic via
  stamps + fingerprints + bucket meta on read.
- No requirement that non-filesystem storage backends ship a v1 adapter beyond the port
  contract (v1 ships one FS adapter).

## Affected areas

- `Spec` in `packages/core/src/domain/entities/spec.ts`
  - Change: extend with `artifacts: SpecArtifactEntry[]`, sidecar **stamps**
    `persistedStateStamp` and `generatedMetadataStamp`. Keep derived `filenames` and
    `hasArtifact(filename)` computed from `artifacts`. Constructor takes stamp fields,
    not a bare string list.
  - Callers: CRITICAL blast radius across core use cases, FS repo, code-graph indexer,
    and tests that construct `new Spec(...)`; most keep using `.filenames` /
    `.hasArtifact()` for presence.

- `SpecRepository` in `packages/core/src/application/ports/spec-repository.ts`
  - Change: remove invented `validationSourceStamps` / `readValidationSidecar`; rename
    `specHash` → `persistedStateHash`; add `specFingerprint(spec)`; `get()` returns the
    expanded `Spec` shape.
  - Callers: HIGH — FS adapter, ValidateSpecs cache, code-graph indexer, tests.

- `FsSpecRepository` / `FsSpecIndexCache` in
  `packages/core/src/infrastructure/fs/spec-repository.ts` and
  `packages/core/src/infrastructure/fs/fs-spec-index-cache.ts`
  - Change: populate stamps via `stat` on `get()`; implement hash APIs; presence checks
    use `Spec.filenames` / `Spec.hasArtifact()` (or `Spec.artifacts` when mtime needed).

- Call sites of `spec.filenames` / `hasArtifact` — **keep** for presence; migrate only
  where stamp metadata (`lastModified`) is required (`validate-specs` cache, FS index
  materialization). Non-exhaustive: `get-spec.ts`, `search-specs.ts`,
  `validate-specs.ts`, `fs-spec-index-cache.ts`, `spec-repository.ts` helpers,
  code-graph workspace indexing, and matching tests / fakes.

- `ValidationResultCache` in
  `packages/core/src/application/ports/validation-result-cache.ts`
  - Change: rewrite to constructor-injected `SpecRepository` + locked
    `lookup`/`upsert` signatures; drop stamp/fingerprint inputs and `refreshStamps`.

- `FsValidationResultCache` in
  `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`
  - Change: own cascade + fingerprint materialization; store stamps from `Spec` shape;
    store `cacheFingerprint` (not flat `inputFingerprint`).

- Fingerprint helpers in
  `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts`
  - Change: keep schema fingerprint + engine version; replace flat
    `computeInputFingerprint` with `computeCacheFingerprint({ specFingerprint,
metadataContentHash })` (and optionally keep schema helpers only). SpecRepository
    owns `specFingerprint` payload construction in the FS adapter (or a shared pure
    helper used by the adapter).

- `ValidateSpecs` in `packages/core/src/application/use-cases/validate-specs.ts`
  - Change: `lookup({ spec, schemaFingerprint, engineVersion })` → on hit use entry; on
    miss full validate → `upsert({ entry, spec, schemaFingerprint, engineVersion })`.
    No stamp collection, no soft-hit refresh, no fingerprint precompute.

- Composition: `resolveValidateSpecsDeps`, `composition-resolver`, kernel wiring
  - Change: construct each `FsValidationResultCache` with that workspace's
    `SpecRepository` + `configPath`; expose
    `validationResultCaches: ReadonlyMap<string, ValidationResultCache>`.

- Code-graph indexer
  `packages/code-graph/src/application/use-cases/index-code-graph.ts`
  (~line where `repoSpec.filenames` is read for artifact concatenation)
  - Change: keep `repoSpec.filenames` for content artifact selection. Repo-level
    `specHash` → `persistedStateHash` only where fakes/tests still stub the old method
    (`packages/code-graph/test/**`); production indexer freshness here uses content
    hashing of concatenated artifacts, not `SpecRepository.specHash()`.

- Curated barrel `packages/core/src/ports.ts` and `application/ports/index.ts`
  - Change: export updated port types.

### Important: treat in-flight cache code as rewrite

Groups of earlier tasks left a first-pass `ValidationResultCache`,
`FsValidationResultCache`, ValidateSpecs cache orchestration, and
`computeInputFingerprint` on disk. That implementation is **obsolete** relative to
this design (stamps/fingerprint on the use-case wire, `refreshStamps`, invented
SpecRepository helpers, flat input fingerprint). Implementers MUST rewrite those
surfaces to match this document — do not incrementally “fix up” the old protocol.

## New constructs

### `SpecArtifactEntry` (domain VO or inline type on `Spec`)

- **Location:** `packages/core/src/domain/entities/spec.ts` (or adjacent VO file if
  preferred by conventions)
- **Shape:**

```ts
export interface SpecArtifactEntry {
  readonly filename: string
  readonly lastModified: string // ISO-8601 (or adapter-family stable string)
}

export interface SpecSidecarStamp {
  readonly present: boolean
  readonly lastModified: string | null
}
```

- **Responsibility:** cheap presence + lastModified for schema artifacts / sidecars on
  `get()`. Not content.

### `Spec` (rewritten)

```ts
export class Spec {
  constructor(
    workspace: string,
    name: SpecPath,
    artifacts: readonly SpecArtifactEntry[],
    persistedStateStamp: SpecSidecarStamp,
    generatedMetadataStamp: SpecSidecarStamp,
  )
  workspace(): string
  name(): SpecPath
  artifacts(): readonly SpecArtifactEntry[]
  filenames(): readonly string[] // derived from artifacts[].filename
  hasArtifact(filename: string): boolean // derived presence check
  persistedStateStamp(): SpecSidecarStamp // filesystem stamp — not lock semantics
  generatedMetadataStamp(): SpecSidecarStamp // filesystem stamp — not parsed metadata
}
```

### `SpecRepository` hash APIs

```ts
abstract persistedStateHash(spec: Spec): Promise<string | null> // was specHash
abstract specFingerprint(spec: Spec): Promise<string>
```

`specFingerprint` canonical payload (sorted-key JSON, then content-hashed):

```ts
{
  artifacts: Array<{ filename: string; contentHash: string }> // Spec.artifacts only,
  // sorted by filename
  persistedStateHash: string // digest or "__absent__"
}
```

Generated metadata MUST NOT be an input.

### `ValidationResultCache` port

- **Location:** `packages/core/src/application/ports/validation-result-cache.ts`
- **Shape:**

```ts
export type SpecValidationEntry = {
  readonly spec: string // workspace:capabilityPath
  readonly passed: boolean
  readonly failures: readonly { readonly artifactId: string; readonly description: string }[]
  readonly warnings: readonly { readonly artifactId: string; readonly description: string }[]
}

export type ValidationCacheLookupResult =
  | { readonly kind: 'hit'; readonly entry: SpecValidationEntry }
  | { readonly kind: 'miss' }

export abstract class ValidationResultCache {
  protected constructor(
    protected readonly specRepository: SpecRepository,
    // adapters add storage deps
  ) {}

  abstract workspace(): string

  abstract lookup(input: {
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<ValidationCacheLookupResult>

  abstract upsert(input: {
    readonly entry: SpecValidationEntry
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<void>
}
```

- **Responsibility:** ValidateSpecs-only result memoization + freshness cascade.
- **Relationships:** constructed by composition with same-workspace `SpecRepository`;
  consumed only by `ValidateSpecs`.

### `FsValidationResultCache`

- **Location:** `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`
- **Constructor deps:** `{ specRepository: SpecRepository; configPath: string }` (plus
  hasher if not obtained from infra helpers).
- **Bucket:** `{configPath}/tmp/fs-cache/validate-specs/<workspace>/`
  - `.specd-index-meta.json` — `{ totalCount, generatedAt, isInvalidated,
schemaFingerprint, engineVersion }`
  - `.specd-index.jsonl` — lines `{ entry, stamps, cacheFingerprint }`
- **`stamps` wire shape:** derived from `Spec` —
  `{ artifacts: SpecArtifactEntry[]; persistedStateStamp; generatedMetadataStamp }`
- **`cacheFingerprint`:**

```ts
hash(
  sortedKeyJson({
    specFingerprint: string,
    metadataContentHash: string, // raw metadata.json bytes hash or "__absent__"
  }),
)
```

- **How to obtain raw metadata bytes (no invented SpecRepository helper):**
  `FsValidationResultCache` is an FS adapter and MAY read the generated metadata
  file through the same path resolution the FS SpecRepository already uses for
  `metadata()` / `saveMetadata` (config `metadataPath` + workspace/spec layout).
  It hashes those **raw file bytes** (or `"__absent__"` if missing). It MUST NOT
  call `metadata()` (parse + freshness) on the soft-hit path, and MUST NOT add
  `readValidationSidecar` / `validationSourceStamps` back onto `SpecRepository`.
  Non-FS adapters would need an equivalent adapter-local raw-read capability; v1
  only ships the FS adapter.

### `computeCacheFingerprint` helper

- **Location:** keep under
  `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts`
  (or move next to the FS adapter if preferred — application helper is fine for pure
  hashing used by the adapter and tests).
- Replace `computeInputFingerprint`. Keep `VALIDATE_SPECS_ENGINE_VERSION` and
  `computeSchemaFingerprint` / `computeSchemaFingerprintFromSchema`.

## Approach

1. **Expand `Spec` + FS `get()`** — directory listing + `stat` for artifact mtimes; lock
   and metadata path `stat` for sidecar stamps. No content reads on `get()`.
2. **Hash APIs on SpecRepository** — `persistedStateHash` = SHA-256 of lock bytes (or
   null); `specFingerprint` hashes the canonical JSON above (artifact bytes via existing
   content hashing).
3. **Rewrite ValidationResultCache** — constructor injects `SpecRepository`. Cascade:
   1. Bucket meta valid for `schemaFingerprint` + `engineVersion` and not invalidated
   2. `get()` current stamps; compare to stored → hard hit (no content I/O)
   3. Else compute `cacheFingerprint` lazily → soft hit refreshes stamps in-adapter
   4. Else miss
4. **ValidateSpecs** — per selected spec:
   `lookup({spec, schemaFingerprint, engineVersion})` → hit uses `entry`; miss runs
   existing `_validateSpec` then
   `upsert({entry, spec, schemaFingerprint, engineVersion})`.
5. **Migrate callers** — every `spec.filenames` / `hasArtifact` / `new Spec(ws, name,
filenames)` site; code-graph `specHash` → `persistedStateHash`.
6. **Delete** SpecRepository validate-cache helpers and the old flat input fingerprint
   path.
7. **Tests** — entity/FS/get stamps; fingerprint formulas; FS cache cascade with injected
   fake/real repo; ValidateSpecs hit/miss without refresh protocol; search/get-spec
   presence via artifacts.

### Composition wiring

`resolveValidateSpecsDeps` builds one `FsValidationResultCache` per workspace:

```ts
new FsValidationResultCache({
  specRepository: specs.get(workspace)!,
  configPath: /* project configPath already known to the resolver */,
  // plus whatever the FS adapter needs to resolve metadataPath the same way
  // FsSpecRepository does (reuse existing composition options; do not invent a
  // SpecRepository raw-sidecar API)
})
```

Hosts never see the map; only ValidateSpecs deps include it.

## Key decisions

- **Spec carries cheap stamps; hashes stay on SpecRepository** → hard-hit without
  `metadata()` parse. **Rejected:** stamps via invented repo helpers; hashes on `get()`.
- **Cache constructor takes SpecRepository** → cascade I/O owned by cache.
  **Rejected:** passing repo / stamps / fingerprint on every call.
- **`lookup` still takes schemaFingerprint + engineVersion** → bucket validity is
  per-run schema/engine, not constructor state. **Rejected:** `lookup(spec)` alone.
- **Two-layer fingerprints** → `specFingerprint` (authored/persisted) +
  `cacheFingerprint` (adds raw metadata). **Rejected:** old flat sorted-filename
  payload mixing artifacts + metadata + lock.
- **Keep derived `filenames` / `hasArtifact`** → presence API unchanged; stamps on
  `artifacts`. **Rejected:** forcing every caller through `artifacts.some(...)`.
- **Soft-hit invisible** → adapter refreshes stamps; ValidateSpecs sees hit/miss only.
  **Rejected:** `refreshStamps: true` protocol.

## Trade-offs

- [CRITICAL Spec constructor blast radius] → migrate call sites + test fakes in the same
  change; prefer a small factory helper in tests (`makeSpec(...)`) to avoid sprawl.
- [Soft-hit still reads content for fingerprint] → only after stamp miss; still cheaper
  than full AST validation.
- [Raw metadata hash vs `metadata()` freshness] → cache uses raw bytes for soft path;
  ValidateSpecs still runs full metadata consistency on miss.
- [Opportunistic cache without write-path invalidation] → wrong hit only if mtimes and
  content hashes collide with semantic changes; mitigated by content fingerprint on soft
  path and schema/engine bucket keys.
- [In-flight code still on old helpers] → treat current port/adapter/ValidateSpecs cache
  wiring as rewrite targets, not incremental tweaks.

## Spec impact

- `core:spec-repository-port` — Spec shape + hash API rename; dependents that assumed
  `filenames` updated in-scope (`get-spec`, `search-specs` call sites, conventions,
  code-graph workspace-integration).
- `core:validation-result-cache-port` — new/rewritten; only ValidateSpecs consumes it.
- `core:validate-specs` / `core:storage` — cache behaviour + FS bucket layout.
- `core:spec-lock` / `core:spec-metadata` / `core:fs-spec-repository` — naming and stamp
  boundaries.
- No further dependent specs identified beyond those already in change scope.

## Implementation order

1. Domain `Spec` + `SpecArtifactEntry` + derived `filenames`/`hasArtifact` + sidecar
   stamps.
2. SpecRepository port + FsSpecRepository stamps/`persistedStateHash`/`specFingerprint`.
3. Migrate production call sites (get-spec, search-specs, index cache, validate-specs
   presence, code-graph indexer).
4. Rewrite ValidationResultCache port + FsValidationResultCache + fingerprint helper.
5. Simplify ValidateSpecs orchestration + composition wiring.
6. Fix tests/fakes; add cascade + fingerprint unit/integration coverage.
7. Remove dead helpers (`validationSourceStamps`, `readValidationSidecar`,
   `computeInputFingerprint`).

## Testing strategy

- Unit: `Spec` shape; `computeSchemaFingerprint` / `computeCacheFingerprint` stability
  and `__absent__`; `specFingerprint` ordering and metadata exclusion.
- Integration (temp dirs): FS `get()` stamps; FS cache hard/soft/miss; lock-only and
  metadata-only content changes; bucket schema/engine mismatch.
- Use-case: ValidateSpecs with in-memory cache fake that injects a fake SpecRepository;
  assert no refresh protocol; upsert args entry-centric; host-visible result unchanged.

## Acceptance criteria

- `spec validate --all` (or ValidateSpecs over many unchanged specs) hard-hits without
  re-parsing when stamps match.
- Soft-hit refreshes stored stamps inside the cache without ValidateSpecs involvement.
- Miss upserts pass and fail outcomes with stamps + `cacheFingerprint` materialized by
  the cache.
- `Spec` exposes `artifacts` (stamps), derived `filenames` / `hasArtifact`, and sidecar
  stamps; semantic content stays on `SpecRepository` hash/read APIs.
- Hosts have no new cache flags or reindex surfaces.
- Invented SpecRepository validate-cache helpers are gone.
