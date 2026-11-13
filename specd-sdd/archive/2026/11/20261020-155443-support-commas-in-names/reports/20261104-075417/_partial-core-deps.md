# Partial compliance audit: core deps/persisted-get specs (change support-commas-in-names)

Method: spec-preview (spec+verify) of each spec read; implementation read directly (packages/core/src/application/use-cases/_, composition/use-cases/_, \_shared/apply-depends-on-mutation.ts, domain/services/parse-spec-id.ts); tests under packages/core/test/application/use-cases/. Typecheck/tests were stated as passing; not re-run. Note: graph tooling was not used for this audit (the specs map 1:1 to single use-case files; direct reads were sufficient). Fallback justified by narrow scope.

Global specs check: default:\_global/error-handling-conventions - all new errors are typed SpecdError subclasses (InvalidSpecIdError, InvalidInputError, InvalidSpecLockError, WorkspaceNotFoundError with specId+known-workspaces context). Consistent. No cross-spec conflicts found with core:spec-id-format (parseSpecId is the single validator) or core:spec-lock (lenientDependsOn exists in port, fs repo, parse-spec-lock).

---

## 1. core:update-spec-deps

### Requirements summary

Input contract (whole IDs, never split; clear flag); change lookup; spec in change; exclusivity (set / clear / add+remove); at-least-one-op; set replaces (entries validated, '' rejected); clear removes all via applyDependsOnMutation; spec ID validation via parseSpecId+workspaces before mutation (remove entries lenient, target existence not checked); remove validates existence; add idempotent; remove-before-add; persistence via ChangeRepository.mutate; typed errors; factory via resolveUpdateSpecDepsDeps (changes + workspaces).

### Implementation status

All requirements implemented (update-spec-deps.ts, \_shared/apply-depends-on-mutation.ts, composition/use-cases/update-spec-deps.ts).

- Exclusivity/at-least-one checked up front, before parsing; ids validated/normalized (specId, add, set) before mutate; remove uses tryNormalizeDepId (valid -> qualified, invalid kept literal). Workspaces snapshot taken once (handles one-shot iterables).
- Spec-in-change check happens inside mutate on the fresh Change; ChangeNotFoundError comes from mutate.
- resolveUpdateSpecDepsDeps resolves changes + workspaces.

### Discrepancies

1. LOW (spec-wrong, wording): verify scenarios "Set used together with add/remove" and "No operation specified" say "throws an `Error`"; code throws InvalidInputError (typed, code INVALID_INPUT) which matches the later "Typed errors" requirement and the spec's own "MUST throw a typed error". Spec verify wording is stale; code is right.
2. LOW (spec ambiguity): validation order - InvalidSpecIdError for an invalid `specId` is thrown before ChangeNotFoundError (parse precedes mutate). Spec states no order. Acceptable; consider documenting.
3. LOW (spec-wrong, minor): Requirement "Remove validates existence" says "throw an Error identifying the missing dependency"; code message is `dependency 'x' not found in current deps` (InvalidInputError). Fine; wording only.
4. INFO: Spec "Input contract" scenario omits `clear`, covered by separate scenario. OK.

No code-wrong findings.

### Test coverage (update-spec-deps.spec.ts)

Covered: add qualified, mutate-persistence, remove, set, clear, exclusivity matrix (5 combos, stored deps unchanged), add+remove together, set [''] , add [' '], comma-containing ID rejected as one whole value, malformed, unknown workspace, nonexistent target accepted, bare->qualified, one-invalid-among-valid stores nothing, remove invalid stored value, spec not in change, change not found, no operation, remove missing, add idempotent.

### Missing tests

- Scenario "clear on an already empty list" (succeeds with []) - not explicit.
- Scenario "clear alone satisfies minimum operation" - implicit via clear test only.
- `set: [':', 'ws:']` malformed multi-entry (single malformed case present).
- Remove-before-add ordering with both in one call is only covered by "allows add+remove together" (order of result asserted; ok). Explicit "Remove and add in same call" with overlapping ID not tested.
- Typed error code assertion (`INVALID_INPUT`) not asserted (only class).
- Composition: no test for resolveUpdateSpecDepsDeps / createUpdateSpecDeps(config) resolving `changes` + workspaces (grep found no test referencing the resolve\* helpers under packages/core/test).
- "Same behavior through the SDK" is an SDK-level test, out of scope here.

