# Tasks: validate-specs-result-cache

## 1. Application port

- [x] 1.1 Add `ValidationResultCache` port types and abstract class
      `packages/core/src/application/ports/validation-result-cache.ts`:
      `ValidationResultCache`, `ValidationCacheEntry`, `ValidationSourceStamp`,
      `ValidationCacheLookupInput`, `ValidationCacheLookupResult`,
      `ValidationCacheUpsertInput` — define the port contract from design
      Approach: abstract class with `workspace()`, `lookup()`, `upsert()`; entry payload
      includes `spec`, `passed`, `failures`, `warnings`; stamps use `mtime: string | null`
      for explicit absence
      (Req: Abstract port shape, Cached entry payload, Per-spec freshness inputs,
      Lookup cascade contract, Upsert after validation)

- [x] 1.2 Export the new port from the ports barrel
      `packages/core/src/application/ports/index.ts`:
      re-export `validation-result-cache.js` symbols
      Approach: named ESM exports only; no default export
      (Req: Abstract port shape)

## 2. Fingerprint helpers

- [x] 2.1 Add `VALIDATE_SPECS_ENGINE_VERSION` and fingerprint helpers
      `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts`:
      `VALIDATE_SPECS_ENGINE_VERSION`, `computeSchemaFingerprint`, `computeInputFingerprint`
      Approach: engine version constant `1`; schema fingerprint = sorted-key JSON of
      schema identity + scope:spec validations + scope:spec cross-rules +
      `declaresDependsOnExtraction`, then `hash()`; input fingerprint = sorted filenames
      with content hash or `__absent__` for null, including always `metadata.json` and
      `spec-lock.json`
      (Req: Transparent validation result cache — fingerprint inputs)

- [x] 2.2 Unit-test fingerprint helpers
      `packages/core/test/application/use-cases/_shared/validate-specs-cache-fingerprints.spec.ts`:
      new describe blocks for schema/input stability and absence/lock sensitivity
      Approach: assert identical inputs → identical digests; lock content change →
      different input fingerprint; null sidecars use `__absent__`
      (Req: Transparent validation result cache — fingerprint inputs;
      Scenario: Input fingerprint includes spec-lock)

## 3. Filesystem adapter

- [x] 3.1 Implement `FsValidationResultCache` with extended meta + JSONL rows
      `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`:
      `FsValidationResultCache`, `ValidationIndexMeta`
      Approach: bucket at `{configPath}/tmp/fs-cache/validate-specs/<workspace>/`; meta
      extends list-index fields with `schemaFingerprint` + `engineVersion`; JSONL lines
      `{ entry, sourceFiles, inputFingerprint }`; atomic temp+rename publish; do not reuse
      `FsSpecIndexCache` / `SpecListEntry`
      (Req: Validation result cache bucket layout)

- [x] 3.2 Implement lookup cascade and stamp refresh upsert paths
      `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`:
      `lookup()`, `upsert()`
      Approach: bucket invalid/`isInvalidated`/schema/engine mismatch → miss; stamps equal
      → hard hit; stamps differ + fingerprint equal → soft hit (`refreshStamps: true`);
      else miss; upsert writes full row or stamps-only refresh without changing entry/fp
      (Req: Bucket validity inputs, Lookup cascade contract, Upsert after validation)

- [x] 3.3 Collect source stamps including artifacts, metadata, and spec-lock
      `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`:
      stamp collection helper used by composition/`ValidateSpecs` or adapter API
      Approach: ISO mtime string when present, `mtime: null` when absent; always include
      participating artifact basenames plus `metadata.json` and `spec-lock.json`
      (Req: Per-spec freshness inputs; Scenario: Source stamps cover lock and metadata
      sidecars)

