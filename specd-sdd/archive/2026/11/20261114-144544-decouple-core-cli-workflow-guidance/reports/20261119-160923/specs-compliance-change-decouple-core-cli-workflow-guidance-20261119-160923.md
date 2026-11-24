# Specs compliance report — decouple-core-cli-workflow-guidance (round 11)

Mode: delegated (attempt verification-attempt-13).

## Summary

| Batch                                                       | HIGH | MEDIUM      | LOW                        | INFO |
| ----------------------------------------------------------- | ---- | ----------- | -------------------------- | ---- |
| A core:get-status, lifecycle-engine, change, workflow-model | 0    | 0           | 5 (one unverified)         | 2    |
| B core use cases, sdk, public API                           | 0    | 1           | 5                          | 2    |
| C CLI, error-handling, skills, docs                         | 0    | 1           | 2                          | 2    |
| D adversarial code review                                   | 0    | 1 confirmed | 2 confirmed + 6 suspected  | 0    |
| Total                                                       | 0    | 3           | 14 confirmed + 6 suspected | 6    |

Auditor test runs: core 4089/4091 (2 todo), cli 1760/1760, sdk 187, guide 26, skills 183, 0 failures. Lead gates before the audit: build 13/13, typecheck 26/26, lint, prettier, test 25/25, code-graph corpus count 126.

## Detailed Findings

---

# Partial batch A (round 11): core:get-status, core:lifecycle-engine, core:change, core:workflow-model

Read-only audit. Method: merged spec+verify via `change spec-preview`, code reading, and scratch probes (outside the repo, under the session scratchpad) driving the real `GetStatus` with the real check registry.

## Test run

`vitest run` in packages/core: 1272 suites, 4053 tests, 4051 passed, 0 failed, 0 pending (2 tests unreported by the JSON counters, most likely todo).

## core:get-status (changed, detailed)

Requirements summary (round-11 relevant):

- Blocker merge is by condition family: spec-consent (`APPROVAL_*` validity vs `approval.spec`), signoff-consent (`SIGNOFF_*` vs `approval.signoff` with `APPROVAL_*`), verification (`VERIFICATION_*` vs `verification.current`; `approval.signoff` `VERIFICATION_*` yields to `verification.current`, kept only when it is absent). With at least one check failure in a family, every validity blocker of that family is dropped; check message/label/checkId/action win. `VERIFICATION_VALIDITY_UNAVAILABLE`, per-artifact and per-spec codes never merge.
- `OVERLAP_CONFLICT` keeps `nextAction` archive/archivable only when it is the ONLY blocker; otherwise guidance is unchanged and `nextAction.action` is not set.

Implementation status: implemented and conforming. get-status.ts:417-455 (families), 1004-1140 (`_mergeBlockers`), 1142-1160 (`_nextActionAfterArchiveOverlap`).

### (1) Exhaustive enumeration of the merge

Probe: real registry, approvals spec+signoff on, validity blockers generated exactly as `buildBlockers` does, states {ready, implementing, verifying, done, archivable} x specApproval {valid, absent, stale, revoked} x signoff {same} x verification {valid, absent, attempt-active, stale} = 320 combinations. Result: 0 duplicated families, 0 hidden conditions (every present condition is represented by exactly one blocker per family), 0 merged blockers lacking an action. Cross-family retention (spec-consent validity blocker kept next to an `approval.signoff` failure) confirmed. Verification: `verification.current` wins over `approval.signoff` `VERIFICATION_*` in all done/archivable combos.

Dropped-action analysis: validity consent blockers (`APPROVAL_*`, `SIGNOFF_*`) never carry an action (change-validity.ts:626-632). Only validity `VERIFICATION_*` carries `start-verification` (same builder as `verification.current`). So the "adopt the dropped action" path (get-status.ts:1071-1081, 1108-1109) is observable only for a kept `approval.signoff` `VERIFICATION_*` failure (no `verification.current` failure), which has no action of its own and adopts `start-verification`.

Ordering: merged Map insertion order = surviving verdict blockers (review, hop, kept validity), then check failures in `Object.entries(checksByTarget)` order, then archive. Deterministic for deterministic inputs. A dropped validity blocker's winning check blocker moves later in the list (for example, spec-consent validity blocker sits after check blockers in done/stale/revoked/absent). No spec ordering requirement.

### (1b) Skippability

- `transitionSkippable ?? archiveSkippable` (1090): `transitionSkippable` is populated only from failing transition rows, and verdict hop blockers only exist for failing transition rows, so the `?? archiveSkippable` branch is a dead fallback. The reverse regression (archive-origin blocker using transition binding) does not exist: new check blockers pick the map by `source` (1119), and archive-only checks (for example `spec.overlap`) never appear in `transitionSkippable`.
- Residual: when the same check fails with the same `code:message` on a transition AND on archive with different bindings, one merged blocker carries the transition verdict and the archive verdict is lost (conservative direction pinned by get-status-families.spec.ts:264-313). Also `transitionSkippable` ORs across targets.

