# Partial: change-specs

Audit mode: `--change validate-specs-result-cache` (read-only).
Scope: `core:validation-result-cache-port`, `core:storage` (cache deltas + sibling rules), `core:validate-specs` (transparent cache + DI), plus `default:_global/architecture` and `default:_global/testing` for new wiring.
Method: `changes spec-preview`, graph search/impact, and direct reads of known implementation/test files. No code or spec files modified.

---

## Spec: core:validation-result-cache-port

### Requirements Summary

| #   | Requirement                            | Intent                                                                            |
| --- | -------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Abstract port shape                    | `abstract class ValidationResultCache` in `application/ports/`                    |
| 2   | Workspace-scoped instances             | One instance per workspace; multi-workspace isolation                             |
| 3   | Cached entry payload                   | `spec`, `passed`, `failures`, `warnings`; persist pass and fail                   |
| 4   | Bucket validity inputs                 | `schemaFingerprint`, `engineVersion`, `isInvalidated` → miss when invalid         |
| 5   | Per-spec freshness inputs              | `sourceStamps` + `inputFingerprint` (artifacts, metadata, lock; explicit absence) |
| 6   | Lookup cascade contract                | bucket → stamps hard hit → fingerprint soft hit → miss+upsert                     |
| 7   | Upsert after validation                | After full validation, upsert entry + stamps + fingerprint                        |
| 8   | Host opacity                           | CLI/MCP/plugins must not depend on or expose the port                             |
| 9   | No side-channel through SpecRepository | Persistence via port only; list-index separate                                    |

### Implementation Status

| #   | Status          | Evidence                                                                                                                                                                                                                                                                               |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **implemented** | `packages/core/src/application/ports/validation-result-cache.ts` — `export abstract class ValidationResultCache` with `workspace` / `lookup` / `upsert`. Concrete behaviour in `FsValidationResultCache`.                                                                              |
| 2   | **implemented** | `CompositionResolver.getValidationResultCaches()` builds `Map<workspace, FsValidationResultCache>`; each constructor binds `options.workspace` and bucket path `…/validate-specs/<workspace>/`.                                                                                        |
| 3   | **implemented** | `ValidationCacheEntry` carries all four fields; upsert wire line stores full `entry`; `_toCacheEntry` / `_fromCacheEntry` preserve failures and warnings.                                                                                                                              |
| 4   | **implemented** | `FsValidationResultCache.lookup` misses when `meta.isInvalidated` or schema/engine mismatch; missing/corrupt meta defaults to invalidated.                                                                                                                                             |
| 5   | **implemented** | Stamps via `collectValidationSourceStamps` / `SpecRepository.validationSourceStamps` (`mtime: null` = absence). Fingerprints via `computeInputFingerprint` with `__absent__` sentinel for missing artifacts/sidecars including `spec-lock.json`.                                       |
| 6   | **implemented** | Cascade split correctly: use case first lookup with `currentInputFingerprint: ''` for hard-hit without fingerprint I/O; on miss, compute fingerprint and re-lookup; soft hit (`refreshStamps: true`) upserts stamps only (same fingerprint + entry); otherwise full validate + upsert. |
| 7   | **implemented** | Miss path in `_validateSpecWithCache` upserts after `_validateSpec`.                                                                                                                                                                                                                   |
| 8   | **implemented** | No CLI/MCP/plugin references to `ValidationResultCache` / validate-cache flags (graph + ripgrep). Composition wires cache inside `resolveValidateSpecsDeps` only.                                                                                                                      |
| 9   | **implemented** | Persistence lives in `FsValidationResultCache`, not `FsSpecRepository`. SpecRepository only supplies stamp/sidecar reads for freshness inputs. `FsSpecIndexCache` remains under `specs/<workspace>/`.                                                                                  |

### Discrepancies

1. **Curated `@specd/core/ports` barrel omits the new port**
   - **Observation:** `ValidationResultCache` (+ related types) are exported from `application/ports/index.ts` but **not** from curated `packages/core/src/ports.ts` (`@specd/core/ports`). Architecture global requires port contracts on that barrel.
   - **Possibility A (code wrong):** Missing re-export from `ports.ts` / SDK ports re-export.
   - **Possibility B (spec silent):** Change specs do not explicitly require public-barrel export; only architecture global does. Still an architecture conformance gap for this change.

