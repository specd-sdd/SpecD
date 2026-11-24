# Specs compliance — change `schema-workflow-skippable-states`

Delegated audit under verification-attempt-14 (full mode). Overall verdict: **FAIL** (all six batches FAIL; no HIGH implementation defects; two MEDIUM code bugs, remainder are test/spec-text gaps).

## Executive summary

### Code defects (MEDIUM)

1. `core:invalidate-change` — `invalidationNextAction` (`invalidate-change.ts:183-199`) hard-codes `/specd-verify` for any non-`designing` recovery; wrong when verifying is disabled. Test at `invalidate-change.spec.ts:435` locks it in. Fix: reuse `evaluateLifecycle` as `committedRecoveryError` does.
2. `core:edit-change` — `_executeScopeEdit` calls `reconcile.mutate({ name })` without the resolved actor, so identity is resolved twice (breaks "same decorated identity"). Fix: pass `actor` into `mutate`.

### Skill/spec text (MEDIUM)

3. `skills:workflow-automation` — `specd-verify/SKILL.md.tpl` :82-84 and :361-363 still state a fixed `implementing → verifying → done → archivable` chain.
4. `core:compile-context` — requirement "schemaName only for specs in `change.specIds`" is implemented (`compile-context.ts:669-674`) but absent from the spec.

### Test-evidence gaps (new behaviour without a test)

- B: layered schema-owned override (merge then build); composition forwarding of `allowSchemaEmbedding`; plugin `step-skip` default binding failing a shortcut end to end.
- A: "Shortcut stops at first non-optional step"; predicate-level `approval.signoff` `not-required`; single end-to-end disabled-verifying flow.
- C: blocked-`done` via `evaluateLifecycle` with real reconciler; noncanonical `workflow[]` row order.
- D: get-hook-instructions identity mismatch and `--only` on disabled step; materialize `if-needed` reuse path + `GetSpecMetadata` schemaName forwarding; compile-context in-change vs out-of-change `getMetadata` input.
- E: discriminating archive test asserting `schemaName: 'custom-workflow'` is passed to materialize; edit-change actor call count.
- F: status CLI tests for canonical order / omitted disabled steps.

### Spec wording (LOW)

- `cli:change-validate` scenario says `error:` but exit 3 prints `fatal:` (code matches `cli:entrypoint`).
- LazySchemaProvider fallback-to-default-by-bare-name wording.

### Previously failing items (attempt-12): all resolved in code.

---

# Detailed findings

## Batch A-topology-model

# Batch A: topology & model (core:workflow-model, core:workflow-topology, schema-std:standard-schema, core:change, core:change-manifest, core:fs-change-repository)

Focused test run (all PASS, 274 tests): workflow-topology, fs change-repository, reconcile-change-validity, archive-change, approve-signoff, schema-std-load, resolve-change-schema.

## 1. core:workflow-topology

Requirements Summary: six pure exported functions; canonical ordered pipeline; connectivity by construction; dynamic legal transitions; bypass detection; drain-safe nextWorkflowStep; isWorkflowStepEnabled + verification boundary.

Implementation Status

- ✅ Six exports, no class, helpers unexported: packages/core/src/domain/services/workflow-topology.ts:147,161,180,225,246,269; barrel domain/services/index.ts:162-171.
- ✅ Canonical order, bedrock/anchor throws, optional/disabled: workflow-topology.ts:23-98.
- ✅ listWorkflowTransitions: forward chain stops at first non-optional (110-134); backward/redesign/recovery only via VALID_TRANSITIONS (200-211, incl. designing->designing); drain states = VALID_TRANSITIONS exits filtered by enabled (191-193); disabled source -> [] (185).
- ✅ listBypassedWorkflowSteps 246-259. nextWorkflowStep 269-296: null for archivable/archiving/pending-\*; approved drain states take first legal non-designing exit (282-288); result always in listWorkflowTransitions (legality property).
- ✅ isWorkflowStepEnabled 161-170. Consumers: reconcile-change-validity.ts:297, approve-signoff.ts:107, invalidate-verification.ts:78, lifecycle-guidance.ts:42, lifecycle-verdict.ts:994; archive via real reconciler (archive-change.ts verification.current at :1550).
- ✅ TransitionChange uses nextWorkflowStep with project approvals (transition-change.ts:250) and listBypassedWorkflowSteps (:275); Change.transition uses isWorkflowTransitionLegal when schema supplied (entities/change.ts:938).

Discrepancies

- LOW (test quality, not impl): workflow-topology.spec.ts:408 asserts `next === null || next !== 'designing'` where spec requires `null`. Impl returns null (282-288). Fix test to toBeNull.
- LOW (stale export, spec-drift or cleanup): `HAPPY_PATH_NEXT` (domain/value-objects/change-state.ts:93, re-exported public.ts:499, sdk core-reexports) is a static table that ignores schema topology (e.g. implementing->verifying when verifying disabled). Not referenced by any spec in this batch nor by TransitionChange anymore (now nextWorkflowStep). Either remove/deprecate (impl cleanup) or document; no behavioral impact found.

Test Coverage (packages/core/test/domain/services/workflow-topology.spec.ts)

- Named exports/no class/no internal exports: :431 covered.
- Pipeline excludes disabled/annotates optional :39,:49; noncanonical order :91; reordered rows can't skip :117; bedrock normalized :65; bedrock disabled/optional throw :156,:163; done mandatory :177,:186; anchor throw :170; connected when all delivery disabled :135,:419.
- Drain states never pipeline steps: weak (no explicit assertion).
- ready->done bypass empty list: weak (:419 asserts transitions/next only).
- Shortcut across optional :237. **Shortcut stops at first non-optional (excludes done): MISSING.** Disabled target prohibited :247. No invented backward edge (implementing !-> drafting) :226-233. Redesign re-entry :414. **Backward VALID_TRANSITIONS from verifying (implementing + designing): MISSING explicit.** Drain no shortcuts :349,:358. Disabled source []: :257. Approval snapshot honored: :263,:332.
- Bypass: :277,:283,:289,:295 covered.
- nextWorkflowStep: disabled skip :321; optional entry :373; drain approved :366; spec-approved w/ implementing disabled -> null :408 (weak); legality sweep :379 (4 schemas x 2 gates x all states); terminal null :326.
- isWorkflowStepEnabled: :213 false when disabled; :204 bedrock true.
- Disabled verifying end to end: PARTIAL. Pieces: reconcile-change-validity.spec.ts:332 (real reconciler, not-required, no VERIFICATION\* blockers); approve-signoff.spec.ts:196; archive-change.spec.ts:387 (real reconciler archive succeeds; start state archivable); transition-change.spec.ts:3860 (implementing->done via next). No single flow implementing->done->archivable->archive asserting status + `approval.signoff` + `verification.current` predicates.

Missing Tests: shortcut-stops-at-non-optional; verifying backward edges; explicit drain-not-in-pipeline; single-flow disabled-verifying e2e; tighten :408.

## 2. core:workflow-model

Requirements Summary: step names = lifecycle states (unknown/drain rows rejected); optional/disabled validation (bedrock, approval anchor at build/resolve time with approvals, connectivity); checks/skipChecks declarations and governance locks; sovereign schema; requires/task-completion gating; availability; order not significant; hooks; two execution modes.
Implementation Status

- ✅ Unknown step, drain-only, bedrock disabled/optional, skipChecks on disabled step: domain/services/build-schema.ts:719-748.
- ✅ Approval anchor with project approvals at resolve/validate time: application/use-cases/resolve-schema.ts:124 and validate-schema.ts:83 call resolveWorkflowPipeline(schema, approvals); tests resolve-schema.spec.ts:1670 (anchor), build-schema.spec.ts (drain, skipChecks).
- ✅ omitted row => workflowStep null/enabled (isWorkflowStepEnabled:165-168); canonical axis (topology).
- ✅ Sovereign schema: ResolveChangeSchema (application/services/resolve-change-schema.ts:57-83); get-status SCHEMA_VERSION_DRIFT tests.
- ⚠️ Gating/hook/check-lock scenarios (requires, taskCompletion, locks, hooks) belong to other batches (check-registry, transition-checks, transition-change); not re-audited here beyond spot checks (transition-change.spec.ts:3840-3860 bypassed step hooks not executed).
  Discrepancies: none HIGH/MEDIUM. LOW: spec statement "LazySchemaProvider caches schemas by reference" not re-verified in this batch.
  Test coverage: topology-related scenarios (Done remains mandatory, Disabling every delivery step, Noncanonical order, Disabled steps excluded from axis) covered via workflow-topology.spec.ts (:177,:135,:91,:49). Optional-with-no-skip-checks unconditional bypass: covered in transition/lifecycle tests of other batch.

