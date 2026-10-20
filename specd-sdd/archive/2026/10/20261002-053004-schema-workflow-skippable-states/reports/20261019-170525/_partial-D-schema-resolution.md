# Batch D — schema resolution & change-bound reads (audit 20261019-170525, post task-group 47)

Basis: attempt-14 partial (reports/20261019-114015/\_partial-D-schema-resolution.md) re-verified against current tree. Source files unchanged in behaviour since attempt 14 (code line refs below re-confirmed); task group 47 added tests/spec text only. Focused vitest run (10 files: resolve-change-schema, lazy-schema-provider, generate-spec-metadata, materialize-spec-metadata, get-spec-metadata, compile-context, preview-spec, get-artifact-instruction, get-hook-instructions, run-step-hooks): 202 passed, 0 failed.

## Confirmation of the 3 attempt-14 MEDIUM findings

1. get-hook-instructions identity mismatch + `--only` on disabled step: RESOLVED.
   - Mismatch: test/application/use-cases/get-hook-instructions.spec.ts:~318-332 `fails closed on a provider identity mismatch instead of using the default schema` (provider returns 'other-schema' for 'custom-schema' -> rejects SchemaProviderIdentityMismatchError). Code: get-hook-instructions.ts:103 (ResolveChangeSchema).
   - `--only` on disabled step: spec file :263 `does not let --only surface an instruction of a disabled step` (instructions == []). Code: get-hook-instructions.ts:114-116 guard precedes `only` handling. Post phase also covered (:293).
2. Materialize if-needed reuse with persisted snapshot + GetSpecMetadata forwarding: RESOLVED.
   - materialize-spec-metadata.spec.ts:207 `reuses fresh persisted metadata for if-needed when generation uses the same schemaName` (generate called with schemaName custom-workflow, reuse outcome) and :239 `regenerates when the persisted metadata was produced under a different schema`. Code: materialize-spec-metadata.ts:71,121-131.
   - get-spec-metadata.spec.ts:26 `forwards schemaName to MaterializeSpecMetadata only when provided` (present vs absent). Code: get-spec-metadata.ts:35.
3. compile-context "schemaName only for change specs": RESOLVED (spec + test).
   - Spec: core:compile-context now has requirement "Change schema applies to change specs only" with scenarios "Metadata for a change spec is materialized with the change schema" and "Metadata for a spec outside the change omits schemaName" (merged preview).
   - Test: compile-context.spec.ts:563 `passes schemaName for change specs and omits it for specs outside the change` (asserts :616 schemaName 'custom-workflow' for login inputs, :617 no `schemaName` property for others). Code: compile-context.ts:673 `specIdsSet.has(specId) ? schema.name() : undefined`, helper \_shared/materialize-context-spec-metadata.ts:18-22. Spec text and code agree.

## Per spec

### core:resolve-change-schema