### Summary counts

Requirements 14 / implemented 14. Discrepancies: 0 high, 0 medium, 3 low (all spec wording), 1 info. Missing tests: ~5 (low).

---

## 2. core:update-persisted-spec-deps

### Requirements summary

Input contract; mutual exclusivity + min operation (typed error "before reading or writing persisted state" per verify); spec ID validation + existing targets (parseSpecId before any I/O, SpecNotFoundError for missing add/set targets, remove normalization/literal match, lenient read for remove/set/clear, strict for add, InvalidSpecLockError naming dependsOn field when entries still invalid after mutation); remove-before-add; read state with originalHash; set/clear create missing state without derivation; non-empty add creates via resolveInitialPersistedDependsOn; remove/empty-add on missing state are no-ops; patch helper; conditional write (expectedRevision); SpecNotFoundError; result contract; factory.

### Implementation status

Largely implemented. Parse-before-I/O, workspace/readOnly checks, target existence, remove normalization, lenient read for repair ops (`isRepairOp`), post-mutation isFullyQualifiedSpecId guard throwing InvalidSpecLockError(`dependsOn.<i>`), expectedRevision = originalHash / null, patch helper, created flag - all present.

### Discrepancies

1. MEDIUM (code-wrong): Mutual-exclusivity and minimum-operation validation is NOT performed up front. It lives only in `applyDependsOnMutation`, which runs after `repo.get` and `readPersistedState`. Consequences:
   a. verify scenario "set combined with add is rejected ... throws a typed validation error before reading or writing persisted state" is violated: the repo is read first (and, for a missing-state spec, getActiveSchema.execute() is invoked) before InvalidInputError. Also target-existence checks on add/set run first, so `set+add` with a nonexistent target yields SpecNotFoundError instead of the exclusivity error.
   b. "No operation provided is rejected" is violated on lock-less specs: with no add/remove/set/clear and `readPersistedState === null`, `_createMissingState` computes `createsState=false` and returns `{dependsOn: [], created: false}` with NO error. The same input against an existing lock throws (via applyDependsOnMutation). Inconsistent behavior; spec says MUST throw typed validation error. Same hole for `remove+add:[]`-type combos is not an issue; but `{ remove }` with `clear` on missing state does throw (clear -> createsState) only after getActiveSchema.
   c. Also `set+remove`/`clear+remove` on missing state: `createsState` true so applyDependsOnMutation throws, but after schema resolution I/O.
   Evidence: update-persisted-spec-deps.ts lines ~108-170 (no pre-check before readPersistedState); apply-depends-on-mutation.ts holds the only guards; update-spec-deps.ts, by contrast, pre-validates. Spec is right (and consistent with core:update-spec-deps); fix: run the three guards at the top of execute (before parseSpecId I/O or at least before any repo access).
