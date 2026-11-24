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