## 3. schema-std:standard-schema (Lifecycle Steps requirement)

- ✅ schema.yaml workflow rows: designing(644), ready(666), implementing(679), verifying(710), archiving(723), each optional:false/disabled:false; no drain rows, no drafting/done/archivable rows.
- Tests: schema-std-load.spec.ts:38-60 exact row list (drain absent, flags explicit) and :54 isWorkflowStepEnabled for all five. "Signoff off skips check but not done": topology :195-200 (done in pipeline with signoff:false) + approval-signoff check tests; ✅ adequate.
- Item 7 (hooks skipped when step bypassed): ✅ behavior (hooks match to/from exact step) tested transition-change.spec.ts:~3845.
  Discrepancies: none.

## 4. core:change

Implementation: ✅ Verification requirement follows topology (reconcile-change-validity.ts:297 uses isWorkflowStepEnabled + VERIFICATION_STATES; schema through ResolveChangeSchema :73). ✅ StartVerification resolves via ResolveChangeSchema (start-verification.ts:122-128), failure creates no attempt (test start-verification.spec.ts:140). ✅ approval.signoff passes on verification not-required (domain/checks/approval-signoff.ts:44-46). ✅ Entity self-transition rejected (entities/change.ts:935); neutral designing self-entry in TransitionChange (transition-change.ts:259) tested at transition-change.spec.ts:2516,2538,2557,2592. ✅ Escape/recovery topology: change-state.ts VALID_TRANSITIONS archiving:[archivable,designing], archiving->done only via RECOVERY_ONLY_TRANSITIONS (tests change-state.spec.ts:71-72,158-159). ✅ syncArtifacts callers use change's schema (only repository calls it, via \_artifactTypesFor).
Discrepancies

- MEDIUM (test gap): Scenario "Signoff without verification when verifying is disabled" (`approval.signoff` passes, transition not blocked) has no direct predicate-level test: domain/checks/approval-signoff.spec.ts contains zero `not-required` cases; approve-signoff.spec.ts:196 covers granting only. Implementation is correct (approval-signoff.ts:45).
- LOW: HAPPY_PATH_NEXT stale (see §1).
  Test coverage: Verification requirement (reconcile spec :332 ✅), StartVerification schema (:140 ✅; "uses custom schema" sovereign call ✅ per start-verification.spec), Different workspace default/identity mismatch/version advisory (resolve-change-schema.spec.ts ✅, get-status.spec.ts ✅), Lifecycle/backward/escape scenarios ✅ (change-state.spec.ts, transition-change.spec.ts:2825).

## 5. core:change-manifest

- ✅ Loading never compares version with workspace default; no warning code in infrastructure/fs/change-repository.ts (no warn/console/schemaRef use); hydrated with manifest.schema.name/version (change-repository.ts:1366-1369, 1475).
- Tests: change-repository.spec.ts:2667 (hydrates without workspace default), :2686 (no schema-version warning on load); drift advisory only in resolve-change-schema.spec.ts; archive with mismatch allowed: implied by archive-change.spec.ts sovereign custom-workflow test (:350-358) — version-mismatch-specific archive test not found (LOW).
  Discrepancies: none HIGH/MEDIUM.

## 6. core:fs-change-repository

- ✅ resolveArtifactTypes(ref{changeName,schemaName,schemaVersion}) (change-repository.ts:105,343-355); composition resolves via ResolveChangeSchema, returns null only on SchemaNotFoundError/IdentityMismatch (composition/composition-resolver.ts:441-455), rethrows others. Used in save/mutate (:685), post-write reconcile (:899), load (\_manifestToChange :1366). Unresolvable => null => no sync (save guard :690; load: artifacts left as persisted, no artifacts-synced event).
- ✅ Cache keyed `schemaName@schemaVersion` (:348); no workspace-default use; no version warning.
- LOW: null (unresolvable) results are cached permanently per key (:352-353); a transient SchemaNotFound for a schema later installed requires a process restart (repository is process-scoped per composition). Spec silent; acceptable.
- LOW: test title at change-repository.spec.ts ~2696 says "once per schema name" while behavior/key is name+version (second test :68 covers version). Cosmetic.
- Test coverage: custom-schema change syncs against own types ✅ (:2696-2715 + versioned test), unresolvable skips sync ✅ (:2743 area, asserts map unchanged + no artifacts-synced), no version warning ✅ (:2686).

## Summary counts

Specs: 6. Implementation non-compliance: 0 HIGH, 0 MEDIUM. Test-evidence gaps: 3 MEDIUM (shortcut-stops-at-first-non-optional scenario missing; `approval.signoff` predicate with disabled verifying/not-required missing; single-flow disabled-verifying e2e is only piecewise) plus weak: verifying backward edges, drain-not-in-pipeline, :408 assertion. LOW: HAPPY_PATH_NEXT stale export, null cache, test title.

BATCH VERDICT: FAIL

---

## Batch B-checks

# Batch B (checks) - partial report 20261019-114015

Focused vitest run (check-registry, check-bindings, build-schema, transition-checks, execute-matching-predicates, evaluate-transition-candidate, workflow-check-registry specs): PASS 198 / FAIL 0.

## core:check-registry

### Requirements Summary

Open registry (get/has/list/bindings); built-ins immutable + `@plugin.id` namespacing (grammar `^[a-zA-Z0-9_-]+$`); register() canonical id + DuplicateCheckError; CustomCheckDefinition adapted to `kind: predicate` / InvalidCheckKindError; binding coordinate identity (transition/archive/step-skip) + DuplicateCheckBindingError; two-tier governance (placement lock `allowSchemaEmbedding` vs own-coordinate, `allowBindingOverride` policy lock, `allowConfigOverride` with binding inheriting check level, `allowDisable`, monotonic locks, schema-owned bindings belong to schema, Category A/B/C, composition fidelity incl. step-skip, executable instances); cascading config computed once by resolveEffectiveBindings, runner does not re-merge.

### Implementation Status

- Open registry: OK. check-registry.ts get/has/list/bindings (L~150-190).
- Built-ins injected, no mutation API; plugin namespacing + grammar regex: OK (check-registry.ts PLUGIN_NAME_REGEX L17, register L~215).
- Duplicate check / invalid kind / adaptation to `kind:'predicate'`: OK (register).
- Duplicate coordinate prevention incl. step-skip and within-batch: OK (register, coordinateKey).
- Placement lock vs own coordinate: OK. build-schema.ts L~842 (`!isOwnCoordinate && allowSchemaEmbedding === false` -> CheckEmbeddingForbiddenError) and L~911 for skipChecks; no `isPluginCheck` special case remains; built-ins and plugins share the rule. Binding-level policy/config/disable locks applied only through `ownBinding` (L~848-882, ~917-950); schema-owned declarations only see check-level `allowConfigOverride`/`allowDisable`. allowSchemaEmbedding does not gate onFailure/skippable/config/disable. OK.
- Embedding defaults: register() L~310 `options.allowSchemaEmbedding ?? (bindings ? false : true)`; `allowBindingOverride` default false with bindings. OK.
- allowConfigOverride inheritance: transition-checks.ts applyBindingSpecs L~373 `spec ?? governanceOf(id) ?? false`; register passes `this._governance.get`; built-in specs in check-bindings.ts declare allowBindingOverride/allowDisable on every spec, allowConfigOverride true on Category C rows, A/B inherit false (applyBindingSpecs without governance -> false). OK.
- Category A/B/C initialization (constructor L~84-110): A/B all four flags false, C true. OK. `skippable:false` for A/B bindings (omitted => false; explicit in most). OK.
- withExecutableBuiltins (check-registry.ts L~117-142): copies catalog/bindings/governance/coords/builtinIds, rejects non-built-in / kind mismatch with InvalidInputError. OK.
- Composition: composition-registries.ts L226-243 forwards defaultConfig, allowSchemaEmbedding, allowConfigOverride, allowBindingOverride, allowDisable and `reg.defaultBindings` unchanged (all scopes; register normalizes step-skip); workflow-check-registry.ts (composition) L~87-101 includes `@` bindings with transition OR step-skip rows in transition base table and returns `checkRegistry: ...withExecutableBuiltins(builtins.checks)`. OK.
- Cascade once: transition-checks.ts resolveEffectiveBindings `cascadeConfig` (check default -> binding config -> step config) with deepMergeConfig; runner execute-matching-predicates.ts L~219-224 uses `binding.effectiveConfig ?? deepMergeConfig(default, binding.config)` only when binding is unresolved (design S3 explicitly keeps this for archive). Step config never merged in runner; step-declaration fallback loop removed. OK (see D3).