2. **Use case can skip the cache when the map is empty**
   - **Observation:** `ValidateSpecs` defaults `validationResultCaches` to `new Map()` and bypasses lookup/upsert when workspace key is absent.
   - **Possibility A (code wrong / partial):** Spec says ValidateSpecs MUST consult the port; empty-map bypass weakens that for non-composition construction.
   - **Possibility B (spec OK):** Composition always populates the map; empty default is test/backward-compat convenience and hosts never see it.

3. **SpecRepository gained cache-oriented helpers**
   - **Observation:** `validationSourceStamps` and `readValidationSidecar` live on `SpecRepository` (defaults + Fs override).
   - **Possibility A (design tension):** Couples SpecRepository API to validation-cache freshness concerns (borderline vs “no side-channel”).
   - **Possibility B (compliant):** Port only persists outcomes; SpecRepository remains the owner of artifact/sidecar I/O. Persistence still goes exclusively through `ValidationResultCache`.

4. **Soft-hit stamp refresh is use-case-driven, not adapter-auto**
   - Adapter returns `refreshStamps: true`; use case performs upsert. Matches “ValidateSpecs (or a helper it owns) MUST drive freshness.” **Not a defect.**

### Test Coverage

| Scenario                                           | Coverage                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Port cannot be instantiated directly               | Implicit (abstract class); no explicit negative compile/runtime test — acceptable for TS abstract.                                |
| Multi-workspace distinct instances                 | Composition builds per-workspace map; **no test** asserting write isolation across workspaces.                                    |
| Failed validation persisted with failures/warnings | **Missing** dedicated persistence round-trip test (adapter or use case).                                                          |
| Schema fingerprint mismatch → miss                 | Covered in `fs-validation-result-cache.spec.ts`.                                                                                  |
| Engine version mismatch → miss                     | Covered in same file.                                                                                                             |
| `isInvalidated` → miss                             | Implemented; **no dedicated test**.                                                                                               |
| Source stamps cover artifacts + metadata + lock    | `collectValidationSourceStamps` encodes absence; FsSpecRepository builds candidate list. Partial unit coverage via stamps helper. |
| Absent sidecars explicit                           | Fingerprint unit test + stamps helper test.                                                                                       |
| Hard hit (no fingerprint recompute)                | Use-case: `skips full validation on cache hard hit` (parseCount=0). Adapter: hard hit with empty fingerprint.                     |
| Soft hit refreshes stamps only                     | Adapter returns `refreshStamps: true` and manual refresh path tested. **Use-case soft-hit path not tested.**                      |
| Fingerprint miss → full validation upsert          | **Missing** use-case test.                                                                                                        |
| Miss path upserts before aggregate return          | **Missing** explicit use-case assertion on `upserts` including failures.                                                          |
| Host APIs no cache controls                        | Covered by absence of host surface (no automated host assertion).                                                                 |
| SpecRepository list cache separate                 | Structural (different bucket owner); no regression test that `list`/`count` never touch `validate-specs/`.                        |

### Missing Tests

1. Use-case soft hit: stamps changed, fingerprint same → entry returned, stamps upserted, no parse/rules.
2. Use-case miss → full validation → upsert with failures **and** warnings.
3. Multi-workspace isolation: upsert in `core` does not appear in `cli` bucket.
4. Adapter: persist/retrieve failed entry with non-empty `failures`/`warnings`.
5. Adapter: `isInvalidated: true` meta forces miss.
6. Adapter: stamp+fingerprint both differ → miss (explicit).
7. Optional: SpecRepository list/count does not read/write `validate-specs/<ws>/`.

### Summary

- requirements checked: 9
- implemented: 9
- discrepancies: 3 (1 architecture barrel gap; 1 optional empty-map bypass; 1 SpecRepository helper coupling — design note)
- missing tests: 7

---

## Spec: core:storage (cache-related deltas + layout sibling rules)

### Requirements Summary

Pre-existing storage requirements (change naming, archive pattern, locks, staged archive, etc.) are **pre-existing; covered by suite; not re-audited in depth** unless they interact with the new validate-specs bucket.

**In-scope new / amended requirements:**

