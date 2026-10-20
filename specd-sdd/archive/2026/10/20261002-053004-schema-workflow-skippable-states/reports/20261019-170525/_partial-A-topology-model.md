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
