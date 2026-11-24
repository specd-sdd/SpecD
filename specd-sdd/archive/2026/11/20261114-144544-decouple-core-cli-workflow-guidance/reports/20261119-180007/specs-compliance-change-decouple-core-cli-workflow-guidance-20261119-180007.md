# Specs compliance report — decouple-core-cli-workflow-guidance (round 12)

Mode: delegated (attempt verification-attempt-14).

## Summary

| Batch                                                          | HIGH | MEDIUM                        | LOW                       | INFO |
| -------------------------------------------------------------- | ---- | ----------------------------- | ------------------------- | ---- |
| A core:get-status, invalidate-change, lifecycle-engine, change | 0    | 1                             | 1                         | 3    |
| B core archive/transition/edit/create, public API              | 0    | 2                             | 5                         | 3    |
| C CLI, error-handling, skills, docs                            | 0    | 1 (unverified, see lead note) | 2                         | 4    |
| D adversarial code review                                      | 0    | 0                             | 3 confirmed + 3 suspected | 0    |
| Total                                                          | 0    | 4                             | 11 + 3 suspected          | 10   |

Lead note on batch C medium: the CLI suite reported "Errors 2 errors" under heavy contention from concurrent agents; verified separately by the lead with a clean run after the agents finished (see the follow-up in the conversation).

Auditor test runs: core 4117, cli 1767, sdk 187, guide 26, skills 183; scratch matrices of 1408 and 960 combinations for the invalidate guard: 0 mismatches. Lead gates before the audit: build 13/13, typecheck 26/26, lint exit 0, prettier, test 25/25, code-graph corpus count 126.

## Detailed Findings

---

# Partial batch A (round 12, verification-attempt-14): core:get-status, core:invalidate-change, core:lifecycle-engine, core:change

Read-only audit. Scratch artifacts only in the session scratchpad (matrix.spec.ts, gs.spec.ts, rec.spec.ts).

## core:invalidate-change

### Requirements summary (changed)

- Guard/preview consider only gates enabled in `approvals` (spec line 52): disabled gate with valid consent is revoked without force, never in `gates`/`recoveries`.
- Preview = single combined recovery (spec > signoff > redesign) using the effective policy, every gate listed with that target (line 56); only-signoff previews `done` past done (line 58).
- Line 64: "Explicit invalidation of a valid approval requires force=true" (general statement).

### Implementation status: COMPLIANT

- `invalidate-change.ts` (`validConsent`, `revoke`/`disabled` split, `forceRecoveries`, `previewArtifactReviewRequired`): matches spec 52/56/58.
- Disabled consent is passed in `intent.revoke` (`disabled` without force, `[...revoke, ...disabled]` with force). Reconciler `fieldAfter`/`approvalField` keep a disabled gate as `not-required`, so it never feeds `selectAutomaticRecovery`.
- Independent matrix (scratch): 11 states (designing, ready, implementing, verifying, done, archivable, archiving + legacy pending-spec-approval, spec-approved, pending-signoff, signed-off) x spec gate on/off x signoff gate on/off x spec consent y/n x signoff consent y/n x policy none/surgical/downstream/global x workflow preserve/redesign = 1408 cases, each run with force=false and force=true on identical fresh builds. Checked: (a) force required iff an enabled gate has valid consent; (b) `gates` equals the enabled valid set; (c) every previewed `recoveries[].target` equals the final state of the forced run; (d) preview does not mutate; (e) no-force success final state equals forced final state; (f) forced run revokes all consents; (g) disabled consent revoked without force; (h) history: exactly one `approval-invalidated` event (status revoked, cause `manual-invalidation`) per revoked disabled gate. Result: 616 previews, 472 forced runs that moved the state, 88 multi-gate previews, 0 mismatches, 0 throws (RECOVERY_ONLY_TRANSITIONS covers every selected recovery).
- Extra: `selectAutomaticRecovery` x RECOVERY_ONLY_TRANSITIONS exhaustive check: 1200 combos (12 states x 5 x 5 fields x 2 workflows x 2), 0 recovery without a table entry.
- History: revocation of a disabled gate IS recorded (`markApprovalInvalid` pushes `approval-invalidated`, status revoked, cause manual-invalidation, reason = request reason). Not stated in the spec (see D2).
- Apart from forced-through-redesign: with only disabled consent and workflow redesign + review required, no force is needed yet the state moves to designing; this is the same as the no-consent case (policy-driven, not consent-driven), consistent with spec 56.
- Approvals source: `InvalidateChange._approvals` and reconciler `deps.approvals` both come from `config.approvals` (composition-resolver.ts:593, 723); they could diverge only in hand-wired tests.