### (2) `_nextActionAfterArchiveOverlap`

Probe in `archivable` with real registry, live overlap forced: overlap alone -> intent archive, targetStep archivable, reason is the overlap message (conforming). Overlap + stale/absent verification -> intent verify, step archiving, `nextAction.action` unset, `start-verification` stays on the verification blocker (conforming, with or without unresolved review). Overlap + review -> intent design. Overlap + synthetic consent validity blockers (`SIGNOFF_REQUIRED/STALE`, `APPROVAL_STALE`) -> unchanged guidance "Ready to archive" (intent archive, step archiving). Those states are unreachable after real reconciliation (recovery returns the change to done/designing), so LOW.

### Discrepancies (get-status)

- LOW (spec gap): adoption of a dropped validity blocker's action when the winning check has none is not in the spec ("the check's ... action win"). Behaviour is sensible and reachable only for the `approval.signoff` `VERIFICATION_*` fallback. Evidence get-status.ts:1071-1081, 1108-1109.
- LOW: skippability of a same-key transition/archive failure resolves to the transition verdict only (get-status.ts:1114-1130 via key dedupe at 1111-1116). Spec says `isSkippable` reflects the evaluated candidate; ambiguous when two scopes share one blocker.
- LOW (INFO): dead fallback `?? archiveSkippable.get` at get-status.ts:1090.
- LOW: with a review blocker present in `archivable` and overlap (or no overlap), `nextAction.reason` stays "Ready to archive" while `intent` is design (probe: reason "Ready to archive", intent design, step archiving). Pre-existing, outside the overlap rule.
- LOW (unverified): non-overlap archive-only predicates (`deps.consistent`, `workspace.readOnly`, `impl.filesResolved`, `schema.nameMatch`, `archive.archivable`) feed only `blockers`, not the verdict (`evaluateLifecycle` receives archive bindings for skippability only: get-status.ts:733-738), so by code reading `nextAction` can say "Ready to archive" while archive would refuse. I could not confirm empirically (my injected archive binding was not executed by the registry-resolved bindings). The spec only mandates the overlap rule.
- INFO: per-artifact duplicates are spec-conformant ("MUST NOT be merged") but visible: probe shows a drifted file yields both `ARTIFACT_DRIFT` (review message) and `ARTIFACT_DRIFT` (validity message "Artifact files differ ..."), and a pending-review file yields both `REVIEW_REQUIRED` and `ARTIFACT_REVIEW_REQUIRED`. The public code `ARTIFACT_REVIEW_REQUIRED` is not in the spec's blocker code list.

### Tests (new)

- get-status-families.spec.ts discriminates: revoked sign-off with differing codes (one blocker), verification absent/stale/active with duplicate signoff failure (one blocker, `verification.current`), signoff-only fallback, revoked spec at ready, cross-family two blockers, `VERIFICATION_VALIDITY_UNAVAILABLE` unmerged, transition-origin skippability.
- get-status-audit.spec.ts:331-420 covers overlap sole blocker and overlap + stale verification (pins `action` undefined).
- Missing: (a) the signoff `VERIFICATION_*` fallback test asserts `checkId` only, not the adopted `start-verification` action; (b) no test for the opposite skippability direction (archive-origin blocker whose check is also transition-bound with a different verdict and different message); (c) no test for overlap + consent/review combos or for non-overlap archive-only blockers vs `nextAction`; (d) no test asserting blocker ordering.

## core:lifecycle-engine

Requirements: evaluateLifecycle projects availableTransitions/nextAction from predicate results; overlap scenarios mirrored from get-status. Implementation consistent with probes above (verify intent kept when stale verification coexists with overlap; no action on `nextAction`, action on blocker). No new discrepancies beyond the get-status items.

## core:change

- "One reconciliation commits at most one recovery": reconciler calls `change.recover` once (reconcile-change-validity.ts:623-624) from a single `selectAutomaticRecovery` result; test reconcile-change-validity-recovery.spec.ts:155 pins archivable->done then done->designing. Conforming.
- Independent derivation: all 12 states x spec {valid, stale, revoked, absent} x signoff x workflow {preserve, redesign} x review {false, true} = 384 combos through `selectAutomaticRecovery`; every selected recovery has a matching `RECOVERY_ONLY_TRANSITIONS[cause][from]` entry equal to `to` (0 mismatches), and no table entry is unreachable. Spec-consent: pending-spec-approval, spec-approved, implementing..archiving -> designing, `ready` exempt (no table entry), drafting/designing none. Sign-off: pending-signoff, signed-off, archivable, archiving -> done. Redesign: ready and every later state -> designing. Matches the spec text at lines 426-430 (including legacy parking states).
- Tests for ready exemption exist (recovery spec lines 116, 132). Not verified: reconciler-level tests that pending-spec-approval/spec-approved/pending-signoff/signed-off sources recover.
- No discrepancies.

