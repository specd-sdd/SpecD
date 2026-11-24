# Batch D — schema resolution & change-bound reads (audit 20261019-114015)

(Report is extended spec by spec.)

## core:resolve-change-schema

### Requirements Summary

Input/result contract; sovereign named lookup (provider.get(name) only, no default; composed LazySchemaProvider must not resolve default first for non-default names); identity check -> SchemaProviderIdentityMismatchError; same-name version advisory; failure propagation; shared boundary; composition (createResolveChangeSchema, kernel.changes.resolveSchema).

### Implementation Status

- ✅ Contract / named lookup / identity / advisory: packages/core/src/application/services/resolve-change-schema.ts:62-84 (get(schemaName) only; name check before use; SCHEMA_VERSION_DRIFT advisory from recorded vs resolved).
- ✅ Provider-level independence from default: src/composition/lazy-schema-provider.ts:35-55 (named ref served from cache or `_resolveNamed` without touching `_getDefault`); default consulted only after SchemaNotFoundError and only returned if `defaultSchema.name() === ref` (lines 67-82).
- ✅ Error: errors/schema-provider-identity-mismatch-error.ts extends SpecdError, code SCHEMA_PROVIDER_IDENTITY_MISMATCH, carries both names.
- Not re-audited here (other batches): kernel mount and CLI warning rendering.

### Discrepancies

- LOW (spec-ambiguity, impl defensible): LazySchemaProvider falls back to the default when a _bare name_ is unresolvable AND the default carries that name (needed because recorded change schemaName is a canonical name like `schema-std` while workspace ref is `@specd/schema-std`). Spec says named lookup "MUST NOT first resolve ... the default"; implementation only resolves the default after a not-found, and swallows a broken default (rethrows the original SchemaNotFoundError). Compliant with the letter (never _first_, broken default cannot block a resolvable name). The ResolveChangeSchema use case itself never falls back. Recommend spec wording note ("a bare name that equals the default's canonical name may be served from the default after direct resolution fails") — spec drift, not an implementation bug. Not a blocker.

### Test Coverage

- Matching schema returns schema, no advisory: covered test/application/services/resolve-change-schema.spec.ts:36.
- Different workspace default never consulted: covered :55 (get called once with 'change-schema').
- Named lookup failure does not fall back: covered :78.
- Broken workspace default does not block named lookup: covered at provider level test/composition/lazy-schema-provider.spec.ts "resolves a named lookup without touching a broken default" (execute called once with 'custom', default still rejects). Not tested through ResolveChangeSchema+LazySchemaProvider together (weak-acceptable).
- Wrong canonical name -> typed mismatch: covered :91.
- Identity mismatch checked before use (mutating callers): covered per-caller (run-step-hooks, compile-context, approve-spec, approve-signoff, archive-change :316-333 `list` not called, validate-artifacts, reconcile-change-validity, get-artifact-instruction, preview-spec spec files reference SchemaProviderIdentityMismatchError).
- Same-name version drift warns and continues: covered :128.
- Workspace default version does not create advisory: covered implicitly (:55 default never fetched, warnings []), no dedicated `custom@9` default test (weak, LOW).
- Fallback-to-default-with-matching-name branch: covered lazy-schema-provider.spec.ts "falls back to the default only when it carries the requested bare name".

### Missing Tests

- None blocking.

### Summary

Requirements 7/7 ✅; scenarios 8 (7 covered, 1 weak). Previous-audit finding on LazySchemaProvider default-first resolution: RESOLVED.

## core:generate-metadata

### Requirements Summary

Input incl. optional `schemaName`; schema precedence (explicit schemaName -> lock identity name -> project default only for lock-less, no-name); no fallback on named failure; identity check; provenance/schema identity describes schema actually used; no-extraction short-circuit; lock snapshot single read; etc.

### Implementation Status

