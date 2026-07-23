# Spec compliance audit (partial): core cache scope

- **Change:** `validate-specs-result-cache`
- **Auditor mode:** read-only (no code/spec mutations)
- **Report:** `_partial-core-cache.md`
- **Specs audited:** `core:validate-specs`, `core:storage`, `core:validation-result-cache-port`
- **Also checked:** `default:_global/architecture` (ports/adapters + composition-resolver), graph-first navigation
- **Graph freshness at audit:** fresh (`stale: false`)

---

## Spec: core:validate-specs

### Requirements Summary

| #   | Requirement                                                       | Focus                                             |
| --- | ----------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Resolve the active schema                                         | `SchemaProvider.get()`; errors propagate          |
| 2   | Filter to spec-scoped artifact types                              | `scope === 'spec'` only                           |
| 3   | Single spec validation mode                                       | `specPath` → parse → get → validate one           |
| 4   | Workspace validation mode                                         | `workspace` → `list()` → validate each            |
| 5   | All-workspaces validation mode                                    | iterate all repos                                 |
| 6   | Per-spec artifact validation                                      | missing/optional/rules/parse/`evaluateRules`      |
| 7   | Per-spec cross-artifact validation                                | reuse ValidateArtifacts machinery; defer warnings |
| 8   | Aggregated result                                                 | entries + counts                                  |
| 9   | Format inference and parser resolution                            | `inferFormat`; missing parser → skip              |
| 10  | Canonical metadata consistency validation                         | stale hashes / dependsOn / extraction             |
| 11  | Transparent validation result cache **(NEW)**                     | lookup cascade, fingerprints, host opacity        |
| 12  | Config-based factory via `resolveValidateSpecsDeps` **(UPDATED)** | includes `validationResultCaches`                 |

### Implementation Status (per requirement)

| Req                         | Status                       | Evidence                                                                 |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1 Resolve schema            | **implemented**              | `ValidateSpecs.execute` → `this._schemaProvider.get()`                   |
| 2 Filter spec-scoped        | **implemented**              | `schema.artifacts().filter(a => a.scope === 'spec')`                     |
| 3 Single-spec mode          | **implemented**              | `input.specPath` branch + `WorkspaceNotFoundError` / `SpecNotFoundError` |
| 4 Workspace mode            | **implemented**              | `input.workspace` → `list` + per-spec validate                           |
| 5 All-workspaces            | **implemented**              | else-branch iterates `_specs`                                            |
| 6 Per-spec artifacts        | **implemented**              | `_validateSpec` missing/optional/parse/rules path                        |
| 7 Cross-artifact            | **implemented**              | `evaluateCrossArtifactRule` + deferred warnings                          |
| 8 Aggregated result         | **implemented**              | `totalSpecs` / `passed` / `failed`                                       |
| 9 Format inference          | **implemented**              | `inferFormat` + silent skip when no parser                               |
| 10 Metadata consistency     | **implemented**              | `_validateMetadataConsistency` + extraction                              |
| 11 Transparent cache        | **implemented** (with notes) | `_validateSpecWithCache`, two-phase lookup, upsert on miss/soft-hit      |
| 12 resolveValidateSpecsDeps | **implemented**              | composition factory + resolver `getValidationResultCaches()`             |

Fingerprint helpers: `VALIDATE_SPECS_ENGINE_VERSION`, `computeSchemaFingerprintFromSchema`, `computeInputFingerprint` in `_shared/validate-specs-cache-fingerprints.ts`.

### Discrepancies (code vs spec)

1. **Optional cache map (MEDIUM)**
   - **Spec:** `ValidateSpecs` MUST consult a `ValidationResultCache` for the target workspace before full validation.
   - **Code:** If `validationResultCaches.get(workspace)` is `undefined`, cache is skipped (`_validateSpecWithCache` early return). Constructor defaults to `new Map()`.
   - **Interpretation A:** Production composition always wires one cache per workspace → compliant in the config/kernel path.
   - **Interpretation B:** Use-case contract is soft; direct `new ValidateSpecs(...)` without caches bypasses the MUST.
   - **Judgment:** Real contract gap on the use case; mitigated by composition. Not HIGH because public config factory always resolves caches.