- [x] 3.4 Integration-test FS adapter against temp directories
      `packages/core/test/infrastructure/fs/fs-validation-result-cache.spec.ts`:
      hard hit, soft hit, schema/engine miss, absent sidecars, atomic publish
      Approach: temp `configPath`; assert files under `tmp/fs-cache/validate-specs/<ws>/`
      and meta extension fields
      (Req: Validation result cache bucket layout; Lookup cascade contract)

## 4. ValidateSpecs orchestration

- [x] 4.1 Inject `validationResultCaches` into `ValidateSpecs`
      `packages/core/src/application/use-cases/validate-specs.ts`:
      constructor + field for `ReadonlyMap<string, ValidationResultCache>`
      Approach: require map keyed by workspace name; resolve cache for the workspace
      under validation; keep public `execute` input/result types unchanged
      (Req: Transparent validation result cache; Host opacity)

- [x] 4.2 Apply lookup → validate → upsert flow in `execute` / per-spec loop
      `packages/core/src/application/use-cases/validate-specs.ts`:
      `execute()`, `_validateSpec` call sites
      Approach: compute schema fingerprint + engine version once; collect stamps; hard hit
      skips `_validateSpec`; soft hit returns entry and refresh stamps; miss runs
      `_validateSpec` then upserts full entry including failures/warnings
      (Req: Transparent validation result cache; Scenarios: Hard hit, Soft hit, Miss)

- [x] 4.3 Extend `ValidateSpecsDeps` and `resolveValidateSpecsDeps`
      `packages/core/src/composition/use-cases/validate-specs.ts`:
      `ValidateSpecsDeps`, `resolveValidateSpecsDeps`, `isValidateSpecsDeps`,
      `createValidateSpecsFromNormalized`
      Approach: add `validationResultCaches: ReadonlyMap<string, ValidationResultCache>`;
      do not construct FS paths inline in the factory
      (Req: Config-based factory delegates through resolveValidateSpecsDeps;
      Scenario: resolveValidateSpecsDeps includes validationResultCaches)

- [x] 4.4 Wire FS caches in composition resolver / kernel path used by resolve
      `packages/core/src/composition/composition-resolver.ts` (and kernel only if required):
      create per-workspace `FsValidationResultCache`
      Approach: build from `configPath` + workspace names already known to the resolver;
      keep the port off host-facing surfaces
      (Req: Host opacity; Workspace-scoped instances)

## 5. Tests for use case

- [x] 5.1 Add fake in-memory `ValidationResultCache` in test helpers if useful
      `packages/core/test/application/use-cases/helpers.ts` (or local fake in spec file):
      in-memory map implementing the port
      Approach: store rows keyed by spec id with meta fields for schema/engine
      (Req: Abstract port shape)

- [x] 5.2 Extend `validate-specs.spec.ts` for cache hit/miss/soft-hit and lock fingerprint
      `packages/core/test/application/use-cases/validate-specs.spec.ts`:
      new describe coverage for cache behaviour and factory deps
      Approach: assert parser/rules not invoked on hard hit; soft hit refreshes stamps;
      miss upserts failures; lock-only change changes fingerprint; deps include
      `validationResultCaches`
      (Req: Transparent validation result cache; Host opacity)

## 6. Docs and hygiene

- [x] 6.1 Update fs-cache layout documentation under `docs/`
      search/update docs that describe `{configPath}/tmp/fs-cache/` (e.g. configuration /
      storage references): add `validate-specs/<workspace>/` sibling bucket
      Approach: document adapter ownership + host opacity (no CLI flags); do not add
      `storage reindex` / `spec validate` cache surfaces
      (Req: Validation result cache bucket layout; Hosts gain no validate-cache-specific
      reindex surface)

- [x] 6.2 Manual dual-run smoke of `spec validate --all`
      local project: run validate twice; confirm bucket files appear; unchanged specs
      still pass; touch vs content/lock edits behave as designed
      Approach: observational timing only; verify CLI help gained no cache flags
      (Req: Host opacity; Manual / E2E from design)

## 7. Compliance follow-up (post-verify audit)