- Implementation: ✅ services/resolve-change-schema.ts:62-84 (named get only, identity check, SCHEMA_VERSION_DRIFT advisory); ✅ composition/lazy-schema-provider.ts:35-82 (named lookup never touches default first; default only after not-found and only if bare name equals default's name); ✅ composition/use-cases/resolve-change-schema.ts.
- Discrepancies: LOW (spec wording) — LazySchemaProvider bare-name fallback to a name-matching default is not described in spec ("MUST NOT first resolve default" is honoured). Recommend a one-line spec note. Alternative reading: spec forbids any default involvement; impl is defensible because canonical name `schema-std` vs ref `@specd/schema-std`.
- Tests: all scenarios covered (resolve-change-schema.spec.ts :36,:55,:78,:91,:128; lazy-schema-provider.spec.ts broken-default + fallback cases). Weak/LOW: no dedicated "workspace default custom@9 no advisory" test (covered implicitly by :55, warnings []). Not new behaviour risk: advisory derives only from change recorded vs resolved schema.
- Counts: 7/7 requirements ✅; 8 scenarios (7 covered, 1 weak-LOW).

### core:generate-metadata

- Implementation: ✅ precedence generate-spec-metadata.ts:118-127; ✅ identity check :125-127; ✅ provenance schema :133-138; ✅ sourceState :229-241. ⚠️ no-extraction case computes full metadata (:239) instead of immediate `{metadata:{}, hasExtraction:false}`.
- Discrepancies: LOW — no-extraction short-circuit: pre-existing, unchanged by this change; spec predates provenance/sourceState needs. Interpretation A (spec right): short-circuit. Interpretation B (code right): Materialize needs sourceState; update spec. Not new/changed behaviour -> stays LOW.
- Tests: explicit schemaName :663, lock identity :676, legacy default :685, no-fallback :694, mismatch :706 covered; hasExtraction false MISSING (pre-existing, LOW); lock-less + schemaName weak (shares code path).
- Counts: reqs ✅ (1 LOW ⚠️); scenarios ~12 (5 covered, 3 weak, 3 missing pre-existing/LOW).

### core:materialize-spec-metadata

- Implementation: ✅ materialize-spec-metadata.ts:71,83,121-131,158-172,206,238-243; ✅ get-spec-metadata.ts:35; ✅ archive-change.ts:289,608.
- Discrepancies: none.
- Tests: forwarding force/if-needed :140; omit :181; reuse w/ persisted :207; different-schema regen :239; GetSpecMetadata forwarding get-spec-metadata.spec.ts:26; archive passes schemaName archive-change.spec.ts:1520-1535. All covered.
- Counts: complete.

### core:compile-context

- Implementation: ✅ resolve compile-context.ts:276-280; ✅ change-specs-only schemaName :673; ⚠️ :667-678 try/catch swallows errors (incl. identity mismatch raised for a spec's lock schema) into missing-metadata degrade.
- Discrepancies: LOW — swallow of per-spec metadata errors. Pre-existing degrade policy; change-schema mismatch cannot be swallowed (already thrown up-front at :276). Not elevated to MEDIUM: no new behaviour (new schemaName path re-uses the identity already validated). Spec drift: clarify. LOW — advisories discarded (spec doesn't require surfacing).
- Tests: sovereign schema :545; mismatch propagates :563-575 region; not-found :509; change-spec-only forwarding :563 (new). Covered. Swallow-on-mismatch untested (LOW).
- Counts: reqs ✅ incl. new requirement; scenarios all covered.

### core:preview-spec

- Implementation: ✅ preview-spec.ts:108-112 (resolve before any catch; propagates).
- Discrepancies: none HIGH/MEDIUM.
- Tests: sovereign :141; mismatch no partial result :162-181 covered; SchemaNotFound/resolution-failure propagation test MISSING (LOW — resolution is outside any try/catch, same ResolveChangeSchema path as mismatch test; not new logic beyond the shared call).
- Counts: ✅.

### core:get-artifact-instruction

- Implementation: ✅ get-artifact-instruction.ts:81,94.
- Tests: sovereign :173, mismatch :195, not found :154 all covered.
- Counts: ✅ complete.

### core:get-hook-instructions

- Implementation: ✅ get-hook-instructions.ts:103-116 (active + archive fallback, disabled guard before `only`).
- Discrepancies: LOW — spec silent on `--only` for disabled step; impl returns empty (consistent with run-step-hooks) and now tested. Recommend a spec note.
- Tests: sovereign (active+archived) :199; disabled pre :240, --only :263, post :293; mismatch ~:318 (active path). Archive-fallback mismatch not separately asserted (LOW; same line 103 for both paths).
- Counts: ✅; previous MEDIUM resolved.

### core:run-step-hooks

- Implementation: ✅ run-step-hooks.ts:120-124,131-133,167-171,178-182.
- Discrepancies: none (extra `warnings: []` is existing result shape).
- Tests: :91 sovereign, :107 mismatch, :79 not found, :364-395 disabled, :401 disabled+only covered. Archive-fallback path not directly tested (LOW; archive-fallback tests remain an open LOW).
- Counts: ✅.

## Remaining LOW items — severity decision

None promoted to MEDIUM: GenerateSpecMetadata no-extraction (pre-existing, unchanged); CompileContext metadata-error swallow (pre-existing degrade policy, new schemaName path pre-validated); PreviewSpec resolution-failure test (shared call, mismatch variant tested); archive-fallback path tests (identical resolver call, active paths tested; sovereign archived path tested for get-hook-instructions); custom@9 default advisory test (implicit coverage). Optional spec-text tidy-ups: lazy-provider bare-name fallback; get-hook-instructions `--only` on disabled step; generate-metadata no-extraction wording.

## New findings

None.

## Totals

HIGH 0; MEDIUM 0; LOW ~7 (all pre-existing/test-or-spec-wording). Scenarios with no test evidence for new/changed behaviour: 0.

BATCH VERDICT: PASS
