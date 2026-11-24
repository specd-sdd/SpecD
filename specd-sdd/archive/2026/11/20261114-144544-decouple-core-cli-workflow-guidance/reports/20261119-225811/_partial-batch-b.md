# Partial batch B (round 13) - archive/transition/edit/create + archive batch snapshot port

Tests run (pnpm --filter @specd/core exec vitest run): archive-batch-snapshot.spec, archive-batch-snapshot-port.spec, all archive-change*, transition-change*, edit-change*, create-change* suites: 14 files, 429 tests passed, 0 failed. `tsc --noEmit` on core: clean.

## 1. Port signature change (restoreBatch/cleanup gain changeName)

Implementations/wrappers/callers (all agree):

- port: core/src/application/ports/archive-batch-snapshot.ts (restoreBatch(specIds, publishOrder, changeName); cleanup(specIds, changeName))
- Fs adapter: core/src/infrastructure/fs/archive-batch-snapshot.ts (restoreBatch ~L170, cleanup ~L215) - uses the changeName arg
- Noop adapter: core/src/application/archive-batch-snapshot-noop.ts - fewer params (valid TS), snapshot already takes changeName
- composition wrapper: core/src/composition/use-cases/archive-change.ts:87-102 threads changeName for restoreBatch/cleanup/detectOrphans/snapshot
- callers: archive-change.ts:1161 (\_handleCommitFailure passes changeName), :703 (cleanup(batchSpecIds, change.name))
- tests/mocks: archive-change.spec.ts:3965 (vi.fn cast), archive-change-batch-restore.spec.ts:433 (class, fewer params), archive-change-audit.spec.ts, composition spec L87 calls with 'change'.
- No implementation/mock in sdk, mcp, cli, plugins, code-graph (grep: only core). packages/guide generated json has no signature text.
- Ordering unchanged: restore iterates reversed publishOrder; per-spec try/catch -> failedSpecIds; cleanup rm best-effort in try/catch, manifests deleted after; logging happens after, Logger.debug delegates to NullLogger/impl (no throw path in-tree).

## Requirements Summary (changed ones)

core:archive-change "Archive debug logging" (delta spec.md.delta.yaml:301-345): new bullets: preflight failure with phase plan|preflight and no hardcoded code; orphan outcome logged in every case incl. corrupt abort; before-persist completion only without fail-fast failure; restore start/per-spec failure/completion, cleanup, created-file logs carry change name.

### Entry-by-entry comparison

- guard outcomes (archive-change.ts:429-439) OK; named-predicates, before-persist start (:464) / completion (:484, after throwHookFailed at :482 so no completion log after fail-fast) OK
- prepare plan (:544) OK; plan failure log phase 'plan' (:552-559) and preflight failure 'preflight' (:578-585) with `...errorCodeField` = error's own string code only, specId via specIdOfError. OK
- orphan: none-found, corrupt-abort (logged before throw), matching-auto-restore, foreign-abort all logged (fs adapter detectOrphans). OK
- snapshot start/completed per spec OK; transitioning-to-archiving OK; tracked artifact selection OK (:874)
- commit: staged start/complete, recorded created file (change: manifest.changeName), archive call, cleanup completed (change: changeName arg) OK
- recovery: commit failure (\_recordArchiveFailure log step/commitStarted/message), restore started/failed/completed with change, rollback log, partial restore log OK
- post-commit: metadata, after-persist effects OK
- guardDetails (:1501): `details === undefined || details === null` guard, peers/specs arrays defaulted, element-type narrowed -> null-safe. Good. (A peers entry that is non-object is dropped.)
- Tests: archive-batch-snapshot.spec.ts L111-215 covers none-found, matching, foreign, corrupt-before-throw, change name in created-file/restore/cleanup/restore-failed logs; archive-change-audit.spec.ts covers plan vs preflight phase/code, before-persist completion after fail-fast (L1096), etc. Spies: both specs have `afterEach(vi.restoreAllMocks)` (audit L60, snapshot spec L15-16); no leak found.

## Implementation Status

- archive-change: implemented, passes. transition-change, edit-change, create-change: suites green (no regression); diffs are the in-scope refactor (transition-change.ts, edit-change.ts changed per change scope).

## Discrepancies

- LOW: No dedicated spec exists for the archive batch snapshot port/adapter (grep specs/: only specs/core/archive-change/spec.md mentions ArchiveBatchSnapshot; no core:archive-batch-snapshot). The port signature (changeName on restoreBatch/cleanup) is therefore specified only indirectly by the log requirement; not in-scope drift, but the contract is undocumented.
- LOW: Spec text (delta L332) says the change name in restore/cleanup/created-file logs is "taken from the batch manifest of the specs involved". Code: restore and cleanup use the explicit `changeName` argument (not the manifest); only recorded-created-file uses manifest.changeName. Behavior satisfies "carry the change name"; wording drifts. Suggest rewording to "the change name passed to the port (or the manifest's)".
- LOW: detectOrphans logs 'none-found' for ANY manifest read failure (e.g. EACCES), and logs nothing when the spec's workspace is unknown (`backupDir === null` -> continue) (fs/archive-batch-snapshot.ts detectOrphans). "Logged in every case" is true only for resolvable specs with ENOENT-or-readable manifests. Pre-existing semantics, minor misreporting.
- LOW: After 'matching-auto-restore' is logged, `_restoreSpec` failures propagate as raw fs errors (not ArchiveOrphanBackupError) and no failure log; pre-existing.
- INFO: Spec delta dropped the old "archivable guard pass" bullet; code has no such log either (consistent).
- INFO: errorCodeField formatting line (archive-change.ts:1538) exceeds 100 cols; prettier/lint may flag (not run).
- No HIGH/MEDIUM findings.

## Missing tests

- Noop adapter with new argument (trivial); orphan outcome for unknown-workspace spec and unreadable manifest not tested; no test asserting logging cannot make restore/cleanup throw.

## Counts

HIGH 0, MEDIUM 0, LOW 4, INFO 2. Tests: 429/429 pass (14 files).
