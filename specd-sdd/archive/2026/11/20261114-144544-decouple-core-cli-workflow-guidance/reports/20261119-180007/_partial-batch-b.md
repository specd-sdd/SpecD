# Partial batch B - round 12 audit (verification-attempt-14)

Scope: core:archive-change, transition-change, transition-checks, edit-change, create-change, workflow-topology, approve-spec, approve-signoff + public API surface. READ-ONLY; nothing modified.

## Test results

- core: 68 files / 688 tests pass (archive-change-audit, archive-change, transition-change\*, edit-change, create-change, archive-batch-snapshot infra, test/composition).
- sdk: 18 files / 187 tests pass (barrel type-equality included).
- guide sdk-catalog.spec: 26 pass. cli guide-sdk: 72 pass.

## (1) Archive debug logging (core:archive-change)

Verified in code: metadata failure log has `step:'metadata'` + specId (archive-change.ts ~732); metadata skip log has step+specId+reason; `_recordArchiveFailure` log carries `specId: specIdOfError(error)` (~1208); preflight failure logs (both prepare + preflight catch) carry change/step/specId/code/message; Logger-spy tests exist in archive-change-audit.spec.ts (lines 619-1000: guard outcomes, overlap entries, readOnly workspaces, preflight failure, metadata failure/skip, delta source, commit-phase failure + restore, partial restore, snapshot/orphan failure).
`specIdOfError` (archive-change.ts ~1483): guards non-object/null, reads `.specId`, returns only strings. Cannot throw for any real error type (only a throwing getter on a Proxy would). Errors carrying specId: SpecPublicationError, ArchiveOrphanBackupError (getters), InvalidSpecLockError (string|undefined), WorkspaceNotFoundError. Not misleading.

Entry-by-entry vs requirement - entries still missing or partial:

- MEDIUM: "orphan backup detection - per spec: none found" is NOT logged. fs/archive-batch-snapshot.ts detectOrphans (L44-60) `continue`s silently when no backupDir or manifest unreadable; only matching-auto-restore / foreign-abort are logged (L68). Corrupt-manifest abort (L55-62) also has no log (only the thrown error; ArchiveChange then logs via \_recordArchiveFailure step 'prepare').
- LOW: adapter logs lack the structured `change` field required by "Each entry MUST use ... change": 'restore started' (L179), 'restore failed for spec' (L200), 'restore completed' (L207), 'cleanup completed' (L229), 'recorded created file' (L167). restoreBatch/cleanup/recordCreatedFile ports do not receive changeName, so ArchiveChange-side companions would be needed (ArchiveChange does log rollback/partial restore with change at L1174/1182, and does not log cleanup spec IDs or restore start).
- LOW: "backup cleanup ... spec IDs cleaned" only logged in adapter (no change field); ArchiveChange itself logs nothing around `_batchSnapshot.cleanup` (works only with the fs adapter, not NoopArchiveBatchSnapshot).
- LOW: Failure diagnostics "spec ID and artifact basename when failure is spec-scoped": artifact basename/filename is never logged on failure (e.g. ArchiveArtifactMissingError carries trackedFilename; not extracted). Only specId.
- LOW: no tests for adapter logs (packages/core/test/infrastructure/fs/archive-batch-snapshot.spec.ts has 0 Logger references); orphan / snapshot start-complete / restore / cleanup / recordCreatedFile logs are untested.
- LOW (misleading): preflight failure log hardcodes `code:'ARCHIVE_PREFLIGHT'` regardless of the error's own code, and for non-Error throws message is the fixed 'Archive publication failed' whereas \_recordArchiveFailure logs String(error) - inconsistent. The same message is logged for both plan-prepare and full-batch preflight failures (indistinguishable; both step 'prepare').
- INFO: detectOrphans/snapshot failure is covered only by the 'recorded failed archive attempt' log (step 'prepare', specId) - acceptable.
  Covered OK: guards (overlap peers, readOnly workspaces), pre/post hooks start/complete with skipped phases, plan counts, preflight count, deferred archiving transition (change+actor), tracked artifact selection direct|delta, staged publication start/complete (artifactCount), archive repo start/complete, commit failure (step, commitStarted, message), rollback to archivable, partial restore with failed IDs, metadata generation per spec/skip/fail.

## (2) Public API dangling references

Newly exported & re-exported, with sdk barrel type-equality tests (sdk/test/barrel.spec.ts:99-105): ArtifactReviewTarget, ProjectionChange, ValidityBlocker, FingerprintInputFailure (public.ts:760-763; core-reexports.ts:722-725), ProjectionStatus (public.ts:512 via domain/entities; core-reexports.ts:726), InvalidateChangeResult, ReconcileChangeValidityResult. OK.
Method: TS-compiler-API walk (scratchpad script) over interface/alias/class declarations reachable from each root, flagging referenced symbols not exported by packages/core/src/public.ts.