### Discrepancies

- D1 LOW (INFO-ish) spec wording: core:invalidate-change line 64 states "Explicit invalidation of a valid approval requires `force=true`" without the enabled-gate qualifier that line 52 adds; contradicts scenario "Valid consent of a disabled gate is revoked without force" if read literally. Suggest "of an enabled gate".
- D2 INFO spec silent: audit-history event for a silently revoked disabled-gate consent (code emits one). Consider a scenario or sentence.
- D3 INFO: scenario for disabled gate only covers spec gate in `implementing`; signoff-disabled symmetry, `verifying`/`done`, legacy states are code-correct (matrix) but only partly tested.

### Missing tests (invalidate-change-gates-audit.spec.ts)

Discriminating for: disabled spec in implementing/verifying/done (state kept, revoked), only-signoff listing with target done, forced mixed, combined both-gates preview. Missing: disabled SIGNOFF gate with valid signoff consent; history event assertion for a disabled revocation; legacy parking states with disabled gates; redesign override combined with disabled gate. Would fail on regression of `revoke` filtering (yes) but not on history removal.

## core:get-status (`_mergeBlockers`)

### Requirements summary (changed)

- Families spec-consent / signoff-consent / verification; family check failure drops all checkId-less validity blockers of the family, adopted action; per-artifact codes never merged.
- Line 198: per-target skippability from the target's resolved binding (archive from archive bindings only); same check id on several targets merges skippable only if skippable on every target (AND).

### Implementation status: COMPLIANT except D4

- Per-target AND via `transitionSkippable` map, binding chosen by `bindingMatches(b, attempt, attempt.along)` with fallback `sameCheck[0]`; dedupe key `checkId\0code:message` with anonymous-key absorption. Existing scenarios (AND four-way, distinct checks sharing text, adopted action, archive bindings only) pass.
- Order: reviewBlockers first (insertion order), then check failures in target order, then archive; merged Map keeps first position; no order-sensitive consumer found (`_nextActionAfterArchiveOverlap` uses every/find only).
- No lost blocker found: distinct checks with identical code:message stay apart; checkId-less blocker is absorbed by at most one check id.

### Discrepancies

- D4 MEDIUM wrong skippable flag (new-problem hunt, verified by scratch test copying get-status-merge-audit harness): when the same check id fails on a transition target AND in the archive predicates with identical code:message, ownKey is identical, so the archive failure hits `merged.has(ownKey)` and is `continue`d; the merged blocker keeps ONLY the transition skippability. Result matrix (transition skippable / archive skippable -> merged isSkippable): true/false -> TRUE (wrong: archive binding is locked), false/true -> false, true/true -> true, false/false -> false. Violates line 198 (archive failures from archive bindings only) and the AND rule. Realistic: `impl.linksInScope` is bound on `to: verifying along: *` (reachable from archivable) and on archive; a schema `archiveChecks: [{id: impl.linksInScope, skippable: false}]` while the transition stays skippable triggers it. Evidence: get-status.ts:~1127-1160 (final loop, `merged.has(ownKey)` then `continue` without AND-ing archive verdict) and ~1086-1100 (verdict blocker skippability `transitionSkippable ?? archiveSkippable`). Fix: when an archive failure collides with an existing key, AND `archiveSkippable.get(id)` into `existing.isSkippable`, or include source in the key.
- D5 INFO: `archiveSkippable` is seeded for every archive binding when `archiveChecks.length > 0` (not only failing ones), so a checkId-bearing verdict blocker with no transition failure row falls back to a non-failing archive binding verdict; unreachable with current verdict producers.

### Missing tests

get-status-merge-audit.spec.ts "archive failures use archive bindings only" uses different messages for transition and archive failure, so it cannot expose D4. Add a same-message case (true/false). get-status-families.spec.ts fine for families.