### Discrepancies

- D1 (LOW, impl, conservative) build-schema.ts own-coordinate match for `checks` requires `a.from === '*' || a.from === chkFrom`. A declaration without `from` (chkFrom='_') against a code-defined row with a specific `from` (e.g. plugin binding from `ready`) is judged NOT own coordinate, so `allowSchemaEmbedding:false` rejects it, while runtime (`checkMatches` with decl from '_') would overlay that binding. Design S1 literally specifies this matching rule, so this is design-conformant; interpretation A (spec wants own-coordinate = any overlap) vs B (exact). No built-in is affected (Category C lock flags all true). Not blocking.
- D2 (LOW, spec/doc drift) register() JSDoc still says `^[a-z][a-z0-9-]*$`; the test title at check-registry.spec.ts:224 still says "uppercase" although uppercase is now valid. Cosmetic.
- D3 (LOW, spec wording) Spec says runner "SHALL NOT merge configuration again"; the runner still merges default+binding config for unresolved (archive) bindings. Matches design S3 and cannot duplicate arrays for resolved bindings (resolved bindings with empty cascade merge empty). Test execute-matching-predicates.spec.ts:503 covers. Acceptable; spec could state the unresolved-binding exception.
- D4 (LOW, spec vs impl) Spec item 5 says a later schema layer MAY "remove" a schema-owned declaration; merge-schema-layers `remove.workflow` only supports step/hook removal and `append` rejects duplicate check ids, so change/removal is only possible through `set.workflow` (replaces the `checks` array). Belongs to core:merge-schema-layers; no regression, but not asserted anywhere.

### Test Coverage

- Retrieve/unregistered/list(18): check-registry.spec.ts:150 (built-ins), :14; list-count assertion 18 weak (only `withExecutableBuiltins` compares lengths, :449). WEAK for "exactly 18 with 2 plugins".
- Built-ins injected / namespaced no shadow / invalid names / grammar: :150, :189, :49, :224, :250, :64 (it.each MyPlugin/123plugin/my_plugin). COVERED.
- Canonical id / duplicate check / adaptation / effect kind: :14, :100, :265, :80. COVERED.
- Binding coordinates + duplicates (transition, step-skip): :118, :358, :397. COVERED.
- allowSchemaEmbedding false forbids new coordinate: build-schema.spec.ts:925, :1415, :1879. COVERED.
- Embedding defaults: check-registry.spec.ts:431. COVERED.
- Locked built-in at own coordinate not embedding: build-schema.spec.ts:951. COVERED.
- Embedding does not lock policy at own coordinate: build-schema.spec.ts:1849 (relies on default embedding false + coordinate allowBindingOverride true). COVERED (implicit).
- allowBindingOverride false locks policy: :1045, :1434, :1472. COVERED. Does not restrict placement: :965 (implicit). COVERED.
- Schema-owned binding changed by later layer (merge + build, impl.linksInScope on `done`, collect/skippable false): NO TEST (no test combines mergeSchemaLayers/schemaOverrides with buildSchema for a schema-owned check). MISSING.
- Schema-owned honors check-level lock (later layer adds config): single-layer only (:965 second half). WEAK (no layered test).
- Config lock / disable locks / no-relaxation / permitted disable: :1134, :1218, :1251, :1290, :1337, :1018. COVERED.
- Omitted binding allowConfigOverride inherits: check-bindings.spec.ts:96. COVERED (applyBindingSpecs level); not via register() path. WEAK-OK.
- Merge layers preserve step.checks/skipChecks: merge-schema-layers.spec.ts:371-446 (append + duplicate rejection). COVERED (partial; "relax lock via redeclaration rejected" not exercised end-to-end).
- Category A/B/C values: check-registry.spec.ts:287, :421; check-bindings.spec.ts:45,52. COVERED. tasksEmpty step-skip binding: transition-checks.spec.ts:496. COVERED.
- Composition forwards plugin governance: composition-registries.spec.ts:42 covers only `allowDisable`. `allowSchemaEmbedding` forwarding (and CheckEmbeddingForbiddenError via composed view) has NO test. MISSING.
- Plugin step-skip default bindings evaluated end to end (failure rejects shortcut): only base-table inclusion asserted (workflow-check-registry.spec.ts:297); no TransitionChange/evaluateTransitionCandidate test with a plugin step-skip failure. WEAK.
- Composition registry exposes executable instances: workflow-check-registry.spec.ts:316; transition-change.spec.ts:3050-3105 (real check fails, stub would not). COVERED. Embedded Category C check fails verifying->done: transition-change.spec.ts:3089. COVERED.
- Cascade merge exact result / runner no re-merge: execute-matching-predicates.spec.ts:235, :445, :503, :616; transition-checks.spec.ts:938. COVERED.

### Missing Tests

1. Layered schema-owned change (extends/schemaOverrides -> buildSchema) incl. check-level lock still enforced.
2. createCompositionRegistryView forwarding of allowSchemaEmbedding / allowBindingOverride / allowConfigOverride / defaultConfig.
3. Plugin step-skip default binding failing a shortcut end to end.
4. list() length 18 with two plugins.

### Summary

Requirements 8/8 implemented (no HIGH/MEDIUM code defects). Scenarios: ~38 covered, 3 weak, 3 missing tests (above). Previous-audit items resolved: placement lock vs own coordinate, allowConfigOverride inheritance, withExecutableBuiltins wiring, no `isPluginCheck` special case.

## core:transition-checks

### Requirements Summary

Check identity/result; applicability from/to/along (axis from resolveWorkflowPipeline); step-skip scope; dynamic binding composition (items 1-9: target-step overlay, skipChecks overlay, single-pass cascade, coordinate isolation, from/along applicability incl. overlay of code-defined bindings, concrete step-skip coordinates, resolver single owner / runner no re-filter, executable instances, derived policy from resolved bindings); shared candidate evaluator (protocol.edge first in execute mode, step-skip per bypassed step, empty set passes); progress bus incl. check-done on skip/bypass; registry bindings categories A/B/C with inherited governance; actionable diagnostics.

### Implementation Status

- Step-skip attempt/applicability + checkMatches: transition-checks.ts CheckApplicability/CheckAttempt/checkMatches (L~120-250). OK.
- resolveEffectiveBindings (transition-checks.ts L~430-640): `from`/`along` required with targetStep (InvalidInputError); `declMatchesAttempt` via checkMatches(decl from default '\*', along default 'forward'); unmatched decl leaves base untouched; disabled removes only overlaid rows of the matching scope (coordinate isolation, remainder copy keeps non-overlaid rows with original config); enabled replaces overlaid rows with ONE concrete clone (`applicability:[concrete]`, skippable/onFailure/effectiveConfig cascade); synthesis only when no base row matches and registry resolves the (executable) check, with registry governance locks copied (restrictive governance preserved). OK.
- Step-skip overlay: concrete `{scope:'step-skip', step}` clone per declared bypassed step; claimed wildcard row => residual concrete rows for undeclared bypassed steps (base policy/config). OK.
- Single cascade: `cascadeConfig` once per binding; `withoutEffectiveConfig` prevents double application. Runner (execute-matching-predicates.ts L~203-226) has no declaration handling (stepCheckDecls/fallback loop deleted), only the documented unresolved-binding config fallback. OK.
- Candidate evaluator (evaluate-transition-candidate.ts): passes `from`/`along`, executes protocol.edge first in execute mode (early return), evaluates step-skip attempt per bypassed step over resolved bindings, returns `bindings`. OK.
- check-done on user bypass: execute-matching-predicates.ts L~165-180 emits check-done(skip) then pushes `{outcome:'skip', details:{bypassedByUser:true}}`. OK (no matching check-start for a bypassed check; spec says start before execute and done "including skip" - bypass never executes, so acceptable).
- Policy from resolved bindings: transition-change.ts L282-312 validates `--skip-checks` against `effectiveBindings`; failure mapping reads `candidate.bindings` (L355, L420, L592-661); get-status.ts `_mergeBlockers` L940-1005 uses `bindingsByTarget` (resolved) and archive bindings, bypassFlag only when resolved binding skippable. OK.
- Registry bindings categories/skippable: check-bindings.ts specs: A/B explicit allowBindingOverride/allowDisable false & non-skippable; C true with skippable per spec (impl.linksInScope true on transition/archive/step-skip, spec.overlap true, others false). tasksEmpty step-skip implementing. OK.

### Discrepancies