- [x] 7.1 Export port from curated `@specd/core/ports` barrel
      `packages/core/src/ports.ts`:
      re-export `ValidationResultCache` and related types
      Approach: mirror other application port exports; keep FS adapter off this barrel
      (Req: Abstract port shape; architecture curated ports barrel)

- [x] 7.2 Use-case soft-hit and miss+failure upsert tests
      `packages/core/test/application/use-cases/validate-specs.spec.ts`:
      soft hit refreshes stamps and skips parse; miss upserts failures and warnings
      Approach: use in-memory fake; assert `upserts` payload and parse spy counts
      (Req: Transparent validation result cache; Scenarios: Soft hit, Miss)

- [x] 7.3 Adapter isolation / invalidation / failed-entry coverage
      `packages/core/test/infrastructure/fs/fs-validation-result-cache.spec.ts`:
      multi-workspace bucket isolation; `isInvalidated` miss; failed entry round-trip
      Approach: two workspace caches under one `configPath`; seed invalidated meta;
      upsert `passed:false` with failures/warnings and hard-hit assert
      (Req: Workspace-scoped instances; Bucket validity inputs; Cached entry payload)

## 8. Redesign alignment (post-design review)

> Groups 1–7 implemented the first cache attempt and are marked done for history.
> That code on disk is **obsolete** — rewrite port/adapter/ValidateSpecs/fingerprint
> helpers to the locked design; do not incrementally patch the old
> stamps/`refreshStamps`/`computeInputFingerprint` protocol.
>
> Locked model: `Spec` stamps + derived `filenames`/`hasArtifact`, constructor-injected
> `SpecRepository`, two-layer fingerprints, hit/miss-only lookup.

- [x] 8.1 Rewrite `Spec` with `artifacts` / sidecar `*Stamp` getters
      `packages/core/src/domain/entities/spec.ts`:
      `Spec`, `SpecArtifactEntry`, `SpecSidecarStamp`
      Approach: constructor
      `(workspace, name, artifacts, persistedStateStamp, generatedMetadataStamp)`; derived
      `filenames` / `hasArtifact(filename)` from `artifacts`
      (Req: get returns a Spec or null; Derived presence API)

- [x] 8.2 Update `Spec` entity unit tests
      `packages/core/test/domain/entities/spec.spec.ts`:
      constructor/getters coverage
      Approach: assert `artifacts` stamps, `filenames`, `hasArtifact`, and `*Stamp` getters
      (Req: get returns a Spec or null)

- [x] 8.3 Expand SpecRepository port: stamps on get, rename hash, add fingerprint
      `packages/core/src/application/ports/spec-repository.ts`:
      `get`, `persistedStateHash`, `specFingerprint`; remove
      `validationSourceStamps`/`readValidationSidecar`/`specHash`
      Approach: document canonical `specFingerprint` JSON; keep semantic lock ops
      (Req: persistedStateHash and specFingerprint; SpecRepository injected helpers ban)

- [x] 8.4 Implement FS `get()` stamp population via `stat`
      `packages/core/src/infrastructure/fs/spec-repository.ts`:
      `get()`
      Approach: schema artifact files → `SpecArtifactEntry{filename,lastModified}`;
      lock/metadata paths → `persistedStateStamp`/`generatedMetadataStamp`; no content reads
      (Req: Spec stamp population on get)

- [x] 8.5 Implement FS `persistedStateHash` and `specFingerprint`
      `packages/core/src/infrastructure/fs/spec-repository.ts`:
      `persistedStateHash`, `specFingerprint`
      Approach: lock bytes SHA-256 or null; fingerprint =
      `hash(sortedKeyJson({artifacts:[{filename,contentHash}], persistedStateHash|"__absent__"}))`
      sorted by filename; exclude metadata
      (Req: persistedStateHash and specFingerprint on FS)

