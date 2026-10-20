# Specs compliance — change `schema-workflow-skippable-states`

Delegated audit under verification-attempt-15 (full mode). Overall verdict: **FAIL** — five batches PASS (A, B, C, D, E); batch F FAIL on one MEDIUM. No HIGH findings.

## Executive summary

### Resolved since attempt 14

- Code: `invalidate-change` next action via lifecycle guidance; `edit-change` single actor resolution.
- Skill text: verify template fixed chain removed (validator rule `fixed-chain`).
- Specs: `core:compile-context` and `core:invalidate-change` requirements added; `cli:change-validate` scenario says `fatal:`.
- Tests: every gap listed in attempt 14 (batches A–F) now has a test with file:line evidence.

### Open MEDIUM

1. `cli:change-artifacts` — `packages/cli/src/commands/change/artifacts.ts:58-71` swallows schema resolution failures and `SchemaProviderIdentityMismatchError` in a bare `catch {}`: exit 0, delta rows silently dropped. Spec: such failures SHALL be reported as errors with non-zero exit. No test. Fix: rethrow everything except `ChangeNotFoundError` (`handle-error.ts:178-186` already maps mismatch to exit 3); add test.

### LOW (non-blocking)

See batch details. Notable: presenter labels hook skips as `--skip-hooks` whenever any phase flag is passed (`transition.ts:377`); `validate --all` with zero specIds exits 0 before resolving schema; FsChangeRepository caches an unresolvable-schema `null` for repository lifetime; `invalidate-verification.ts` keeps its own boundary list (out of scope per design); missing tests for `--all` drift advisory and single-spec exit 3 without `--artifact`.

---

# Detailed findings

## Batch A-topology-model

# Batch A audit (attempt 15): topology and model

Read-only audit. Specs covered so far: core:workflow-topology, core:workflow-model (partial). Remaining: schema-std:standard-schema, core:change, core:change-manifest, core:fs-change-repository.

## core:workflow-topology

### Requirements Summary

Pure functions module (six named exports); canonical pipeline order; forward connectivity; dynamic legal transitions (forward, shortcut across optional steps only, backward only via VALID_TRANSITIONS, redesign, drain exits exact); bypassed steps; next step; step enablement and verification boundary.

### Implementation Status

- ✅ Six plain-function exports, no class: packages/core/src/domain/services/workflow-topology.ts:147,161,180,225,246,269. Internal helpers not exported (test 'exposes only the six topology functions').
- ✅ Canonical order, disabled excluded, optional annotated, bedrock/ready-anchor throw: workflow-topology.ts:32-99.
- ✅ Shortcut stops at first non-optional step: forwardTargets workflow-topology.ts:110-134.
- ✅ Backward / redesign / recovery admitted only from VALID_TRANSITIONS (change-state.ts): workflow-topology.ts:200-211; drain states return only filtered VALID_TRANSITIONS: :191-193.
- ✅ Disabled source returns []: :185-187. Bypassed steps: :246-259. nextWorkflowStep drain handling and null for terminals: :274-288.
- ✅ isWorkflowStepEnabled: :161-170.

### Discrepancies

- None HIGH/MEDIUM.
- LOW: for the `archiving` source nextWorkflowStep returns null explicitly; consistent with spec.

### Test Coverage (packages/core/test/domain/services/workflow-topology.spec.ts; 41 tests pass)

- Named function imports / no class: covered (:431 'exposes only the six topology functions').
- Pipeline excludes disabled / optional flags: covered (:39, :49). Noncanonical order normalized: covered (:91). Reordered rows cannot skip: covered (:117). Bedrock explicit declarations normalized: covered (:65). Bedrock disabled throws: covered (:156,:163). Done mandatory: covered (:177,:186). Ready anchor throws: covered (:170).
- Disabled signoff skips its check rather than done: covered at predicate level in packages/core/test/domain/checks/approval-signoff.spec.ts:6 (skip when gate false); `done` remains in pipeline: workflow-topology.spec.ts:195.
- Drain states never in pipeline: covered, previous gap RESOLVED (:466, both approval gate combos).
- Connectivity: covered (:135, :419).
- Shortcut across optional: covered (:237). Shortcut stops at first non-optional: previous gap RESOLVED (:443-454; asserts includes implementing/verifying, not done, bypassed = [implementing]).
- Disabled targets illegal / disabled source empty: covered (:247, :257). Pipeline does not invent backward edges: covered (:226-233 not drafting). Redesign re-entry: covered (:414). Backward edges from verifying: previous gap RESOLVED (:456-464 asserts implementing, designing, done).
- Drain exits only VALID_TRANSITIONS: covered (:349, :358). Approval snapshot honored: covered (:263, :332).
- Bypassed detection: covered (:277-308). Next step: covered (:311-340, :373, :366, :408, :379). Terminal null: covered with toBeNull (:326-329); the old weak `next === null` assertion is now `toBeNull()` and the drain-state variants use toBeNull (:352, :362).
- Disabled verifying relaxes boundary: covered (:213). Bedrock always enabled: covered (:204).
- Disabled verifying end to end: previous gap RESOLVED, covered by composite evidence: packages/core/test/application/use-cases/get-status.spec.ts:1648-1713 (real reconciler, no VERIFICATION\_\* blockers, approval.signoff passes), archive-change.spec.ts:360-385 (archive succeeds, enabled-verifying counterparts reject), reconcile-change-validity.spec.ts:332-347 (verification 'not-required'), approval-signoff.spec.ts:42 (passes with not-required).

### Missing Tests

- LOW: end-to-end scenario is split across four files; get-status test moves the entity verifying->done via Change.transition rather than through the topology implementing->done path. No single test walks implementing -> done -> archivable -> archive. Not a behavior gap.

### Summary

Requirements 7/7 compliant; scenarios 33/33 with evidence; 0 HIGH, 0 MEDIUM, 1 LOW.

## core:workflow-model

### Requirements Summary

Step names reference lifecycle states (unknown/drain rows rejected, omitted rows default enabled); optional/disabled declarations with bedrock, ready-anchor, done-mandatory rules; checks/skipChecks declarations and governance locks; sovereign schema authority; requires/task-completion gating; availability via lifecycle verdict; canonical axis; hooks.

### Implementation Status

- ✅ Unknown step rejected: packages/core/src/domain/services/build-schema.ts:720-724; drain rows rejected :725-730; bedrock disabled/optional rejected :734-745; skipChecks on disabled step rejected :746-748.
- ✅ Omitted row -> workflowStep null / enabled: isWorkflowStepEnabled workflow-topology.ts:161-170.
- ✅ Ready anchor enforced at resolve and validate time (not deferred): resolveWorkflowPipeline called from application/use-cases/validate-schema.ts:83 and resolve-schema.ts:124.
- ✅ Disabling every delivery step valid: workflow-topology.ts:94-98 (no reachability guard).
- ✅ Optional + no effective skip bindings is unconditional; bindings evaluated via step-skip predicates (evaluate-transition-candidate service).
- ✅ Sovereign schema through ResolveChangeSchema: application/services/resolve-change-schema.ts.
- Check governance errors (Unknown/Duplicate/Embedding/Override/Config/Disable): build-schema.ts ~860-980.

