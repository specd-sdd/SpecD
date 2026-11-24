# Partial batch B (round 9, verification-attempt-11): core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change

Read-only audit. Merged previews via `changes spec-preview` (spec + verify). No code/spec/doc modified, no lifecycle commands run.

## Tests run (core, vitest json reporter)

- Targeted (transition-change*, invalidate-change*, archive-change*, transition-checks*, reconcile, verification-current, application/checks, application/services, domain/errors): 35 files, 473 tests, 473 passed, 0 failed.
- Full @specd/core suite: 286 files, 4053 tests, 4051 passed, 2 todo (config-writer.spec.ts, unrelated), 0 failed.
  - transition-change.spec 131, transition-change-audit 6, audit-2 9, ready-audit 1; invalidate-change.spec 27 (+ next-action 3, policy-audit 10, ready-audit 7); archive-change.spec 121 (+ audit 5, batch-restore 8, input 2, links-audit 10, skip-ids-audit 4).

## Round-8 re-verification

1. No `--skip-hooks` in transition-checks: CONFIRMED. Only case-insensitive hit is the scenario title "Skip-hooks still runs predicates" (verify, "Predicate versus effect"); body uses `skipHookPhases` containing `all`. No flag syntax. LOW (L1): title borrows CLI-flag naming; suggest "skipHookPhases all still runs predicates".
2. transition-change "Transition delegation" signature: CONFIRMED. `transition-change.ts:426` `freshChange.transition(effectiveTarget, actor, schema, this._approvals)`; `Change.transition(to, actor, schema?, approvals?)` at `domain/entities/change.ts:928`. No direct test asserts the four args (entity is real in tests, so approvals/schema legality is exercised implicitly). LOW (L7).
3. archive-change "Archivable guard" + Constraints wording vs code: Constraints bullet MATCHES (`archive-change.ts:378` inline state check after `reconcile.execute`, again at :481 after post-hook reconcile, and `assertArchivable()` inside `mutate` at :581). Residual wording defects remain, see D-A1..D-A3 below.
4. ArchiveChange.execute @throws (ArchiveOrphanBackupError, DeltaApplicationError, ArtifactParseError): each VERIFIED to propagate.
   - ArchiveOrphanBackupError: `detectOrphans` (:571) inside try/catch that records failure and rethrows (:575-577); adapter throws it for corrupt, recovered-own, and foreign orphan (`infrastructure/fs/archive-batch-snapshot.ts:60,78,86`). Tested (archive-change-batch-restore.spec.ts:352,417).
   - DeltaApplicationError: thrown from `formatParser.apply` in `_prepareArchivePlan` (:851), inside the prepare try/catch which rethrows the original (:532-540). Tested (archive-change.spec.ts:2398).
   - ArtifactParseError: from `formatParser.parse` / `yamlParser.parseDelta` (json/yaml parsers) in the same prepare path, and from `extractMetadataFromSpecArtifacts` (no catch in it); rethrown unchanged. NOT tested at use-case level (M-T1).
   - Missing from @throws (all LOW): (a) plain `Error` from `resolveSealedArchiveDependsOn` (`application/services/resolve-sealed-archive-depends-on.ts:59`) when no ContentHasher is supplied for a lock-less existing spec; reachable via direct construction since `hasher` is `ContentHasher | undefined`; also contradicts spec "Typed errors" (MUST NOT throw generic Error), see D-A4. (b) `HookFailedError` also reachable from after-persist (post) effects whose binding `onFailure` is not `collect` (:733-735); @throws only mentions pre-archive hooks. (c) arbitrary repository/IO errors from publish/archive are rethrown by `_handleCommitFailure` (:1134) - acceptable, unlisted by design. (d) `InvalidCompositionFactoryArgumentsError` is on the ctor doc only (fine).