## core:lifecycle-engine and core:change (spot check)

- Full @specd/core suite: 1272 suites, 4053 tests, 4051 passed, 0 failed, 2 not run (todo/skipped), 0 failed suites.
- selectAutomaticRecovery vs RECOVERY_ONLY_TRANSITIONS consistent (above); `ready` excluded from spec recovery by design, covered in spec 64.
- No regression observed in overlap override / intents (covered by passing get-status, invalidate-change, reconcile-change-validity suites). No dedicated deep dive beyond tests.

## Counts

HIGH 0, MEDIUM 1 (D4), LOW 1 (D1), INFO 3 (D2, D3, D5). Missing tests: 5 items (4 for invalidate, 1 for merge D4).

---

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

---

# Partial batch C (round 12, verification-attempt-14) - READ-ONLY audit

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Round-12 focus items

### (1) edit text guidance line + shared projectCliNextActionRecord

- edit.ts appendEditGuidance (edit.ts:242-267) prints `guidance:` only when `command === null && guidance !== undefined`, before `reason:`. Matches cli:change-edit scenario "Text output prints guidance when the next action has no command" (spec-preview line ~260) and docs/cli/cli-reference.md:259-261. Test: change-edit.spec.ts:374. Blocker parity: text uses blockerTextLines(blockers), json/toon use projectCliBlocker; bypass line vs bypassFlag derive from the same resolveCliBypassFlag (guidance-presenter.ts:124-153). OK.
- projectCliNextActionRecord (guidance-presenter.ts:398-410): `{...projectCliNextAction, intent: nextAction.intent ?? null, ...(action !== undefined ? {action} : {})}`.
  - Core `LifecycleNextAction.intent` is typed `LifecycleActionIntent | null` (core lifecycle-guidance.ts:22, always set at :230), so `?? null` never converts an `undefined` in practice; JSON/TOON cannot show null-vs-missing difference from core output. The `?? null` only matters for hand-built inputs (CliNextActionInput.intent is optional, :161). No consumer-visible change.
  - edit/invalidate: previously the raw core nextAction was emitted (HEAD); now projected -> adds `command`, optional `guidance`, and overlap-bypass suffix in `reason` only for intent=archive with OVERLAP_CONFLICT blocker (edit/invalidate rarely archive-intent; acceptable, in line with spec "centralized presenter"). Help schemas (verified via `changes edit --help`) list command/guidance?/intent/action? consistently.
  - status: now emits intent/action in nextAction (HEAD emitted only targetStep/actionType/reason/command). This is an intended additive output change; docs/cli/cli-reference.md:125-127 documents it. Drafted status path (status.ts:291-296) still builds a hand-made nextAction without intent/action; docs:125 says exactly that ("no intent or action key is emitted"). OK, consistent.
  - Result: no output regression found across text/json/toon.
- INFO: edit/invalidate text path types: appendEditGuidance param type declares only targetStep/command/guidance/reason - fine structurally.

### (2) transition.ts repair guide `.catch(() => undefined)` (transition.ts:~532-536)

- It is a Promise `.catch`, not a `catch {}` block, so the run.spec.ts:262 guard (regex `catch\s*(\(...\))?\s*\{`) does not see it and cannot flag it. It wraps only `kernel.changes.status.execute(...)`, a core use case that never throws CliExitError (CliExitError is only thrown by CLI command code). So swallowing a CliExitError is not possible in practice. The follow-up `if (status === undefined) throw err` rethrows the ORIGINAL transition error to the outer `catch (err) { handleError(...) }`, which is consistent with the guard's intent (nothing terminal swallowed).
- Spec: cli:change-transition requires repair guide rendered from GetStatus (lines 43, 59, 118) but is silent on status-read failure. Printing only the original error (exit 1 via handleError) is acceptable; the alternative (masking the transition error with the status error) would be worse. LOW: spec does not state this fallback; recommend a one-line scenario ("status read failure during repair guide keeps the original error"), and an in-source comment is already present (transition.ts:~531).
- Tests: transition.spec.ts:822-860 `it.each(['text','json'])` covers text and json; toon not covered (same code path as json; LOW). Test asserts exit(1), original message present, `status exploded` absent. Does not assert that no repair-guide text was printed (INFO).
- Note: swallowing is also silent for diagnostics (no debug trace). INFO.