## core:workflow-model

Reread fully; spot-checked against code: bedrock states (build-schema.ts:810, 847-856), `skipChecks` on disabled step rejected (859-860), `archiveChecks` only on `archiving` (862-866), archive check locks and `workflow.taskCompletion` at archive scope (check-bindings.ts ARCHIVE_BINDING_SPECS), approval anchor validation (workflow-topology.ts). No drift found. Not exhaustively verified: governance error class mappings and the two-execution-modes/hooks sections.

## Counts

HIGH 0, MEDIUM 0, LOW 5 (one unverified), INFO 2. Missing tests: 4 groups (listed above).

---

# Partial batch B (round 11, verification-attempt-13)

Read-only audit. No code/spec/doc modified. Specs: core:archive-change, transition-change, transition-checks, invalidate-change, edit-change, create-change, workflow-topology, approve-spec, approve-signoff (+ core:change, public API surface).

## Test counts (fresh runs)

- core (test/application/use-cases, composition, domain/services, infrastructure/fs): 3191 tests, 3189 passed, 0 failed (2 not reported as passed; no failures).
- sdk (full): 187/187 passed (barrel type-equality for AutomaticRecovery and ChangeValidityVerdict at packages/sdk/test/barrel.spec.ts:97-98 passes).
- guide sdk-catalog.spec.ts: 26/26. cli guide-sdk.spec.ts: 72/72.
- Catalog reality: packages/guide/generated/guides-sdk.json has 1697 catalog entries (core 670, sdk 776, code-graph 245, schemas 5, skills 1); 1697 - 23 hand-written = 1674 generated; counts asserted (1674/1697/658) match (tests pass). The file is now minified (git numstat 1 / 106280): INFO, formatting only.

## 1. core:archive-change - "Archive debug logging" (changed, detail)

Requirement entry vs Logger.debug in packages/core/src/application/use-cases/archive-change.ts (A) and infrastructure/fs/archive-batch-snapshot.ts (S):

- overlap/readOnly guard outcomes: A:429-439 'guard outcome' with change, step, checkId, outcome, specIds, plus overlapEntries (guardDetails, A:1490+, from details.peers; verified shape in domain/checks/spec-overlap.ts:60) / readOnlyWorkspaces (from details.specs[].workspace, domain/checks/workspace-read-only.ts:54-61). OK. Note: unresolved workspaces would surface as '(unknown)' in readOnlyWorkspaces (INFO).
- pre hooks start/completion: A:463-491 with step 'archive', phase 'pre', checkId, skipped, skippedPhases. OK. Post hooks A:739-781 phase 'post', plus failureCount. OK.
- prepare plan / full-batch preflight: A:544, A:571 counts. OK.
- orphan detection per spec: S:68 (outcome matching-auto-restore | foreign-abort, with specId, manifestChangeName). The "none found" branch has no log (let me state: S logs only when a manifest exists) and the corrupt-manifest abort throws with no log: LOW.
- snapshot start/completion: S:102/135. transition to archiving: A:611 (change, actor name). tracked artifact selection: A:868 with source 'delta'|'direct'. OK.
- commit phase: staged publication start/completion A:628/653; recordCreatedFile S:167; archive repo call A:680/686; cleanup S:229 (specIds). OK.
- recovery: \_recordArchiveFailure log (step, commitStarted, message) A:1204; restore start/completed S:179/207 (+ per-spec failure S:200); rollback to archivable A:1170; partial restore A:1178 (restored + failed ids). OK.
- post-commit: metadata start (A:719 force materialization started), completion (A:725/729), skip with reason (A:710, fields change/step 'metadata'/specId/reason), post hooks. OK.
- Failure diagnostics gaps vs spec text:
  - MEDIUM-LOW: metadata failure log (A:732) has only change+specId: no step 'metadata', no error message summary, and `_recordArchiveFailure(..,'metadata',..)` is never called (the 'metadata' step is declared in the signature at A:1190 but unused). Spec lists failure step 'metadata' and "failure step, spec ID" for every phase.
  - LOW: snapshot/orphan failure path (A:599-602) logs only the generic "recorded failed archive attempt" (step 'prepare', commitStarted false, message) without specId even though ArchiveOrphanBackupError carries specId; the adapter's orphan-check log (S:68) does carry specId, so the spec ID is traceable for matching/foreign orphans but not for snapshot() failures. Spec does NOT require a preflight-style dedicated log for this path ("spec ID and artifact basename when failure is spec-scoped" is the only relevant text) - judged a minor gap, not a missing mandated entry.
  - LOW: commit-phase failures (A:666, A:690) log no specId/artifact basename for the spec being published; only step+commitStarted+message via \_recordArchiveFailure. Spec scenario "Archive failure emits debug diagnostics" requires "the spec ID or artifact being processed".