### Discrepancies

- None HIGH/MEDIUM.
- LOW (spec drift candidate, not blocking): build-schema.ts rejects an unknown step with "is not a valid lifecycle state" while the spec only fixes the error type; consistent.

### Test Coverage

- Invalid step / drain row rejected: covered (core/test/domain/services/build-schema.spec.ts:1865; invalid-name check present in same file).
- Omitted row null and still legal: covered (schema-std-load.spec.ts, workflow-topology.spec.ts:219).
- Bedrock cannot be optional/disabled: covered (build-schema.spec.ts:51,59; workflow-topology.spec.ts:156,163).
- Done mandatory with signoff off: covered (workflow-topology.spec.ts:177,186,195; approval-signoff.spec.ts:6).
- Ready anchor at build/resolve time: covered (resolve-schema.spec.ts:1684,1693; workflow-topology.spec.ts:170).
- Disable every delivery step valid: covered (workflow-topology.spec.ts:135,419).
- Optional with no skip checks unconditional: covered (get-status.spec.ts:507; evaluate-transition-candidate.spec.ts:213).
- Skills cannot redefine optionality: weak. Behavioral guarantee rests on projection tests (get-status.spec.ts:433,460); no skill-text assertion examined in this batch (LOW).
- checks/skipChecks scenarios (unknown id, duplicate, embedding, own-coordinate, later layer, binding override, config, disable, skipChecks on disabled): covered (build-schema.spec.ts:884-1076, 1276-1395, 1429-1725, 1907, 1937).
- Sovereign schema scenarios: covered (resolve-change-schema.spec.ts:36-128).
- Gating, availability, axis, hooks: pre-existing behavior, not changed by this change; spot checks only (transition-checks.spec.ts, lifecycle-verdict.spec.ts:1224).

### Missing Tests

- LOW: no direct unit test that a skill consumes only availableTransitions (non-code scenario).

### Summary

0 HIGH, 0 MEDIUM, 2 LOW.

## schema-std:standard-schema

### Requirements Summary

Delta changes only requirement "Lifecycle Steps and State Transitions": rows designing/ready/implementing/verifying/archiving; no drain rows; optional/disabled flags; bedrock; done mandatory; signoff off skips check; hooks skipped when bypassed; dependency on core:workflow-model.

### Implementation Status

- ✅ packages/schema-std/schema.yaml:643-725 declares exactly the five rows with explicit optional:false, disabled:false; no pending-\*/signed-off rows.
- ✅ done/archivable/drafting not rows (protocol-owned).
- ✅ Signoff-off behavior: core approval-signoff check (skip) and done retained in pipeline.

### Discrepancies

- None.

### Test Coverage

- Standard steps defined / drain absent / done distinct: covered (core/test/domain/services/schema-std-load.spec.ts:38-60 loads the real schema.yaml via buildSchema).
- Schema supports optional/disabled flags: covered (same test asserts flags; build-schema.spec.ts:67).
- Signoff off skips check but not done: covered (approval-signoff.spec.ts:6; workflow-topology.spec.ts:195).
- Weak: schema-std has no test dir; coverage lives in core.

### Missing Tests

- None blocking.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW.

## core:change

### Requirements Summary

Delta: StartVerification sovereign schema; Schema version (workspace default must not reject, provider identity mismatch throws, version drift advisory only from ResolveChangeSchema); sovereign schema for validity fingerprints; verification requirement follows topology; signoff gate; artifact sync from change's own schema; dependency on workflow-topology.

### Implementation Status

- ✅ StartVerification uses ResolveChangeSchema: application/use-cases/start-verification.ts:8,45,57,67.
- ✅ ResolveChangeSchema identity mismatch error and SCHEMA_VERSION_DRIFT advisory: application/services/resolve-change-schema.ts (execute).
- ✅ ValidityFingerprintService uses ResolveChangeSchema: application/services/validity-fingerprint-service.ts:5,32,43,53.
- ✅ Verification required only if verifying enabled and state at/after boundary: application/use-cases/reconcile-change-validity.ts:296-298, used :225; schema from ResolveChangeSchema :206.
- ✅ Signoff/verification.current treat not-required as pass: approval-signoff check (tested).
- ✅ syncArtifacts with repository types resolved per change identity: infrastructure/fs/change-repository.ts:343-357.

### Discrepancies

- LOW: Change repository caches an unresolvable (null) result per name@version for the repository lifetime (change-repository.ts:348-354). Spec says skip sync for that load; permanent caching of a transient SchemaNotFound is stricter. Implementation tolerable; no spec text forbids.
- LOW: test title at change-repository.spec.ts:2695 says "once per schema name" but cache key is name@version (see :2752). Cosmetic.

### Test Coverage

- Readiness from sovereign schema / failure creates no attempt: covered (start-verification.spec.ts:127,140).
- Different workspace default does not reject; identity mismatch throws; version advisory; default version irrelevant: covered (resolve-change-schema.spec.ts:36,55,91,128; change-repository.spec.ts:2667,2686); archive with drift: covered (archive-change.spec.ts uses SCHEMA_VERSION_DRIFT).
- Fingerprints sovereign / failure propagates: covered (validity-fingerprint-service.spec.ts:172,203).
- Disabled verifying not-required; enabled absent + VERIFICATION_REQUIRED; reconciler identity mismatch: covered (reconcile-change-validity.spec.ts:332,322,221).
- Signoff stale verification: covered (approval-signoff.spec.ts:52, change-validity.spec.ts:199, archive-change.spec.ts:~395). Signoff without verification when disabled: covered (approval-signoff.spec.ts:42, get-status.spec.ts:1648+). Disabled signoff preserves other checks: covered (transition-checks.spec.ts:391).
- syncArtifacts event and custom schema not synced from default: covered (change.spec.ts syncArtifacts tests; change-repository.spec.ts:2752).

### Missing Tests

- None blocking.

### Summary

0 HIGH, 0 MEDIUM, 2 LOW.

## core:change-manifest

### Requirements Summary

Manifest schema is sovereign; load never compares version with workspace default; no rejection on name mismatch; advisories only from ResolveChangeSchema.

### Implementation Status

- ✅ \_manifestToChange hydrates with manifest.schema.name/version and does no default comparison: change-repository.ts:1360-1370, 1469-1476.
- ✅ No Logger.warn on load (verified by test).

### Discrepancies

- None.

### Test Coverage

- Loading never compares version: covered (change-repository.spec.ts:2686). Same-name drift only by ResolveChangeSchema: covered (resolve-change-schema.spec.ts:128 plus 2686). Name differs from default: covered (change-repository.spec.ts:2667). Archive with mismatch allowed: covered (archive-change.spec.ts). Note: 2667 does not give the repository a different default explicitly (repo has no default concept); acceptable.