### (3) read-automatic-return.spec.ts

- Untracked new test (3 cases): undefined stays undefined, null stays null, object copied to new object with only cause/from/to. Matches `readAutomaticReturn` (\_validity-present.ts:432-). Correct and sufficient. Edit.ts uses it at edit.ts:158; edit docs "automaticReturn ... | null" matches --help.

### (4) docs `change edit` vs real --help vs spec

- `changes edit --help` options/schema equal docs/cli/cli-reference.md:239-261 (options table, flags, blockers fields, nextAction fields incl. guidance/intent/action, automaticReturn nullable). Text format in docs `! CODE — label: message` matches blockerTextLines. Help schema nextAction comment "intent ... or null" matches. No discrepancy.
- Minor INFO: docs says "`guidance` (only when command is null)"; help says "advice shown when command is null" - consistent. Projection omits guidance when command non-null: presenter sets guidance only when resolveCliWorkflowGuidance returns it (guidance-presenter.ts:80 ensures it is undefined when a command resolves).
- INFO: docs line 45 area "invalid policy value exits 1 before mutation" is consistent; invalidate.ts moved parseFormat before mutation (invalidate.ts diff) - good.

### (5) Wide docs sweep / stray files

- No contradiction found in the sampled cli-reference sections (change status 125-127, edit 239-261). Not exhaustively diffed docs/core, docs/guide, ADR 0028 in this pass beyond targeted greps (see INFO).
- invalidate.ts removed the " Re-run with --force." tail from the force-warning line (invalidate.ts diff ~235) - verify docs/spec do not quote the old text: grep below.
- Untracked non-change-scope files in repo root (NOT deleted):
  - `0` (0 bytes, mtime Nov 19 16:21:05): almost certainly an accidental shell redirect like `> 0` / `2>&0`-style typo or `echo ... >0` by an agent running verification commands during this session (mtime precedes current work by ~hours; guidance-presenter.ts mtime 16:30). Not created by the CLI under test as far as visible.
  - `EXPLORATION-checks-gates-getstatus.md` (119 KB, Nov 17 08:43) and `EXPLORATION_ARCHIVE_LINK_REMEDIATION.md` (9.6 KB, Nov 17 12:54): Spanish "Fichero de trabajo (no es spec ni documentación). Rama feat/lifecycle-transitions-ux" scratch notes, same style as already-tracked EXPLORATION\_\*.md in root; written by earlier exploration agents/the user's main session. Not part of this change. Recommend not committing.
  - Other untracked paths are expected: packages/cli/src/guidance-presenter.ts, core find-blocking-parent.ts, many new test specs, skills template-lifecycle-consent.spec.ts, and several specd-sdd/changes/\* directories (lifecycle-polish-followups, custom-checks-and-resilient-hooks, host-lifecycle-dispose, decouple-core-cli-workflow-guidance, change-schema-fallback-cache, cross-workspace-implementation-links) - these other changes' dirs are outside this change's scope but plausibly legitimately created by the user's own changes.
- Tracked deletions in working tree: core errors archive-dependency-mismatch-error.ts, spec-overlap-error.ts and its test (intentional per decouple refactor; confirm no remaining imports - build passes per tests below).

## Discrepancies

- LOW: cli:change-transition spec silent about status-read failure fallback (no scenario). transition.ts:~530-536.
- LOW: no toon variant in transition.spec.ts:822 test.
- INFO: run.spec.ts allowlist counts are by `catch {}` blocks; the promise `.catch(() => undefined)` pattern bypasses the guard by construction - a future refactor could reintroduce swallowing unnoticed. Consider extending the guard regex to `\.catch\(`.
- INFO: `0` stray file and two EXPLORATION files untracked in root.
- HIGH: none. MEDIUM: none.

## Missing tests

- toon format for transition repair-guide status-failure; edit json/toon assertion that `guidance` key present with `command: null` (only text asserted at change-edit.spec.ts:374; `keeps scope and validity separate` at :168 covers structured at a basic level).

## Test results

See bottom (appended after runs).