| #   | Requirement                           | Intent                                                                                                                                              |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Filesystem list index cache layout    | `fs-cache/` includes sibling `validate-specs/<workspace>/`; list/count buckets unchanged; SpecRepository helpers must not own validate-specs bucket |
| S2  | Validation result cache bucket layout | Path, extended meta (`schemaFingerprint`, `engineVersion`), JSONL `{ entry, sourceFiles?, inputFingerprint }`, no host reindex surface              |
| S3  | configPath tmp gitignore              | Runtime ensures `tmp/.gitignore` (`*` / `!.gitignore`) so fs-cache stays ignored                                                                    |

### Implementation Status

| #   | Status                          | Evidence                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **implemented**                 | Layout documents `validate-specs/<workspace>/` as sibling. `FsValidationResultCache` owns that path. `FsSpecIndexCache` remains under `specs/<workspace>/`. No `validate-specs` writes from SpecRepository list helpers (source search).                                                        |
| S2  | **implemented**                 | Bucket under `{configPath}/tmp/fs-cache/validate-specs/<ws>/` with `.specd-index-meta.json` + `.specd-index.jsonl`. Meta extends shared fields with schema/engine. Wire lines include `entry`, `sourceFiles`, `inputFingerprint`. CLI `storage reindex` unchanged (no validate-cache-only arg). |
| S3  | **implemented** (shared helper) | `FsValidationResultCache.upsert` → `ensureTmpGitignore(configPath)`. Same helper used by other FS repos.                                                                                                                                                                                        |

### Discrepancies

1. **No regression test that SpecRepository list/count never mutates validate-specs**
   - Spec scenario “Validate-specs bucket is sibling not owned by SpecRepository helpers” is structurally true but untested.
   - **Possibility A (code OK, tests gap).**
   - **Possibility B (latent risk):** future SpecRepository changes could accidentally share index helpers — tests would not catch.

2. **tmp gitignore not asserted in validate-cache adapter tests**
   - Upsert calls `ensureTmpGitignore`, but `fs-validation-result-cache.spec.ts` does not assert `.gitignore` contents after upsert.
   - Pre-existing `ensureTmpGitignore` coverage may exist elsewhere; not re-verified here as a regression from this change.

### Test Coverage

| Scenario                                                                        | Coverage                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| List indexes under fs-cache buckets (incl. not requiring validate-specs writes) | Pre-existing list-index suite; not re-audited. New sibling rule: structural only.                |
| Validate-specs bucket path + extended meta                                      | `stores rows under validate-specs workspace bucket with extended meta`                           |
| Rows carry entry/stamps/fingerprint incl. lock absence                          | Hard-hit test includes null mtimes for metadata/lock; fingerprint unit tests cover lock content. |
| Hosts gain no validate-cache reindex surface                                    | CLI reindex unchanged (manual/static check).                                                     |
| Runtime tmp gitignore via validate-cache writes                                 | Implemented; **missing adapter assertion**.                                                      |

### Missing Tests

1. After `FsValidationResultCache.upsert`, `{configPath}/tmp/.gitignore` exists with normative contents.
2. Explicit “SpecRepository list/count does not create `validate-specs/`” regression.
3. JSONL row shape assertion that `sourceFiles` includes participating artifacts + both sidecars (beyond stamps helper).

### Summary

- requirements checked: 3 (cache-related); remaining storage requirements: pre-existing; not re-audited in depth
- implemented: 3
- discrepancies: 2 (test/documentation gaps, not behavioural breaks found)
- missing tests: 3

---

## Spec: core:validate-specs (Transparent validation result cache + related DI)

### Requirements Summary

Pre-existing validate-specs requirements (schema resolve, modes, per-artifact/cross-artifact/metadata validation, aggregation, parsers) are **pre-existing; covered by suite; not re-audited in depth**. Cache introduction does not appear to alter their control flow except on hit paths (skip full work) — regression risk noted under Test Coverage.

**In-scope new / amended requirements:**

| #   | Requirement                                         | Intent                                                                                                                                 |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Transparent validation result cache                 | Consult port; cascade; hit skips full work; miss validates + upserts; fingerprint inputs (schema/engine/input incl. lock); host-opaque |
| V2  | Config-based factory via `resolveValidateSpecsDeps` | Deps include `validationResultCaches`; no inline fs cache path wiring in factory                                                       |

### Implementation Status

