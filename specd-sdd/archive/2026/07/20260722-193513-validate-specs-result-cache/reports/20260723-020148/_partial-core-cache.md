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

## Batch Summary

| Spec                              | Compliant | Partial | Non-compliant |
| --------------------------------- | --------- | ------- | ------------- |
| core:validate-specs               | 1         | 0       | 0             |
| core:validation-result-cache-port | 1         | 0       | 0             |
| core:storage (cache)              | 1         | 0       | 0             |
| **Total**                         | **3**     | **0**   | **0**         |