- D5 (LOW, impl) `find(b => b.check.id === id)` on resolved bindings for skip validation (transition-change.ts L298) and `_mergeBlockers` (get-status.ts L965) picks the first binding of the id; when a check has a concrete clone plus a remainder copy with different `skippable` the answer depends on order. Clones are emitted before residuals, so declaration policy wins for the attempt; acceptable.
- D6 (LOW, impl) Step-skip pass in evaluateTransitionCandidate runs the full resolved table per bypassed step, so `reportSkipWhenUnmatched` rows (e.g. protocol.edge, approval.\*) emit extra `skip` rows for every bypassed step. Pre-existing, cosmetic; not spec-prohibited.
- D7 (LOW, spec) Spec says check-start precedes every check-done "including skip"; user-bypass emits only check-done (design S3 mandates this shape).
- No HIGH/MEDIUM code non-compliance found. Previous-audit findings (policy from base table, runner fallback loop, wildcard step-skip leakage, from/along ignored on overlay, stub registry) are all resolved in code.

### Test Coverage

- Step-skip matches/doesn't match: transition-checks.spec.ts:419,435. COVERED.
- Target-step synth with config / disabled / skipChecks synth / restrictive governance: transition-checks.spec.ts:523,597,635,696,749. COVERED.
- Cascade deep merge e2e, arrays not duplicated: execute-matching-predicates.spec.ts:235,445,503; transition-checks.spec.ts:938. COVERED.
- Disable isolation (checks vs skipChecks): transition-checks.spec.ts:860,903. COVERED.
- Step checks ignore non-matching along/from: execute-matching-predicates.spec.ts:594,604,610 (plugin check, no default binding). COVERED.
- Overlay of default-bound check honors from/along: transition-checks.spec.ts:1009,1030 (implementing/done attempts; the `ready -> verifying` shortcut with `{strict:true}` is not asserted explicitly). COVERED (minor gap).
- Wildcard step-skip narrowing: transition-checks.spec.ts:1060 asserts concrete clone and undeclared step keeps base; scenario's two-declared-steps/different-config and "runs once with own config" end-to-end through the runner are not tested. WEAK.
- Predicate runner executes only resolved bindings: execute-matching-predicates.spec.ts:616 (empty bindings) - does not model a claimed-but-non-matching overlay row. WEAK.
- Synthesized binding uses executable instance: transition-change.spec.ts:3050-3105 (impl.linksInScope; deps.consistent not specifically). COVERED.
- Derived policy from resolved bindings (TransitionChange + GetStatus): transition-change.spec.ts:2997-3035; get-status.spec.ts:779,1616. COVERED.
- Candidate evaluator scenarios: evaluate-transition-candidate.spec.ts:99,127,169,213,241,270,367,385,402. COVERED.
- Bypass check-done: execute-matching-predicates.spec.ts:623. COVERED.
- Category/skippable matrix: check-bindings.spec.ts:11,23,45,52. COVERED.

### Missing Tests

1. Wildcard step-skip: both bypassed steps declaring the check with different configs, executed through the runner once each.
2. Runner scenario where a declaration's claimed code-defined row does not match the attempt (no fallback execution).
3. Plugin default `step-skip` binding failing a shortcut end to end (shared with core:check-registry).

### Summary

Requirements implemented 100% of the audited behaviors; 0 HIGH, 0 MEDIUM code defects; LOW drifts D5-D7. Scenarios: majority covered, 2 weak.

## Cross-spec consistency

architecture: domain services (check-registry, transition-checks, check-bindings, build-schema) have no I/O; composition injects executable instances via ports. error-handling: domain errors (CheckEmbeddingForbiddenError, Duplicate\*, InvalidPluginNameError, InvalidInputError) are typed. conventions: JSDoc present; stale JSDoc/test title noted (D2).

## Blocking items (new/changed-behavior scenarios lacking test evidence)

- core:check-registry "Schema-owned binding may be changed by a later schema layer" and "Schema-owned binding still honors check-level locks" (layered): no test.
- core:check-registry "Composition forwards plugin governance": only allowDisable forwarded-test exists; allowSchemaEmbedding forwarding untested.
- core:check-registry "Plugin step-skip default bindings are evaluated" (end to end rejection): only base-table inclusion tested.

BATCH VERDICT: FAIL

---

## Batch C-lifecycle

# Batch C — lifecycle (attempt 14 audit, 2026-10-19)

Prior report: reports/20261017-095914/\_partial-C-lifecycle.md (D-TC1, D-TC2, D-TC5, D-LE1, D-GS2, D-LE2, D-GS1).

## core:transition-change

### Requirements Summary

Flag/policy/recovery items re-verified: skip validation from resolved bindings; failure `skippable` from resolved bindings; `refreshImplementationTrackingBefore:false` skips only pre-evaluation refresh (post-hook always refreshes); committed-recovery nextAction from lifecycle guidance.

### Implementation Status

- ✅ Skip validation uses `effectiveBindings` only; registry `.has()` only for UnknownCheck: transition-change.ts:282-314 (no `registry.bindings()` lookup remains). D-TC2 RESOLVED.
- ✅ `candidate.bindings` passed into `_throwPredicateFailures`; both the collected branch (:573-592) and default branch (`bindings.find`, :661) derive `skippable` from resolved bindings. `TransitionCandidateEvaluation.bindings` exists (evaluate-transition-candidate.ts:~54).
- ✅ Pre refresh `!== false` (:216); post-hook reconcile `refreshImplementationTracking: true` unconditionally (:384-387). D-TC1 RESOLVED as spec drift fix (spec scenarios "Explicit opt-out skips only the pre-evaluation refresh" / "Post-hook refresh catches files changed by hooks" now state pre-only).
- ✅ `committedRecoveryError` (:747-775) uses `evaluateLifecycle` over reconciled change+schema+approvals; reason overridden; both call sites (:227, :392) pass schema/approvals. No `/specd-verify` literal. D-TC5 RESOLVED.

### Discrepancies

None HIGH/MEDIUM. LOW: committed-recovery test only asserts command `not '/specd-verify'` rather than the exact guidance command (test weakness, not a defect).

### Test Coverage (packages/core/test/application/use-cases/transition-change.spec.ts; 130/130 pass)

- Skip validation uses attempt's resolved binding: covered (:3022 "honors schema-declared skippable in skip validation"; :3013 negative case).
- Failure skippable from resolved binding: covered (:3035).
- Explicit opt-out skips only pre refresh: covered (:408-422, asserts calledOnce = post-hook only).
- Post-hook refresh catches hook-created files: covered (:2940-2966).
- Committed recovery verifying-disabled: covered, weak-ish (:179-224; command !== '/specd-verify', reason contains returned state). Verifying-enabled path asserted :175.
- Other scenarios unchanged from previous audit (PASS there).

### Missing Tests

None blocking. Optional: assert exact `command` equals lifecycle guidance for state `done` in the disabled-verifying recovery test.

### Summary

HIGH 0 / MEDIUM 0 / LOW 1. Prior D-TC1, D-TC2, D-TC5 resolved.

## core:lifecycle-engine

### Requirements Summary

Guidance requirement: commands from selected nextHop; verification renewal commands only when `verifying` enabled; blocked done/signed-off with verifying disabled resolves from the real blocker (sign-off, review, design) never `/specd-verify`; verification boundary derived from `resolveWorkflowPipeline` + `isWorkflowStepEnabled`, no hardcoded state lists.

### Implementation Status

- ✅ `isAtOrAfterVerificationBoundary(state, schema, approvals)` exported: lifecycle-verdict.ts:989-1002 (false when verifying disabled; drain-aware `pipelinePosition`). Old `verificationBoundary` removed (no references in src). Used by verdict (lifecycle-verdict.ts:954) and guidance (lifecycle-guidance.ts:54). D-LE1 RESOLVED.
- ✅ `resolveLifecycleCommand` takes `schema` (lifecycle-guidance.ts:33-41); inline state list gone; `verifyingEnabled` from `isWorkflowStepEnabled`.
- ✅ done/signed-off with verifying disabled (lifecycle-guidance.ts:~147-162): archivable→/specd-archive; designing/review→/specd-design; signoff gate & `validity.signoff !== 'valid'`→`specd changes approve signoff`; else /specd-archive. D-LE2 RESOLVED.
- ⚠️ phaseCommand still keys its command matrix on literal state names (drafting/ready/implementing/…); this is the "happy-path command matrix" the spec says belongs in guidance, not a boundary/state-membership list. LOW; spec arguably tolerates.

### Discrepancies