2. **Schema fingerprint surface (LOW / residual risk)**
   - **Spec:** fingerprint covers schema identity + scope:`spec` artifact validations + scope:`spec` cross-rules + `metadataExtraction.dependsOn` declaration.
   - **Code:** projects `{ id, validations }` per artifact (not `optional` / `format` / `output`).
   - **Interpretation A (literal):** “artifact validations” = validation rule arrays → compliant.
   - **Interpretation B (broader “validation surface”):** flipping `optional` without changing rules could hard-hit a stale pass/fail.
   - **Judgment:** Matches written wording and design tasks; residual behavioral risk only.

3. **Host opacity** — **no discrepancy**  
   CLI validate surfaces have no cache flags; `ValidateSpecsInput`/`Result` unchanged; only consumer of the port in application code is `ValidateSpecs`.

### Test Coverage

- Pre-existing modes/rules/metadata scenarios covered in `packages/core/test/application/use-cases/validate-specs.spec.ts`.
- Cache: hard hit (skips parse), soft hit (skips parse + refreshes stamps), miss upserts failures/warnings.
- `resolveValidateSpecsDeps includes validationResultCaches`.
- Fingerprint unit tests: stability, cross-rule sensitivity, `__absent__`, spec-lock changes (`validate-specs-cache-fingerprints.spec.ts`).

### Missing Tests

- End-to-end use-case test that lock-only content change forces miss (helper-level covered; use-case path not).
- Explicit assertion that public `ValidateSpecsInput`/`execute` accepts no cache options (host opacity) — currently by construction only.
- Test that missing workspace cache entry still validates (documents optional-cache behaviour) or, conversely, that composition always supplies every workspace.

### Summary counts: requirements 12, implemented 12, discrepancies 2, missing tests 3

---

## Spec: core:storage

### Requirements Summary

Pre-existing storage surface (17) plus change-touched (3):

1. Change directory naming
2. Change directory listing order
3. Artifact status derivation
4. Artifact dependency cascade
5. ValidateArtifacts is the sole path to complete
6. Archive pattern configuration
7. Scope excluded from archive pattern
8. Workspace excluded from archive pattern
9. Archive index
10. Archive runtime ignore hygiene
11. Named storage factories
12. Archive pattern date variables are zero-padded
13. Change manifest format
14. Repository path confinement
15. Staged archive persistence
16. Storage debug logging
17. Change locks directory placement
18. **Filesystem list index cache layout (UPDATED)** — sibling `validate-specs/<workspace>/` owned by ValidationResultCache adapter, not SpecRepository helpers
19. **Validation result cache bucket layout (NEW)** — meta extensions + JSONL row shape + no host reindex surface
20. **configPath tmp gitignore** — `*` / `!.gitignore` when tmp first used

### Implementation Status (per requirement)

| Req                      | Status                                                  | Notes                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–17 (pre-existing)      | **implemented** (spot-check / unchanged by this change) | No evidence this change regresses naming, archive index, locks, etc. Deep re-audit of archive/change paths was out of delta focus.                                                             |
| 18 List index layout     | **implemented**                                         | `FsValidationResultCache` owns `tmp/fs-cache/validate-specs/<ws>/`; `FsSpecRepository` list helpers do not reference that path (only `validate-specs` string in fs tree is the cache adapter). |
| 19 Validate-cache bucket | **implemented**                                         | Bucket path, `.specd-index.jsonl` / `.specd-index-meta.json`, meta extends with `schemaFingerprint` + `engineVersion`, rows `{ entry, sourceFiles, inputFingerprint }`.                        |
| 20 tmp gitignore         | **implemented** (partial test gap)                      | `upsert` → `ensureTmpGitignore(configPath)`.                                                                                                                                                   |

CLI `storage reindex` options remain `--changes` / `--specs` / `--archive` only; docs explicitly state validate-specs buckets are adapter-owned and not a reindex surface.