### Missing Tests

- None.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW.

## core:fs-change-repository

### Requirements Summary

resolveArtifactTypes receives the change ref and resolves its own schema via ResolveChangeSchema; no workspace-default resolution; unresolvable schema skips sync; no version warning; constructor config shape (runtime callbacks, no activeSchema).

### Implementation Status

- ✅ ChangeRepositoryConfig.resolveArtifactTypes(ref: ChangeSchemaRef): change-repository.ts:105; used in save/create (:685), scaffold (:899), load (:1366).
- ✅ Composition resolves via getResolveChangeSchema(): composition/composition-resolver.ts:441-458; SchemaNotFoundError and SchemaProviderIdentityMismatchError map to null (skip sync).
- ✅ Null skips sync and leaves map unchanged: change-repository.ts:685-691 (guard) and :1371.

### Discrepancies

- LOW: spec says the callback accepts "the change"; implementation passes a ref object {changeName, schemaName, schemaVersion}; spec says "at least its recorded schemaName", so compliant.
- LOW: other schema-resolution errors propagate (rethrown) rather than skipping; spec only defines the cannot-be-resolved case.

### Test Coverage

- Custom schema syncs against own types (get/save): covered (change-repository.spec.ts:2695, 2752). mutate path not asserted separately (LOW).
- Unresolvable skips sync, no artifacts-synced event: covered (:2720).
- No version warning: covered (:2686).
- Constructor config validation: pre-existing tests (not changed).
- Focused run: change-repository.spec.ts 114 pass.

### Missing Tests

- LOW: no test exercising composition-resolver.ts:441-458 null mapping for SchemaNotFoundError/IdentityMismatch (composition test not located).

### Summary

0 HIGH, 0 MEDIUM, 3 LOW.

## Confirmation of attempt-14 gaps

1. Shortcut stops at first non-optional step: RESOLVED, workflow-topology.spec.ts:443-454.
2. Predicate-level approval.signoff not-required: RESOLVED, approval-signoff.spec.ts:6 and :42.
3. End-to-end disabled-verifying: RESOLVED, get-status.spec.ts:1648-1713, archive-change.spec.ts:360-385, reconcile-change-validity.spec.ts:332 (composite; not a single test).
4. Weak next === null: RESOLVED, toBeNull at workflow-topology.spec.ts:326-329, 352, 362, 408.
5. Backward edges from verifying: RESOLVED, workflow-topology.spec.ts:456-464.
6. Drain states never in pipeline: RESOLVED, workflow-topology.spec.ts:466.
   New findings: only LOW items above.

BATCH VERDICT: PASS

---

## Batch B-checks

# Batch B (checks) - partial report 20261019-170525

Delta audit against attempt 14 (reports/20261019-114015/\_partial-B-checks.md). Code unchanged in compliance terms (no HIGH/MEDIUM code defects then; none found now). Focused vitest run (check-registry, build-schema, transition-checks, test/composition, execute-matching-predicates, transition-change specs): PASS 531 / FAIL 0.

## core:check-registry

### Requirements Summary

Open registry; built-in immutability and `@plugin.id` namespacing; register()/duplicates; CustomCheckDefinition adaptation; binding coordinate identity; two-tier governance (placement lock, policy lock, config lock, disable lock, monotonic, schema-owned bindings belong to the schema, categories A/B/C, composition fidelity incl. step-skip, executable instances); cascade computed once.

### Implementation Status

All 8 requirements remain implemented as in attempt 14 (check-registry.ts, build-schema.ts own-coordinate rule, composition-registries.ts forwarding, workflow-check-registry.ts). No code regression detected; tests green.

### Discrepancies

- D1 LOW (own-coordinate match for `checks` w/o `from` is conservative; design-conformant). D2 LOW (stale JSDoc grammar; test title "uppercase" at check-registry.spec.ts ~224). D3 LOW (runner merges default+binding config for unresolved/archive bindings; spec wording could carve out). D4 LOW (merge-schema-layers cannot "remove" a schema-owned check except via set.workflow). Unchanged, non-blocking.

### Test Coverage - previous gaps

1. Layered schema-owned override (merge then build): RESOLVED. build-schema.spec.ts:992-1047 `layered schema-owned declarations`: mergeSchemaLayers(set.workflow) -> buildSchema, asserts merged `onFailure:'collect', skippable:false` (L1017) and no CheckBindingOverrideForbiddenError; second test asserts check-level `allowConfigOverride:false` still throws CheckConfigOverrideForbiddenError on a later layer (L1022-1046). Uses `set.workflow` only (extends/schemaOverrides route is the same merge function) - acceptable.
2. Composition forwarding of allowSchemaEmbedding: RESOLVED. composition-registries.spec.ts:67-95 asserts governance of top-level and `options` forms, default false with bindings, and build-time enforcement via buildSchema. allowBindingOverride/allowConfigOverride/defaultConfig forwarding still not individually asserted (LOW; spec item 7 lists them; code at composition-registries.ts L226-243 forwards verbatim).
3. Plugin step-skip default binding failing shortcut end to end: RESOLVED. transition-change.spec.ts:3791-3860 registers `@qa.freeze` with `step-skip implementing`, fails -> CheckPredicateFailedError(checkId `@qa.freeze`), state stays `ready`; passing variant reaches `verifying`. Uses registry.bindings() fed into transitionBindings (mirrors composition path; composition inclusion itself covered in workflow-check-registry.spec.ts:297).
4. list() length 18: RESOLVED. check-registry.spec.ts:423 (16 built-ins) and :434 (18 after two plugins).

### Remaining weak (not blocking; no new/changed scenario lacks evidence)

- Composition forwarding of allowBindingOverride/allowConfigOverride/defaultConfig not asserted individually (LOW).
- Layered test covers `set.workflow` replacement only, not extends/schemaOverrides sources explicitly (LOW).
- "Omitted binding allowConfigOverride inherits" covered at applyBindingSpecs level (check-bindings.spec.ts:96), not via register() (LOW).

### Summary

8/8 requirements implemented; all scenarios now have test evidence; 0 HIGH, 0 MEDIUM.

## core:transition-checks

### Requirements Summary / Implementation Status

Unchanged from attempt 14: resolveEffectiveBindings (overlay, coordinate isolation, single cascade, from/along applicability, concrete step-skip clones, executable synthesis with governance), evaluateTransitionCandidate (protocol.edge first, per-bypassed-step pass), runner executes only resolved bindings, bypass check-done, policy derived from resolved bindings. All OK.

### Discrepancies

D5-D7 LOW unchanged (first-binding `find` order; extra skip rows per bypassed step; user-bypass emits check-done without check-start per design S3).

### Test Coverage - previously weak items