- LOW (scope note): `packages/core/src/application/use-cases/invalidate-verification.ts:137-144` `nextFrom` keeps a hard-coded boundary list (verifying, done, pending-signoff, signed-off, archivable, archiving) gated by `verifyingEnabled`. Design agreed decision 5 ("No hardcoded verification-boundary state list") and the lifecycle-engine guidance requirement concern guidance/verdict; `core:invalidate-verification` is NOT among this change's specs, and its own spec (specs/core/invalidate-verification/spec.md:39) enumerates `verifying, done, archivable, archiving` explicitly (code is a superset incl. pending-signoff/signed-off, which are drain states between done and archivable). Interpretation A (spec drift/ok): out of scope, spec lists states and "includes" is non-exclusive. Interpretation B (impl debt): should call `isAtOrAfterVerificationBoundary(state, schema, approvals)`; also its recovery branch `recovery.to === 'done' ? '/specd-verify'` (:159-160) is unguarded by verifyingEnabled (recovery to done with verifying disabled would route to /specd-verify) -> same family as D-TC5. Recommend follow-up change; not a blocker for this change.

### Test Coverage

- Disabled verifying routes forward to archive: covered (lifecycle-engine.spec.ts ~:120-165, :167-200).
- Blocked done verifying disabled never routes to verify: PARTIAL/weak. Test at lifecycle-engine.spec.ts:256-308 calls `resolveLifecycleCommand` directly with an injected `validity('stale')`; scenario requires `evaluateLifecycle` with the real reconciler/validity verdict (the very gap that hid the earlier bug). No test uses the real reconciler.
- Guidance verification boundary follows topology (noncanonical `workflow[]` row order, verifying disabled): MISSING a test with noncanonical row order (grep "noncanonical" returns none). `isAtOrAfterVerificationBoundary` unit tests exist (lifecycle-verdict.spec.ts:1209-1246: enabled/disabled/drain states) but not through guidance with reordered rows.
- Blocked done routes to real blocker: weak, same as above (sign-off/design/archive branches covered at the resolver level only).
- Tests run: lifecycle-engine + lifecycle-verdict specs 53/53 pass.

### Missing Tests

1. `evaluateLifecycle` (not `resolveLifecycleCommand`) for `done` with verifying disabled, signoff gate on, real validity verdict from `evaluateChangeValidity`/reconciler, no signoff -> command `specd changes approve signoff`.
2. Noncanonical-order `workflow[]` + verifying disabled: commands for implementing/done/archivable never `/specd-verify`.

### Summary

HIGH 0 / MEDIUM 0 / LOW 2 (invalidate-verification debt; matrix literals) ; test gaps: 2 scenarios weak/missing (see FAIL criteria below).

## core:get-status

### Requirements Summary

Blocker projection: `isSkippable`/`bypassFlag: '--skip-checks <checkId>'` only when the RESOLVED binding of the check for the evaluated candidate is skippable (including schema-declared); IMPLEMENTATION_STATE: only impl.linksInScope bypassable.

### Implementation Status

- ✅ `execute-matching-predicates.ts:253-307` returns `bindingsByTarget` from each candidate's `bindings`; GetStatus passes it (get-status.ts:704-709) to `_mergeBlockers` (:945-1004). Skippability = `bindings.find(b => b.check.id === check.id)?.skippable === true` per target; archive checks use `_archiveBindings`. No `checkRegistry.bindings()` lookup remains. D-GS2 RESOLVED.
- ✅ Bypass flag text `--skip-checks <id>` (get-status.ts:~1000, :1024) matches spec :181. D-GS1 RESOLVED (spec aligned).
- ✅ Verdict-precomputed `blocker.bypassFlag` is overridden by resolved bindings (:972-980).

### Discrepancies

- LOW: skippability is OR-ed per check id across targets (get-status.ts:966-969) and falls back to base `_transitionBindings` when a target has no entry (:957). A check skippable for one target but not another yields a bypassFlag on a deduped blocker for both. Spec says "for the evaluated candidate"; negligible in practice (blockers dedup by code+message). Impl-detail drift, not a defect.

### Test Coverage (get-status.spec.ts; 54/54 pass)

- Open-file IMPLEMENTATION_STATE no bypass: covered (:723-774).
- Links-in-scope keeps bypass: covered (:835-886).
- Schema-declared skippability drives bypass flag: covered (:779-830, impl.filesResolved skippable via schema).
- Archivable overlap bypass: covered (:1413, :1456).
- bypass flag text: covered (:1616-1639).

### Missing Tests

None blocking.

### Summary

HIGH 0 / MEDIUM 0 / LOW 1. D-GS1, D-GS2 resolved.

## core:count-tasks

Spec requirement: sovereign schema resolution (change.schemaName/version via ResolveChangeSchema), no default fallback.

- ✅ count-tasks.ts:45-52 resolves via `ResolveChangeSchema.execute({changeName, schemaName, schemaVersion})`; failure propagates (no try/catch).
- Tests: custom-workflow schema (count-tasks.spec.ts:18, :48 "propagates sovereign schema resolution failures without fallback counts"); 32/32 pass across count-tasks+invalidate-change specs. Counting scenarios (markdown-checkbox defaults, uppercase marker, unsafe pattern, empty content, no capability inference) covered, unchanged since previous PASS.
- Discrepancies: none. HIGH 0 / MEDIUM 0 / LOW 0.

## core:invalidate-change

Spec requirements: input contract/policy override, force guard, canonical reconciler-based recovery, output contract incl. "canonical blockers and next action", sovereign schema resolution, DAG traversal order.

- ✅ Schema from change (`ResolveChangeSchema`), failure precedes persistence; tests invalidate-change.spec.ts:158, :180. Reconciler-driven effects/blocker/projection output present (invalidate-change.ts:~165-173).
- ❌ MEDIUM D-IC1: `invalidationNextAction` (invalidate-change.ts:183-199) hard-codes `command: recovery.to === 'designing' ? '/specd-design' : '/specd-verify'`, bypassing lifecycle guidance. With `verifying` disabled (or recovery.to = `implementing`/`ready`/`archivable`), the result advertises `/specd-verify`, contradicting core:lifecycle-engine "Verification-renewal commands MUST only be recommended when verifying is enabled" and design S5/S6 / agreed decision 5 ("No hardcoded ... `/specd-verify` recovery command"). Same defect class as the resolved D-TC5, left in a sibling use case. Test locks it in: invalidate-change.spec.ts:435 expects `{targetStep:'done', command:'/specd-verify'}` (only the verifying-enabled shape is tested).
  - Interpretation A (spec drift): core:invalidate-change spec only says "canonical ... next action" with no command-resolution rule, so its own spec does not forbid it; drift would be resolved by adding a sentence "next action MUST be projected from lifecycle guidance (evaluateLifecycle)".
  - Interpretation B (impl bug, favoured): lifecycle-engine requirement is project-wide for recovery commands; fix = reuse `evaluateLifecycle(change, schema, {approvals, validity: reconciled.verdict, checksByTarget: {}})` as in `committedRecoveryError`. Not listed in tasks 38-40, so this is likely an unnoticed sibling.
- ⚠️ LOW (related): invalidate-verification.ts:137-161 (see lifecycle-engine section) has the same hard-coded boundary list and unguarded `/specd-verify` for `recovery.to === 'done'`; not a spec of this change.
- Test gaps: no scenario/test for disabled-verifying next action in invalidation result.
- Summary: HIGH 0 / MEDIUM 1 / LOW 1.

## Prior-failure status

D-TC1 resolved, D-TC2 resolved, D-TC5 resolved, D-LE1 resolved, D-LE2 resolved (code), D-GS1 resolved, D-GS2 resolved. New: D-IC1 (MEDIUM, sibling hard-coded `/specd-verify` in InvalidateChange). Test gaps: lifecycle-engine scenarios "Blocked done ... never routes to verify" / "routes to the real blocker" (real reconciler, via evaluateLifecycle) and "Guidance verification boundary follows topology" (noncanonical row order) lack end-to-end test evidence (only resolver-level injected-validity tests).

BATCH VERDICT: FAIL
(Reasons: D-IC1 MEDIUM non-compliance in core:invalidate-change; two lifecycle-engine new/changed-behavior scenarios without full test evidence. All previously-reported MEDIUM items in transition-change/get-status/lifecycle-engine are fixed.)

---

## Batch D-schema-resolution

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

---

## Batch E-use-cases

# Batch E - use cases (audit 20261019-114015)

Specs read through `changes spec-preview ... core:<name>` (merged deltas). Tests run: approve-spec/approve-signoff app+composition specs, 44 pass / 0 fail.

## core:approve-spec

### Requirements Summary

Gate guard order (gate -> load -> ResolveChangeSchema (identity mismatch propagates) -> actor); reconcile-then-approve in one serialized mutation; ready-only consent with drain from pending-spec-approval; single decorated actor reused; two factory forms via resolveApproveSpecDeps.

