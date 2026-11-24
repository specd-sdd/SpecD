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