- CLEAN (no unexported references): ChangeValidityVerdict, AutomaticRecovery, TransitionChangeResult, ArchiveChangeResult, InvalidateChangeResult, ReconcileChangeValidityResult, LifecycleBlocker, CheckResult, CheckAction.
- MEDIUM: GetStatusResult (public.ts:135, sdk core-reexports.ts:106) references types introduced by this change that are NOT exported: `ValidityStatusProjection`, `ApprovalStatusProjection`, `VerificationStatusProjection` (get-status.ts:301/309/317, field `validity`). (ReviewArtifactSummary / ReviewArtifactFileSummary / ArtifactFileStatus also unexported but pre-existing.) Type-checks fine (d.ts per-file) but consumers cannot name them; same class of gap round 12 fixed for the others.
- LOW/INFO: CheckPredicateFailedError constructor references unexported `CheckPredicateFailedOptions` (domain/errors/check-predicate-failed-error.ts; pre-existing pattern, absent on main too). Via the workflow/check types reachable from GetStatusResult/Change class, also unexported and introduced on this branch: CheckOutcome, TransitionAlong, WorkflowStepCheckDeclaration, WorkflowStepSkipCheckDeclaration, WorkflowStepArchiveCheckDeclaration, HookFailurePolicy; and via the Change entity class members: ValidityInvalidationCause, FingerprintDifference, SpecApprovalFingerprint, ArtifactFingerprint(+Algorithm), Sha256Digest, TextNormalizationAlgorithm/BinaryNormalizationAlgorithm, ArtifactInvalidationPolicy, WorkflowInvalidationPolicy, ImplementationFingerprint(+Entry), ValidityFingerprint, ValidationUniqueCount, VerificationAttempt, CompletedVerification, ProjectionInvalidation, SpecApprovalProjection, SignoffProjection, VerificationProjection, TrackedImplementationFile(+State), ImplementationLink, ApprovalDecision, plus events (ArchiveFailedEvent etc., InvalidatedArtifactEntry, pre-existing). These are reachable only through the exported Change class internals; not in a signature directly listed in the task except through GetStatusResult.change. Reported for completeness.
  Guide catalog (packages/guide/generated/guides-sdk.json): catalog 1705 entries; generated API topics = core 662 + code-graph 241 + sdk 779 = 1682; hand-written 23 -> 1705. Matches asserted 1682 / 1705 / core 662 (sdk-catalog.spec.ts:164; guide-sdk.spec.ts:109,111,367,386,467,469,541,550); both spec suites pass, incl. 'page 1 of 3 · 725 of 1682'. Catalog contains interfaces/ArtifactReviewTarget, ProjectionChange, ValidityBlocker, FingerprintInputFailure, InvalidateChangeResult, ReconcileChangeValidityResult. ProjectionStatus has no topic, but the generator emits no type-alias topics at all (0 `type-aliases/` entries) so consistent. ValidityStatusProjection has no topic (not exported). guides-sdk.json and guides.json are modified-tracked files (git status M); I did not run the generator; counts consistent with sources, so INFO only (cannot prove byte-identical to a fresh build).

## (3) transition-change

transition-change.ts:301-303 validates skipChecks on designing->designing no-op. Test transition-change-audit-2.spec.ts:~322 'rejects a non-skippable check ... skipChecks:["hook.pre"]' -> CheckNotSkippableError, mutate not called; unknown id -> UnknownCheckError; empty list returns unchanged. Pass. OK.

## (4) EditChange constructor / seeding

`reconcile: ReconcileChangeValidity` is a required 6th positional param (edit-change.ts:94-102); EditChangeDeps.reconcile required. All construction sites pass it: composition/use-cases/edit-change.ts:105 (+resolveEditChangeDeps from resolver.getReconcileChangeValidity), kernel.ts:443, 9 test sites in core/test/application/use-cases/edit-change.spec.ts (51,462,504,647,693,716,786,1085,1105 - all pass makeObservingReconcile/reconcile), composition tests (mandatory-validity-reconciler.spec.ts, composition/use-cases/edit-change.spec.ts). No `new EditChange(` in sdk, mcp or cli. OK.
create-change/edit-change seeding: covered by core suites above (all pass); no discrepancy found.

## Other specs (workflow-topology, approve-spec, approve-signoff, transition-checks)

No round-12 changes touching these found; tests in the run above pass. No discrepancies.

## Discrepancy summary

- MEDIUM: orphan "none found" outcome (and corrupt-manifest abort) not debug-logged (fs/archive-batch-snapshot.ts:44-62).
- MEDIUM: GetStatusResult dangling ValidityStatusProjection/ApprovalStatusProjection/VerificationStatusProjection (not exported from core public / sdk).
- LOW: adapter logs lack `change` field (L167,179,200,207,229); no artifact basename in failure logs; hardcoded code 'ARCHIVE_PREFLIGHT' and duplicated message for plan vs preflight; no adapter log tests.
- INFO: other unexported types reachable via Change class internals; catalog not regenerated/verified byte-for-byte.

## Missing tests

- Logger-spy tests for fs ArchiveBatchSnapshot (orphan outcomes, snapshot start/complete, restore start/complete/failed, cleanup, recordCreatedFile).
- Type-equality/export test for GetStatusResult's nested validity projection types (once exported).