- `pnpm --filter @specd/cli test`: Test Files 114 passed (114), Tests 1681 passed (1681), BUT vitest reported "Errors 2 errors" (unhandled errors from a timers callback, stack ends in node:internal/timers listOnTimeout) so pnpm exit status was 1. Output was piped through tail so the error text was not captured; run duration 1869 s (import 1817 s), suggesting heavy machine contention from concurrent agents, so timing-related unhandled errors (e.g. run.spec.ts fake-timer grace period, or a CLI force-exit timer) are plausible. MEDIUM (unverified): re-run `pnpm --filter @specd/cli exec vitest run` without tail on an idle machine to identify the 2 unhandled errors; they are not attributable to round-12 changes from evidence available.
- `pnpm --filter @specd/skills test`: 16 files, 183 tests, all passed, exit 0.
- Also noted: invalidate.ts force warning no longer ends with "Re-run with --force." (asserted absent by cli-audit-round-2.spec.ts:146; change-invalidate.spec.ts:630 consistent); no docs/spec quote the old text.

---

# Batch D (round 12, verification-attempt-14) - independent bug hunt

Suites (run once): core 291 files / 4117 passed + 2 todo; cli 116 files / 1767 passed. No failures.
No HIGH defect found. No confirmed MEDIUM. Items below are LOW.

## CONFIRMED

### D1 LOW - disabled-gate consent revoked silently without `force` becomes a latent automatic return when the gate is re-enabled

- invalidate-change.ts:153-176 (`disabled` revoked even without force) + reconcile-change-validity.ts pre-pass + change-validity.ts selectAutomaticRecovery.
- Scratch matrix (below) re-enabled both gates and ran an observe reconcile on every forced/non-forced result: 76 cases move the change on the very next reconcile (implementing/verifying/done/archivable/pending-\* -> designing by `spec-approval`, archivable/signed-off/pending-signoff -> done by `signoff`). Without the invalidation the valid consent would have stayed valid. History is consistent (revocation recorded as manual-invalidation with the reason; the later move is a normal recovery transition); the original consent is not restorable.
- Behaviour is specified (invalidate-change spec delta line 41: "revoked ... without requiring force"), and the revocation is reported in `projectionChanges`, so this is a design risk, not an implementation bug. Severity LOW.

### D2 LOW - public API: types referenced by newly exported symbols are not exported

- packages/sdk/src/core-reexports.ts:722-725 exports ProjectionChange/ValidityBlocker/ArtifactReviewTarget/FingerprintInputFailure (round 11 fix), but ProjectionChange.differences uses FingerprintDifference, ReconciledMutationContext.fingerprint uses ValidityFingerprint, InvalidateChangeInput.policyOverride uses InvalidationPolicyOverride: all exported by @specd/core (domain/value-objects/index.ts) and absent from the sdk barrel. ProjectionChange.cause uses ValidityInvalidationCause and ProjectionInvalidation (change.ts) which are exported by neither core nor sdk. Consumers can still reach them via indexed access types, so LOW.

### D3 LOW - drafted `change status` json/toon `nextAction` has a different shape from every other status record

- packages/cli/src/commands/change/status.ts:288-294 builds `{targetStep, actionType, reason, command: null}` by hand: no `intent`, never `guidance`/`action`, whereas the non-drafted path (status.ts:597) uses projectCliNextActionRecord (always `intent`). The help schema documents `intent`. Text and json agree with each other for drafts (no guidance in either); the divergence is json draft vs json non-draft.

### D4 LOW - test quality (see section below)

## SUSPECTED (read-traced, not reproduced)

### S1 LOW - archive-change.ts:1495-1517 `guardDetails` is not defensive and is evaluated eagerly as a log argument outside any try

- called at archive-change.ts:431-439 for every archive. `peers.map((peer) => peer.changeName)` throws TypeError if a peer entry is null/undefined, and `check.details === null` (not undefined) throws on `details.peers`. A throw here aborts archive after the guards pass but before any mutation (no state change, no recorded failure) and would surface as a raw TypeError. Unreachable with the core spec.overlap/workspace.readOnly implementations (typed, object peers); only reachable if a plugin supplies a check with these ids and malformed details. Logger.debug itself cannot throw (NullLogger / pino proxy; no JSON.stringify on caller side). `message` fields use `error instanceof Error ? error.message : ...`, so an error without message gives `undefined`/'' not a throw. `_recordArchiveFailure` uses String(error) which throws on null-prototype objects (pre-existing, not new).
- Fix if desired: wrap guardDetails body or log via a lazy closure/try.