### Implementation Status

- Gate guard order: OK `use-cases/approve-spec.ts:79-94` (gate, get, resolveChangeSchema at 88, actor.identity at 94 - after schema).
- Single actor into reconcile.mutate and recordSpecApproval: OK `approve-spec.ts:94-110`.
- Fingerprint via ValidityFingerprintService.specApprovalFingerprint, blocking artifact check, task artifacts skipped (`hasTasks`): OK `approve-spec.ts:100-104,139-165`.
- Ineligible/state/fingerprint outcomes throw after mutation (reconciliation persisted by `mutate`): OK `approve-spec.ts:115-127`.
- Factory both forms + resolver deps (no kernel): OK `composition/use-cases/approve-spec.ts:45-60,95-130`; passes resolveChangeSchema.

### Discrepancies

- LOW: verify.md scenario "Enabled gate allows execute... pending-spec-approval -> spec-approved" and code agree (drain). No drift.
- None HIGH/MEDIUM.

### Test Coverage (test/application/use-cases/approve-spec.spec.ts)

- Gate disabled: covered :344-372. Change not found: covered :429. Single decorated actor: covered :118 (asserts identity called once, same object).
- Sovereign schema resolution: covered :391 (keyed provider mock `ref === 'schema-a'`, asserts get called with 'schema-a'). Identity mismatch propagates: covered :411 (keyed mock). Weak: does not assert actor.identity not called on mismatch (spec says "before the actor is resolved") - LOW.
- Ready consent / renewal keeps history: covered :139,:161. Drift prevents approval: covered :192. Drain: covered :245-340.
- Task artifacts excluded / missing required / canonical scope fingerprint: covered at service level test/application/services/validity-fingerprint-service.spec.ts:190,215 (indirect, acceptable).
- Approval renewed only in ready from implementing: no dedicated use-case test here (reconciler tests cover) - LOW/weak.
- Factory scenarios: covered test/composition/use-cases/approve-spec.spec.ts (config, deps, deps+options rejects). "Does not bootstrap a kernel": weak (structural).

### Summary

Requirements 9/9 compliant. Scenarios: 17 covered/indirect, 3 weak, 0 missing. No HIGH/MEDIUM.

## core:approve-signoff

### Requirements Summary

Same gate guard order as approve-spec; refresh implementation tracking then reconciler mutation; verification eligibility only when `verifying` enabled; distinct verification error types; whole-file implementation fingerprint; factories.

### Implementation Status

- Guard order: OK `use-cases/approve-signoff.ts` (gate, get, ResolveChangeSchema, `isWorkflowStepEnabled('verifying', schema)`, refresh, actor.identity).
- Verifying disabled skips verification evidence/eligibility/fingerprint compare; recordSignoff without verification id: OK (branches on `verifyingEnabled`).
- Distinct outcomes: missing/active/stale/mismatch mapped to separate outcomes: OK.
- Factory: OK, passes refreshImplementationTracking + resolveChangeSchema (`composition/use-cases/approve-signoff.ts:45-60,108-130`).

### Discrepancies

- None HIGH/MEDIUM. LOW: same "actor not resolved on mismatch" assertion absent.

### Test Coverage (test/application/use-cases/approve-signoff.spec.ts)

- Gate disabled :459; not found :527; single actor :159; identity mismatch :179 (keyed mock); sovereign resolution :505.
- Verifying disabled: no evidence :199; active-only ignored :211 (covered).
- Verification errors distinct: not found :223, in progress :231, stale :240, legacy-unknown :255, mismatch :280 (all covered).
- Done consent/renewal :311,:326; drain :362+; wrong state :489.
- Whole-file fingerprint / empty map / unreadable: service-level validity-fingerprint-service.spec.ts:130,220 (empty map observed valid: weak - not located).
- Reconciliation blocks changed snapshot / atomic: weak at use-case level (reconciler specs cover).
- Factories: composition/use-cases/approve-signoff.spec.ts covered.

### Summary

Requirements 9/9 compliant. No HIGH/MEDIUM.

## core:validate-artifacts

### Implementation Status

- Sovereign schema via ResolveChangeSchema before any mutation: OK `use-cases/validate-artifacts.ts:181-185` (get -> resolve -> then validation); SchemaProviderIdentityMismatchError propagates before state change.
- Reconciler integration, hasTasks exclusion, ctor with ListWorkspaces and resolveChangeSchema (:138,:166): OK.
- Spec has no verifying-disabled scenario for this use case (previous audit note on verifying not applicable to this spec text).

### Discrepancies

- None HIGH/MEDIUM. Orphan JSDoc check (regex for adjacent `*/ /**` blocks) in all 5 use-case files: none found. eslint on the 5 files: clean.

### Test Coverage

- Sovereign resolution with differing default: covered `validate-artifacts.spec.ts:~170-182` (keyed mock, asserts get('schema-a')).
- Identity mismatch: covered :190-207 (keyed mock `ref === 'schema-a'`).
- Change not found, reconciliation around validation (real ReconcileChangeValidity :4174), other scenarios: existing, suite passes (whole batch run 314/314 passed, 40 files).

### Summary

Compliant, no HIGH/MEDIUM.

## core:archive-change

### Implementation Status

- Resolves sovereign schema before reconcile (`archive-change.ts:288-293`); MaterializeSpecMetadata called with `{specId, policy:'force', schemaName: schema.name()}` (:605-609). schema.name() equals change.schemaName because ResolveChangeSchema validates provider identity. OK. Previous failure (materialize with workspace default) is resolved in code.
- Verifying disabled / stale evidence under real reconciler: no code special-casing; handled via reconciler verdict and `postHookValidityBlocksArchive` (:1417) and ArchiveImplementationStateError. OK.
- Post-hook failure semantics unchanged.

### Discrepancies

- MEDIUM (test evidence, not code): verify scenario "Post-archive metadata is materialized with the change schema" (change schema `custom-workflow` differing from workspace default) is only weakly covered. Test `archive-change.spec.ts:~1505-1535` asserts `schemaName: schema.name()` but uses `makeSchemaProvider(schema)` returning the same schema for any ref and a change with default schemaName, so it passes even if the workspace default were used. The keyed `custom-workflow` test (:334-357) uses `makeMaterializeMetadata()` and never asserts the materialize call arguments. Code interpretation: implementation correct. Spec interpretation: scenario requires discriminating evidence. Fix: in the :334 test use a mock materialize and assert `toHaveBeenCalledWith(objectContaining({schemaName:'custom-workflow'}))` with a modified spec.

### Test Coverage

- Verifying disabled with real reconciler: covered `archive-change.spec.ts:387-391` (describe at :360 'verification with the real validity reconciler').
- Verifying enabled, no evidence: covered :393-401 (ArchiveImplementationStateError "Completed verification is required").
- Verifying enabled, stale evidence, nothing published: covered :403-445 (archiveSpy not called).
- Sovereign schema/mismatch: covered :314-357 (keyed mock).
- Remaining 100+ tests pass (archive-change + batch-restore specs pass).

### Summary

Code compliant; 1 MEDIUM test-evidence gap (materialize schemaName discrimination). Previous HIGH test gaps for real-reconciler verification are resolved.

## core:edit-change

### Implementation Status

- Sovereign schema resolved once before mutation when specs change (`edit-change.ts` execute: resolveChangeSchema only inside `hasSpecChanges`); compat guardrail uses change schema, uninitialized spec adopts change schema: OK.
- Scope mutation via `reconcile.mutate` + `replaceSpecIds` + `ctx.reconcileAfter` (no updateSpecIds): OK. unscaffold after persist, refresh on scopeChanged independent of invalidated: OK. Output contract fields: OK.
- Dead branch: description/policy-only path returns `invalidated:false` constant, so its later `if (persisted.invalidated ...)` block is unreachable - LOW cleanup.

### Discrepancies

- MEDIUM: Spec "Dependencies": "the same decorated identity is used by the edit and reconciliation audit events." EditChange resolves `actor = await this._actor.identity()` but calls `this._reconcile.mutate({ name: input.name }, ...)` without `actor` (edit-change.ts `_executeScopeEdit`). `ReconcileChangeValidity` falls back to `input.actor ?? deps.actor.identity()` (reconcile-change-validity.ts:128,147), so a second identity resolution happens and may diverge (privacy-decorated resolvers with randomized/fallback identity). Implementation-bug interpretation: pass `actor` into `mutate`, matching approve-spec/approve-signoff. Spec-drift interpretation unlikely: approve-\* specs impose the same single-identity rule. No test asserts identity call count for edit-change (grep 'identity' in edit-change.spec.ts: 0 matches).

