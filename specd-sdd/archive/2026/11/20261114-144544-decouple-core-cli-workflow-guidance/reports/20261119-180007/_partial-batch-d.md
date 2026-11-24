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