| #   | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | **implemented** (test gaps) | `_validateSpecWithCache` implements cascade + upsert. `computeSchemaFingerprintFromSchema` covers schema identity, spec-scoped validations, spec-scoped cross rules, `declaresDependsOnExtraction`. `VALIDATE_SPECS_ENGINE_VERSION = 1`. Input fingerprint includes artifacts + metadata + lock. Public `ValidateSpecsResult` unchanged on hit/miss. |
| V2  | **implemented**             | `ValidateSpecsDeps.validationResultCaches`; `resolveValidateSpecsDeps` → `resolver.getValidationResultCaches()`; config factory delegates through resolver; Fs paths only inside composition resolver.                                                                                                                                               |

### Discrepancies

1. **`verify.md` factory scenario incomplete vs `spec.md`**
   - Transparent-cache verify scenario requires `validationResultCaches` in deps.
   - Older “Config-based factory delegates through resolveValidateSpecsDeps” scenario still lists deps **without** `validationResultCaches`.
   - **Possibility A (spec/verify wrong):** verify not fully updated for the factory requirement.
   - **Possibility B (intentional):** factory scenario remains historical and transparent-cache scenario is normative — still a verify inconsistency.

2. **Soft-hit / miss-upsert use-case behaviour under-tested**
   - Implementation present; only hard-hit + deps resolution are tested at use-case level.
   - **Possibility A (code OK, tests incomplete).**
   - **Possibility B (latent code wrong):** soft-hit upsert could accidentally rewrite fingerprint/entry; current code reuses same fingerprint/entry but lacks a guardrail test.

3. **Cache hit skips metadata consistency checks**
   - Required by transparent-cache spec (“without re-running … metadata consistency checks”). Compliant.
   - Regression risk: stale cache if stamp/fingerprint inputs omit a future input that metadata checks depend on. Current inputs include metadata + lock contents — aligned with spec.

### Test Coverage

| Scenario                                                     | Coverage                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Hard hit skips full validation                               | **Yes** — parse spy count 0.                                                                                                   |
| Soft hit refreshes stamps, skips revalidation                | **Missing** at use-case level (adapter-only).                                                                                  |
| Miss runs full validation and upserts incl. failures         | **Missing**.                                                                                                                   |
| Input fingerprint includes spec-lock                         | Unit: `changes input fingerprint when spec-lock content changes`.                                                              |
| Hosts observe identical public behaviour                     | Structural (same result type); no host integration assertion.                                                                  |
| `resolveValidateSpecsDeps` includes `validationResultCaches` | **Yes**.                                                                                                                       |
| Pre-existing modes/artifact/cross/metadata scenarios         | Pre-existing suite present; not re-audited in depth. Cache hit path could mask failures if seed wrong — only hard-hit covered. |

### Missing Tests

1. Soft hit end-to-end through `ValidateSpecs` (refresh upsert + no parse).
2. Miss path upsert payload includes failures and warnings.
3. Schema/engine bucket invalidation through use case (not only adapter).
4. Two workspaces with caches — validate all-workspaces mode uses distinct instances.
5. Optional: config `createValidateSpecs(config)` smoke that second run hard-hits against real `FsValidationResultCache` (integration).

### Summary

- requirements checked: 2 new (+ pre-existing summarized)
- implemented: 2
- discrepancies: 2 (verify incompleteness; under-tested soft/miss paths)
- missing tests: 5

---

## Spec: default:\_global/architecture (new port/adapter/use-case wiring)

### Requirements Summary

Relevant globals: application uses ports only; ports as abstract classes; composition-only infrastructure imports; curated public barrels; manual DI; hosts do not construct adapters.

### Implementation Status

| Check                                          | Status                | Notes                                                                    |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| Port in `application/ports/` as abstract class | **implemented**       |                                                                          |
| Adapter in `infrastructure/fs/`                | **implemented**       | `FsValidationResultCache`                                                |
| Use case depends on port, not adapter          | **implemented**       | `validate-specs.ts` imports port only                                    |
| Composition wires adapter                      | **implemented**       | `composition-resolver.ts` imports Fs adapter; `resolveValidateSpecsDeps` |
| Fingerprint helpers stay application-layer     | **implemented**       | `_shared/validate-specs-cache-fingerprints.ts` (pure + hasher port)      |
| Concrete adapter not on public `"."` barrel    | **implemented**       | `FsValidationResultCache` only referenced from composition               |
| Port on curated `./ports` barrel               | **missing / partial** | Not in `packages/core/src/ports.ts`                                      |
| Config factory through shared resolver         | **implemented**       | Matches composition rules                                                |