### Test Coverage (edit-change.spec.ts)

- Not found :46, no-op :58, add/dedupe :71-87, seeding :101,:132, remove/absent :167,:183, description :198, policy :214, combined :235, invalidation/refresh :260,:278, reconciled scope (return to designing, reorder, atomic reject) :325-480, schema compat incl. sovereign/fail/uninitialized :485-660: covered.
- Missing: single-identity-for-edit-and-reconcile assertion.

### Summary

1 MEDIUM implementation finding (double actor resolution); 1 LOW.

## Cross-cutting

Project specs (architecture/conventions/error-handling/logging): no violations seen in the 5 use cases; Logger.debug used in archive; typed errors thrown. Focused items: archive passes change schema name (yes); real-reconciler verifying tests exist; identity mismatch propagation tested for approve-spec, approve-signoff, validate-artifacts, archive; keyed provider mocks present; orphan JSDoc none.

BATCH VERDICT: FAIL

---

## Batch F-cli-skills

# Partial F — CLI & skills (audit 20261019-114015)

## cli:change-validate

### Requirements Summary

Change-schema-sourced DAG/scopes; exit 3 + `fatal:` on unresolvable schema in all modes; identity mismatch keeps `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; resolver advisories rendered; batch/--all semantics; output formats.

### Implementation Status

- ✅ Schema resolution wrapper `resolveValidateSchema` (packages/cli/src/commands/change/validate.ts:221-236): identity mismatch -> `cliError(..., 3, 'SCHEMA_PROVIDER_IDENTITY_MISMATCH')`, other -> `SCHEMA_RESOLUTION_FAILED`, ChangeNotFound rethrown (exit 1).
- ✅ Single-spec mode resolves schema before core call (validate.ts:~400) and renders `formatSchemaAdvisories` (helpers/change-schema.ts); core-raised mismatch is mapped by handle-error.ts:180-190 to exit 3 with its own code.
- ✅ Batch: text `warnings:` block (validate.ts:~623), json `schemaWarnings` (validate.ts:~636).
- ✅ `--artifact` scope lookup uses change schema (validate.ts:337).
- ⚠️ Batch with zero specIds returns before schema resolution (validate.ts:~512) - no spec requirement covers it; LOW.

### Discrepancies

- LOW (spec-drift in scenario text): scenario "Unresolvable change schema exits with code 3" says `error:` message, but cliError prints `fatal:` for exit 3 (handle-error.ts:~39), which matches cli:entrypoint (spec.md:44) and the requirement text plus the sibling scenario ("stderr contains a `fatal:`"). Classification: spec wording drift in one scenario (should read `fatal:`); implementation is correct. Not an implementation bug.

### Test Coverage

- Unresolvable schema exit 3: covered (packages/cli/test/commands/change-validate.spec.ts:753; asserts exit 3 + message, not the `fatal:` prefix - weak on prefix but fatal prefix asserted at :799/:781).
- Single-spec exit 3 `fatal:`: covered (:799 core-raised mismatch -> exit 3 + `fatal:`; :781 resolver-raised).
- Identity mismatch code in json: covered (:781-796 stdout contains SCHEMA_PROVIDER_IDENTITY_MISMATCH).
- Version advisories rendered: covered (:815 text, :831 json schemaWarnings).
- Other pre-existing scenarios: covered (:59-727).

### Missing Tests

- None blocking. Optional: assert `fatal:` in :753 test.

### Summary

Requirements 12/12 compliant; scenarios covered; 1 LOW spec-wording drift.

## cli:change-spec-preview

### Requirements Summary

Merged/diff preview; `--artifact` resolved against the change's sovereign schema (ResolveChangeSchema), failures and `SchemaProviderIdentityMismatchError` reported as non-zero errors; warnings to stderr; error exits for unknown/non-spec/missing artifact.

### Implementation Status

- ✅ `--artifact` path resolves via `resolveChangeSchemaForCli` (packages/cli/src/commands/change/spec-preview.ts:~82-99); failure -> `cliError(..., 3, SCHEMA_PROVIDER_IDENTITY_MISMATCH | SCHEMA_RESOLUTION_FAILED)` (exit 3, per S11 design).
- ✅ Advisories: text mode written to stderr as `warnings:` block (~:131); json/toon include `schemaWarnings` (~:182).
- ✅ Unknown/non-spec/not-in-change artifact -> exit 1 `error:` (~:101-125).
- ⚠️ Without `--artifact`, schema resolution happens inside core PreviewSpec; resolver advisories are not surfaced and a core-raised mismatch goes through handle-error.ts:180-190 (exit 3, own code). Spec text does not require advisories there; design S11 only mentions the artifact path. LOW.

### Discrepancies

- LOW: advisories not rendered when no `--artifact` (spec silent; implementation matches design S11). Spec-gap rather than bug.

### Test Coverage

- --artifact resolves against change schema: covered (packages/cli/test/commands/change/spec-preview.spec.ts:416, :674 block).
- Identity mismatch reported: covered (spec-preview.spec.ts:704, code kept, exit 3); schema failure exit 3 fatal: covered (:675).
- Advisories on stderr: covered (:735).
- Existing scenarios (non-existent change :327, spec not in change :341, warnings stderr :361, unknown artifact :572, non-spec :602, not in change :636): covered.

### Missing Tests

- No test for mismatch surfaced without `--artifact` (core-raised path). LOW.

### Summary

All requirements compliant; 0 HIGH/MEDIUM; 1 LOW spec-gap, 1 LOW test gap.

## cli:change-artifacts

### Requirements Summary

Artifacts, order and `delta` flags come from the change's sovereign schema; default schema never consulted; schema resolution failures and identity mismatch must be errors with non-zero exit.

### Implementation Status

- ✅ Schema via `resolveChangeSchemaForCli` (packages/cli/src/commands/change/artifacts.ts:59); no `getActiveSchema` use.
- ✅ Advisories: text `warnings:` block (artifacts.ts:177), json `schemaWarnings` (:185).
- ⚠️ artifacts.ts:69-71 has a bare `catch { /* skip delta entries */ }` around `resolveChangeSchemaForCli`, which literally swallows resolution failures and identity mismatch (spec: "SHALL be reported as errors"). In practice the preceding `kernel.changes.status.execute` (core get-status.ts, constructed with ResolveChangeSchema) resolves the same schema first and throws, which handle-error.ts:180-190 maps to exit 3 with the identity code, so the user-visible requirement holds; the swallow is latent (only reachable if the second resolution diverges from the first).

### Discrepancies

- LOW (implementation, latent): silent catch contradicts the literal requirement and error-handling conventions (no swallowed errors). Fix: rethrow/cliError with exit 3 and codes like validate.ts:221-236. Spec is right; implementation is defensive but non-conforming in text.

### Test Coverage

- Listing follows change schema (delta metadata from change schema, not default): covered (packages/cli/test/commands/change-artifacts.spec.ts:265).
- Schema-declared order: covered (:96, :43).
- Advisories text/json: covered (:323, :334).
- Failure/identity-mismatch exit non-zero: missing (no test; only change-not-found exit 1 at :251). Requirement has no explicit scenario, so LOW.

### Missing Tests

- Schema-resolution failure / identity mismatch for `changes artifacts` exits non-zero. LOW.

### Summary

Requirements compliant in behaviour; 0 HIGH/MEDIUM; 1 LOW latent swallow, 1 LOW test gap.

## cli:change-status

### Requirements Summary

Lifecycle/check-derived projections from GetStatus only; pipeline in Core canonical order, `[optional]` annotation, disabled steps never re-added; DAG from change's sovereign schema (omitted + `SCHEMA_RESOLUTION_FAILED`/`SCHEMA_IDENTITY_MISMATCH` blocker when unresolved); `warnings:` section / `schemaWarnings` from GetStatus only, no stderr, exit 0; drift-aware states; validity/next-action; drafted read-only.

### Implementation Status

- ✅ Advisories only from `statusResult.schemaWarnings`: text (packages/cli/src/commands/change/status.ts:286-291), json (:164-166, :191, :444); no local drift computation, no stderr.
- ✅ DAG from change schema via `resolveChangeSchemaForCli` only when `lifecycle.schemaInfo !== null` (status.ts:235-237, :404-413); no `getActiveSchema`. Blocker codes `SCHEMA_IDENTITY_MISMATCH` / `SCHEMA_RESOLUTION_FAILED` are produced by core get-status.ts:386-397 and rendered through the generic blocker path.
- ✅ Pipeline: text `extras:` renders availableSteps verbatim with `[optional]` (status.ts:305-310); json exposes `optional` (:516-519). CLI neither sorts nor re-adds disabled steps.
- ✅ Remaining requirements (drift display, validity, overlap, drafted) unchanged by this change; existing tests pass-through.

### Discrepancies

- LOW: spec uses blocker code `SCHEMA_IDENTITY_MISMATCH` (status) while CLI error code elsewhere is `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; they are different channels (GetStatus blocker vs thrown error code). Consistent with core get-status.ts:391; no action.