- [x] 8.6 Migrate FS index / helpers off `spec.filenames`
      `packages/core/src/infrastructure/fs/fs-spec-index-cache.ts`,
      `packages/core/src/infrastructure/fs/spec-repository.ts`:
      presence checks / materialization
      Approach: `spec.artifacts.some(a => a.filename === 'spec.md')` (or equivalent)
      (Req: SpecListEntry materialization in index)

- [x] 8.7 Migrate GetSpec / SearchSpecs to `spec.artifacts`
      `packages/core/src/application/use-cases/get-spec.ts`,
      `packages/core/src/application/use-cases/search-specs.ts`
      Approach: iterate `artifacts[].filename`; presence via artifacts list
      (Req: Load all artifact files; Spec.artifacts presence)

- [x] 8.8 Migrate remaining core call sites / test fakes constructing `Spec`
      `packages/core/test/**`, other `new Spec(` / `.filenames` sites under core
      Approach: shared test helper `makeSpec({ artifacts, persistedStateStamp,
    generatedMetadataStamp })`; grep-clean `filenames`/`hasArtifact` in core src+test
      (Req: No derived filename list)

- [x] 8.9 Update code-graph indexer off `repoSpec.filenames`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
      artifact concatenation / presence (~`contentFilenames = repoSpec.filenames`)
      Approach: use `repoSpec.artifacts.map(a => a.filename)` (or iterate entries);
      update `packages/code-graph/test/**` SpecRepository fakes from `specHash` →
      `persistedStateHash` where stubbed
      (Req: Spec resolution via SpecRepository)

- [x] 8.10 Rewrite ValidationResultCache port API
      `packages/core/src/application/ports/validation-result-cache.ts`:
      abstract class + types
      Approach: constructor takes `SpecRepository`; `lookup({spec,schemaFingerprint,
    engineVersion})` → hit|miss; `upsert({entry,spec,schemaFingerprint,engineVersion})`;
      no stamps/fingerprint/`refreshStamps` on wire
      (Req: SpecRepository injected at construction; Method signatures)

- [x] 8.11 Replace flat input fingerprint with `computeCacheFingerprint`
      `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts`:
      remove `computeInputFingerprint`; add `computeCacheFingerprint`
      Approach: `hash(sortedKeyJson({specFingerprint, metadataContentHash|"__absent__"}))`;
      keep schema fingerprint + `VALIDATE_SPECS_ENGINE_VERSION`
      (Req: cacheFingerprint canonical form)

- [x] 8.12 Unit-test cache/schema fingerprint helpers
      `packages/core/test/application/use-cases/_shared/validate-specs-cache-fingerprints.spec.ts`
      Approach: metadata change changes cacheFingerprint only; absent sentinel;
      schema stability unchanged
      (Req: cacheFingerprint canonical form)

- [x] 8.13 Rewrite FsValidationResultCache with injected repo + cascade ownership
      `packages/core/src/infrastructure/fs/fs-validation-result-cache.ts`
      Approach: ctor `{specRepository,configPath}` (+ same metadataPath resolution as
      FsSpecRepository); wire `{entry,stamps,cacheFingerprint}`; hard hit on Spec
      stamps from `get()`; soft hit refreshes stamps internally; miss; fingerprint =
      `specFingerprint(spec)` + hash of raw metadata file bytes read via FS path
      (not `metadata()`, not a new SpecRepository sidecar helper)
      (Req: Lookup cascade owned by the cache; Stored freshness fields;
      cacheFingerprint canonical form)

- [x] 8.14 Re-test FS adapter cascade against temp dirs
      `packages/core/test/infrastructure/fs/fs-validation-result-cache.spec.ts`
      Approach: hard/soft/miss; schema/engine miss; lock-only and metadata-only changes;
      no `refreshStamps` in result type
      (Req: Lookup cascade; Bucket validity inputs)