### Discrepancies (code vs spec)

1. **tmp gitignore exercised by validate-cache adapter but not asserted in its tests (LOW — coverage, not behavioural)**
   - **Spec:** runtime must ensure `{configPath}/tmp/.gitignore` when tmp is first used.
   - **Code:** `FsValidationResultCache._ensureTmpGitignore` calls shared helper on upsert.
   - **Interpretation A:** behaviour present → requirement implemented.
   - **Interpretation B:** verify scenario for this adapter path is untested → compliance risk if helper wiring regresses.

2. **No HIGH layout/ownership discrepancies found.** SpecRepository imports `collectValidationSourceStamps` (read-only stamp helper) from the cache module; it does not read/write validate-specs JSONL/meta. Aligns with “MAY expose read-only helpers… persistence MUST still go through ValidationResultCache only.”

### Test Coverage

- `fs-validation-result-cache.spec.ts`: bucket path + extended meta, hard/soft/miss, invalidation, failed entry round-trip, multi-workspace isolation, absent sidecar stamps via `collectValidationSourceStamps`.
- tmp gitignore covered for other fs adapters (e.g. archive), not for validate-cache upsert path.
- Host reindex: no validate-cache option in CLI command registration.

### Missing Tests

- `FsValidationResultCache` upsert creates/updates `{configPath}/tmp/.gitignore` with normative contents.
- Explicit test that `FsSpecRepository.list`/`count`/`reindex` do not create or mutate `validate-specs/<workspace>/` (currently code-inspection only).
- Dedicated assertion that `storage reindex --help` / option set excludes validate-cache (CLI-level; docs already state host opacity).

### Summary counts: requirements 20, implemented 20, discrepancies 1, missing tests 3

_(Discrepancy counted as coverage/process risk on req 20, not a behavioural miss.)_

---

## Spec: core:validation-result-cache-port

### Requirements Summary

| #   | Requirement                                                                  |
| --- | ---------------------------------------------------------------------------- |
| 1   | Abstract port shape (`application/ports/`, abstract class)                   |
| 2   | Workspace-scoped instances                                                   |
| 3   | Cached entry payload (full pass/fail + failures/warnings)                    |
| 4   | Bucket validity inputs (schemaFingerprint, engineVersion, isInvalidated)     |
| 5   | Per-spec freshness inputs (sourceStamps + inputFingerprint; lock + metadata) |
| 6   | Lookup cascade contract (bucket → hard → soft → miss)                        |
| 7   | Upsert after validation                                                      |
| 8   | Host opacity                                                                 |
| 9   | No side-channel through SpecRepository                                       |

Constraints: export from `@specd/core/ports`; adapters = runtime state; port methods must not evaluate schema rules.

### Implementation Status (per requirement)

| Req                              | Status                                            | Evidence                                                                                                                                |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Abstract port                  | **implemented**                                   | `ValidationResultCache` abstract class; exported from `ports.ts` + ports index; `FsValidationResultCache` not on public `.` / `./ports` |
| 2 Workspace-scoped               | **implemented**                                   | `workspace()`; composition builds one `FsValidationResultCache` per config workspace                                                    |
| 3 Cached entry payload           | **implemented**                                   | `ValidationCacheEntry`; failed round-trip test                                                                                          |
| 4 Bucket validity                | **implemented**                                   | meta compare + `isInvalidated` → miss                                                                                                   |
| 5 Freshness inputs               | **implemented**                                   | stamps via SpecRepository helpers + `collectValidationSourceStamps`; fingerprint includes sidecars                                      |
| 6 Lookup cascade                 | **implemented** (split across adapter + use case) | adapter cascade + use-case two-phase lookup + soft-hit upsert                                                                           |
| 7 Upsert after validation        | **implemented**                                   | miss path upserts full entry                                                                                                            |
| 8 Host opacity                   | **implemented**                                   | no CLI/MCP cache flags found; only ValidateSpecs consumes port                                                                          |
| 9 No SpecRepository side-channel | **implemented**                                   | stamp/sidecar helpers read-only; no validate-specs writes in SpecRepository                                                             |