- Tests (packages/core/test/application/use-cases/archive-change-audit.spec.ts:662-790): assert fields via toMatchObject/toEqual (checkId set, specIds, outcome, overlapEntries, readOnlyWorkspaces, pre skipped/skippedPhases, post skipped:false, source 'direct', preflight change/step/specId/code). They discriminate (fail-vs-pass outcomes, two distinct guards).
  Missing/weak tests: no test for metadata-skip log (A:710) - agent report confirmed; no test for tracked source 'delta'; no test for pre-hook log with skipped:false; batch-restore tests (archive-change-batch-restore.spec.ts:496, 640-690) assert only message substrings ('partial restore', 'snapshot started' ordering), not restoredSpecIds/failedSpecIds fields; no test for metadata failed/started/completed logs; no unit test for S logs (orphan check, restore, cleanup) in test/infrastructure/fs/archive-batch-snapshot.spec.ts.

## 2. core:transition-change (changed)

- Spec: Bypass Verification (spec text line "BEFORE any early return, including designing -> designing") and scenario "skipChecks are validated on the designing to designing redesign path" (UnknownCheckError; CheckNotSkippableError for hook.pre/non-skippable; empty/valid returns unchanged change).
- Code: transition-change.ts:290-307 validateSkipChecks runs before the `designing -> designing` return. OK. No dead constructor params found (constructor has 9 params all used; `effectiveTarget` is a trivial alias of requestedTarget, INFO).
- Tests: transition-change-audit-2.spec.ts:303-330 cover unknown id and empty list/no mutate. LOW missing: the spec scenario's second bullet (effect id `hook.pre` or non-skippable id on designing->designing -> CheckNotSkippableError) is untested; also a valid skippable id on that path is untested.

## 3. core:invalidate-change (changed)

- Spec: preview = single combined recovery for revoked set, same priority as reconciler, every gate listed with that target (or current state when no move), effective policy used; ready+preserve -> no move, ready+redesign -> designing.
- Code: invalidate-change.ts:441-458 forceRecoveries calls selectAutomaticRecovery (domain/services/change-validity.ts:186) with spec/signoff 'revoked' only for gates in the revoke set, else 'not-required', and artifactReviewRequired from previewArtifactReviewRequired (mirrors reconciler via shared collectChangeReviewTargets). Passed effectivePolicy (request policy). Matches reconciler priority and the `state !== 'ready'` exemption. Single gate revoked: only that gate listed, target from selectAutomaticRecovery (spec from implementing -> designing; signoff from post-done -> done; signoff at ready -> falls to redesign rule). Consistent with spec.
- Tests: invalidate-change-policy-audit.spec.ts:187-200 (both gates, archivable, preserve -> both designing); invalidate-change-ready-audit.spec.ts:213-299 (ready preserve no move, redesign designing, override, hash drift/pending-review under artifacts none). LOW missing: no test of only-signoff revoked (target 'done') nor only-spec from a post-ready state with a signoff already non-valid; no test for redesign + both gates mixed ordering. No discrepancy found.

## 4. core:change / edit-change / create-change seeding

- create-change.ts:193-198 and edit-change.ts:294-298 both use shared loadPersistedSpecDependsOn (application/use-cases/\_shared/load-persisted-spec-depends-on.ts): reads repo.readPersistedState(spec).dependsOn, no metadata.json fallback. Create seeds only when source !== 'empty' (spec text: no entry seeded) - matches. Edit seeds [] for missing (spec text: empty array) and does not overwrite an existing entry (edit-change.ts:296) - matches. core:change text (specDependsOn orphan removal; updateSpecIds legacy helper exists at change.ts:1634 calling replaceSpecIds) matches code. No discrepancy. New untracked composition test packages/core/test/composition/use-cases/edit-change.spec.ts is present and passes.

## 5. Public API surface