### S2 LOW - archive-change.ts:484 "before-persist effects completed" is logged even when a non-fail-fast hook returned `fail` (only fail-fast throws). Misleading diagnostics only.

### S3 LOW - packages/code-graph/test/.../typescript-language-adapter.spec.ts:1989-1990 hard-codes the corpus count of `uc.execute({ name:` calls (127 -> 126 in this change). It changes whenever archive test files are added/removed (the corpus includes the new untracked audit specs), so it is a brittle cross-package coupling; it must be bumped in the same commit as the archive specs.

### S4 LOW - stray / unintended files (listed, not touched)

- `0` at repo root: 0-byte untracked file (shell `>0` redirect artefact).
- EXPLORATION-checks-gates-getstatus.md (119.7 KB) and EXPLORATION*ARCHIVE_LINK_REMEDIATION.md (9.4 KB) at repo root, untracked (other EXPLORATION*\*.md are tracked, 4 files).
- Intentional but untracked and must be `git add`ed: packages/cli/src/guidance-presenter.ts, packages/core/src/domain/services/find-blocking-parent.ts, ~45 new spec files under packages/\*/test, and specd-sdd/changes/{20260907-084243-lifecycle-polish-followups, 20260930-075132-custom-checks-and-resilient-hooks, 20261027-181252-host-lifecycle-dispose, 20261114-144544-decouple-core-cli-workflow-guidance, 20261114-151921-change-schema-fallback-cache} (the last four are other changes; confirm they belong in this branch).
- Deleted tracked files: core domain/errors/archive-dependency-mismatch-error.ts, spec-overlap-error.ts (+ its test); `git grep` finds no remaining references to either class in packages.

## CHECKED, NOTHING FOUND

### (1) invalidate-change guard/preview vs ReconcileChangeValidity - matrix

Scratch: /private/tmp/claude-501/-Users-monki-Documents-Proyectos-specd-worktrees-feat-lifecycle-transitions-ux/d6514280-9950-4b20-a585-df403cd3147e/scratchpad/r12/matrix.spec.ts (+ vitest.config.mjs, matrix-out.txt; run from packages/core with `pnpm exec vitest run --config <scratch>/vitest.config.mjs`, ~2 min; note vitest reported a 120 s test timeout but TOTAL line was written, so the loop completed; re-run with a longer timeout if you want a clean green).

- Axes: state {designing, ready, implementing, verifying, done, archivable, legacy pending-spec-approval, spec-approved, pending-signoff, signed-off (built by appending a transitioned event)} x consent {spec only, signoff only, both} x approvals {spec,signoff} on/off x artifact policy {none,surgical,downstream,global} x workflow {preserve,redesign} x force {no, yes}; 960 combinations executed.
- Oracles checked per combination: (a) "force required" iff (spec gate on and spec consent valid) or (signoff gate on and signoff consent valid); (b) previewed `gates` exactly the enabled valid ones, in spec,signoff order; (c) every previewed target equals the committed state after the forced run; (d) non-forced run with only disabled consent commits: disabled consent revoked, enabled untouched, state as reconcile decides; (e) forced run leaves every consent revoked; (f) reconciler errors.
- Result: 0 mismatches in (a)-(f); 0 harness errors. Only finding is the re-enable behaviour (D1).
- Also reasoned: guard runs after the pre-pass inside one mutate, a thrown InvalidateRequiresForceError aborts the mutation so pre-pass recovery is not committed and is recomputed on retry (preview and retry agree); `previewArtifactReviewRequired` uses the pre-pass fingerprint while the real pass recomputes it, which only matters under concurrent file edits (same window class as accepted (a)).

### (2) get-status `_mergeBlockers` / `_nextActionAfterArchiveOverlap`