Architecture conformance: port in `application/ports/`; use case depends on port only; `FsValidationResultCache` constructed only in `composition/composition-resolver.ts` (`getValidationResultCaches`). Matches hexagonal + composition-resolver patterns.

### Discrepancies (code vs spec)

1. **Soft-hit stamp persistence ownership (MEDIUM — verify wording vs type design)**
   - **Spec (verify):** WHEN a lookup runs on soft-hit THEN stored stamps are updated.
   - **Code:** `lookup` returns `{ kind:'hit', refreshStamps:true }` and does **not** write; `ValidateSpecs` (and adapter unit test) call `upsert` afterward.
   - **Interpretation A (strict verify):** adapter `lookup` itself must persist refreshed stamps → **partial**.
   - **Interpretation B (`refreshStamps` flag + design tasks):** cascade driver owns refresh upsert → **implemented**, and ValidateSpecs soft-hit path does refresh.
   - **Judgment:** Prefer B given explicit `refreshStamps` in the port result type; still a documentation/verify ambiguity. End-to-end ValidateSpecs behaviour matches soft-hit requirement in `core:validate-specs`.

2. **No side-channel** — **no discrepancy** (inspection).

### Test Coverage

- Port behaviour via `FsValidationResultCache` integration tests (hard/soft/schema/engine/invalidated/isolation/failed payload/absent stamps).
- Use-case soft-hit + miss+failures with in-memory fake.
- Workspace isolation under one `configPath`.
- Missing: compile-time “cannot instantiate abstract class” (TypeScript-enforced; no runtime test — acceptable).
- Missing: dedicated SpecRepository “does not write validate-specs rows” test.

### Missing Tests

- Adapter or port-level test that soft-hit refresh leaves `inputFingerprint` and entry byte-identical while only stamps/`generatedAt` change (partially covered by use-case soft-hit).
- SpecRepository isolation test against validate-specs bucket.
- Host-opacity automated check (CLI option inventory).

### Summary counts: requirements 9, implemented 9, discrepancies 1, missing tests 3

---

## Architecture / composition notes (cross-cutting)

- **Ports & adapters:** Compliant. Application use case never imports `FsValidationResultCache`.
- **Composition resolver:** `resolveValidateSpecsDeps` → `resolver.getValidationResultCaches()`; factory does not inline FS validate-cache paths.
- **Curated barrels:** Port + types on `@specd/core/ports`; concrete adapter kept off public barrels.
- **Host opacity:** CLI storage reindex description lists changes/specs/archive only; docs call out validate-specs buckets as opaque runtime cache.

---

## Overall Summary

| Spec                              | Requirements | Implemented | Discrepancies | Missing tests |
| --------------------------------- | -----------: | ----------: | ------------: | ------------: |
| core:validate-specs               |           12 |          12 |             2 |             3 |
| core:storage                      |           20 |          20 |             1 |             3 |
| core:validation-result-cache-port |            9 |           9 |             1 |             3 |
| **TOTAL**                         |       **41** |      **41** |         **4** |         **9** |

### Verdict

**PASS WITH FINDINGS** (no HIGH-severity behavioural breaks against the written change requirements).

New cache behaviour is present end-to-end: port + FS bucket layout + ValidateSpecs cascade + composition wiring + host opacity. Remaining issues are MEDIUM/LOW contract ambiguities and test gaps.

### HIGH severity discrepancies

**None.**

### MEDIUM severity discrepancies

1. `ValidateSpecs` silently skips caching when no port is registered for a workspace (default empty map), despite MUST-consult wording.
2. Soft-hit stamp refresh is performed by caller upsert (`refreshStamps`), not inside `lookup` — conflicts with a literal reading of the port verify scenario (end-to-end ValidateSpecs path still refreshes).

### LOW

1. Schema fingerprint omits non-validation artifact fields (`optional`/`format`/`output`) — literal-compliant, residual stale-hit risk.
2. Validate-cache adapter tmp-gitignore behaviour untested at the adapter suite.