- core public.ts:756-759 and sdk core-reexports.ts:719 export AutomaticRecovery and ChangeValidityVerdict; also exported via domain/services/index.ts:105-108 (so core ./internal via index.ts `export *`). sdk barrel.spec.ts:97-98 asserts type equality. Spec-driven additions (NextAction, Blocker, LifecycleActionIntent, \*Action builders, CheckAction) are mirrored in both barrels.
- Removed from public/sdk barrels vs HEAD: SpecOverlapError, ArchiveDependencyMismatchError. Verified no remaining references in packages/\*/src or docs (only generated .docusaurus noise): INFO (intentional breaking removal; ensure change notes mention it).
- MEDIUM (new dangling public type references): ChangeValidityVerdict (change-validity.ts:87-97) references ArtifactReviewTarget, ProjectionChange, ValidityBlocker, FingerprintInputFailure (all in domain/services/change-validity.ts) and ProjectionStatus (entities/change.ts:199). None of these five is exported from core public.ts, sdk core-reexports.ts, or domain index (grep returns no matches). Consumers can use the verdict structurally but cannot name those types. ReconcileChangeValidityResult (already public) has the same pre-existing dangling refs (projectionChanges, affectedArtifacts), so this is partly pre-existing; exporting the verdict type makes it more visible. Does not break compilation. Recommend exporting the five types (or documenting intent).
- Guide catalog: guides-sdk.json contains AutomaticRecovery (21 hits) and ChangeValidityVerdict (53 hits) and zero hits for the removed errors: regenerated and fresh. Counts asserted match (see above).

## 6. Other specs (workflow-topology, approve-spec, approve-signoff, transition-checks, create-change)

- Not found to change in round 11 beyond what the tests cover; core tests (3191) pass. No new discrepancies surfaced in the targeted areas; no deeper line-by-line audit performed for these within this partial batch beyond the focus items above.

## Discrepancy list

- MEDIUM: five types referenced by exported ChangeValidityVerdict are not exported (public.ts:756-759, sdk core-reexports.ts:719).
- MEDIUM-LOW: archive metadata-failure log lacks step/message and never records step 'metadata' (archive-change.ts:730-733; \_recordArchiveFailure union at :1190).
- LOW: commit/archive-step and snapshot-failure logs lack specId/artifact (archive-change.ts:599-602, 666-673, 690-698).
- LOW: orphan check "none found" and corrupt-manifest abort have no log (archive-batch-snapshot.ts:55-85).
- LOW tests: metadata-skip log, delta source flag, restore field assertions, adapter logs, transition designing->designing hook.pre/non-skippable, invalidate single-gate previews.
- INFO: guides-sdk.json now minified; effectiveTarget alias redundant; '(unknown)' workspace in readOnlyWorkspaces.

---

# Partial batch C (round 11, verification-attempt-13)

Specs: cli:change-status, change-transition, change-invalidate, change-verification, change-archive, change-approve, change-edit, default:\_global/error-handling-conventions, skills:skill-templates-source.

## Test results

- `pnpm --filter @specd/cli exec vitest run`: 455 files, 1760 tests, 1760 passed, 0 failed (no flakes).
- `packages/skills` vitest: 50 files, 183 tests, 183 passed, 0 failed.
- Note: a plain `npx vitest run --outputFile` from packages/cli produced a 12-file/58-test JSON (outputFile clobbered by nested vitest fixtures); use pnpm exec form for counts.

## Requirements Summary (changed: cli:change-edit)

- change-edit: text blockers in status form `! <CODE> — <label>: <message>` (label omitted when absent) + indented `bypass: <flag>` only for skippable blockers; JSON/TOON blockers projected via projectCliBlocker (no raw isSkippable); nextAction projected with blockers (overlap suffix only for archive intent). Implemented: edit.ts:170-180 (projection), :248-262 (text via blockerTextLines), JSON at :213-225. Tests: change-edit.spec.ts:269 (text label+bypass once), :285 (overlap suffix archive-only), :298 json, :319 toon.
- Other specs (status, transition, invalidate, verification, archive, approve): blockers emitted via projectCliBlocker in json/toon everywhere (status.ts:340,595; transition.ts:557; invalidate.ts:230; verification.ts:304; approve.ts:232), text via blockerTextLines in status/edit/invalidate; no raw `isSkippable` emitted outside handle-error metadata/hint resolution. error-handling-conventions and skill-templates: no issue found.

## Implementation Status