- Per-target AND, archive vs transition maps kept separate, dedupe keys (checkId+code:message, anonymous key with `absorbed`) trace consistently; verdict blockers with checkId resolve transition map first then archive map; drafted path never reaches the merge (draft result sets blockers directly).
- `_nextActionAfterArchiveOverlap` only rewrites when every blocker is OVERLAP_CONFLICT; overlap is produced only by the archive binding evaluated at `state === 'archivable'`, so it cannot rewrite a non-archivable next action. It discards `action` of the incoming nextAction (spec.overlap declares none), acceptable. Intent stays `archive` while archive is blocked: CLI appends the `--skip-checks` hint only when skippable (projectCliNextAction), tested in change-edit.spec.ts.
- Only residual: when two failures of the same check id/code/message occur on different targets with different declared actions, the first action wins (cosmetic).

### (3) archive logging

- No call throws for Error-without-message, circular details or large payloads: payloads are names/ids/counts/messages; per-iteration logs are bounded per spec/binding. See S1 for the one non-defensive helper.

### (4) CLI

- transition.ts:543-547 `.catch(() => undefined)` then `throw err` correctly preserves the original error; text/json both covered by transition.spec.ts. Exit codes: reconciled/predicate/repair paths all exit via CliExitError(1); post-hook failure keeps 2.
- text/json/toon consistency: blockers go through projectCliBlocker (drops raw isSkippable, adds bypassFlag) and blockerTextLines (same flag) everywhere read (status, edit, invalidate, approve, verification, transition, archive). `reconciledRepairGuideLines` prints the bypass via skippableCheckHint (different wording than blockerTextLines' `bypass: --skip-checks x`), by design. Raw core fields leaking in json: `action`, `intent`, `details`, `automaticReturn` only, all intentional.
- status text hides OVERLAP_CONFLICT when review.reason === 'spec-overlap-conflict' while json keeps it (status.ts:404-410; known from round 11, intentional).
- edit.ts / invalidate.ts text and json now both carry guidance (round 11 D2 fixed); the nextAction text block is duplicated in edit.ts and invalidate.ts rather than shared (maintenance only).

### (5) exports: see D2; ForceInvalidationRecovery, NextAction, Blocker, LifecycleBlocker, AffectedArtifactFile, ReconcileChangeValidityResult, ReconciledOperationBlockedError are exported.

## TEST QUALITY (10 sampled for surviving mutations)

1. invalidate-change-gates-audit 'revokes disabled spec consent without force in $label' - kills dropping `disabled` from the non-force revoke list and always-guard. Strong.
2. gates-audit 'lists only the enabled sign-off gate' - kills filtering by the wrong gate flag. Strong.
3. gates-audit 'combined preview' (both on, state done) - kills hard-coded target / dropped gate; does not cover spec-on+signoff-off with signoff consent (survives a mutation that ignores `_approvals.signoff` for signoff-only consent; my matrix covers it).
4. get-status-merge-audit AND table (4 rows) - kills OR / first-wins. Strong.
5. get-status-merge-audit 'archive failures use archive bindings only' - kills sharing maps. Strong.
6. get-status-merge-audit: `applicable ?? sameCheck[0]` -> `sameCheck[0]` survives. bindingsByTarget is already filtered per target, so `sameCheck` has one element and the attemptFor/bindingMatches branch (get-status.ts:1060-1067) is never decisive in these tests. WEAK (needs two same-id bindings with different `along` on one target).
7. archive-change-audit logger tests - assert exact payloads (strong against field mutation) but call `debug.mockRestore()` at the end of the test, not in finally/afterEach; a failing assertion leaves the Logger.debug spy installed and later `debugCalls` with exact-array `toEqual` would see leaked calls. No test for a throwing logger / malformed guard details (S1).
8. change-edit.spec 'blocker projection' json test - exact toEqual on projected blockers, kills leaking isSkippable and dropping bypassFlag. Strong. toon variant and the 'same codes in text/json/toon' test use toContain only (survive dropping `details` in toon or reordering); LOW.
9. change-edit.spec 'appends overlap bypass suffix only for archive intent' - design-intent case kills removing the intent guard; no case for archive intent with a non-skippable overlap. Medium.
10. change-edit.spec workspace tests ('renders the workspaces derived by core...') are tautological (mock returns the final change, CLI just prints it); cannot fail unless output is dropped. Low value.
11. transition.spec 'keeps the original transition error when the repair-guide status read fails (text|json)' - kills removing `.catch` (status exploded would surface). Strong; does not assert the absence of a repair guide in text.