2. LOW (spec-wrong, naming): Spec says composition helper resolves `specs` and an `initializePersistedSpecState` collaborator; code resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` (the pieces resolveInitialPersistedDependsOn needs) instead. Pre-existing divergence, outside this change's theme; spec wording should be aligned or code adapted.
3. LOW (spec-wrong): spec "Reading current persisted state" says `readPersistedState(spec)`; code passes `{lenientDependsOn: true}` for repair ops. Allowed by the "Spec ID validation" requirement; the first requirement text could mention the option.
4. LOW (potential gap, spec silent): missing-state path never applies the post-mutation fully-qualified guard, but set/add entries were parsed and normalized so it cannot trigger. No issue.
5. INFO: `remove` entries are not checked against workspaces and a mismatch (e.g. `nope:x`) is just a literal; spec allows ("matched literally, never rejected").

### Test coverage (update-persisted-spec-deps.spec.ts)

Covered: remove no-op on missing state; invalid specId/add entry rejected with no read/write; missing dep target; missing spec; bare ID qualified; remove invalid stored value (lenient); InvalidSpecLockError propagated from readPersistedState; clear; unknown workspace; lenient read + bare remove normalized; remaining invalid after repair -> InvalidSpecLockError; add strict against invalid lock. Additional set-creates-state and conflicting-flags tests exist in get-persisted-spec-deps.spec.ts (describe 'UpdatePersistedSpecDeps' misplaced in that file).

### Missing tests

- Exclusivity/min-op before any I/O (no spy on readPersistedState); the only conflict test (set+add, in the wrong file) uses valid existing targets and does not assert I/O absence. Hence discrepancy 1 is untested; add tests for: no operation on lock-less spec, clear+remove, set+add with I/O spies, set+remove.
- Scenario "Clear and set repair a lock with invalid dependencies" for `set` (clear covered only on valid lock and via lenient path; confirm both).
- Scenario "Invalid lock on strict read ... field other than dependsOn" for a mutation of kind remove/set/clear (only generic propagation tested).
- Remove-before-add with overlapping ID (["core:a","core:b"] -> remove a, add a,c).
- Set/clear against missing state (clear creates with created=true; set does not invoke derivation) - set partially tested, clear not.
- Non-empty add on lock-less spec using resolveInitialPersistedDependsOn + empty-base fallback; empty add no-op.
- Patch carries only dependsOn (other fields carried through), stale expectedRevision -> ArtifactConflictError propagation, readOnly workspace -> ReadOnlyWorkspaceError, originalHash captured as expectedRevision, factory resolver test.

### Summary counts

Requirements 13 / fully implemented 12 / partial 1 (mutual exclusivity ordering + no-op-on-missing-state hole). Discrepancies: 0 high, 1 medium (code-wrong), 3 low (spec wording), 1 info. Missing tests: ~9.

---

## 3. core:get-persisted-spec-deps

### Requirements summary

Input; spec ID validation before repository resolution (InvalidSpecIdError / WorkspaceNotFoundError quoting original; bare -> default; result specId qualified); reads via readPersistedState only; result for initialized (stored order, no dedupe); uninitialized -> [] + initialized:false; unknown spec typed error; factory via resolveGetPersistedSpecDepsDeps (specs map).

### Implementation status

Fully implemented. parseSpecId with `specRepositories.keys()` at top; WorkspaceNotFoundError carries `in spec ID '<original>'` and known list; SpecNotFoundError on missing spec; dependsOn returned unchanged; initialized flag. Factory helper exists (resolveGetPersistedSpecDepsDeps). `specRepositories` field name vs spec's `specs` - naming only.

### Discrepancies

1. LOW (spec-wrong, naming): spec says deps include `specs: ReadonlyMap`; code names it `specRepositories`. Wording only.
2. INFO: WorkspaceNotFoundError after parseSpecId is unreachable (parseSpecId already checks); defensive only.

### Test coverage

Covered: uninitialized; invalid specId ('' and 'Core/Foo') with get/readPersistedState spies not called; bare resolves default; unknown workspace; qualified accepted; spec-lock read order exists in other tests.

### Missing tests

- 'Bad Id' quoted in error message; message quoting full original value for WorkspaceNotFoundError.
- Stored order preserved with duplicates; no-materialize/no-direct-lock-read scenario; unknown spec -> SpecNotFoundError (not an empty result); factory resolve test; "specId is required" scenario (type-level).

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low, 1 info. Missing tests: ~5 (low).

---

## 4. core:get-persisted-spec-implementation

### Requirements summary

Same pattern: spec ID validation first; read via readPersistedState; implementation links returned unchanged (file-level vs symbol-level); uninitialized -> [] + initialized false; unknown spec typed error; factory.

### Implementation status

Fully implemented (get-persisted-spec-implementation.ts); same parse/lookup structure as spec 3. Result returns persisted?.implementation ?? [] unchanged.

### Discrepancies

1. LOW (spec-wrong, naming) factory deps naming as in spec 3 (not verified in detail for the implementation factory).
   No code-wrong findings.

### Test coverage

Covered: uninitialized; invalid specId rejected before repository call; bare resolves default; unknown workspace; qualified accepted.

### Missing tests

- 'Bad Id' quoting; unknown spec -> SpecNotFoundError; file-level vs symbol-level links passed through unchanged; no metadata/lock direct read; factory resolver test.

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low. Missing tests: ~4.

---

## 5. core:get-persisted-spec-optimizations

### Requirements summary

Input (specId + optional field filter); spec ID validation; reads via readPersistedState; uninitialized -> initialized:false/fresh:false; initialized without optimizations -> empty result; per-field freshness (added/removed artifact, hash changes, lastModified diagnostic only, schema change); field result shape; aggregate freshness; unknown spec error; factory.

### Implementation status

Implemented. Validation block identical to spec 3 and precedes repository access. Freshness logic unchanged by this change (classifyOptimizationFieldFreshness); aggregate fresh = included fields non-empty and all fresh; filtered field absent -> `missing`.

### Discrepancies

1. LOW (code/spec nuance): spec scenario "Initialized spec with no optimizations block returns empty result" - code returns `{initialized:true, fresh:false}` with no field keys; matches. Note code throws a generic `Error('schema resolution failed')` when schema raw (not typed) - violates spirit of default:\_global/error-handling-conventions (code-wrong, LOW, pre-existing, same in update-persisted-spec-deps `_createMissingState`). Out of change theme.
2. LOW (spec-wrong, naming) factory deps naming.

### Test coverage

Covered: uninitialized; missing field when filtered field absent; initialized with no fields -> fresh false; invalid specId before repository call; bare default; unknown workspace.

### Missing tests

- Freshness scenarios (artifact added/removed, hash change, lastModified-only, schema change); stale/fresh field shape and reasons; aggregate fresh with all fields/with filter; field filter restricts; unknown spec -> SpecNotFoundError; qualified accepted; 'Bad Id' quoting; factory resolver test. (Most pre-date this change; only validation scenarios are in this change's scope.)

### Summary counts

Requirements 10 / implemented 10. Discrepancies: 0 high, 0 medium, 2 low. Missing tests: ~9 (mostly pre-existing, 3 in scope).

---

## 6. core:get-persisted-spec-schema

### Requirements summary

Input; spec ID validation; read via readPersistedState; uninitialized -> SpecNotInitializedError; result returns exact persisted schema identity; unknown spec -> SpecNotFoundError before initialization check; factory.

### Implementation status

Fully implemented; order: parse -> repo -> spec lookup (SpecNotFoundError) -> persisted read -> SpecNotInitializedError.

### Discrepancies

1. LOW (spec-wrong, naming) factory deps naming.
   No code-wrong findings.

### Test coverage

Covered: SpecNotInitializedError when no lock; invalid specId before repository call; bare resolves before throwing SpecNotInitializedError; unknown workspace; qualified accepted with lock.

### Missing tests

- Unknown spec -> SpecNotFoundError before initialization check; 'Bad Id' quoting; no-direct-lock/metadata read; factory resolver test.

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low. Missing tests: ~4.

---

## Overall summary (6 specs)

- High: 0. Medium: 1 (code-wrong). Low: ~10 (mostly spec wording/naming). Missing tests: ~36, most low priority.
- Top finding (MEDIUM, code-wrong): UpdatePersistedSpecDeps does not pre-validate operation exclusivity / minimum operation. Guards live only in applyDependsOnMutation after repo reads; with no operation against a lock-less spec the use case silently returns `{dependsOn: [], created: false}` instead of throwing a typed validation error; and verify scenario "rejected before reading or writing persisted state" is not satisfied. Fix: replicate update-spec-deps' up-front guards (or extract a shared `assertDependsOnOperation(input)`), add tests with readPersistedState spies. Suggested fix location: packages/core/src/application/use-cases/update-persisted-spec-deps.ts execute() top.
- Theme checks pass: no comma splitting (all lists are readonly string[], never joined; comma-ID test exists in update-spec-deps), parseSpecId truly validates (empty/blank/malformed -> InvalidSpecIdError, bare -> default:), clear implemented in both draft and persisted updaters via shared helper, lenient read repair path for invalid spec-lock dependsOn with InvalidSpecLockError naming `dependsOn.<i>`.
- Coverage gaps worth closing in scope: persisted-deps exclusivity/min-op/ordering tests, clear/set against missing state, repair scenarios for `set`, 'Bad Id'/original-value quoting in get-\* tests, factory resolver tests (no test references resolveUpdateSpecDepsDeps/resolveGetPersistedSpecDepsDeps).