- Wildcard step-skip narrowing: IMPROVED/adequate. transition-checks.spec.ts:1060-1105 declares one of two bypassed steps with extra config and asserts the declared step gets a concrete clone with merged config `{base:1, extra:2}`, undeclared step keeps `{base:1}`, and no `step: '*'` row remains. Remaining weak: two steps both declaring different configs and runner-level execution once each (LOW; scenario's core invariant is asserted at resolver level).
- "Runner executes only resolved bindings" with empty bindings: execute-matching-predicates.spec.ts:616 unchanged. Still does not model a claimed-but-non-matching overlay row (WEAK, LOW: behavior is structurally guaranteed because the runner has no declaration handling and resolver test transition-checks.spec.ts "unmatched decl leaves base untouched" covers the resolver half).
- from/along matrix: transition-checks.spec.ts:1009/1030 plus 419-453 step-skip from/to variants; `ready -> verifying` shortcut with `{strict:true}` still not explicit (WEAK, LOW). The new transition-change e2e test also exercises ready->verifying shortcut with a plugin step-skip binding.
- Everything else as in attempt 14: COVERED.

### Summary

0 HIGH, 0 MEDIUM code defects; 3 weak LOW test items remain, none a new/changed scenario lacking all evidence.

## Cross-spec consistency

architecture (pure domain services, executable instances via composition), error-handling (typed errors), conventions: no change from attempt 14; only cosmetic stale JSDoc (D2).

BATCH VERDICT: PASS

---

## Batch C-lifecycle

# Batch C — lifecycle (attempt 15 audit, 2026-10-19)

Focused run: core vitest (lifecycle-engine, get-status, invalidate-change, transition-change, count-tasks specs) = 221 pass / 0 fail.

## core:invalidate-change

### Requirements Summary

New requirement "Next action follows lifecycle guidance": nextAction after automatic recovery MUST come from evaluateLifecycle for the recovered state under the sovereign schema; with verifying disabled never /specd-verify nor `verification start`. Plus unchanged requirements (policy, targets, force guard, reconciler, sovereign schema, output contract).

### Implementation Status

- ✅ D-IC1 RESOLVED: `invalidationNextAction` (invalidate-change.ts, bottom of file) calls `evaluateLifecycle(change, schema, {approvals, validity: verdict, checksByTarget: {}})` and spreads `lifecycle.nextAction`, overriding only `reason`. No `/specd-verify` literal remains in the file. Approvals injected through constructor (invalidate-change.ts ctor param `approvals`) and wired in composition/use-cases/invalidate-change.ts (`resolver.config.approvals`, lines ~30-56).
- ✅ Behavior with verifying disabled + pending-review artifact -> `/specd-design`: matches spec. lifecycle-guidance.ts:74 `review.required -> /specd-design` (and phaseCommand done/signed-off branch with `!verifyingEnabled`, lifecycle-guidance.ts ~:152-165, returns design when review.required). Spec only requires "from lifecycle guidance" and "not verify"; scenario 1 ("command comes from lifecycle guidance for done") is satisfied since guidance legitimately returns design while an artifact is pending review.
- ✅ No-recovery path returns cognitive "Review the reported blockers" with command null (spec scopes the requirement to "invalidation that triggers an automatic recovery").

### Discrepancies

- LOW: spec "Config-based factory delegates through resolveInvalidateChangeDeps" lists only changes/actor/schemaProvider as resolved deps; code additionally resolves `approvals` (+ reconcile/resolveChangeSchema). Spec incompleteness (A) vs. impl fine (B); non-blocking.
- LOW: the "Recovery with verifying disabled" test exercises the pending-review branch (/specd-design); the pure guidance-for-`done` branch (sign-off command / archive) after invalidation with no pending review is not tested (policy `none` + force sign-off revocation would hit it). Non-blocking.

### Test Coverage (invalidate-change.spec.ts 'recovery next action follows lifecycle guidance', :447-493)

- Recovery with verifying disabled never recommends verification: covered (:477-486; asserts automaticReturn.to=done, command '/specd-design', not verify, not 'verification start', reason).
- Recovery with verifying enabled routes to /specd-verify: covered (:488-492).
- Remaining scenarios (policy, target, force, sovereign schema, order, hasDrift): unchanged, pass.

### Missing Tests: none blocking.

### Summary: HIGH 0 / MEDIUM 0 / LOW 2. D-IC1 resolved.

## core:transition-change

Unchanged since attempt 14 (all PASS there; D-TC1/2/5 resolved). Re-checked: no `/specd-verify` literal in transition-change.ts (grep); `committedRecoveryError` uses evaluateLifecycle; tests pass (part of 221). LOW carried: committed-recovery test asserts only `!== '/specd-verify'`. HIGH 0 / MEDIUM 0 / LOW 1.

## core:lifecycle-engine

- ✅ Resolutions confirmed: lifecycle-guidance.ts:54-61 verification renewal gated by `verifyingEnabled` and `isAtOrAfterVerificationBoundary(state, schema, approvals)`; only remaining `/specd-verify` literals (:121,133,140,148,170,193) are guarded by `nextHop.targetStep==='verifying'`, state `verifying`, or the `verifyingEnabled` branch (done/signed-off returns design/signoff/archive when disabled, :~152-165).
- ✅ Test gap "blocked done with real reconciler": now covered end-to-end at get-status.spec.ts:1648-1711 ('GetStatus with verifying disabled and the real reconciler': makeRealReconcile, done + signoff gate -> `specd changes approve signoff`, SIGNOFF_REQUIRED blocker, no verification blockers once signed off). GetStatus calls evaluateLifecycle with reconciled verdict. The lifecycle-engine.spec.ts-level tests (domain/services/lifecycle-engine.spec.ts:~255-298) still use injected validity into resolveLifecycleCommand — acceptable because scenario is verified via GetStatus; weak only in location.
- ✅ Test gap "noncanonical workflow[] order": covered at test/domain/services/lifecycle-engine.spec.ts:~310-345 (rows done, verifying(disabled), implementing, ready; implementing/done commands != /specd-verify; availableSteps order ['ready','implementing','done']).
- LOW: that noncanonical test checks `implementing` and `done` only (scenario also names `archivable`) and asserts only "not /specd-verify", not the derived command. Weak, non-blocking.
- LOW (carried, out of scope): invalidate-verification.ts keeps own boundary list (`nextFrom`) and unguarded `/specd-verify` for recovery.to==='done'; spec core:invalidate-verification not in this change (design.md "Third Post-Verification Revision" out of scope). Interp A: ok/out of scope; B: follow-up debt.
- LOW (carried): phaseCommand keys command matrix on literal state names.
  HIGH 0 / MEDIUM 0 / LOW 3.

## core:get-status

Unchanged vs attempt 14: bindingsByTarget-based skippability (execute-matching-predicates.ts, get-status.ts \_mergeBlockers), `--skip-checks <id>` text; tests pass. New real-reconciler describe (get-status.spec.ts:1648) passes. LOW carried: OR-ed skippability across targets. HIGH 0 / MEDIUM 0 / LOW 1.

## core:count-tasks

Unchanged: sovereign schema via ResolveChangeSchema (count-tasks.ts:45-52), no fallback; tests pass. HIGH 0 / MEDIUM 0 / LOW 0.

## Totals: HIGH 0 / MEDIUM 0 / LOW ~7 (all non-blocking). No new/changed-behavior scenario lacks test evidence.

BATCH VERDICT: PASS

---

## Batch D-schema-resolution

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

---

## Batch E-use-cases

# Batch E - use cases audit (attempt 15)

## core:approve-spec

- Impl: approve-spec.ts:84-134 gate first (:85), load (:89), ResolveChangeSchema (:94) before actor (:100), single actor passed into reconcile.mutate and record (:101,:115). blockingArtifact :149. ✅ all requirements.
- Tests: approve-spec.spec.ts: single actor :118, gate disabled :344, not found :429, sovereign :390, mismatch :411, drift :192, renewal history :161, drain :245; composition tests composition/use-cases/approve-spec.spec.ts:22,29,43. All scenarios covered.
- LOW (carry-over): mismatch test :411 doesn't assert actor.identity not called (impl order is correct, :94 before :100).

## core:approve-signoff

- Impl: approve-signoff.ts: gate :86, load :90, schema :95, verifyingEnabled via isWorkflowStepEnabled :102, refresh :104, actor :105 (once, shared with mutate). Distinct verification errors :166-:178. Verifying-disabled path skips evidence :113,:141. ✅ all.
- Tests: approve-signoff.spec.ts single actor :159, mismatch :179, disabled verifying :196/:199/:211, errors :222-:280, done :310/:326, drain :362, gate :459, sovereign :505, not found :527; composition tests :22/:29/:44. Covered.
- LOW (carry-over): mismatch test doesn't assert actor not resolved.

## core:edit-change

- Impl: edit-change.ts: no-op early return :134-136 (before actor); actor resolved once :138 and passed into `_reconcile.mutate({name, actor})` :227 and `updateDescription(..., actor)` :230; reconciler uses `input.actor ?? ...` (reconcile-change-validity.ts:128,147) so no second resolution. Sovereign schema once :143; compat check :149-160; replaceSpecIds :251 + ctx.reconcileAfter :257 (no updateSpecIds/second schema get); seed specDependsOn :252-256 (no overwrite :253); unscaffold :262-264; refresh on scopeChanged only :265-273 (independent of validityChanged); output contract :275-288; constructor requires reconcile :107. All requirements ✅.
- PRIOR MEDIUM (1) RESOLVED: double actor resolution fixed (:138 -> :227); test edit-change.spec.ts:565 'resolves the actor once...' asserts identity called 1x with real ReconcileChangeValidity.
- Discrepancies: LOW (carry-over) description/policy-only path (:172-205) has unreachable `persisted.invalidated` branches (always false) - dead code, behaviour per spec. LOW (new/nuance) actor resolved at :138 before knowing a scope edit is a canonical no-op (e.g. remove+re-add same spec); spec Constraint says actor only on persistence-worthy change. Mitigated: that path still runs reconcile.mutate which may persist; ambiguous, no fix required.
- Tests (edit-change.spec.ts): not-found :47; no-op :59; add :72/:88; seeding :102/:133; remove :168/:184; description :199; policy :215; combined :236; invalidation/refresh :261/:279; reconciled scope (spec returns to designing, reorder, atomic rollback) :356/:400/:435; compat/sovereign/uninitialized :486/:523/:542/:611/:640/:671. Factory: composition/use-cases/mandatory-validity-reconciler.spec.ts, barrel-kernel-coverage.spec.ts.
- WEAK (LOW): no use-case-level assertion that `unscaffold` is called with removed IDs / not called on add (helpers.ts:300 stub is a no-op; only infra change-repository.spec.ts tests unscaffold); no explicit remove+re-add no-op, repeated-same-policy no-op, or description-only-on-spec-approved assertions found by grep (partially covered by 'updates the invalidation policy'/'no-op edits'). These are unchanged-behaviour scenarios, pre-existing, not new to this change.

## core:archive-change

- Impl (archive-change.ts): mandatory reconcile :262 (throws InvalidCompositionFactoryArgumentsError); sovereign schema :285-290; reconcile :295 then post-hook reconcile with tracking refresh :397; postHookValidityBlocksArchive :413; predicates rerun :417+ (schema-workflow verifying-disabled handled by check registry/reconciler); recovery diagnostic archiveRecoveryError :300/:403; allowOutOfScope :320,:383,:635; readOnly runner :1478; identity mismatch :1472; post-archive materialize with `schemaName: schema.name()` :605-608 (== change.schemaName after identity validation). ✅.
- PRIOR MEDIUM (2) RESOLVED: archive-change.spec.ts:608 'materializes metadata with the change schema when the workspace default differs' uses schemaName 'custom-workflow', asserts every materialize call has {specId, policy:'force', schemaName:'custom-workflow'} and `get` never called with 'workspace-default'. Discriminating.
- Verifying-disabled scenarios (both variants): archive-change.spec.ts:360-410 'verification with the real validity reconciler' (disabled :387 passes; enabled/no evidence :393 -> ArchiveImplementationStateError; stale :402). Reconciler required: :186. Sovereign: :315/:335 (get called with 'custom-workflow' :356). ReadOnly guard :3510; open-file/out-of-scope: :3566/:3629/:3721. Remaining ~190 scenarios (publication, batch restore, spec-lock, hooks, overlap) unchanged by this change; extensive tests exist (archive-change.spec.ts 113 cases + archive-change-batch-restore.spec.ts). "Enter ready fails readOnly runner" and "Open file blocks implementing->verifying / same skippable flag" belong to transition/get-status (outside batch E use cases; same runner registry).
- Discrepancies: none HIGH/MEDIUM.

## core:validate-artifacts

- Impl (validate-artifacts.ts): ChangeNotFoundError :179; sovereign schema via ResolveChangeSchema :181-186 (before any mutation; identity mismatch propagates); evaluateLifecycleVerdict once with empty checksByTarget :231 + in-memory markVerdictComplete :237/:466/:639; topologicalOrder :252; skipped optional/dependency satisfied :318,:353,:391; hasTasks excluded from drift :313; pending-parent context message :792-796; persistence via `_reconcile.mutate` (no Change.invalidate, no raw get/save) markComplete + setSpecDependsOn :735-742; reconciler required in constructor :160-165. No gatherPredicateSnapshots in src. All requirements ✅.
- Tests (validate-artifacts.spec.ts, 94 cases): not-found :103; sovereign :162; identity mismatch :186; skipped optional :234; dep blocked :323/:388/:2212; dep complete/skipped :513/:580; bypass :1083; markComplete/mutate :1154/:1203/:1291; topological order :4083; reconciler required :4147; stale-before-hash and task exclusion :4197/:4240/:4297; dependsOn :2546/:2794/:2907. Factory: referenced in barrel-kernel-coverage.spec.ts / mandatory-validity-reconciler.spec.ts. Covered.
- Discrepancies: none HIGH/MEDIUM. LOW: `_reconcile.mutate` only invoked when drift/completions/deps exist (:731-735) - consistent with spec (nothing to persist otherwise).

## Prior-finding confirmation

- MEDIUM 1 (edit-change double actor): RESOLVED - edit-change.ts:138,:227; test edit-change.spec.ts:565.
- MEDIUM 2 (archive custom-workflow discriminating test): RESOLVED - archive-change.spec.ts:608-651.
- LOW 1 (mismatch tests don't assert actor unresolved): still open, approve-spec.spec.ts:411, approve-signoff.spec.ts:179; impl order correct (schema resolution precedes actor).
- LOW 2 (implementation-fingerprint scenarios only at service level): unchanged, accepted.
- LOW 3 (unreachable `invalidated` branch edit-change.ts:188-203): unchanged, dead code.

## Summary

Specs: 5. Requirements non-compliant: 0. HIGH 0, MEDIUM 0, LOW 4 (carry-overs + edit-change unscaffold use-case-level test weak). No new/changed-behaviour scenario lacks test evidence.

BATCH VERDICT: PASS

---

## Batch F-cli-skills

# Batch F partial audit (attempt 15) - CLI & skills

Paths relative to repo root. Read-only audit.

## cli:change-status

### Requirements Summary

Pipeline from GetStatus in Core canonical order, `[optional]` annotation + `optional` on availableSteps (documented in --help), disabled steps never re-added, bypass paths from Core; DAG from change's sovereign schema; schemaWarnings; drafted read-only; display-state fallback; blockers with labels; review header without file lists.

### Implementation Status

- Pipeline order preserved as Core reports (no local filter/sort): packages/cli/src/commands/change/status.ts:304-313 (text `extras:` with `[optional]` at :309-310), JSON `lifecycle.availableSteps` incl. `optional` :515-525. Disabled steps never injected. OK
- --help documents `optional: boolean` on availableSteps: status.ts:108,111. OK
- DAG via `resolveChangeSchemaForCli` (change.schemaName/version, not workspace default): status.ts:236,408; helpers/change-schema.ts:14-37; renderDag uses dag.roots/childrenOf and `visited` set to render each node once :579-604. OK
- schemaWarnings text `warnings:` (:285-293) and JSON (:444); no stderr warning. OK
- Drafted: command null (:147), `availableTransitions: []`, `availableSteps: []` (:193-194), no artifactDag (:189), `(none - change is drafted)` (:178). OK
- Display status fallback displayStatus -> effectiveStatus -> state: :384,393,483,490, DAG :611. OK
- Blocker labels `! CODE - label: msg` :265-269; JSON label/checkId :449-450. OK
- review header w/o affected files :274-283; overlap peers :367-379. OK

### Discrepancies

- LOW: no test asserts the --help text documents `optional` on `availableSteps` (test/commands/change/status.spec.ts:65-72 only checks overlapDetail and schema.artifactDag). Code compliant (status.ts:108,111).
- LOW (carried): scenario "Pipeline display annotates optional steps and omits disabled steps" third bullet (bypass paths in availableTransitions) is purely Core-projected; CLI renders `transitions:` verbatim (status.ts:304-306) - correct per spec ("CLI MUST NOT filter").

### Test Coverage (test/commands/change/status.spec.ts)

- Pipeline canonical order + omit disabled (text and JSON): covered :1527-1570 (RESOLVED prior MEDIUM 1; asserts `ready, implementing [optional], done`, no verifying, JSON order). `optional` in JSON entries asserted in :1572-1655 (`optional: true`).
- Optional annotation: covered :1572. Disabled omission: covered :1527.
- Drafted JSON empties / nextAction null: covered :74-106; text drafted :108-139.
- Lifecycle from GetStatus (no verifying, nextAction): :1117,:1144.
- DAG from change schema: :752; schema advisories: :715,730,741; different-default-not-drift: :730 (covered).
- Overlap/review/drift/labels/hasTasks/task counts/display fallback: covered (:786-:990,:1044,:246,:324,:1207-1323).
- Convergent node not repeated: :1075 (weak-to-covered; renderDag visited set).
- Drafted JSON "Core leaks hops" :74 covers availableTransitions/availableSteps.

### Missing Tests

- --help documents availableSteps.optional (LOW).

### Summary

Reqs 20/20 compliant; scenarios all covered; 0 HIGH, 0 MEDIUM, 2 LOW. Prior MEDIUM (1) RESOLVED.

## cli:change-transition

### Requirements Summary

`<step>` xor `--next`; `--next` passes `to:'next'` to Core (no local table, no shortcut policy); disabled steps skipped by Core; HappyPathNextUnavailableError -> exit 1 with error; check progress presenter with skip markers and conditional re-check; repair guide; skip-checks translation; GetStatus refresh=false; structured stream records.

### Implementation Status

- Mutual exclusion / required messages: transition.ts:194-210 (cliError exit 1 before any kernel call, :338). OK
- `--next` -> `to: 'next'` verbatim, no local resolution or shortcut evaluation: :372-373, :381-387. OK
- HappyPathNextUnavailableError mapped to repair guide + exit 1: :95,:103,:408-416 (writes `error:` to stderr first, :133). OK
- skipChecks translation (+legacy aliases, dedupe): :345-359,:386. OK
- GetStatus refreshImplementationTracking:false pre (:363-366) and in repair guide (:409-412); no direct refresh calls. OK
- No approval flags passed: :381-387. OK
- Skip rendering / re-check: \_check-progress-presenter.ts (skip marker `⊘ ... (skipped: reason)`, hookRan gating, `Re-checking after hooks` once). OK
- JSON stream `change-transition`, complete record ok/failure: :394-405,:418-433. OK
- Bypass/command lines in repair guide: :157-169. OK

### Discrepancies

- LOW: presenter labels every hook-check skip as `--skip-hooks` whenever any `--skip-hooks` phase is given (transition.ts:377 `skipHooks: skipHookPhases.size > 0`; presenter skipReason). With e.g. `--skip-hooks source.post`, a `hook.pre` that Core skipped for "no hooks configured" would be mislabeled `--skip-hooks` instead of Core's reason. Spec says reason e.g. `--skip-hooks`... "not applicable". Interpretation A (spec): label should reflect actual cause; B: acceptable approximation. Not a scenario failure (scenario only uses `all`).
- LOW (carried): no CLI-level test for `--next` past a disabled step; CLI correctly delegates (`to:'next'`), behaviour is Core's (nextWorkflowStep). Scenario "Next flag skips disabled step" has only delegation evidence (transition.spec.ts:82-106 asserts `to:'next'`).

### Test Coverage (test/commands/change/transition.spec.ts, check-progress-presenter.spec.ts)

- skip-checks CSV / aliases / dedupe: :1400-1510 covered. Mutual exclusion & missing: :56,:68 covered.
- `--next` -> to:'next': :82; optional shortcut not taken: :108-135 covered (strong).
- `--next` failure states (pending-spec-approval, pending-signoff, archivable): :832-905 covered; HappyPathNextUnavailable repair guide: :1663 covered.
- Skipped hooks rendered as skipped / re-check only when hooks ran: presenter spec :39,:46,:62,:76 covered (unit level); end-to-end `--skip-hooks all` text rendering via command: weak (only phases forwarding :909).
- Repair guide, mandatory vs skippable bypass, refresh=false, structured complete records, hook failure context: covered (:748,:1509,:1541,:457,:539,...).
- Next skips disabled step: weak (delegation only).

### Missing Tests

- CLI `--next` with disabled step (LOW; Core-owned semantics).

### Summary

Reqs 14/14 compliant; 0 HIGH, 0 MEDIUM, 2 LOW.

## cli:change-validate

### Requirements Summary

Artifact model/DAG from change's sovereign schema; unresolvable schema exit 3 with `fatal:` in every mode; identity mismatch keeps `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; advisories rendered; --all topological walk; output formats.

### Implementation Status

- Schema resolve helper maps failure to `cliError(msg, fmt, 3, code)` -> prefix `fatal` for exit 3 (handle-error.ts:45): validate.ts:221-237. OK
- Single-spec mode resolves schema first regardless of --artifact: validate.ts:400 (so exit 3 holds even without --artifact). OK
- Core-raised mismatch (validate.execute rejecting) mapped: handle-error.ts:178-186 (exit 3 + code, diff +3 lines). OK
- --all uses `schema.artifactDag().topologicalOrder()`, change-scoped without specPath, spec-scoped per specId: :101-158. Advisories text :204-205, JSON `schemaWarnings` :212. OK
- Unknown artifact ID, mutual exclusion messages: :323-329. OK

### Discrepancies

- LOW: batch with `specIds.length === 0` returns "no specIds declared" with exit 0 before schema resolution (validate.ts:91-99), so an unresolvable schema is not exit 3 in that edge. Spec: "in every mode". Edge, not scenario-tested.
- LOW: when `--artifact` absent and `specPath` given, schema is resolved twice (validate.ts:400 and in loadInlineDiffReview :254) - efficiency only.
- Scenario 'Unresolvable change schema' now reads `fatal:` (prior LOW) - code prints `fatal:` (handle-error.ts:45). RESOLVED/consistent.

### Test Coverage (test/commands/change-validate.spec.ts)

- Schema from change not default: covered :728. Exit 3 unresolvable (--all): :753 (asserts exit 3 + message; does not assert `fatal:` -> weak on prefix; `fatal:` asserted in :781 and :799).
- Single-spec unresolvable without --artifact: weak - :799 mocks validate.execute rejecting with identity mismatch, not resolveSchema rejecting; code path :400 untested directly.
- Identity mismatch code in JSON: covered :781.
- Advisories text/JSON: covered for single-spec :815,:831; for `--all` (scenario "Version advisories are rendered", `--all`): weak - no `--all` advisory test (validate.ts:204,212 untested).
- Batch scenarios: :460-:664 covered. Unknown artifact: covered via use-case mock (existing).

### Missing Tests

- `--all` renders/serializes SCHEMA_VERSION_DRIFT advisory (LOW-MEDIUM weak: same helper tested in single mode).
- single-spec exit 3 when resolveSchema rejects without --artifact (LOW).

### Summary

Reqs 11/11 compliant; 0 HIGH, 0 MEDIUM, 3 LOW (+2 weak scenarios).

## cli:change-spec-preview

### Requirements Summary

`--artifact` resolution/scope/filename from the change's sovereign schema; schema resolution failure and identity mismatch -> non-zero error; merged/diff/JSON modes; error handling; artifact filtering errors.

### Implementation Status

- Schema via `resolveChangeSchemaForCli` (never workspace default): packages/cli/src/commands/change/spec-preview.ts:81-98. OK
- Resolution failure -> exit 3 `fatal:` with `SCHEMA_RESOLUTION_FAILED`, mismatch -> `SCHEMA_PROVIDER_IDENTITY_MISMATCH`: :87-97. Without `--artifact`, `PreviewSpec` raises mismatch -> handleError exit 3 (handle-error.ts:178-186). OK
- Unknown artifact / non-spec scope / not in change -> `error:` exit 1: :100-121. OK
- Labels :141-150, header :163/:179, chalk colours :166-174, diff omitted when none :160, JSON passthrough :184, warnings to stderr :76-78. OK

### Discrepancies

- LOW (carried): version advisories are rendered only when `--artifact` is given (spec-preview.ts:80-86,131-133); without it no resolver call is made in the CLI. Spec "Artifact names from the change's schema" only requires resolution for `--artifact`; no scenario demands advisories here. Not a violation.
- LOW: with `--artifact`, the schema is resolved after `preview.execute` (:69 vs :84), so an unknown artifact still pays for a full preview first. Efficiency only.

### Test Coverage (test/commands/change/spec-preview.spec.ts)

- Minimal/diff/labels/filtering/JSON/no-preview/not-found/spec-not-in-change/warnings: covered :91-:411, :416-:672.
- `--artifact` resolves against change schema: covered :674-:703 area (resolveSchema mock); unresolvable exit 3: :675; identity-mismatch code: :704; advisories on stderr: :735. Covered.
- Non-existent artifacts / scope / not in change: :572,:602,:636 covered.

### Summary

Reqs 8/8 compliant; 0 HIGH, 0 MEDIUM, 2 LOW.

## cli:change-artifacts

### Requirements Summary

Per-file rows in schema order; drift-aware display state; `hasDrift`/`displayStatus` in JSON; artifacts listing, order and `delta` flags from the change's sovereign schema; "Schema resolution failures and SchemaProviderIdentityMismatchError SHALL be reported as errors with a non-zero exit code."

### Implementation Status

- Rows/display state/JSON: packages/cli/src/commands/change/artifacts.ts:88-152 (displayStatus, hasDrift), text :163-176, JSON :180-188. OK
- Order: follows `GetStatus.artifactStatuses` (Core, schema-declared). OK
- Schema read for `delta` flags via `resolveChangeSchemaForCli` (change identity, not default): :59. OK
- NON-COMPLIANT: the resolver call is wrapped in a bare `catch { /* skip delta entries */ }` (artifacts.ts:58-71). Any resolution failure, including `SchemaProviderIdentityMismatchError`, is swallowed: exit code 0, no error, delta rows silently omitted (GetStatus itself reports resolution problems as blockers rather than throwing, so nothing else raises). This contradicts the requirement "Artifact listing from the change's schema" (spec: errors with non-zero exit code).

### Discrepancies

- MEDIUM: artifacts.ts:69-71 swallows schema resolution failure / identity mismatch. Interpretation A (spec is right): must rethrow (except ChangeNotFoundError) and exit 3 as validate/spec-preview do (handle-error.ts:178-186 already maps the mismatch to exit 3). Interpretation B (code is right: listing is still useful when schema is broken): then the spec sentence must be weakened to "SHALL be reported as advisories" and the command should at least print a warning. Currently neither holds. Previous audit rated this LOW; it is an explicit requirement sentence with no implementation and no test, so MEDIUM.
- LOW: artifact-level summary row for multi-file artifacts: `displayStatus` derived from `a.displayStatus` (:117) only in the zero-file case; spec's "summary row derives from file-level display states" is satisfied trivially (no multi-file summary row exists). Not a violation.

### Test Coverage (test/commands/change-artifacts.spec.ts)

- Text/JSON columns, drift display (`complete-with-drift`), hasDrift/displayStatus, not found, missing name: covered :43-:262.
- Listing follows change schema: covered :265 (asserts getActiveSchema not consulted).
- Advisories text/json: :323,:334 (extra, not required by spec).
- MISSING: no test for resolution failure or identity mismatch producing a non-zero exit (grep for Mismatch/mockRejected on resolveSchema returns nothing in this file).

### Missing Tests

- Schema resolution failure / `SchemaProviderIdentityMismatchError` -> non-zero exit (MEDIUM, goes with the fix).

### Summary

Reqs 5 compliant, 1 non-compliant; 0 HIGH, 1 MEDIUM, 1 LOW.

## skills:workflow-automation

### Requirements Summary

Plural canonical commands; routing from `nextAction` / `lifecycle.availableTransitions`; no hooks for bypassed/disabled steps; explicit skill target handling; no fixed chains/completion messages; approvals from structured status; verify/compliance attempt ownership; automated template protocol validator over templates and installed copies; spec read surfaces; outlines; traceability; context optimisation.

### Implementation Status

- specd-verify routing: packages/skills/templates/skills/specd-verify/SKILL.md.tpl:43-62 (explicit-invocation mapping, "stop before running any hooks", "never run verifying hooks when verification is disabled or bypassed"), :91-136 entry only `If verifying is in lifecycle.availableTransitions`, hooks/transition inside `<!-- route: target -->` blocks with `<target>/<source>` placeholders (:96-111,:123-130,:254-259,:326-338,:371-417,:460). OK
- Prior MEDIUM 2 (fixed-chain prose): verify tpl :59-62 now says "never substitute a fixed state sequence"; the old arrow chain is gone; remaining arrows are `designing` -> `ready` -> human approve (:51-52, spec-consent recovery, not a delivery chain) and `verifying` -> `verifying` not a hop (:136). implement tpl :45 "never fall back to a fixed `ready -> implementing -> verifying` sequence" is a prohibition (regex needs a second arrow; passes). RESOLVED.
- Installed copies re-synced: all five (.claude/.agents/.codex/.github/.opencode)/skills/specd-verify/SKILL.md contain the reworded paragraph (grep count 1 each); copies are git-ignored, and the validator test asserts existence and content for all of them.
- Validator: packages/skills/test/template-protocol.spec.ts:13-78 (literal-transition, literal-hook, fixed-completion, routed-literal-target, text-approvals-read, new `fixed-chain` rule :27-29,:77), runs over templates and 5 copies x 4 skills (:131-146) plus shared.md.tpl check (:148-153). Spec lists three rules; extra rules are stricter, consistent.
- specd-new state table (specd-new/SKILL.md.tpl:143-153) keys suggestions off `nextAction.targetStep`, so it follows Core routing; it is outside the validator's four-skill scope (spec scope = design/implement/verify/archive). Consistent with spec; LOW note.
- Approvals from structured status: `text-approvals-read` rule + no `approvals:` line parsing in templates (validator passes). OK
- shared.md.tpl: no fixed delivery-state hook list (test :148). OK

### Discrepancies

- LOW: scenario "Skill does not invent optional-step policy" and the "empty effective skip-check set needs no invented condition / done remains mandatory regardless of signoff configuration" bullets of "Generated lifecycle guides preserve semantic routing invariants" have no explicit template sentence or test asserting them (templates simply defer to `availableTransitions` as sole source of legal targets, verify tpl :44-45; no template inspects tasks or `optional`). Behaviour compliant by absence; tests weak (generated-skill-protocol.spec.ts:119-139 only check preferred-default / explicit target / stop-before-hooks phrases).
- LOW: `specd-compliance` / `specd` / `specd-fasttrack` templates are outside the validator; spec limits it to four lifecycle skills, so no violation.

### Test Coverage

- Template protocol validator rules incl. fixed-chain: covered (template-protocol.spec.ts:90-160; local run PASS).
- Current templates and installed copies pass: covered (:131-146).
- Specd-verify skips verifying hooks when disabled: covered by template-workflow.spec.ts:340-347 (phrase) + validator (no literal verifying hook).
- Explicit invocation/stop when target absent; installed copies parity: generated-skill-protocol.spec.ts:104-139, template-workflow.spec.ts:349-356.
- Attempt ownership/delegated compliance: template-workflow.spec.ts:257,283; generated-skill-protocol.spec.ts:91.
- Routing tests on real templates (no in-test routing function): template-workflow.spec.ts only has helper `complianceDecision` (:12) which parses real template content; OK.
- Weak: optional-step policy non-invention; `done` mandatory regardless of signoff (LOW).
- Focused runs: skills template-protocol/generated-skill-protocol/template-workflow all PASS; CLI status/transition/validate/artifacts/spec-preview/presenter specs all PASS.

### Summary

Reqs: all compliant; 0 HIGH, 0 MEDIUM, 2 LOW. Prior MEDIUM 2 RESOLVED.

## Batch F totals

- HIGH 0, MEDIUM 1 (new/escalated: cli:change-artifacts bare catch swallows schema resolution failure and identity mismatch, artifacts.ts:58-71, no test), LOW ~12.
- Prior MEDIUM 1 (status canonical order/omit disabled tests): RESOLVED (status.spec.ts:1527-1570).
- Prior MEDIUM 2 (verify fixed-chain prose + installed copies + validator rule): RESOLVED.
- Prior LOW `fatal:` wording in change-validate scenario: RESOLVED (handle-error.ts:45; spec text updated).
- Carried LOW: spec-preview advisories only with --artifact; specd-new table outside validator; no CLI test for --next past disabled step.
- New LOW: hook-skip reason label approximation (`--skip-hooks` for any hook skip when any phase flag is passed); validate --all with zero specIds skips schema resolution; `--all` advisory path untested; single-spec exit-3 path (no --artifact) untested directly.

BATCH VERDICT: FAIL

---