### Discrepancies

1. **Missing curated ports export** (same as port-spec discrepancy #1) — architecture constraint violated unless intentional omission pending a follow-up.
2. No other hexagonal boundary break found for this change.

### Test Coverage

Architecture itself is structural; covered indirectly by composition deps test and layer placement. No dedicated “ports barrel exports ValidationResultCache” test.

### Missing Tests

1. Assert `@specd/core/ports` (or `ports.ts`) exports `ValidationResultCache` once fixed — or document intentional exclusion.

### Summary

- requirements checked: 8 wiring checks
- implemented: 7
- discrepancies: 1
- missing tests: 1

---

## Spec: default:\_global/testing (new port/adapter/use-case wiring)

### Requirements Summary

Unit tests mock ports (no FS) for application; integration tests for FS adapters against tmp dirs; Vitest; mirrored `test/` layout; typed full port mocks.

### Implementation Status

| Check                                   | Status           | Notes                                                                                                                                                    |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use-case unit tests with in-memory port | **partial**      | `InMemoryValidationResultCache` fully implements port; hard-hit covered; soft/miss gaps                                                                  |
| Fingerprint pure-function unit tests    | **implemented**  | `validate-specs-cache-fingerprints.spec.ts`                                                                                                              |
| FS adapter integration tests (tmpdir)   | **implemented**  | `fs-validation-result-cache.spec.ts` with cleanup                                                                                                        |
| Test paths mirror src                   | **implemented**  |                                                                                                                                                          |
| Typed full port mock                    | **implemented**  | In-memory class extends abstract port                                                                                                                    |
| Composition deps test touches FS        | **mild tension** | `resolveValidateSpecsDeps` test uses real tmp + `createCompositionResolver` inside use-case spec file — closer to composition integration than pure unit |

### Discrepancies

1. Application-layer cache scenarios incomplete relative to “every use case … has at least one unit test” for new behaviours (soft hit, miss upsert). Not a runner/layout violation.
2. Composition FS bootstrap test living under `test/application/use-cases/` is acceptable but slightly blurs unit vs integration boundary.

### Test Coverage / Missing Tests

See validate-specs and validation-result-cache-port sections — same soft-hit/miss/isolation gaps.

### Summary

- requirements checked: 6
- implemented: 5 (1 partial)
- discrepancies: 2
- missing tests: (counted under change specs; +0 unique beyond those)

---

## Cross-cutting findings

### What looks solid

- Hexagonal split (port / Fs adapter / composition / use case) matches the intended design.
- Lookup cascade correctly avoids fingerprint I/O on hard hit via empty-fingerprint first pass.
- Bucket layout and extended meta match storage deltas.
- Host opacity appears intact (no validate-cache CLI/MCP surface).
- Schema + input fingerprint helpers cover lock sidecar and absent sentinels.

### Highest-risk gaps

1. Use-case soft-hit and miss+failure upsert paths are implemented but largely untested.
2. New port absent from curated `@specd/core/ports` barrel (architecture).
3. Multi-workspace cache isolation untested.
4. `verify.md` factory scenario still omits `validationResultCaches`.

### Aggregate counts (new cache scope only)

| Spec                              | reqs checked | implemented | discrepancies | missing tests |
| --------------------------------- | -----------: | ----------: | ------------: | ------------: |
| core:validation-result-cache-port |            9 |           9 |             3 |             7 |
| core:storage (cache deltas)       |            3 |           3 |             2 |             3 |
| core:validate-specs (cache+DI)    |            2 |           2 |             2 |             5 |
| default:\_global/architecture     |            8 |           7 |             1 |             1 |
| default:\_global/testing          |            6 |           5 |             2 |           0\* |
| **Total (unique emphasis)**       |       **28** |      **26** |        **10** |        **16** |

\*Testing missing cases are the same behavioural gaps already listed under change specs.

Pre-existing validate-specs/storage requirements: summarized as pre-existing; covered by suite; not re-audited in depth. No concrete behavioural regression found in pre-existing paths beyond the usual cache-hit “skip work” risk, which is specified behaviour.
