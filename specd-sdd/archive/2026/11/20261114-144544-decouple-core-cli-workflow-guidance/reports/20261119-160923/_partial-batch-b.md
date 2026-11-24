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