(1) edit: compliant with spec/verify. `blockerTextLines` lives only in guidance-presenter.ts:145; callers status.ts:310,412, edit.ts:259, invalidate.ts:208; no duplicate definitions. Verification/approve/transition render blockers with their own repair-guide formats (see INFO-1).
(2) `isCheckPredicateFailed`/`isCheckNotSkippable` (guidance-presenter.ts:211,227) are used by archive.ts:193 and transition.ts:100,136,218,548. Repo grep (cli, mcp, sdk src): no remaining ad-hoc instanceof/name checks for these two errors. Only residual: transition.ts:102 `instanceof UnknownCheckError` (different error, fine), handle-error.ts:224-229 reads `metadata.isSkippable ?? metadata.skippable` from error metadata (not a blocker; expected). mcp/sdk have none (sdk only re-exports).
(3) `readAutomaticReturn` (\_validity-present.ts:435) handles undefined/null/object; reading `.cause/.from/.to` of an odd non-null value cannot throw (only a falsy non-null primitive like `false`/`0` would yield a bogus `{undefined...}` object, not an exception; not reachable from typed core). `publicValidity` (:165) retains its `typeof value !== 'object' || null` guard and array guards, so typed callers in status.ts:360, transition.ts:120,205, verification.ts:408 cannot throw on old/odd results. No output change observed in the tests.
(4) Tightened tests: reconciled-blocked.spec.ts asserts an exact 12-line slice of the repair guide (:99-112) plus counts of `bypass:`/`command:` - precise, but sensitive to any line inserted inside that window (intentional contract, MEDIUM-brittle only to repair-guide layout changes; trailing additions are tolerated). cli-audit-round-2.spec.ts uses full `toEqual` on projected blocker objects (:171,:310,:383) and `Object.keys` equality (:270) - tied to the blocker projection contract, acceptable; `errLines.at(-1)` (:223) is sensitive to trailing stderr lines. Neither is weak; neither is brittle to unrelated output.
(5) Docs sweep: no remaining docs claiming raw `isSkippable` output (cli-reference.md:108,127 and change-verification.md:54 correctly state it is not exposed); no `--allow-overlap` suggestions in skills templates (only deprecated-alias mentions in cli-reference.md:208-209 and ADR 0030). See discrepancies for the change-edit gaps.

## Discrepancies

- MEDIUM: `change edit` text output drops next-action `guidance` when `command` is null, while JSON/TOON include `nextAction.guidance` (edit.ts:260-263 vs projected object at :170-180) and every other command prints a `guidance:` line (invalidate.ts:215-217, status.ts:445-447, verification.ts:281-283, approve.ts:192). docs/cli/cli-reference.md:127 states "text output prints it as a `guidance:` line". Text/structured divergence for unknown plugin action kinds. The cli:change-edit spec only requires the command, so this is a spec gap plus inconsistency. No test covers it.
- LOW: docs/cli/cli-reference.md `change edit` section (:239-257) does not mention blockers, next action, bypass lines, or the `blockers`/`nextAction` JSON fields (only "validity changed and any committed recovery"). Should say output includes status-form blockers (with `bypass:`), next action, effective policy, projection changes, automatic return.
- LOW: edit.ts:170-180 and invalidate.ts:127-133 inline-duplicate the `{...projectCliNextAction, intent, action}` construction; `projectCliNextActionRecord` (guidance-presenter.ts:398) exists and would dedupe (it emits `intent: null` when undefined, so a tiny shape difference to decide). status.ts:597-607 duplicates it again.
- INFO-1: Bypass line wording differs by surface: status/edit/invalidate print `bypass: --skip-checks <id>`; transition/archive repair guides print `bypass:  Retry with --skip-checks <id> if an exception is granted` (reconciled-blocked.spec.ts:103). Matches each spec; just noting two forms.
- INFO-2: verification reconciliation payload blockers are `{code,message}` only (verification.ts:428-ish), not projectCliBlocker; consistent with the validity-blocker spec, distinct from Core status blockers.

## Missing tests

- change edit text output with a null-command next action carrying `guidance` (text vs JSON parity).
- change edit TOON/JSON/text parity test that asserts same blocker set across formats in one case.
- readAutomaticReturn unit test for undefined/null/object (none seen dedicated; only via commands).

## Counts

HIGH 0, MEDIUM 1, LOW 2, INFO 2.

---

# Batch D (round 11) - independent bug hunt (final)

## CONFIRMED

### D1 MEDIUM - forceRecoveries preview disagrees with reconciler when a consent gate is disabled but a valid projection exists

