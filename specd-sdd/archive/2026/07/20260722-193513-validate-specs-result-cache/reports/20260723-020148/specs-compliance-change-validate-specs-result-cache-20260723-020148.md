# Spec Compliance Audit — Change `validate-specs-result-cache`

**Mode:** Specific Change (read-only)  
**Change:** validate-specs-result-cache  
**State:** verifying  
**Report generated:** 20260723-020148  
**Graph status:** fresh (indexed 2026-07-22T23:47:47Z, ref 90e4f6d7)  
**Report directory:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260722-193513-validate-specs-result-cache/reports/20260723-020148`

---

## Executive Summary

| Metric                    | Count |
| ------------------------- | ----- |
| Specs audited             | 11    |
| Compliant                 | 6     |
| Partial                   | 4     |
| Non-compliant             | 1     |
| Cross-spec contradictions | 1     |

### Overall Assessment

The **ValidateSpecs result cache** feature is well-implemented and tested in `@specd/core`. Port shape, filesystem adapter, composition wiring, and use-case integration match their specs. Core tests pass (2216/2216).

The change is **blocked from full compliance** by:

1. **5 failing code-graph tests** — mock `SpecRepository` lacks `get()` after `IndexCodeGraph` started calling it during spec discovery.
2. **Internal spec contradiction** — `default:_global/conventions` forbids `Spec.filenames` while `core:spec-repository-port` requires it; code follows the latter.
3. **Test coverage gaps** for new stamp/fingerprint APIs on `FsSpecRepository.get()` and `specFingerprint()`.

---

## Top 5 Actionable Issues

| #   | Severity     | Issue                                                                                                                                                  | Recommended Fix                                                                                                                     |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Critical** | `workspace-indexing.spec.ts` — 5 tests fail: `ws.specRepo.get is not a function`                                                                       | Add `get()` to `makeMockRepo()` returning Spec entities with `artifacts` stamps matching listed specs                               |
| 2   | **High**     | Cross-spec contradiction: conventions forbids `Spec.filenames`, spec-repository-port requires it                                                       | Reconcile deltas before archive; update conventions to permit derived helper OR remove filenames and migrate GetSpec/IndexCodeGraph |
| 3   | **Medium**   | Missing FsSpecRepository tests for get() stamp population and specFingerprint canonical form                                                           | Add verify scenarios to `spec-repository.spec.ts` for sidecar stamps and fingerprint payload                                        |
| 4   | **Medium**   | `GetSpec` iterates `spec.filenames` not `spec.artifacts` per delta text                                                                                | Change loop to `spec.artifacts` or amend get-spec delta to allow derived helper                                                     |
| 5   | **Low**      | `code-graph:workspace-integration` spec lists `persistedStateHash()` for freshness but indexer uses content-hash comparison; `get()` step undocumented | Update workspace-integration delta to document get()+content-hash approach or align implementation to spec                          |

---

## Spec Scope

| Spec ID                           | Role in Change                     |
| --------------------------------- | ---------------------------------- |
| core:validate-specs               | Primary — transparent result cache |
| core:validation-result-cache-port | New port                           |
| core:storage                      | validate-specs bucket layout       |
| core:spec-repository-port         | Spec stamps, specFingerprint       |
| core:fs-spec-repository           | FS adapter stamp population        |
| core:get-spec                     | Artifact loading via get()         |
| core:search-specs                 | No-op delta                        |
| core:spec-lock                    | Sidecar hash semantics             |
| core:spec-metadata                | generatedMetadataStamp             |
| code-graph:workspace-integration  | Indexer uses get()                 |
| default:\_global/conventions      | Lazy-loading pattern               |

Project-wide specs (`default:_global/architecture`, `default:_global/testing`, etc.) reviewed for consistency; no architecture violations found in cache wiring.

---

## Per-Spec Results

| Spec                              | Status           | Key Finding                                                      |
| --------------------------------- | ---------------- | ---------------------------------------------------------------- |
| core:validate-specs               | ✅ Compliant     | Cache hit/miss/soft-hit fully implemented and tested             |
| core:validation-result-cache-port | ✅ Compliant     | Port + FsValidationResultCache match cascade spec                |
| core:storage                      | ✅ Compliant     | Bucket layout under fs-cache/validate-specs/ correct             |
| core:search-specs                 | ✅ Compliant     | No-op delta; no gaps                                             |
| core:spec-lock                    | ✅ Compliant     | Sidecar exclusion and persistedStateHash tested                  |
| core:spec-metadata                | ✅ Compliant     | generatedMetadataStamp on Spec entity                            |
| core:spec-repository-port         | ⚠️ Partial       | Implemented; stamp/fingerprint verify tests missing              |
| core:fs-spec-repository           | ⚠️ Partial       | \_buildSpec stamps correct; dedicated verify tests missing       |
| core:get-spec                     | ⚠️ Partial       | Uses filenames not artifacts iteration                           |
| default:\_global/conventions      | ⚠️ Partial       | Contradicts spec-repository-port on filenames                    |
| code-graph:workspace-integration  | ❌ Non-compliant | 5 test failures; get() not in mock; spec/impl freshness mismatch |

---

## Test Run Evidence

| Package             | Result                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| `@specd/core`       | ✅ 164 files, 2216 tests passed                                                     |
| `@specd/code-graph` | ❌ 5 failures in `workspace-indexing.spec.ts` (`ws.specRepo.get is not a function`) |

---

## Detailed Findings

<!-- PARTIAL REPORTS BELOW — verbatim per skill requirement -->

---

# Partial Audit: Core Cache Specs

**Batch:** core:validate-specs, core:storage (cache sections), core:validation-result-cache-port  
**Auditor:** specd-compliance subagent  
**Date:** 20260723-020148

---

## core:validate-specs

**Status:** COMPLIANT

### Requirements Summary

| Requirement                                       | Status | Evidence                                                                                                        |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Transparent validation result cache               | ✅     | `ValidateSpecs._validateSpecWithCache()` calls `cache.lookup` before full validation and `cache.upsert` on miss |
| Schema/engine fingerprint inputs                  | ✅     | `computeSchemaFingerprintFromSchema()` + `VALIDATE_SPECS_ENGINE_VERSION` in `execute()`                         |
| Host opacity                                      | ✅     | Cache wired only via composition; no CLI flags                                                                  |
| Config factory delegates resolveValidateSpecsDeps | ✅     | `composition/use-cases/validate-specs.ts` resolves `validationResultCaches`                                     |
| Does not precompute stamps/fingerprints           | ✅     | Lookup/upsert pass only `spec`, `schemaFingerprint`, `engineVersion`                                            |

### Implementation

- `packages/core/src/application/use-cases/validate-specs.ts` — cache integration at lines 213–261
- `packages/core/src/composition/composition-resolver.ts:675` — `getValidationResultCaches()` wires `FsValidationResultCache` per workspace
- `packages/core/src/application/use-cases/_shared/validate-specs-cache-fingerprints.ts` — fingerprint helpers

### Test Coverage

| Scenario                                    | Covered                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Cache hard hit skips validation             | ✅ `validate-specs.spec.ts` "skips full validation on cache hard hit"     |
| Cache soft hit without ValidateSpecs upsert | ✅ "skips full validation on cache soft hit without ValidateSpecs upsert" |
| Cache miss upserts failures and warnings    | ✅ "upserts failures and warnings on cache miss"                          |
| Schema fingerprint computation              | ✅ `validate-specs-cache-fingerprints.spec.ts`                            |

### Discrepancies

None material.

---

## core:validation-result-cache-port

**Status:** COMPLIANT

### Requirements Summary

| Requirement                                 | Status | Evidence                                                                 |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Abstract class in application/ports         | ✅     | `validation-result-cache.ts:23`                                          |
| SpecRepository injected at construction     | ✅     | Protected constructor + `FsValidationResultCacheOptions.specRepository`  |
| Lookup cascade (hard/soft hit)              | ✅     | `FsValidationResultCache.lookup()` lines 88–120                          |
| cacheFingerprint canonical form             | ✅     | `_computeCacheFingerprint()` uses `specFingerprint` + raw metadata bytes |
| Soft-hit stamp refresh invisible to callers | ✅     | Returns `{ kind: 'hit', entry }` after `_refreshStamps`                  |
| Exported from ports barrel                  | ✅     | `packages/core/src/ports.ts:65`                                          |
| Not in SpecRepository list cache            | ✅     | Separate bucket under `validate-specs/<workspace>/`                      |

### Test Coverage

| Scenario                                         | Covered                                 |
| ------------------------------------------------ | --------------------------------------- |
| Bucket layout with extended meta                 | ✅ `fs-validation-result-cache.spec.ts` |
| Hard hit when stamps match                       | ✅                                      |
| Soft hit when fingerprint matches, stamps differ | ✅                                      |
| Miss on schema fingerprint mismatch              | ✅                                      |
| Failed entries round-trip                        | ✅                                      |

### Discrepancies

None material.

---

## core:storage (validate-specs cache sections)

**Status:** COMPLIANT

### Requirements Summary

| Requirement                                          | Status | Evidence                                                                                                                          |
| ---------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| fs-cache layout includes validate-specs/<workspace>/ | ✅     | `FsValidationResultCache` bucket path                                                                                             |
| Validation result cache bucket layout                | ✅     | `.specd-index-meta.json` extends meta with `schemaFingerprint`, `engineVersion`; JSONL wire `{ entry, stamps, cacheFingerprint }` |
| FsSpecRepository does not own validate-specs bucket  | ✅     | Separate `FsValidationResultCache` class                                                                                          |
| No host-specific reindex surface for validate bucket | ✅     | No CLI changes found for validate-cache-specific reindex                                                                          |
| configPath tmp gitignore                             | ✅     | `ensureTmpGitignore()` called from cache adapter                                                                                  |

### Test Coverage

Bucket meta and wire shape covered by `fs-validation-result-cache.spec.ts`.

### Discrepancies

None material.

---

## Batch Summary (Core Cache)

| Spec                              | Compliant | Partial | Non-compliant |
| --------------------------------- | --------- | ------- | ------------- |
| core:validate-specs               | 1         | 0       | 0             |
| core:validation-result-cache-port | 1         | 0       | 0             |
| core:storage (cache)              | 1         | 0       | 0             |
| **Total**                         | **3**     | **0**   | **0**         |

---

# Partial Audit: Core Repository Specs

**Batch:** core:spec-repository-port, core:fs-spec-repository, core:get-spec, core:search-specs, core:spec-lock, core:spec-metadata  
**Auditor:** specd-compliance subagent  
**Date:** 20260723-020148

---

## core:spec-repository-port

**Status:** PARTIAL

### Requirements Summary

| Requirement                                  | Status | Evidence                                                                        |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| get() returns Spec with artifact stamps      | ✅     | `FsSpecRepository._buildSpec()` populates `SpecArtifactEntry[]`, sidecar stamps |
| persistedStateStamp / generatedMetadataStamp | ✅     | `_statSidecar()` for lock and metadata paths                                    |
| persistedStateHash renamed from specHash     | ✅     | `persistedStateHash()` at spec-repository.ts:627                                |
| specFingerprint canonical JSON               | ✅     | `specFingerprint()` at spec-repository.ts:639                                   |
| Derived filenames/hasArtifact helpers        | ✅     | `Spec.filenames` / `Spec.hasArtifact()` in spec.ts                              |
| spec-lock.json excluded from artifacts       | ✅     | Tests in spec-repository.spec.ts                                                |

### Test Coverage Gaps

| Scenario (from verify)                                                    | Covered                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| get populates artifact stamps without content reads                       | ❌ No dedicated test asserting stat-only reads     |
| persistedStateStamp present when lock exists                              | ❌ Not explicitly tested on FsSpecRepository.get() |
| generatedMetadataStamp on get()                                           | ❌ Not explicitly tested                           |
| specFingerprint canonical payload (sorted artifacts, **absent** sentinel) | ❌ No direct FsSpecRepository integration test     |

### Discrepancies

**Possible spec drift vs conventions:** `core:spec-repository-port` requires derived `filenames` helper; `default:_global/conventions` delta forbids it. Code follows spec-repository-port.

---

## core:fs-spec-repository

**Status:** PARTIAL

### Requirements Summary

| Requirement                                  | Status | Evidence                                      |
| -------------------------------------------- | ------ | --------------------------------------------- |
| get() populates stamps without content reads | ✅     | `_buildSpec()` uses `fs.stat` only            |
| Does not own validate-specs bucket           | ✅     | No validate-specs paths in spec-repository.ts |
| FsSpecIndexCache delegation                  | ✅     | Existing list/count/reindex via index helper  |
| persistedStateHash / specFingerprint         | ✅     | Implemented on FsSpecRepository               |

### Test Coverage Gaps

Verify scenarios for "Spec stamp population on get" (artifact stamps, sidecar stamps, no content reads) lack dedicated FsSpecRepository tests. Existing `get()` tests cover prefix stripping and readOnly access only.

### Discrepancies

None between code and this spec; test coverage is the gap.

---

## core:get-spec

**Status:** PARTIAL

### Requirements Summary

| Requirement                       | Status | Evidence                                        |
| --------------------------------- | ------ | ----------------------------------------------- |
| Uses repo.get() for metadata      | ✅     | get-spec.ts:53                                  |
| Loads artifacts on demand         | ✅     | Loop + `repo.artifact()`                        |
| Iterates spec.artifacts per delta | ⚠️     | Code iterates `spec.filenames` (get-spec.ts:59) |

### Discrepancies

**Implementation vs spec text:** Delta requires iterating `spec.artifacts` and loading via `entry.filename`. Implementation uses derived `spec.filenames`. Functionally equivalent today but diverges from spec wording. Either update spec to allow derived helper or change loop to `for (const entry of spec.artifacts)`.

Tests use `makeSpec({ filenames: [...] })` — they do not assert artifacts-entry iteration.

---

## core:search-specs

**Status:** COMPLIANT

Delta is no-op ("call sites migrate to Spec.artifacts"). Search use case delegates to repository list/search without loading artifact content. No change-specific gaps found.

---

## core:spec-lock

**Status:** COMPLIANT

Sidecar exclusion, persistedStateHash, semantic API separation covered by existing tests in `spec-repository.spec.ts` (artifact rejects spec-lock.json, readPersistedDependsOn reads sidecar, persistedStateHash tests).

---

## core:spec-metadata

**Status:** COMPLIANT

`Spec.generatedMetadataStamp` populated via `_buildSpec()`. Metadata read/write/staleness flows unchanged and tested. Stamp is presence-only on Spec entity as required.

---

## Batch Summary (Core Repository)

| Spec                      | Compliant | Partial | Non-compliant |
| ------------------------- | --------- | ------- | ------------- |
| core:spec-repository-port | 0         | 1       | 0             |
| core:fs-spec-repository   | 0         | 1       | 0             |
| core:get-spec             | 0         | 1       | 0             |
| core:search-specs         | 1         | 0       | 0             |
| core:spec-lock            | 1         | 0       | 0             |
| core:spec-metadata        | 1         | 0       | 0             |
| **Total**                 | **3**     | **3**   | **0**         |

---

# Partial Audit: Code-Graph & Global Conventions

**Batch:** code-graph:workspace-integration, default:\_global/conventions  
**Auditor:** specd-compliance subagent  
**Date:** 20260723-020148

---

## code-graph:workspace-integration

**Status:** NON-COMPLIANT

### Requirements Summary

| Requirement                            | Status | Evidence                                                                           |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Spec resolution via SpecRepository     | ⚠️     | Uses list() + get() + artifact/metadata APIs                                       |
| Enumerate via repo.list()              | ✅     | index-code-graph.ts:958                                                            |
| Freshness via persistedStateHash()     | ❌     | Never called in indexer; uses content hash from concatenated artifacts (line 1033) |
| Artifact filenames from spec.artifacts | ⚠️     | Uses `repoSpec.filenames` (derived from artifacts)                                 |
| Load metadata/dependsOn/implementation | ✅     | metadata(), readPersistedDependsOn(), readPersistedImplementation()                |

### Known Failure (User-Reported)

**5 tests fail** in `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`:

```
ws.specRepo.get is not a function
```

**Root cause:** `IndexCodeGraph` now calls `ws.specRepo.get(SpecPath.parse(entry.path))` after listing specs (index-code-graph.ts:961), but `makeMockRepo()` in workspace-indexing.spec.ts only stubs `list`, `count`, `metadata`, `artifact`, `persistedStateHash` — no `get()` implementation.

**Affected scenarios:**

- indexes multiple workspaces with package identities
- assigns specs to the correct workspace and specId
- two workspaces with same spec name produce unique specIds
- prefers optimizedDescription when indexing specs
- computes contentHash from content artifacts excluding sidecars with spec.md first

### Implementation vs Spec Text

The change delta for "Spec resolution via SpecRepository" lists step 2 as `repo.persistedStateHash()` for freshness. The indexer instead:

1. Calls `get()` to materialize `Spec` entities (not listed in spec steps)
2. Compares `computeContentHash(content)` from concatenated artifact bytes against stored `SpecNode.contentHash`

**Assessment:** Could be spec drift (content-hash approach predates/is more accurate) or incomplete spec update. The `get()` addition is necessary for stamp-aware consumers but broke tests and wasn't reflected in verify scenarios.

### Test Coverage

Integration tests exist but 5/12 workspace-indexing tests currently fail. Passing tests do not exercise the new `get()` code path.

---

## default:\_global/conventions

**Status:** PARTIAL

### Requirements Summary

| Requirement                                | Status | Evidence                                    |
| ------------------------------------------ | ------ | ------------------------------------------- |
| Lazy loading — list returns metadata only  | ✅     | SpecRepository.list() returns SpecListEntry |
| get() returns stamps without content       | ✅     | FsSpecRepository.\_buildSpec()              |
| Spec MUST NOT carry derived filenames list | ❌     | Contradicts core:spec-repository-port delta |

### Cross-Spec Consistency Issue

**Within this change, two specs contradict:**

| Spec                                  | Statement                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `default:_global/conventions` (delta) | "`Spec` MUST NOT carry a derived `filenames` list"                           |
| `core:spec-repository-port` (delta)   | "`Spec` MUST expose derived `filenames` and `hasArtifact(filename)` helpers" |

**Code follows** `core:spec-repository-port`: `Spec.filenames` getter exists in `packages/core/src/domain/entities/spec.ts:74`.

**Consumers using filenames:** `GetSpec`, `IndexCodeGraph` (content artifact selection).

**Resolution needed:** Reconcile conventions delta with spec-repository-port before archive — either restore filenames as permitted derived helper in conventions or remove filenames from Spec and update all call sites.

### Test Coverage

Conventions are enforced via ESLint/TypeScript project-wide; no change-specific verify scenarios. Lazy-loading pattern partially tested via repository and validate-specs tests.

---

## Batch Summary (Code-Graph & Conventions)

| Spec                             | Compliant | Partial | Non-compliant |
| -------------------------------- | --------- | ------- | ------------- |
| code-graph:workspace-integration | 0         | 0       | 1             |
| default:\_global/conventions     | 0         | 1       | 0             |
| **Total**                        | **0**     | **1**   | **1**         |

---

## Audit Metadata

- **Graph commands used:** `graph stats`, `graph search`, `graph impact`
- **CLI commands used:** `changes status`, `changes spec-preview`, `project context`, `config show`
- **Code modified:** None (read-only audit)
- **Partial reports preserved:** `_partial-core-cache.md`, `_partial-core-repository.md`, `_partial-code-graph-conventions.md`