- ✅ Precedence: src/application/use-cases/generate-spec-metadata.ts:118-127 (`requested = input.schemaName ?? persistedState?.schema?.name`; `get(requested)` else `get()`); no catch/fallback.
- ✅ Identity mismatch: :125-127 throws SchemaProviderIdentityMismatchError(specId, requested, got, 'spec') (applies to both explicit and lock-name paths).
- ✅ Provenance schema: :133-138 explicit -> `canonicalSpecSchema()`; else persisted lock identity; else default canonical. Matches spec.
- ✅ provenance in metadata (:221-227) and `sourceState` returned for Materialize reuse (:229-241).
- ⚠️ No-extraction case: spec says "returns `{ metadata: {}, hasExtraction: false }` immediately". Implementation (:239) computes full metadata (contentHashes, provenance, dependsOn, implementation) and only sets `hasExtraction: extraction !== undefined`; extractMetadataFromSpecArtifacts handles the undefined branch (\_shared/extract-metadata-from-spec-artifacts.ts:83). Pre-existing behaviour (not in this change's diff). LOW; spec-drift likely (spec text predates provenance requirement; Materialize needs sourceState even without extraction).

### Discrepancies

- LOW: no-extraction wording vs. behaviour (see above). Either update spec to "hasExtraction false and extraction-derived fields absent" or short-circuit; recommend spec update.
- LOW: persisted-lock path uses lock identity (name+version) as provenance schema while the loaded schema may be a different version of same name — consistent with spec ("persisted identity").

### Test Coverage

- Explicit schemaName wins: covered test/application/use-cases/generate-spec-metadata.spec.ts:663 (asserts get('change-schema'), not lock; asserts sourceState.schema.name, not metadata.provenance.schema / canonicalSpecSchema version — weak on provenance equality).
- Unarchived spec in a change uses change schema (no lock): partially — explicit-name test uses a lock-present fixture; no lock-less+schemaName case (weak, LOW; behaviour identical by code path).
- Persisted lock schema used w/o explicit name: covered :676 (asserts name, not full identity {team-std,2}).
- Legacy lock-less uses default `get()`: covered :685.
- Named lookup failure no fallback: covered :694 (lock path only; explicit-name path same code).
- Provider identity mismatch: covered :706 (lock path only; explicit path same line).
- Schema resolution failure propagates: covered via :694.
- Schema has no metadataExtraction -> hasExtraction false: MISSING (no test asserts hasExtraction false anywhere in test/).
- Unknown workspace / spec not found: not found in generate-spec-metadata.spec.ts (pre-existing, not changed behaviour) — LOW.

### Missing Tests

- hasExtraction:false scenario (pre-existing, unchanged behaviour: LOW).
- Explicit-name mismatch and lock-less + schemaName (new behaviour but shares code path with covered tests: LOW).

### Summary

Requirements: new schema-resolution requirement ✅; scenarios 12 (5 covered, 3 weak, 3 missing pre-existing/LOW). Previous-audit schema-precedence finding: RESOLVED.

## core:materialize-spec-metadata

### Requirements Summary

`schemaName` input forwarded unchanged to GenerateSpecMetadata for freshness check (step 4), regeneration and source re-read (step 6); ArchiveChange passes resolved schema name; Materialize never selects a schema itself; GetSpecMetadata forwards schemaName.

### Implementation Status

- ✅ materialize-spec-metadata.ts:71,83 pass input.schemaName to `_tryReusePersisted` (:121-131 forwards to generate for freshness) and generation (:158-172, :206 re-read, :238-243). Conditional spread (no key when undefined).
- ✅ get-spec-metadata.ts:35 forwards schemaName.
- ✅ \_shared/materialize-context-spec-metadata.ts:18-22 forwards schemaName optionally.
- ✅ archive-change.ts:289 resolves change schema through ResolveChangeSchema; :608 passes `schemaName: schema.name()` on force materialization.

### Discrepancies

- None.

### Test Coverage

- Default policy if-needed / result fields: existing tests (:26 etc.).
- schemaName forwarded to generation (force): covered test/.../materialize-spec-metadata.spec.ts:140-179.
- if-needed freshness uses same schema selection (persisted reuse): WEAK — test at :140 uses a repo with no metadata snapshot so `_tryReusePersisted` returns before calling generate; the freshness-path forwarding (:127-131) and "reuse persisted instead of project default" outcome are not asserted. MEDIUM-LOW: new-behaviour scenario lacking direct evidence (code is obviously correct by reading).
- omits schemaName when absent: covered :181.
- GetSpecMetadata forwarding: MISSING — test/application/use-cases/get-spec-metadata.spec.ts has no schemaName case (only asserts the no-schemaName call shape).
- Archive passes schemaName: covered archive-change.spec.ts:1520-1535.
- Source-change abort / conflict / force-failure: pre-existing tests (:75, :100); concurrency retry scenarios not audited here.

### Missing Tests

- MaterializeSpecMetadata if-needed with present snapshot + schemaName (assert generate called with schemaName and result.source 'persisted').
- GetSpecMetadata forwards schemaName.

### Summary

Implementation ✅ complete. Test evidence gaps for two new-behaviour scenarios (if-needed freshness w/ schemaName; GetSpecMetadata forwarding).

## core:compile-context

### Requirements Summary

Sovereign schema resolution via ResolveChangeSchema; mismatch propagates; (design S8-S10) metadata materialization uses the change schema only for specs in the change.

### Implementation Status

- ✅ compile-context.ts:276-280 resolves via ResolveChangeSchema (default constructed from schemaProvider at :254 when not injected).
- ✅ :669-674 `materializeContextSpecMetadata(..., specIdsSet.has(specId) ? schema.name() : undefined)`; specIdsSet = change.specIds (:321). Helper \_shared/materialize-context-spec-metadata.ts:18-22 forwards schemaName to GetSpecMetadata only when defined.
- ⚠️ :667-678 materialization is wrapped in `try { } catch { metadata = null }`, so a SchemaProviderIdentityMismatchError raised during metadata generation for a spec (lock schema or change schema) is swallowed into a missing-metadata fallback rather than propagating. The up-front ResolveChangeSchema mismatch does propagate (spec requirement satisfied). LOW: spec only requires propagation of the change-schema mismatch; swallow matches the documented `missing-metadata` degradation. Spec-drift candidate (clarify).
- Schema advisories (SCHEMA_VERSION_DRIFT) are discarded by CompileContext (`{ schema }` only). Spec for this use case does not require surfacing; resolve-change-schema generic wording "callers that surface diagnostics" — LOW.

### Discrepancies

- MEDIUM-LOW (spec gap, not impl bug): the compile-context spec has no requirement/scenario stating that the change schema is passed to metadata materialization only for specs in `change.specIds` (and not for dependency/out-of-change specs). The behaviour is implemented (S9) but neither specified in compile-context spec text nor tested. Fix: add requirement + scenario, or accept via generate-metadata spec.

### Test Coverage

- Resolves sovereign schema when workspace default differs: covered test/application/use-cases/compile-context.spec.ts:545-560.
- Identity mismatch propagates: covered :563-575.
- Schema not found propagates: :509.
- schemaName forwarding to GetSpecMetadata (in-change vs outside): MISSING (compile-context.spec.ts never asserts GetSpecMetadata input; grep shows no schemaName assertion on getMetadata).

### Missing Tests

- Assert getMetadata.execute called with `{ specId, schemaName }` for a spec in change.specIds and without schemaName for a dependency spec outside the change.

### Summary

Implementation ✅; spec text lacks the S9 requirement; test gap for forwarding.

## core:preview-spec

### Requirements Summary

Sovereign schema via ResolveChangeSchema; mismatch and resolution failure propagate (no partial result); default irrelevant.

### Implementation Status

- ✅ preview-spec.ts:108-112 resolves via ResolveChangeSchema before any try/catch; SpecNotInChange check follows (:114). Warnings from content-level failures remain strings (:122); SCHEMA_VERSION_DRIFT advisories not in PreviewSpecResult (CLI spec-preview resolves via kernel.changes.resolveSchema per resolve-change-schema spec).

### Discrepancies

- None (HIGH/MEDIUM).

### Test Coverage

- Resolves sovereign schema when default differs: covered test/application/use-cases/preview-spec.spec.ts:141.
- Identity mismatch propagates, no partial result: covered :162-181.
- Schema resolution failure propagates: MISSING (no SchemaNotFoundError test in preview-spec.spec.ts) — LOW, behaviour trivial (resolve outside any catch).
- Factory scenario: pre-existing.

### Summary

✅ Implementation; one low-risk missing test.

## core:get-artifact-instruction

### Implementation Status

- ✅ get-artifact-instruction.ts:94 resolves through ResolveChangeSchema (default-constructed at :81 from schemaProvider).

### Discrepancies

- None.

### Test Coverage

- Resolves sovereign schema when default differs: covered test/application/use-cases/get-artifact-instruction.spec.ts:173.
- Identity mismatch propagates: covered :195.
- Schema not found: :154.

### Summary

✅ complete.

## core:get-hook-instructions

### Requirements Summary

Sovereign schema via ResolveChangeSchema (active and archive-fallback paths); identity mismatch propagates; hooks of disabled steps NOT returned (either phase).

### Implementation Status

- ✅ get-hook-instructions.ts:103 resolve for active and archived (schemaName/schemaVersion taken from archived at :83-84); :108-111 StepNotValidError; :114-116 returns `{ phase, instructions: [] }` when step null or `!isWorkflowStepEnabled` — before the `--only` check (:123+), so `--only` on a disabled step yields empty rather than HookNotFoundError. Consistent with run-step-hooks behaviour.

### Discrepancies

- LOW (spec-ambiguity): spec scenario says empty for disabled step in "either phase"; `--only` interaction is not stated for GetHookInstructions (it is for RunStepHooks). Implementation returns empty; recommend spec note.

### Test Coverage

- Resolves sovereign schema when default differs: covered test/application/use-cases/get-hook-instructions.spec.ts:199 (active + archived).
- Disabled step returns no instructions (pre / post): covered :240 and :262.
- Disabled step with `--only`: MISSING (no test).
- Identity mismatch propagates: MISSING — spec scenario "Identity mismatch propagates" has no test in get-hook-instructions.spec.ts (no SchemaProviderIdentityMismatchError reference). Spec scenario without evidence.

### Missing Tests

- Mismatch propagation (active and archive-fallback paths); disabled step + `only`.

### Summary

Implementation ✅; 1 spec scenario without test (mismatch), 1 behaviour untested (--only).

## core:run-step-hooks

### Requirements Summary

Sovereign schema via ResolveChangeSchema (active and archive fallback); general failure vs mismatch propagate; disabled step => `{ hooks: [], success: true, failedHooks: [] }` for either phase and with `--only`.

### Implementation Status

- ✅ run-step-hooks.ts:167-171 resolve (active), :120-124 (archive fallback); :178-182 disabled guard returns `{ hooks: [], success: true, failedHooks: [], warnings: [] }` before --only handling; same guard in archive path :131-133.
- Note: the returned object also includes `warnings: []`; spec text lists `{ hooks: [], success: true, failedHooks: [] }` — extra field is the existing result shape (LOW, no issue).

### Discrepancies

- None HIGH/MEDIUM.

### Test Coverage

- Resolves schema by change.schemaName: covered test/application/use-cases/run-step-hooks.spec.ts:91.
- Identity mismatch propagates: covered :107 (active path).
- Schema not found: :79.
- Disabled step pre/post: covered :364-395 (`it.each`), commands not run.
- Disabled step with --only: covered :401.
- Archive-fallback path with sovereign schema/mismatch/disabled: not directly covered (LOW).

### Summary

✅ complete; strongest coverage of the batch.

## Cross-cutting / project-wide checks

- error-handling-conventions: SchemaProviderIdentityMismatchError extends SpecdError, has code and structured fields (changeName, expectedSchemaName, actualSchemaName) — compliant.
- architecture: ResolveChangeSchema depends only on ports/domain; LazySchemaProvider is in composition and uses ResolveSchema use case — compliant.
- Focused vitest run of all 10 test files for this batch: PASS (196) FAIL (0).
- Previous audit findings (LazySchemaProvider default-first, metadata schema precedence, schemaName forwarding): RESOLVED in code. Remaining issues are test gaps and spec-text gaps only.

## Totals

HIGH: 0. MEDIUM: 3 (all test/spec-evidence, no code defect): (1) get-hook-instructions "Identity mismatch propagates" scenario has no test; (2) GetSpecMetadata schemaName forwarding and MaterializeSpecMetadata if-needed freshness-with-schemaName path have no direct test; (3) CompileContext schema-forwarding-only-for-in-change-specs is neither specified in compile-context spec nor tested. LOW: ~8 (see per-spec).

BATCH VERDICT: FAIL