### Test Coverage

- Schema mismatch/advisory scenario: covered (packages/cli/test/commands/change/status.spec.ts:715 text, :741 json, :730 absent when none). Stderr-empty is implied (not asserted explicitly) - weak.
- DAG from change schema: covered (:752).
- Optional annotation: covered (:1527).
- Scenario "Pipeline follows canonical order and omits disabled steps" / "Pipeline display annotates optional steps and omits disabled steps": WEAK/MISSING at CLI level - no test uses a disabled step or non-canonical declared order (grep "disabled" in status.spec.ts: 0 hits; packages/cli/test/commands/helpers.ts only). Design test plan (design.md ~L1177, tasks group 44) lists "canonical order, disabled step absent" for status.spec.ts.
- DAG omitted + resolution blocker when schema unresolvable: missing at CLI level.
- Other scenarios (drift display, validity :1437, blockers :297/:324/:1613, drafted, overlap): covered.

### Missing Tests

- MEDIUM (test gap): CLI status test with `availableSteps` excluding a disabled step / canonical order, asserting the CLI does not re-add it.
- LOW: unresolvable-schema status renders blocker and omits DAG; explicit "no stderr warning" assertion.

### Summary

Implementation compliant. 0 implementation discrepancies; 1 MEDIUM test gap (disabled/canonical-order scenarios), 2 LOW.

## cli:change-transition

### Requirements Summary

`--next` passes `to: 'next'` to Core (no local table; disabled steps skipped by Core; enabled optional step stays the target, no shortcut evaluation); check progress rendering incl. `⊘ ... (skipped: reason)` for `outcome: 'skip'`; `Re-checking after hooks` only when a hook ran; repair guide, hooks, approval routing, etc.

### Implementation Status

- ✅ `--next` -> `'next'` (packages/cli/src/commands/change/transition.ts:372-373); no from-to table.
- ✅ Skip rendering with reason (`--skip-hooks`, `--skip-checks`, not applicable) and hidden duplicate re-check, labelled `Re-checking after hooks` once (packages/cli/src/commands/change/\_check-progress-presenter.ts:67-73, :125-157).
- ✅ Remaining requirements unchanged by this change.

### Discrepancies

- None HIGH/MEDIUM.
- LOW: "Next flag skips disabled step" is wholly Core behaviour; CLI evidence is the passthrough only.

### Test Coverage

- Next skips disabled step: weak (passthrough test packages/cli/test/commands/change/transition.spec.ts:82; Core owns behaviour).
- Next enters closest enabled optional step (no shortcut): covered (transition.spec.ts:108).
- Skipped hooks render as skipped / re-check only when hooks ran: covered (packages/cli/test/commands/change/check-progress-presenter.spec.ts:42-90).
- Gerund label/no `Executing:`: covered (transition.spec.ts:685); repair guide & bypass: covered (:748, :1509, :1541); `--next` failures: covered (:832-882); hooks flags: covered (:909-980); approval routing: covered (:207-435).

### Missing Tests

- LOW: CLI-level test for `--next` result when Core resolves past a disabled step (asserts nothing local intervenes).

### Summary

Compliant; 0 HIGH/MEDIUM; 2 LOW.

## skills:workflow-automation

### Requirements Summary

Plural canonical commands, toon for extraction, fresh-status-first routing from `nextAction`/`lifecycle.availableTransitions` (no hardcoded progressions, no skill-invented optional policy, no hooks for bypassed/disabled steps, explicit-target handling), approvals read from structured status, verify/compliance attempt ownership, strengthened template-protocol validator (real templates + installed copies; test-local routing functions not counted).

### Implementation Status

- ✅ Routed blocks use `<target>`/`<source>` placeholders in verify (packages/skills/templates/skills/specd-verify/SKILL.md.tpl:100-130, 255-260, 325-340, 368-390); explicit-target / stop-before-hooks rule at :44-57; verifying hooks only when advertised (:53, :95).
- ✅ Approvals: design (specd-design SKILL.md.tpl:454), verify (:395), implement (:85) all read `lifecycle.approvals` from a fresh toon status; no template reads approvals from text status (grep of templates).
- ✅ Validator (packages/skills/test/template-protocol.spec.ts:13-79): literal transition/hook states, fixed completion text, literal targets inside routed blocks, and text-approvals reads; runs over 4 lifecycle templates plus 5 installed copy roots (.claude/.agents/.codex/.github/.opencode); parity in generated-skill-protocol.spec.ts. Installed verify copies match template (all 5 contain the same lines).
- ⚠️ MEDIUM/LOW: verify template still states a fixed advancement chain in prose: SKILL.md.tpl:82-84 "(`implementing` -> `verifying` -> `done` -> `archivable`)" and :361-363 "transition through `done` and the signoff gate to reach `archivable`"; headings "6a. Transition to done"/"6b" are fixed. The validator's regexes (`changes transition <name> <state>`, `run-hooks <name> <state>`) cannot catch prose. Interpretation A (spec-drift/acceptable): the lines are descriptive, gated on user authorization and explicitly defer to the hop rules, and `done` is verify's declared completion hop. Interpretation B (implementation bug): spec says "Every transition instruction SHALL derive its target from fresh nextAction/availableTransitions" and the focus item "no fixed advancement sequence"; :361-363 is an instruction naming literal states. Recommend rewording to "advance along the target advertised by a fresh nextAction / availableTransitions" (the same prose in the other four installed copies would then need the regular sync, not done here).
- ⚠️ LOW: specd-new SKILL.md.tpl:148 keeps a state->action table (`ready` -> approve spec / `/specd-implement`); specd-new is outside the validator's four-skill scope and the spec's list.

### Discrepancies

- MEDIUM (borderline, see above): fixed lifecycle chain in verify prose (:82-84, :361-363) not detected by validator.
- LOW: validator only guards literal `<name> <state>` shapes; prose chains and `/specd-*` backward redirects are unchecked by design.

### Test Coverage

- Unconditional transition recipe / hooks for possibly-disabled step / fixed next-skill message fail validation: covered (packages/skills/test/template-protocol.spec.ts:82, :111, :125).
- Approval gating from structured status: covered (template-protocol.spec.ts:140; real templates :151).
- Current templates and installed copies pass: covered (:151-167, 5 copies x 4 skills).
- Routing tests exercise real templates: covered (template-workflow.spec.ts:340, :349; generated-skill-protocol.spec.ts:104, :119); no test-local routing function.
- Disabled verifying selects only actual target hooks / specd-verify skips verifying hooks: covered (template-workflow.spec.ts:340 string assertions; weak-semantic, phrase-level).
- Explicit design invocation/explicit target absent stop: covered (template-workflow.spec.ts:349, :309).
- Run: skills tests 53/53 pass; CLI tests (6 files) 159/159 pass.

### Missing Tests

- LOW: no validator rule for prose naming the fixed chain `verifying -> done -> archivable` (would have caught :83/:362).

### Summary

Most requirements compliant; 1 MEDIUM borderline (fixed chain in verify prose), 2 LOW.

## Cross-spec consistency (architecture/conventions/testing/error-handling)

- Error handling: CLI maps exit 3 consistently via cliError/handle-error; only artifacts.ts:69 has a swallowed catch (LOW). Shared helper `helpers/change-schema.ts` documents params and throws (JSDoc present). Tests colocated under packages/cli/test as per testing spec. No layer violations seen (CLI imports from `@specd/sdk`).

## Previous-audit failure confirmation

- Identity mismatch exit 3 + own code: resolved (validate.ts:221-236, spec-preview.ts:~88-95, handle-error.ts:180-190; tests validate :781/:799, spec-preview :704).
- Advisories rendered: resolved for validate (text/json, single + batch), spec-preview (--artifact only), artifacts, status.
- spec-preview --artifact schema failure exit 3: resolved (test :675).
- Skills approvals from toon: resolved. Strengthened validator: resolved. Verify fixed-sequence: partially (prose remnants, MEDIUM borderline).
- Known item `fatal:` vs `error:`: classified as scenario-text spec drift (LOW); code matches cli:entrypoint.

BATCH VERDICT: FAIL
(Reasons: MEDIUM test gap for cli:change-status disabled-step/canonical-order scenarios; MEDIUM borderline fixed chain prose in specd-verify template.)

---