- [x] 8.15 Simplify ValidateSpecs to hit/miss + entry-centric upsert
      `packages/core/src/application/use-cases/validate-specs.ts`
      Approach: remove stamp/fingerprint precompute and soft-hit refresh; call
      `lookup({spec,schemaFingerprint,engineVersion})` / `upsert({entry,spec,...})`
      (Req: Transparent validation result cache)

- [x] 8.16 Wire composition: caches constructed with SpecRepository
      `packages/core/src/composition/composition-resolver.ts`,
      `packages/core/src/composition/use-cases/validate-specs.ts`
      Approach: per-workspace `new FsValidationResultCache({specRepository,configPath})`;
      deps map only; no host surface
      (Req: SpecRepository injected at construction; Host opacity)

- [x] 8.17 Update ValidateSpecs tests for new protocol
      `packages/core/test/application/use-cases/validate-specs.spec.ts`, helpers
      Approach: in-memory fake with injected repo; assert no refresh flag; upsert args
      entry-centric; hard hit skips parse
      (Req: Transparent validation result cache; Method signatures)

- [x] 8.18 Update FS SpecRepository tests for stamps/hashes/no filenames
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`,
      `packages/core/test/infrastructure/fs/fs-spec-index-cache.spec.ts`
      Approach: assert `artifacts`/`persistedStateStamp`/`generatedMetadataStamp`;
      `persistedStateHash`/`specFingerprint`; keep derived `filenames`/`hasArtifact`
      (Req: Spec stamp population on get; persistedStateHash and specFingerprint)

- [x] 8.19 Docs hygiene for validate-specs bucket + Spec shape notes if needed
      `docs/` fs-cache / storage references
      Approach: document `validate-specs/<workspace>/` and host opacity; no CLI flags
      (Req: Validation result cache bucket layout; Host opacity)

- [x] 8.20 Manual dual-run smoke after redesign
      local `spec validate --all` twice
      Approach: confirm hard-hit path; lock/metadata edits force revalidation; no new
      host cache flags
      (Req: Host opacity)

## 9. Post-verify remediation (audit + verification)

- [x] 9.1 Shared code-graph mock repository with `get()`
      `packages/code-graph/test/helpers/make-mock-spec-repository.ts`:
      `makeMockSpecRepository()` returning list/count/get/stamp APIs
      Approach: centralize mock; `get()` resolves from seeded `Spec[]` by path
      (Req: Spec resolution via SpecRepository; verify failure: workspace-indexing)

- [x] 9.2 Update code-graph indexing tests to use shared mock repository
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`,
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`,
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
      Approach: replace local `makeMockRepo` helpers; add `get()` to inline fakes that
      index specs
      (Scenario: Spec resolution pulls from repository)

- [x] 9.3 Assert composition wires one cache per workspace
      `packages/core/test/composition/use-cases/validate-specs.spec.ts` or
      `packages/core/test/composition/composition-resolver.spec.ts`
      Approach: resolve deps for multi-workspace config; expect cache map keys match
      workspace names
      (Scenario: Composition registers a cache for every configured workspace)

- [x] 9.4 Add engine-version mismatch miss test on FS validate cache
      `packages/core/test/infrastructure/fs/fs-validation-result-cache.spec.ts`
      Approach: upsert with `engineVersion: 1`; lookup with `engineVersion: 2` → miss
      (Req: Bucket validity inputs)

- [x] 9.5 Generalize conventions lazy-loading deltas (domain-agnostic)
      `specd-sdd/changes/.../deltas/default/_global/conventions/spec.md.delta.yaml`,
      `verify.md.delta.yaml`
      Approach: conventions describe list-vs-load pattern only; Spec shape stays in
      `core:spec-repository-port`
      (Req: Lazy loading — metadata before content)

- [x] 9.6 Align GetSpec with contract — iterate `spec.artifacts`
      `packages/core/src/application/use-cases/get-spec.ts`
      Approach: `for (const entry of spec.artifacts)` + `repo.artifact(spec, entry.filename)`
      (Req: Load all artifact files; Scenario: All artifacts loaded successfully)