5. Regression sweep rounds 4-9:
   - CLI strings in core: none in the four use cases, `application/checks`, `application/errors`, `domain/errors`, `domain/services/transition-checks.ts`, `domain/checks`. Messages checked: HappyPathNextUnavailableError ("cannot advance to next state: ..."), InvalidateRequiresForceError (no `--force`), InvalidInvalidateTargetError ("targets"/"policy", no `--target`), ReconciledOperationBlockedError ("Follow the '<intent|action kind>' next action"), CheckPredicateFailedError. Only residual mention: `archive-change.ts:90` JSDoc says "Delivery mechanisms (CLI flags) translate..." (comment, INFO). Spec text mentions of `--next`, `--force`, `--target`, `--allow-out-of-scope`, `--skip-checks`, `--allow-overlap`, `/specd-verify` are all negative assertions ("MUST NOT contain"), correct. `specd change validate` in archive verify is fixture prose content, correct.
   - skipChecks / skippedCheckIds naming: consistent and documented. Use cases take `skipChecks`; `lifecycle-verdict` option is `skippedCheckIds`, and transition-checks "Projections" explicitly states both names. No `skipCheckIds`/`skippedChecks` strays. No `skipHooks`/`--skip-hooks` anywhere in core src.
   - Governance table in `domain/services/check-bindings.ts` matches transition-checks "Registry bindings" (Category A/B/C, archive locks for workspace.readOnly/deps.consistent/impl.filesResolved, skippable only spec.overlap + impl.linksInScope on archive, hook phase/onFailure rows, `exceptAlong: ['recovery']` for hook.pre).
   - Check actions: approval.spec/approval.signoff emit approve-spec/approve-signoff; verification.current emits start-verification (supersedesIntent false) for REQUIRED/IN_PROGRESS/STALE and refresh-status for VALIDITY_UNAVAILABLE; no `details.command`. Matches spec.
   - Composition: resolveTransitionChangeDeps / resolveInvalidateChangeDeps / resolveArchiveChangeDeps field lists match their specs (checkRegistry spread conditionally; spec lists it unconditionally, INFO).

## Per-spec results

### core:transition-checks

Requirements Summary: 24 requirements (check identity/result, Check ABI, CustomCheckDefinition, one-file-per-check, applicability from/to/along, step-skip scope, dynamic binding composition, archive-as-operation, pipeline phase/failure policy, predicate vs effect, evaluation of an attempt, shared candidate evaluator, shared validity verdict, single reconciliation owner, registry bindings, actionable diagnostics, host-neutral impl message, check-declared actions, generic progress bus, projections, no snapshot bag, approval precedence, legacy parking bindings, verification currency bounds, structured failure details). 104 verify scenarios.
Implementation Status: Implemented. Spot-verified bindings table, effect phases, actions, protocol.edge fail-fast (execute mode) in `evaluate-transition-candidate.ts:112`, host-neutral messages. All targeted tests green.
Discrepancies:

- L1 (LOW): scenario title "Skip-hooks still runs predicates" uses flag-style name; body is host-neutral.
- INFO: verify scenario "Parked approval is reported before protocol edge failure" relies on the parked->implementing edge being topology-legal; consistent with transition-change "Historic parked approval repair precedence" but the interplay with execute-mode protocol.edge fail-fast is only implied.
  Test coverage: evaluate-transition-candidate, execute-matching-predicates, matching-effects, validate-skip-checks, host-neutral-projections, lifecycle-guidance, transition-checks-audit(-2), verification-current, workflow-check-factories specs. Scenario titles do not map 1:1 to test names; coverage assessed by area, not title.
  Missing tests: none identified blocking.
  Counts: HIGH 0, MEDIUM 0, LOW 1, INFO 1.

### core:transition-change

Requirements Summary: 28 requirements (input contract, baked approvals, existence, optional pre-refresh + mandatory post-hook refresh, spec-approval/signoff as checks, parked-state failures, direct transition, canonical pre-transition reconciliation incl. committed recovery reporting, workflow.requires, task completion, implementation-only retry, verification lifecycle, backward-hop invalidation, designing from any state, archiving->archivable, pre/post hook execution, delegation, transitioned event, implementing tracking activation, persistence via mutate, result, progress, dependencies, `to: next`, host-neutral HappyPathNextUnavailableError, bypassed step evaluation, shared runner errors, factory deps, historic parked precedence). 91 verify scenarios.
Implementation Status: Implemented and consistent. Verified: reconcile -> committed recovery (`ReconciledOperationBlockedError` with evaluateLifecycle nextAction using `evaluateLegalTargets`, not empty checksByTarget; context-free `InvalidStateTransitionError` when no automatic return); mandatory reconciler throws `InvalidCompositionFactoryArgumentsError`; second reconcile with forced tracking refresh + predicate rerun before persistence; `mutate` applies signoff invalidation, `transition(effectiveTarget, actor, schema, approvals)`, tracking activation; effects selected by binding phase via `matchingEffects` (no check-id switch); skipChecks validated by `validateSkipChecks` against resolved bindings (Unknown/NotSkippable incl. effect checks); host-neutral nextAction reason; HappyPathNextUnavailableError exposes `state`.
Discrepancies:

- L2 (LOW): `TransitionChange` class JSDoc (`transition-change.ts:114-116`) still says "Pending parking states are drain-only for in-flight changes"; spec "Historic parked approval repair precedence" says no drain-specific rules, only bound checks.
- L3 (LOW): verify scenario titles "Parked spec approval rejects a non-drain target" / "Parked signoff rejects a non-drain target" keep drain vocabulary the spec removed.
- L4 (LOW): `execute` @throws says InvalidStateTransitionError "Only for a committed movement with no automatic return", but `freshChange.transition()` inside `mutate` can still throw it (concurrent state change / entity rejection), per spec Constraints which reserves it for exactly that entity rejection.
- INFO: spec Dependencies lists CheckRegistry/ResolveChangeSchema as dependencies without "optional"; code treats `checkRegistry` as optional and `reconcile?` optional-in-signature-but-enforced.
  Test coverage: transition-change.spec (131), audit/audit-2/ready-audit, reconciled-transition-status, evaluate-transition-candidate; committed recovery (spec L136/L180), skip validation (L3090-3112), refresh semantics (L410), mutate persistence (L453), hooks (L1401+), next (L298+).
  Missing tests: L7 no explicit assertion of the 4-argument `change.transition` call (implicit only).
  Counts: HIGH 0, MEDIUM 0, LOW 4 (L2, L3, L4, L7), INFO 1.

### core:invalidate-change

Requirements Summary: 17 requirements (input, effective policy, policy-dependent target rules, target normalization/accumulated errors, approval guard with effective-policy force preview, canonical gate-safe recovery, manual cause, policy-aware effects, traversal order, no invented drift, idempotence, output contract, factory deps, sovereign schema, nextAction from lifecycle guidance). 29 verify scenarios.
Implementation Status: Implemented. Verified: shape validation before schema resolution and any mutation; accumulated target errors; guard + invalidation inside one `reconcile.mutate`; guard reads post-pre-pass change so fingerprint-stale consent needs no force; `forceRecoveries` uses effective policy and `previewArtifactReviewRequired`; use case never calls `Change.invalidate`; cause `artifact-review-required` set by reconciler (`reconcile-change-validity.ts:662`); nextAction from `evaluateLifecycle` over `evaluateLegalTargets` with neutral fallback `{targetStep, actionType:'cognitive', intent:null}`; errors host-neutral.
Discrepancies:

- INFO: spec says guard is computed from "canonical reconciled verdict (observe pass)"; code reads the projection status after the reconciler pre-pass (`consentToRevoke`). Equivalent in effect, wording differs.
- INFO: `execute` @throws omits errors that can surface from the reconciler/mutate (lock/IO); acceptable.
  Test coverage: invalidate-change.spec (27), policy-audit (10), ready-audit (7), next-action (3). Covers force preview, ready-stays-in-ready, redesign, verifying-disabled routing, target/policy validation.
  Missing tests: none identified.
  Counts: HIGH 0, MEDIUM 0, LOW 0, INFO 2.

### core:archive-change

Requirements Summary: 29 requirements (ports/ctor, bindings-not-RunStepHooks, input, sovereign schema, ArchivedChange construction, archivable guard, canonical validity preflight, deferred transition, readOnly guard, overlap guard, pre-archive hooks, tracked selection, prepare plan, staged commit, batch snapshot/restore/orphans, lifecycle rollback, debug logging, delta merge, validity preservation, repository call, index metadata, post hooks, metadata generation, spec-lock sidecar, result shape, typed errors, shared runners, effective bindings/skip validation, impl review/materialization/out-of-scope guards, factory deps, fallback snapshot lifetime). 178 verify scenarios.
Implementation Status: Implemented. Verified execute order: load -> resolve schema -> reconcile -> inline state guard (ReconciledOperationBlockedError if recovery committed, else InvalidStateTransitionError) -> resolveEffectiveBindings -> validateSkipChecks -> predicates (failFastOn schema.nameMatch) -> peer invalidation when spec.overlap bypassed -> before-persist effects -> post-hook reconcile (+state guard) -> predicate rerun -> `postHookValidityBlocksArchive` -> plan -> preflight (+deps.consistent rerun) -> orphan detect + snapshots -> `mutate{assertArchivable; transition('archiving')}` -> publish -> archive -> cleanup -> metadata -> after-persist effects. Batch restore + rollback to archivable on success, ArchiveBatchRestoreError otherwise.
Discrepancies:

- D-A1 (MEDIUM, spec-internal/spec-vs-code): requirement "Archivable guard" says "After the schema name guard, execute() MUST evaluate `archive.archivable`", but code runs the state guard BEFORE the archive predicates (so before `schema.nameMatch`); "Skip validation" paragraph and verify "State guard precedes skip validation" say the opposite order relative to validation. A schema-name mismatch on a non-archivable change yields InvalidStateTransitionError, not the nameMatch failure. Fix spec wording to "after schema resolution, before predicates".
- D-A2 (LOW): verify scenarios "Change not in archivable state" and "Guard runs after archivable check and state transition" (readOnly) still say InvalidStateTransitionError is "thrown from `assertArchivable()`"; in code the pre-publication guard is the inline check (`new InvalidStateTransitionError(change.state,'archiving')`); `assertArchivable()` only runs inside the later mutate. Also, when reconciliation committed a recovery the error is ReconciledOperationBlockedError, not InvalidStateTransitionError (spec covers this elsewhere). Round-8 fixed the Requirement/Constraints text but not these scenarios.
- D-A3 (LOW): "Typed errors" lists `CheckPredicateFailedError ... including archive.archivable`; with the inline guard the registered `archive.archivable` predicate cannot fail except in a race, so this is effectively unreachable (INFO-grade).
- D-A4 (LOW): "Typed errors" says ArchiveChange MUST NOT throw generic Error and lists `ArchivePreflightError`; that class does not exist anywhere in `packages/` (only in specs/core/archive-change spec+verify), and `resolveSealedArchiveDependsOn` throws plain `Error` (missing ContentHasher). Spec references a non-existent error class.
- D-A5 (LOW): Debug-logging requirement lists "archivable guard pass", per-spec orphan-detection outcomes, batch snapshot per spec, tracked-selection direct vs delta, backup cleanup; in `archive-change.ts` there is no archivable-guard log (22 Logger.debug calls; snapshot adapter has 9). Pre-existing, not touched by this change.
- D-A6 (LOW): `execute` @throws missing items noted in Round-8 item 4 (plain Error; HookFailedError from after-persist abort bindings).
- INFO: `archive-change.ts:90` JSDoc mentions "CLI flags".
  Test coverage: archive-change.spec (121), audit (5), batch-restore (8, incl. orphan errors), input (2), links-audit (10), skip-ids-audit (4); reconciled preflight (L3819+), skip validation (L4574+), archiving transition (L3280+), DeltaApplicationError (L2398).
  Missing tests: M-T1 ArtifactParseError propagation from execute (base artifact / delta unparsable) has no use-case test; M-T2 missing-ContentHasher path untested; M-T3 after-persist hook with `onFailure: abort` throwing HookFailedError untested; M-T4 no test for the inline-guard vs `archive.archivable` ordering relative to schema.nameMatch (see D-A1).
  Counts: HIGH 0, MEDIUM 1 (D-A1), LOW 5 (D-A2, D-A4, D-A5, D-A6, M-T1 grouped as missing tests), INFO 2.

## Overall counts (batch B)

HIGH 0 | MEDIUM 1 | LOW 11 (L1, L2, L3, L4, L7, D-A2, D-A4, D-A5, D-A6, D-A3 counted as LOW-INFO, missing-test items M-T1..M-T4 not counted) | INFO 6. Test results: 473/473 targeted pass, 4051/4053 full core pass (2 todo), 0 failures.
No regressions found for rounds 4-9 (no CLI strings in core runtime messages, naming consistent, `--skip-hooks` absent).
