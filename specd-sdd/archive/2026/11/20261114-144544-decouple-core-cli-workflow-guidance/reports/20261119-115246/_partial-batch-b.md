# Partial batch B (round 10) - spec-compliance audit

Specs: core:edit-change, create-change, archive-change, transition-change, transition-checks, invalidate-change, workflow-topology, approve-spec, approve-signoff. Read-only. Focus: round-10 changes + new-problem hunt. approve-spec, approve-signoff and workflow-topology were not changed in round 10 and were not re-audited in depth (only build-schema's isDrainState import was checked for cycles: none).

Test run: `npx vitest run` in packages/core: 4071 tests, 4069 passed, 0 failed, 2 skipped/todo; 1278 suites, 0 failed.

## Requirements summary (changed ones)

### core:edit-change / core:create-change - "Seed specDependsOn"

Spec now: seed from persisted state only (`readPersistedState`, spec-lock.json); unknown workspace / missing spec / no persisted state => `[]` for edit, no entry for create; no metadata.json fallback. Merged verify has the replaced scenarios (persisted seeds, existing snapshot not overwritten, absent state => empty with "metadata.json not consulted"; create: "Absent persisted state seeds no dependency entry").
Code: `_shared/load-persisted-spec-depends-on.ts` reads only `repo.readPersistedState`; EditChange `_executeScopeEdit` seeds only for new ids without an existing entry; CreateChange seeds only when `source !== 'empty'`. MATCHES.
Factory deps: `resolveEditChangeDeps` resolves changes, listWorkspaces, actor, schemaProvider, resolveChangeSchema, refreshImplementationTracking, reconcile - matches spec list. `EditChange` ctor `reconcile` is now a required positional (type). All construction sites: `composition/use-cases/edit-change.ts:105` (only src site), kernel.ts:443 via createEditChange(resolveEditChangeDeps), tests (edit-change.spec.ts helper passes `makeObservingReconcile`). cli/sdk/mcp/code-graph never construct EditChange directly (sdk only re-exports types). `isEditChangeDeps` requires `'reconcile' in value`; covered by composition/mandatory-validity-reconciler.spec.ts. MATCHES.

### core:archive-change

- Archivable guard ordering: code archive-change.ts:362-390 resolves schema, reconciles, state guard (InvalidStateTransitionError / ReconciledOperationBlockedError on committed recovery) BEFORE `executeMatchingPredicates` (:419, failFastOn schema.nameMatch). Spec text and scenario "Change not in archivable state" match; `assertArchivable()` inside mutate at :586. MATCHES.
- ArchivePreflightError: no occurrence in any of the 9 merged previews (spec+verify), nor in packages/_/src, packages/_/test, docs, apps. Only baseline `specs/core/archive-change/{spec,verify}.md` still name it (replaced by the change deltas; expected pre-archive). Remaining `'ARCHIVE_PREFLIGHT'` is only a Logger `code` string (archive-change.ts:536,558). MATCHES.
- ContentHasher plain Error: thrown in `services/resolve-sealed-archive-depends-on.ts:59` (message identical to spec). Spec sentence and JSDoc (@throws {Error} archive-change.ts:359, :986) match; test `archive-change-audit.spec.ts:493` asserts `constructor === Error`. MATCHES.
- Debug logging: see Discrepancies D1-D5 (entry-by-entry comparison).
- @throws of ArchiveChange.execute (:343-359) vs real throw sites: ChangeNotFound(:366), SchemaNotFound/IdentityMismatch (ResolveChangeSchema), InvalidStateTransition (:389,:492,:515), Unknown/NotSkippable (validateSkipChecks), CheckPredicateFailed (throwArchivePredicateFailure), ReconciledOperationBlocked (\_archiveRecoveryError), HookFailed (throwHookFailed), ArchiveArtifactMissing/ParserNotRegistered (:827-848,:1239), ArchiveBatchRestore (:1143), ArchiveOrphanBackup (batch snapshot adapter), DeltaApplication/ArtifactParse (parsers), plain Error (hasher). Complete; no phantom entries.

### core:transition-change / core:transition-checks - renamed scenarios

transition-change merged verify: "Parked spec approval rejects a target without a protocol edge" (:984) and "Parked signoff ... protocol edge" (:991) exactly once each; old "...non-drain target" titles absent. "Stale approval returns to design instead of parking" (:368, modified body: stale in implementing) and "Stale approval at ready stays in ready and the check blocks" (:375) once each. "Backward skill hop from a post-verification state invalidates sign-off in the mutation" (:622) once. No duplicate scenario titles in the whole merged preview (uniq -d empty).
transition-checks merged verify: "skipHookPhases all still runs predicates" (:771) once; old "Skip-hooks still runs predicates" absent from merged preview (remains only in baseline specs/ file). Test: transition-change.spec.ts:2812 "still fails incomplete tasks when skipHookPhases is all" (asserts workflow.taskCompletion INCOMPLETE_TASKS) - discriminates.
TransitionChange.execute @throws (:196-205) vs throw sites (:213,:231,:239,:255,:383,:391, \_throwPredicateFailures:511,525, hook failures, entity transition inside mutate): complete and accurate.

### core:invalidate-change - Approval guard

Spec: guard evaluated inside the same serialized reconciler mutation, from projection status after the reconciler pre-pass; consent valid-by-projection but stale per fingerprint recovers without force; preview computed with effective policy. Code invalidate-change.ts:~171-195 does exactly this (`consentToRevoke(ctx.change)` inside `_reconcile.mutate`; `forceRecoveries(..., effectivePolicy, ...)`); throwing inside mutate aborts the single `changes.mutate` so "no mutation occurs" holds. Tests: invalidate-change.spec.ts:424 (stale per fingerprint), :447, invalidate-change-ready-audit.spec.ts:243/:299. MATCHES.

## Implementation status

All round-10 spec changes are implemented. No HIGH/MEDIUM correctness gaps found in code vs spec for items (1)-(5) except the debug-logging coverage below.

## Discrepancies

- D1 [MEDIUM] Archive debug logging, "overlap and readOnly guard outcomes - spec IDs checked; overlap entries or readOnly workspaces". The only ArchiveChange log is archive-change.ts:442 `named archive predicates complete` with `overlapCount` + `invalidatedChanges`; no spec IDs checked, no readOnly workspace outcome (spec.overlap / workspace.readOnly checks have no Logger calls).
- D2 [LOW] "pre-archive hooks - start and completion (step, phase, skipped phases)". Logs at :453/:470 carry `change`, `checkId`, boolean `skipped` only; no `step`, `phase`, or skipped-phase list. Also :470 completion log does not report failure/skip.
- D3 [LOW] "tracked artifact selection ... direct vs delta-backed". :830 logs `artifactId`, `filename` but no direct/delta flag (derivable from filename only).
- D4 [LOW] "persisted metadata generation start and completion per spec (or skip reason)". :688-701 logs only for stale specs; `continue` at :685 (no published state) and non-stale specs emit no skip-reason log. Also "metadata generation completed" duplicates "force materialization completed".
- D5 [LOW] "Failure diagnostics: spec ID and artifact basename when failure is spec-scoped" and "each entry MUST use structured fields (change, specId, step, phase)". `publication preflight failed` logs (:535,:557) have `code`/`message` only (no `change`, no `step`, no `specId`/artifact); duplicated message text for prepare-plan vs preflight failure.
  Entries verified present: prepare-plan counts (:527), full-batch preflight completion (:551), deferred transition (:588 change+actor), staged publication start/completion (:605/:630), archive repo call (:657/:663), lifecycle rollback (:1130), partial restore (:1138), recorded failed attempt with step/commitStarted/message (:1164), after-persist start/completion (:709/:738); adapter-owned (archive-batch-snapshot.ts): orphan check, snapshot start/complete, recordCreatedFile, restore start/complete/failed, cleanup.
- D6 [LOW] No test asserts any ArchiveChange debug log entry (only archive-change-batch-restore.spec.ts touches Logger), so D1-D5 cannot be caught by tests.
- D7 [LOW] Spec scenario wording (transition-change verify :984-996): "WHEN it requests `implementing` THEN transitions ... AND requesting `spec-approved` fails" reads sequentially (second request from `implementing`) though the tests (transition-change.spec.ts:640-680) issue each request from the parked state. Reword as two separate requests from the same parked state.
- D8 [LOW] Test title edit-change.spec.ts:190 "seeds newly added specs from persisted dependencies before metadata fallback" still implies a metadata fallback that the spec says does not exist (body is fine, includes a conflicting metadata.json).
- D9 [LOW] transition-change.ts:498-499 `void change; void schema` in `_throwPredicateFailures` - dead parameters left after removing `_mapFailedPredicate`; drop params instead.
- D10 [INFO] EditChange ctor `reconcile` is required by type only; unlike TransitionChange/ArchiveChange (:277, transition-change.ts:178 throw InvalidCompositionFactoryArgumentsError) there is no runtime guard for JS callers. Spec edit-change does not require one; factory-level guard exists via `isEditChangeDeps`.
- D11 [INFO] `ArchiveChange` records the composition-time plain Error (missing ContentHasher) as a failed 'prepare' archive attempt (`_recordArchiveFailure`), polluting history with a programming error; spec only says it is the sole generic Error.
- D12 [INFO] Create-change/edit-change seeding tests are characterization tests: the loader has no metadata fallback in HEAD, so they would not fail against a pre-round-10 code state; they guard against re-introducing the fallback, not a fix. Same for the ArchiveChange error-propagation tests.

## Test discrimination (item 6)

- archive-change-audit.spec.ts: stale-after-hooks test (calls>=2, CheckPredicateFailedError verification.current + start-verification params) fails if predicates were not rerun before the blocked-validity throw; "no predicate fails" test pins InvalidStateTransitionError and not ReconciledOperationBlockedError, state still archivable; no-hasher test pins plain `Error` constructor; delta ArtifactParseError identity test. Discriminating.
- transition-change-audit\*.spec.ts: blockedBy recursion, Change.transition args, committed recovery guidance (design intent / signoff action), parked `next`, missing verdict (VERIFICATION_VALIDITY_UNAVAILABLE), missing reconciler ctor failure. Discriminating.
- edit-change.spec.ts seeding tests (:190,:223,:256,:287): the "no persisted state ignoring metadata.json" test would fail if a metadata fallback existed (returns shared/metadata). Discriminating against a fallback.
- create-change.spec.ts:396 seeds-no-entry-ignoring-metadata: same.
- composition/use-cases/edit-change.spec.ts: asserts every dep including reconcile via identity against resolver getters and that config/deps forms build working use cases; fails if reconcile/resolveChangeSchema missing from deps. Discriminating.
- build-schema.spec.ts:1142 it.each constructor/toString/**proto**: fails with `in VALID_TRANSITIONS` (inherited keys pass), passes with Object.hasOwn. Discriminating.

## Missing tests

- No test that a non-archivable change whose checks would fail schema.nameMatch (or any predicate) reports InvalidStateTransitionError first (state-guard-before-predicates ordering; archive-change.spec.ts:264 and :4661 only cover plain state error / skip-id ordering). Note nameMatch is largely shadowed by ResolveChangeSchema's identity mismatch error thrown earlier.
- No test for stale/revoked (vs absent) spec approval at `ready` committing no recovery (transition-change.spec.ts:521 covers only missing consent).
- No tests for archive debug logging entries.

## Counts

Requirements newly checked in detail: 9 changed items. Discrepancies: HIGH 0, MEDIUM 1 (D1), LOW 8 (D2-D9 incl. D6/D7/D8/D9), INFO 3 (D10-D12). Core tests: 4069/4071 passed, 0 failed.