- invalidate-change.ts:395-400 (consentToRevoke) + 441-456 (forceRecoveries) vs reconcile-change-validity.ts:539-548 (fieldAfter returns 'not-required' when the gate is off => no recovery) and approvalField (change-validity.ts).
- consentToRevoke keys off `change.specApproval?.status === 'valid'` regardless of `approvals.spec`; forceRecoveries then passes 'revoked' to selectAutomaticRecovery, predicting `designing`. The reconciler, with the gate configured off, still persists the revocation (pushRevocation) but computes specApproval = 'not-required' so NO recovery is committed.
- Reproduced with scratch matrix (480 combos: state {designing,ready,implementing,verifying,done} x valid {spec,signoff} x gates on/off x artifacts {none,surgical,downstream,global} x workflow {preserve,redesign}; preview from non-forced run's InvalidateRequiresForceError.recoveries vs state after forced run): 48 mismatches, ALL with approvals.spec=false and a valid specApproval, states implementing/verifying/done, all policies. Example: state=implementing, approvals {spec:false,signoff:\*}, preview=[{spec->designing}] actual state stays implementing, spec revoked. Zero mismatches with the gate on. Signoff-gate-off analogue is by code symmetry (signoff recovery only fires after 'done'; pending-signoff/signed-off not reachable via plain transition in my harness: "Cannot transition from 'done' to 'pending-signoff'") => suspected, not reproduced.
- Side effect: with the gate off, a valid-but-unrequired consent still forces `--force`, and the message tells the user the change will return to designing when it will not.
- Fix: in consentToRevoke / forceRecoveries pass 'not-required' for gates whose configured approval is off (this.\_approvals), or filter gates by this.\_approvals.

### D2 LOW - `change edit` text output drops `nextAction.guidance` that JSON/toon carries

- packages/cli/src/commands/change/edit.ts:240-262 (appendEditGuidance prints only target/command/reason; its param type has no guidance) vs JSON path (edit.ts ~188-200 spreads projectCliNextAction incl. `guidance`) and sibling commands status.ts:445, invalidate.ts:215, verification.ts:281 which all print `guidance:` when command is null. text vs json divergence; when command=null the text shows `command: (none)` with no hint.

### D3 LOW - public API: exported ChangeValidityVerdict / InvalidateChangeResult reference unexported types

- core/src/domain/services/index.ts:105-108 and sdk/src/core-reexports.ts:719 export only AutomaticRecovery and ChangeValidityVerdict. ChangeValidityVerdict's members use ProjectionChange, ValidityBlocker, ArtifactReviewTarget, FingerprintInputFailure, ProjectionStatus; InvalidateChangeResult (exported, sdk-reexported) exposes ProjectionChange[] and ValidityBlocker[]. None of those five names is exported from @specd/core or @specd/sdk (grep of all index.ts: 0 hits; ForceInvalidationRecovery, InvalidateChangeResult, AffectedArtifactFile are exported). Consumers get structurally-typed values they cannot name (the CLI works around it with its own PublicProjectionChange in \_validity-present.ts:22). Not a compile break.

## SUSPECTED (read-traced, not reproduced)

### S1 LOW-MEDIUM - \_mergeBlockers ORs skippability across targets by check id

- get-status.ts:1034-1049. transitionSkippable is keyed only by check.id and OR-ed over every failing candidate of every target; a blocker for target B (locked) reports isSkippable=true if the same check id fails on target A with skippable=true (e.g. schema-composed bindings that differ per target). Result: a bypassFlag (--skip-checks <id>) offered for a transition where validateSkipChecks will reject it with CheckNotSkippableError. Needs a schema with per-target skippable divergence for the same check id; the shipped TRANSITION_BINDINGS only mark implementing-related checks skippable, so not hit with std schema. Archive/transition separation (the claimed fix) is correct; only intra-transition is merged. Key should be target+id.
- Also dedupe key at get-status.ts:1093/1107 is code:message; two checks with the same code+message collapse to one blocker (first wins, label/checkId of the other lost). Theoretical.

### S2 LOW - transition skipChecks validated after reconcile mutation

- transition-change.ts:~207 reconcile.execute (may persist projections / refresh implementation tracking) runs before validateSkipChecks (~265). A bogus/unskippable --skip-checks id therefore still lets the pre-reconcile persist; and if the reconcile commits a recovery the user gets ReconciledOperationBlockedError and the bad id is never reported. Effective bindings are state-dependent so the skippable check must follow, but the unknown-id (UnknownCheckError) half could be validated first. Matches the "flags validated before mutation" concern; effect is benign (reconcile is idempotent, would have run on any attempt).

### S3 LOW - status text hides OVERLAP_CONFLICT when review.reason==='spec-overlap-conflict', JSON does not

- packages/cli/src/commands/change/status.ts:~401-406 filters the blocker for text only; json/toon (status.ts ~598 blockers.map(projectCliBlocker)) keeps it. Intended for the invalidation-review case, but a live archive-predicate OVERLAP_CONFLICT coexisting with that review reason would be invisible in text. I could not construct a state where both exist (archive predicates only run at state archivable; invalidation by overlap returns the change earlier), hence suspected.

### S4 LOW - transition.ts repair path can mask the original error

- transition.ts ~545: status.execute() inside the catch for repair-guide errors is not guarded; if it throws, the outer handleError reports that error instead of the CheckPredicateFailedError (original swallowed).

### S5 LOW - signoff-gate-off analogue of D1 (see D1) not reproduced (pending-signoff unreachable in harness).

### S6 LOW (perf/robustness) archive-change.ts

- \_materializeImplementationLinks (1401-1469) calls this.\_listWorkspaces.excludePathsFor(workspace) per link inside the loop; hoist per workspace. guardDetails (1490-1515) does peer.changeName on array items without null-guard (throws TypeError from a logging helper at archive-change.ts:431-439 if a custom spec.overlap check ever emits null peers; details come from domain check so not reachable today).

## CHECKED, NOTHING FOUND

- archive-change.ts debug logging: payloads are change/spec names, check ids, counts, error messages; no config/secret/env, no content bodies, no large objects (specIds list and skip set only). Only per-iteration logs are per-binding hooks (<=3) and per-spec "selected tracked artifact file" (bounded by specs x artifacts, cheap). specIdOfError is null/primitive safe. Duplicate preflight-failed log in two catch blocks is intentional (different step).
- postHookValidityBlocksArchive (1577-1583): consistent with reconciler fields; the only skippable archive checks are spec.overlap and impl.linksInScope, neither validity-related, so skipChecks cannot bypass it. 'attempt-active' verification correctly blocks.
- \_nextActionAfterArchiveOverlap: OVERLAP_CONFLICT only emerges from archive-scope binding (check-bindings.ts spec.overlap applicability archive-only) and archiveChecks run only at state 'archivable', so it cannot rewrite nextAction in a non-archivable state; requires every blocker to be overlap.
- \_mergeBlockers families: drafted path never reaches it (draft result sets blockers directly); verification family yielding and droppedActions adoption traced and consistent with get-status-families tests.
- transition-change.ts early returns: designing->designing no-op happens after skipChecks validation (intended); reconcile state-change early exits throw ReconciledOperationBlockedError/InvalidStateTransitionError correctly; 'next' resolved after reconcile. Accepted window (a) not re-reported.
- CLI: edit/transition/status/approve/archive/invalidate/verification exit via CliExitError(1); JSON failure records carry state/blockers; projectCliBlocker drops raw isSkippable (bypassFlag only) everywhere I read; raw core fields leaking: only intent/action are passed through intentionally (documented in help schema).

## INVALIDATE PREVIEW MATRIX (item 3)

Scratch: /private/tmp/claude-501/-Users-monki-Documents-Proyectos-specd-worktrees-feat-lifecycle-transitions-ux/d6514280-9950-4b20-a585-df403cd3147e/scratchpad/r11/matrix.spec.ts (+vitest.config.ts, matrix-out.txt). 480 runs, 0 harness errors, 48 mismatches, all D1 (spec gate off + valid specApproval). Gate-on rows for all 4 artifact policies x 2 workflow policies x states designing..done: preview target == committed state in every case. Not covered: pending-signoff / signed-off states (not reachable by plain transition in harness) and verification/drift-combined fixtures.

## TEST QUALITY (10 sampled)

1. families: 'revoked sign-off one blocker with approve-signoff action' - kills family-drop removal; mutation 'always keep both' fails (length 1). Strong.
2. families: verification loop (3 codes) toHaveLength(1)+checkId - kills dropping the yield. Strong.
3. families: 'keeps approval.signoff verification failure when verification.current does not fail' - kills making yieldsToVerification unconditional. Strong.
4. families: 'keeps stale spec consent and failing sign-off as two' - asserts only count + checkId presence, not codes/messages; mutation that swaps SIGNOFF\_\* into spec-consent family would still give 2 only if... survives for code mislabel. Medium.
5. families: skippability from transition binding (line 264-312) - asserts matches.length>0 and every isSkippable===false; mutation 'always false' survives unless another test has the true case (get-status-audit covers true). Medium-weak locally.
6. reconcile-recovery: stale spec at ready no recovery - kills removal of the exemption. Strong.
7. reconcile-recovery: revoked spec at ready - mutation isBrokenConsent('revoked')=>false SURVIVES (ready exemption masks it); only invalidate audit kills it. Weak in isolation.
8. reconcile-recovery: one recovery per reconciliation (archivable->done->designing) - kills multi-recovery loop and priority swaps. Strong.
9. invalidate-policy-audit: 'previews one combined recovery' - both gates on, designing: mutation that drops the gates filter or hardcodes target 'designing' survives (no signoff-only / gate-off row). This is exactly the hole D1 lives in. Weak.
10. invalidate-policy-audit: idempotent repeat (spec-approval returns, history count) - kills duplicate recovery/persist. Strong. (The invalid-policy tests carry a stale comment "Real src gap (not fixed here)" although validateCommandShape now rejects; comment is misleading, tests are fine.)

## SUITE COUNTS

- core: 4091 tests, 4089 passed, 0 failed (2 skipped/todo), 1288 suites, success=true.
- cli: 1760 tests, 1760 passed, 0 failed, 455 suites, success=true.
  (json reporter outputs: scratchpad/r11/core.json, cli.json)

## PRIORITIZED

1. D1 MEDIUM confirmed (invalidate preview vs reconciler with gate off).
2. S1 LOW-MEDIUM suspected (per-target skippability OR).
3. D2 LOW confirmed (edit text drops guidance).
4. D3 LOW confirmed (unexported member types of exported verdict).
5. S2-S6 LOW suspected.
   No HIGH defects found.
