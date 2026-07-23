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

## Batch Summary

| Spec                      | Compliant | Partial | Non-compliant |
| ------------------------- | --------- | ------- | ------------- |
| core:spec-repository-port | 0         | 1       | 0             |
| core:fs-spec-repository   | 0         | 1       | 0             |
| core:get-spec             | 0         | 1       | 0             |
| core:search-specs         | 1         | 0       | 0             |
| core:spec-lock            | 1         | 0       | 0             |
| core:spec-metadata        | 1         | 0       | 0             |
| **Total**                 | **3**     | **3**   | **0**         |
